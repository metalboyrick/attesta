#!/usr/bin/env bash
# Deploys AttestationRegistry (forwarder = Sepolia MockKeystoneForwarder) and a demo AgentWallet to Sepolia,
# then funds the agent signer for gas and writes both addresses into control-eval/config.staging.json.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
S="$HOME/.attesta-secrets"
RPC="${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
pk=$(jq -r '.[0].private_key' "$S/sepolia-deployer.json")
# REGISTRY_ONLY=1 redeploys just the registry and keeps the existing AgentWallet in the config.
if [ "${REGISTRY_ONLY:-0}" = 1 ]; then export AGENT_SIGNER=0x0000000000000000000000000000000000000000
else export AGENT_SIGNER=$(jq -r '.[0].address' "$S/sepolia-agent.json"); fi
export VENDOR=$(jq -r '.[0].address' "$S/sepolia-vendor.json")

cd "$here/../../contracts/evm"
# Sepolia charges ~5x what forge's local EVM estimates for contract creation (node estimate 4.7M gas for the registry on 6 Oct 2026), hence the multiplier.
forge script script/Deploy.s.sol --rpc-url "$RPC" --private-key "$pk" --broadcast --gas-estimate-multiplier 700
run=broadcast/Deploy.s.sol/11155111/run-latest.json
reg=$(jq -r '[.transactions[] | select(.contractName=="AttestationRegistry")][0].contractAddress' "$run")
wallet=$(jq -r '[.transactions[] | select(.contractName=="AgentWallet")][0].contractAddress' "$run")

# gas money for the agent hot key so it can call pay()
[ "${REGISTRY_ONLY:-0}" = 1 ] || cast send "$AGENT_SIGNER" --value 0.003ether --rpc-url "$RPC" --private-key "$pk" >/dev/null

cfg="$here/control-eval/config.staging.json"
deployer=$(cast wallet address --private-key "$pk")
tmp=$(mktemp)
if [ "${REGISTRY_ONLY:-0}" = 1 ]; then
  for f in "$cfg" "$here/control-eval/config.agent-2.json"; do
    jq --arg reg "$reg" '.registryAddress = $reg' "$f" > "$tmp" && mv "$tmp" "$f"
  done
  echo "registry=$reg (AgentWallet unchanged)"; exit 0
fi
jq --arg reg "$reg" --arg w "$wallet" --arg s "$AGENT_SIGNER" --arg o "$deployer" --arg v "$VENDOR" '
  .registryAddress = $reg
  | (.agents[] | select(.kind == "evm")) |= (.wallet = $w
      | .policy.registeredSigner = $s | .policy.registeredAuthority = $o | .policy.allowlist = [$v])' "$cfg" > "$tmp"
mv "$tmp" "$cfg"
echo "registry=$reg wallet=$wallet signer=$AGENT_SIGNER vendor=$VENDOR"
