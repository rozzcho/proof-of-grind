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
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidTrack",
      "msg": "Only the weekly track is open"
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
              "Sum of every participant's multiply; rewards are split by these shares."
            ],
            "type": "u64"
          },
          {
            "name": "totalDeposited",
            "type": "u64"
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
      "docs": [
        "One Discord account can join a challenge only once."
      ],
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
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "challengeSeed",
      "type": "bytes",
      "value": "[99, 104, 97, 108, 108, 101, 110, 103, 101]"
    },
    {
      "name": "discordSeed",
      "type": "bytes",
      "value": "[100, 105, 115, 99, 111, 114, 100]"
    },
    {
      "name": "maxMultiply",
      "type": "u8",
      "value": "10"
    },
    {
      "name": "participantSeed",
      "type": "bytes",
      "value": "[112, 97, 114, 116, 105, 99, 105, 112, 97, 110, 116]"
    },
    {
      "name": "trackWeekly",
      "type": "u8",
      "value": "0"
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
        "Server key that co-signs `register` after verifying the Discord account via OAuth."
      ],
      "type": "pubkey",
      "value": "HfAMz1kUe8xYxoC4BamRuC8sGB2Zh7gKTkgzf26c9xmP"
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
