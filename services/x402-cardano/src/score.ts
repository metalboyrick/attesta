/**
 * Agent Safety Score: the share of tested controls whose latest result
 * passes. Only controls with a recorded result count; untested ones are not
 * in the registry's list and are excluded. With nothing tested there is no
 * score (null), which is different from a score of 0.
 *
 * The score is shown next to the verdict. The verdict itself still follows
 * the registry's `compliant` flag.
 */
export type SafetyScore = { passing: number; tested: number; score0to100: number | null };

type ControlResult = { id: string; pass: boolean };

export function safetyScore(controls: readonly ControlResult[]): SafetyScore {
  const tested = controls.length;
  const passing = controls.filter(c => c.pass).length;
  return { passing, tested, score0to100: tested ? Math.round((100 * passing) / tested) : null };
}

/** e.g. `DECLINE ATT-CPTY-02 · safety 2/3 (67)` or `DEAL · safety 2/2 (100)`. */
export function verdictLine(a: { compliant: boolean; controls: readonly ControlResult[] }): string {
  const s = safetyScore(a.controls);
  const failing = a.controls.filter(c => !c.pass).map(c => c.id);
  const verdict = a.compliant ? "DEAL" : `DECLINE ${failing.join(" ") || "NO-CONTROLS"}`;
  return `${verdict} · safety ${s.passing}/${s.tested} (${s.score0to100 ?? "n/a"})`;
}
