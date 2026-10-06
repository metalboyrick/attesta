import "server-only";
import { createHash } from "node:crypto";
import { Connection, PublicKey } from "@solana/web3.js";
import { createPublicClient, http, isAddress, keccak256, parseAbiItem, stringToHex, type Address, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { AGENTS } from "./agents";
import type { ControlDef, ControlResult, TimelineEvent } from "./types";

const controlResultEvent = parseAbiItem(
  "event ControlResult(bytes32 indexed controlId, bytes32 indexed agentId, bool pass, bytes32 evidenceHash, uint64 ts)",
);

const id32 = (s: string) => keccak256(stringToHex(s));
const CHUNK = 9_000n;

async function sepoliaResults(controls: ControlDef[]) {
  const address = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS;
  if (!address || !isAddress(address)) throw new Error("NEXT_PUBLIC_REGISTRY_ADDRESS is not set");
  const client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"),
  });
  const latest = await client.getBlockNumber();
  const from = process.env.REGISTRY_DEPLOY_BLOCK ? BigInt(process.env.REGISTRY_DEPLOY_BLOCK) : latest - 45_000n;

  const agentByHash = new Map(AGENTS.map(a => [id32(a.registryId), a.slug]));
  const controlByHash = new Map(controls.map(c => [id32(c.id), c.id]));

  const results: ControlResult[] = [];
  for (let start = from; start <= latest; start += CHUNK) {
    const end = start + CHUNK - 1n > latest ? latest : start + CHUNK - 1n;
    const logs = await client.getLogs({ address: address as Address, event: controlResultEvent, fromBlock: start, toBlock: end });
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
  return { results, address };
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

  const sigs = await conn.getSignaturesForAddress(policy, { limit: 25 });
  const ok = sigs.filter(s => !s.err).map(s => s.signature);
  const txs = await conn.getTransactions(
    ok,
    { maxSupportedTransactionVersion: 0 },
  );
  const events: TimelineEvent[] = [];
  txs.forEach((tx, i) => {
    for (const line of tx?.meta?.logMessages ?? []) {
      if (!line.startsWith("Program data: ")) continue;
      const data = Buffer.from(line.slice(14), "base64");
      if (data.length < 8 + 32 + 32 + 1 + 4 + 8 || !data.subarray(0, 8).equals(FROZEN_CHANGED)) continue;
      // disc 8 | agent 32 | authority 32 | frozen 1 | reason_code u32 | ts i64
      const isFrozen = data[72] === 1;
      events.push({
        kind: isFrozen ? "freeze" : "unfreeze",
        agentSlug: "solana",
        chain: "solana-devnet",
        txHash: ok[i],
        reasonCode: data.readUInt32LE(73),
        ts: Number(data.readBigInt64LE(77)),
      });
    }
  });
  return { frozen, events, policy: policy.toBase58() };
}

async function cardanoPurchases() {
  const addr = process.env.CARDANO_SELLER_ADDRESS;
  if (!addr) throw new Error("CARDANO_SELLER_ADDRESS is not set");
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

export async function liveData(controls: ControlDef[]) {
  const errors: string[] = [];
  const notes: string[] = [];
  const [evm, sol, ada] = await Promise.allSettled([sepoliaResults(controls), solanaGuard(), cardanoPurchases()]);

  const results = evm.status === "fulfilled" ? evm.value.results : [];
  if (evm.status === "fulfilled") notes.push(`Registry ${evm.value.address} on Sepolia`);
  else errors.push(`Sepolia: ${(evm.reason as Error).message}`);

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
  } else errors.push(`Solana: ${(sol.reason as Error).message}`);

  if (ada.status === "fulfilled") events.push(...ada.value);
  else errors.push(`Cardano: ${(ada.reason as Error).message}`);

  return { results, events, frozen, errors, notes };
}
