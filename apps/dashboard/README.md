# Attesta dashboard

Fleet status, per-agent control results, a live event timeline, and an evidence pack export for auditors. Next.js 16 (App Router), Tailwind v4, viem, @solana/web3.js.

## Run

```bash
cd apps/dashboard
pnpm install
cp .env.example .env.local     # optional; with no env it runs on fixture data
pnpm dev                       # http://localhost:3000
pnpm build && pnpm start       # production
```

## Screens

| Route | What |
|---|---|
| `/` | Fleet: three agents, status (compliant / failing / frozen), latest result per control, last run |
| `/agents/[slug]` | Eight catalogue controls with pass/fail, SOC 2 TSC and ISO/IEC 42001 Annex A ids, evidence hash, registry tx. Tap a control for its test and evidence spec. |
| `/timeline` | Control runs, guard freezes, paid x402 checks. Filters: `?show=controls\|guard\|x402` |
| `/auditor` | Evidence pack preview and download, framework coverage, `cast` command to check a row on-chain |
| `/api/evidence?format=json\|csv&scope=latest\|history&agent=evm\|solana\|cardano` | Evidence pack download |
| `/api/snapshot` | Everything the pages render, as JSON |

Pages refresh their data every 15 s while the tab is visible.

## Docker

Standalone Next.js server. Build context is `apps/dashboard`. The image holds no secrets and no env file; pass config at run time.

```bash
cd apps/dashboard
docker build -t attesta-dashboard .
docker run -d --name attesta-dashboard -p 127.0.0.1:3100:3000 attesta-dashboard                 # fixture data
docker run -d --name attesta-dashboard -p 127.0.0.1:3100:3000 --env-file .env.local attesta-dashboard  # live
```

Port: the container listens on 3000. Publish it on loopback only (`127.0.0.1:3100` above) and put a reverse proxy or tunnel in front. Without Docker: `pnpm build && node .next/standalone/server.js` (copy `.next/static` into `.next/standalone/.next/static` first), with `PORT` and `HOSTNAME=127.0.0.1`.

The registry address is read at run time as `REGISTRY_ADDRESS` or `NEXT_PUBLIC_REGISTRY_ADDRESS`, so one image works for any deployment.

## Data modes

`DATA_MODE=fixture` serves deterministic demo data, with a new synthetic run every 5 minutes so the pages move: the EVM agent stays clean, the Solana agent breaches its spend cap and gets frozen, the Cardano agent fails the allowlist control on the latest run. Every page shows a fixture banner, tx hashes render as plain text tagged `synthetic` (never explorer links), and exports carry `data_mode: fixture` on every row.

`DATA_MODE=live` (default when `REGISTRY_ADDRESS` or `NEXT_PUBLIC_REGISTRY_ADDRESS` is set) reads:

| Source | How |
|---|---|
| Sepolia `AttestationRegistry` | `ControlResult` logs from `REGISTRY_DEPLOY_BLOCK` (else the last 45k blocks), in 9k-block chunks. Agent and control ids are matched by keccak256 of their labels. |
| Solana guard (devnet) | `AgentPolicy` PDA `["policy", SOLANA_AGENT_PUBKEY]`: `frozen` byte, plus `FrozenChanged` events from the PDA's last 25 transactions |
| Cardano preprod | Koios `address_txs` on `CARDANO_SELLER_ADDRESS`. Every tx to the x402 seller counts as a paid check. |

If the RPC refuses old logs (PublicNode answers `pruned history unavailable` for wide ranges), the dashboard falls back to contract state: latest result per control, no tx links, no history, and a notice saying so. Set `REGISTRY_DEPLOY_BLOCK` to keep the log scan short.

If a live source fails, the page says which one and shows what did load. It does not fall back to fixture data silently.

Only controls with `implemented: true` in `controls/catalog.json` get results. The rest show "Not built yet".

## Catalogue

Read at request time from `../../controls/catalog.json` (override with `CONTROLS_CATALOG_PATH`). If that file is not deployed next to the app, the build-time copy in `lib/catalog.bundled.json` is used. `pnpm build` re-syncs it first (`scripts/sync-catalog.mjs`) when the repo file exists. Commit the updated copy so Docker builds, which only see `apps/dashboard`, carry the current catalogue.

## Env

See `.env.example`. Agent registry ids default to `attesta-demo-agent-1..3` (EVM, Solana, Cardano); `-1` EVM, `-2` Solana, `-3` Cardano.
