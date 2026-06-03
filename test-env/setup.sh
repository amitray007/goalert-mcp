#!/usr/bin/env bash
# Bring up the local GoAlert sandbox and ensure an admin user exists.
set -euo pipefail
cd "$(dirname "$0")"

URL="${GOALERT_URL:-http://localhost:8081}"
USER="${GOALERT_ADMIN_USER:-admin}"
PASS="${GOALERT_ADMIN_PASS:-admin123}"

echo ">> Starting GoAlert + Postgres (docker compose up -d)…"
docker compose up -d

echo ">> Waiting for GoAlert /health at ${URL} …"
for i in $(seq 1 90); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "${URL}/health" || true)"
  if [ "$code" = "200" ]; then
    echo "   GoAlert is healthy."
    break
  fi
  if [ "$i" -eq 90 ]; then
    echo "!! Timed out waiting for GoAlert. Recent logs:"
    docker compose logs --tail=60 goalert
    exit 1
  fi
  sleep 2
done

echo ">> Ensuring admin user '${USER}' (role: admin) exists…"
# add-user is NOT idempotent: it errors if the username already exists. Treat
# that as success so re-running setup is safe.
if docker compose exec -T goalert goalert add-user --user "${USER}" --pass "${PASS}" --admin 2>/tmp/ga_adduser.err; then
  echo "   Created admin user '${USER}'."
elif grep -qiE 'not unique|already|duplicate|exists' /tmp/ga_adduser.err; then
  echo "   Admin user '${USER}' already exists — leaving it as-is."
else
  echo "!! add-user failed:"
  cat /tmp/ga_adduser.err
  exit 1
fi

cat <<EOF

────────────────────────────────────────────────────────────
GoAlert test environment is READY.

  Web UI / API : ${URL}
  GraphQL      : ${URL}/api/graphql
  Explorer     : ${URL}/api/graphql/explore
  Admin login  : ${USER} / ${PASS}   (role: admin)

MCP config (password mode):
  GOALERT_BASE_URL=${URL}
  GOALERT_USERNAME=${USER}
  GOALERT_PASSWORD=${PASS}

  Stop (keep data):   ./teardown.sh
  Reset (wipe data):  ./reset.sh
  Smoke test:         ./smoke.sh
────────────────────────────────────────────────────────────
EOF
