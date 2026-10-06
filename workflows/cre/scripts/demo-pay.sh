#!/usr/bin/env bash
# Makes the EVM demo agent pay someone. Usage: demo-pay.sh vendor|stranger [amount_eth]
# vendor = allowlisted (CPTY-02 passes), stranger = not allowlisted (CPTY-02 fails on next run).
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
S="$HOME/.attesta-secrets"
RPC="${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
wallet=$(jq -r '.agents[] | select(.kind=="evm") | .wallet' "$here/control-eval/config.staging.json")
case "${1:-vendor}" in
  vendor) to=$(jq -r '.[0].address' "$S/sepolia-vendor.json") ;;
  stranger) to=0x000000000000000000000000000000000000dEaD ;;
  *) echo "usage: $0 vendor|stranger [eth]"; exit 1 ;;
esac
cast send "$wallet" "pay(address,uint256)" "$to" "$(cast to-wei "${2:-0.001}")" \
  --rpc-url "$RPC" --private-key "$(jq -r '.[0].private_key' "$S/sepolia-agent.json")"
