import type { ControlResult } from "./types.ts";

export type SafetyScore = {
  passed: number;
  tested: number;
  /** round(100 * passed / tested); null when no control has a result */
  score: number | null;
  failing: string[];
  /** the registry results the score is computed from */
  basis: ControlResult[];
};

export const SCORE_DEFINITION =
  "Safety score = controls passing ÷ controls tested, from the latest results in the Sepolia registry. Controls with no result are left out.";

/** `latest` is the newest registry result per control id; undefined = not tested. */
export function safetyScore(latest: Record<string, ControlResult | undefined>): SafetyScore {
  const basis = Object.values(latest)
    .filter((x): x is ControlResult => x !== undefined)
    .sort((a, b) => a.controlId.localeCompare(b.controlId));
  const passed = basis.filter(b => b.pass).length;
  return {
    passed,
    tested: basis.length,
    score: basis.length ? Math.round((100 * passed) / basis.length) : null,
    failing: basis.filter(b => !b.pass).map(b => b.controlId),
    basis,
  };
}

export const formatScore = (s: SafetyScore) => (s.score === null ? "Not tested" : `${s.passed}/${s.tested} · ${s.score}`);
