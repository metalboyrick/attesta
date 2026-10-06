/**
 * Binds each x402 payment to one (agentId, buyer nonce) request and makes a
 * retry with the same nonce idempotent: the buyer pays once and gets the same
 * receipt back on every retry.
 *
 * - A settled nonce replays its stored response and PAYMENT-RESPONSE header
 *   with no new payment.
 * - A nonce whose payment is still settling answers 409, so the buyer's x402
 *   client does not sign a second payment. Once the tx shows up on chain
 *   (checked through Koios) the nonce flips to settled.
 * - One Cardano transaction pays for exactly one nonce. Presenting the same
 *   signed tx for another nonce or agent is refused before settlement.
 *
 * State lives in memory and in a JSON file (RECEIPTS_FILE), so a seller
 * restart keeps receipts. Single process only; replicas need a shared store.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { RequestHandler } from "express";
import type { x402ResourceServer } from "@x402/core/server";
import type { HTTPRequestContext } from "@x402/core/server";
import type { SettleResponse } from "@x402/core/types";
import { encodePaymentResponseHeader } from "@x402/core/http";
import { decodeCardanoTransaction } from "@x402/cardano";

export type Receipt = {
  agentId: string;
  nonce: string;
  txHash: string;
  status: "pending" | "settled";
  /** Response body served for this nonce (JSON text). */
  body?: string;
  settle?: SettleResponse;
  createdAt: number;
  updatedAt: number;
};

type State = { receipts: Record<string, Receipt>; txToKey: Record<string, string> };

const NONCE = /^[A-Za-z0-9_-]{8,128}$/;
const KOIOS = process.env.KOIOS_BASE_URL ?? "https://preprod.koios.rest/api/v1";
const file = process.env.RECEIPTS_FILE ?? ".data/receipts.json";

const key = (agentId: string, nonce: string) => `${agentId}\n${nonce}`;

function load(): State {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as State;
  } catch {
    return { receipts: {}, txToKey: {} };
  }
}

const state = load();

function save() {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(state));
  renameSync(tmp, file);
}

function put(r: Receipt) {
  state.receipts[key(r.agentId, r.nonce)] = r;
  state.txToKey[r.txHash] = key(r.agentId, r.nonce);
  save();
}

function drop(r: Receipt) {
  delete state.receipts[key(r.agentId, r.nonce)];
  delete state.txToKey[r.txHash];
  save();
}

/** agentId and nonce as the server saw the request, never from the payload. */
function requestKey(transportContext: unknown): { agentId: string; nonce: string } | undefined {
  const req = (transportContext as { request?: HTTPRequestContext } | undefined)?.request;
  if (!req) return undefined;
  const match = /^\/attest\/([^/]+)$/.exec(req.adapter.getPath());
  const nonce = req.adapter.getQueryParam?.("nonce");
  if (!match || typeof nonce !== "string" || !NONCE.test(nonce)) return undefined;
  return { agentId: decodeURIComponent(match[1]), nonce };
}

function txHashOf(payload: Record<string, unknown>): string | undefined {
  const tx = payload.transaction;
  if (typeof tx !== "string") return undefined;
  try {
    return decodeCardanoTransaction(tx).txHash;
  } catch {
    return undefined;
  }
}

async function onChain(txHash: string): Promise<boolean> {
  try {
    const res = await fetch(`${KOIOS}/tx_status`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ _tx_hashes: [txHash] }),
    });
    const rows = (await res.json()) as { num_confirmations: number | null }[];
    return (rows[0]?.num_confirmations ?? 0) >= 1;
  } catch {
    return false;
  }
}

function replay(res: Parameters<RequestHandler>[1], r: Receipt) {
  if (r.settle) res.setHeader("PAYMENT-RESPONSE", encodePaymentResponseHeader(r.settle));
  res.setHeader("X-Attesta-Replay", "1");
  res.status(200).type("application/json").send(r.body ?? "{}");
}

/**
 * Express middleware, mounted before the x402 paymentMiddleware. Serves
 * settled nonces from the store and holds back retries while a payment settles.
 */
export const replayMiddleware: RequestHandler = async (req, res, next) => {
  const match = /^\/attest\/([^/]+)$/.exec(req.path);
  const nonce = req.query.nonce;
  if (req.method !== "GET" || !match || nonce === undefined) return next();
  if (typeof nonce !== "string" || !NONCE.test(nonce)) {
    return res.status(400).json({ error: "nonce must be 8-128 chars of [A-Za-z0-9_-]" });
  }
  const r = state.receipts[key(decodeURIComponent(match[1]), nonce)];
  if (!r) return next();
  if (r.status === "pending" && (await onChain(r.txHash))) {
    put({ ...r, status: "settled", updatedAt: Date.now() });
  }
  const current = state.receipts[key(r.agentId, r.nonce)];
  if (current?.status === "settled") return replay(res, current);
  res.setHeader("Retry-After", "15");
  return res.status(409).json({ error: "settlement_in_progress", txHash: r.txHash });
};

export function registerReceiptHooks(server: x402ResourceServer) {
  server.onAfterVerify(async ctx => {
    const k = requestKey(ctx.transportContext);
    const txHash = txHashOf(ctx.paymentPayload.payload as Record<string, unknown>);
    if (!txHash) return;
    const boundTo = state.txToKey[txHash];
    if (boundTo && (!k || boundTo !== key(k.agentId, k.nonce))) {
      return { abort: true, reason: "payment_already_bound", message: "This transaction already paid for another request" };
    }
    if (!k) {
      // No nonce: no replay, but the tx still pays for this request only.
      state.txToKey[txHash] = `anonymous\n${txHash}`;
      save();
      return;
    }
    const existing = state.receipts[key(k.agentId, k.nonce)];
    if (existing && existing.txHash !== txHash) {
      return { abort: true, reason: "nonce_already_paid", message: "This nonce already has a payment; retry without a new payment" };
    }
    if (!existing) {
      const now = Date.now();
      put({ ...k, txHash, status: "pending", createdAt: now, updatedAt: now });
    }
  });

  server.onAfterSettle(async ctx => {
    const k = requestKey(ctx.transportContext);
    if (!k) return;
    const r = state.receipts[key(k.agentId, k.nonce)];
    if (!r) return;
    const body = (ctx.transportContext as { responseBody?: Buffer }).responseBody;
    if (ctx.result.success) {
      put({ ...r, status: "settled", body: body?.toString("utf8"), settle: { ...ctx.result }, updatedAt: Date.now() });
    } else {
      // settlement_pending: the tx may still land. Keep the nonce pending so a
      // retry waits for it instead of paying again; save the body for replay.
      put({ ...r, body: body?.toString("utf8") ?? r.body, updatedAt: Date.now() });
    }
  });

  // A payment that never reached the chain frees its nonce for a fresh try.
  const release = async (ctx: { transportContext?: unknown; paymentPayload: { payload: unknown } }) => {
    const k = requestKey(ctx.transportContext);
    const txHash = txHashOf(ctx.paymentPayload.payload as Record<string, unknown>);
    if (!k || !txHash) return;
    const r = state.receipts[key(k.agentId, k.nonce)];
    if (r && r.txHash === txHash && r.status === "pending" && !(await onChain(txHash))) drop(r);
  };
  server.onVerifiedPaymentCanceled(async ctx => release(ctx as never));
  server.onSettleFailure(async ctx => {
    const reason = (ctx.error as { errorReason?: string }).errorReason;
    if (reason !== "settlement_pending") return release(ctx as never);
    // Still settling: keep the nonce pending and save the body for replay.
    const k = requestKey(ctx.transportContext);
    const r = k && state.receipts[key(k.agentId, k.nonce)];
    const body = (ctx.transportContext as { responseBody?: Buffer }).responseBody;
    if (r && body) put({ ...r, body: body.toString("utf8"), updatedAt: Date.now() });
  });
}
