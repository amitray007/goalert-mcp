# goalert-mcp

[![CI](https://github.com/amitray007/goalert-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/amitray007/goalert-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](.nvmrc)
[![DeepWiki](https://img.shields.io/badge/DeepWiki-amitray007%2Fgoalert--mcp-blue.svg?logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACwAAAAyCAYAAAAnWDnqAAAAAXNSR0IArs4c6QAAA05JREFUaEPtmUtyEzEQhtWTQyQLHNak2AB7ZnyXZMEjXMGeK/AIi+QuHrMnbChYY7MIh8g01fJoopFb0uhhEqqcbWTp06/uv1saEDv4O3n3dV60RfP947Mm9/SQc0ICFQgzfc4CYZoTPAswgSJCCUJUnAAoRHOAUOcATwbmVLWdGoH//PB8mnKqScAhsD0kYP3j/Yt5LPQe2KvcXmGvRHcDnpxfL2zOYJ1mFwrryWTz0advv1Ut4CJgf5uhDuDj5eUcAUoahrdY/56ebRWeraTjMt/00Sh3UDtjgHtQNHwcRGOC98BJEAEymycmYcWwOprTgcB6VZ5JK5TAJ+fXGLBm3FDAmn6oPPjR4rKCAoJCal2eAiQp2x0vxTPB3ALO2CRkwmDy5WohzBDwSEFKRwPbknEggCPB/imwrycgxX2NzoMCHhPkDwqYMr9tRcP5qNrMZHkVnOjRMWwLCcr8ohBVb1OMjxLwGCvjTikrsBOiA6fNyCrm8V1rP93iVPpwaE+gO0SsWmPiXB+jikdf6SizrT5qKasx5j8ABbHpFTx+vFXp9EnYQmLx02h1QTTrl6eDqxLnGjporxl3NL3agEvXdT0WmEost648sQOYAeJS9Q7bfUVoMGnjo4AZdUMQku50McDcMWcBPvr0SzbTAFDfvJqwLzgxwATnCgnp4wDl6Aa+Ax283gghmj+vj7feE2KBBRMW3FzOpLOADl0Isb5587h/U4gGvkt5v60Z1VLG8BhYjbzRwyQZemwAd6cCR5/XFWLYZRIMpX39AR0tjaGGiGzLVyhse5C9RKC6ai42ppWPKiBagOvaYk8lO7DajerabOZP46Lby5wKjw1HCRx7p9sVMOWGzb/vA1hwiWc6jm3MvQDTogQkiqIhJV0nBQBTU+3okKCFDy9WwferkHjtxib7t3xIUQtHxnIwtx4mpg26/HfwVNVDb4oI9RHmx5WGelRVlrtiw43zboCLaxv46AZeB3IlTkwouebTr1y2NjSpHz68WNFjHvupy3q8TFn3Hos2IAk4Ju5dCo8B3wP7VPr/FGaKiG+T+v+TQqIrOqMTL1VdWV1DdmcbO8KXBz6esmYWYKPwDL5b5FA1a0hwapHiom0r/cKaoqr+27/XcrS5UwSMbQAAAABJRU5ErkJggg==)](https://deepwiki.com/amitray007/goalert-mcp)

`goalert-mcp` is an MCP (Model Context Protocol) server that gives an LLM read and write control over a [GoAlert](https://github.com/target/goalert) on-call management instance. It communicates with GoAlert over its GraphQL API, supports authentication via username/password (with automatic session refresh) or a pre-obtained session token, exposes 33 curated operator tools across alerts, services, schedules, rotations, escalation policies, and more, and includes a built-in read-only mode that hides all mutating tools.

---

## Install and run

### Via npx (no local install required)

```bash
GOALERT_BASE_URL=https://goalert.example.com \
GOALERT_USERNAME=admin \
GOALERT_PASSWORD=your-password \
npx -y goalert-mcp
```

### From a local build

```bash
npm run build
GOALERT_BASE_URL=https://goalert.example.com \
GOALERT_USERNAME=admin \
GOALERT_PASSWORD=your-password \
node dist/index.js
```

---

## Configuration

All configuration is via environment variables.

| Variable | Required | Description |
|---|---|---|
| `GOALERT_BASE_URL` | Yes | Base URL of the GoAlert instance, e.g. `https://goalert.example.com`. |
| `GOALERT_USERNAME` | One credential set | Username for password auth. Pair with `GOALERT_PASSWORD`. |
| `GOALERT_PASSWORD` | One credential set | Password for password auth. |
| `GOALERT_TOKEN` | One credential set | Pre-obtained session token. Mutually exclusive with username/password. |
| `GOALERT_READ_ONLY` | No | Set to `true` to hide all mutating tools (safe read-only mode). |
| `GOALERT_REFERER` | No | Override the `Referer` header sent with requests. Defaults to `GOALERT_BASE_URL`. |

**Username + password is recommended.** The session token is obtained automatically on first use and refreshed on expiry. No manual token management needed.

**About `GOALERT_TOKEN`:** This must be a GoAlert *session* token — the kind returned by the login API. It is NOT a GoAlert "GraphQL API key" (those are restricted to a single hardcoded query and will not work). Session tokens expire in approximately 30 days and are not automatically refreshed; when one expires you must obtain a new one.

---

## MCP client configuration

### Claude Desktop — password mode

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "goalert": {
      "command": "npx",
      "args": ["-y", "goalert-mcp"],
      "env": {
        "GOALERT_BASE_URL": "https://goalert.example.com",
        "GOALERT_USERNAME": "admin",
        "GOALERT_PASSWORD": "your-password"
      }
    }
  }
}
```

### Claude Desktop — token mode

```json
{
  "mcpServers": {
    "goalert": {
      "command": "npx",
      "args": ["-y", "goalert-mcp"],
      "env": {
        "GOALERT_BASE_URL": "https://goalert.example.com",
        "GOALERT_TOKEN": "your-session-token"
      }
    }
  }
}
```

### Claude Code (`claude mcp add`)

```bash
claude mcp add goalert \
  -e GOALERT_BASE_URL=https://goalert.example.com \
  -e GOALERT_USERNAME=admin \
  -e GOALERT_PASSWORD=your-password \
  -- npx -y goalert-mcp
```

---

## Tool catalog

Tools marked **(read-only)** never modify GoAlert state. Tools marked **(mutating)** require write credentials and are hidden when `GOALERT_READ_ONLY=true`. Tools marked **(destructive)** additionally require `confirm: true` in the call arguments.

### Cross-cutting

| Tool | Type | Purpose |
|---|---|---|
| `goalert_graphql_query` | read-only | Run an arbitrary read-only GraphQL query against `/api/graphql`. Mutations and subscriptions are rejected. Use for reads not covered by a dedicated tool. |
| `goalert_delete` | mutating, destructive | Delete one or more resources of a single type by ID (uses `deleteAll`). Covers services, schedules, rotations, escalation policies, integration keys, heartbeat monitors, user overrides, and calendar subscriptions. Requires `confirm: true`. |
| `goalert_set_favorite` | mutating | Mark a service, schedule, rotation, or user as a favorite (or unfavorite). |
| `goalert_set_label` | mutating | Set or remove a key/value label on a target (usually a service). An empty `value` deletes the label. Keys must be namespaced (`prefix/suffix`). |

### Alerts

| Tool | Type | Purpose |
|---|---|---|
| `list_alerts` | read-only | List alerts filtered by service IDs, status (`unacked`/`acked`/`closed`), or free-text search. Cursor-paginated. |
| `get_alert` | read-only | Get full detail for one alert by its numeric alertID, including state and recent log events. |
| `create_alert` | mutating | Create an alert on a service. Supports dedup keys and arbitrary metadata. |
| `manage_alerts` | mutating | Acknowledge, close, unacknowledge, or escalate alerts. Target specific alertIDs or all alerts on a service. |

### On-call

| Tool | Type | Purpose |
|---|---|---|
| `get_on_call` | read-only | Report who is on call. Provide one of: `serviceID` (current on-call users), `scheduleID` + time window (shifts), or `userID` (their on-call overview). |

### Services

| Tool | Type | Purpose |
|---|---|---|
| `list_services` | read-only | List services with search, favorites-first, and cursor pagination. |
| `get_service` | read-only | Get one service with its escalation policy, on-call users, labels, integration keys, and heartbeat monitors. |
| `create_service` | mutating | Create a service with a name and optional escalation policy. |
| `update_service` | mutating | Update a service's name, description, escalation policy, or maintenance window. |

### Escalation policies

| Tool | Type | Purpose |
|---|---|---|
| `list_escalation_policies` | read-only | List escalation policies with search and cursor pagination. |
| `get_escalation_policy` | read-only | Get one escalation policy with its steps (actions) and assigned services. |
| `create_escalation_policy` | mutating | Create an escalation policy with a name, optional description, and repeat count. |
| `update_escalation_policy` | mutating | Update an escalation policy's name, description, repeat count, or step order. Pass `stepIDs` as the full ordered list to keep (omit an ID to remove that step). |
| `manage_escalation_policy_steps` | mutating | Add or update a step on an escalation policy. A step notifies targets (users, schedules, or rotations) after a delay. |

### Schedules

| Tool | Type | Purpose |
|---|---|---|
| `list_schedules` | read-only | List schedules with search, favorites-first, and cursor pagination. |
| `get_schedule` | read-only | Get one schedule with its targets (rotation/user assignments), rules, on-call shifts, and overrides. |
| `create_schedule` | mutating | Create a schedule with a name and IANA time zone. |
| `update_schedule` | mutating | Update a schedule's name, description, or time zone. |
| `set_schedule_target` | mutating | Assign a rotation or user to a schedule with time rules, or update/clear an existing assignment. |
| `manage_overrides` | mutating | Create, update, or list schedule overrides (add/remove/replace a user for a time window). |
| `manage_temporary_schedule` | mutating | Set or clear a temporary schedule window that replaces the normal on-call during that period. |

### Rotations

| Tool | Type | Purpose |
|---|---|---|
| `list_rotations` | read-only | List rotations with search, favorites-first, and cursor pagination. |
| `get_rotation` | read-only | Get one rotation with its users, active user index, next handoff times, and shift history. |
| `create_rotation` | mutating | Create a rotation. Type is one of `hourly`, `daily`, `weekly`, or `monthly`. |
| `update_rotation` | mutating | Update a rotation's name, description, type, shift length, start time, or user list. Set `activeUserIndex` to override who is currently on call. |

### Users (read-only)

| Tool | Type | Purpose |
|---|---|---|
| `list_users` | read-only | List users with search and cursor pagination. |
| `get_user` | read-only | Get one user with their contact methods and on-call overview. |

### Integration keys

| Tool | Type | Purpose |
|---|---|---|
| `manage_integration_keys` | mutating | Create or list integration keys for a service. Supported types: `generic`, `grafana`, `site24x7`, `prometheusAlertmanager`, `email`, `universal`. Returns the ingest `href`. Delete via `goalert_delete` with type `integrationKey`. |

### Heartbeat monitors

| Tool | Type | Purpose |
|---|---|---|
| `manage_heartbeat_monitors` | mutating | Create or update a heartbeat monitor for a service. Returns the check-in `href`. Delete via `goalert_delete` with type `heartbeatMonitor`. |

---

## Read-only mode

Set `GOALERT_READ_ONLY=true` to hide all mutating tools. Only the 14 read-only tools will be registered with the MCP client. This is useful for giving an LLM read access without write risk.

---

## Security

- Credentials (username, password, token) are stored only in the process environment and are never logged or echoed in tool output.
- Any error messages that might otherwise include credential values are automatically redacted before being returned.
- All communication with GoAlert uses HTTPS (as determined by your `GOALERT_BASE_URL`).

---

## Local testing with the included sandbox

A local GoAlert sandbox is included under `test-env/`:

```bash
cd test-env
./setup.sh
```

This starts GoAlert at `http://localhost:8081` with credentials `admin` / `admin123`.

### Run the integration smoke test

```bash
GOALERT_INTEGRATION=1 \
GOALERT_BASE_URL=http://localhost:8081 \
GOALERT_USERNAME=admin \
GOALERT_PASSWORD=admin123 \
npm test
```

The integration test is skipped by default (when `GOALERT_INTEGRATION` is not set to `1`) so `npm test` stays green without a live instance.

---

## How to obtain a session token manually

If you prefer token auth, obtain a session token by POSTing to the login endpoint:

```bash
curl -s -XPOST \
  -H 'Referer: https://goalert.example.com' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=admin&password=your-password' \
  'https://goalert.example.com/api/v2/identity/providers/basic?noRedirect=1'
```

The response body is the session token. Set it as `GOALERT_TOKEN`. Tokens expire in approximately 30 days; re-run the above to refresh.

---

## Development

```bash
npm install
npm run build        # compile TypeScript → dist/
npm run typecheck    # type-check without emitting
npm run test         # run the unit test suite
npm run introspect   # dump GoAlert's GraphQL schema to schema.graphql (requires live instance)
```

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, the local sandbox, and the tool-authoring guide, and please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Found a security issue? See [SECURITY.md](SECURITY.md). Release notes live in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE) © Amit Ray
