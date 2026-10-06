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
| Node | 20.9+ (tested on 24.13.0) |

The template pins 2.26.0 and Evolution 0.5.14. We bumped to the latest on npm as of 6 Oct 2026.

## Run it

1. `npm install`
2. `cp .env.example .env` (no secrets in it)
3. `npm run wallet` writes a fresh buyer and seller wallet to `~/.attesta-secrets/cardano-preprod.env` (chmod 600) and prints only the addresses. It refuses to overwrite an existing file.
4. Fund the buyer address with tADA at the [Cardano testnet faucet](https://docs.cardano.org/cardano-testnets/tools/faucet/) (network: Preprod). The faucet needs a captcha, so a human does this step.
5. `npm run demo` starts the seller, runs the buyer once, and prints the receipt and explorer link.

Run the halves separately with `npm run seller` and `npm run buyer -- <agentId>`.

## Config

- **Facilitator.** Defaults to the Cardano Foundation hosted preprod facilitator, `https://x402.preprod.dev.ecosyseng.cf-deployments.org`. `npm run facilitator` starts a local one on `127.0.0.1:4022` as a fallback; point `FACILITATOR_URL` at it.
- **Chain provider.** The buyer needs chain reads to build its transaction. It uses Blockfrost when `BLOCKFROST_PROJECT_ID` is set, otherwise public Koios preprod (`https://preprod.koios.rest/api/v1`), which needs no signup.
- **Price.** 1 tADA (`PRICE_LOVELACE=1000000`). Pure-lovelace payments must clear the ~1 ADA min-UTxO. The buyer caps spend at 2 tADA per payment.
- **Response.** `{agentId, compliant, controls: [{id, pass, evidenceHash, ts}], source}`. `source` is `"stub"` for now (`src/attestation.ts`); it will read the Sepolia AttestationRegistry later.

## Proof on preprod

| Item | Value |
| --- | --- |
| Buyer address | `addr_test1qz26gtjxv36378vqv40un4w6qjnfz09gcw6lz7jyus0q0f79a85l60732tzxdgzvhepwyuh0sn0rpwzkermlmhkhm7rq2qc2rg` |
| Seller address | `addr_test1qztvnhavscfaupuwy824jem5z8dxavkzz6ukg4xyzls3gn2mejfgg4sl7sj4rdxxdnzsqvpkzwu0v39338t9aj6p6q7stjznf6` |
| Paid request tx | pending: buyer wallet not funded yet |

## Known issues

- **Facilitator re-encoding.** Our prior research flagged an upstream report that the facilitator re-encodes the signed transaction, which breaks clients not built on the Evolution SDK. We could not re-find the issue (coinbase/x402 has issues disabled). The buyer here uses the package's own Evolution signer, which is the path the template tests.
- **Double pay on timeout.** If the buyer exits without a receipt, the payment may still settle. Check the buyer address on [preprod.cardanoscan.io](https://preprod.cardanoscan.io) before rerunning.
