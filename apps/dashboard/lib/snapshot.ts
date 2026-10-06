import "server-only";
import { registryAddress } from "./env";
import { AGENTS } from "./agents";
import { loadCatalog } from "./catalog";
import { fixtureData } from "./fixture";
import { liveData } from "./live";
import { safetyScore } from "./score";
import type { AgentView, ControlResult, Snapshot } from "./types";

export function dataMode(): "fixture" | "live" {
  const m = process.env.DATA_MODE;
  if (m === "fixture" || m === "live") return m;
  return registryAddress() ? "live" : "fixture";
}

function buildAgents(results: ControlResult[], frozen: Record<string, boolean>): AgentView[] {
  return AGENTS.map(agent => {
    const latest: Record<string, ControlResult> = {};
    for (const r of results) {
      if (r.agentSlug !== agent.slug) continue;
      const prev = latest[r.controlId];
      if (!prev || r.ts >= prev.ts) latest[r.controlId] = r;
    }
    const all = Object.values(latest);
    const failing = all.filter(r => !r.pass).map(r => r.controlId);
    const isFrozen = Boolean(frozen[agent.slug]);
    return {
      ...agent,
      latest,
      failing,
      frozen: isFrozen,
      safety: safetyScore(latest),
      lastRun: all.length ? Math.max(...all.map(r => r.ts)) : null,
      // Mirrors AttestationRegistry.isCompliant: needs at least one result and zero failing.
      status: isFrozen ? "frozen" : !all.length ? "unknown" : failing.length ? "failing" : "compliant",
    };
  });
}

export async function getSnapshot(): Promise<Snapshot> {
  const { controls, source, version } = loadCatalog();
  const mode = dataMode();
  const data =
    mode === "fixture"
      ? { ...fixtureData(controls), errors: [] as string[], notes: ["Fixture data. Hashes and tx links are synthetic."], since: null }
      : await liveData(controls);

  return {
    mode,
    generatedAt: Math.floor(Date.now() / 1000),
    since: data.since,
    catalogSource: source,
    catalogVersion: version,
    notes: data.notes,
    errors: data.errors,
    controls,
    agents: buildAgents(data.results, data.frozen),
    results: [...data.results].sort((a, b) => b.ts - a.ts),
    events: [...data.events].sort((a, b) => b.ts - a.ts),
  };
}
