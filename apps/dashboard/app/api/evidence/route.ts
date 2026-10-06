import { registryAddress } from "@/lib/env";
import { evidenceRows, toCsv } from "@/lib/evidence";
import { SCORE_DEFINITION } from "@/lib/score";
import { getSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  const agent = url.searchParams.get("agent") || undefined;
  const latestOnly = url.searchParams.get("scope") === "latest";
  const snap = await getSnapshot();
  const rows = evidenceRows(snap, { agent, latestOnly });
  const stamp = new Date(snap.generatedAt * 1000).toISOString().replace(/[:.]/g, "-");
  const name = `attesta-evidence-${agent ?? "all"}-${latestOnly ? "latest" : "history"}-${stamp}.${format}`;
  const headers = {
    "cache-control": "no-store",
    "content-disposition": `attachment; filename="${name}"`,
  };

  if (format === "csv") {
    return new Response(toCsv(rows), { headers: { ...headers, "content-type": "text/csv; charset=utf-8" } });
  }
  const pack = {
    generatedAt: new Date(snap.generatedAt * 1000).toISOString(),
    dataMode: snap.mode,
    registry: { chain: "sepolia", address: registryAddress() ?? null },
    catalogSource: snap.catalogSource,
    notes: snap.notes,
    errors: snap.errors,
    scope: { agent: agent ?? "all", results: latestOnly ? "latest per control" : "full history" },
    agents: snap.agents.map(a => ({
      slug: a.slug,
      name: a.name,
      registryId: a.registryId,
      chain: a.chain,
      status: a.status,
      frozen: a.frozen,
      failing: a.failing,
      safetyScore: { score: a.safety.score, passed: a.safety.passed, tested: a.safety.tested, basisTxs: a.safety.basis.map(b => ({ control: b.controlId, pass: b.pass, txHash: b.txHash })) },
    })),
    safetyScoreDefinition: SCORE_DEFINITION,
    controls: snap.controls,
    results: rows,
  };
  return new Response(JSON.stringify(pack, null, 2), { headers: { ...headers, "content-type": "application/json" } });
}
