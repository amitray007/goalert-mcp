# Contributing to goalert-mcp

Thanks for your interest in contributing! Bug reports, feature requests, and pull
requests are all welcome.

## Development setup

- Node.js **20+** (see [`.nvmrc`](.nvmrc); `nvm use` to match).
- Install dependencies:

  ```bash
  npm install
  ```

- Common scripts:

  ```bash
  npm run build      # clean + compile to dist/ (production build config)
  npm run typecheck  # tsc --noEmit (also type-checks the test files)
  npm test           # run the vitest unit suite
  npm run test:watch # watch mode
  ```

All three of `build`, `typecheck`, and `test` must pass before a PR can land — CI
enforces this on Node 20 and 22.

## Local GoAlert sandbox

A self-contained, Dockerized GoAlert instance lives in [`test-env/`](test-env/) for
end-to-end testing (no Twilio/SMTP needed — notifications are stubbed):

```bash
cd test-env
./setup.sh     # GoAlert at http://localhost:8081 (admin / admin123)
./smoke.sh     # verify health + login + a sample query
./teardown.sh  # stop (keeps data) — ./reset.sh wipes
```

Run the env-gated live integration test against it:

```bash
GOALERT_INTEGRATION=1 GOALERT_BASE_URL=http://localhost:8081 \
  GOALERT_USERNAME=admin GOALERT_PASSWORD=admin123 npm test
```

(Without `GOALERT_INTEGRATION=1`, the integration test is skipped, so the default
`npm test` needs no live instance.)

## Project layout

```
src/
  config.ts            # env parsing + validation
  client/{auth,graphql,errors}.ts   # auth, serialized GraphQL executor, error mapping
  format.ts            # tool result shaping (ok / listResult)
  tools/               # registry + types + one module per area (alerts, services, …)
  graphql/operations.ts # hand-written GraphQL operation strings
  server.ts, index.ts  # stdio MCP bootstrap + bin entry
```

## Adding or changing a tool

1. Add the GraphQL operation string to `src/graphql/operations.ts`. **Verify every
   field and input name against the real schema** — `npm run introspect` dumps the live
   schema to `schema.graphql` (requires GoAlert credentials in your env). A wrong field
   name surfaces as a runtime "Cannot query field" error.
2. Add a `ToolDef` to the relevant `src/tools/<area>.ts`:
   - read tools: `mutating: false`; write tools: `mutating: true`; destructive ones also
     `destructive: true` and should require an explicit `confirm`.
   - write clear `description`s and Zod `.describe()`s — an LLM relies on them.
3. Make sure the module's tool array is included in `allToolDefs()` in `src/server.ts`.
4. Add tests in `src/tools/<area>.test.ts` covering the variables sent and validation
   branches. Follow TDD where practical.

The tool registry (`src/tools/registry.ts`) is the single chokepoint that enforces
read-only mode, sets MCP annotations, and wraps errors — tools don't handle those.

## Pull requests

- Keep changes focused and include tests.
- Update `README.md` and `CHANGELOG.md` (`[Unreleased]`) when behavior changes.
- Ensure `npm run build`, `npm run typecheck`, and `npm test` are green.

By contributing, you agree that your contributions are licensed under the project's
[MIT License](LICENSE).
