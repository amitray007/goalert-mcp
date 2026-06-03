# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-06-03

### Added

- Initial release: a TypeScript (stdio) MCP server for [GoAlert](https://github.com/target/goalert).
- **33 curated tools** (14 read-only, 19 mutating, 1 destructive) over GoAlert's GraphQL API,
  covering alerts, on-call lookup, services, escalation policies (and steps), schedules
  (targets, overrides, temporary schedules), rotations, users (read-only), integration keys,
  and heartbeat monitors.
- Cross-cutting tools: generic `goalert_delete` (requires `confirm: true`), `goalert_set_favorite`,
  `goalert_set_label`, and a read-only raw GraphQL escape hatch (`goalert_graphql_query`).
- Authentication via username/password (auto-refreshing session token) or a pre-obtained
  session/bearer token.
- `GOALERT_READ_ONLY=true` mode that registers only the read-only tools.
- Serialized GraphQL client that respects GoAlert's one-in-flight-per-auth-source limit, with
  transparent re-authentication on session expiry and credential redaction in errors.
- Dockerized local test environment under `test-env/`.

[Unreleased]: https://github.com/amitray007/goalert-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/amitray007/goalert-mcp/releases/tag/v0.1.0
