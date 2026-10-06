import { isHex, keccak256, stringToHex, type Hex } from "viem";

export type AgentInput = { ok: true; label: string | null; key: Hex } | { ok: false; reason: string };

/** A label hashes to keccak256(utf8), as workflows/cre id32 does; a raw 0x bytes32 passes through. */
export function parseAgentInput(raw: string): AgentInput {
  const s = raw.trim();
  if (!s) return { ok: false, reason: "Enter an agent id." };
  if (s.startsWith("0x")) {
    return isHex(s) && s.length === 66
      ? { ok: true, label: null, key: s.toLowerCase() as Hex }
      : { ok: false, reason: "A hex id must be 32 bytes: 0x plus 64 hex characters." };
  }
  if (s.length > 64) return { ok: false, reason: "Agent ids are at most 64 characters." };
  return { ok: true, label: s, key: keccak256(stringToHex(s)) };
}

export type ResultView = { pass: boolean; evidenceHash: string; ts: number };
export type Comparison = {
  status: "match" | "mismatch" | "superseded" | "missing";
  diffs: { field: keyof ResultView; server: string; chain: string }[];
};

/** Compares what the dashboard showed with a fresh registry read. */
export function compareResult(server: ResultView, chain: ResultView): Comparison {
  if (chain.ts === 0) return { status: "missing", diffs: [] };
  if (chain.ts > server.ts) return { status: "superseded", diffs: [] };
  const diffs: Comparison["diffs"] = [];
  if (server.pass !== chain.pass) diffs.push({ field: "pass", server: String(server.pass), chain: String(chain.pass) });
  if (server.evidenceHash.toLowerCase() !== chain.evidenceHash.toLowerCase())
    diffs.push({ field: "evidenceHash", server: server.evidenceHash, chain: chain.evidenceHash });
  if (server.ts !== chain.ts) diffs.push({ field: "ts", server: String(server.ts), chain: String(chain.ts) });
  return { status: diffs.length ? "mismatch" : "match", diffs };
}
