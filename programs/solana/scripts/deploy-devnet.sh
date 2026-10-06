#!/usr/bin/env bash
# Deploy attesta_guard to devnet with keys from ~/.attesta-secrets.
set -euo pipefail
cd "$(dirname "$0")/.."
S="${ATTESTA_SECRETS:-$HOME/.attesta-secrets}"
cp "$S/solana-guard-program.json" target/deploy/attesta_guard-keypair.json
anchor build
solana program deploy target/deploy/attesta_guard.so \
  --program-id target/deploy/attesta_guard-keypair.json \
  --keypair "$S/solana-deployer.json" -u devnet
cp target/idl/attesta_guard.json idl/
cp target/types/attesta_guard.ts idl/attesta_guard.types.ts
solana program show 2ppMVjwBs8dqNppcJctfTJaVb3rtfFFe5cDmJyxCGuSW -u devnet
