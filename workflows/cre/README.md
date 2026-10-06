# CRE control-eval workflow

A Chainlink CRE cron workflow. Every 5 minutes it collects evidence for each agent, runs three controls, and writes one `ControlResult` report per (agent, control) to `AttestationRegistry` on Ethereum Sepolia.

We only run it with `cre workflow simulate --broadcast`. Deploying to the CRE network is Early Access gated. With `--broadcast` the simulator sends real Sepolia txs to the MockKeystoneForwarder, which calls our contract's `onReport`.

## Status

| Item | Value |
|---|---|
| AttestationRegistry (Sepolia) | _pending: deployer not funded yet_ |
| AgentWallet, EVM demo agent (Sepolia) | _pending_ |
| Forwarder accepted by contract | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` (Sepolia MockKeystoneForwarder, per CRE forwarder directory) |
| Broadcast tx | _pending_ |
| Etherscan | _pending_ |
| Solana agent | live devnet RPC. Program `2ppMVjwBs8dqNppcJctfTJaVb3rtfFFe5cDmJyxCGuSW` is not deployed yet, so the workflow skips agent-2 (no report) until it is |

## Agents

Canonical ids, shared by every service. `agentId` on-chain is `keccak256(utf8 id)`.

**Table 0. Demo agents**

| Agent id | Chain | Evaluated by this workflow |
|---|---|---|
| `attesta-demo-agent-1` | Sepolia, `AgentWallet` | yes |
| `attesta-demo-agent-2` | Solana devnet, agent `2pVzN7yA5qS6ozXVpxkwiSQhHy9362L9mrHwbVSBJfmM`, policy PDA `2QAPFh8haAazrqeRhnZNqdVPittts2oQsaMQXtkTm6ZH` | yes, once the guard program is deployed and the agent registered |
| `attesta-demo-agent-3` | Cardano preprod | not yet |

If an agent's evidence can't be fetched, the workflow writes nothing for it and logs `skipped`. A missing read is not a FAIL, because a FAIL freezes the agent.

## Controls

The full catalog is in `controls/catalog.json`. Table 1 shows what this workflow runs today.

**Table 1. Controls run by control-eval**

| Control | Pass when | EVM evidence | Solana evidence |
|---|---|---|---|
| ATT-SPEND-01 | today's spend <= approved cap, and on-chain cap <= approved cap | `AgentWallet.state()` | `AgentPolicy` account (`getAccountInfo`) |
| ATT-CPTY-02 | every payee in the window is on the allowlist, and (Solana) no `SpendEvent` has `allowlisted = false` | `Payment` logs, last 100 blocks | `SpendEvent` in last N txs (`getSignaturesForAddress` + `getTransaction`) |
| ATT-KEY-03 | signer and authority equal the registered ones | `AgentWallet.state()` | `AgentPolicy.agent` / `.authority` |

The "policy of record" (approved cap, allowlist, registered signer and authority) lives in `config.staging.json` per agent. On-chain state is compared against it, so raising the cap on-chain or swapping a key shows up as a failure. An empty `allowlist` in the config means "use the allowlist stored in the Solana AgentPolicy"; the evidence JSON records which one was used.

Evaluation logic is pure TypeScript in `control-eval/lib/controls.ts`, with unit tests in `control-eval/test/` (`bun test`).

## Report format

```
abi.encode(bytes32 controlId, bytes32 agentId, bool pass, bytes32 evidenceHash, uint64 ts)
controlId = keccak256(utf8 "ATT-SPEND-01"), agentId = keccak256(utf8 "attesta-demo-agent-1")
evidenceHash = keccak256(evidence JSON, logged by the workflow), ts = runtime.now() in unix seconds
```

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

## RPCs

- **Sepolia:** `project.yaml` uses `${SEPOLIA_RPC_URL}`. `scripts/env.sh` defaults it to PublicNode (`https://ethereum-sepolia-rpc.publicnode.com`, public, no key). To use NOWNodes, add `SEPOLIA_RPC_URL=https://eth-sepolia.nownodes.io/<key>` to `~/.attesta-secrets/cre.env`. The deploy and demo scripts read the same variable.
- **Solana:** `solana.rpcUrl` in the agent config. For a keyed RPC set `solana.apiKeyHeader` (NOWNodes uses `api-key`), set `secrets-path: "../secrets.yaml"` in `workflow.yaml`, and put `SOLANA_RPC_API_KEY=<key>` in `~/.attesta-secrets/cre.env`.

## Setup (once)

1. Install the CRE CLI with a checksum check:

   ```bash
   gh release download v1.37.0 -R smartcontractkit/cre-cli -p cre_linux_amd64.tar.gz
   echo "1e660e955be607bca3ae683d5f264bb354252f6af657f0d86e56108438536503  cre_linux_amd64.tar.gz" | sha256sum -c
   tar -xzf cre_linux_amd64.tar.gz && install -m 755 cre_v1.37.0_linux_amd64 ~/.local/bin/cre
   ```

2. Auth. `cre` needs a login for `init` and `simulate`. For headless use, create an API key at https://app.chain.link (Account Settings) and save it outside the repo:

   ```bash
   umask 077; echo 'CRE_API_KEY=<key>' > ~/.attesta-secrets/cre.env
   ```

3. Keys, all made with `cast wallet new --json`, chmod 600, in `~/.attesta-secrets/`: `sepolia-deployer.json` (pays gas, owns contracts), `sepolia-agent.json` (EVM agent hot key), `sepolia-vendor.json` (allowlisted payee). Fund the deployer with about 0.05 Sepolia ETH.

4. Contract deps:

   ```bash
   cd contracts/evm
   git clone -q --depth 1 -b v1.17.0 https://github.com/foundry-rs/forge-std lib/forge-std
   git clone -q --depth 1 -b v5.4.0 https://github.com/OpenZeppelin/openzeppelin-contracts lib/openzeppelin-contracts
   ```

## Run

```bash
# tests
(cd contracts/evm && SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com forge test)
(cd workflows/cre/control-eval && bun install && bun test)

# deploy registry + demo AgentWallet, fund agent gas, patch config.staging.json with the addresses
workflows/cre/scripts/deploy-registry.sh

# make the EVM agent pay someone (vendor = allowlisted, stranger = not)
workflows/cre/scripts/demo-pay.sh vendor 0.001

# dry run, then real txs
workflows/cre/scripts/simulate.sh
workflows/cre/scripts/simulate.sh --broadcast

# check
cast call <registry> "isCompliant(bytes32)(bool)" $(cast keccak attesta-demo-agent-1) --rpc-url $SEPOLIA_RPC_URL
```

`scripts/env.sh` builds `~/.attesta-secrets/cre-sim.env` (chmod 600) and passes it with `-e`. No key ever sits in the repo.

## Demo script

1. `demo-pay.sh vendor` then `simulate.sh --broadcast`: all three EVM controls pass, `isCompliant` is true.
2. `demo-pay.sh stranger` then `simulate.sh --broadcast`: ATT-CPTY-02 fails for the EVM agent, `isCompliant` turns false.
3. Solana agent-2 spends to a key that is not on its allowlist (spend still succeeds on-chain, `SpendEvent.allowlisted = false`). Next run writes ATT-CPTY-02 FAIL for agent-2; the relayer freezes it.

Fixture mode (`solana.mode: "fixture"`) exists for tests only. Fixture results are evaluated and logged but never written on-chain, so no demo tx can point at made-up data.

## Things that bite

- The MockKeystoneForwarder does not revert when `onReport` reverts. The tx shows success on Etherscan and the forwarder emits `ReportProcessed(..., result=false)`. The workflow checks `receiverContractExecutionStatus` and throws, so read the simulator log, not only the tx status.
- The simulator's forwarder does not pass real workflow metadata. Leave `setExpectedAuthor` at `address(0)` while simulating. Turn it on (and `setForwarderAddress` to the production KeystoneForwarder) once we have deploy access.
- CRE caps a log query at 100 blocks. ATT-CPTY-02 on EVM only sees the last 100 blocks per run. With a 5 minute cron (about 25 blocks) the windows overlap, so nothing is skipped while the workflow runs on schedule.
- `evmLogBlockTag` is `latest` for the demo so a payment shows up on the next run. Use `finalized` on a real DON; `latest` can differ between nodes.
- One run sends up to 6 report txs (2 agents x 3 controls). `cre workflow limits export` shows `ChainWrite.TargetsLimit: 10`. We read that as max writes per run (not confirmed in docs), which would cap us at 3 agents per run.
- `test/MockForwarderFork.t.sol` calls the live Sepolia mock forwarder on a fork, so the forwarder path is tested before we spend gas.
- To refresh the Solana fixture: `bun test/fixture.ts` prints new `policyB64`, `txs` and the base58 keys used.
