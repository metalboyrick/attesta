/**
 * Binds each x402 payment to one (agentId, buyer nonce) request and makes a
 * retry with the same nonce idempotent: the buyer pays once and gets the same
 * receipt back on every retry.
 *
 * - A settled nonce replays its stored response and PAYMENT-RESPONSE header
 *   with no new payment.
 * - A nonce whose payment is still settling, or whose settle was reported as
 *   failed after the facilitator may already have broadcast it, answers 409,
 *   so the buyer's x402 client does not sign a second payment. Once the tx
 *   shows up on chain (checked through Koios) the nonce flips to settled. Only
 *   if the tx is still not on chain after RECEIPTS_PENDING_TTL_MS (default 15
 *   min, well past the tx's validity window) is the nonce freed.
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
const PENDING_TTL_MS = Number(process.env.RECEIPTS_PENDING_TTL_MS ?? 15 * 60_000);
const NETWORK = "cardano:preprod";

/** Builds the response body for a paid nonce whose body was never stored. */
let lateBody: ((agentId: string) => Promise<string>) | undefined;
export function setLateBodyProvider(fn: (agentId: string) => Promise<string>) {
  lateBody = fn;
}

const key = (agentId: string, nonce: string) => `${agentId}\n${nonce}`;

/** decodeURIComponent that returns undefined on a malformed escape. */
export function safeDecode(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

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
  const agentId = safeDecode(match[1]);
  return agentId === undefined ? undefined : { agentId, nonce };
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

async function replay(res: Parameters<RequestHandler>[1], r: Receipt) {
  let current = r;
  if (current.body === undefined && lateBody) {
    // Settle failed before the body was kept, but the payment landed: answer
    // now, store it, and serve the same body on every later replay.
    current = { ...current, body: await lateBody(current.agentId), updatedAt: Date.now() };
    put(current);
  }
  const settle = current.settle ?? { success: true, transaction: current.txHash, network: NETWORK };
  res.setHeader("PAYMENT-RESPONSE", encodePaymentResponseHeader(settle as SettleResponse));
  res.setHeader("X-Attesta-Replay", "1");
  res.status(200).type("application/json").send(current.body ?? "{}");
}

/**
 * Express middleware, mounted before the x402 paymentMiddleware. Serves
 * settled nonces from the store and holds back retries while a payment settles.
 */
export const replayMiddleware: RequestHandler = async (req, res, next) => {
  try {
    const match = /^\/attest\/([^/]+)$/.exec(req.path);
    const nonce = req.query.nonce;
    if (req.method !== "GET" || !match || nonce === undefined) return next();
    if (typeof nonce !== "string" || !NONCE.test(nonce)) {
      return res.status(400).json({ error: "nonce must be 8-128 chars of [A-Za-z0-9_-]" });
    }
    const agentId = safeDecode(match[1]);
    if (agentId === undefined) return res.status(400).json({ error: "malformed agentId" });
    const r = state.receipts[key(agentId, nonce)];
    if (!r) return next();
    if (r.status === "pending") {
      if (await onChain(r.txHash)) {
        put({ ...r, status: "settled", updatedAt: Date.now() });
      } else if (Date.now() - r.createdAt > PENDING_TTL_MS) {
        // Never landed and its validity window is long gone: free the nonce.
        console.warn(`[receipts] ${r.nonce}: tx ${r.txHash} never landed; nonce freed`);
        drop(r);
        return next();
      }
    }
    const current = state.receipts[key(r.agentId, r.nonce)];
    if (current?.status === "settled") return await replay(res, current);
    res.setHeader("Retry-After", "15");
    return res.status(409).json({ error: "settlement_in_progress", txHash: r.txHash });
  } catch (error) {
    // Express 4 does not catch rejected promises from async middleware.
    next(error);
  }
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
      // Not settled, but the tx may still land. Keep the nonce pending so a
      // retry waits for it instead of paying again; save the body for replay.
      console.warn(`[receipts] settle not confirmed for ${k.agentId} ${k.nonce}: ${ctx.result.errorReason ?? "unknown"}`);
      put({ ...r, body: body?.toString("utf8") ?? r.body, updatedAt: Date.now() });
    }
  });

  // Canceled before settle: the buyer never broadcasts and the facilitator
  // never got the tx, so it can't land. Free the nonce for a fresh try.
  server.onVerifiedPaymentCanceled(async ctx => {
    const k = requestKey(ctx.transportContext);
    const txHash = txHashOf(ctx.paymentPayload.payload as Record<string, unknown>);
    if (!k || !txHash) return;
    const r = state.receipts[key(k.agentId, k.nonce)];
    if (r && r.txHash === txHash && r.status === "pending") drop(r);
  });

  // Settle failed for any reason: the facilitator may already have broadcast
  // the tx, so never free the nonce here. Keep it pending with the body; the
  // replay path settles it from chain or frees it after the TTL.
  server.onSettleFailure(async ctx => {
    const k = requestKey(ctx.transportContext);
    const r = k && state.receipts[key(k.agentId, k.nonce)];
    const reason = (ctx.error as { errorReason?: string }).errorReason ?? ctx.error.message;
    console.warn(`[receipts] settle failed for ${k ? `${k.agentId} ${k.nonce}` : "anonymous"}: ${reason}`);
    const body = (ctx.transportContext as { responseBody?: Buffer }).responseBody;
    if (r && body) put({ ...r, body: body.toString("utf8"), updatedAt: Date.now() });
  });
}
