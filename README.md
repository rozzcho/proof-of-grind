# Proof of Grind

Solana Colosseum — Discord study group with USDC stake pools.

- `programs/proof_of_grind` — Anchor program (Rust): `register`, `record_progress`, `tally`, `claim`,
  `rollover`, `withdraw_fees`
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

## How settling works

1. The bot counts camera-on time in the challenge voice channel and, the moment someone passes a day,
   records it on chain (`record_progress`, signed by the server key). Failed writes are retried every minute.
2. After a challenge ends the bot counts every participant (`tally`). The last one finalizes the challenge,
   which fixes the winners and their shares.
3. Winners call `claim` from the site: `prize pool × their multiply ÷ winner shares`, rounded down to
   0.01 USDC. The prize pool is 95% of the entry pool, plus anything rolled over.
4. If nobody passed, `rollover` moves the prize pool into the next challenge (`carry_over`).
5. `withdraw_fees` sends the remaining 5% and rounding dust to the treasury wallet.

The server key both co-signs registrations and records progress, so it needs a little SOL for fees.

### Test track

Set `CHALLENGE_TRACKS=2` in `server/.env` to run the short track: challenges start every 10 minutes and
have five 2-minute "days". Set `DAILY_GOAL_SECONDS` low (e.g. 30) to match. It exercises the same code as
the weekly track, so the full cycle can be checked in about 15 minutes.

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

## Deploying (devnet)

Three pieces go live: the program on devnet, the server (API + Discord bot) on a host that keeps a
process running, and the site on Vercel. The site talks to the server through Vercel rewrites, so both
share one origin and the Discord login cookie keeps working.

### 1. Program

The deployer wallet needs ~4.5 devnet SOL (~2.2 stays locked as rent, the rest comes back).

```bash
./scripts/deploy-devnet.sh        # uses HELIUS_API_KEY from server/.env if present
```

### 2. Server (Railway)

`server/Dockerfile` + `railway.json` are ready. In Railway: new project from this repo, add a volume
mounted at `/data`, then set the variables from `server/.env.example` plus:

- `VERIFIER_SECRET_KEY` — contents of `server/.keys/verifier.json` (a JSON array)
- `DB_PATH=/data/grind.db`
- `RPC_URL` — your Helius devnet URL
- `APP_URL` — the site's https URL (this also switches cookies to Secure)

### 3. Site (Vercel)

- Root directory `app`, framework Vite
- Environment: `VITE_SOLANA_NETWORK=devnet`, `VITE_RPC_URL=<your Helius devnet URL>`
- Edit `app/vercel.json` and replace `REPLACE-WITH-SERVER-HOST` with the Railway domain

### 4. Discord

Add `<site URL>/auth/discord/callback` to the OAuth redirects in the Discord Developer Portal, and keep
the local one for development.

### 5. Testers

Devnet USDC comes from [faucet.circle.com](https://faucet.circle.com) (pick Solana Devnet); devnet SOL for
fees from [faucet.solana.com](https://faucet.solana.com).
