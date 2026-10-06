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
import { attestationFor } from "./attestation.js";

const payTo = process.env.SELLER_ADDRESS;
const facilitatorUrl =
  process.env.FACILITATOR_URL ?? "https://x402.preprod.dev.ecosyseng.cf-deployments.org";
if (!payTo?.startsWith("addr_test1")) {
  console.error("Set SELLER_ADDRESS to a preprod address (addr_test1...); run `npm run wallet`");
  process.exit(1);
}

const PRICE_LOVELACE = process.env.PRICE_LOVELACE ?? "1000000"; // 1 tADA, clears min-UTxO

const resourceServer = new x402ResourceServer(new HTTPFacilitatorClient({ url: facilitatorUrl }));
resourceServer.register(NETWORK, new ExactCardanoScheme());

const app = express();

app.use(
  paymentMiddleware(
    {
      "GET /attest/:agentId": {
        accepts: [
          {
            scheme: "exact",
            network: NETWORK,
            price: { amount: PRICE_LOVELACE, asset: "lovelace" },
            payTo,
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
  res.json(await attestationFor(req.params.agentId));
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, network: NETWORK });
});

const port = Number(process.env.SELLER_PORT ?? 4021);
app.listen(port, () => {
  console.log(`Seller listening on http://localhost:${port}`);
  console.log(`Paid route: GET /attest/:agentId (${Number(PRICE_LOVELACE) / 1_000_000} tADA on ${NETWORK})`);
  console.log(`Facilitator: ${facilitatorUrl}`);
});
