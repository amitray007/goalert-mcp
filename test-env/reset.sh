#!/usr/bin/env bash
# Wipe the sandbox completely (deletes the Postgres data volume) and rebuild.
set -euo pipefail
cd "$(dirname "$0")"

echo ">> Wiping GoAlert test environment (docker compose down -v — DELETES DB)…"
docker compose down -v
echo ">> Rebuilding from scratch…"
exec ./setup.sh
