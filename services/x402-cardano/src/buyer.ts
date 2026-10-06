/**
 * Buyer: a counterparty agent that pays for an Attesta check via x402 on
 * Cardano preprod before transacting.
 *
 * Flow: GET /attest/:agentId → 402 with payment requirements → build and sign
 * a Cardano transaction with the Evolution SDK signer (this wallet pays the
 * amount and the network fee) → retry with PAYMENT-SIGNATURE → facilitator
 * verifies and settles → 200 with the attestation and a PAYMENT-RESPONSE receipt.
 * The counterparty then decides: DEAL when the agent is compliant, DECLINE
 * otherwise (exit code 0 for DEAL, 2 for DECLINE, 1 for errors).
 *
 * Every request carries a buyer nonce (?nonce=). The seller binds the payment
 * to (agentId, nonce): rerunning with the same BUYER_NONCE returns the same
 * receipt without paying again, and while that payment is still settling the
 * seller answers 409 and the buyer waits instead of signing a second one.
 *
 * Usage: [BUYER_NONCE=...] npm run buyer -- [agentId]
 */
import { randomUUID } from "node:crypto";
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { toClientCardanoSigner, USDM_PREPROD_ASSET } from "@x402/cardano";
import { ExactCardanoScheme } from "@x402/cardano/exact/client";
import { NETWORK, provider } from "./env.js";
import type { Attestation } from "./attestation.js";
import { TUSDM_MASUMI_UNIT } from "./pricing.js";
import { verdictLine } from "./score.js";

if (!process.env.MNEMONIC) {
  console.error("MNEMONIC not found; run `npm run wallet` to create ~/.attesta-secrets/cardano-preprod.env");
  process.exit(1);
}
const mnemonic: string = process.env.MNEMONIC;

const agentId = process.argv[2] ?? "agent-demo-001";
const nonce = process.env.BUYER_NONCE ?? randomUUID();
const url = `${process.env.SELLER_URL ?? "http://localhost:4021"}/attest/${encodeURIComponent(agentId)}?nonce=${encodeURIComponent(nonce)}`;
const SETTLE_WAIT_MS = 180_000;

async function main() {
  // Neither tADA nor either preprod tUSDM is in the default USD spend table,
  // so allow them explicitly: at most 2 tADA or 2 tUSDM per payment.
  const client = new x402Client().setSpendControls({
    allowedAssets: [
      { network: "cardano:*", asset: "lovelace", maxAmountPerPayment: "2000000" },
      { network: "cardano:*", asset: TUSDM_MASUMI_UNIT, maxAmountPerPayment: "2000000" },
      { network: "cardano:*", asset: USDM_PREPROD_ASSET, maxAmountPerPayment: "2000000" },
    ],
  });

  const signer = toClientCardanoSigner({ mnemonic, network: NETWORK, provider: provider() });
  client.register("cardano:*", new ExactCardanoScheme(signer));
  console.log(`Buyer wallet: ${signer.getAddress()}`);

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  console.log(`Nonce: ${nonce}  (rerun with BUYER_NONCE=${nonce} to replay without paying)`);
  console.log(`Requesting ${url} ...`);
  const started = Date.now();
  let response = await fetchWithPayment(url, { method: "GET" });
  // 409: this nonce's payment is still settling. Wait for it; never pay twice.
  while (response.status === 409 && Date.now() - started < SETTLE_WAIT_MS) {
    const wait = Number(response.headers.get("retry-after") ?? 15) * 1000;
    console.log(`Payment for this nonce is still settling; checking again in ${wait / 1000}s`);
    await new Promise(r => setTimeout(r, wait));
    response = await fetchWithPayment(url, { method: "GET" });
  }
  if (response.headers.get("x-attesta-replay")) console.log("Replayed stored receipt: no new payment");
  console.log(`\nHTTP ${response.status} after ${((Date.now() - started) / 1000).toFixed(1)}s`);

  if (!response.ok) {
    const required = response.headers.get("payment-required");
    if (required) console.error("PAYMENT-REQUIRED:", Buffer.from(required, "base64").toString());
    console.error(`Payment failed: HTTP ${response.status}`);
    process.exit(1);
  }

  const attestation = (await response.json()) as Attestation;
  console.log("Attestation:", JSON.stringify(attestation, null, 2));

  const receipt = new x402HTTPClient(client).getPaymentSettleResponse(name =>
    response.headers.get(name),
  );
  console.log("\nPayment receipt:", JSON.stringify(receipt, null, 2));
  if (receipt?.transaction) {
    console.log(`\nExplorer: https://preprod.cardanoscan.io/transaction/${receipt.transaction}`);
  }

  const failing = attestation.controls.filter(c => !c.pass).map(c => c.id);
  // Short verdict first, bold and coloured on a terminal, for the stage demo.
  // The verdict follows `compliant`; the safety score is shown beside it.
  const banner = (text: string, color: number) =>
    process.stdout.isTTY ? `\x1b[1;${color}m${text}\x1b[0m` : text;
  console.log(`\n${banner(verdictLine(attestation), attestation.compliant ? 32 : 31)}`);
  if (attestation.compliant) {
    console.log(`${agentId} is compliant (${attestation.controls.length} controls, source ${attestation.source})`);
  } else {
    const why = failing.length ? `failing ${failing.join(", ")}` : "no recorded controls";
    console.log(`${agentId} is not compliant (${why}, source ${attestation.source})`);
    process.exitCode = 2;
  }
}

main().catch(error => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});
