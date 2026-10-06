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
# Precompiled WASM skips the compile step (~8 s). SKIP_PREBUILT=1 forces a normal compile.
wasm_args=()
[ "${SKIP_PREBUILT:-0}" = 1 ] || wasm_args=(--wasm "./$(./scripts/build-wasm.sh)")
cre workflow simulate control-eval --target staging-settings -e "$envfile" --non-interactive --trigger-index 0 "${wasm_args[@]}" "$@"
