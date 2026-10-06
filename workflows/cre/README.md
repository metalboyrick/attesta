# CRE control-eval workflow

A Chainlink CRE cron workflow. It evaluates one control (`ATT-SPEND-01`, agent daily spend at or under its cap), hashes the evidence, and writes a `ControlResult` report to `AttestationRegistry` on Ethereum Sepolia.

We only run it with `cre workflow simulate --broadcast`. Deploying to the CRE network is Early Access gated. With `--broadcast` the simulator sends a real Sepolia tx to the MockKeystoneForwarder, which calls our contract's `onReport`.

## Status

| Item | Value |
|---|---|
| AttestationRegistry (Sepolia) | _pending: deployer not funded yet_ |
| Forwarder accepted by contract | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` (Sepolia MockKeystoneForwarder, per CRE forwarder directory) |
| Broadcast tx | _pending_ |
| Etherscan | _pending_ |

## Pinned versions

| Tool | Version | Notes |
|---|---|---|
| CRE CLI | v1.37.0 | `cre_linux_amd64.tar.gz`, sha256 `1e660e955be607bca3ae683d5f264bb354252f6af657f0d86e56108438536503` |
| `@chainlink/cre-sdk` | 1.23.0 | exact pin in `control-eval/package.json` |
| viem / zod / typescript | 2.34.0 / 3.25.76 / 5.9.3 | same pins as the official cre-templates |
| Bun | 1.3.11 | docs need >= 1.2.21 |
| Javy (pulled by cre-sdk) | v8.1.0 | downloaded to `~/.cache/javy` on first compile |
| Foundry | forge 1.7.1, solc 0.8.26 | |
| OpenZeppelin | v5.4.0 | `lib/` is gitignored, see setup |
| forge-std | v1.17.0 | |

RPC: PublicNode `https://ethereum-sepolia-rpc.publicnode.com` (public, no key). We did not set up NOWNodes.

## Report format

```
abi.encode(bytes32 controlId, bytes32 agentId, bool pass, bytes32 evidenceHash, uint64 ts)
controlId = keccak256("ATT-SPEND-01"), agentId = keccak256("attesta-demo-agent-1")
evidenceHash = keccak256(evidence JSON), ts = runtime.now() in unix seconds
```

## Setup (once)

1. Install the CRE CLI with checksum check:

   ```bash
   gh release download v1.37.0 -R smartcontractkit/cre-cli -p cre_linux_amd64.tar.gz
   echo "1e660e955be607bca3ae683d5f264bb354252f6af657f0d86e56108438536503  cre_linux_amd64.tar.gz" | sha256sum -c
   tar -xzf cre_linux_amd64.tar.gz && install -m 755 cre_v1.37.0_linux_amd64 ~/.local/bin/cre
   ```

2. Auth. `cre` needs a login for `init` and `simulate`. For headless use, create an API key at https://app.chain.link (Account Settings) and save it outside the repo:

   ```bash
   umask 077; echo 'CRE_API_KEY=<key>' > ~/.attesta-secrets/cre.env
   ```

3. Sepolia key. Ours was made with `cast wallet new --json > ~/.attesta-secrets/sepolia-deployer.json` (chmod 600). Fund its address with Sepolia ETH.

4. Contract deps:

   ```bash
   cd contracts/evm
   git clone -q --depth 1 -b v1.17.0 https://github.com/foundry-rs/forge-std lib/forge-std
   git clone -q --depth 1 -b v5.4.0 https://github.com/OpenZeppelin/openzeppelin-contracts lib/openzeppelin-contracts
   ```

## Run

```bash
# contract tests (fork test runs only when SEPOLIA_RPC_URL is set)
cd contracts/evm && SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com forge test

# deploy registry (forwarder = Sepolia MockKeystoneForwarder)
workflows/cre/scripts/deploy-registry.sh
# then put the address in workflows/cre/control-eval/config.staging.json -> registryAddress

# dry run, then real tx
workflows/cre/scripts/simulate.sh
workflows/cre/scripts/simulate.sh --broadcast

# check
cast call <registry> "isCompliant(bytes32)(bool)" $(cast keccak attesta-demo-agent-1) --rpc-url https://ethereum-sepolia-rpc.publicnode.com
```

`scripts/env.sh` builds `~/.attesta-secrets/cre-sim.env` (chmod 600) from the secrets dir and passes it with `-e`. No key ever sits in the repo.

## Things that bite

- The MockKeystoneForwarder does not revert when `onReport` reverts. The tx shows success on Etherscan and the forwarder emits `ReportProcessed(..., result=false)`. The workflow checks `receiverContractExecutionStatus` and throws, so read the simulator log, not only the tx status.
- The simulator's forwarder does not pass real workflow metadata. Leave `setExpectedAuthor` at `address(0)` while simulating. Turn it on (and `setForwarderAddress` to the production KeystoneForwarder) once we have deploy access.
- `test/MockForwarderFork.t.sol` calls the live Sepolia mock forwarder on a fork, so the forwarder path is tested before we spend gas.
