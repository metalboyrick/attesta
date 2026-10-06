// Register the fixed demo agent (once), sync cap/allowlist, top up the vault.
// Usage: pnpm register
import { AGENT_ID, PAYEES, explorer, fail, setup } from "./common.ts";

const g = setup();
const sigs = await g.ensureRegistered().catch(fail);
const p = await g.program.account.agentPolicy.fetch(g.policy);
console.log(JSON.stringify({
  agentId: AGENT_ID,
  agent: g.agent.publicKey.toBase58(),
  policy: g.policy.toBase58(),
  vault: g.vault.toBase58(),
  vaultLamports: await g.connection.getBalance(g.vault),
  frozen: p.frozen,
  dailyCap: p.dailyCap.toString(),
  spentToday: p.spentToday.toString(),
  allowlist: p.allowlist.map(k => k.toBase58()),
  payees: Object.fromEntries(Object.entries(PAYEES).map(([k, v]) => [k, v.toBase58()])),
}, null, 2));
for (const [k, s] of Object.entries(sigs)) console.log(k, explorer(s));
