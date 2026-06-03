# GoAlert MCP Server — Design

**Date:** 2026-06-03
**Status:** Approved (design), pending implementation plan

## 1. Purpose

A Model Context Protocol (MCP) server that gives an LLM client read **and** write
control over a [GoAlert](https://github.com/target/goalert) instance. A user points it
at their GoAlert URL and supplies credentials; the server exposes a curated set of tools
covering the day-to-day on-call workflow (alerts, on-call, services, escalation policies,
schedules, rotations, overrides, integration keys, heartbeats, labels) plus a read-only
raw GraphQL escape hatch.

## 2. Decisions (locked)

| Decision | Choice |
|---|---|
| Language / runtime | TypeScript on Node, official `@modelcontextprotocol/sdk` |
| Transport | Local **stdio**, per-user; config via env vars |
| Auth input | **Username + password** (server logs in, manages session token) **or** a **pre-obtained session/bearer token**. GoAlert "GraphQL API keys" are *not* supported (each is locked to one fixed query → can't drive general tools). |
| Coverage | **Operator-focused**: full READ everywhere; WRITE on the on-call workflow. Excludes user-account writes and admin/system-config writes. |
| Escape hatch | **Read-only** raw GraphQL query tool (rejects mutations). |

## 3. Background: GoAlert API facts that drive the design

Verified against `target/goalert` source (master, May 2026).

- **Single GraphQL endpoint:** `POST /api/graphql` (explorer at `/api/graphql/explore`).
  Introspection is enabled. Nearly all entities are CRUD-able here.
- **Auth flow for full control:** `POST /api/v2/identity/providers/basic?noRedirect=1`
  with form fields `username`/`password` and a valid `Referer` header → returns a
  **session token** in the body. Send it as `Authorization: Bearer <token>` on GraphQL
  calls. This impersonates a real user, so role/permission checks apply normally.
- **Concurrency lock:** GoAlert allows only **one in-flight request per auth source**;
  parallel calls on one token queue (`MaxWait: 100`) and time out at ~20s. → the client
  **serializes** all GraphQL requests behind a per-token mutex.
- **Schema migration in progress:** the API is moving from `targets`/`type` enums to a
  unified `Destination` / `args: StringMap` model. → prefer the modern, non-deprecated
  fields.
- **Generic mutations** let us collapse many per-entity tools:
  - `deleteAll(input: [TargetInput!])` — delete by `{type, id}` for services, schedules,
    rotations, escalation policies, integration keys, heartbeat monitors, overrides, etc.
  - `setLabel(input: SetLabelInput!)` — set/remove a label (empty value deletes).
  - `setFavorite(input: SetFavoriteInput!)` — favorite/unfavorite a target.
- **Overrides are schedule-scoped only.** `UserOverride` (`createUserOverride` /
  `updateUserOverride`) is bound to a `scheduleID`; **there is no rotation override
  entity or mutation.** Rotation-level control is via `updateRotation.activeUserIndex`
  (set/advance the active user; *not* available on create) and `userIDs` (participants).
  There is no `advanceRotation`/`setActiveUser`/handoff mutation. To override a
  rotation-driven on-call user, create a schedule-level override on the schedule the
  rotation is bound to, or use a temporary schedule.
- **Other gotchas:** request body limit ~256 KiB; mutations that fan out externally can
  fail with `external call limit reached for this request`; GraphQL errors carry
  `extensions.code` (`INVALID_INPUT_VALUE`, `INVALID_DEST_FIELD_VALUE`,
  `INVALID_MAP_FIELD_VALUE`, `EXPR_TOO_COMPLEX`) and a field `path`; auth failures surface
  as `Unauthorized`.

## 4. Architecture

Approach: **curated tools over a small hand-written GoAlert client.** Each tool maps to
one or a few hand-written GraphQL operations with Zod-validated inputs and trimmed,
model-friendly outputs. TypeScript types for the operations we ship are generated from
the live schema via introspection (`graphql-codegen`).

```
src/
  index.ts              # stdio MCP server bootstrap; registers tools; wires config+client
  config.ts             # env parsing + validation; READ_ONLY toggle
  client/
    auth.ts             # username/password -> session token; token passthrough; re-auth on 401
    graphql.ts          # serialized executor (per-token mutex), pagination helper, retry
    errors.ts           # GoAlert error -> clean MCP error (codes, validation path, redaction)
  graphql/
    operations/*.graphql  # hand-written queries/mutations
    generated.ts          # codegen types from live introspection
  tools/
    common.ts             # goalert_graphql_query, goalert_delete, set_favorite, set_label
    alerts.ts services.ts oncall.ts escalation.ts schedules.ts
    rotations.ts users.ts keys.ts heartbeats.ts
  format.ts             # shape GraphQL results into compact tool output
  readonly.ts           # central guard used by every mutation tool
```

### Client behaviors

- **Auth:** if `GOALERT_USERNAME`/`GOALERT_PASSWORD` are set, log in (synthesizing the
  required `Referer` from the base URL), cache the session token, and transparently
  re-auth + retry **once** on an `Unauthorized` response. If `GOALERT_TOKEN` is set,
  use it directly as `Authorization: Bearer` (no login, no auto-refresh — surface a clear
  error if it expires). Exactly one of the two credential modes must be provided.
- **Serialization:** a mutex forces one in-flight GraphQL request per token. List
  auto-pagination loops sequentially.
- **Read-only guard:** a global `GOALERT_READ_ONLY=true` env hard-disables every mutation
  tool (the tools are not registered at all, so they don't appear to the client).
  Independent of this, destructive tools require an explicit `confirm: true`.
- **Tool annotations:** each tool is marked with MCP annotations — `readOnlyHint` for
  pure reads, `destructiveHint` for deletes and the like.
- **Modern schema:** prefer `Destination`/`args` over deprecated `targets`/`type`.

## 5. Tool surface (~32 tools)

### Cross-cutting (`common.ts`)
- **`goalert_graphql_query`** — run an arbitrary GraphQL *query*; **rejects** any document
  containing a mutation/subscription. The escape hatch for uncovered reads. *(readOnly)*
- **`goalert_delete`** — delete by `{type, ids[]}` via `deleteAll`. Covers services,
  schedules, rotations, escalation policies, integration keys, heartbeat monitors,
  overrides, etc. *Requires `confirm: true`. (destructive)*
- **`goalert_set_favorite`** — favorite/unfavorite a service/schedule/rotation.
- **`goalert_set_label`** — set or remove (empty value) a key/value label on a target.

### Alerts (`alerts.ts`)
- **`list_alerts`** — filter by service IDs, status, search, time range; cursor pagination
  with opt-in bounded auto-paginate. *(readOnly)*
- **`get_alert`** — full detail incl. current state and recent log events. *(readOnly)*
- **`create_alert`** — `serviceID`, `summary`, `details`, `dedup`, `meta`.
- **`manage_alerts`** — ack / close / escalate a set of alert IDs, or close-all-for-service.

### On-call (`oncall.ts`)
- **`get_on_call`** — who is on call for a **service** or a **schedule** (schedule takes a
  start/end window); also a **user**'s on-call overview. *(readOnly)*

### Services (`services.ts`)
- **`list_services`** *(readOnly)* · **`get_service`** (keys, heartbeats, labels, on-call,
  EP) *(readOnly)* · **`create_service`** · **`update_service`** (name/desc/EP/maintenance
  window).

### Escalation policies (`escalation.ts`)
- **`list_escalation_policies`** *(readOnly)* · **`get_escalation_policy`** (steps +
  actions) *(readOnly)* · **`create_escalation_policy`** · **`update_escalation_policy`**
  (name/desc/repeat) · **`manage_escalation_policy_steps`** (add / update / move / remove
  steps; targets expressed via `Destination`/`args`).

### Schedules (`schedules.ts`)
- **`list_schedules`** *(readOnly)* · **`get_schedule`** (rules, shifts, temp schedules,
  overrides) *(readOnly)* · **`create_schedule`** · **`update_schedule`** (name/desc/tz +
  rules/targets via `updateScheduleTarget`) · **`manage_overrides`** (create/update
  add/remove/replace `UserOverride`s; schedule-scoped) · **`manage_temporary_schedule`**
  (set / clear).

### Rotations (`rotations.ts`)
- **`list_rotations`** *(readOnly)* · **`get_rotation`** (incl. `activeUserIndex`,
  `nextHandoffTimes`) *(readOnly)* · **`create_rotation`** · **`update_rotation`** —
  exposes **`activeUserIndex`** (manually set/advance the active on-call user) and
  `userIDs` (participants), plus name/desc/tz/type/shiftLength/start.

### Users (`users.ts`) — read-only in this tier
- **`list_users`** *(readOnly)* · **`get_user`** (contact methods, on-call overview)
  *(readOnly)*.

### Service sub-resources
- **`manage_integration_keys`** (`keys.ts`) — create / list integration keys for a
  service (delete via `goalert_delete`).
- **`manage_heartbeat_monitors`** (`heartbeats.ts`) — create / update heartbeat monitors
  (delete via `goalert_delete`); returns the check-in `href`.

## 6. Configuration (env vars)

| Var | Required | Notes |
|---|---|---|
| `GOALERT_BASE_URL` | yes | e.g. `https://goalert.example.com` (no trailing `/api/...`) |
| `GOALERT_USERNAME` | one of | with `GOALERT_PASSWORD` |
| `GOALERT_PASSWORD` | one of | |
| `GOALERT_TOKEN` | one of | pre-obtained session/bearer token; mutually exclusive with username/password |
| `GOALERT_READ_ONLY` | no | `true` → register no mutation tools |
| `GOALERT_REFERER` | no | overrides the `Referer` used at login (defaults to base URL) |

Config validation fails fast with a clear message if neither credential mode (or both) is
supplied, or if `GOALERT_BASE_URL` is missing/malformed.

## 7. Output, errors, pagination

- **Output:** every tool returns compact JSON (unwrapped from the GraphQL envelope, large
  fields trimmed, `href`s and IDs surfaced) plus a short human-readable text summary.
  List tools return `{ items, nextCursor, hasMore }`.
- **Errors:** GraphQL errors mapped to clean messages carrying `extensions.code` and field
  `path`; special handling for `Unauthorized` (one re-auth + retry when in
  username/password mode), the per-auth-source concurrency timeout, and `external call
  limit reached`. **Credentials are redacted from all error text and logs.**
- **Pagination:** `first` / `after` on every list, cursor surfaced as `nextCursor`;
  optional bounded auto-paginate (hard cap to avoid runaway loops).

## 8. Testing

- **Client unit tests** against a mocked `fetch`: login flow (incl. `noRedirect` body
  parsing and `Referer` synthesis), mutex serialization (no overlapping in-flight
  requests), 401 → re-auth + retry, error mapping, credential redaction.
- **Per-tool tests** against a mocked client: input validation (Zod), read-only guard
  (mutation tools absent when `GOALERT_READ_ONLY=true`), `confirm` enforcement on
  destructive tools, output shaping, raw-query mutation rejection.
- **Integration smoke test** (read-only) against the hosted instance
  (`https://goalert.example.com`), gated behind an env flag so CI doesn't require
  live credentials.

## 9. Distribution

- Publishable / runnable via `npx`.
- README with ready-to-paste Claude Desktop / Claude Code MCP config blocks for both
  credential modes, the full env-var table, and a short tool catalog.

## 10. Out of scope (this iteration)

- User-account writes (create/update/delete users, set passwords, contact methods,
  notification rules).
- Admin/system writes (`setConfig`, `setSystemLimits`, GraphQL-API-key management).
- Universal Integration Keys (UIK) / dynamic-action authoring (experimental, server-flag
  gated).
- Remote/HTTP multi-tenant transport (architecture stays transport-friendly so it can be
  added later, but stdio ships first).
- Write support via raw GraphQL (escape hatch is read-only by design).
