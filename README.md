# Attesta

Continuous compliance for AI agents that move money on-chain.

Control tests run as a Chainlink CRE workflow, results are written on-chain, and a failing control freezes the agent. Counterparty agents can pay per request (x402 on Cardano) to check an agent's attestation before they deal with it.

Built at 2049 Origins, Singapore, 6-8 Oct 2026. All work in this repo started after kickoff (12:00 SGT 6 Oct 2026). Testnets only.

## Layout

| Path | What |
|---|---|
| `contracts/evm` | Attestation contract (Sepolia), receives ControlResult reports from CRE |
| `workflows/cre` | Chainlink CRE cron workflow: collect evidence, evaluate controls, write results |
| `programs/solana` | Anchor guard program: agent spends go through it; frozen agents are rejected (devnet) |
| `services/x402-cardano` | `GET /attest/{agent}` behind x402 on Cardano preprod |
| `services/relayer` | Mirrors failing results to the Solana guard |
| `apps/dashboard` | Agent fleet, controls, evidence pack for auditors |
| `controls` | Control catalogue mapped to SOC 2 TSC and ISO/IEC 42001 clause IDs |
