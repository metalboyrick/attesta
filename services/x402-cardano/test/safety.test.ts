/**
 * Agent Safety Score: passing / tested over the controls the registry
 * returned. Untested controls are never in that list, so they're excluded.
 * The verdict still follows `compliant`, not the score.
 *
 * Run: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { safetyScore, verdictLine } from "../src/score.js";

const c = (id: string, pass: boolean) => ({ id, pass, evidenceHash: "0x00", ts: 1 });

test("2 of 3 passing scores 67", () => {
  assert.deepEqual(safetyScore([c("A", true), c("B", false), c("C", true)]), { passing: 2, tested: 3, score0to100: 67 });
});

test("all passing scores 100, none passing scores 0", () => {
  assert.deepEqual(safetyScore([c("A", true), c("B", true)]), { passing: 2, tested: 2, score0to100: 100 });
  assert.deepEqual(safetyScore([c("A", false)]), { passing: 0, tested: 1, score0to100: 0 });
});

test("nothing tested gives no score, not zero", () => {
  assert.deepEqual(safetyScore([]), { passing: 0, tested: 0, score0to100: null });
});

test("verdict line follows compliant and appends the score", () => {
  const failing = { compliant: false, controls: [c("ATT-SPEND-01", true), c("ATT-CPTY-02", false), c("ATT-KEY-03", true)] };
  assert.equal(verdictLine(failing), "DECLINE ATT-CPTY-02 · safety 2/3 (67)");
  const ok = { compliant: true, controls: [c("ATT-SPEND-01", true), c("ATT-CPTY-02", true)] };
  assert.equal(verdictLine(ok), "DEAL · safety 2/2 (100)");
  assert.equal(verdictLine({ compliant: false, controls: [] }), "DECLINE NO-CONTROLS · safety 0/0 (n/a)");
});
