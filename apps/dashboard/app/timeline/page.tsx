import { CoinVertical, LockSimple, LockSimpleOpen, ShieldCheck, ShieldWarning } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { ChainTag, TxLink } from "@/components/chain";
import { Ago } from "@/components/client";
import { SourceBar } from "@/components/source";
import { getSnapshot } from "@/lib/snapshot";
import type { Chain, TimelineEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

type Entry =
  | { type: "run"; key: string; ts: number; agentSlug: string; chain: Chain; results: Extract<TimelineEvent, { kind: "control" }>[] }
  | { type: "single"; key: string; ts: number; event: Exclude<TimelineEvent, { kind: "control" }> };

const FILTERS = [
  { id: "all", label: "All" },
  { id: "controls", label: "Control runs" },
  { id: "guard", label: "Guard" },
  { id: "x402", label: "Paid checks" },
] as const;

// One CRE run writes one result per control with the same ts; show it as one entry.
function group(events: TimelineEvent[]): Entry[] {
  const out: Entry[] = [];
  const runs = new Map<string, Extract<Entry, { type: "run" }>>();
  for (const e of events) {
    if (e.kind === "control") {
      const key = `${e.agentSlug}:${e.ts}`;
      const run = runs.get(key);
      if (run) run.results.push(e);
      else {
        const entry = { type: "run" as const, key, ts: e.ts, agentSlug: e.agentSlug, chain: e.chain, results: [e] };
        runs.set(key, entry);
        out.push(entry);
      }
    } else out.push({ type: "single", key: `${e.kind}:${e.txHash}`, ts: e.ts, event: e });
  }
  return out;
}

export default async function TimelinePage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show = "all" } = await searchParams;
  const snap = await getSnapshot();
  const name = (slug?: string) => snap.agents.find(a => a.slug === slug)?.name ?? "Unknown agent";

  const events = snap.events.filter(e =>
    show === "controls" ? e.kind === "control"
    : show === "guard" ? e.kind === "freeze" || e.kind === "unfreeze"
    : show === "x402" ? e.kind === "purchase"
    : true,
  );
  const entries = group(events).slice(0, 80);
  const fresh = snap.generatedAt - 90;

  return (
    <>
      <SourceBar snap={snap} />
      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Timeline</h1>
      <p className="mt-2 max-w-[58ch] text-ink-2">Control results from the registry, freezes from the Solana guard, and paid attestation checks on Cardano.</p>

      <nav aria-label="Filter events" className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {FILTERS.map(f => (
          <Link
            key={f.id}
            href={f.id === "all" ? "/timeline" : `/timeline?show=${f.id}`}
            aria-current={show === f.id ? "page" : undefined}
            className={`h-8 shrink-0 rounded-full border px-3 text-sm leading-[30px] ${show === f.id ? "border-ink bg-ink text-bg" : "border-rule-strong text-ink-2 hover:text-ink"}`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {entries.length === 0 ? (
        <p className="mt-10 border-y border-rule py-10 text-center text-ink-3">
          Nothing here yet. Events show up after the next CRE run writes to the registry.
        </p>
      ) : (
        <ol className="mt-6 border-l border-rule-strong pl-5 md:pl-7">
          {entries.map(entry => {
            const isNew = entry.ts >= fresh;
            if (entry.type === "run") {
              const failed = entry.results.filter(r => !r.pass);
              const Icon = failed.length ? ShieldWarning : ShieldCheck;
              return (
                <li key={entry.key} className={`relative py-3 ${isNew ? "arrive" : ""}`}>
                  <Icon aria-hidden weight="fill" className={`absolute -left-[29px] top-[15px] size-4 bg-bg md:-left-[37px] ${failed.length ? "text-fail" : "text-pass"}`} />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                    <p>
                      <Link href={`/agents/${entry.agentSlug}`} className="font-medium hover:underline">{name(entry.agentSlug)}</Link>
                      <span className="text-ink-2">
                        {" "}
                        {failed.length
                          ? `failed ${failed.map(f => f.controlId).join(", ")}`
                          : `passed ${entry.results.length} control${entry.results.length === 1 ? "" : "s"}`}
                      </span>
                    </p>
                    <span className="tnum text-xs text-ink-3"><Ago ts={entry.ts} serverNow={snap.generatedAt} /></span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3">
                    <ChainTag chain={entry.chain} />
                    <TxLink chain={entry.chain} tx={(failed[0] ?? entry.results[0]).txHash} />
                    {entry.results.length > 1 && <span className="text-xs text-ink-3">{entry.results.length - failed.length}/{entry.results.length} pass</span>}
                  </div>
                </li>
              );
            }
            const e = entry.event;
            const Icon = e.kind === "freeze" ? LockSimple : e.kind === "unfreeze" ? LockSimpleOpen : CoinVertical;
            const text =
              e.kind === "freeze" ? "frozen by the Solana guard"
              : e.kind === "unfreeze" ? "unfrozen by the compliance authority"
              : e.agentSlug ? "attestation bought by a counterparty over x402" : "Counterparty paid for an attestation check over x402";
            return (
              <li key={entry.key} className={`relative py-3 ${isNew ? "arrive" : ""}`}>
                <Icon aria-hidden weight="fill" className={`absolute -left-[29px] top-[15px] size-4 bg-bg md:-left-[37px] ${e.kind === "freeze" ? "text-ink" : "text-ink-3"}`} />
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                  <p className={e.kind === "freeze" ? "font-semibold" : undefined}>
                    {e.agentSlug && (
                      <Link href={`/agents/${e.agentSlug}`} className="font-medium hover:underline">{name(e.agentSlug)} </Link>
                    )}
                    <span className={e.kind === "freeze" ? "" : "text-ink-2"}>{text}</span>
                  </p>
                  <span className="tnum text-xs text-ink-3"><Ago ts={e.ts} serverNow={snap.generatedAt} /></span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3">
                  <ChainTag chain={e.chain} />
                  <TxLink chain={e.chain} tx={e.txHash} />
                  {(e.kind === "freeze" || e.kind === "unfreeze") && <span className="font-mono text-[11px] text-ink-3">reason {e.reasonCode}</span>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
