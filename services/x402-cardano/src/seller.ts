/**
 * Seller: Attesta's paid compliance check, `GET /attest/:agentId`, charged
 * per request via x402 on Cardano preprod.
 *
 * Unpaid requests get HTTP 402 with payment requirements; paid retries are
 * verified and settled through the facilitator at FACILITATOR_URL. This
 * process holds no keys and never touches the chain.
 */
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactCardanoScheme } from "@x402/cardano/exact/server";
import { NETWORK } from "./env.js";
import { attestationFor, attestationSource } from "./attestation.js";
import { price, priceLabel } from "./pricing.js";
import { registerReceiptHooks, replayMiddleware } from "./receipts.js";

const payTo = process.env.SELLER_ADDRESS;
const facilitatorUrl =
  process.env.FACILITATOR_URL ?? "https://x402.preprod.dev.ecosyseng.cf-deployments.org";
if (!payTo?.startsWith("addr_test1")) {
  console.error("Set SELLER_ADDRESS to a preprod address (addr_test1...); run `npm run wallet`");
  process.exit(1);
}

// The local facilitator on Koios can only prove block inclusion, so it needs
// L1_CONFIRMATIONS=0; unset keeps the spec default of 1 (hosted facilitator).
const l1Confirmations = process.env.L1_CONFIRMATIONS;
const extra =
  l1Confirmations === undefined
    ? undefined
    : { confirmationPolicy: { l1Confirmations: Number(l1Confirmations) } };

const resourceServer = new x402ResourceServer(new HTTPFacilitatorClient({ url: facilitatorUrl }));
resourceServer.register(NETWORK, new ExactCardanoScheme());
registerReceiptHooks(resourceServer);

const app = express();
// Behind a TLS proxy (Caddy, Cloudflare tunnel) so the 402's resource URL
// says https, not the proxy hop's http.
if (process.env.TRUST_PROXY) app.set("trust proxy", true);

// Retries with an already-paid ?nonce= are answered here, before x402 asks
// for another payment.
app.use(replayMiddleware);

app.use(
  paymentMiddleware(
    {
      "GET /attest/:agentId": {
        accepts: [
          {
            scheme: "exact",
            network: NETWORK,
            price,
            payTo,
            ...(extra && { extra }),
          },
        ],
        description: "Attesta compliance attestation for one AI agent",
        mimeType: "application/json",
      },
    },
    resourceServer,
  ),
);

app.get("/attest/:agentId", async (req, res) => {
  try {
    res.json(await attestationFor(req.params.agentId));
  } catch (error) {
    // A failed response is not settled, so the buyer is not charged.
    console.error("[attest] registry read failed:", error);
    res.status(502).json({ error: "attestation source unavailable" });
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, network: NETWORK });
});

const port = Number(process.env.SELLER_PORT ?? 4021);
app.listen(port, () => {
  console.log(`Seller listening on http://localhost:${port}`);
  console.log(`Paid route: GET /attest/:agentId (${priceLabel} on ${NETWORK})`);
  console.log(`Facilitator: ${facilitatorUrl}`);
  console.log(`Attestation source: ${attestationSource}`);
  if (extra) console.log(`l1Confirmations: ${extra.confirmationPolicy.l1Confirmations}`);
});
