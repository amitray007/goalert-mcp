#!/usr/bin/env bash
# Quick end-to-end check of the sandbox: health, login (the exact flow the MCP
# uses), and a sample authenticated GraphQL query. Prints a session token you
# can reuse as GOALERT_TOKEN.
set -euo pipefail
cd "$(dirname "$0")"

URL="${GOALERT_URL:-http://localhost:8081}"
USER="${GOALERT_ADMIN_USER:-admin}"
PASS="${GOALERT_ADMIN_PASS:-admin123}"

echo ">> GET ${URL}/health"
curl -s -o /dev/null -w '   HTTP %{http_code}\n' "${URL}/health"

echo ">> POST /api/v2/identity/providers/basic?noRedirect=1  (basic auth -> session token)"
TOKEN="$(curl -s -X POST -H "Referer: ${URL}" \
  --data-urlencode "username=${USER}" --data-urlencode "password=${PASS}" \
  "${URL}/api/v2/identity/providers/basic?noRedirect=1")"
if [ -z "$TOKEN" ] || printf '%s' "$TOKEN" | grep -qi 'unauthorized'; then
  echo "!! Login failed: ${TOKEN:-<empty>}"
  exit 1
fi
echo "   Got session token (${#TOKEN} chars)."

echo ">> POST /api/graphql  (current user + first services)"
curl -s -X POST "${URL}/api/graphql" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Referer: ${URL}" \
  --data '{"query":"query{ user { id name role } services(input:{first:5}){ nodes { id name } } }"}'
echo

echo ">> Session token (reusable as GOALERT_TOKEN):"
echo "${TOKEN}"
