import { registryAddress } from "@/lib/env";
import { DownloadSimple } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { TxLink, short } from "@/components/chain";
import { CopyHash } from "@/components/client";
import { SourceBar } from "@/components/source";
import { PassMark } from "@/components/status";
import { evidenceRows } from "@/lib/evidence";
import { getSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

const PREVIEW = 12;

function Choice({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={on ? "true" : undefined}
      className={`h-8 shrink-0 rounded-full border px-3 text-sm leading-[30px] ${on ? "border-ink bg-ink text-bg" : "border-rule-strong text-ink-2 hover:text-ink"}`}
    >
      {children}
    </Link>
  );
}

export default async function AuditorPage({ searchParams }: { searchParams: Promise<{ agent?: string; scope?: string }> }) {
  const sp = await searchParams;
  const snap = await getSnapshot();
  const agent = snap.agents.some(a => a.slug === sp.agent) ? sp.agent : undefined;
  const scope = sp.scope === "history" ? "history" : "latest";
  const rows = evidenceRows(snap, { agent, latestOnly: scope === "latest" });
  const qs = (next: { agent?: string; scope?: string }) => {
    const p = new URLSearchParams();
    const a = "agent" in next ? next.agent : agent;
    const s = next.scope ?? scope;
    if (a) p.set("agent", a);
    if (s !== "latest") p.set("scope", s);
    const str = p.toString();
    return str ? `?${str}` : "";
  };
  const apiQs = (format: string) => `/api/evidence?format=${format}&scope=${scope}${agent ? `&agent=${agent}` : ""}`;
  const registry = registryAddress() || "<registry>";

  return (
    <>
      <SourceBar snap={snap} />
      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Evidence pack</h1>
      <p className="mt-2 max-w-[60ch] text-ink-2">
        Every row is a control result an auditor can check on Sepolia without trusting us: the evidence hash and the transaction that wrote it.
      </p>

      <div className="mt-8 space-y-3">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0" role="group" aria-label="Agent">
          <Choice href={`/auditor${qs({ agent: undefined })}`} on={!agent}>All agents</Choice>
          {snap.agents.map(a => (
            <Choice key={a.slug} href={`/auditor${qs({ agent: a.slug })}`} on={agent === a.slug}>{a.name}</Choice>
          ))}
        </div>
        <div className="flex gap-2" role="group" aria-label="Results">
          <Choice href={`/auditor${qs({ scope: "latest" })}`} on={scope === "latest"}>Latest per control</Choice>
          <Choice href={`/auditor${qs({ scope: "history" })}`} on={scope === "history"}>Full history</Choice>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-y border-rule py-5">
        <a href={apiQs("json")} className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-bg hover:opacity-90 active:translate-y-px">
          <DownloadSimple aria-hidden className="size-4" /> Download JSON
        </a>
        <a href={apiQs("csv")} className="inline-flex h-10 items-center gap-2 rounded-full border border-rule-strong px-4 text-sm font-medium hover:bg-surface active:translate-y-px">
          <DownloadSimple aria-hidden className="size-4" /> Download CSV
        </a>
        <span className="tnum text-sm text-ink-3">{rows.length} rows</span>
      </div>

      <ul className="mt-4 divide-y divide-rule md:hidden">
        {rows.slice(0, PREVIEW).map(r => (
          <li key={`${r.agent}:${r.control}:${r.ts}`} className="py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-xs">
                {r.control} <span className="text-ink-3">· {r.agent}</span>
              </span>
              <PassMark pass={r.pass} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
              <CopyHash value={r.evidenceHash} display={short(r.evidenceHash, 6, 4)} />
              <TxLink synthetic={snap.mode === "fixture"} chain="sepolia" tx={r.txHash} />
              <span className="tnum font-mono text-[11px] text-ink-3">{r.tsIso.slice(5, 16).replace("T", " ")}</span>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-6 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <caption className="sr-only">Evidence rows, first {PREVIEW}</caption>
          <thead>
            <tr className="border-b border-rule-strong text-xs text-ink-3">
              {["Control", "Agent", "Result", "Evidence hash", "Tx", "Time (UTC)", "Mapping"].map(h => (
                <th key={h} scope="col" className="py-2 pr-4 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {rows.slice(0, PREVIEW).map(r => (
              <tr key={`${r.agent}:${r.control}:${r.ts}`}>
                <td className="whitespace-nowrap py-2.5 pr-4 font-mono text-xs">{r.control}</td>
                <td className="py-2.5 pr-4">{r.agent}</td>
                <td className="py-2.5 pr-4"><PassMark pass={r.pass} /></td>
                <td className="py-2.5 pr-4"><CopyHash value={r.evidenceHash} display={short(r.evidenceHash, 6, 4)} /></td>
                <td className="py-2.5 pr-4"><TxLink synthetic={snap.mode === "fixture"} chain="sepolia" tx={r.txHash} /></td>
                <td className="tnum py-2.5 pr-4 font-mono text-xs text-ink-2">{r.tsIso.slice(0, 19).replace("T", " ")}</td>
                <td className="py-2.5 font-mono text-[11px] text-ink-3">{[...r.soc2, ...r.iso42001].join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > PREVIEW && <p className="mt-3 text-xs text-ink-3">Showing {PREVIEW} of {rows.length}. The download has every row.</p>}

      <section aria-labelledby="coverage" className="mt-14">
        <h2 id="coverage" className="text-xl font-semibold tracking-tight">Framework coverage</h2>
        <p className="mt-1 max-w-[65ch] text-sm text-ink-2">
          Catalogue v{snap.catalogVersion}: {snap.controls.filter(c => c.implemented).length} of {snap.controls.length} controls run today. A mapping means
          the control produces evidence for that criterion. It does not cover the whole criterion; policies and people still sit around it.
        </p>
        <ul className="mt-5 grid gap-x-10 md:grid-cols-2">
          {snap.controls.map(c => {
            const results = snap.agents.map(a => a.latest[c.id]).filter(r => r !== undefined);
            const pass = results.filter(r => r.pass).length;
            return (
              <li key={c.id} className="flex items-start justify-between gap-4 border-b border-rule py-3">
                <div className="min-w-0">
                  <p className="font-medium leading-snug">{c.title}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-3">
                    {c.id} · TSC {c.soc2.join(", ") || "–"} · 42001 {c.iso42001.join(", ") || "–"}
                  </p>
                </div>
                {c.implemented ? (
                  <span className={`tnum shrink-0 text-sm font-medium ${pass < results.length ? "text-fail" : "text-pass"}`} title="Agents passing / agents reported">
                    {pass}/{results.length}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-ink-3">Not built yet</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="verify" className="mt-14 max-w-3xl">
        <h2 id="verify" className="text-xl font-semibold tracking-tight">Check a row yourself</h2>
        <p className="mt-1 text-sm text-ink-2">
          Agent and control ids are keccak256 of their labels. The registry returns the latest pass flag, evidence hash and timestamp.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-md bg-sunken p-4 font-mono text-xs leading-relaxed text-ink-2">
{`cast call ${registry} \\
  "getResult(bytes32,bytes32)((bool,bytes32,uint64))" \\
  $(cast keccak ${snap.agents[0].registryId}) $(cast keccak ATT-SPEND-01) \\
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com`}
        </pre>
      </section>
    </>
  );
}
