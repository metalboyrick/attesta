import { WarningCircle } from "@phosphor-icons/react/ssr";
import type { Snapshot } from "@/lib/types";
import { LiveRefresh } from "./client";

export function SourceBar({ snap }: { snap: Snapshot }) {
  return (
    <div className="mb-8 space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <LiveRefresh generatedAt={snap.generatedAt} />
        <span className="text-xs text-ink-3">
          {snap.mode === "fixture" ? (
            <span className="rounded-sm bg-sunken px-1.5 py-0.5 font-medium text-ink-2">Fixture data</span>
          ) : (
            "Live: Sepolia, Solana devnet, Cardano preprod"
          )}
        </span>
      </div>
      {snap.errors.length > 0 && (
        <div role="status" className="flex gap-2 rounded-md border border-fail/30 bg-fail-wash px-3 py-2 text-sm text-fail">
          <WarningCircle aria-hidden weight="bold" className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Some sources did not answer. Showing what loaded.</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {snap.errors.map(e => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
