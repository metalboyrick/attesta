# Attesta

Continuous compliance for AI agents that move money on-chain.

Every agent gets a **safety score**: controls passing out of controls tested. Every point in that score is backed by a result on-chain. A Chainlink CRE workflow reads what the agent actually did on Solana, Ethereum and Cardano, checks it against the agent's approved policy, and writes one result per control to a registry on Ethereum Sepolia, with a hash of the evidence. When a control fails, a relayer freezes the agent on Solana and its next spend is rejected. Other agents can pay 1 tADA over x402 on Cardano to check an agent's score before they deal with it.

We built it at 2049 Origins in Singapore. All work in this repo started after kickoff at 12:00 SGT on 6 Oct 2026. Testnets only.

## Try it

| What | Link |
|---|---|
| Dashboard (fleet, safety scores, evidence pack) | https://hose-cancer-screw-reef.trycloudflare.com |
| Paid check (x402 on Cardano preprod, returns HTTP 402 with payment terms) | https://dedicated-successfully-variance-fortune.trycloudflare.com/attest/attesta-demo-agent-2 |

Both live links are Cloudflare quick tunnels to our hosted containers. If a link is down, the run steps below bring each part up locally.

## How it fits together

```text
  Solana devnet            Ethereum Sepolia                 Cardano preprod
  ─────────────            ────────────────                 ───────────────
  agent-2 spends           agent-1 AgentWallet              agent-3 wallet (x402 buyer)
  via attesta_guard        (state + Payment logs)           (payments, via Koios)
  (SpendEvent logs)               │                                 │
         │                        │                                 │
         └──────────────►  Chainlink CRE workflow  ◄────────────────┘
                           control-eval: ATT-SPEND-01, ATT-CPTY-02, ATT-KEY-03
                                  │
                                  │ one report per (agent, control),
                                  │ through the MockKeystoneForwarder
                                  ▼
                           AttestationRegistry v2 (Sepolia)
                           result + evidence hash per control
                │                 │                         │
                │ ControlResult   │ isCompliant / getResult │
                ▼                 ▼                         ▼
             relayer          dashboard                 x402 seller
             FAIL -> freeze   safety score,             1 tADA per check,
             agent on Solana  evidence pack             DEAL / DECLINE
```

## Addresses

| Component | Network | Address |
|---|---|---|
| AttestationRegistry v2 | Ethereum Sepolia | [`0x48a80a9d7e319c29e5e309d7932c467810680935`](https://sepolia.etherscan.io/address/0x48a80a9d7e319c29e5e309d7932c467810680935), deploy block 11857427 |
| AgentWallet (agent-1) | Ethereum Sepolia | [`0xdd181c02a2979d13f4124dcd628cfe96c3248f2f`](https://sepolia.etherscan.io/address/0xdd181c02a2979d13f4124dcd628cfe96c3248f2f) |
| Forwarder the registry accepts | Ethereum Sepolia | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` (Chainlink MockKeystoneForwarder) |
| attesta_guard program | Solana devnet | [`2ppMVjwBs8dqNppcJctfTJaVb3rtfFFe5cDmJyxCGuSW`](https://explorer.solana.com/address/2ppMVjwBs8dqNppcJctfTJaVb3rtfFFe5cDmJyxCGuSW?cluster=devnet) |
| x402 seller (receives 1 tADA per check) | Cardano preprod | `addr_test1qztvnhavscfaupuwy824jem5z8dxavkzz6ukg4xyzls3gn2mejfgg4sl7sj4rdxxdnzsqvpkzwu0v39338t9aj6p6q7stjznf6` |

**Table 1. Demo agents.** On-chain, `agentId` is `keccak256` of the id string.

| Agent id | Chain | Controls |
|---|---|---|
| `attesta-demo-agent-1` | Sepolia AgentWallet | SPEND, CPTY, KEY |
| `attesta-demo-agent-2` | Solana devnet, guarded by `attesta_guard` | SPEND, CPTY, KEY |
| `attesta-demo-agent-3` | Cardano preprod, the x402 buyer wallet | SPEND, CPTY |

## The demo take (6 Oct 2026, UTC)

One live run against the hosted dashboard, the hosted seller and registry v2. Every hash was checked by RPC afterwards.

**Table 2. Demo transactions**

| Time (block) | What happened | Tx |
|---|---|---|
| 18:05:08 | Agent-2 pays its allowlisted payee on Solana | [5keYPidZ...](https://explorer.solana.com/tx/5keYPidZWiihi9pd697j3WUSZo2QtKQUnKmN2fW2HVTGH1LjsHpPfd65bJ1LkaJDHTgxnjzCCY4aPV9WRZMQwBUX?cluster=devnet) |
| 18:06:13 | Agent-2 pays `Eg2z7iSr...`, not on its allowlist. The spend goes through and is flagged | [4GRF9GGW...](https://explorer.solana.com/tx/4GRF9GGWFKkoG7GZaMv3HJVmNNTCR5ek1r4GyRFCkTESqAqPLmFX5twBmRivaBjNtLycGFCRUXWNYYZKi6Q8tEH6?cluster=devnet) |
| 18:07:36 | CRE writes ATT-SPEND-01 PASS (Sepolia block 11857513) | [0xaab21170...](https://sepolia.etherscan.io/tx/0xaab21170b46fbcfd6eb80c7ffab3d7acc2e88d37d489995b186adcb977f023d8) |
| 18:07:48 | CRE writes **ATT-CPTY-02 FAIL** (block 11857514) | [0x3df23115...](https://sepolia.etherscan.io/tx/0x3df231158531404ca1fae4bd6f3933e05ba87b7e8c09186fc2e2a4193461a8e2) |
| 18:07:50 | Relayer freezes agent-2 on Solana, 2 s after the FAIL block | [5kjBgPmy...](https://explorer.solana.com/tx/5kjBgPmydNNWwFv5UEAmVh723WYz5zNos2BgvoDNuXRQeANFceeDwFkNcTLUAAiU6VwB2dtgQ6GyGmTvXSaksy4W?cluster=devnet) |
| 18:08:00 | CRE writes ATT-KEY-03 PASS (block 11857515) | [0xb3650eca...](https://sepolia.etherscan.io/tx/0xb3650eca31fa2115e653c5baa8edcf5b766190d5361a7c1ebec00b0d8d1e8c37) |
| 18:08:36 | A counterparty pays 1 tADA to check agent-2. Answer: DECLINE, ATT-CPTY-02 failing, safety 2/3 | [da2505fd...](https://preprod.cardanoscan.io/transaction/da2505fd78269441cd49e93c0ff4880c15421b05a49552d8b9cf4026b71268e6) |
| 18:09:05 | Agent-2 tries to pay its allowlisted payee. Rejected with `AgentFrozen` | [5za9hQWr...](https://explorer.solana.com/tx/5za9hQWrL7YA1biVKBpf7u94WbZkkAJLQbR28a3HoLitVcuCRw5Ex2xhcAsfUfy7jN7PXVcLF6noyeuug7EpdHEc?cluster=devnet) |
| 18:09:47 | A counterparty pays 1 tADA to check agent-3. Answer: DEAL, safety 2/2 | [14776cc3...](https://preprod.cardanoscan.io/transaction/14776cc3d2afd66c0dc62ecaa5a15cdc02b979a9d4ddb0a907a64b885dc139a8) |

The agent-2 check settled on-chain at 18:08:36, but the seller first answered HTTP 402 because its settle step reported a failure after the tx had gone out. We fixed the seller to keep receipts until the tx is seen on chain. A same-nonce retry then returned the stored receipt with no second payment (buyer balance unchanged). The video shows that retry and says so in its caption.

More runs, including the first broadcast and an unfreeze-then-reset run, are in [`workflows/cre/README.md`](workflows/cre/README.md).

## By track

### Chainlink CRE

- **Workflow:** [`workflows/cre/control-eval`](workflows/cre), TypeScript SDK 1.23.0 with a cron trigger. It reads Sepolia (EVM client), Solana devnet JSON-RPC and Cardano Koios (HTTP client, with consensus), evaluates three controls, and writes one report per (agent, control) through `writeReport`.
- **Consumer contract:** [`contracts/evm/src/AttestationRegistry.sol`](contracts/evm/src/AttestationRegistry.sol). It implements `IReceiver.onReport`, keeps the latest result per (agent, control), emits `ControlResult`, and exposes `isCompliant`.
- **How it runs:** every run is a manual `cre workflow simulate --broadcast`, which sends real Sepolia txs through Chainlink's MockKeystoneForwarder. The cron schedule only applies once the workflow is deployed to the CRE network. Deployment is Early Access and we don't have it. Chainlink confirmed in the event chat that simulation is enough for submission.

### Solana

- **Program:** [`programs/solana`](programs/solana), the Anchor program `attesta_guard`. Agent spends go through a vault PDA with a daily cap. Every spend emits a `SpendEvent` that records whether the payee is allowlisted. A frozen agent can't spend.
- **Relayer:** [`services/relayer`](services/relayer). It watches `ControlResult` on Sepolia and calls `set_frozen(true)` when a control fails. Each freeze carries a memo with the Sepolia tx hash. It never unfreezes on its own; a person does that.

### Cardano x402

- **Seller:** [`services/x402-cardano`](services/x402-cardano), built from the Cardano Foundation x402-express template. `GET /attest/:agentId` answers HTTP 402, takes 1 tADA on preprod, reads the registry, and returns the agent's per-control results and safety score with a payment receipt.
- **Buyer:** the same package includes a buyer that prints DEAL or DECLINE. Agent-3 is that buyer's wallet, and the CRE workflow also checks its spending through Koios.

## Run it

Each part has its own README with exact commands and pinned versions.

| Part | README |
|---|---|
| CRE workflow, deploy and broadcast scripts | [`workflows/cre/README.md`](workflows/cre/README.md) |
| Registry and AgentWallet contracts (Foundry) | [`workflows/cre/README.md`](workflows/cre/README.md#setup-once) (tests: `cd contracts/evm && forge test`) |
| Solana guard program and spend scripts | [`programs/solana/README.md`](programs/solana/README.md) |
| Relayer | [`services/relayer/README.md`](services/relayer/README.md) |
| x402 seller and buyer | [`services/x402-cardano/README.md`](services/x402-cardano/README.md) |
| Dashboard | [`apps/dashboard/README.md`](apps/dashboard/README.md) |
| Control catalog | [`controls/README.md`](controls/README.md) |

Secrets live outside the repo in `~/.attesta-secrets/` (chmod 600). Nothing in git holds a key.

## Limits

- **Simulate mode.** Reports arrive through Chainlink's MockKeystoneForwarder, which is permissionless and checks no signatures. As a stopgap, registry v2 only accepts reports whose `tx.origin` is our reporter key, the EOA that runs the simulator. That's one key we hold, not proof that a Chainlink network produced the report. Production needs a deployed workflow behind the real KeystoneForwarder.
- **Owner powers.** The registry owner can change the reporter and forwarder and can `resetResult` for any (agent, control). The owner is currently the same key as the reporter.
- **Single relayer key.** One relayer key freezes agents. If it's down, nothing freezes.
- **3 of 8 controls built.** The catalog in [`controls/`](controls) has 8 controls mapped to SOC 2 Trust Services Criteria and ISO/IEC 42001 Annex A. Three run today: spend cap, counterparty allowlist and signing key. The mappings are our own judgment.
- **Enforcement is on Solana only.** The EVM AgentWallet and the Cardano wallet are watched and scored, but nothing on those chains blocks a payment.
- **Testnets only. Not audited.** We did one internal security review during the event and fixed the registry findings in v2. Evidence is stored on-chain as hashes; the evidence JSON itself is in the workflow logs and the dashboard export.
