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
import { attestationAvailable, attestationFor, attestationSource } from "./attestation.js";
import { price, priceLabel } from "./pricing.js";
import { registerReceiptHooks, replayMiddleware, safeDecode, setLateBodyProvider } from "./receipts.js";

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
setLateBodyProvider(async agentId => JSON.stringify(await attestationFor(agentId)));

const app = express();
// Behind a TLS proxy (Caddy, Cloudflare tunnel) so the 402's resource URL
// says https, not the proxy hop's http.
if (process.env.TRUST_PROXY) app.set("trust proxy", true);

// Reject what we can't serve before x402 quotes a price: a malformed path
// escape, or no attestation source (fail closed, never sell stub data by
// accident).
app.use("/attest", (req, res, next) => {
  if (safeDecode(req.path) === undefined) return res.status(400).json({ error: "malformed agentId" });
  if (!attestationAvailable) {
    return res.status(503).json({ error: "attestation source not configured" });
  }
  next();
});

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
  res.json({ ok: true, network: NETWORK, source: attestationSource });
});

// Last-resort error handler: log, answer with a status, never crash. A 4xx
// or 5xx here also means x402 does not settle, so the buyer isn't charged.
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = (error as { status?: number; statusCode?: number }).status ?? (error as { statusCode?: number }).statusCode ?? 500;
  if (status >= 500) console.error("[seller] request failed:", error);
  if (!res.headersSent) res.status(status).json({ error: status >= 500 ? "internal error" : "bad request" });
});

process.on("unhandledRejection", reason => console.error("[seller] unhandled rejection:", reason));
// State may be corrupt after an uncaught exception: log and exit so the
// container's restart policy brings up a clean process.
process.on("uncaughtException", error => {
  console.error("[seller] uncaught exception:", error);
  process.exit(1);
});

if (!attestationAvailable) {
  console.warn("No ATTESTA_REGISTRY_ADDRESS/SEPOLIA_RPC_URL and ATTESTA_STUB!=1: /attest answers 503.");
}

const port = Number(process.env.SELLER_PORT ?? 4021);
app.listen(port, () => {
  console.log(`Seller listening on http://localhost:${port}`);
  console.log(`Paid route: GET /attest/:agentId (${priceLabel} on ${NETWORK})`);
  console.log(`Facilitator: ${facilitatorUrl}`);
  console.log(`Attestation source: ${attestationSource}`);
  if (extra) console.log(`l1Confirmations: ${extra.confirmationPolicy.l1Confirmations}`);
});
