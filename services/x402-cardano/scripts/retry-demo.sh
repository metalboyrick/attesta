#!/usr/bin/env bash
# Idempotent settle demo on preprod: pay once for (agentId, nonce), then retry
# with the same nonce twice. The retries replay the stored receipt; the buyer
# wallet balance drops only once. Needs a running seller (npm run seller) and
# a funded buyer wallet.
#
# Usage: scripts/retry-demo.sh [agentId]
set -euo pipefail
cd "$(dirname "$0")/.."

AGENT="${1:-attesta-demo-agent-3}"
NONCE="demo-$(date +%s)"
KOIOS="${KOIOS_BASE_URL:-https://preprod.koios.rest/api/v1}"
SECRETS="${ATTESTA_CARDANO_SECRETS:-$HOME/.attesta-secrets/cardano-preprod.env}"
BUYER=$(grep '^BUYER_ADDRESS=' "$SECRETS" | cut -d= -f2)

balance() {
  curl -s -X POST "$KOIOS/address_info" -H 'content-type: application/json' \
    -d "{\"_addresses\":[\"$BUYER\"]}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s)[0];console.log(r?(Number(r.balance)/1e6).toFixed(6)+" tADA":"0 tADA")})'
}

echo "Nonce $NONCE, buyer balance before: $(balance)"
echo; echo "== 1. First request: pays"
BUYER_NONCE="$NONCE" npm run -s buyer -- "$AGENT" || true
echo; echo "== 2. Same nonce again: must say 'Replayed stored receipt: no new payment'"
BUYER_NONCE="$NONCE" npm run -s buyer -- "$AGENT" || true
echo; echo "== 3. And once more"
BUYER_NONCE="$NONCE" npm run -s buyer -- "$AGENT" || true
echo; echo "Buyer balance after: $(balance)  (one payment plus one fee, not three)"
