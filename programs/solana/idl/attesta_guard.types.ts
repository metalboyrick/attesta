/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/attesta_guard.json`.
 */
export type AttestaGuard = {
  "address": "2ppMVjwBs8dqNppcJctfTJaVb3rtfFFe5cDmJyxCGuSW",
  "metadata": {
    "name": "attestaGuard",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Attesta guard: freezable spend policy for AI agents"
  },
  "docs": [
    "Attesta guard: agent spends route through this program. A compliance",
    "authority freezes an agent when an off-chain control fails; frozen agents",
    "cannot spend."
  ],
  "instructions": [
    {
      "name": "registerAgent",
      "discriminator": [
        135,
        157,
        66,
        195,
        2,
        113,
        175,
        30
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "agent",
          "docs": [
            "The agent consents to being governed by this policy."
          ],
          "signer": true
        },
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "agent"
              }
            ]
          }
        },
        {
          "name": "vault",
          "docs": [
            "System-owned PDA that holds the agent's spendable lamports."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agent"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "authority",
          "type": "pubkey"
        },
        {
          "name": "dailyCap",
          "type": "u64"
        },
        {
          "name": "allowlist",
          "type": {
            "vec": "pubkey"
          }
        }
      ]
    },
    {
      "name": "setFrozen",
      "discriminator": [
        62,
        87,
        99,
        96,
        206,
        47,
        204,
        18
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "policy"
          ]
        },
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "policy.agent",
                "account": "agentPolicy"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "frozen",
          "type": "bool"
        },
        {
          "name": "reasonCode",
          "type": "u32"
        }
      ]
    },
    {
      "name": "spend",
      "discriminator": [
        242,
        205,
        255,
        87,
        101,
        217,
        245,
        57
      ],
      "accounts": [
        {
          "name": "agent",
          "signer": true,
          "relations": [
            "policy"
          ]
        },
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "agent"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agent"
              }
            ]
          }
        },
        {
          "name": "recipient",
          "docs": [
            "reported in SpendEvent and enforced off-chain via freeze."
          ],
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "updatePolicy",
      "discriminator": [
        212,
        245,
        246,
        7,
        163,
        151,
        18,
        57
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "policy"
          ]
        },
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "policy.agent",
                "account": "agentPolicy"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "dailyCap",
          "type": "u64"
        },
        {
          "name": "allowlist",
          "type": {
            "vec": "pubkey"
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "agentPolicy",
      "discriminator": [
        148,
        193,
        218,
        129,
        21,
        96,
        195,
        77
      ]
    }
  ],
  "events": [
    {
      "name": "agentRegistered",
      "discriminator": [
        191,
        78,
        217,
        54,
        232,
        100,
        189,
        85
      ]
    },
    {
      "name": "frozenChanged",
      "discriminator": [
        223,
        64,
        57,
        47,
        168,
        188,
        36,
        90
      ]
    },
    {
      "name": "policyUpdated",
      "discriminator": [
        225,
        112,
        112,
        67,
        95,
        236,
        245,
        161
      ]
    },
    {
      "name": "spendEvent",
      "discriminator": [
        53,
        88,
        173,
        183,
        74,
        205,
        27,
        182
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "agentFrozen",
      "msg": "Agent is frozen by its compliance authority"
    },
    {
      "code": 6001,
      "name": "overDailyCap",
      "msg": "Spend would exceed the agent's daily cap"
    },
    {
      "code": 6002,
      "name": "allowlistTooLong",
      "msg": "Allowlist exceeds the maximum length"
    },
    {
      "code": 6003,
      "name": "zeroAmount",
      "msg": "Amount must be greater than zero"
    }
  ],
  "types": [
    {
      "name": "agentPolicy",
      "docs": [
        "Spend policy for one agent. PDA: [\"policy\", agent]."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "docs": [
              "Compliance authority (relayer) allowed to freeze and edit the policy."
            ],
            "type": "pubkey"
          },
          {
            "name": "dailyCap",
            "docs": [
              "Max lamports the agent may spend per UTC day."
            ],
            "type": "u64"
          },
          {
            "name": "spentToday",
            "type": "u64"
          },
          {
            "name": "dayIndex",
            "docs": [
              "unix_timestamp / 86400 of the day `spent_today` belongs to."
            ],
            "type": "i64"
          },
          {
            "name": "frozen",
            "type": "bool"
          },
          {
            "name": "allowlist",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "agentRegistered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "dailyCap",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "frozenChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "frozen",
            "type": "bool"
          },
          {
            "name": "reasonCode",
            "type": "u32"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "policyUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "dailyCap",
            "type": "u64"
          },
          {
            "name": "allowlistLen",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "spendEvent",
      "docs": [
        "Evidence record for off-chain control evaluation (CRE)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "spentToday",
            "type": "u64"
          },
          {
            "name": "dailyCap",
            "type": "u64"
          },
          {
            "name": "allowlisted",
            "docs": [
              "False when the recipient is not on the allowlist. Spend still succeeds;",
              "the allowlist control is evaluated off-chain and may freeze the agent."
            ],
            "type": "bool"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "policySeed",
      "type": "bytes",
      "value": "[112, 111, 108, 105, 99, 121]"
    },
    {
      "name": "vaultSeed",
      "type": "bytes",
      "value": "[118, 97, 117, 108, 116]"
    }
  ]
};
