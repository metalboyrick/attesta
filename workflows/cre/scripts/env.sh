#!/usr/bin/env bash
# Builds ~/.attesta-secrets/cre-sim.env (chmod 600) from the secrets dir. Nothing secret touches the repo.
# Inputs: ~/.attesta-secrets/sepolia-deployer.json (cast wallet new --json), ~/.attesta-secrets/cre.env (CRE_API_KEY=...)
set -euo pipefail
S="$HOME/.attesta-secrets"
umask 077
pk=$(jq -r '.[0].private_key' "$S/sepolia-deployer.json")
{
  echo "CRE_ETH_PRIVATE_KEY=${pk#0x}"
  echo "CRE_TARGET=staging-settings"
  [ -f "$S/cre.env" ] && grep -E '^CRE_API_KEY=' "$S/cre.env" || true
} > "$S/cre-sim.env"
echo "$S/cre-sim.env"
