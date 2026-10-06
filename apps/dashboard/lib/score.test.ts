import assert from "node:assert/strict";
import { test } from "node:test";
import { formatScore, safetyScore } from "./score.ts";
import type { ControlResult } from "./types.ts";

const r = (controlId: string, pass: boolean, ts = 1, txHash = `0x${controlId}`): ControlResult => ({
  controlId,
  agentSlug: "a",
  pass,
  evidenceHash: "0x",
  ts,
  txHash,
  chain: "sepolia",
});

test("all passing", () => {
  const s = safetyScore({ X: r("X", true), Y: r("Y", true), Z: r("Z", true) });
  assert.deepEqual([s.passed, s.tested, s.score], [3, 3, 100]);
  assert.equal(formatScore(s), "3/3 · 100");
});

test("rounds to nearest integer", () => {
  const s = safetyScore({ X: r("X", true), Y: r("Y", false), Z: r("Z", true) });
  assert.equal(formatScore(s), "2/3 · 67");
  assert.deepEqual(s.failing, ["Y"]);
});

test("untested controls are excluded", () => {
  const s = safetyScore({ X: r("X", true), Y: undefined });
  assert.deepEqual([s.passed, s.tested, s.score], [1, 1, 100]);
});

test("nothing tested gives no score", () => {
  const s = safetyScore({});
  assert.equal(s.score, null);
  assert.equal(formatScore(s), "Not tested");
});

test("basis lists every counted result with its tx", () => {
  const s = safetyScore({ X: r("X", true), Y: r("Y", false) });
  assert.deepEqual(
    s.basis.map(b => [b.controlId, b.pass, b.txHash]),
    [["X", true, "0xX"], ["Y", false, "0xY"]],
  );
});
