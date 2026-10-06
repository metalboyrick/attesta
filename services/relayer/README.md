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

## Idempotency

- Each log is handled once. The state file keeps a block cursor and the `txHash:logIndex` keys already processed.
- Before writing, the relayer reads the policy account and skips if `frozen` already matches the target.
- If a Solana call fails, the cursor does not move past that block range, so the next poll retries it.

## Run

```bash
cp .env.example .env    # fill ATTESTA_REGISTRY_ADDRESS, RELAYER_FROM_BLOCK
npm install
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
