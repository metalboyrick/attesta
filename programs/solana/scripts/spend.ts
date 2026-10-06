// Spend from the fixed demo agent's vault through the guard.
// Usage: pnpm spend -- [allowlisted|unknown|<pubkey>] [lamports]
//   defaults: allowlisted, 1_000_000 (0.001 SOL)
import { args, explorer, fail, resolveRecipient, setup } from "./common.ts";

const [to, amount] = args();
const recipient = resolveRecipient(to);
const lamports = Number(amount ?? 1_000_000);
const g = setup();
const { sig, error } = await g.spend(recipient, lamports).catch(fail);
console.log(error ? `REJECTED ${error}` : "OK", lamports, "lamports ->", recipient.toBase58());
console.log(explorer(sig));
process.exit(error ? 2 : 0);
