/**
 * Relayer: Sepolia AttestationRegistry -> Solana attesta_guard.
 *
 * Polls ControlResult logs. For an agent mapped to a Solana guard policy:
 *   pass=false -> set_frozen(true)
 *   pass=true and AUTO_UNFREEZE=1 and registry.failingCount(agent)==0 -> set_frozen(false)
 *
 * Idempotent: a log is handled once (cursor + seen set in the state file), and
 * the guard is only written when its on-chain `frozen` differs from the target.
 * Every action prints one JSON line with the Sepolia tx hash and Solana sig.
 *
 * Env (see .env.example):
 *   SEPOLIA_RPC_URL, ATTESTA_REGISTRY_ADDRESS        source chain
 *   SOLANA_RPC_URL                                    default devnet
 *   SOLANA_AGENTS="agentId=solanaAgentPubkey,..."    which agents live on Solana
 *   SOLANA_AUTHORITY_KEYPAIR                          guard authority (signs set_frozen)
 *   SOLANA_PAYER_KEYPAIR                              fee payer (default: authority)
 *   RELAYER_FROM_BLOCK, RELAYER_POLL_MS, AUTO_UNFREEZE, RELAYER_STATE_FILE, RELAYER_ONCE
 */
import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  createPublicClient,
  http,
  keccak256,
  parseAbi,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { fetchPolicy, guardProgram, loadKeypair, setFrozen } from "./guard.ts";

export const registryAbi = parseAbi([
  "event ControlResult(bytes32 indexed controlId, bytes32 indexed agentId, bool pass, bytes32 evidenceHash, uint64 ts)",
  "function failingCount(bytes32 agentId) view returns (uint256)",
]);

const CONTROL_RESULT = registryAbi[0];

type State = { nextBlock: string; seen: string[] };

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") throw new Error(`missing env ${name}`);
  return v;
}

/** "attesta-demo-agent-2=Pubkey,..." -> keccak256(agentId) => { agentId, pubkey } */
export function parseAgents(spec: string): Map<Hex, { agentId: string; pubkey: PublicKey }> {
  const map = new Map<Hex, { agentId: string; pubkey: PublicKey }>();
  for (const pair of spec.split(",").map(s => s.trim()).filter(Boolean)) {
    const [agentId, pk] = pair.split("=");
    map.set(keccak256(toHex(agentId)), { agentId, pubkey: new PublicKey(pk) });
  }
  return map;
}

/** First 4 bytes of the bytes32 control id, as the u32 reason_code on Solana. */
export function reasonCode(controlId: Hex): number {
  return Number.parseInt(controlId.slice(2, 10), 16);
}

function log(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
}

export async function runRelayer() {
  const registry = env("ATTESTA_REGISTRY_ADDRESS") as Address;
  const evm = createPublicClient({ transport: http(env("SEPOLIA_RPC_URL")) });
  const solanaRpc = env("SOLANA_RPC_URL", "https://api.devnet.solana.com");
  const connection = new Connection(solanaRpc, "confirmed");
  const authority = loadKeypair(env("SOLANA_AUTHORITY_KEYPAIR", "~/.attesta-secrets/solana-authority.json"));
  const payer = process.env.SOLANA_PAYER_KEYPAIR ? loadKeypair(process.env.SOLANA_PAYER_KEYPAIR) : authority;
  const program = guardProgram(connection, payer);
  const agents = parseAgents(env("SOLANA_AGENTS"));
  const autoUnfreeze = process.env.AUTO_UNFREEZE === "1";
  const pollMs = Number(process.env.RELAYER_POLL_MS ?? 12_000);
  const stateFile = process.env.RELAYER_STATE_FILE ?? ".relayer-state.json";
  const explorerTx = process.env.EVM_EXPLORER_TX ?? "https://sepolia.etherscan.io/tx/";
  const solCluster = solanaRpc.includes("devnet") ? "devnet" : `custom&customUrl=${encodeURIComponent(solanaRpc)}`;

  const state: State = existsSync(stateFile)
    ? JSON.parse(readFileSync(stateFile, "utf8"))
    : { nextBlock: process.env.RELAYER_FROM_BLOCK ?? (await evm.getBlockNumber()).toString(), seen: [] };
  const seen = new Set(state.seen);
  const save = () => writeFileSync(stateFile, JSON.stringify({ nextBlock: state.nextBlock, seen: [...seen].slice(-2000) }));

  log("start", {
    registry,
    solanaRpc,
    authority: authority.publicKey.toBase58(),
    agents: [...agents.values()].map(a => `${a.agentId}=${a.pubkey.toBase58()}`),
    fromBlock: state.nextBlock,
    autoUnfreeze,
  });

  const drive = async (agent: { agentId: string; pubkey: PublicKey }, frozen: boolean, controlId: Hex, src: string) => {
    const policy = await fetchPolicy(program, agent.pubkey);
    if (!policy) return log("skip_no_policy", { agentId: agent.agentId, sourceTx: src });
    if (policy.frozen === frozen) return log("noop_already", { agentId: agent.agentId, frozen, sourceTx: src });
    const sig = await setFrozen(
      program,
      authority,
      agent.pubkey,
      frozen,
      reasonCode(controlId),
      `attesta:${frozen ? "freeze" : "unfreeze"}:${agent.agentId}:${controlId}:sepolia:${src}`,
    );
    log(frozen ? "frozen" : "unfrozen", {
      agentId: agent.agentId,
      solanaAgent: agent.pubkey.toBase58(),
      controlId,
      sourceTx: src,
      sourceTxUrl: explorerTx + src,
      solanaSig: sig,
      solanaSigUrl: `https://explorer.solana.com/tx/${sig}?cluster=${solCluster}`,
    });
  };

  for (;;) {
    try {
      const head = await evm.getBlockNumber();
      let from = BigInt(state.nextBlock);
      while (from <= head) {
        // Public Sepolia RPCs cap eth_getLogs ranges; stay well under.
        const to = from + 499n < head ? from + 499n : head;
        const logs = await evm.getLogs({ address: registry, event: CONTROL_RESULT, fromBlock: from, toBlock: to });
        for (const l of logs) {
          const key = `${l.transactionHash}:${l.logIndex}`;
          if (seen.has(key)) continue;
          const { agentId, controlId, pass } = l.args as { agentId: Hex; controlId: Hex; pass: boolean };
          const agent = agents.get(agentId);
          if (agent) {
            if (!pass) {
              await drive(agent, true, controlId, l.transactionHash!);
            } else if (autoUnfreeze) {
              const failing = await evm.readContract({
                address: registry,
                abi: registryAbi,
                functionName: "failingCount",
                args: [agentId],
              });
              if (failing === 0n) await drive(agent, false, controlId, l.transactionHash!);
            }
          }
          seen.add(key);
          save();
        }
        from = to + 1n;
        state.nextBlock = from.toString();
        save();
      }
    } catch (e) {
      // Solana or RPC hiccup: the cursor did not move past the failing log, so it retries next tick.
      log("error", { message: (e as Error).message });
    }
    if (process.env.RELAYER_ONCE === "1") return;
    await new Promise(r => setTimeout(r, pollMs));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runRelayer().catch(e => {
    console.error(e);
    process.exit(1);
  });
}
