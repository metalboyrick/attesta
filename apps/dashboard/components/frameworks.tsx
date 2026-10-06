export function FrameworkIds({ soc2, iso }: { soc2: string[]; iso: string[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-ink-3">
      {soc2.length > 0 && (
        <span>
          <abbr title="SOC 2 Trust Services Criteria" className="no-underline">TSC</abbr> {soc2.join(", ")}
        </span>
      )}
      {iso.length > 0 && <span>42001 {iso.join(", ")}</span>}
    </div>
  );
}
