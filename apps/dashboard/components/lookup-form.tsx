import { MagnifyingGlass } from "@phosphor-icons/react/ssr";

/** Plain GET form so lookup works without JavaScript and results are linkable. */
export function LookupForm({ defaultValue = "", autoFocus = false }: { defaultValue?: string; autoFocus?: boolean }) {
  return (
    <form action="/lookup" method="get" role="search" className="flex max-w-xl flex-col gap-2">
      <label htmlFor="agent-id" className="text-sm font-medium">
        Check any agent
      </label>
      <div className="flex gap-2">
        <input
          id="agent-id"
          name="id"
          defaultValue={defaultValue}
          autoFocus={autoFocus}
          required
          maxLength={66}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          placeholder="attesta-demo-agent-2"
          aria-describedby="agent-id-help"
          className="h-11 min-w-0 flex-1 rounded-full border border-rule-strong bg-surface px-4 font-mono text-sm text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none"
        />
        <button type="submit" className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-bg hover:opacity-90 active:translate-y-px">
          <MagnifyingGlass aria-hidden weight="bold" className="size-4" />
          Look up
        </button>
      </div>
      <p id="agent-id-help" className="text-xs text-ink-3">
        An agent label (hashed with keccak256) or a raw 0x bytes32 id. Reads the Sepolia registry directly.
      </p>
    </form>
  );
}
