// Devnet demo on the fixed agent "attesta-demo-agent-2":
//   ensure registered -> (unfreeze if left frozen) -> spend ok -> set_frozen(true) -> spend rejected (AgentFrozen)
// Leaves the agent frozen. `pnpm unfreeze` resets it.
import { mkdirSync, writeFileSync } from "node:fs";
import { AGENT_ID, PAYEES, explorer, fail, setup } from "./common.ts";

const g = setup();
console.log("program  ", g.program.programId.toBase58());
console.log("agent    ", AGENT_ID, g.agent.publicKey.toBase58());
console.log("authority", g.authority.publicKey.toBase58());
console.log("policy   ", g.policy.toBase58());
console.log("vault    ", g.vault.toBase58());

const sigs: Record<string, string> = await g.ensureRegistered().catch(fail);
for (const [k, s] of Object.entries(sigs)) console.log("0.", k.padEnd(13), explorer(s));

if ((await g.program.account.agentPolicy.fetch(g.policy)).frozen) {
  sigs.unfreeze = await g.setFrozen(false);
  console.log("0. unfreeze     ", explorer(sigs.unfreeze));
}

const ok = await g.spend(PAYEES.allowlisted, 1_000_000);
if (ok.error) fail(`spend should succeed, got ${ok.error}`);
sigs.spendOk = ok.sig;
console.log("1. spend ok     ", explorer(ok.sig));

// reason_code 1 = demo control id from the off-chain evaluator.
sigs.freeze = await g.setFrozen(true, 1);
console.log("2. set_frozen   ", explorer(sigs.freeze));

const rejected = await g.spend(PAYEES.allowlisted, 1_000_000);
sigs.spendRejected = rejected.sig;
console.log("3. spend reject ", explorer(rejected.sig), rejected.error);
if (rejected.error !== "AgentFrozen") fail(`expected AgentFrozen, got ${rejected.error}`);

const out = {
  cluster: "devnet",
  agentId: AGENT_ID,
  program: g.program.programId.toBase58(),
  agent: g.agent.publicKey.toBase58(),
  authority: g.authority.publicKey.toBase58(),
  policy: g.policy.toBase58(),
  vault: g.vault.toBase58(),
  signatures: sigs,
  at: new Date().toISOString(),
};
if (process.env.SOLANA_RPC_URL === undefined || process.env.SOLANA_RPC_URL.includes("devnet")) {
  mkdirSync(new URL("../deployments", import.meta.url), { recursive: true });
  writeFileSync(new URL("../deployments/demo-devnet.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
  console.log("wrote deployments/demo-devnet.json");
}
