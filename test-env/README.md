# GoAlert test environment

A self-contained local [GoAlert](https://github.com/target/goalert) instance for
exercising the `goalert-mcp` server end-to-end (and for poking at the GoAlert web
UI / GraphQL explorer directly).

It runs the production `goalert/goalert` image against a dedicated Postgres
container. Notifications are **stubbed** (`--stub-notifiers`), so escalation logic
runs but nothing is sent — no Twilio/SMTP setup required.

## Requirements

- Docker + Docker Compose (`docker compose version`)
- Port **8081** free on the host (the Postgres container is **not** published, so
  any local Postgres on 5432/5433 is untouched)

## Usage

```bash
cd test-env
./setup.sh        # start everything + create the admin user
./smoke.sh        # verify health + login + a sample GraphQL query
./teardown.sh     # stop containers, keep the database
./reset.sh        # wipe the database volume and rebuild from scratch
```

After `./setup.sh`:

| | |
|---|---|
| Web UI / API | http://localhost:8081 |
| GraphQL endpoint | http://localhost:8081/api/graphql |
| GraphQL explorer | http://localhost:8081/api/graphql/explore |
| Admin login | `admin` / `admin123` (role: admin) |

The instance starts **empty** — create services, schedules, escalation policies,
etc. via the MCP's write tools (the real end-to-end test) or through the web UI.

## Pointing the MCP at it

Password mode (recommended — auto-refreshes the session):

```json
{
  "mcpServers": {
    "goalert": {
      "command": "node",
      "args": ["/path/to/goalert-mcp/dist/index.js"],
      "env": {
        "GOALERT_BASE_URL": "http://localhost:8081",
        "GOALERT_USERNAME": "admin",
        "GOALERT_PASSWORD": "admin123"
      }
    }
  }
}
```

Token mode: run `./smoke.sh`, copy the printed session token, and set
`GOALERT_TOKEN` instead of the username/password pair.

## Running the integration smoke test against it

```bash
GOALERT_INTEGRATION=1 \
GOALERT_BASE_URL=http://localhost:8081 \
GOALERT_USERNAME=admin GOALERT_PASSWORD=admin123 \
npm test
```

## Notes

- Image is pinned to `goalert/goalert:v0.34.1`; Postgres is `postgres:17-alpine`.
- The server auto-applies DB migrations on startup.
- `add-user` is not idempotent; `setup.sh` treats "already exists" as success.
- Customize creds/URL via env: `GOALERT_ADMIN_USER`, `GOALERT_ADMIN_PASS`, `GOALERT_URL`.
