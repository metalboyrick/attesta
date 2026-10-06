import { ArrowLeft, DownloadSimple, LockSimple } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { notFound } from "next/navigation";
import { keccak256, stringToHex } from "viem";
import { ChainTag, TxLink, short } from "@/components/chain";
import { Ago, CopyHash } from "@/components/client";
import { FrameworkIds } from "@/components/frameworks";
import { SourceBar } from "@/components/source";
import { PassMark, StatusPill } from "@/components/status";
import { getSnapshot } from "@/lib/snapshot";
import type { ControlDef } from "@/lib/types";

export const dynamic = "force-dynamic";

const HISTORY = 12;

function ControlSpec({ c }: { c: ControlDef }) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className={`font-medium leading-snug underline decoration-rule-strong decoration-dotted underline-offset-4 group-open:decoration-ink-3 ${c.implemented ? "" : "text-ink-2"}`}>
          {c.title}
        </span>
        <span className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-[11px] text-ink-2">{c.id}</span>
          <FrameworkIds soc2={c.soc2} iso={c.iso42001} />
        </span>
      </summary>
      <dl className="mt-3 space-y-2 border-l-2 border-rule pl-3 text-sm text-ink-2">
        {[["Objective", c.objective], ["Test", c.test], ["Evidence", c.evidence], ["Runs", c.frequency]]
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs font-medium text-ink-3">{k}</dt>
              <dd className="leading-relaxed">{v}</dd>
            </div>
          ))}
      </dl>
    </details>
  );
}

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
          <StatusPill status={agent.status} size="lg" />
          <span className="text-xs text-ink-3">
            Last run {agent.lastRun ? <Ago ts={agent.lastRun} serverNow={snap.generatedAt} /> : "never"}
          </span>
        </div>
      </div>

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
                  <a
                    className="font-mono underline underline-offset-4"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://explorer.solana.com/tx/${freeze.txHash}?cluster=devnet`}
                  >
                    {short(freeze.txHash, 6, 6)}
                  </a>
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

        {/* Desktop: table. Phone: stacked blocks. */}
        <table className="mt-5 hidden w-full border-collapse text-left md:table">
          <thead>
            <tr className="border-b border-rule-strong text-xs text-ink-3">
              <th scope="col" className="py-2 pr-4 font-medium">Control</th>
              <th scope="col" className="py-2 pr-4 font-medium">Result</th>
              <th scope="col" className="py-2 pr-4 font-medium">Evidence hash</th>
              <th scope="col" className="py-2 pr-4 font-medium">Registry tx</th>
              <th scope="col" className="py-2 font-medium">Run</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {snap.controls.map(c => {
              const r = agent.latest[c.id];
              return (
                <tr key={c.id} className={r && !r.pass ? "bg-fail-wash/60" : undefined}>
                  <td className="max-w-md py-3.5 pr-4 align-top">
                    <ControlSpec c={c} />
                  </td>
                  <td className="py-3.5 pr-4 align-top"><PassMark pass={r?.pass} implemented={c.implemented} /></td>
                  <td className="py-3.5 pr-4 align-top">{r ? <CopyHash value={r.evidenceHash} display={short(r.evidenceHash, 8, 6)} /> : "–"}</td>
                  <td className="py-3.5 pr-4 align-top">{r ? <TxLink chain={r.chain} tx={r.txHash} /> : "–"}</td>
                  <td className="tnum py-3.5 align-top text-sm text-ink-3">{r ? <Ago ts={r.ts} serverNow={snap.generatedAt} /> : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <ul className="mt-5 divide-y divide-rule border-y border-rule md:hidden">
          {snap.controls.map(c => {
            const r = agent.latest[c.id];
            return (
              <li key={c.id} className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <ControlSpec c={c} />
                  </div>
                  <PassMark pass={r?.pass} implemented={c.implemented} />
                </div>
                {r && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <CopyHash value={r.evidenceHash} display={short(r.evidenceHash, 6, 4)} />
                    <TxLink chain={r.chain} tx={r.txHash} />
                    <span className="text-xs text-ink-3"><Ago ts={r.ts} serverNow={snap.generatedAt} /></span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
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
