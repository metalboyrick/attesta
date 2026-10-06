import { ArrowUpRight } from "@phosphor-icons/react/ssr";
import { CHAIN_LABEL, txUrl } from "@/lib/explorers";
import type { Chain } from "@/lib/types";

export const short = (s: string, head = 6, tail = 4) => (s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`);

export function TxLink({ chain, tx, label, synthetic }: { chain: Chain; tx: string; label?: string; synthetic?: boolean }) {
  // Fixture hashes never render as explorer links, so they cannot pass as real transactions.
  if (synthetic) {
    return (
      <span title="Synthetic fixture hash, not an on-chain transaction" className="inline-flex items-center gap-1.5 font-mono text-xs text-ink-3">
        {label ?? short(tx, tx.startsWith("0x") ? 6 : 5)}
        <span className="rounded-sm border border-rule-strong px-1 font-sans text-[10px] leading-4">synthetic</span>
      </span>
    );
  }
  return (
    <a
      href={txUrl(chain, tx)}
      target="_blank"
      rel="noreferrer"
      title={`${CHAIN_LABEL[chain]} transaction ${tx}`}
      className="group inline-flex items-center gap-1 font-mono text-xs text-accent underline-offset-4 hover:underline"
    >
      {label ?? short(tx, tx.startsWith("0x") ? 6 : 5)}
      <ArrowUpRight aria-hidden className="size-3 transition-transform duration-150 ease-out group-hover:-translate-y-px group-hover:translate-x-px" />
      <span className="sr-only">(opens {CHAIN_LABEL[chain]} explorer)</span>
    </a>
  );
}

export function ChainTag({ chain }: { chain: Chain }) {
  return <span className="text-xs text-ink-3">{CHAIN_LABEL[chain]}</span>;
}
