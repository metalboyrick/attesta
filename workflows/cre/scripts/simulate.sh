#!/usr/bin/env bash
# Runs the control-eval workflow once in the CRE simulator. Pass --broadcast to send real Sepolia txs.
# Auth: either `cre login` (browser session) or CRE_API_KEY in ~/.attesta-secrets/cre.env.
set -euo pipefail
cd "$(dirname "$0")/.."
envfile=$(./scripts/env.sh)
set -a; . "$envfile"; set +a
if ! cre whoami >/dev/null 2>&1; then
  echo "CRE CLI not authenticated: run 'cre login' (or put CRE_API_KEY in ~/.attesta-secrets/cre.env)" >&2
  exit 1
fi
(cd control-eval && bun install --frozen-lockfile >/dev/null)
cre workflow simulate control-eval --target staging-settings -e "$envfile" --non-interactive --trigger-index 0 "$@"
