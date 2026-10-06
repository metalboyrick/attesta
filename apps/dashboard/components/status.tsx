import { LockSimple } from "@phosphor-icons/react/ssr";
import type { AgentStatus } from "@/lib/types";

const LABEL: Record<AgentStatus, string> = {
  compliant: "Compliant",
  failing: "Failing",
  frozen: "Frozen",
  unknown: "No results",
};

export function StatusPill({ status, size = "md" }: { status: AgentStatus; size?: "md" | "lg" }) {
  const pad = size === "lg" ? "h-8 px-3 text-sm" : "h-6 px-2.5 text-xs";
  const tone = {
    compliant: "bg-pass-wash text-pass",
    failing: "bg-fail-wash text-fail",
    frozen: "bg-frozen-bg text-frozen-fg",
    unknown: "bg-sunken text-ink-3",
  }[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium ${pad} ${tone}`}>
      {status === "frozen" ? (
        <LockSimple weight="bold" aria-hidden className="size-3.5" />
      ) : (
        <span aria-hidden className="size-1.5 rounded-full bg-current" />
      )}
      {LABEL[status]}
    </span>
  );
}

export function PassMark({ pass, implemented = true }: { pass: boolean | undefined; implemented?: boolean }) {
  if (pass === undefined) return <span className="text-sm whitespace-nowrap text-ink-3">{implemented ? "No result yet" : "Not built yet"}</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${pass ? "text-pass" : "text-fail"}`}>
      <span aria-hidden className={`size-2 rounded-[2px] ${pass ? "bg-pass" : "bg-fail"}`} />
      {pass ? "Pass" : "Fail"}
    </span>
  );
}
