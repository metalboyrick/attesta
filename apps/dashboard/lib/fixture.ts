import { keccak256, stringToHex } from "viem";
import { AGENTS } from "./agents";
import type { ControlDef, ControlResult, TimelineEvent } from "./types";

/**
 * Deterministic demo data. Runs land on the same 5-minute cron as the CRE
 * workflow, so the fixture keeps moving while the page is open. Every hash
 * here is synthetic and its explorer link will not resolve.
 */
const SLOT = 300;
const RUNS = 12;
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const h = (s: string) => keccak256(stringToHex(s));

function base58(hex: string, len: number): string {
  let n = BigInt(hex);
  let out = "";
  while (out.length < len) {
    out += B58[Number(n % 58n)];
    n = n / 58n || BigInt(h(out));
  }
  return out;
}

// Story: EVM stays clean, Solana breaches its spend cap and the guard freezes
// it, Cardano trips the counterparty control on the latest run.
function passes(agent: string, control: string, runsAgo: number): boolean {
  if (agent === "solana" && control === "ATT-SPEND-01") return runsAgo > 3;
  if (agent === "cardano" && control === "ATT-CPTY-02") return runsAgo > 0;
  return true;
}

export function fixtureData(controls: ControlDef[], now = Math.floor(Date.now() / 1000)) {
  const current = Math.floor(now / SLOT);
  const results: ControlResult[] = [];
  const events: TimelineEvent[] = [];

  for (let runsAgo = RUNS - 1; runsAgo >= 0; runsAgo--) {
    const slot = current - runsAgo;
    AGENTS.forEach((agent, ai) => {
      const ts = slot * SLOT + 7 + ai * 11;
      // Only controls the workflow actually runs get results, same as live.
      controls.filter(c => c.implemented).forEach(control => {
        const pass = passes(agent.slug, control.id, runsAgo);
        const r: ControlResult = {
          controlId: control.id,
          agentSlug: agent.slug,
          pass,
          evidenceHash: h(`evidence:${agent.slug}:${control.id}:${slot}`),
          ts,
          txHash: h(`tx:${agent.slug}:${control.id}:${slot}`),
          chain: "sepolia",
        };
        results.push(r);
        events.push({ kind: "control", ts, agentSlug: agent.slug, chain: "sepolia", txHash: r.txHash, controlId: control.id, pass });
      });
    });

    if (runsAgo === 3) {
      events.push({
        kind: "freeze",
        ts: slot * SLOT + 52,
        agentSlug: "solana",
        chain: "solana-devnet",
        txHash: base58(h(`freeze:${slot}`), 88),
        reasonCode: 1,
      });
    }
    if (runsAgo % 3 === 1) {
      const target = AGENTS[(slot % AGENTS.length + AGENTS.length) % AGENTS.length];
      events.push({
        kind: "purchase",
        ts: slot * SLOT + 140,
        agentSlug: target.slug,
        chain: "cardano-preprod",
        txHash: h(`purchase:${slot}`).slice(2),
      });
    }
  }

  return { results, events, frozen: { solana: true } as Record<string, boolean> };
}
