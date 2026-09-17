/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/proof_of_grind.json`.
 */
export type ProofOfGrind = {
  "address": "xCXUMjagsYgaVK8XLW4Wz9kbrswAsd5s3TPCGDsAFUG",
  "metadata": {
    "name": "proofOfGrind",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "addWarning",
      "docs": [
        "Gives a participant a warning; 3 warnings and they are out."
      ],
      "discriminator": [
        144,
        1,
        147,
        218,
        178,
        131,
        132,
        135
      ],
      "accounts": [
        {
          "name": "oracle",
          "writable": true,
          "signer": true,
          "address": "HfAMz1kUe8xYxoC4BamRuC8sGB2Zh7gKTkgzf26c9xmP"
        },
        {
          "name": "challenge",
          "relations": [
            "participant"
          ]
        },
        {
          "name": "participant"
        },
        {
          "name": "warning",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  97,
                  114,
                  110,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "challenge"
              },
              {
                "kind": "account",
                "path": "participant.user",
                "account": "participant"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "claim",
      "docs": [
        "A winner withdraws their share of the prize pool."
      ],
      "discriminator": [
        62,
        198,
        214,
        193,
        213,
        159,
        108,
        210
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true,
          "relations": [
            "participant"
          ]
        },
        {
          "name": "challenge",
          "writable": true,
          "relations": [
            "participant"
          ]
        },
        {
          "name": "participant",
          "writable": true
        },
        {
          "name": "warning",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  97,
                  114,
                  110,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "challenge"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "challenge"
          ]
        },
        {
          "name": "userTokenAccount",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "challenge"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "recordProgress",
      "docs": [
        "Marks one day as passed for a participant."
      ],
      "discriminator": [
        116,
        126,
        203,
        83,
        23,
        114,
        161,
        110
      ],
      "accounts": [
        {
          "name": "oracle",
          "writable": true,
          "signer": true,
          "address": "HfAMz1kUe8xYxoC4BamRuC8sGB2Zh7gKTkgzf26c9xmP"
        },
        {
          "name": "challenge",
          "relations": [
            "participant"
          ]
        },
        {
          "name": "participant",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "dayIndex",
          "type": "u8"
        }
      ]
    },
    {
      "name": "register",
      "docs": [
        "Pays `entry_fee × multiply` into the challenge vault and joins the pool."
      ],
      "discriminator": [
        211,
        124,
        67,
        15,
        211,
        194,
        178,
        240
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "verifier",
          "signer": true,
          "address": "HfAMz1kUe8xYxoC4BamRuC8sGB2Zh7gKTkgzf26c9xmP"
        },
        {
          "name": "challenge",
          "writable": true
        },
        {
          "name": "participant",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  116,
                  105,
                  99,
                  105,
                  112,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "challenge"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "discordLink",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  105,
                  115,
                  99,
                  111,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "challenge"
              },
              {
                "kind": "arg",
                "path": "discordId"
              }
            ]
          }
        },
        {
          "name": "walletLock",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  97,
                  108,
                  108,
                  101,
                  116,
                  95,
                  108,
                  111,
                  99,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "discordLock",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  105,
                  115,
                  99,
                  111,
                  114,
                  100,
                  95,
                  108,
                  111,
                  99,
                  107
                ]
              },
              {
                "kind": "arg",
                "path": "discordId"
              }
            ]
          }
        },
        {
          "name": "mint",
          "address": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
        },
        {
          "name": "userTokenAccount",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "challenge"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "track",
          "type": "u8"
        },
        {
          "name": "challengeId",
          "type": "u64"
        },
        {
          "name": "discordId",
          "type": "u64"
        },
        {
          "name": "multiply",
          "type": "u8"
        }
      ]
    },
    {
      "name": "rollover",
      "docs": [
        "Moves the prize pool of a challenge nobody won into a later one."
      ],
      "discriminator": [
        147,
        98,
        248,
        23,
        82,
        182,
        25,
        134
      ],
      "accounts": [
        {
          "name": "from",
          "writable": true
        },
        {
          "name": "to",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "from",
            "to"
          ]
        },
        {
          "name": "fromVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "from"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "toVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "to"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "tally",
      "docs": [
        "Counts one participant after the challenge ends; the last one finalizes it."
      ],
      "discriminator": [
        152,
        106,
        131,
        171,
        155,
        62,
        41,
        7
      ],
      "accounts": [
        {
          "name": "participant",
          "writable": true
        },
        {
          "name": "challenge",
          "writable": true,
          "relations": [
            "participant"
          ]
        },
        {
          "name": "warning",
          "docs": [
            "sure a caller cannot pass another account to hide warnings."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  97,
                  114,
                  110,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "challenge"
              },
              {
                "kind": "account",
                "path": "participant.user",
                "account": "participant"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "withdrawFees",
      "docs": [
        "Sends the platform fee and rounding dust to the treasury."
      ],
      "discriminator": [
        198,
        212,
        171,
        109,
        144,
        215,
        174,
        89
      ],
      "accounts": [
        {
          "name": "treasury",
          "writable": true,
          "signer": true,
          "address": "Gda3akHfzA74Dyz7qJhrj2EsFYX8AqH8s2Za41XpQMNf"
        },
        {
          "name": "challenge",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "challenge"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "challenge"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "treasuryTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "challenge",
      "discriminator": [
        119,
        250,
        161,
        121,
        119,
        81,
        22,
        208
      ]
    },
    {
      "name": "discordLink",
      "discriminator": [
        225,
        81,
        151,
        211,
        67,
        4,
        63,
        67
      ]
    },
    {
      "name": "participant",
      "discriminator": [
        32,
        142,
        108,
        79,
        247,
        179,
        54,
        6
      ]
    },
    {
      "name": "participationLock",
      "discriminator": [
        162,
        14,
        76,
        6,
        17,
        112,
        72,
        239
      ]
    },
    {
      "name": "warning",
      "discriminator": [
        199,
        28,
        213,
        239,
        55,
        10,
        78,
        14
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidTrack",
      "msg": "Unknown challenge track"
    },
    {
      "code": 6001,
      "name": "invalidMultiply",
      "msg": "Multiply must be between 1 and 10"
    },
    {
      "code": 6002,
      "name": "registrationClosed",
      "msg": "Registration for this challenge is not open"
    },
    {
      "code": 6003,
      "name": "invalidVerifier",
      "msg": "Registration must be co-signed by the verifier"
    },
    {
      "code": 6004,
      "name": "invalidDay",
      "msg": "That day is not part of this challenge"
    },
    {
      "code": 6005,
      "name": "dayNotStarted",
      "msg": "That day has not started yet"
    },
    {
      "code": 6006,
      "name": "recordingClosed",
      "msg": "Progress can no longer be recorded for this challenge"
    },
    {
      "code": 6007,
      "name": "challengeNotOver",
      "msg": "Results are not open yet: the challenge or its record window is still running"
    },
    {
      "code": 6008,
      "name": "alreadyTallied",
      "msg": "This participant was already counted"
    },
    {
      "code": 6009,
      "name": "notFinalized",
      "msg": "Every participant must be counted first"
    },
    {
      "code": 6010,
      "name": "notAWinner",
      "msg": "Only participants who passed every day can claim"
    },
    {
      "code": 6011,
      "name": "alreadyClaimed",
      "msg": "Already claimed"
    },
    {
      "code": 6012,
      "name": "claimsPending",
      "msg": "Everyone must claim before fees can be withdrawn"
    },
    {
      "code": 6013,
      "name": "nothingToRollOver",
      "msg": "This challenge has winners, so nothing rolls over"
    },
    {
      "code": 6014,
      "name": "alreadyRolledOver",
      "msg": "The prize pool already rolled over"
    },
    {
      "code": 6015,
      "name": "invalidRolloverTarget",
      "msg": "The prize pool can only roll over into a later challenge on the same track"
    },
    {
      "code": 6016,
      "name": "overlappingChallenge",
      "msg": "You are already in a challenge on another track at that time"
    },
    {
      "code": 6017,
      "name": "claimWindowClosed",
      "msg": "The claim window for this challenge has closed"
    },
    {
      "code": 6018,
      "name": "warningsClosed",
      "msg": "Warnings can no longer be given for this challenge"
    },
    {
      "code": 6019,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "challenge",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "track",
            "type": "u8"
          },
          {
            "name": "challengeId",
            "type": "u64"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "entryFee",
            "docs": [
              "Per 1x, in mint base units (USDC: 6 decimals)."
            ],
            "type": "u64"
          },
          {
            "name": "startTs",
            "type": "i64"
          },
          {
            "name": "endTs",
            "type": "i64"
          },
          {
            "name": "participantCount",
            "type": "u32"
          },
          {
            "name": "totalShares",
            "docs": [
              "Sum of every participant's multiply."
            ],
            "type": "u64"
          },
          {
            "name": "totalDeposited",
            "docs": [
              "Everything paid in: the entry pool."
            ],
            "type": "u64"
          },
          {
            "name": "carryOver",
            "docs": [
              "Prize pool rolled over from an earlier challenge nobody won."
            ],
            "type": "u64"
          },
          {
            "name": "winnerShares",
            "docs": [
              "Sum of the winners' multiply; rewards are split by these shares."
            ],
            "type": "u64"
          },
          {
            "name": "winnerCount",
            "type": "u32"
          },
          {
            "name": "talliedCount",
            "type": "u32"
          },
          {
            "name": "claimedCount",
            "type": "u32"
          },
          {
            "name": "finalized",
            "docs": [
              "Every participant has been counted, so the winners are known."
            ],
            "type": "bool"
          },
          {
            "name": "rolledOver",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "discordLink",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "challenge",
            "type": "pubkey"
          },
          {
            "name": "discordId",
            "type": "u64"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "participant",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "challenge",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "discordId",
            "type": "u64"
          },
          {
            "name": "multiply",
            "type": "u8"
          },
          {
            "name": "amountPaid",
            "type": "u64"
          },
          {
            "name": "registeredAt",
            "type": "i64"
          },
          {
            "name": "daysCompleted",
            "docs": [
              "One bit per day of the challenge; all bits set means they passed."
            ],
            "type": "u16"
          },
          {
            "name": "tallied",
            "type": "bool"
          },
          {
            "name": "claimed",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "participationLock",
      "docs": [
        "Stops one person from being in challenges on two tracks at the same time.",
        "Holds the period of their latest challenge; consecutive challenges on one track merge into it."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "track",
            "type": "u8"
          },
          {
            "name": "startTs",
            "type": "i64"
          },
          {
            "name": "endTs",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "warning",
      "docs": [
        "One Discord account can join a challenge only once.",
        "Warnings a participant received in one challenge (after a jury upheld a report)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "challenge",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "count",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "biweeklyDays",
      "type": "u8",
      "value": "14"
    },
    {
      "name": "biweeklyDaySeconds",
      "type": "i64",
      "value": "86400"
    },
    {
      "name": "biweeklyDuration",
      "type": "i64",
      "value": "1209600"
    },
    {
      "name": "biweeklyEntryFee",
      "docs": [
        "10 USDC (6 decimals) per 1x."
      ],
      "type": "u64",
      "value": "10000000"
    },
    {
      "name": "biweeklyLaunchTs",
      "docs": [
        "Placeholder until the first Biweekly date is decided: Monday 2026-10-05 00:00 UTC.",
        "Registration stays closed until then (the server only co-signs the Weekly track)."
      ],
      "type": "i64",
      "value": "1791158400"
    },
    {
      "name": "challengeSeed",
      "type": "bytes",
      "value": "[99, 104, 97, 108, 108, 101, 110, 103, 101]"
    },
    {
      "name": "claimWindowSeconds",
      "docs": [
        "Winners have 4 weeks after a challenge ends to claim; what is left then goes to the treasury."
      ],
      "type": "i64",
      "value": "2419200"
    },
    {
      "name": "discordLockSeed",
      "type": "bytes",
      "value": "[100, 105, 115, 99, 111, 114, 100, 95, 108, 111, 99, 107]"
    },
    {
      "name": "discordSeed",
      "type": "bytes",
      "value": "[100, 105, 115, 99, 111, 114, 100]"
    },
    {
      "name": "feeBps",
      "docs": [
        "Platform + exchange fee, in basis points of the entry pool."
      ],
      "type": "u64",
      "value": "500"
    },
    {
      "name": "maxMultiply",
      "type": "u8",
      "value": "10"
    },
    {
      "name": "maxWarnings",
      "docs": [
        "A participant with this many warnings in a challenge is out."
      ],
      "type": "u8",
      "value": "3"
    },
    {
      "name": "participantSeed",
      "type": "bytes",
      "value": "[112, 97, 114, 116, 105, 99, 105, 112, 97, 110, 116]"
    },
    {
      "name": "payoutUnit",
      "docs": [
        "Rewards are rounded down to 0.01 USDC."
      ],
      "type": "u64",
      "value": "10000"
    },
    {
      "name": "recordWindowDays",
      "docs": [
        "Passed days can still be recorded for this many challenge days after the end (e.g. after a",
        "server outage). Results are tallied only once this window closes."
      ],
      "type": "i64",
      "value": "2"
    },
    {
      "name": "testDays",
      "type": "u8",
      "value": "5"
    },
    {
      "name": "testDaySeconds",
      "type": "i64",
      "value": "120"
    },
    {
      "name": "testDuration",
      "type": "i64",
      "value": "600"
    },
    {
      "name": "testEntryFee",
      "type": "u64",
      "value": "1000000"
    },
    {
      "name": "testLaunchTs",
      "docs": [
        "Test challenges run every 10 minutes, with five 2-minute \"days\"."
      ],
      "type": "i64",
      "value": "0"
    },
    {
      "name": "trackBiweekly",
      "docs": [
        "Opens every other week and runs for two weeks."
      ],
      "type": "u8",
      "value": "1"
    },
    {
      "name": "trackTest",
      "docs": [
        "Short track for testing the full cycle without waiting a week."
      ],
      "type": "u8",
      "value": "2"
    },
    {
      "name": "trackWeekly",
      "type": "u8",
      "value": "0"
    },
    {
      "name": "treasury",
      "docs": [
        "Receives the platform fee and leftover rounding dust."
      ],
      "type": "pubkey",
      "value": "Gda3akHfzA74Dyz7qJhrj2EsFYX8AqH8s2Za41XpQMNf"
    },
    {
      "name": "usdcMint",
      "docs": [
        "Circle devnet USDC."
      ],
      "type": "pubkey",
      "value": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
    },
    {
      "name": "verifier",
      "docs": [
        "Server key: co-signs `register` after verifying the Discord account, and records daily progress."
      ],
      "type": "pubkey",
      "value": "HfAMz1kUe8xYxoC4BamRuC8sGB2Zh7gKTkgzf26c9xmP"
    },
    {
      "name": "walletLockSeed",
      "docs": [
        "One participation lock per wallet and one per Discord account, shared by every track."
      ],
      "type": "bytes",
      "value": "[119, 97, 108, 108, 101, 116, 95, 108, 111, 99, 107]"
    },
    {
      "name": "warningSeed",
      "type": "bytes",
      "value": "[119, 97, 114, 110, 105, 110, 103]"
    },
    {
      "name": "weeklyDays",
      "type": "u8",
      "value": "7"
    },
    {
      "name": "weeklyDaySeconds",
      "type": "i64",
      "value": "86400"
    },
    {
      "name": "weeklyEntryFee",
      "docs": [
        "7 USDC (6 decimals) per 1x."
      ],
      "type": "u64",
      "value": "7000000"
    },
    {
      "name": "weeklyLaunchTs",
      "docs": [
        "Weekly Challenge #0 starts Monday 2026-09-21 00:00 UTC; #n starts n weeks later."
      ],
      "type": "i64",
      "value": "1789948800"
    },
    {
      "name": "weekSeconds",
      "type": "i64",
      "value": "604800"
    }
  ]
};
