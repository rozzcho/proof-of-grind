# Proof of Grind

Solana Colosseum — Discord study group with USDC stake pools.

- `programs/proof_of_grind` — Anchor program (Rust): `create_challenge`, `register`
- `app` — React (Vite) frontend
- `server` — Node API (Discord OAuth, co-signs registrations) + Discord bot (role for the private room)

## How registration works

1. User connects a wallet and logs in with Discord (OAuth) on the site.
2. The server builds the `register` transaction with the verified Discord user ID and co-signs it with
   the verifier key (`server/.keys/verifier.json`, pubkey = `VERIFIER` in the program).
3. The wallet signs and sends it. In one transaction: 7 USDC → challenge vault, `Participant` (wallet)
   and `DiscordLink` (Discord ID) accounts are created — one wallet and one Discord account per challenge.
4. The server's bot gives the paid role (adds the user to the server first if needed). On startup the
   bot re-syncs roles from on-chain `DiscordLink` accounts.

## Discord setup (once)

1. https://discord.com/developers/applications → **New Application**
2. **OAuth2** → copy Client ID / Client Secret, add redirect
   `http://localhost:5173/auth/discord/callback`
3. **Bot** → Reset Token → copy token
4. Invite the bot: OAuth2 → URL Generator → scope `bot`, permissions **Manage Roles** and
   **Create Instant Invite** → open the URL and add it to your server
5. In your server: create a role (e.g. `Weekly #0`) **below the bot's role**, make the private
   channel visible only to that role. Turn on Developer Mode to copy the server ID and role ID.
6. `cp server/.env.example server/.env` and fill in the values

## Local setup

Everything runs on a local validator. A test USDC mint is loaded at the devnet USDC address with the
local CLI wallet (`~/.config/solana/id.json`) as mint authority.

```bash
npm --prefix app install && npm --prefix server install
NO_DNA=1 anchor build                  # build program (after program changes)
npm --prefix app run local:validator   # terminal 1: validator (resets state)
solana airdrop 10 -u localhost         # terminal 2: fund the admin wallet
npm --prefix app run local:setup       # create Weekly Challenge #0 (7 USDC)
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
