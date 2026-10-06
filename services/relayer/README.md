# relayer

Two jobs for the Solana leg of Attesta.

- **Relayer** (`npm run relay`): watches `ControlResult` events on the Sepolia `AttestationRegistry`. When a control fails for an agent that lives on Solana, it calls `set_frozen(true)` on the `attesta_guard` program. It never unfreezes by default (see below).
- **Solana collector** (`npm run collect`): reads the guard's `SpendEvent` logs for one agent and prints `SpendRecord[]` (see `services/shared/spend-record.ts`) for the CRE workflow.

## Unfreeze is manual

`AUTO_UNFREEZE` defaults to off. Control ATT-FRZ-05 requires a frozen agent to stay frozen until a person unfreezes it, so the relayer only ever freezes. To unfreeze, a person runs `pnpm unfreeze` in `programs/solana` with the authority key.

`AUTO_UNFREEZE=1` exists for local testing only. With it, a PASS unfreezes the agent once the registry's `failingCount` for it is 0. Do not set it in the demo or any shared environment.

## Evidence link

Every freeze or unfreeze transaction carries an SPL Memo:

```
attesta:freeze:<agentId>:<controlId>:sepolia:<sourceTxHash>
```

So the Solana transaction points back to the Sepolia `ControlResult` that caused it. The relayer also prints one JSON line per action with `sourceTxUrl` (Etherscan) and `solanaSigUrl` (Solana Explorer).

## Reliability

- **Backfill.** With no saved state for the configured registry, the relayer starts at `REGISTRY_DEPLOY_BLOCK` and refuses to start without it. It never starts at head, so FAILs written while it was down still freeze. State is tied to the registry address. A redeployed registry (new `ATTESTA_REGISTRY_ADDRESS`) starts fresh from its own deploy block.
- **Level trigger.** Every tick, for each mapped agent, it reads `failingCount` from the registry. If that is above 0 and the policy is not frozen, it freezes with a `attesta:reconcile:...` memo. Logs are still used, to link each freeze to its source tx.
- **No head-of-line blocking.** Each log is handled in its own try/catch. A log that fails goes to `pending` and is retried on later ticks while the cursor moves on. After `RELAYER_MAX_ATTEMPTS` (default 5) it moves to `dead` and a `dead_letter` line is logged. Reconcile still freezes that agent once the cause is fixed.
- **Confirmations.** Logs are only acted on `RELAYER_CONFIRMATIONS` blocks (default 2) behind head, to avoid a freeze from a reorged log.
- **Idempotent.** Each log key (`txHash:logIndex`) is handled once. The relayer also reads the policy and skips when `frozen` already matches.

Unit tests for all of the above run on an in-memory fake chain: `npm test` (8 tests).

## Run

```bash
cp .env.example .env    # fill ATTESTA_REGISTRY_ADDRESS, REGISTRY_DEPLOY_BLOCK
npm install
npm test
npm run relay
npm run collect -- attesta-demo-agent-2 2pVzN7yA5qS6ozXVpxkwiSQhHy9362L9mrHwbVSBJfmM
```

The guard authority key (`~/.attesta-secrets/solana-authority.json`) must match the `authority` set when the agent was registered. It never leaves the host and is not in this repo.

## Local end-to-end test

Needs anvil, `solana-test-validator`, and `forge build` output in `contracts/evm/out`. Ports are non-default because 8000/8899 were taken on our build host.

```bash
solana-test-validator --reset --rpc-port 18899 --gossip-port 18000 --dynamic-port-range 18100-18200 --faucet-port 19900 \
  --bpf-program 2ppMVjwBs8dqNppcJctfTJaVb3rtfFFe5cDmJyxCGuSW ../../programs/solana/target/deploy/attesta_guard.so &
anvil --port 18545 &
npm run e2e:local
```

It deploys the registry on anvil with account 0 as the forwarder, then checks four things:

1. FAIL leads to a freeze, and the next spend fails with `AgentFrozen`.
2. A re-run sends no duplicate transaction.
3. With `AUTO_UNFREEZE=1` (test only), PASS leads to an unfreeze, and the next spend succeeds.
4. The collector returns exactly the two successful spends.

Last run on 2026-10-06: all four passed.
