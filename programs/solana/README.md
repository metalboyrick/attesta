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

Deployed 2026-10-06 (slot 508169197), upgrade authority `HSevicfphZE3y4zHpKd5Cc1AuPn9DyZhNgXGnjsgE4pP`.

Table 1. Devnet transactions for the fixed demo agent `attesta-demo-agent-2` (`2pVzN7yA5qS6ozXVpxkwiSQhHy9362L9mrHwbVSBJfmM`, policy `2QAPFh8haAazrqeRhnZNqdVPittts2oQsaMQXtkTm6ZH`).

| Step | Tx |
|---|---|
| Program deploy | [`5UsnuP8W...`](https://explorer.solana.com/tx/5UsnuP8WUQgZ4LA2f8tT7zQW82wnYECkTiUcwWAchiqHyeNYSXBR84t8EZbaU9nbXbGwTZPEgtsT7f8CdTg5iZP1?cluster=devnet) |
| register_agent | [`muE1Ginu...`](https://explorer.solana.com/tx/muE1GinuRTQMVWTYPPhYzjE6GvHR3zY9ybx4rwzcKGoj8GjS8uM4GS9fxyBbMzu7ZktSfY6Z6Qhg4jN28hwpZ3W?cluster=devnet) |
| Fund vault (0.03 SOL) | [`4KJtus6J...`](https://explorer.solana.com/tx/4KJtus6JMHBHXCpHNMuQnpYbEZjPFuWuc6j2zF9iHdU4tWAh982TR7Etvf5fj7H5ZmvBTW3fCiiCNFaCCVif8XAr?cluster=devnet) |
| spend 0.001 SOL to allowlisted payee (ok) | [`2MCLYXT3...`](https://explorer.solana.com/tx/2MCLYXT3uLCFCtcbXgk7reCghVUub2rnDVJftiStuJV5n17eLwmRZN9HwiDcWaQ4GFCAo2xjhbg1kPbJ2se2geVo?cluster=devnet) |
| set_frozen(true) by authority | [`2VguwJFi...`](https://explorer.solana.com/tx/2VguwJFiCy92cNRdeuvir8zppBLmGFD3kwgfqrQxpzZXxJrYePsTqrwRWY4K9NCARkRZEismPfHX99KTfWifnKFF?cluster=devnet) |
| spend while frozen, fails `AgentFrozen` (6000) | [`5NRcDpr7...`](https://explorer.solana.com/tx/5NRcDpr7kananQniFHnYwbyy8bPKAKtcMy7TQBxjq9Nkejf1F85ZYZs1KJgZgEoYBx9HMUELEJ6FRJ8ZMUeAnD9D?cluster=devnet) |
| set_frozen(false) by hand, before the end-to-end run in Table 2 | [`4CjTbPgc...`](https://explorer.solana.com/tx/4CjTbPgcuimChLyyHexLSnCpFphxS8HvGQ52QxCsaLYcVkDQAg9HwQ6CA1RboKcEF7WNJWpep4TZXZfD1ZgKXHxg?cluster=devnet) |

Rows 4 to 6 (spend, freeze, rejected spend) are the `pnpm demo` run and are also in [`deployments/demo-devnet.json`](deployments/demo-devnet.json).

Table 2. End-to-end run on 2026-10-06: CRE fails a control on Sepolia, and the relayer freezes the agent on devnet.

| Step | Tx |
|---|---|
| Off-allowlist spends. CRE cited the second (`3eK9...`) as evidence | [`3fJ3Azi6...`](https://explorer.solana.com/tx/3fJ3Azi6FwyMeq3mr4L51C3CpESgMise5tvAr8Nj2kY3LT8516V5kcd9tbkD8AUmaEX5PRUkkqr33ehSAEymbcKr?cluster=devnet) and [`3eK9tjdr...`](https://explorer.solana.com/tx/3eK9tjdrgRbU1PjVS8E15k3LmmtsJywFTB8HWCmPvZLQuBhv8UceLkmq1arVn7AwyXQHMPNJ1ewwec4qD3M9gGQe?cluster=devnet) |
| CRE writes ATT-CPTY-02 FAIL on Sepolia (block 11857358) | [`0x462eb21b...`](https://sepolia.etherscan.io/tx/0x462eb21b0bb352dfadd5cdf1fefeca8ab62b7f49c30e48da645fcf63d83b6e20) |
| Relayer set_frozen(true), memo links the Sepolia tx | [`2P8GkxMn...`](https://explorer.solana.com/tx/2P8GkxMnBBfcRd7htXypUBPBPzAikT96R3xnyrGgwfUbihhamPSG52vw1hVZuuitC7myVJK2yRShWhirh7MQSCUB?cluster=devnet) |
| Spend while frozen, fails `AgentFrozen` | [`39or4JG4...`](https://explorer.solana.com/tx/39or4JG4js1iUkPMexRomWEPt9dyjGSS6K3gqCd1F3Mzs2FnyAzaEqjoJpfVLNx2xLDhDJ2Fhfo9Qu2RtTyFrCgZ?cluster=devnet) |

The agent stays frozen until a person runs `pnpm unfreeze` (control ATT-FRZ-05).

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
```

Live demo scripts. All act on the fixed agent `attesta-demo-agent-2` (`solana-agent.json`), never a new one. They use devnet by default. Set `SOLANA_RPC_URL` to use a local validator instead.

| Command | What it does |
|---|---|
| `pnpm register` | Registers the agent on first run. Later runs sync cap (0.05 SOL/day) and allowlist, then top up the vault to 0.03 SOL. Prints policy state. |
| `pnpm spend -- allowlisted 1000000` | Spends to the allowlisted payee `3yLbm2Dp7LjH8DW29SdtCMugzrmYxpMwRussm9xATWw6`. |
| `pnpm spend -- unknown 2000000` | Spends to an off-allowlist payee `Eg2z7iSrpawo9shZDW9sKN2QZ7qA4zp48q6yoR2drMp`. Succeeds on-chain with `SpendEvent.allowlisted = false`, which is the evidence CRE fails on. |
| `pnpm spend -- <pubkey> <lamports>` | Any recipient. Prints `OK` or `REJECTED AgentFrozen` / `REJECTED OverDailyCap` plus the explorer link, exit code 2 on rejection. |
| `pnpm freeze [-- reasonCode]` | Manual fallback for the relayer: authority freezes the agent. |
| `pnpm unfreeze` | Authority unfreezes the agent. |
| `pnpm demo` | Full beat: unfreeze if needed, spend ok, freeze, spend rejected with `AgentFrozen`. Leaves the agent frozen and writes `deployments/demo-devnet.json`. |

Rejected spends are sent with preflight off, so they land on-chain as failed transactions with a signature you can open in the explorer.

Deploy (keys live outside the repo in `~/.attesta-secrets`, chmod 600):

```bash
scripts/deploy-devnet.sh                 # build + deploy + refresh idl/
pnpm register && pnpm demo
```

After a rebuild, copy `target/idl/attesta_guard.json` and `target/types/attesta_guard.ts` into `idl/` so the relayer and dashboard pick up changes.

## Keys

| File in `~/.attesta-secrets` | Role | Pubkey |
|---|---|---|
| `solana-deployer.json` | fee payer, upgrade authority | `HSevicfphZE3y4zHpKd5Cc1AuPn9DyZhNgXGnjsgE4pP` |
| `solana-guard-program.json` | program keypair | `2ppMVjwBs8dqNppcJctfTJaVb3rtfFFe5cDmJyxCGuSW` |
| `solana-authority.json` | compliance authority (relayer) | `26PteCCDtK2AButaeNLTuABN91EidBnnUEG3peB6V4n9` |
| `solana-agent.json` | demo agent `attesta-demo-agent-2` | `2pVzN7yA5qS6ozXVpxkwiSQhHy9362L9mrHwbVSBJfmM` |

No keypairs are committed.

## Limits

- `register_agent` takes `authority` as a plain argument; only the agent and payer sign. An agent that registers itself can name itself as authority and then unfreeze itself. The guard only binds agents that accept a real compliance authority.
- There is no instruction to rotate the authority or to withdraw from a frozen vault. If the authority key is lost, the policy stays frozen and its SOL stays in the vault.
- The allowlist is recorded in `SpendEvent`, not enforced on-chain. The daily cap resets at UTC midnight, so up to 2x the cap can be spent across midnight.
- The program is deployed with an upgrade authority (`HSevic...`) held by one key.
