/**
 * Solana spend collector. Reads attesta_guard SpendEvent logs for one agent
 * and emits normalized SpendRecords (services/shared/spend-record.ts).
 *
 * Source of truth is the guard's own event, not raw lamport deltas: every
 * successful `spend` emits exactly one SpendEvent (agent, recipient, amount).
 * Failed transactions (e.g. AgentFrozen) emit nothing and are skipped.
 *
 * Usage: npm run collect -- [agentId] [solanaAgentPubkey] [sinceUnixSeconds]
 * Defaults: AGENT_ID / SOLANA_AGENT env, agentId "attesta-demo-agent-2".
 */
import "dotenv/config";
import { pathToFileURL } from "node:url";
import { Connection, PublicKey } from "@solana/web3.js";
import type { SpendRecord } from "../../shared/spend-record.ts";
import { guardEventParser, policyPda } from "./guard.ts";

const CHAIN = process.env.SOLANA_CHAIN ?? "solana:devnet";

export async function collectSolanaSpends(
  connection: Connection,
  agentId: string,
  agent: PublicKey,
  since = 0,
): Promise<SpendRecord[]> {
  // Every spend writes the policy PDA, so its signature list covers all spends.
  const sigs = await connection.getSignaturesForAddress(policyPda(agent), { limit: 1000 }, "confirmed");
  const parser = guardEventParser();
  const records: SpendRecord[] = [];
  for (const s of sigs) {
    if (s.err || (s.blockTime ?? 0) < since) continue;
    const tx = await connection.getTransaction(s.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx?.meta || tx.meta.err) continue;
    for (const ev of parser.parseLogs(tx.meta.logMessages ?? [])) {
      if (ev.name !== "SpendEvent" && ev.name !== "spendEvent") continue;
      const d = ev.data as { agent: PublicKey; recipient: PublicKey; amount: { toString(): string }; ts: { toString(): string } };
      if (!d.agent.equals(agent)) continue;
      records.push({
        agentId,
        chain: CHAIN,
        txHash: s.signature,
        to: d.recipient.toBase58(),
        amount: d.amount.toString(),
        asset: "native",
        ts: tx.blockTime ?? Number(d.ts.toString()),
      });
    }
  }
  return records.sort((a, b) => b.ts - a.ts);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [agentIdArg, agentArg, sinceArg] = process.argv.slice(2);
  const agentId = agentIdArg ?? process.env.AGENT_ID ?? "attesta-demo-agent-2";
  const agent = agentArg ?? process.env.SOLANA_AGENT;
  if (!agent) {
    console.error("Pass a Solana agent pubkey or set SOLANA_AGENT");
    process.exit(1);
  }
  const connection = new Connection(process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
  const records = await collectSolanaSpends(connection, agentId, new PublicKey(agent), Number(sinceArg ?? 0));
  console.log(JSON.stringify(records, null, 2));
}
