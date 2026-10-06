/**
 * Cardano spend collector for a monitored agent wallet. Reads the wallet's
 * transactions from Koios and emits normalized SpendRecords
 * (services/shared/spend-record.ts).
 *
 * A transaction counts as spend when one of its inputs carries the agent's
 * payment credential. Every output to another credential becomes one record
 * per asset; outputs back to the agent's credential are change (whatever the
 * stake part) and are skipped. Fees are not recorded. This matches the
 * agent-3 evaluator in workflows/cre/control-eval.
 *
 * Usage: npm run collect -- [agentId] [address] [sinceUnixSeconds]
 * Defaults: AGENT_ID / AGENT_ADDRESS env, else the buyer wallet.
 */
import { pathToFileURL } from "node:url";
import type { SpendRecord } from "../../shared/spend-record.js";
import "./env.js";

type KoiosAsset = { policy_id: string; asset_name: string | null; quantity: string };
type KoiosTxOut = { payment_addr: { bech32: string; cred: string }; value: string; asset_list?: KoiosAsset[] };
type KoiosTx = { tx_hash: string; tx_timestamp: number; inputs: KoiosTxOut[]; outputs: KoiosTxOut[] };

const KOIOS = process.env.KOIOS_BASE_URL ?? "https://preprod.koios.rest/api/v1";
const CHAIN = process.env.CARDANO_CHAIN ?? "cardano:preprod";

async function koios<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${KOIOS}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Koios ${path}: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export async function collectCardanoSpends(
  agentId: string,
  address: string,
  since = 0,
): Promise<SpendRecord[]> {
  const txs = await koios<{ tx_hash: string; block_time: number }[]>(
    `/address_txs?block_time=gte.${since}&order=block_time.desc&limit=200`,
    { _addresses: [address] },
  );
  if (txs.length === 0) return [];

  const records: SpendRecord[] = [];
  let agentCred: string | undefined;
  // tx_info accepts up to 50 hashes per call on the public tier.
  for (let i = 0; i < txs.length; i += 50) {
    const batch = txs.slice(i, i + 50).map(t => t.tx_hash);
    const infos = await koios<KoiosTx[]>("/tx_info", {
      _tx_hashes: batch,
      _inputs: true,
      _assets: true,
    });
    for (const tx of infos) {
      agentCred ??= [...tx.inputs, ...tx.outputs].find(o => o.payment_addr.bech32 === address)
        ?.payment_addr.cred;
      if (!agentCred || !tx.inputs.some(input => input.payment_addr.cred === agentCred)) continue;
      for (const out of tx.outputs) {
        const to = out.payment_addr.bech32;
        if (out.payment_addr.cred === agentCred) continue;
        const base = { agentId, chain: CHAIN, txHash: tx.tx_hash, to, ts: tx.tx_timestamp };
        records.push({ ...base, amount: out.value, asset: "lovelace" });
        for (const a of out.asset_list ?? []) {
          records.push({ ...base, amount: a.quantity, asset: `${a.policy_id}.${a.asset_name ?? ""}` });
        }
      }
    }
  }
  return records.sort((a, b) => b.ts - a.ts);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [agentIdArg, addressArg, sinceArg] = process.argv.slice(2);
  const agentId = agentIdArg ?? process.env.AGENT_ID ?? "attesta-demo-agent-3";
  const address = addressArg ?? process.env.AGENT_ADDRESS ?? process.env.BUYER_ADDRESS;
  if (!address) {
    console.error("Pass an address or set AGENT_ADDRESS");
    process.exit(1);
  }
  const records = await collectCardanoSpends(agentId, address, Number(sinceArg ?? 0));
  console.log(JSON.stringify(records, null, 2));
}
