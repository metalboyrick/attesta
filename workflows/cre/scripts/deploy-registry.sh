#!/usr/bin/env bash
# Deploys AttestationRegistry to Sepolia with the MockKeystoneForwarder (simulate) as the allowed forwarder.
set -euo pipefail
cd "$(dirname "$0")/../../../contracts/evm"
RPC="${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
pk=$(jq -r '.[0].private_key' "$HOME/.attesta-secrets/sepolia-deployer.json")
forge script script/Deploy.s.sol --rpc-url "$RPC" --private-key "$pk" --broadcast
