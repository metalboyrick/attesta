# x402-cardano

Pay-per-request Attesta checks on Cardano preprod. A counterparty agent calls `GET /attest/:agentId`, gets HTTP 402, pays 1 tADA through x402, and gets the attestation back with a payment receipt.

Built from the official Cardano Foundation [x402-express template](https://developers.cardano.org/templates/x402-express/) (`gh:cardano-foundation/developer-portal/examples/templates/x402-express`), with the paid route swapped for ours and secrets moved out of the repo.

```text
buyer ── GET /attest/:agentId ───────────► seller
buyer ◄─ 402 + payment requirements ────── seller
buyer:   builds + signs a Cardano tx (Evolution SDK, mnemonic wallet)
buyer ── GET + PAYMENT-SIGNATURE ────────► seller ──► facilitator /verify + /settle ──► preprod
buyer ◄─ 200 + attestation + receipt ───── seller
```

## Pinned versions

| Package | Version |
| --- | --- |
| `@x402/cardano` | 2.28.0 |
| `@x402/core` | 2.28.0 |
| `@x402/express` | 2.28.0 |
| `@x402/fetch` | 2.28.0 |
| `@evolution-sdk/evolution` | 0.5.17 |
| `viem` | 2.57.3 |
| Node | 20.9+ (tested on 24.13.0) |

The template pins 2.26.0 and Evolution 0.5.14. We bumped to the latest on npm as of 6 Oct 2026.

## Run it

1. `npm install`
2. `cp .env.example .env`. It holds no secrets, and it points the seller at the live Sepolia registry `0x48a80a9d7e319c29e5e309d7932c467810680935` (v2), so answers come from real control results.
3. `npm run wallet` writes a fresh buyer and seller wallet to `~/.attesta-secrets/cardano-preprod.env` (chmod 600) and prints only the addresses. It refuses to overwrite an existing file.
4. Fund the buyer address with tADA at the [Cardano testnet faucet](https://docs.cardano.org/cardano-testnets/tools/faucet/) (network: Preprod). The faucet needs a captcha, so a human does this step.
5. `npm run demo -- attesta-demo-agent-3` starts the seller, runs the buyer once, and prints the receipt, the explorer link, and a `DEAL` or `DECLINE` line. Agent ids: `attesta-demo-agent-1` (EVM), `-2` (Solana), `-3` (Cardano). The answer is whatever the registry holds at that moment.

Run the halves separately with `npm run seller` and `npm run buyer -- <agentId>`.

The buyer plays the counterparty agent. It pays for the check, then prints `DEAL` when `compliant` is true and `DECLINE` (with the failing controls) when it is not. Exit codes: 0 for DEAL, 2 for DECLINE, 1 for errors. For offline testing, remove the registry lines and set `ATTESTA_STUB=1`: the seller then serves test data (`source: "stub"`), where any agentId containing `rogue` fails `ATT-CPTY-02`.

### Local facilitator fallback

If the hosted facilitator is down or rejects payments, run your own:

1. `npm run facilitator` (binds `127.0.0.1:4022`, holds no keys)
2. `FACILITATOR_URL=http://localhost:4022 L1_CONFIRMATIONS=0 npm run seller`
3. `npm run buyer -- <agentId>`

On Koios the facilitator cannot read confirmation depth, so it advertises `l1Confirmations` max 0 and routes must ask for 0. It waits for block inclusion itself, bounded at 80s. Tested up to the 402 stage: the 402 carries `extra.confirmationPolicy.l1Confirmations: 0`.

## Config

- **Facilitator.** Defaults to the Cardano Foundation hosted preprod facilitator, `https://x402.preprod.dev.ecosyseng.cf-deployments.org`. `npm run facilitator` starts a local one on `127.0.0.1:4022` as a fallback; point `FACILITATOR_URL` at it.
- **Chain provider.** The buyer needs chain reads to build its transaction. It uses Blockfrost when `BLOCKFROST_PROJECT_ID` is set, otherwise public Koios preprod (`https://preprod.koios.rest/api/v1`), which needs no signup.
- **Price.** 1 tADA (`PRICE_LOVELACE=1000000`). Pure-lovelace payments must clear the ~1 ADA min-UTxO. The buyer caps spend at 2 tADA per payment.
- **Response.** `{agentId, compliant, controls: [{id, pass, evidenceHash, ts}], safetyScore: {passing, tested, score0to100}, source}`.
- **Agent Safety Score.** `passing / tested` over the controls the registry returned, as a 0 to 100 integer. Controls with no recorded result aren't in that list, so they're excluded. With nothing tested, `score0to100` is `null`, not 0. The buyer prints it on the verdict line, for example `DECLINE ATT-CPTY-02 · safety 2/3 (67)`. The verdict still follows `compliant`, not the score (`src/score.ts`, `test/safety.test.ts`).
- **Attestation source.** With `ATTESTA_REGISTRY_ADDRESS` and `SEPOLIA_RPC_URL` set, `src/attestation.ts` reads `contracts/evm/src/AttestationRegistry.sol` through viem: `isCompliant`, `getControls`, then `getResult` per control. `source` is then `sepolia:<address>`. Without them the seller fails closed: `/attest` answers 503 before quoting a price. Stub data (`source: "stub"`) is served only with `ATTESTA_STUB=1`. The agentId in the URL maps to the registry's `bytes32` key by keccak256 of the UTF-8 string (`AGENT_ID_ENCODING=utf8` switches to right-padded bytes); a raw `0x` 32-byte hex id passes through. This matches `id32` in `workflows/cre/control-eval/workflow.ts`. That workflow also hashes control ids, so the seller maps hashes back to labels listed in `ATTESTA_CONTROL_IDS` (default: every id in `controls/catalog.json`); ids stored as padded ASCII also read back as text, and anything else stays hex.
- **Registry failure.** If the registry read throws, the seller answers 502 and x402 cancels settlement, so the buyer is not charged. The read path was tested on a local anvil node and then against the live Sepolia registry `0xbc675484a8c2c51174efb8b5369250eb8337750d` (see Proof on preprod).

## One payment per request, safe retries

Each buyer request carries a nonce: `GET /attest/:agentId?nonce=<8-128 chars of A-Za-z0-9_->`. The seller binds the Cardano payment to that `(agentId, nonce)` pair (`src/receipts.ts`):

- **Retry after success.** The same nonce returns the stored response and the same `PAYMENT-RESPONSE` receipt, with header `X-Attesta-Replay: 1`. No 402 and no new payment.
- **Retry while settling.** If the first payment is still settling (`settlement_pending`), the seller answers 409 with `Retry-After`. The buyer waits instead of signing a second payment. Once Koios shows the tx on chain, the nonce flips to settled and the retry gets the stored receipt.
- **One tx, one request.** A signed transaction that already paid for one `(agentId, nonce)` is refused for any other one before settlement. The tx hash is decoded from the payment itself.
- **Failed payment.** If the payment never reached the chain, the nonce is freed for a fresh try.

The agentId and nonce come from the request the server saw, not from the payment payload. Receipts persist to `RECEIPTS_FILE` (default `.data/receipts.json`; `/data/receipts.json` in Docker, so mount a volume there), so a restart or redeploy keeps them. It's a single-process store; replicas would need a shared one.

If settle fails for any reason after the facilitator may have broadcast the tx, the nonce stays pending, bound to the signed tx hash and the price it must pay: retries get 409 until Koios shows that tx on chain paying at least the quoted amount of the quoted asset to the seller (then they replay the receipt, building the answer if none was stored), and the nonce is freed only if the tx still isn't on chain after `RECEIPTS_PENDING_TTL_MS` (default 15 minutes, well past the tx validity window). Verify and settle failures are logged as one JSON line each (event, agentId, nonce, tx hash, reason; never payloads or keys). We found this case live on 6 Oct: the buyer got a 402 while its payment `da2505fd…` landed; the earlier code freed the nonce, so a retry would have charged twice. `test/idempotency.test.ts` now reproduces it.

The buyer generates a nonce per run and prints it. `BUYER_NONCE=<nonce> npm run buyer -- <agentId>` replays it. `scripts/retry-demo.sh [agentId]` runs one paid request and two retries with the same nonce, and prints the buyer balance before and after.

`npm test` covers this end to end: the real seller process, a mock facilitator, and real preprod transactions from Koios as payment payloads (nothing is broadcast). Four tests pass: replay without a second payment, the same tx refused for a second nonce, a pending payment picked up from chain on retry, and a bad nonce refused.

## Pricing in tADA or tUSDM

`PRICE_ASSET=usdm` prices one check at `PRICE_USDM` (default `1000000`, which is 1 tUSDM at 6 decimals) of `USDM_UNIT`. Default unit: `e675b46e4d2242c991a8932a99db3044e80515ae14b4c4ccf6b3f4c9.0014df10745553444d`, the preprod USDM built into `@x402/cardano` 2.28.0. It's also what the [tUSDM faucet](https://tusdm.moneta.global) sent us on 6 Oct. Masumi's TOKEN2049 guide uses a different preprod tUSDM, `16a55b2a349361ff88c03788f93e1e966e5d689605d044fef722ddde.0014df10745553444d`. The buyer's spend controls allow both, capped at 2 tUSDM. The token output also carries its min-UTxO in tADA (1.17663 tADA in our run), which the buyer pays and the seller receives. Unset `PRICE_ASSET` keeps 1 tADA. A tUSDM payment still needs tADA in the buyer wallet for the fee and the min-UTxO that travels with the token.

## Hardening

- **Fail closed.** No registry config and no `ATTESTA_STUB=1` means 503 on `/attest`, before any 402, so nobody pays for stub data by accident. `/health` reports the `source`.
- **Malformed paths.** A bad percent-escape in the agentId (for example `/attest/%E0%A4%A`) gets 400. Async middleware errors go to an Express error handler. Unhandled rejections are logged. An uncaught exception logs and exits, so the container restart policy brings up a clean process.
- `test/hardening.test.ts` covers these. The crash test failed before the fix: the seller process died on that request.

## Spend collector (monitored agent #3)

`npm run collect -- <agentId> <address> [sinceUnixSeconds]` reads a preprod wallet's transactions from Koios and prints `SpendRecord[]` (type in `services/shared/spend-record.ts`, shared with the EVM and Solana collectors). A transaction counts when one of its inputs carries the agent's payment credential. Each output to another credential becomes one record per asset; change (same payment credential, any stake part) and fees are skipped. Same rule as the CRE agent-3 evaluator. Defaults: `AGENT_ID` (else `attesta-demo-agent-3`) and `AGENT_ADDRESS` (else the buyer wallet).

## Docker

The image runs the seller only and holds no keys. Build from `services/` so the shared type is in context:

```sh
cd services
docker build -f x402-cardano/Dockerfile -t attesta-x402-cardano .
docker run --rm -p 127.0.0.1:4021:4021 -e SELLER_ADDRESS=addr_test1... attesta-x402-cardano
```

`TRUST_PROXY=1` is set in the image so that behind Caddy or a Cloudflare tunnel the 402's resource URL says `https`.

## Public HTTPS (option B, not live)

`SELLER_ADDRESS=addr_test1... scripts/tunnel.sh` builds the image, runs the seller on `127.0.0.1:4021`, and opens a Cloudflare quick tunnel. It prints a random `https://*.trycloudflare.com` URL that changes on every start. Ctrl-C stops both. Nothing is exposed until someone runs it. The hosting choice is still open.

## Proof on preprod

All payments ran on 6 Oct 2026 through the hosted Cardano Foundation facilitator, signed by the Evolution SDK buyer. Each was confirmed with 1 block (`"status": "confirmed"` in the receipt) and checked on chain through Koios. Rows 1 to 3 used the stub attestation source. Rows 4 and 5 read the live Sepolia `AttestationRegistry` v1 (`0xbc67…750d`). The current registry is v2, `0x48a80a9d7e319c29e5e309d7932c467810680935`. It has the same ABI and accepts only the 8 catalog control ids and writes sent from our reporter key.

| What | Tx | Paid to seller |
| --- | --- | --- |
| First paid check, `attesta-demo-agent-3`, DEAL (HTTP 200 after 28.9 s) | [2abdf809…f8c7](https://preprod.cardanoscan.io/transaction/2abdf809e04f43fdfdd231517d34d0daf9af4773288bf51cf6cbb4f01400f8c7) | 1 tADA, fee 0.168581 |
| `retry-demo.sh`: one payment, then 2 replays with the same nonce (balance 10003.831419 to 10002.662838 tADA, exactly 1 payment + 1 fee) | [9d963e2c…93e0](https://preprod.cardanoscan.io/transaction/9d963e2c3e14edee4832774bd9251c58fc92e6084ab1435bd4310b2a2b1a93e0) | 1 tADA, fee 0.168581 |
| tUSDM-priced check, `rogue-bot` (stub data, which then used the control id `SP-03-spend-limits`), DECLINE (HTTP 200 after 32.7 s) | [08c9cf69…8d43](https://preprod.cardanoscan.io/transaction/08c9cf69eb964f1b22a121aef521137977a4d557ba543d84f06d7c3182d88d43) | 1 tUSDM + 1.17663 tADA min-UTxO, fee 0.172629 |
| Live registry check, `attesta-demo-agent-3`, `source: sepolia:0xbc675484a8c2c51174efb8b5369250eb8337750d`, ATT-SPEND-01 and ATT-CPTY-02 pass, DEAL (HTTP 200 after 57.7 s) | [c47d4c06…5662](https://preprod.cardanoscan.io/transaction/c47d4c065600bf15095cb4161b0a28c496d76f3e4bfc9cca08ffca1fe5cc5662) | 1 tADA |
| Live registry check, `attesta-demo-agent-2`, ATT-CPTY-02 failing (written by the CRE workflow), `DECLINE ATT-CPTY-02` (HTTP 200 after 60.9 s) | [65f62578…5f1b](https://preprod.cardanoscan.io/transaction/65f625780354381effea68636d851527becf44dc54c4b337f03bbf19711f5f1b) | 1 tADA |

| Wallet | Address |
| --- | --- |
| Buyer (agent-3) | [addr_test1qz26gtjx…2qc2rg](https://preprod.cardanoscan.io/address/addr_test1qz26gtjxv36378vqv40un4w6qjnfz09gcw6lz7jyus0q0f79a85l60732tzxdgzvhepwyuh0sn0rpwzkermlmhkhm7rq2qc2rg) |
| Seller | [addr_test1qztvnhav…tjznf6](https://preprod.cardanoscan.io/address/addr_test1qztvnhavscfaupuwy824jem5z8dxavkzz6ukg4xyzls3gn2mejfgg4sl7sj4rdxxdnzsqvpkzwu0v39338t9aj6p6q7stjznf6) |

## Known issues

- **Facilitator re-encoding.** Our prior research flagged an upstream report that the facilitator re-encodes the signed transaction, which breaks clients not built on the Evolution SDK. We could not re-find the issue (coinbase/x402 has issues disabled). With the package's own Evolution signer, all five payments above settled through the hosted facilitator.
- **Double pay on timeout.** If the buyer exits without a receipt, the payment may still settle. Check the buyer address on [preprod.cardanoscan.io](https://preprod.cardanoscan.io) before rerunning.
