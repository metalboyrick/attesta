import Link from "next/link";
import { CopyHash } from "@/components/client";
import { ControlsTable } from "@/components/controls-table";
import { LookupForm } from "@/components/lookup-form";
import { SafetyScoreBadge } from "@/components/score";
import { AGENTS } from "@/lib/agents";
import { loadCatalog } from "@/lib/catalog";
import { verifyConfig } from "@/lib/env";
import { errText } from "@/lib/live";
import { lookupAgent, type Lookup } from "@/lib/lookup";
import { SCORE_DEFINITION } from "@/lib/score";
import { parseAgentInput } from "@/lib/verify";

export const dynamic = "force-dynamic";

export default async function LookupPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id = "" } = await searchParams;
  const parsed = id ? parseAgentInput(id) : null;
  const { controls } = loadCatalog();
  const now = Math.floor(Date.now() / 1000);

  let found: Lookup | null = null;
  let error: string | null = parsed && !parsed.ok ? parsed.reason : null;
  if (parsed?.ok) {
    try {
      found = await lookupAgent(parsed.key, controls);
    } catch (e) {
      error = errText(e);
    }
  }
  const fleet = parsed?.ok ? AGENTS.find(a => a.registryId === parsed.label) : undefined;

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Agent lookup</h1>
      <p className="mt-2 max-w-[60ch] text-ink-2">Before you deal with an agent, read its latest control results from the registry yourself.</p>

      <div className="mt-8">
        <LookupForm defaultValue={id} autoFocus={!id} />
        <div className="mt-3 flex flex-wrap gap-2">
          {AGENTS.map(a => (
            <Link key={a.slug} href={`/lookup?id=${a.registryId}`} className="rounded-full border border-rule-strong px-3 py-1 font-mono text-xs text-ink-2 hover:text-ink">
              {a.registryId}
            </Link>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-8 rounded-md border border-fail/30 bg-fail-wash px-3 py-2 text-sm text-fail">
          {error}
        </p>
      )}

      {found && parsed?.ok && (
        <section aria-label="Lookup result" className="mt-10 border-t border-rule pt-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="break-all font-mono text-lg font-semibold">{parsed.label ?? "Raw agent id"}</h2>
              <p className="mt-1 text-xs text-ink-3">
                Registry key <CopyHash value={found.key} display={`${found.key.slice(0, 10)}…${found.key.slice(-8)}`} />
              </p>
              {fleet && (
                <p className="mt-1 text-sm">
                  In this fleet as{" "}
                  <Link href={`/agents/${fleet.slug}`} className="font-medium underline underline-offset-4">
                    {fleet.name}
                  </Link>
                </p>
              )}
            </div>
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <SafetyScoreBadge s={found.safety} frozen={false} synthetic={false} size="lg" />
              <span className={`text-sm font-medium ${found.compliant ? "text-pass" : "text-fail"}`}>
                isCompliant: {String(found.compliant)}
              </span>
            </div>
          </div>
          <p className="mt-3 max-w-[70ch] text-xs text-ink-3">
            {SCORE_DEFINITION} Freeze state lives on the Solana guard and is shown on fleet agent pages only.
          </p>
          {found.txNote && <p className="mt-2 text-xs text-ink-3">{found.txNote}</p>}

          {found.safety.tested === 0 ? (
            <p className="mt-8 border-y border-rule py-8 text-center text-ink-2">
              The registry has no results for this id. Check the spelling: ids are case sensitive.
            </p>
          ) : (
            <div className="mt-6">
              <ControlsTable
                controls={controls.filter(c => found.latest[c.id] || c.implemented)}
                latest={found.latest}
                agentKey={found.key}
                verify={verifyConfig("live")}
                synthetic={false}
                serverNow={now}
              />
            </div>
          )}
        </section>
      )}
    </>
  );
}
