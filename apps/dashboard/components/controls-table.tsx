import type { Hex } from "viem";
import type { ControlDef, ControlResult } from "@/lib/types";
import { TxLink, short } from "./chain";
import { Ago, CopyHash } from "./client";
import { ControlDrawer, type VerifyConfig } from "./drawer";
import { FrameworkIds } from "./frameworks";
import { PassMark } from "./status";

/** Controls in the catalogue, plus any id the registry holds that the catalogue does not know. */
function rows(controls: ControlDef[], latest: Record<string, ControlResult | undefined>): ControlDef[] {
  const known = new Set(controls.map(c => c.id));
  const extra = Object.keys(latest)
    .filter(id => !known.has(id))
    .map<ControlDef>(id => ({ id, title: "Control not in catalogue", objective: "", test: "", evidence: "", frequency: "", implemented: true, soc2: [], iso42001: [], unverified: [] }));
  return [...controls, ...extra];
}

type Props = {
  controls: ControlDef[];
  latest: Record<string, ControlResult | undefined>;
  agentKey: Hex;
  verify: VerifyConfig;
  synthetic: boolean;
  serverNow: number;
};

export function ControlsTable({ controls, latest, agentKey, verify, synthetic, serverNow }: Props) {
  const list = rows(controls, latest);
  const Spec = ({ c }: { c: ControlDef }) => (
    <div>
      <ControlDrawer control={c} result={latest[c.id]} agentKey={agentKey} verify={verify} synthetic={synthetic}>
        {c.title}
      </ControlDrawer>
      <span className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="break-all font-mono text-[11px] text-ink-2">{c.id}</span>
        <FrameworkIds soc2={c.soc2} iso={c.iso42001} />
      </span>
    </div>
  );
  return (
    <>
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
            {list.map(c => {
              const r = latest[c.id];
              return (
                <tr key={c.id} className={r && !r.pass ? "bg-fail-wash/60" : undefined}>
                  <td className="max-w-md py-3.5 pr-4 align-top">
                    <Spec c={c} />
                  </td>
                  <td className="py-3.5 pr-4 align-top"><PassMark pass={r?.pass} implemented={c.implemented} /></td>
                  <td className="py-3.5 pr-4 align-top">{r ? <CopyHash value={r.evidenceHash} display={short(r.evidenceHash, 8, 6)} /> : "–"}</td>
                  <td className="py-3.5 pr-4 align-top">{r ? <TxLink synthetic={synthetic} chain={r.chain} tx={r.txHash} /> : "–"}</td>
                  <td className="tnum py-3.5 align-top text-sm text-ink-3">{r ? <Ago ts={r.ts} serverNow={serverNow} /> : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <ul className="mt-5 divide-y divide-rule border-y border-rule md:hidden">
          {list.map(c => {
            const r = latest[c.id];
            return (
              <li key={c.id} className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Spec c={c} />
                  </div>
                  <PassMark pass={r?.pass} implemented={c.implemented} />
                </div>
                {r && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <CopyHash value={r.evidenceHash} display={short(r.evidenceHash, 6, 4)} />
                    <TxLink synthetic={synthetic} chain={r.chain} tx={r.txHash} />
                    <span className="text-xs text-ink-3"><Ago ts={r.ts} serverNow={serverNow} /></span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
    </>
  );
}
