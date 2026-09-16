# Proof of Grind

Solana Colosseum — Discord study group with USDC stake pools.

- `programs/proof_of_grind` — Anchor program (Rust): `register` (weekly challenges, multiply 1–10)
- `app` — React (Vite) frontend
- `server` — Node API (Discord OAuth, co-signs registrations) + Discord bot (role for the private room)

## How registration works

1. User connects a wallet and logs in with Discord (OAuth) on the site.
2. The server builds the `register` transaction with the verified Discord user ID and co-signs it with
   the verifier key (`server/.keys/verifier.json`, pubkey = `VERIFIER` in the program).
3. The wallet signs and sends it. In one transaction: 7 USDC × multiply → challenge vault, `Participant`
   (wallet) and `DiscordLink` (Discord ID) accounts are created — one wallet and one Discord account per
   challenge. Weekly Challenge #n starts Monday 00:00 UTC, n weeks after #0 (2026-09-21); registration for
   #n is open during the week before it starts, and the first registrant's transaction creates the challenge.
4. The server's bot gives the paid role (adds the user to the server first if needed). On startup the
   bot re-syncs roles from on-chain `DiscordLink` accounts.

## Discord setup (once)

1. https://discord.com/developers/applications → **New Application**
2. **OAuth2** → copy Client ID / Client Secret, add redirect
   `http://localhost:5173/auth/discord/callback`
3. **Bot** → Reset Token → copy token
4. Invite the bot: OAuth2 → URL Generator → scope `bot`, permissions **Manage Roles** and
   **Create Instant Invite** → open the URL and add it to your server
5. In your server: create a role (e.g. `Weekly Challenge`) **below the bot's role**, and a voice channel
   `Weekly Challenge` visible only to that role and the bot. Turn on Developer Mode to copy the server,
   role and channel IDs. Camera-on time in that channel counts toward the daily goal.
6. `cp server/.env.example server/.env` and fill in the values

## Local setup

Everything runs on a local validator. A test USDC mint is loaded at the devnet USDC address with the
local CLI wallet (`~/.config/solana/id.json`) as mint authority.

```bash
npm --prefix app install && npm --prefix server install
NO_DNA=1 anchor build                  # build program (after program changes)
npm --prefix app run local:validator   # terminal 1: validator (resets state)
solana airdrop 10 -u localhost         # terminal 2: fund the CLI wallet (test USDC mint authority)
npm --prefix app run local:fund -- <NIGHTLY_ADDRESS>   # +5 SOL, +100 test USDC
npm --prefix server run dev            # terminal 3: API + bot (port 8787)
npm --prefix app run dev               # terminal 4: http://localhost:5173
```

In Nightly, point the network at `http://127.0.0.1:8899` if it supports a custom RPC.

After `anchor build`, copy `target/idl/proof_of_grind.json` and `target/types/proof_of_grind.ts`
into `app/src/idl/` (the server reads the IDL from there too).

## Tests

```bash
NO_DNA=1 anchor build && cargo test -p proof_of_grind
```

Discord invite link on the landing page: `DISCORD_INVITE_URL` in `app/src/config.ts`.
