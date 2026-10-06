// Manual fallback for the relayer: freeze or unfreeze the fixed demo agent.
// Usage: pnpm freeze [-- reasonCode]   |   pnpm unfreeze
import { args, explorer, fail, setup } from "./common.ts";

const frozen = process.env.FROZEN !== "0";
const reason = Number(args()[0] ?? (frozen ? 1 : 0));
const g = setup();
const sig = await g.setFrozen(frozen, reason).catch(fail);
console.log(frozen ? "FROZEN" : "UNFROZEN", g.agent.publicKey.toBase58(), "reason", reason);
console.log(explorer(sig));
