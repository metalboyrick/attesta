"use client";

import { ArrowUpRight, LockSimple } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import type { SafetyScore } from "@/lib/score";

const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;

/**
 * Score plus a disclosure listing every registry result behind it, each with
 * its Sepolia tx, so the number can be traced to chain data.
 */
export function SafetyScoreBadge({
  s,
  frozen,
  synthetic,
  size = "md",
}: {
  s: SafetyScore;
  frozen: boolean;
  synthetic: boolean;
  size?: "md" | "lg";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const tone = s.score === null ? "text-ink-3" : s.score === 100 ? "text-pass" : "text-fail";
  return (
    <div ref={ref} className="relative z-10 inline-flex items-center gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(o => !o)}
        className={`tnum inline-flex items-baseline gap-1.5 rounded-md px-1.5 py-0.5 font-semibold tracking-tight underline decoration-dotted decoration-rule-strong underline-offset-4 hover:bg-sunken ${tone} ${size === "lg" ? "text-2xl" : "text-base"}`}
      >
        <span className="sr-only">Safety score </span>
        {s.score === null ? "Not tested" : (
          <>
            <span className="text-ink-2 font-medium">{s.passed}/{s.tested}</span>
            <span aria-hidden className="text-ink-3">·</span>
            {s.score}
          </>
        )}
      </button>
      {frozen && (
        <span className="inline-flex h-6 items-center gap-1 rounded-full bg-frozen-bg px-2 text-xs font-medium text-frozen-fg">
          <LockSimple aria-hidden weight="bold" className="size-3" /> Frozen
        </span>
      )}
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Results behind this score"
          className="absolute left-0 top-full mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-rule-strong bg-surface p-3 text-left text-sm font-normal shadow-[0_8px_30px_-12px_color-mix(in_oklab,var(--ink)_35%,transparent)]"
        >
          <p className="text-xs text-ink-3">Latest registry result per tested control</p>
          {s.basis.length === 0 ? (
            <p className="mt-2 text-ink-2">No control has a result yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-rule">
              {s.basis.map(b => (
                <li key={b.controlId} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="font-mono text-xs">{b.controlId}</span>
                  <span className={`text-xs font-medium ${b.pass ? "text-pass" : "text-fail"}`}>{b.pass ? "Pass" : "Fail"}</span>
                  {synthetic || !b.txHash ? (
                    <span className="font-mono text-xs text-ink-3">{b.txHash ? `${short(b.txHash)} synthetic` : "–"}</span>
                  ) : (
                    <a
                      href={`https://sepolia.etherscan.io/tx/${b.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-xs text-accent hover:underline"
                    >
                      {short(b.txHash)}
                      <ArrowUpRight aria-hidden className="size-3" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
