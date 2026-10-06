import { ArrowLeft, DownloadSimple, LockSimple } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { notFound } from "next/navigation";
import { keccak256, stringToHex } from "viem";
import { ChainTag, short } from "@/components/chain";
import { Ago, CopyHash } from "@/components/client";
import { SourceBar } from "@/components/source";
import { StatusPill } from "@/components/status";
import { SafetyScoreBadge } from "@/components/score";
import { SCORE_DEFINITION } from "@/lib/score";
import { getSnapshot } from "@/lib/snapshot";
import { verifyConfig } from "@/lib/env";
import { ControlsTable } from "@/components/controls-table";

export const dynamic = "force-dynamic";

const HISTORY = 12;


export default async function AgentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const snap = await getSnapshot();
  const agent = snap.agents.find(a => a.slug === slug);
  if (!agent) notFound();

  const mine = snap.results.filter(r => r.agentSlug === slug);
  const runs = [...new Set(mine.map(r => r.ts))].sort((a, b) => b - a).slice(0, HISTORY).reverse();
  const byRun = new Map(mine.map(r => [`${r.controlId}:${r.ts}`, r]));
  const freeze = snap.events.find(e => e.kind === "freeze" && e.agentSlug === slug);
  const registryKey = keccak256(stringToHex(agent.registryId));
  const verify = verifyConfig(snap.mode);

  return (
    <>
      <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft aria-hidden className="size-3.5" /> Fleet
      </Link>
      <SourceBar snap={snap} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{agent.name}</h1>
          <p className="mt-1 text-ink-2">{agent.role}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <ChainTag chain={agent.chain} />
            <span className="text-xs text-ink-3">
              Registry id <CopyHash value={registryKey} display={`${agent.registryId} · ${short(registryKey)}`} />
            </span>
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="flex items-center gap-2">
            <SafetyScoreBadge s={agent.safety} frozen={agent.frozen} synthetic={snap.mode === "fixture"} size="lg" />
            {!agent.frozen && <StatusPill status={agent.status} size="lg" />}
          </div>
          <span className="text-xs text-ink-3">
            Last run {agent.lastRun ? <Ago ts={agent.lastRun} serverNow={snap.generatedAt} /> : "never"}
          </span>
        </div>
      </div>

      <p className="mt-4 max-w-[70ch] text-xs text-ink-3">{SCORE_DEFINITION}</p>

      {agent.frozen && (
        <section aria-label="Guard freeze" className="mt-8 rounded-lg bg-frozen-bg px-5 py-4 text-frozen-fg">
          <div className="flex items-start gap-3">
            <LockSimple aria-hidden weight="bold" className="mt-0.5 size-5 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold">Frozen on the Solana guard. Every spend is rejected.</p>
              <p className="mt-1 text-sm opacity-80">
                {agent.failing.length > 0 ? `Failing: ${agent.failing.join(", ")}. ` : ""}
                The freeze lifts only when the compliance authority clears it.
              </p>
              {freeze && (
                <p className="mt-2 text-sm opacity-80">
                  Frozen <Ago ts={freeze.ts} serverNow={snap.generatedAt} /> in tx{" "}
                  {snap.mode === "fixture" ? (
                    <span className="font-mono">{short(freeze.txHash, 6, 6)} (synthetic)</span>
                  ) : (
                    <a
                      className="font-mono underline underline-offset-4"
                      target="_blank"
                      rel="noreferrer"
                      href={`https://explorer.solana.com/tx/${freeze.txHash}?cluster=devnet`}
                    >
                      {short(freeze.txHash, 6, 6)}
                    </a>
                  )}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      <section aria-labelledby="controls" className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="controls" className="text-xl font-semibold tracking-tight">
            Controls
          </h2>
          <div className="flex gap-2">
            {(["json", "csv"] as const).map(f => (
              <a
                key={f}
                href={`/api/evidence?agent=${slug}&scope=latest&format=${f}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-rule-strong px-3 text-xs font-medium hover:bg-surface active:translate-y-px"
              >
                <DownloadSimple aria-hidden className="size-3.5" /> {f.toUpperCase()}
              </a>
            ))}
          </div>
        </div>

        <ControlsTable controls={snap.controls} latest={agent.latest} agentKey={registryKey} verify={verify} synthetic={snap.mode === "fixture"} serverNow={snap.generatedAt} />
      </section>

      {runs.length > 1 && (
        <section aria-labelledby="history" className="mt-14">
          <h2 id="history" className="text-xl font-semibold tracking-tight">Last {runs.length} runs</h2>
          <p className="mt-1 text-sm text-ink-3">Oldest on the left. One column per CRE run.</p>
          <div className="mt-5 overflow-x-auto">
            <table className="border-separate border-spacing-1">
              <tbody>
                {snap.controls.filter(c => c.implemented).map(c => (
                  <tr key={c.id}>
                    <th scope="row" className="pr-3 text-left font-mono text-[11px] font-normal text-ink-3">{c.id}</th>
                    {runs.map(ts => {
                      const r = byRun.get(`${c.id}:${ts}`);
                      return (
                        <td key={ts} title={`${c.id} at ${new Date(ts * 1000).toISOString()}: ${r ? (r.pass ? "pass" : "fail") : "no result"}`}>
                          <span className={`block size-4 rounded-[3px] md:size-5 ${r === undefined ? "bg-sunken" : r.pass ? "bg-pass/85" : "bg-fail"}`} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
