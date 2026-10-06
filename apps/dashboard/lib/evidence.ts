import type { Snapshot } from "./types";

export type EvidenceRow = {
  control: string;
  controlTitle: string;
  agent: string;
  agentRegistryId: string;
  pass: boolean;
  evidenceHash: string;
  txHash: string;
  chain: string;
  ts: number;
  tsIso: string;
  soc2: string[];
  iso42001: string[];
  /** "fixture" rows carry synthetic hashes and must not be used as evidence */
  dataMode: Snapshot["mode"];
  /** agent-level score from latest registry results; null = nothing tested */
  safetyScore: number | null;
  /** "passed/tested" behind safetyScore */
  safetyBasis: string;
};

export function evidenceRows(snap: Snapshot, opts: { agent?: string; latestOnly?: boolean } = {}): EvidenceRow[] {
  const controls = new Map(snap.controls.map(c => [c.id, c]));
  const agents = new Map(snap.agents.map(a => [a.slug, a]));
  const source = opts.latestOnly
    ? snap.agents.flatMap(a => Object.values(a.latest).filter(r => r !== undefined))
    : snap.results;
  return source
    .filter(r => !opts.agent || r.agentSlug === opts.agent)
    .map(r => {
      const c = controls.get(r.controlId);
      return {
        control: r.controlId,
        controlTitle: c?.title ?? "",
        agent: r.agentSlug,
        agentRegistryId: agents.get(r.agentSlug)?.registryId ?? "",
        pass: r.pass,
        evidenceHash: r.evidenceHash,
        txHash: r.txHash,
        chain: r.chain,
        ts: r.ts,
        tsIso: new Date(r.ts * 1000).toISOString(),
        soc2: c?.soc2 ?? [],
        iso42001: c?.iso42001 ?? [],
        dataMode: snap.mode,
        safetyScore: agents.get(r.agentSlug)?.safety.score ?? null,
        safetyBasis: (s => (s ? `${s.passed}/${s.tested}` : ""))(agents.get(r.agentSlug)?.safety),
      };
    })
    .sort((a, b) => b.ts - a.ts || a.agent.localeCompare(b.agent) || a.control.localeCompare(b.control));
}

const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function toCsv(rows: EvidenceRow[]): string {
  const header = ["control", "control_title", "agent", "agent_registry_id", "pass", "evidence_hash", "tx_hash", "chain", "ts", "ts_iso", "soc2_tsc", "iso_42001", "data_mode", "safety_score", "safety_basis"];
  const lines = rows.map(r =>
    [r.control, r.controlTitle, r.agent, r.agentRegistryId, String(r.pass), r.evidenceHash, r.txHash, r.chain, String(r.ts), r.tsIso, r.soc2.join(" "), r.iso42001.join(" "), r.dataMode, r.safetyScore === null ? "" : String(r.safetyScore), r.safetyBasis]
      .map(cell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n") + "\n";
}
