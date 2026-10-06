# Attesta controls

This folder holds the control catalog for Attesta. The machine-readable copy is [`catalog.json`](catalog.json). This page explains it.

## What a control is here

A control is one rule an AI agent must follow while it moves money. Each control has a test that a program can run with no human judgment. The same inputs always give the same pass or fail.

Our Chainlink CRE workflow runs the tests for each agent. Its cron is set to every 5 minutes, but deploying a workflow to the CRE network is Early Access, so today it runs only when we start `cre workflow simulate` by hand. It writes the result and a hash of the evidence to the `AttestationRegistry` contract on Sepolia. If a control fails, the Solana guard program freezes the agent so it can't spend until a person looks at it.

Each control in `catalog.json` has these fields:

- **objective:** what the control is for, in plain words.
- **test:** the exact check the workflow runs.
- **evidence:** the data we put in canonical JSON and hash with keccak256.
- **frequency:** how often the check runs.
- **implemented:** `true` if the check is written in the workflow code (`workflows/cre/control-eval/lib/controls.ts`) with unit tests. It does not mean a result is on-chain yet.
- **soc2_tsc / iso42001_annex_a:** the framework criteria the control helps with.

## The controls

Table 1 lists all eight controls. Three are coded and unit-tested in the workflow. None has written a result on-chain yet: the first Sepolia run is waiting on a CRE API key and test ETH. The other five are designed but not built.

**Table 1. Attesta control catalog v0.1.0**

| ID | Title | SOC 2 TSC | ISO/IEC 42001 Annex A | Coded |
|----|-------|-----------|-----------------------|-------------|
| ATT-SPEND-01 | UTC-day spend within approved cap | CC7.2, PI1.3 | A.6.2.6, A.9.4 | Yes |
| ATT-CPTY-02 | Counterparties limited to allowlist | CC6.1, CC6.6, CC7.2 | A.6.2.6, A.9.4 | Yes |
| ATT-KEY-03 | Signing key and authority unchanged | CC6.1, CC6.2, CC6.3 | A.6.2.6 | Yes |
| ATT-TXLIM-04 | Single transfer within per-transaction limit | CC5.2, PI1.3 | A.6.2.2, A.9.4 | No |
| ATT-FRZ-05 | Freeze takes effect after a failed control | CC7.3, CC7.4 | A.6.2.6, A.9.2 | No |
| ATT-CHG-06 | Model and prompt config matches approved release | CC8.1 | A.6.2.5, A.6.2.7 | No |
| ATT-LOG-07 | Attestation log complete and evidence intact | CC4.1, CC7.2 | A.6.2.8 | No |
| ATT-HITL-08 | Human approval above threshold | CC5.1, CC6.3 | A.3.2, A.9.2 | No |

A mapping means the control produces evidence an auditor could use for that criterion. It doesn't mean the control covers the whole criterion. SOC 2 and ISO 42001 both expect policies, people and process around any automated check, and Attesta only covers the automated part.

## How IDs become bytes32

On-chain, a control ID is `keccak256` of the ID string's UTF-8 bytes, stored as `bytes32`. In Solidity that's `keccak256(bytes("ATT-SPEND-01"))`. With Foundry it's `cast keccak "ATT-SPEND-01"`.

**Table 2. bytes32 values for the implemented controls**

| ID | bytes32 |
|----|---------|
| ATT-SPEND-01 | `0x1f3b23ae5034ade93a070a6363287f64a2bf0c4180946c03f0511c724f68ab0b` |
| ATT-CPTY-02 | `0x10819399cb2ac6464e41af6331bd449d07cf6631a81363615877516347305adc` |
| ATT-KEY-03 | `0x65d6d2877efe0e624b6bbdd46b128f515be3e3a78537951dca26d1ff31b4a2ba` |

IDs are case-sensitive. Don't add spaces or change the dash, or the hash won't match.

## Verification status

We checked every criterion ID in Table 1 against a source. None are listed as unverified in `catalog.json`.

- **SOC 2:** all IDs were checked against the AICPA document *2017 Trust Services Criteria for Security, Availability, Processing Integrity, Confidentiality, and Privacy* (March 2020 version). The 2022 revision only changed the points of focus. The criteria themselves stayed the same, per AICPA as quoted by Barr Advisory and Moss Adams.
- **ISO/IEC 42001:2023:** we don't own a copy of the standard. We checked control IDs and titles against two sources that agree: the NIST AI RMF to ISO/IEC 42001 crosswalk and the RiskProfs Annex A list. The NIST crosswalk was built on the draft (FDIS) text and cites Annex B guidance numbers, which mirror Annex A. Someone with the published standard should confirm before an audit.
- **Mapping choices are ours.** The IDs are verified, but which criterion fits which control is our judgment. An auditor may map differently.

Spend is counted per UTC day, the same way the Solana guard program and the EVM AgentWallet count it. A rolling 24 hour window would be stricter, but CRE caps log queries at 100 blocks, so we read the day counter the contracts already keep.

## Sources

- AICPA, 2017 Trust Services Criteria (March 2020 version): https://arpio.io/wp-content/uploads/2020/08/trust-services-criteria.pdf
- Barr Advisory on the 2022 revised points of focus: https://www.barradvisory.com/resource/whats-new-with-soc-2/
- Moss Adams on the 2022 AICPA SOC 2 guide update: https://www.mossadams.com/articles/2022/11/aicpa-releases-updated-soc-2-guide
- NIST AI RMF to ISO/IEC 42001 crosswalk: https://airc.nist.gov/docs/NIST_AI_RMF_to_ISO_IEC_42001_Crosswalk.pdf
- RiskProfs, ISO 42001 Annex A controls list: https://riskprofs.com/iso-42001-annex-a-controls-list/
- ISMS.online, A.6.2.8 event logs: https://www.isms.online/iso-42001/annex-a-controls/a-6-ai-system-life-cycle/a-6-2-8-ai-system-recording-of-event-logs/
