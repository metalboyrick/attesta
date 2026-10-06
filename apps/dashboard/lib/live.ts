import "server-only";
import { registryAddress } from "./env";
import { createHash } from "node:crypto";
import { Connection, PublicKey } from "@solana/web3.js";
import { BaseError, createPublicClient, http, isAddress, keccak256, parseAbi, parseAbiItem, stringToHex, type Address, type Hex, type PublicClient } from "viem";
import { sepolia } from "viem/chains";
import { AGENTS } from "./agents";
import type { ControlDef, ControlResult, TimelineEvent } from "./types";

const controlResultEvent = parseAbiItem(
  "event ControlResult(bytes32 indexed controlId, bytes32 indexed agentId, bool pass, bytes32 evidenceHash, uint64 ts)",
);

const registryAbi = parseAbi([
  "function getControls(bytes32 agentId) view returns (bytes32[])",
  "function getResult(bytes32 agentId, bytes32 controlId) view returns ((bool pass, bytes32 evidenceHash, uint64 ts))",
]);

const id32 = (s: string) => keccak256(stringToHex(s));
function errText(e: unknown): string {
  const msg = e instanceof BaseError ? e.shortMessage : e instanceof Error ? e.message.split("\n")[0] : String(e);
  return /\b429\b|too many requests/i.test(msg) ? "rate limited by the public RPC (429)" : msg;
}
const CHUNK = 9_000n;

async function sepoliaResults(controls: ControlDef[]) {
  const address = registryAddress();
  if (!address || !isAddress(address)) throw new Error("REGISTRY_ADDRESS (or NEXT_PUBLIC_REGISTRY_ADDRESS) is not set");
  const client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"),
  });
  const latest = await client.getBlockNumber();
  const from = process.env.REGISTRY_DEPLOY_BLOCK ? BigInt(process.env.REGISTRY_DEPLOY_BLOCK) : latest - 45_000n;

  const agentByHash = new Map(AGENTS.map(a => [id32(a.registryId), a.slug]));
  const controlByHash = new Map(controls.map(c => [id32(c.id), c.id]));

  try {
    return { results: await logResults(client, address as Address, from, latest, agentByHash, controlByHash), address, fromState: false };
  } catch (e) {
    // Some public RPCs prune old logs. Contract state still has the latest result per control, without tx hashes.
    const results = await stateResults(client, address as Address, controlByHash);
    return { results, address, fromState: true, logError: errText(e) };
  }
}

async function stateResults(client: PublicClient, address: Address, controlByHash: Map<Hex, string>) {
  const results: ControlResult[] = [];
  for (const agent of AGENTS) {
    const key = id32(agent.registryId);
    const ids = await client.readContract({ address, abi: registryAbi, functionName: "getControls", args: [key] });
    const rows = await Promise.all(ids.map(id => client.readContract({ address, abi: registryAbi, functionName: "getResult", args: [key, id] })));
    ids.forEach((id, i) =>
      results.push({
        controlId: controlByHash.get(id) ?? id,
        agentSlug: agent.slug,
        pass: rows[i].pass,
        evidenceHash: rows[i].evidenceHash,
        ts: Number(rows[i].ts),
        txHash: "",
        chain: "sepolia",
      }),
    );
  }
  return results;
}

async function logResults(
  client: PublicClient,
  address: Address,
  from: bigint,
  latest: bigint,
  agentByHash: Map<Hex, string>,
  controlByHash: Map<Hex, string>,
) {
  const results: ControlResult[] = [];
  for (let start = from; start <= latest; start += CHUNK) {
    const end = start + CHUNK - 1n > latest ? latest : start + CHUNK - 1n;
    const logs = await client.getLogs({ address, event: controlResultEvent, fromBlock: start, toBlock: end });
    for (const log of logs) {
      const { controlId, agentId, pass, evidenceHash, ts } = log.args;
      const agentSlug = agentByHash.get(agentId as Hex);
      if (!agentSlug || !log.transactionHash) continue;
      results.push({
        controlId: controlByHash.get(controlId as Hex) ?? (controlId as string),
        agentSlug,
        pass: Boolean(pass),
        evidenceHash: evidenceHash as string,
        ts: Number(ts),
        txHash: log.transactionHash,
        chain: "sepolia",
      });
    }
  }
  return results;
}

// Anchor event = "Program data: " + base64(sha256("event:<Name>")[..8] ++ borsh fields)
const disc = (name: string) => createHash("sha256").update(`event:${name}`).digest().subarray(0, 8);
const FROZEN_CHANGED = disc("FrozenChanged");
// AgentPolicy: 8 discriminator + agent 32 + authority 32 + daily_cap 8 + spent_today 8 + day_index 8, then frozen
const FROZEN_OFFSET = 8 + 32 + 32 + 8 + 8 + 8;

async function solanaGuard() {
  const agent = process.env.SOLANA_AGENT_PUBKEY;
  if (!agent) throw new Error("SOLANA_AGENT_PUBKEY is not set");
  const programId = new PublicKey(process.env.SOLANA_GUARD_PROGRAM_ID || "2ppMVjwBs8dqNppcJctfTJaVb3rtfFFe5cDmJyxCGuSW");
  const conn = new Connection(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed");
  const [policy] = PublicKey.findProgramAddressSync([Buffer.from("policy"), new PublicKey(agent).toBuffer()], programId);

  const info = await conn.getAccountInfo(policy);
  const frozen = info ? info.data[FROZEN_OFFSET] === 1 : false;

  const sigs = await conn.getSignaturesForAddress(policy, { limit: 15 });
  const ok = sigs.filter(s => !s.err).map(s => s.signature);
  // Confirmed txs never change, so each signature is fetched once. Sequential,
  // because public devnet RPC rate-limits batched getTransactions.
  for (const sig of ok) {
    if (solanaTxEvents.has(sig)) continue;
    const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0 });
    if (tx) solanaTxEvents.set(sig, frozenEvents(sig, tx.meta?.logMessages ?? []));
  }
  const events = ok.flatMap(sig => solanaTxEvents.get(sig) ?? []);
  return { frozen, events, policy: policy.toBase58(), missing: !info };
}

// On globalThis: Next bundles pages and route handlers separately, so plain module state is not shared.
const g = globalThis as typeof globalThis & {
  __attestaSolanaTx?: Map<string, TimelineEvent[]>;
  __attestaCache?: Map<string, { at: number; value: unknown; pending?: Promise<unknown> }>;
};
const solanaTxEvents = (g.__attestaSolanaTx ??= new Map<string, TimelineEvent[]>());

function frozenEvents(sig: string, logs: string[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  {
    for (const line of logs) {
      if (!line.startsWith("Program data: ")) continue;
      const data = Buffer.from(line.slice(14), "base64");
      if (data.length < 8 + 32 + 32 + 1 + 4 + 8 || !data.subarray(0, 8).equals(FROZEN_CHANGED)) continue;
      // disc 8 | agent 32 | authority 32 | frozen 1 | reason_code u32 | ts i64
      const isFrozen = data[72] === 1;
      events.push({
        kind: isFrozen ? "freeze" : "unfreeze",
        agentSlug: "solana",
        chain: "solana-devnet",
        txHash: sig,
        reasonCode: data.readUInt32LE(73),
        ts: Number(data.readBigInt64LE(77)),
      });
    }
  }
  return events;
}

async function cardanoPurchases() {
  // Default: the x402 seller address in services/x402-cardano/README.md
  const addr =
    process.env.CARDANO_SELLER_ADDRESS ||
    "addr_test1qztvnhavscfaupuwy824jem5z8dxavkzz6ukg4xyzls3gn2mejfgg4sl7sj4rdxxdnzsqvpkzwu0v39338t9aj6p6q7stjznf6";
  const base = process.env.KOIOS_URL || "https://preprod.koios.rest/api/v1";
  const res = await fetch(`${base}/address_txs`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ _addresses: [addr] }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Koios address_txs ${res.status}`);
  const rows = (await res.json()) as { tx_hash: string; block_time: number }[];
  // Every tx touching the seller address is treated as a paid attestation check.
  return rows.slice(0, 50).map<TimelineEvent>(r => ({
    kind: "purchase",
    chain: "cardano-preprod",
    txHash: r.tx_hash,
    ts: r.block_time,
  }));
}

/**
 * Every viewer polls every 15 s, and public RPCs rate-limit. Each source is hit
 * at most once per TTL; on failure the last good value is served and flagged.
 */
const TTL_MS: Record<string, number> = { sepolia: 20_000, solana: 45_000, cardano: 30_000 };
const cache = (g.__attestaCache ??= new Map());

async function throttled<T>(key: string, fn: () => Promise<T>): Promise<{ value: T; staleSince?: number; error?: string }> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS[key]) return { value: hit.value as T };
  try {
    const pending = (hit?.pending as Promise<T> | undefined) ?? fn();
    if (hit) hit.pending = pending;
    else cache.set(key, { at: 0, value: undefined, pending });
    const value = await pending;
    cache.set(key, { at: Date.now(), value });
    return { value };
  } catch (e) {
    const prev = cache.get(key);
    if (prev) prev.pending = undefined;
    if (prev && prev.at > 0) return { value: prev.value as T, staleSince: prev.at, error: errText(e) };
    throw e;
  }
}

const staleNote = (src: string, r: { staleSince?: number; error?: string }) =>
  r.staleSince ? [`${src}: ${r.error}. Showing data read ${Math.round((Date.now() - r.staleSince) / 1000)} s ago.`] : [];

export async function liveData(controls: ControlDef[]) {
  const errors: string[] = [];
  const notes: string[] = [];
  const [evmR, solR, adaR] = await Promise.allSettled([
    throttled("sepolia", () => sepoliaResults(controls)),
    throttled("solana", solanaGuard),
    throttled("cardano", cardanoPurchases),
  ]);
  const unwrap = <T,>(src: string, r: PromiseSettledResult<{ value: T; staleSince?: number; error?: string }>): PromiseSettledResult<T> => {
    if (r.status === "rejected") return r;
    errors.push(...staleNote(src, r.value));
    return { status: "fulfilled", value: r.value.value };
  };
  const evm = unwrap("Sepolia", evmR);
  const sol = unwrap("Solana", solR);
  const ada = unwrap("Cardano", adaR);

  const results = evm.status === "fulfilled" ? evm.value.results : [];
  if (evm.status === "fulfilled") {
    notes.push(`Registry ${evm.value.address} on Sepolia`);
    if (evm.value.fromState)
      errors.push(`Sepolia logs unavailable (${evm.value.logError}). Showing latest results from contract state, without tx links or history.`);
  } else errors.push(`Sepolia: ${errText(evm.reason)}`);

  const frozen: Record<string, boolean> = {};
  const events: TimelineEvent[] = results.map(r => ({
    kind: "control",
    ts: r.ts,
    agentSlug: r.agentSlug,
    chain: r.chain,
    txHash: r.txHash,
    controlId: r.controlId,
    pass: r.pass,
  }));
  if (sol.status === "fulfilled") {
    frozen.solana = sol.value.frozen;
    events.push(...sol.value.events);
    notes.push(`Guard policy ${sol.value.policy} on Solana devnet`);
    if (sol.value.missing) errors.push(`Solana: policy account ${sol.value.policy} not found on devnet. Is the guard deployed and the agent registered?`);
  } else errors.push(`Solana: ${errText(sol.reason)}`);

  if (ada.status === "fulfilled") events.push(...ada.value);
  else errors.push(`Cardano: ${errText(ada.reason)}`);

  return { results, events, frozen, errors, notes };
}
