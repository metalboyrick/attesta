/**
 * Relayer core, chain-agnostic so it can be unit-tested with fakes.
 *
 * One tick:
 *   1. Retry logs that failed earlier (pending). After `maxAttempts` a log is
 *      parked in `dead` and logged as dead_letter, so it cannot block others.
 *   2. Scan ControlResult logs from the cursor up to head - confirmations.
 *      Each log is handled in its own try/catch; a failure goes to pending and
 *      the cursor still moves on.
 *   3. Reconcile (level trigger): for each mapped agent, if the registry says
 *      failingCount > 0 and the guard policy is not frozen, freeze it. This
 *      covers FAILs missed while the relayer was down or dead-lettered.
 *
 * Unfreeze only happens with autoUnfreeze (off by default, ATT-FRZ-05).
 */
import type { PublicKey } from "@solana/web3.js";
import type { Hex } from "viem";

export type ResultLog = {
  key: string; // txHash:logIndex
  txHash: Hex;
  blockNumber: bigint;
  agentId: Hex;
  controlId: Hex;
  pass: boolean;
};

export type Agent = { agentId: string; pubkey: PublicKey };

export type Config = {
  registry: string;
  agents: Map<Hex, Agent>;
  autoUnfreeze: boolean;
  confirmations: bigint;
  maxAttempts: number;
  chunk: bigint;
  /** Level-trigger freeze from failingCount. Default on. */
  reconcile?: boolean;
};

export type Deps = {
  head(): Promise<bigint>;
  logs(from: bigint, to: bigint): Promise<ResultLog[]>;
  failingCount(agentId: Hex): Promise<bigint>;
  /** null when the agent has no policy on Solana. */
  frozen(agent: PublicKey): Promise<boolean | null>;
  setFrozen(agent: PublicKey, frozen: boolean, reasonCode: number, memo: string): Promise<string>;
  log(event: string, fields: Record<string, unknown>): void;
};

type StoredLog = Omit<ResultLog, "blockNumber"> & { blockNumber: string };

export type State = {
  registry: string;
  nextBlock: string;
  seen: string[];
  pending: Record<string, { log: StoredLog; attempts: number; lastError: string }>;
  dead: { log: StoredLog; lastError: string }[];
};

/**
 * Resume from saved state if it belongs to this registry; otherwise start at
 * the registry deploy block. Never defaults to head: that would skip FAILs.
 */
export function initState(saved: State | null, registry: string, deployBlock: string | undefined): State {
  if (saved && saved.registry?.toLowerCase() === registry.toLowerCase()) {
    return { ...saved, pending: saved.pending ?? {}, dead: saved.dead ?? [] };
  }
  if (!deployBlock) {
    throw new Error("no saved state for this registry: set REGISTRY_DEPLOY_BLOCK (or RELAYER_FROM_BLOCK) to the registry deploy block");
  }
  return { registry, nextBlock: BigInt(deployBlock).toString(), seen: [], pending: {}, dead: [] };
}

/** First 4 bytes of the bytes32 control id, as the u32 reason_code on Solana. */
export function reasonCode(controlId: Hex): number {
  return Number.parseInt(controlId.slice(2, 10), 16);
}

const store = (l: ResultLog): StoredLog => ({ ...l, blockNumber: l.blockNumber.toString() });
const load = (l: StoredLog): ResultLog => ({ ...l, blockNumber: BigInt(l.blockNumber) });

export async function tick(cfg: Config, deps: Deps, state: State): Promise<void> {
  const seen = new Set(state.seen);

  const drive = async (agent: Agent, frozen: boolean, reason: number, memo: string, fields: Record<string, unknown>) => {
    const current = await deps.frozen(agent.pubkey);
    if (current === null) return deps.log("skip_no_policy", { agentId: agent.agentId, ...fields });
    if (current === frozen) return deps.log("noop_already", { agentId: agent.agentId, frozen, ...fields });
    const sig = await deps.setFrozen(agent.pubkey, frozen, reason, memo);
    deps.log(frozen ? "frozen" : "unfrozen", {
      agentId: agent.agentId,
      solanaAgent: agent.pubkey.toBase58(),
      solanaSig: sig,
      ...fields,
    });
  };

  const handle = async (l: ResultLog) => {
    const agent = cfg.agents.get(l.agentId);
    if (!agent) return;
    const fields = { controlId: l.controlId, sourceTx: l.txHash, sourceBlock: l.blockNumber.toString() };
    if (!l.pass) {
      await drive(agent, true, reasonCode(l.controlId), `attesta:freeze:${agent.agentId}:${l.controlId}:sepolia:${l.txHash}`, fields);
    } else if (cfg.autoUnfreeze && (await deps.failingCount(l.agentId)) === 0n) {
      await drive(agent, false, reasonCode(l.controlId), `attesta:unfreeze:${agent.agentId}:${l.controlId}:sepolia:${l.txHash}`, fields);
    }
  };

  const failed = (l: ResultLog, prevAttempts: number, e: unknown) => {
    const attempts = prevAttempts + 1;
    const lastError = (e as Error)?.message ?? String(e);
    if (attempts >= cfg.maxAttempts) {
      delete state.pending[l.key];
      state.dead.push({ log: store(l), lastError });
      deps.log("dead_letter", { key: l.key, agentId: l.agentId, sourceTx: l.txHash, attempts, lastError });
    } else {
      state.pending[l.key] = { log: store(l), attempts, lastError };
      deps.log("error", { key: l.key, sourceTx: l.txHash, attempts, lastError });
    }
  };

  // 1. retry pending
  for (const [key, p] of Object.entries(state.pending)) {
    try {
      await handle(load(p.log));
      delete state.pending[key];
    } catch (e) {
      failed(load(p.log), p.attempts, e);
    }
  }

  // 2. scan confirmed range
  const head = await deps.head();
  const safe = head - cfg.confirmations;
  let from = BigInt(state.nextBlock);
  while (from <= safe) {
    const to = from + cfg.chunk - 1n < safe ? from + cfg.chunk - 1n : safe;
    const logs = await deps.logs(from, to); // RPC failure: cursor stays, whole tick retries later
    for (const l of logs) {
      if (seen.has(l.key)) continue;
      try {
        await handle(l);
      } catch (e) {
        failed(l, 0, e);
      }
      seen.add(l.key);
    }
    from = to + 1n;
    state.nextBlock = from.toString();
  }
  state.seen = [...seen].slice(-2000);

  // 3. reconcile
  if (cfg.reconcile === false) return;
  for (const [hash, agent] of cfg.agents) {
    try {
      const failing = await deps.failingCount(hash);
      if (failing > 0n) {
        await drive(agent, true, 0, `attesta:reconcile:${agent.agentId}:failingCount=${failing}`, {
          reconcile: true,
          failingCount: failing.toString(),
        });
      }
    } catch (e) {
      deps.log("error", { reconcile: agent.agentId, lastError: (e as Error)?.message ?? String(e) });
    }
  }
}
