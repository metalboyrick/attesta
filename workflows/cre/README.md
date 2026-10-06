# CRE control-eval workflow

A Chainlink CRE workflow with a cron trigger. Each run collects evidence for every agent, runs three controls, and writes one `ControlResult` report per (agent, control) to `AttestationRegistry` on Ethereum Sepolia.

**How it runs today.** Every run is a manual `cre workflow simulate --broadcast`. The simulator fires the cron trigger once, runs the workflow on our machine, and sends real Sepolia txs through Chainlink's MockKeystoneForwarder, which calls our contract's `onReport`. The 5 minute cron schedule only takes effect once the workflow is deployed to the CRE network. Deployment is Early Access and we don't have it. Chainlink confirmed in the hackathon chat that simulation is enough for the submission.

## Status

| Item | Value |
|---|---|
| AttestationRegistry v2 (current) | [`0x48a80a9d7e319c29e5e309d7932c467810680935`](https://sepolia.etherscan.io/address/0x48a80a9d7e319c29e5e309d7932c467810680935), deploy block 11857427 ([deploy tx](https://sepolia.etherscan.io/tx/0x3529ec1153fe3cad760d398b73cf2bd8aa61e4eda4479dab85c75b3ee239b8ac)). Adds the security fixes below |
| AttestationRegistry v1 (retired) | [`0xbc675484a8c2c51174efb8b5369250eb8337750d`](https://sepolia.etherscan.io/address/0xbc675484a8c2c51174efb8b5369250eb8337750d), deploy block 11857314. Tables A and B went to v1 |
| AgentWallet, EVM agent-1 (Sepolia) | [`0xdd181c02a2979d13f4124dcd628cfe96c3248f2f`](https://sepolia.etherscan.io/address/0xdd181c02a2979d13f4124dcd628cfe96c3248f2f) |
| Forwarder accepted by the registry | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` (Sepolia MockKeystoneForwarder, from the CRE forwarder directory) |
| Solana guard program (devnet) | `2ppMVjwBs8dqNppcJctfTJaVb3rtfFFe5cDmJyxCGuSW` |
| CRE CLI | v1.37.0 |

## Registry v2 run (6 Oct 2026, 17:51 UTC)

The first run against v2. Agent-2's off-allowlist spends from Table B are still inside its window (no unfreeze since), so ATT-CPTY-02 fails again. That run stopped before agent-3's writes. An agent-3-only run at 17:55 UTC filled them in, and agent-3 is compliant on v2.

**Table V2. Registry v2 txs**

| Agent | Control | Result | Tx |
|---|---|---|---|
| attesta-demo-agent-1 | ATT-SPEND-01 | PASS | [0x08f5af62...](https://sepolia.etherscan.io/tx/0x08f5af623c6b479fdbfd161b39b542e895dcbfda1f2f841bd7b5a406d3ec3047) |
| attesta-demo-agent-1 | ATT-CPTY-02 | PASS | [0xd17ca0c7...](https://sepolia.etherscan.io/tx/0xd17ca0c7dcb4e20fe781e253f7a973141353810dab17f35c2eb98fa9dced2774) |
| attesta-demo-agent-1 | ATT-KEY-03 | PASS | [0x6b8ca56d...](https://sepolia.etherscan.io/tx/0x6b8ca56daff25bf603b7d5b66e195b0cc89acc3518458b9544224536fe671747) |
| attesta-demo-agent-2 | ATT-SPEND-01 | PASS | [0xb203cf14...](https://sepolia.etherscan.io/tx/0xb203cf14903b46fed0bb15c0b916bd55f5d8d4774770bd788a7bf38059f5c286) |
| attesta-demo-agent-2 | ATT-CPTY-02 | **FAIL** | [0x3deba58e...](https://sepolia.etherscan.io/tx/0x3deba58eb5840585f550fba8a61815153813c70acda1ce637204edeb7523748b) |
| attesta-demo-agent-2 | ATT-KEY-03 | PASS | [0x6b5fafbd...](https://sepolia.etherscan.io/tx/0x6b5fafbd472e78cdb4cfe2efd5e143ac40d7ede31aba2b2d6549a77ea22e722f) |
| attesta-demo-agent-3 | ATT-SPEND-01 | PASS | [0xd8faa288...](https://sepolia.etherscan.io/tx/0xd8faa2884d27e3d60114666dadd8dce1b58e3c86fac3de44be37c63a7d5925ef) (agent-3-only run, 17:55 UTC) |
| attesta-demo-agent-3 | ATT-CPTY-02 | PASS | [0x5fae4066...](https://sepolia.etherscan.io/tx/0x5fae40666bef6ac82ff501666a5ba7b2a3bd49c11d353668bb4136d55ebf7bf6) (agent-3-only run) |

**Run time.** Measured wall clock from `simulate.sh` start to the last receipt: the agent-3-only run (2 writes) took 37 s. About 11 s is startup (dependency check, WASM compile, simulator init), then each write waits for its own receipt, about 12 s per Sepolia block, one after another. Expect about 50 s for an agent-2-only run (3 writes) and about 110 s for a full run (8 writes).

## First broadcast run, v1 registry (6 Oct 2026, 17:30 UTC)

Every tx below went through the MockKeystoneForwarder and emitted `ControlResult` from the registry. We checked the receipts, not only the simulator log. After the run, `isCompliant` was true for agent-1 and agent-3. Agent-2 was skipped because its Solana policy account did not exist yet.

**Table A. Broadcast txs**

| Agent | Control | Result | Tx |
|---|---|---|---|
| attesta-demo-agent-1 | ATT-SPEND-01 | PASS | [0xd0fdfbd1...](https://sepolia.etherscan.io/tx/0xd0fdfbd143dcfab42b8e0e5a84543d39f3973dd611437fda58c8e351f3fdafca) |
| attesta-demo-agent-1 | ATT-CPTY-02 | PASS | [0xa9b281eb...](https://sepolia.etherscan.io/tx/0xa9b281ebed3b8d286caf80581e9ce7d31374e2e19597cbc3e0878d6782966951) |
| attesta-demo-agent-1 | ATT-KEY-03 | PASS | [0xfd8fea00...](https://sepolia.etherscan.io/tx/0xfd8fea00ed94b083a878f21c465da66c8443a8af326857f98638b2980e2d2c2f) |
| attesta-demo-agent-3 | ATT-SPEND-01 | PASS | [0x95a3fbb7...](https://sepolia.etherscan.io/tx/0x95a3fbb7152dd9dc464341e10f828a3f3ee46abb430a93cf35c177c92fd4c188) |
| attesta-demo-agent-3 | ATT-CPTY-02 | PASS | [0x5e52ffbb...](https://sepolia.etherscan.io/tx/0x5e52ffbb1a5498182ceb6efb2e2a6482357e3c70d0247947e9155c9abf952709) |

The evidence behind these hashes is real activity. Agent-1 paid the allowlisted vendor 0.001 ETH in [0xdf8cbb9b...](https://sepolia.etherscan.io/tx/0xdf8cbb9b0710896c5cfafa76ed0b3986a4ac7619b3813db6d96b6a67cfb1c878). Agent-3 made one payment to the x402 seller on Cardano preprod, read from Koios.

## Failure flow end to end, v1 registry (6 Oct 2026, 17:35 to 17:37 UTC)

Agent-2 pays someone off its allowlist on Solana. CRE writes ATT-CPTY-02 FAIL to Sepolia. The relayer freezes the agent on Solana, and the next spend is rejected on-chain.

**Table B. Agent-2 failure flow**

| Step | Chain | What happened | Tx |
|---|---|---|---|
| 1 | Solana devnet | Agent-2 spends 0.002 SOL to `Eg2z7iSr...`, which is not allowlisted. The spend succeeds with `SpendEvent.allowlisted = false` | [3fJ3Azi6...](https://explorer.solana.com/tx/3fJ3Azi6FwyMeq3mr4L51C3CpESgMise5tvAr8Nj2kY3LT8516V5kcd9tbkD8AUmaEX5PRUkkqr33ehSAEymbcKr?cluster=devnet) |
| 1b | Solana devnet | A second off-allowlist spend to the same payee about 10 s later. CRE cites this one in its evidence | [3eK9tjdr...](https://explorer.solana.com/tx/3eK9tjdrgRbU1PjVS8E15k3LmmtsJywFTB8HWCmPvZLQuBhv8UceLkmq1arVn7AwyXQHMPNJ1ewwec4qD3M9gGQe?cluster=devnet) |
| 2 | Sepolia | CRE writes **ATT-CPTY-02 FAIL** for agent-2 (evidenceHash `0x97496a9d...`). `isCompliant(agent-2)` turns false | [0x462eb21b...](https://sepolia.etherscan.io/tx/0x462eb21b0bb352dfadd5cdf1fefeca8ab62b7f49c30e48da645fcf63d83b6e20) |
| 2b | Sepolia | Same run: ATT-SPEND-01 PASS and ATT-KEY-03 PASS | [0x7068b8c1...](https://sepolia.etherscan.io/tx/0x7068b8c1bb50faf83dbdde25b5e0f9c2da26c7541c9a6df216ae810f480ed1af), [0xaf118ed4...](https://sepolia.etherscan.io/tx/0xaf118ed4e375339a44ff06ddb247996ba32073e338610795baa972b53dd37d70) |
| 3 | Solana devnet | The relayer sees the FAIL and calls `set_frozen(true)`. Its memo links the Sepolia tx | [2P8GkxMn...](https://explorer.solana.com/tx/2P8GkxMnBBfcRd7htXypUBPBPzAikT96R3xnyrGgwfUbihhamPSG52vw1hVZuuitC7myVJK2yRShWhirh7MQSCUB?cluster=devnet) |
| 4 | Solana devnet | Agent-2 tries to pay its allowlisted payee and is rejected with `AgentFrozen` (custom error 6000) | [39or4JG4...](https://explorer.solana.com/tx/39or4JG4js1iUkPMexRomWEPt9dyjGSS6K3gqCd1F3Mzs2FnyAzaEqjoJpfVLNx2xLDhDJ2Fhfo9Qu2RtTyFrCgZ?cluster=devnet) |

The Sepolia FAIL block (11857358) has timestamp 17:36:00 UTC. The freeze tx has Solana block time 17:36:08 UTC. That's 8 seconds by the two chains' block clocks, which can drift by a few seconds.

To run it again: `cd programs/solana && pnpm spend -- unknown 2000000`, then `workflows/cre/scripts/simulate.sh --config ./config.agent-2.json --broadcast`. That's 3 writes and about 0.002 Sepolia ETH.

## Agents

These ids are shared by every service. On-chain, `agentId` is `keccak256(utf8 id)`.

**Table C. Demo agents**

| Agent id | Chain | Controls run |
|---|---|---|
| `attesta-demo-agent-1` | Sepolia, `AgentWallet` | all three |
| `attesta-demo-agent-2` | Solana devnet, agent `2pVzN7yA5qS6ozXVpxkwiSQhHy9362L9mrHwbVSBJfmM`, policy PDA `2QAPFh8haAazrqeRhnZNqdVPittts2oQsaMQXtkTm6ZH` | all three |
| `attesta-demo-agent-3` | Cardano preprod, x402 buyer wallet `addr_test1qz26gtjx...q2qc2rg` (Koios) | ATT-SPEND-01 and ATT-CPTY-02. It's a plain key address, so there's no separate authority for ATT-KEY-03 to check |

If we can't read an agent's evidence, the workflow writes nothing for it and logs `skipped`. A failed read is not a FAIL, because a FAIL freezes the agent.

## Controls

The full catalog is in `controls/catalog.json`. Table D shows the three controls this workflow runs.

**Table D. Controls run by control-eval**

| Control | Passes when | EVM evidence | Solana evidence | Cardano evidence |
|---|---|---|---|---|
| ATT-SPEND-01 | Today's spend <= approved cap, and on-chain cap <= approved cap | `AgentWallet.state()` | `AgentPolicy` account | Sum of today's outflows (Koios) |
| ATT-CPTY-02 | Every payee in the window is on the allowlist. On Solana, also no `SpendEvent` with `allowlisted = false` | `Payment` logs, last 100 blocks | `SpendEvent` since the later of UTC day start and the latest unfreeze | Today's payees (Koios) |
| ATT-KEY-03 | Signer and authority equal the registered ones | `AgentWallet.state()` | `AgentPolicy.agent` and `.authority` | not run |

- **Policy of record.** The approved cap, allowlist, signer and authority live in the agent's config. We compare on-chain state against them, so raising the cap on-chain or swapping a key shows up as a failure. An empty `allowlist` in the config means "use the allowlist stored in the Solana `AgentPolicy`". The evidence JSON records which one we used.
- **Window after an unfreeze.** On Solana, ATT-CPTY-02 only looks at spends after the agent's latest unfreeze (`FrozenChanged` with `frozen = false`). Once a person reviews a FAIL and unfreezes the agent, the spend that caused it doesn't fail the next run again. The evidence records `windowStart`.
- **Cardano spend.** A tx counts as spend when one of its inputs is the agent's. Outputs to the agent's own payment credential are change. Only lovelace counts toward the cap.

The evaluation logic is plain TypeScript in `control-eval/lib/controls.ts`, with unit tests in `control-eval/test/` (`bun test`).

## Per-run budget

These numbers are checked against `cre workflow limits export` (CLI v1.37.0).

**Table E. Calls per run vs limits**

| Resource | Use per run | Limit |
|---|---|---|
| EVM chain reads | 3 (header, `state()`, `Payment` logs) | 15 |
| HTTP calls | Solana 2 + up to 8 `getTransaction`; Cardano 2 (1 if no txs today). Max 12 | 15 |
| Chain writes | 3 + 3 + 2 = 8 reports | 10 (`ChainWrite.TargetsLimit`) |
| Consensus observation | Cardano capped at 20 KB in code (about 8 KB for 10 real txs). Solana keeps only `Program data:` lines | 25 KB |
| Report size | 160 bytes each | 50 KB |

Cardano reads today's txs only (`block_time >= UTC day start`, limit 10). If Koios returns 10 rows, the day may be cut off, so we skip the agent rather than give it a PASS on partial data.

Cost on Sepolia today: a first write to a new (agent, control) slot uses about 705k gas, so `gasLimit` is 1,500,000. A run of 5 first writes cost about 0.004 Sepolia ETH.

## Report format

```
abi.encode(bytes32 controlId, bytes32 agentId, bool pass, bytes32 evidenceHash, uint64 ts)
controlId = keccak256(utf8 "ATT-SPEND-01"), agentId = keccak256(utf8 "attesta-demo-agent-1")
evidenceHash = keccak256(evidence JSON, logged by the workflow), ts = runtime.now() in unix seconds
```

## Security notes

- **Simulate-only stopgap.** The Sepolia MockKeystoneForwarder is permissionless and checks no signatures, so anyone can call it. Registry v2 also requires `tx.origin == reporter`, the EOA that broadcasts `cre workflow simulate`. The reporter defaults to the deployer, and the owner can change it. This doesn't authenticate the DON. With a deployed workflow behind the production KeystoneForwarder, which checks signed reports, we'd drop it and pin `setExpectedAuthor` instead. Registry v1 does not have this check.
- **Report bounds (v2).** A `ts` more than 300 s ahead of block time reverts (`FutureTimestamp`). A `ts` older than the stored one reverts (`StaleReport`). The owner can `resetResult(agent, control)`. Only the 8 catalog control ids are accepted; anything else reverts with `UnknownControl`.
- **Reverts don't fail the tx.** The MockKeystoneForwarder doesn't revert when `onReport` reverts. Etherscan shows success and the forwarder emits `ReportProcessed(..., result=false)`. The workflow checks `receiverContractExecutionStatus` and throws, so read the simulator log, not only the tx status.

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

- **Sepolia.** `project.yaml` uses `${SEPOLIA_RPC_URL}`. `scripts/env.sh` picks, in order: `SEPOLIA_RPC_URL` from `~/.attesta-secrets/cre.env`, then NOWNodes with the key in the URL path when `~/.attesta-secrets/nownodes.env` exists (CRE RPC entries take no headers), then PublicNode (`https://ethereum-sepolia-rpc.publicnode.com`, public, no key). The deploy and demo scripts read `SEPOLIA_RPC_URL` from the environment.
- **Solana.** Set `solana.rpcUrl` in the agent config. For a keyed RPC, set `solana.apiKeyHeader` (NOWNodes uses `api-key`), set `secrets-path: "../secrets.yaml"` in `workflow.yaml`, and put `SOLANA_RPC_API_KEY=<key>` in `~/.attesta-secrets/cre.env`.

## Setup (once)

1. Install the CRE CLI with a checksum check:

   ```bash
   gh release download v1.37.0 -R smartcontractkit/cre-cli -p cre_linux_amd64.tar.gz
   echo "1e660e955be607bca3ae683d5f264bb354252f6af657f0d86e56108438536503  cre_linux_amd64.tar.gz" | sha256sum -c
   tar -xzf cre_linux_amd64.tar.gz && install -m 755 cre_v1.37.0_linux_amd64 ~/.local/bin/cre
   ```

2. Log in with `cre login`. It opens a browser, and the session lives in `~/.cre`. API-key auth needs separate approval from Chainlink. If you have a key, save it outside the repo:

   ```bash
   umask 077; echo 'CRE_API_KEY=<key>' > ~/.attesta-secrets/cre.env
   ```

3. Make the keys with `cast wallet new --json`, chmod 600, in `~/.attesta-secrets/`: `sepolia-deployer.json` (pays gas, owns contracts, broadcasts reports), `sepolia-agent.json` (EVM agent hot key), `sepolia-vendor.json` (allowlisted payee). Fund the deployer with about 0.05 Sepolia ETH.

4. Install the contract deps:

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

# deploy registry + AgentWallet, fund agent gas, patch config.staging.json
workflows/cre/scripts/deploy-registry.sh
# or redeploy only the registry and keep the AgentWallet
REGISTRY_ONLY=1 workflows/cre/scripts/deploy-registry.sh

# make the EVM agent pay someone (vendor = allowlisted, stranger = not)
workflows/cre/scripts/demo-pay.sh vendor 0.001

# receiver-free dry run: real reads and evaluation, no report, no tx, no ETH. Log goes to workflows/cre/SIMULATION.md
workflows/cre/scripts/simulate-local.sh

# dry run, then real txs
workflows/cre/scripts/simulate.sh
workflows/cre/scripts/simulate.sh --broadcast

# check
cast call <registry> "isCompliant(bytes32)(bool)" $(cast keccak attesta-demo-agent-1) --rpc-url $SEPOLIA_RPC_URL
```

`scripts/env.sh` builds `~/.attesta-secrets/cre-sim.env` (chmod 600) and passes it with `-e`. No key ever sits in the repo.

## Demo script

1. `demo-pay.sh vendor` then `simulate.sh --broadcast`. All three EVM controls pass and `isCompliant` is true.
2. `demo-pay.sh stranger` then `simulate.sh --broadcast`. ATT-CPTY-02 fails for the EVM agent and `isCompliant` turns false.
3. Agent-2 spends to a key off its allowlist on Solana. The next run writes ATT-CPTY-02 FAIL and the relayer freezes it (Table B).

Fixture mode (`solana.mode: "fixture"`) exists for tests only. We evaluate and log fixture results but never write them on-chain, so no demo tx can point at made-up data.

## Things that bite

- **Simulator metadata.** The simulator's forwarder doesn't pass real workflow metadata, so leave `setExpectedAuthor` at `address(0)` while simulating.
- **EVM log window.** CRE caps a log query at 100 blocks, so ATT-CPTY-02 on EVM only sees the last 100 blocks per run. With a 5 minute cron (about 25 blocks) the windows would overlap. With manual runs, a payment older than about 20 minutes drops out of view.
- **Block tag.** `evmLogBlockTag` is `latest` for the demo, so a payment shows up on the next run. Use `finalized` on a real DON, because `latest` can differ between nodes.
- **Write limit.** One run sends up to 8 report txs. We read `ChainWrite.TargetsLimit: 10` as the max writes per run; the docs don't confirm that.
- **Fork test.** `test/MockForwarderFork.t.sol` calls the live Sepolia mock forwarder on a fork, so we test the forwarder path before spending gas.
- **Idle agents pass.** An agent with no payments today passes ATT-SPEND-01 and ATT-CPTY-02, because zero spend breaks neither rule. The evidence JSON shows `paymentsSeen: 0` and `spentToday: "0"`, so a reader can tell an idle agent from a busy compliant one.
- **Local simulation.** The `local-simulation` target follows Chainlink's CRE skill pattern with one difference: it still creates an `EVMClient`, because the EVM agent's evidence is an on-chain read. It never builds a report or calls `writeReport`. Production configs must set `mode: "production"` and a nonzero `registryAddress`, or the run fails.
- **Deploy gas.** On 6 Oct 2026, Sepolia charged about 5x what forge's local EVM estimates for contract creation (the node's `eth_estimateGas` gave 4.7M for the registry). Two deploys ran out of gas before `deploy-registry.sh` got `--gas-estimate-multiplier 700`.
- **Refreshing the Solana fixture.** `bun test/fixture.ts` prints a new `policyB64`, `txs` and the base58 keys it used.
