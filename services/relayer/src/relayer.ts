/**
 * Relayer: Sepolia AttestationRegistry -> Solana attesta_guard.
 *
 * For an agent mapped to a Solana guard policy:
 *   ControlResult pass=false                      -> set_frozen(true)
 *   registry has a failing result, not frozen      -> set_frozen(true)  (reconcile, every tick)
 *   ...but never on a result older than the policy's last unfreeze (a person's unfreeze wins)
 *   pass=true, AUTO_UNFREEZE=1, failingCount == 0 -> set_frozen(false)
 *
 * AUTO_UNFREEZE defaults to off: ATT-FRZ-05 requires a person to unfreeze
 * (`pnpm unfreeze` in programs/solana). Set it to 1 only in local tests.
 *
 * Tick logic lives in core.ts (unit-tested). This file wires it to viem and
 * the guard program, and persists state. State is tied to the registry
 * address: a new address starts again from REGISTRY_DEPLOY_BLOCK.
 *
 * Env (see .env.example):
 *   SEPOLIA_RPC_URL, ATTESTA_REGISTRY_ADDRESS        source chain (address is env-only)
 *   REGISTRY_DEPLOY_BLOCK (alias RELAYER_FROM_BLOCK)  where to backfill from with no saved state
 *   SOLANA_RPC_URL                                    default devnet
 *   SOLANA_AGENTS="agentId=solanaAgentPubkey,..."    which agents live on Solana
 *   SOLANA_AUTHORITY_KEYPAIR                          guard authority (signs set_frozen)
 *   SOLANA_PAYER_KEYPAIR                              fee payer (default: authority)
 *   RELAYER_CONFIRMATIONS (2), RELAYER_MAX_ATTEMPTS (5), RELAYER_POLL_MS, AUTO_UNFREEZE,
 *   RELAYER_STATE_FILE, RELAYER_ONCE
 */
import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Connection, PublicKey } from "@solana/web3.js";
import { createPublicClient, http, isAddress, keccak256, parseAbi, toHex, type Address, type Hex } from "viem";
import { initState, tick, type Agent, type Config, type Deps, type State } from "./core.ts";
import { fetchPolicy, guardProgram, lastUnfreezeTs, loadKeypair, setFrozen } from "./guard.ts";

export { reasonCode } from "./core.ts";

export const registryAbi = parseAbi([
  "event ControlResult(bytes32 indexed controlId, bytes32 indexed agentId, bool pass, bytes32 evidenceHash, uint64 ts)",
  "function failingCount(bytes32 agentId) view returns (uint256)",
  "function getControls(bytes32 agentId) view returns (bytes32[])",
  "struct Result { bool pass; bytes32 evidenceHash; uint64 ts; }",
  "function getResult(bytes32 agentId, bytes32 controlId) view returns (Result)",
]);

const CONTROL_RESULT = registryAbi[0];

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") throw new Error(`missing env ${name}`);
  return v;
}

/** "attesta-demo-agent-2=Pubkey,..." -> keccak256(agentId) => { agentId, pubkey } */
export function parseAgents(spec: string): Map<Hex, Agent> {
  const map = new Map<Hex, Agent>();
  for (const pair of spec.split(",").map(s => s.trim()).filter(Boolean)) {
    const [agentId, pk] = pair.split("=");
    map.set(keccak256(toHex(agentId)), { agentId, pubkey: new PublicKey(pk) });
  }
  return map;
}

function log(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
}

export async function runRelayer() {
  const registry = env("ATTESTA_REGISTRY_ADDRESS");
  if (!isAddress(registry)) throw new Error(`ATTESTA_REGISTRY_ADDRESS is not an address: ${registry}`);
  const evm = createPublicClient({ transport: http(env("SEPOLIA_RPC_URL")) });
  const solanaRpc = env("SOLANA_RPC_URL", "https://api.devnet.solana.com");
  const connection = new Connection(solanaRpc, "confirmed");
  const authority = loadKeypair(env("SOLANA_AUTHORITY_KEYPAIR", "~/.attesta-secrets/solana-authority.json"));
  const payer = process.env.SOLANA_PAYER_KEYPAIR ? loadKeypair(process.env.SOLANA_PAYER_KEYPAIR) : authority;
  const program = guardProgram(connection, payer);
  const pollMs = Number(process.env.RELAYER_POLL_MS ?? 12_000);
  const stateFile = process.env.RELAYER_STATE_FILE ?? ".relayer-state.json";
  const explorerTx = process.env.EVM_EXPLORER_TX ?? "https://sepolia.etherscan.io/tx/";
  const solCluster = solanaRpc.includes("devnet") ? "devnet" : `custom&customUrl=${encodeURIComponent(solanaRpc)}`;

  const cfg: Config = {
    registry,
    agents: parseAgents(env("SOLANA_AGENTS")),
    autoUnfreeze: process.env.AUTO_UNFREEZE === "1",
    confirmations: BigInt(process.env.RELAYER_CONFIRMATIONS ?? 2),
    maxAttempts: Number(process.env.RELAYER_MAX_ATTEMPTS ?? 5),
    // Public Sepolia RPCs cap eth_getLogs ranges; stay well under.
    chunk: 500n,
  };

  const saved = existsSync(stateFile) ? (JSON.parse(readFileSync(stateFile, "utf8")) as State) : null;
  const state = initState(saved, registry, process.env.REGISTRY_DEPLOY_BLOCK || process.env.RELAYER_FROM_BLOCK);
  const save = () => writeFileSync(stateFile, JSON.stringify(state));

  const deps: Deps = {
    head: () => evm.getBlockNumber(),
    logs: async (fromBlock, toBlock) => {
      const logs = await evm.getLogs({ address: registry as Address, event: CONTROL_RESULT, fromBlock, toBlock });
      return logs.map(l => ({
        key: `${l.transactionHash}:${l.logIndex}`,
        txHash: l.transactionHash!,
        blockNumber: l.blockNumber!,
        agentId: l.args.agentId!,
        controlId: l.args.controlId!,
        pass: l.args.pass!,
        ts: l.args.ts!,
      }));
    },
    failingCount: agentId =>
      evm.readContract({ address: registry as Address, abi: registryAbi, functionName: "failingCount", args: [agentId] }),
    failingResults: async agentId => {
      const reg = { address: registry as Address, abi: registryAbi } as const;
      const controls = await evm.readContract({ ...reg, functionName: "getControls", args: [agentId] });
      const out: { controlId: Hex; ts: bigint }[] = [];
      for (const controlId of controls) {
        const r = await evm.readContract({ ...reg, functionName: "getResult", args: [agentId, controlId] });
        if (!r.pass) out.push({ controlId, ts: r.ts });
      }
      return out;
    },
    lastUnfreezeTs: agent => lastUnfreezeTs(connection, agent),
    frozen: async agent => (await fetchPolicy(program, agent))?.frozen ?? null,
    setFrozen: (agent, frozen, reason, memo) => setFrozen(program, authority, agent, frozen, reason, memo),
    log: (event, fields) => {
      const extra: Record<string, unknown> = {};
      if (typeof fields.sourceTx === "string") extra.sourceTxUrl = explorerTx + fields.sourceTx;
      if (typeof fields.solanaSig === "string")
        extra.solanaSigUrl = `https://explorer.solana.com/tx/${fields.solanaSig}?cluster=${solCluster}`;
      log(event, { ...fields, ...extra });
    },
  };

  log("start", {
    registry,
    solanaRpc,
    authority: authority.publicKey.toBase58(),
    agents: [...cfg.agents.values()].map(a => `${a.agentId}=${a.pubkey.toBase58()}`),
    fromBlock: state.nextBlock,
    pending: Object.keys(state.pending).length,
    dead: state.dead.length,
    confirmations: cfg.confirmations.toString(),
    autoUnfreeze: cfg.autoUnfreeze,
  });

  for (;;) {
    try {
      await tick(cfg, deps, state);
    } catch (e) {
      // RPC failure while scanning: cursor stays at the last finished chunk; retry next tick.
      log("error", { message: (e as Error).message });
    }
    save();
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
