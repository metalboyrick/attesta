# CRE local simulation log

Receiver-free dry run of `control-eval` (target `local-simulation`). Real reads, real evaluation, no report, no transaction.

| Field | Value |
|---|---|
| Run (UTC) | 2026-10-06T17:24:25Z |
| CRE CLI | CRE CLI version v1.37.0 |
| Commit | 9f3546e |
| Exit code | 0 |

```text
Initializing...
Loading settings...
Checking RPC connectivity...
Compiling workflow...
✓ Workflow compiled
✓ Simulation limits enabled
  HTTP: req=120kb resp=250kb timeout=10s | ConfHTTP: req=125kb resp=500kb timeout=1m30s | Consensus obs=25kb | ChainWrite evm_report=50kb evm_gas=10000000 solana_report=265b solana_cu=300000 | WASM binary=100mb compressed=20mb
  Binary hash: 7e0242a68e58416cb4796e7cd2ecca5bd58bf5662ce1bacb5c86e1c79853c6b3
  Config hash: 05fcb40f10db06907c1cbaa8e3e59994e03e79c9f6e6748e497c16e41c474008
2026-10-06T17:24:24Z [SIMULATION] Simulator Initialized

2026-10-06T17:24:24Z [SIMULATION] Running trigger trigger=cron-trigger@1.0.0
2026-10-06T17:24:25Z [USER LOG] attesta-demo-agent-3: cardano:addr_test1qz26gtjxv36378vqv40un4w6qjnfz09gcw6lz7jyus0q0f79a85l60732tzxdgzvhepwyuh0sn0rpwzkermlmhkhm7rq2qc2rg payments=0 at=day 20732, 0 txs
2026-10-06T17:24:25Z [USER LOG] evidence {"control":"ATT-SPEND-01","source":"cardano:addr_test1qz26gtjxv36378vqv40un4w6qjnfz09gcw6lz7jyus0q0f79a85l60732tzxdgzvhepwyuh0sn0rpwzkermlmhkhm7rq2qc2rg","at":"day 20732, 0 txs","day":"20732","spentToday":"0","approvedDailyCap":"50000000","onchainCap":"0","capDrift":false}
2026-10-06T17:24:25Z [USER LOG] evidence {"control":"ATT-CPTY-02","source":"cardano:addr_test1qz26gtjxv36378vqv40un4w6qjnfz09gcw6lz7jyus0q0f79a85l60732tzxdgzvhepwyuh0sn0rpwzkermlmhkhm7rq2qc2rg","at":"day 20732, 0 txs","allowlistSource":"policy-of-record","allowlist":["addr_test1qztvnhavscfaupuwy824jem5z8dxavkzz6ukg4xyzls3gn2mejfgg4sl7sj4rdxxdnzsqvpkzwu0v39338t9aj6p6q7stjznf6"],"paymentsSeen":0,"offAllowlist":[],"refs":[]}
2026-10-06T17:24:25Z [USER LOG] skipped attesta-demo-agent-1: evidence unavailable: AgentWallet not deployed (wallet is the zero address)
2026-10-06T17:24:25Z [USER LOG] skipped attesta-demo-agent-2: evidence unavailable: [2]Unknown: policy account 2QAPFh8haAazrqeRhnZNqdVPittts2oQsaMQXtkTm6ZH not found
2026-10-06T17:24:25Z [USER LOG] wouldWrite attesta-demo-agent-3/ATT-SPEND-01=PASS evidenceHash=0x83efcdc4fc2c5a1b04ebaba46cc5e305ea12ec04f21f0b370e629ff32698a88f
2026-10-06T17:24:25Z [USER LOG] wouldWrite attesta-demo-agent-3/ATT-CPTY-02=PASS evidenceHash=0x0824d3e0c30303d47a4f4b6ca002f0964141b6ecd0281c3eeb3d35498f3da782

✓ Workflow Simulation Result:
"wouldWrite attesta-demo-agent-3/ATT-SPEND-01=PASS evidenceHash=0x83efcdc4fc2c5a1b04ebaba46cc5e305ea12ec04f21f0b370e629ff32698a88f\nwouldWrite attesta-demo-agent-3/ATT-CPTY-02=PASS evidenceHash=0x0824d3e0c30303d47a4f4b6ca002f0964141b6ecd0281c3eeb3d35498f3da782\nskipped attesta-demo-agent-1: evidence unavailable: AgentWallet not deployed (wallet is the zero address)\nskipped attesta-demo-agent-2: evidence unavailable: [2]Unknown: policy account 2QAPFh8haAazrqeRhnZNqdVPittts2oQsaMQXtkTm6ZH not found"

2026-10-06T17:24:25Z [SIMULATION] Execution finished signal received
2026-10-06T17:24:25Z [SIMULATION] Skipping WorkflowEngineV2

╭──────────────────────────────────────────────────────╮
│ Simulation complete! Ready to deploy your workflow?  │
│                                                      │
│ Run cre account access to request deployment access. │
╰──────────────────────────────────────────────────────╯
```
