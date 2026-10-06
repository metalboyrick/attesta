/**
 * Buyer: a counterparty agent that pays for an Attesta check via x402 on
 * Cardano preprod before transacting.
 *
 * Flow: GET /attest/:agentId → 402 with payment requirements → build and sign
 * a Cardano transaction with the Evolution SDK signer (this wallet pays the
 * amount and the network fee) → retry with PAYMENT-SIGNATURE → facilitator
 * verifies and settles → 200 with the attestation and a PAYMENT-RESPONSE receipt.
 *
 * Usage: npm run buyer -- [agentId]
 */
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { toClientCardanoSigner } from "@x402/cardano";
import { ExactCardanoScheme } from "@x402/cardano/exact/client";
import { NETWORK, provider } from "./env.js";

if (!process.env.MNEMONIC) {
  console.error("MNEMONIC not found; run `npm run wallet` to create ~/.attesta-secrets/cardano-preprod.env");
  process.exit(1);
}
const mnemonic: string = process.env.MNEMONIC;

const agentId = process.argv[2] ?? "agent-demo-001";
const url = `${process.env.SELLER_URL ?? "http://localhost:4021"}/attest/${encodeURIComponent(agentId)}`;

async function main() {
  // lovelace is not USD-pegged, so the default spend controls would reject
  // it; allow it explicitly, capped at 2 tADA per payment.
  const client = new x402Client().setSpendControls({
    allowedAssets: [{ network: "cardano:*", asset: "lovelace", maxAmountPerPayment: "2000000" }],
  });

  const signer = toClientCardanoSigner({ mnemonic, network: NETWORK, provider: provider() });
  client.register("cardano:*", new ExactCardanoScheme(signer));
  console.log(`Buyer wallet: ${signer.getAddress()}`);

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  console.log(`Requesting ${url} ...`);
  const started = Date.now();
  const response = await fetchWithPayment(url, { method: "GET" });
  console.log(`\nHTTP ${response.status} after ${((Date.now() - started) / 1000).toFixed(1)}s`);

  if (!response.ok) {
    const required = response.headers.get("payment-required");
    if (required) console.error("PAYMENT-REQUIRED:", Buffer.from(required, "base64").toString());
    console.error(`Payment failed: HTTP ${response.status}`);
    process.exit(1);
  }

  console.log("Body:", JSON.stringify(await response.json(), null, 2));

  const receipt = new x402HTTPClient(client).getPaymentSettleResponse(name =>
    response.headers.get(name),
  );
  console.log("\nPayment receipt:", JSON.stringify(receipt, null, 2));
  if (receipt?.transaction) {
    console.log(`\nExplorer: https://preprod.cardanoscan.io/transaction/${receipt.transaction}`);
  }
}

main().catch(error => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});
