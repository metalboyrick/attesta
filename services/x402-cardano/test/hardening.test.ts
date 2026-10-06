/**
 * Seller hardening (KB origins/SECURITY-REVIEW.md findings 3 and 4):
 * - a malformed percent-escape in the path must not crash the process;
 * - without a configured registry the seller fails closed (503, no 402)
 *   unless ATTESTA_STUB=1 is set explicitly.
 *
 * Run: npm test
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SELLER = "addr_test1qztvnhavscfaupuwy824jem5z8dxavkzz6ukg4xyzls3gn2mejfgg4sl7sj4rdxxdnzsqvpkzwu0v39338t9aj6p6q7stjznf6";
const children: ChildProcess[] = [];

after(() => children.forEach(c => c.kill("SIGTERM")));

async function startSeller(env: Record<string, string>) {
  const port = 4600 + Math.floor(Math.random() * 300);
  const child = spawn(process.execPath, ["--import", "tsx", "src/seller.ts"], {
    env: {
      ...process.env,
      SELLER_ADDRESS: SELLER,
      SELLER_PORT: String(port),
      RECEIPTS_FILE: join(mkdtempSync(join(tmpdir(), "attesta-hardening-")), "receipts.json"),
      ATTESTA_CARDANO_SECRETS: "/nonexistent",
      ATTESTA_REGISTRY_ADDRESS: "",
      SEPOLIA_RPC_URL: "",
      ATTESTA_STUB: "",
      ...env,
    },
    stdio: ["ignore", "ignore", "ignore"],
  });
  children.push(child);
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${url}/health`)).ok) return { url, child };
    } catch {
      /* not up yet */
    }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error("seller did not start");
}

test("malformed percent-escape returns 400 and the seller stays up", async () => {
  const { url, child } = await startSeller({ ATTESTA_STUB: "1" });
  for (const path of ["/attest/%E0%A4%A?nonce=abcdefgh", "/attest/%E0%A4%A", "/attest/%zz?nonce=abcdefgh"]) {
    const res = await fetch(`${url}${path}`);
    assert.equal(res.status, 400, path);
  }
  await new Promise(r => setTimeout(r, 300));
  assert.equal(child.exitCode, null, "process still running");
  assert.equal((await fetch(`${url}/health`)).status, 200);
});

test("no registry configured: 503 before any payment is asked", async () => {
  const { url } = await startSeller({});
  const res = await fetch(`${url}/attest/attesta-demo-agent-3?nonce=abcdefgh`);
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("payment-required"), null, "no 402 quote");
});

test("stub data only with explicit ATTESTA_STUB=1", async () => {
  const { url } = await startSeller({ ATTESTA_STUB: "1" });
  const res = await fetch(`${url}/attest/attesta-demo-agent-3?nonce=abcdefgh`);
  assert.equal(res.status, 402);
});
