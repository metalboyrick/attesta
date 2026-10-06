#!/usr/bin/env bash
# Option B hosting: run the seller container and expose it through a
# Cloudflare quick tunnel (no account; random https://*.trycloudflare.com URL
# that changes on every start; Cloudflare offers these for testing only).
# Nothing is public until you run this. Ctrl-C stops the tunnel and container.
#
# Usage: SELLER_ADDRESS=addr_test1... scripts/tunnel.sh
# Needs ATTESTA_REGISTRY_ADDRESS + SEPOLIA_RPC_URL (or ATTESTA_STUB=1 for test
# data); without either the seller answers 503. Optional: FACILITATOR_URL,
#           PORT (host port, default 4021), CLOUDFLARED (binary path).
set -euo pipefail

: "${SELLER_ADDRESS:?set SELLER_ADDRESS (public preprod address, not a secret)}"
PORT="${PORT:-4021}"
CLOUDFLARED="${CLOUDFLARED:-$(command -v cloudflared || echo "$HOME/.local/bin/cloudflared")}"
NAME=attesta-x402-cardano
HERE="$(cd "$(dirname "$0")/.." && pwd)"

[ -x "$CLOUDFLARED" ] || { echo "cloudflared not found; get it from github.com/cloudflare/cloudflared/releases" >&2; exit 1; }

docker build -q -f "$HERE/Dockerfile" -t "$NAME" "$HERE/.." >/dev/null

env_args=(-e "SELLER_ADDRESS=$SELLER_ADDRESS")
for v in ATTESTA_REGISTRY_ADDRESS SEPOLIA_RPC_URL ATTESTA_STUB FACILITATOR_URL PRICE_LOVELACE; do
  [ -n "${!v:-}" ] && env_args+=(-e "$v=${!v}")
done

docker run -d --rm --name "$NAME" -p "127.0.0.1:$PORT:4021" "${env_args[@]}" "$NAME" >/dev/null
cleanup() { docker stop "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

for _ in $(seq 1 40); do curl -sf "http://localhost:$PORT/health" >/dev/null && break; sleep 0.5; done
curl -sf "http://localhost:$PORT/health" >/dev/null || { docker logs "$NAME"; exit 1; }
echo "Seller up on localhost:$PORT; opening tunnel (watch for the trycloudflare.com URL)..."

"$CLOUDFLARED" tunnel --no-autoupdate --url "http://localhost:$PORT"
