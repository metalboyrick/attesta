// Unit tests for the relayer core against an in-memory fake chain.
// Run: npm test
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Keypair, type PublicKey } from "@solana/web3.js";
import { keccak256, toHex, type Hex } from "viem";
import { initState, tick, type Config, type Deps, type ResultLog, type State } from "../src/core.ts";

const REGISTRY = "0x00000000000000000000000000000000000000aa";
const idA = "agent-a";
const idB = "agent-b";
const hashA = keccak256(toHex(idA));
const hashB = keccak256(toHex(idB));
const pkA = Keypair.generate().publicKey;
const pkB = Keypair.generate().publicKey;
const CONTROL = keccak256(toHex("ATT-CPTY-02"));

function fakeChain() {
  const logs: ResultLog[] = [];
  const failing = new Map<Hex, bigint>();
  const frozen = new Map<string, boolean>([
    [pkA.toBase58(), false],
    [pkB.toBase58(), false],
  ]);
  const failSet = new Set<string>(); // agents whose setFrozen throws
  const calls: { agent: string; frozen: boolean; memo: string }[] = [];
  const events: { event: string; fields: Record<string, unknown> }[] = [];
  let head = 100n;
  let n = 0;

  const emit = (agentId: Hex, pass: boolean, block: bigint) => {
    n += 1;
    const txHash = `0x${n.toString(16).padStart(64, "0")}` as Hex;
    logs.push({ key: `${txHash}:0`, txHash, blockNumber: block, agentId, controlId: CONTROL, pass });
    failing.set(agentId, (failing.get(agentId) ?? 0n) + (pass ? 0n : 1n));
    if (block > head) head = block;
  };

  const deps: Deps = {
    head: async () => head,
    logs: async (from, to) => logs.filter(l => l.blockNumber >= from && l.blockNumber <= to),
    failingCount: async agentId => failing.get(agentId) ?? 0n,
    frozen: async (agent: PublicKey) => frozen.get(agent.toBase58()) ?? null,
    setFrozen: async (agent, f, _reason, memo) => {
      if (failSet.has(agent.toBase58())) throw new Error(`boom ${agent.toBase58()}`);
      frozen.set(agent.toBase58(), f);
      calls.push({ agent: agent.toBase58(), frozen: f, memo });
      return `sig${calls.length}`;
    },
    log: (event, fields) => events.push({ event, fields }),
  };
  return {
    deps,
    emit,
    frozen,
    failSet,
    calls,
    events,
    setHead: (h: bigint) => (head = h),
  };
}

const cfg = (over: Partial<Config> = {}): Config => ({
  registry: REGISTRY,
  agents: new Map([
    [hashA, { agentId: idA, pubkey: pkA }],
    [hashB, { agentId: idB, pubkey: pkB }],
  ]),
  autoUnfreeze: false,
  confirmations: 0n,
  maxAttempts: 3,
  chunk: 500n,
  ...over,
});

test("start: backfills from deploy block, so a FAIL written while down still freezes", async () => {
  const c = fakeChain();
  c.emit(hashA, false, 10n); // happened before the relayer ever ran
  c.setHead(100n);
  const state = initState(null, REGISTRY, "5");
  assert.equal(state.nextBlock, "5");
  await tick(cfg(), c.deps, state);
  assert.equal(c.frozen.get(pkA.toBase58()), true);
});

test("start: refuses to guess a start block when there is no state and no deploy block", () => {
  assert.throws(() => initState(null, REGISTRY, undefined), /deploy block/i);
});

test("start: state from a different registry is discarded (redeploy -> new address)", () => {
  const old: State = { registry: "0x00000000000000000000000000000000000000bb", nextBlock: "900", seen: ["x:0"], pending: {}, dead: [] };
  const s = initState(old, REGISTRY, "7");
  assert.equal(s.nextBlock, "7");
  assert.deepEqual(s.seen, []);
  const same = initState({ ...old, registry: REGISTRY }, REGISTRY, "7");
  assert.equal(same.nextBlock, "900");
});

test("one bad log does not block later logs; it is retried, then dead-lettered", async () => {
  const c = fakeChain();
  c.failSet.add(pkA.toBase58());
  c.emit(hashA, false, 10n); // will keep failing
  c.emit(hashB, false, 11n); // must still be processed
  const state = initState(null, REGISTRY, "1");
  const conf = cfg();

  await tick(conf, c.deps, state);
  assert.equal(c.frozen.get(pkB.toBase58()), true, "later log for B processed despite A failing");
  assert.equal(Object.keys(state.pending).length, 1);
  assert.ok(BigInt(state.nextBlock) > 11n, "cursor moved past the bad log");

  await tick(conf, c.deps, state);
  await tick(conf, c.deps, state);
  assert.equal(Object.keys(state.pending).length, 0);
  assert.equal(state.dead.length, 1);
  assert.ok(c.events.some(e => e.event === "dead_letter"));

  // Once A's problem is fixed, reconcile still freezes it from failingCount > 0.
  c.failSet.clear();
  await tick(conf, c.deps, state);
  assert.equal(c.frozen.get(pkA.toBase58()), true);
});

test("level-trigger: failingCount > 0 and policy unfrozen -> freeze, even with no new logs", async () => {
  const c = fakeChain();
  c.emit(hashA, false, 10n);
  const state = initState(null, REGISTRY, "50"); // cursor already past the FAIL log
  await tick(cfg(), c.deps, state);
  assert.equal(c.frozen.get(pkA.toBase58()), true);
  assert.match(c.calls[0].memo, /reconcile/);
});

test("waits for confirmations before acting on a log", async () => {
  const c = fakeChain();
  c.emit(hashB, true, 1n);
  c.emit(hashA, false, 100n);
  const state = initState(null, REGISTRY, "1");
  // reconcile off for agent A by making it pass on the registry view: only log path matters here
  const conf = cfg({ confirmations: 3n, reconcile: false });
  await tick(conf, c.deps, state);
  assert.equal(c.frozen.get(pkA.toBase58()), false, "log at head not yet confirmed");
  c.setHead(103n);
  await tick(conf, c.deps, state);
  assert.equal(c.frozen.get(pkA.toBase58()), true);
});

test("idempotent: no second set_frozen once frozen", async () => {
  const c = fakeChain();
  c.emit(hashA, false, 10n);
  const state = initState(null, REGISTRY, "1");
  await tick(cfg(), c.deps, state);
  await tick(cfg(), c.deps, state);
  assert.equal(c.calls.length, 1);
});

test("never unfreezes unless AUTO_UNFREEZE", async () => {
  const c = fakeChain();
  c.frozen.set(pkA.toBase58(), true);
  c.emit(hashA, true, 10n);
  const state = initState(null, REGISTRY, "1");
  await tick(cfg(), c.deps, state);
  assert.equal(c.frozen.get(pkA.toBase58()), true);
});
