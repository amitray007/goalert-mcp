#!/usr/bin/env bash
# Stop the sandbox, preserving the Postgres data volume.
set -euo pipefail
cd "$(dirname "$0")"

echo ">> Stopping GoAlert test environment (data volume preserved)…"
docker compose down
echo "   Done. Run ./setup.sh to start again, or ./reset.sh to wipe data."
