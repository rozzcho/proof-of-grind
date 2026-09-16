#!/usr/bin/env bash
# Builds and deploys the program to devnet, then refreshes the IDL the app and server read.
set -euo pipefail
cd "$(dirname "$0")/.."

# Prefer the Helius endpoint if HELIUS_API_KEY is in server/.env
if [ -f server/.env ]; then
  # shellcheck disable=SC1090
  source <(grep -E '^HELIUS_API_KEY=' server/.env || true)
fi
RPC="${DEVNET_RPC:-}"
if [ -z "$RPC" ] && [ -n "${HELIUS_API_KEY:-}" ]; then
  RPC="https://devnet.helius-rpc.com/?api-key=$HELIUS_API_KEY"
fi
RPC="${RPC:-https://api.devnet.solana.com}"

WALLET="${SOLANA_WALLET:-$HOME/.config/solana/id.json}"
BALANCE=$(solana balance -u "$RPC" -k "$WALLET" | awk '{print $1}')
echo "deployer $(solana address -k "$WALLET") has $BALANCE SOL on devnet"
awk -v b="$BALANCE" 'BEGIN { if (b < 4.5) { print "need ~4.5 SOL to deploy (2.2 stays locked, the rest comes back)"; exit 1 } }'

NO_DNA=1 anchor build
solana program deploy target/deploy/proof_of_grind.so \
  --program-id target/deploy/proof_of_grind-keypair.json \
  -u "$RPC" -k "$WALLET"

cp target/idl/proof_of_grind.json target/types/proof_of_grind.ts app/src/idl/
echo "deployed. IDL copied into app/src/idl — commit it so the server and site match."
