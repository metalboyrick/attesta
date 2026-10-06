#!/usr/bin/env bash
# Compiles control-eval to WASM once, so simulate runs can skip the ~8 s compile (pass via --wasm).
# Rebuilds only when a source file is newer than the binary.
set -euo pipefail
cd "$(dirname "$0")/../control-eval"
out=build/control-eval.wasm
[ -d node_modules ] || bun install --frozen-lockfile >/dev/null
if [ ! -f "$out" ] || [ -n "$(find main.ts workflow.ts lib package.json bun.lock -newer "$out" -print -quit)" ]; then
  mkdir -p build
  bun x cre-compile main.ts "$out" >/dev/null
fi
echo "$out"
