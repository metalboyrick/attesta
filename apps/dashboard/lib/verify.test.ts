import assert from "node:assert/strict";
import { test } from "node:test";
import { keccak256, stringToHex } from "viem";
import { compareResult, parseAgentInput } from "./verify.ts";

test("agent label hashes with keccak256, like the CRE workflow", () => {
  const p = parseAgentInput("  attesta-demo-agent-1 ");
  assert.deepEqual(p, { ok: true, label: "attesta-demo-agent-1", key: keccak256(stringToHex("attesta-demo-agent-1")) });
});

test("raw bytes32 passes through, lowercased", () => {
  const raw = "0x" + "AB".repeat(32);
  assert.deepEqual(parseAgentInput(raw), { ok: true, label: null, key: raw.toLowerCase() });
});

test("rejects empty, too long and wrong-length hex", () => {
  assert.equal(parseAgentInput("").ok, false);
  assert.equal(parseAgentInput("x".repeat(65)).ok, false);
  assert.equal(parseAgentInput("0x1234").ok, false);
});

const server = { pass: true, evidenceHash: "0xAA", ts: 100 };

test("match when pass, evidence hash and ts agree (hash case-insensitive)", () => {
  assert.deepEqual(compareResult(server, { pass: true, evidenceHash: "0xaa", ts: 100 }), { status: "match", diffs: [] });
});

test("mismatch lists each differing field", () => {
  const r = compareResult(server, { pass: false, evidenceHash: "0xbb", ts: 100 });
  assert.equal(r.status, "mismatch");
  assert.deepEqual(r.diffs.map(d => d.field), ["pass", "evidenceHash"]);
});

test("newer on-chain result is reported as superseded, not mismatch", () => {
  const r = compareResult(server, { pass: false, evidenceHash: "0xbb", ts: 200 });
  assert.equal(r.status, "superseded");
});

test("ts 0 on chain means the registry has no result", () => {
  assert.equal(compareResult(server, { pass: false, evidenceHash: "0x" + "0".repeat(64), ts: 0 }).status, "missing");
});
