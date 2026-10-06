#!/usr/bin/env bash
# Receiver-free dry run: real reads (Sepolia, Solana devnet, Koios), real evaluation, no report, no tx.
# Writes the run log to workflows/cre/SIMULATION.md. Refuses --broadcast.
set -euo pipefail
for a in "$@"; do [ "$a" = "--broadcast" ] && { echo "local-simulation never broadcasts" >&2; exit 1; }; done
cd "$(dirname "$0")/.."
envfile=$(./scripts/env.sh)
set -a; . "$envfile"; set +a
cre whoami >/dev/null 2>&1 || { echo "CRE CLI not authenticated: run 'cre login'" >&2; exit 1; }
# Precompiled WASM skips the compile step (~8 s). SKIP_PREBUILT=1 forces a normal compile.
wasm_args=()
[ "${SKIP_PREBUILT:-0}" = 1 ] || wasm_args=(--wasm "./$(./scripts/build-wasm.sh)")
log=$(mktemp)
set +e
cre workflow simulate control-eval --target local-simulation -e "$envfile" --non-interactive --trigger-index 0 "${wasm_args[@]}" "$@" 2>&1 | tee "$log"
rc=${PIPESTATUS[0]}
set -e
{
  echo "# CRE local simulation log"
  echo
  echo "Receiver-free dry run of \`control-eval\` (target \`local-simulation\`). Real reads, real evaluation, no report, no transaction."
  echo
  echo "| Field | Value |"
  echo "|---|---|"
  echo "| Run (UTC) | $(date -u +%Y-%m-%dT%H:%M:%SZ) |"
  echo "| CRE CLI | $(cre version | tail -1) |"
  echo "| Commit | $(git rev-parse --short HEAD) |"
  echo "| Exit code | $rc |"
  echo
  echo '```text'
  # strip ANSI colour codes
  # also redact any RPC key that sits in a URL path (NOWNodes)
  sed -e 's/\x1b\[[0-9;]*m//g' -e 's#\(nownodes\.io/\)[^ /"]*#\1<redacted>#g' "$log"
  echo '```'
} > SIMULATION.md
rm -f "$log"
exit "$rc"
