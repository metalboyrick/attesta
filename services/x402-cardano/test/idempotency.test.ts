/**
 * Idempotent settle, end to end against the real seller process, a mock
 * facilitator and a test client scheme. The "payments" are real preprod
 * transactions fetched from Koios, so the seller's tx-hash binding and its
 * on-chain check run for real; nothing is broadcast.
 *
 * Run: npm test
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { decodeCardanoTransaction } from "@x402/cardano";

const KOIOS = "https://preprod.koios.rest/api/v1";
const SELLER = "addr_test1qztvnhavscfaupuwy824jem5z8dxavkzz6ukg4xyzls3gn2mejfgg4sl7sj4rdxxdnzsqvpkzwu0v39338t9aj6p6q7stjznf6";
const PROBE = "addr_test1qqteey0t6whhsk04mdadq02m8m6004d8wsgl0vpnq26q7dgvanmxs7dpt5rkyu2rfcl2qnx5zwvfa87rvvm6t3zug5xq4p5f40";

let txs: { cbor: string; hash: string }[] = [];
let settleMode: "success" | "pending" = "success";
let settleCalls = 0;
let payloadsCreated = 0;
let nextTx = 0;
let seller: ChildProcess;
let sellerUrl = "";
let closeFacilitator: () => void;

async function koios<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${KOIOS}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

before(async () => {
  const recent = await koios<{ tx_hash: string }[]>("/address_txs?limit=3", { _addresses: [PROBE] });
  const cbors = await koios<{ tx_hash: string; cbor: string }[]>("/tx_cbor", {
    _tx_hashes: recent.map(t => t.tx_hash),
  });
  txs = cbors.map(c => ({ cbor: c.cbor, hash: decodeCardanoTransaction(Buffer.from(c.cbor, "hex").toString("base64")).txHash }));
  assert.equal(txs[0].hash, cbors[0].tx_hash);

  const fac = express();
  fac.use(express.json({ limit: "2mb" }));
  fac.get("/supported", (_req, res) =>
    res.json({
      kinds: [
        {
          x402Version: 2,
          scheme: "exact",
          network: "cardano:preprod",
          extra: { assetTransferMethods: ["default"], areFeesSponsored: false, l1Confirmations: { minimum: 0, maximum: 20 } },
        },
      ],
      extensions: [],
      signers: { "cardano:*": [] },
    }),
  );
  fac.post("/verify", (_req, res) => res.json({ isValid: true, payer: PROBE }));
  fac.post("/settle", (req, res) => {
    settleCalls += 1;
    const tx = req.body.paymentPayload.payload.transaction as string;
    const hash = decodeCardanoTransaction(tx).txHash;
    if (settleMode === "pending") {
      return res.json({ success: false, errorReason: "settlement_pending", transaction: hash, network: "cardano:preprod" });
    }
    res.json({ success: true, transaction: hash, network: "cardano:preprod", payer: PROBE });
  });
  const facServer = fac.listen(0);
  closeFacilitator = () => {
    facServer.closeAllConnections();
    facServer.close();
  };
  const facPort = (facServer.address() as AddressInfo).port;

  const port = 4100 + Math.floor(Math.random() * 500);
  sellerUrl = `http://localhost:${port}`;
  seller = spawn(process.execPath, ["--import", "tsx", "src/seller.ts"], {
    env: {
      ...process.env,
      SELLER_ADDRESS: SELLER,
      SELLER_PORT: String(port),
      FACILITATOR_URL: `http://localhost:${facPort}`,
      RECEIPTS_FILE: join(mkdtempSync(join(tmpdir(), "attesta-receipts-")), "receipts.json"),
      ATTESTA_CARDANO_SECRETS: "/nonexistent",
      ATTESTA_REGISTRY_ADDRESS: "",
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${sellerUrl}/health`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error("seller did not start");
});

after(() => {
  seller?.kill("SIGTERM");
  closeFacilitator?.();
});

function buyer() {
  const client = new x402Client().setSpendControls({
    allowedAssets: [{ network: "cardano:*", asset: "lovelace", maxAmountPerPayment: "2000000" }],
  });
  client.register("cardano:*", {
    scheme: "exact",
    async createPaymentPayload(x402Version) {
      payloadsCreated += 1;
      const tx = txs[nextTx];
      return {
        x402Version,
        payload: { transaction: Buffer.from(tx.cbor, "hex").toString("base64"), nonce: `${tx.hash}#0` },
      };
    },
  });
  return wrapFetchWithPayment(fetch, client);
}

test("first request pays once, same nonce replays without paying", async () => {
  const pay = buyer();
  const url = `${sellerUrl}/attest/attesta-demo-agent-3?nonce=nonce-aaaa-0001`;

  const first = await pay(url);
  assert.equal(first.status, 200);
  const firstBody = await first.text();
  assert.equal(settleCalls, 1);
  assert.equal(payloadsCreated, 1);
  assert.ok(first.headers.get("payment-response"));

  const again = await pay(url);
  assert.equal(again.status, 200);
  assert.equal(again.headers.get("x-attesta-replay"), "1");
  assert.equal(await again.text(), firstBody);
  assert.equal(again.headers.get("payment-response"), first.headers.get("payment-response"));
  assert.equal(settleCalls, 1, "no second settle");
  assert.equal(payloadsCreated, 1, "no second payment signed");
});

test("the same transaction cannot pay for a second nonce", async () => {
  const pay = buyer();
  const before = settleCalls;
  const res = await pay(`${sellerUrl}/attest/attesta-demo-agent-3?nonce=nonce-bbbb-0002`);
  assert.notEqual(res.status, 200);
  assert.equal(settleCalls, before, "rejected before settlement");
});

test("a payment left pending is picked up from chain on retry, not paid twice", async () => {
  const pay = buyer();
  nextTx = 1;
  settleMode = "pending";
  const url = `${sellerUrl}/attest/attesta-demo-agent-2?nonce=nonce-cccc-0003`;
  const before = payloadsCreated;

  const first = await pay(url);
  assert.equal(first.status, 402, "buyer is told settlement did not finish");
  assert.equal(payloadsCreated, before + 1);

  settleMode = "success";
  const retry = await pay(url);
  assert.equal(retry.status, 200, "tx is on chain, so the retry gets the stored receipt");
  assert.equal(retry.headers.get("x-attesta-replay"), "1");
  assert.equal(payloadsCreated, before + 1, "no second payment signed");
});

test("bad nonce format is refused", async () => {
  const res = await fetch(`${sellerUrl}/attest/x?nonce=a`);
  assert.equal(res.status, 400);
});
