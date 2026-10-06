# attesta_guard (Solana devnet)

Anchor program that sits in front of an AI agent's wallet. Every agent spend goes through `spend`. A compliance authority (our relayer) calls `set_frozen(true)` when an off-chain control fails, and the next spend from that agent fails with `AgentFrozen`.

## Deployment

| Item | Value |
|---|---|
| Cluster | devnet |
| Program ID | `2ppMVjwBs8dqNppcJctfTJaVb3rtfFFe5cDmJyxCGuSW` |
| Explorer | https://explorer.solana.com/address/2ppMVjwBs8dqNppcJctfTJaVb3rtfFFe5cDmJyxCGuSW?cluster=devnet |
| IDL | [`idl/attesta_guard.json`](idl/attesta_guard.json) (TS types: `idl/attesta_guard.types.ts`) |

Deployer funding: 0.488 devnet SOL from our default dev wallet, [`2mQov9Wv...`](https://explorer.solana.com/tx/2mQov9WvhSZTeYt5e2MGkucHZvhPnbcUXg9mYYMFEWgguH2Aqv2WzPfzUsbGuwvHZa61VJXnAeAX98cbrQE6xdHH?cluster=devnet).

Demo transaction signatures are in [`deployments/demo-devnet.json`](deployments/demo-devnet.json) once the demo has run on devnet.

## Accounts

- **AgentPolicy** PDA `["policy", agent]`: agent, authority, `daily_cap` (lamports), `spent_today`, `day_index` (UTC day), `frozen`, `allowlist` (max 8 pubkeys), bumps.
- **Vault** PDA `["vault", agent]`: system-owned account that holds the agent's spendable SOL. Anyone can fund it with a plain SOL transfer. Only the program can move SOL out of it.

## Instructions

| Instruction | Signer | What it does |
|---|---|---|
| `register_agent(authority, daily_cap, allowlist)` | payer + agent | Creates the policy. The agent signs to accept the authority. |
| `set_frozen(frozen, reason_code)` | authority | Freezes or unfreezes. `reason_code` is the failing control's id. Emits `FrozenChanged`. |
| `update_policy(daily_cap, allowlist)` | authority | Changes cap and allowlist. |
| `spend(amount)` | agent | Moves `amount` lamports from vault to recipient. Fails if frozen (`AgentFrozen`, 6000) or over the daily cap (`OverDailyCap`, 6001). Emits `SpendEvent`. |

The allowlist does not block spends on-chain. `SpendEvent.allowlisted` records whether the recipient was on it. The CRE workflow reads these events as evidence, evaluates the control, and the relayer freezes the agent on a FAIL. On-chain enforcement covers only the freeze flag and the daily cap.

## Pinned versions

| Tool | Version |
|---|---|
| anchor-cli | 1.0.0 |
| anchor-lang (crate) | 1.2.0 (resolved from `^1.0.0`, locked in `Cargo.lock`) |
| @anchor-lang/core (TS) | 1.0.0 |
| solana-cli (Agave) | 3.1.11 |
| platform-tools | v1.52 (rustc 1.89.0 for SBF) |
| rust toolchain | 1.89.0 (`rust-toolchain.toml`) |
| litesvm | 0.10.0 |
| node | 24.x, pnpm 10 |

## Commands

All commands run from `programs/solana`.

```bash
anchor build                 # builds target/deploy/attesta_guard.so and target/idl
cargo test                   # litesvm tests in programs/attesta_guard/tests (needs anchor build first)
pnpm install
pnpm demo                    # devnet: register -> spend ok -> freeze -> spend rejected
```

Deploy (keys live outside the repo in `~/.attesta-secrets`, chmod 600):

```bash
scripts/deploy-devnet.sh                 # build + deploy + refresh idl/
DEMO_AGENT=persistent pnpm demo          # uses solana-agent.json = attesta-demo-agent-2
```

After a rebuild, copy `target/idl/attesta_guard.json` and `target/types/attesta_guard.ts` into `idl/` so the relayer and dashboard pick up changes.

## Keys

| File in `~/.attesta-secrets` | Role | Pubkey |
|---|---|---|
| `solana-deployer.json` | fee payer, upgrade authority | `HSevicfphZE3y4zHpKd5Cc1AuPn9DyZhNgXGnjsgE4pP` |
| `solana-guard-program.json` | program keypair | `2ppMVjwBs8dqNppcJctfTJaVb3rtfFFe5cDmJyxCGuSW` |
| `solana-authority.json` | compliance authority (relayer) | `26PteCCDtK2AButaeNLTuABN91EidBnnUEG3peB6V4n9` |
| `solana-agent.json` | demo agent `attesta-demo-agent-2` | `2pVzN7yA5qS6ozXVpxkwiSQhHy9362L9mrHwbVSBJfmM` |

The demo generates a fresh agent keypair per run, so each run creates a new policy PDA. No keypairs are committed.
