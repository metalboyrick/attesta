#!/usr/bin/env bash
# Runs the control-eval workflow once in the CRE simulator. Pass --broadcast to send a real Sepolia tx.
set -euo pipefail
cd "$(dirname "$0")/.."
envfile=$(./scripts/env.sh)
set -a; . "$envfile"; set +a
(cd control-eval && bun install --frozen-lockfile >/dev/null)
cre workflow simulate control-eval --target staging-settings -e "$envfile" --non-interactive --trigger-index 0 "$@"
