"use client";

import { ArrowUpRight, CheckCircle, Copy, SealCheck, SealWarning, X } from "@phosphor-icons/react";
import { useId, useRef, useState } from "react";
import { createPublicClient, http, isHex, keccak256, parseEventLogs, stringToHex, type Address, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { controlResultEvent, registryAbi } from "@/lib/abi";
import type { ControlDef, ControlResult } from "@/lib/types";
import { compareResult, type Comparison } from "@/lib/verify";

export type VerifyConfig = { registry: string; rpc: string } | null;

type Check = { label: string; ok: boolean; detail: string };
type VerifyState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; block: bigint; state: Comparison; checks: Check[] }
  | { kind: "error"; message: string };

const controlKey = (id: string): Hex => (isHex(id) && id.length === 66 ? (id as Hex) : keccak256(stringToHex(id)));
const short = (s: string, a = 10, b = 8) => (s.length > a + b + 1 ? `${s.slice(0, a)}…${s.slice(-b)}` : s);
const iso = (ts: number) => new Date(ts * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";

/** Re-reads one result from Sepolia in the browser, independent of this dashboard's server. */
async function verifyOnChain(cfg: NonNullable<VerifyConfig>, agentKey: Hex, r: ControlResult) {
  const client = createPublicClient({ chain: sepolia, transport: http(cfg.rpc) });
  const address = cfg.registry as Address;
  const cKey = controlKey(r.controlId);
  const [block, chain] = await Promise.all([
    client.getBlockNumber(),
    client.readContract({ address, abi: registryAbi, functionName: "getResult", args: [agentKey, cKey] }),
  ]);
  const state = compareResult(r, { pass: chain.pass, evidenceHash: chain.evidenceHash, ts: Number(chain.ts) });
  const checks: Check[] = [];
  if (r.txHash) {
    const receipt = await client.getTransactionReceipt({ hash: r.txHash as Hex });
    const logs = parseEventLogs({ abi: [controlResultEvent], logs: receipt.logs }).filter(
      l => l.address.toLowerCase() === address.toLowerCase() && l.args.agentId === agentKey && l.args.controlId === cKey,
    );
    const hit = logs.find(l => l.args.evidenceHash.toLowerCase() === r.evidenceHash.toLowerCase() && Number(l.args.ts) === r.ts);
    checks.push({
      label: "Transaction emitted this result",
      ok: Boolean(hit) && hit!.args.pass === r.pass,
      detail: hit ? `ControlResult in block ${receipt.blockNumber}` : `No matching ControlResult event in ${short(r.txHash)}`,
    });
  }
  return { block, state, checks };
}

export function ControlDrawer({
  control,
  result,
  agentKey,
  verify,
  synthetic,
  children,
}: {
  control: ControlDef;
  result?: ControlResult;
  agentKey: Hex;
  verify: VerifyConfig;
  synthetic: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [v, setV] = useState<VerifyState>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const titleId = useId();

  const run = async () => {
    if (!verify || !result) return;
    setV({ kind: "running" });
    try {
      setV({ kind: "done", ...(await verifyOnChain(verify, agentKey, result)) });
    } catch (e) {
      const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
      setV({ kind: "error", message: msg });
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className={`text-left font-medium leading-snug underline decoration-rule-strong decoration-dotted underline-offset-4 hover:decoration-ink-3 ${control.implemented ? "" : "text-ink-2"}`}
      >
        {children}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClick={e => e.target === ref.current && ref.current?.close()}
        className="sheet m-0 mt-auto max-h-[88dvh] w-full max-w-full overflow-y-auto rounded-t-2xl border-t border-rule-strong bg-surface p-0 text-ink backdrop:bg-black/45 md:ml-auto md:mt-0 md:h-dvh md:max-h-none md:w-[30rem] md:rounded-none md:border-l md:border-t-0"
      >
        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-rule bg-surface px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold leading-snug tracking-tight">{control.title}</h2>
            <p className="mt-0.5 font-mono text-xs text-ink-2">{control.id}</p>
          </div>
          <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-sunken">
            <X aria-hidden className="size-4" />
          </button>
        </div>

        <div className="space-y-6 px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <section aria-label="Result">
            {result ? (
              <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="text-ink-3">Result</dt>
                <dd className={`font-medium ${result.pass ? "text-pass" : "text-fail"}`}>{result.pass ? "Pass" : "Fail"}</dd>
                <dt className="text-ink-3">Written</dt>
                <dd className="tnum font-mono text-xs leading-5">{iso(result.ts)}</dd>
                <dt className="text-ink-3">Evidence hash</dt>
                <dd>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(result.evidenceHash).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); })}
                    className="inline-flex items-center gap-1.5 break-all text-left font-mono text-xs leading-5 text-ink-2 hover:text-ink"
                    aria-label="Copy evidence hash"
                  >
                    {result.evidenceHash}
                    {copied ? <CheckCircle aria-hidden className="size-3.5 shrink-0 text-pass" /> : <Copy aria-hidden className="size-3.5 shrink-0 opacity-50" />}
                  </button>
                </dd>
                <dt className="text-ink-3">Registry tx</dt>
                <dd className="font-mono text-xs leading-5">
                  {!result.txHash ? (
                    <span className="text-ink-3">Not available</span>
                  ) : synthetic ? (
                    <span className="text-ink-3">{short(result.txHash)} (synthetic)</span>
                  ) : (
                    <a href={`https://sepolia.etherscan.io/tx/${result.txHash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                      {short(result.txHash)} <ArrowUpRight aria-hidden className="size-3" />
                    </a>
                  )}
                </dd>
              </dl>
            ) : (
              <p className="text-sm text-ink-2">{control.implemented ? "No result in the registry for this agent yet." : "Designed in the catalogue, not run by the workflow yet."}</p>
            )}
          </section>

          {result && (
            <section aria-label="Verify on-chain" className="rounded-lg border border-rule p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Verify on-chain</p>
                <button
                  type="button"
                  disabled={!verify || v.kind === "running"}
                  onClick={run}
                  className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-sm font-medium text-bg transition-opacity hover:opacity-90 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {v.kind === "running" ? "Reading Sepolia…" : v.kind === "idle" ? "Verify" : "Verify again"}
                </button>
              </div>
              <p className="mt-1 text-xs text-ink-3">
                {verify
                  ? `Your browser reads the registry directly from ${new URL(verify.rpc).host}, not through this dashboard.`
                  : "Fixture data is synthetic, so there is nothing on-chain to check."}
              </p>
              <div aria-live="polite">
                {v.kind === "error" && <p className="mt-3 text-sm text-fail">Could not read Sepolia: {v.message}</p>}
                {v.kind === "done" && <VerifyResult v={v} />}
              </div>
            </section>
          )}

          <section aria-label="Framework mapping">
            <h3 className="text-xs font-medium text-ink-3">Framework mapping</h3>
            <dl className="mt-2 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-ink-3">SOC 2 TSC</dt>
              <dd className="font-mono text-xs leading-5">{control.soc2.join(", ") || "–"}</dd>
              <dt className="text-ink-3">ISO/IEC 42001</dt>
              <dd className="font-mono text-xs leading-5">{control.iso42001.join(", ") || "–"}</dd>
            </dl>
            <p className="mt-2 text-xs text-ink-3">The control produces evidence for these criteria. It does not cover a whole criterion on its own.</p>
          </section>

          {[["Objective", control.objective], ["Test", control.test], ["Evidence", control.evidence]]
            .filter(([, t]) => t)
            .map(([k, t]) => (
              <section key={k} aria-label={k}>
                <h3 className="text-xs font-medium text-ink-3">{k}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">{t}</p>
              </section>
            ))}
        </div>
      </dialog>
    </>
  );
}

function VerifyResult({ v }: { v: Extract<VerifyState, { kind: "done" }> }) {
  const stateCheck: Check = {
    match: { label: "Registry state matches", ok: true, detail: "pass, evidence hash and timestamp are identical" },
    mismatch: { label: "Registry state differs", ok: false, detail: v.state.diffs.map(d => `${d.field}: shown ${short(d.server)}, chain ${short(d.chain)}`).join("; ") },
    superseded: { label: "A newer result is on-chain", ok: false, detail: "The registry has a later result for this control. Refresh the page." },
    missing: { label: "No result in the registry", ok: false, detail: "getResult returned an empty record." },
  }[v.state.status];
  const checks = [stateCheck, ...v.checks];
  return (
    <ul className="mt-3 space-y-2">
      {checks.map(c => (
        <li key={c.label} className="flex gap-2 text-sm">
          {c.ok ? <SealCheck aria-hidden weight="fill" className="mt-0.5 size-4 shrink-0 text-pass" /> : <SealWarning aria-hidden weight="fill" className="mt-0.5 size-4 shrink-0 text-fail" />}
          <span>
            <span className={`font-medium ${c.ok ? "text-pass" : "text-fail"}`}>{c.label}.</span>{" "}
            <span className="text-ink-2">{c.detail}</span>
          </span>
        </li>
      ))}
      <li className="text-xs text-ink-3">Read at Sepolia block {v.block.toString()}.</li>
    </ul>
  );
}
