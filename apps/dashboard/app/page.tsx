import { CaretRight } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { ChainTag } from "@/components/chain";
import { Ago } from "@/components/client";
import { SourceBar } from "@/components/source";
import { StatusPill } from "@/components/status";
import { getSnapshot } from "@/lib/snapshot";
import type { AgentView, Snapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

function headline(agents: AgentView[]) {
  const attention = agents.filter(a => a.status !== "compliant").length;
  if (attention === 0) return "All agents are compliant.";
  return `${attention} of ${agents.length} agents need attention.`;
}

function ControlStrip({ agent, snap }: { agent: AgentView; snap: Snapshot }) {
  return (
    <ol className="flex gap-1" aria-label="Latest result per control">
      {snap.controls.map(c => {
        const r = agent.latest[c.id];
        const tone = !c.implemented ? "border border-rule-strong" : r === undefined ? "bg-rule" : r.pass ? "bg-pass" : "bg-fail";
        const state = !c.implemented ? "not built yet" : r === undefined ? "no result yet" : r.pass ? "pass" : "fail";
        return (
          <li key={c.id} title={`${c.id} ${c.title}: ${state}`}>
            <span className={`block h-5 w-2.5 rounded-[2px] md:h-6 md:w-3 ${tone}`} />
            <span className="sr-only">
              {c.id} {state}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default async function FleetPage() {
  const snap = await getSnapshot();
  const day = snap.generatedAt - 86_400;
  const latest = snap.agents.flatMap(a => Object.values(a.latest));
  const passing = latest.filter(r => r?.pass).length;
  const freezes = snap.events.filter(e => e.kind === "freeze" && e.ts >= day).length;
  const purchases = snap.events.filter(e => e.kind === "purchase" && e.ts >= day).length;

  return (
    <>
      <SourceBar snap={snap} />

      <h1 className="max-w-[18ch] text-3xl font-semibold leading-[1.1] tracking-tight md:text-5xl">{headline(snap.agents)}</h1>
      <p className="mt-3 max-w-[58ch] text-ink-2">
        Control tests run in a Chainlink CRE workflow. Each result is written to Sepolia with a hash of its evidence.
      </p>

      <ul className="mt-10 divide-y divide-rule border-y border-rule">
        {snap.agents.map(agent => (
          <li key={agent.slug}>
            <Link
              href={`/agents/${agent.slug}`}
              className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 py-5 transition-colors hover:bg-surface md:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,0.9fr)_auto] md:gap-x-8 md:px-3"
            >
              <div className="min-w-0">
                <div className="flex items-baseline gap-3">
                  <span className="text-lg font-semibold tracking-tight">{agent.name}</span>
                  <ChainTag chain={agent.chain} />
                </div>
                <p className="mt-0.5 truncate text-sm text-ink-3">{agent.role}</p>
              </div>
              <div className="justify-self-end md:order-3 md:justify-self-start">
                <StatusPill status={agent.status} />
              </div>
              <div className="md:order-2">
                <ControlStrip agent={agent} snap={snap} />
              </div>
              <div className="flex items-center justify-end gap-3 text-sm text-ink-3 md:order-4">
                <span className="tnum">
                  {agent.lastRun ? <Ago ts={agent.lastRun} serverNow={snap.generatedAt} /> : "Never run"}
                </span>
                <CaretRight aria-hidden className="size-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <dl className="mt-10 grid grid-cols-3 gap-4 md:max-w-2xl">
        {[
          [`${passing}/${latest.length}`, "controls passing now"],
          [String(freezes), "guard freezes, 24 h"],
          [String(purchases), "paid checks, 24 h"],
        ].map(([value, label]) => (
          <div key={label} className="flex flex-col-reverse">
            <dt className="mt-1 text-xs text-ink-3 md:text-sm">{label}</dt>
            <dd className="tnum text-2xl font-semibold tracking-tight md:text-3xl">{value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
