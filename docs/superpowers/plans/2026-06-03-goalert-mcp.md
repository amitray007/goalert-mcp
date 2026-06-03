# GoAlert MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript stdio MCP server that gives an LLM read+write control over a GoAlert instance via its GraphQL API.

**Architecture:** A small hand-written GoAlert client (auth → session token, serialized GraphQL executor, error mapping) sits under a curated set of MCP tools. Each tool maps to one or a few hand-written GraphQL operations with Zod-validated inputs and compact outputs. A global read-only switch and per-tool `confirm` gates protect writes.

**Tech Stack:** Node 20+, TypeScript (ESM), `@modelcontextprotocol/sdk`, `zod`, `vitest`. No GraphQL codegen — operation strings are constants, types are hand-written from the verified schema (see spec §3). Distributed via `npx`.

**Spec:** `docs/superpowers/specs/2026-06-03-goalert-mcp-design.md`

---

## Conventions for the executor

- **TDD throughout.** Write the failing test, run it (confirm the *expected* failure), implement the minimum, run until green, commit.
- **Test runner:** `npx vitest run <path>` for a file, `npx vitest run -t "<name>"` for one test.
- **All network calls go through an injected `fetchFn` (defaults to global `fetch`).** Tests pass a mock; never hit the network in unit tests.
- **Commit after every task** with a `feat:`/`test:`/`chore:` message. Append the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Type/name contract (used across tasks — keep these exact):**
  - `GoAlertConfig`, `loadConfig(env)` — Task 2
  - `GoAlertError`, `GoAlertAuthError`, `mapGraphQLErrors()`, `redact()` — Task 3
  - `Authenticator` interface: `getToken()`, `invalidate()`, `canRefresh` — Task 4
  - `GoAlertClient` interface: `execute<T>(query, variables?)`, `paginate<T>(query, variables, extract, max?)` — Tasks 5–6
  - `Connection<T> = { nodes: T[]; pageInfo: { endCursor: string; hasNextPage: boolean } }` — Task 6
  - `Page<T> = { items: T[]; nextCursor: string | null; hasMore: boolean }` — Task 6
  - `ok(summary, data)`, `listResult(summary, page)` — Task 7
  - `ToolDef` + `registerTools(server, client, config, defs)` — Task 8
  - Each `tools/*.ts` exports `const <name>Tools: ToolDef[]`.

---

## Phase 1 — Foundation + read-only vertical slice

Produces a working MCP that can authenticate, run arbitrary read queries, list/inspect alerts, and report on-call. Independently shippable.

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `vitest.config.ts`, `src/index.ts` (stub), `src/smoke.test.ts`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "goalert-mcp",
  "version": "0.1.0",
  "description": "MCP server for GoAlert (read + write) over its GraphQL API",
  "type": "module",
  "bin": { "goalert-mcp": "dist/index.js" },
  "files": ["dist"],
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "introspect": "tsx scripts/introspect.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `.gitignore`**

```
node_modules/
dist/
*.log
.env
.DS_Store
schema.graphql
```

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 5: Write `src/index.ts` stub and `src/smoke.test.ts`**

```ts
// src/index.ts
export const VERSION = "0.1.0";
```

```ts
// src/smoke.test.ts
import { expect, test } from "vitest";
import { VERSION } from "./index.js";

test("version is exported", () => {
  expect(VERSION).toBe("0.1.0");
});
```

- [ ] **Step 6: Install and run**

Run: `npm install && npx vitest run src/smoke.test.ts`
Expected: 1 passing test.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold TypeScript MCP project"
```

---

### Task 2: Config loading & validation

**Files:**
- Create: `src/config.ts`, `src/config.test.ts`

- [ ] **Step 1: Write the failing test (`src/config.test.ts`)**

```ts
import { describe, expect, test } from "vitest";
import { loadConfig } from "./config.js";

const base = { GOALERT_BASE_URL: "https://goalert.example.com/" };

describe("loadConfig", () => {
  test("password mode normalizes base url and sets defaults", () => {
    const c = loadConfig({ ...base, GOALERT_USERNAME: "admin", GOALERT_PASSWORD: "pw" });
    expect(c.baseUrl).toBe("https://goalert.example.com"); // trailing slash stripped
    expect(c.auth).toEqual({ mode: "password", username: "admin", password: "pw" });
    expect(c.readOnly).toBe(false);
    expect(c.referer).toBe("https://goalert.example.com");
  });

  test("token mode", () => {
    const c = loadConfig({ ...base, GOALERT_TOKEN: "abc" });
    expect(c.auth).toEqual({ mode: "token", token: "abc" });
  });

  test("READ_ONLY and REFERER overrides", () => {
    const c = loadConfig({ ...base, GOALERT_TOKEN: "abc", GOALERT_READ_ONLY: "true", GOALERT_REFERER: "https://x" });
    expect(c.readOnly).toBe(true);
    expect(c.referer).toBe("https://x");
  });

  test("missing base url throws", () => {
    expect(() => loadConfig({ GOALERT_TOKEN: "abc" })).toThrow(/GOALERT_BASE_URL/);
  });

  test("no credentials throws", () => {
    expect(() => loadConfig(base)).toThrow(/credential/i);
  });

  test("both credential modes throws", () => {
    expect(() => loadConfig({ ...base, GOALERT_TOKEN: "abc", GOALERT_USERNAME: "a", GOALERT_PASSWORD: "b" }))
      .toThrow(/both/i);
  });

  test("partial password (username only) throws", () => {
    expect(() => loadConfig({ ...base, GOALERT_USERNAME: "a" })).toThrow(/password/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/config.test.ts`
Expected: FAIL (`loadConfig` not found).

- [ ] **Step 3: Implement `src/config.ts`**

```ts
export type GoAlertAuth =
  | { mode: "password"; username: string; password: string }
  | { mode: "token"; token: string };

export interface GoAlertConfig {
  baseUrl: string;
  auth: GoAlertAuth;
  readOnly: boolean;
  referer: string;
}

export class ConfigError extends Error {}

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): GoAlertConfig {
  const rawBase = env.GOALERT_BASE_URL?.trim();
  if (!rawBase) throw new ConfigError("GOALERT_BASE_URL is required (e.g. https://goalert.example.com)");
  let url: URL;
  try {
    url = new URL(rawBase);
  } catch {
    throw new ConfigError(`GOALERT_BASE_URL is not a valid URL: ${rawBase}`);
  }
  const baseUrl = `${url.protocol}//${url.host}`;

  const username = env.GOALERT_USERNAME?.trim();
  const password = env.GOALERT_PASSWORD;
  const token = env.GOALERT_TOKEN?.trim();

  const hasPassword = Boolean(username || password);
  const hasToken = Boolean(token);
  if (hasPassword && hasToken) {
    throw new ConfigError("Provide either GOALERT_USERNAME/GOALERT_PASSWORD or GOALERT_TOKEN, not both");
  }
  if (!hasPassword && !hasToken) {
    throw new ConfigError("No credentials: set GOALERT_USERNAME + GOALERT_PASSWORD, or GOALERT_TOKEN");
  }

  let auth: GoAlertAuth;
  if (hasToken) {
    auth = { mode: "token", token: token! };
  } else {
    if (!username) throw new ConfigError("GOALERT_USERNAME is required when using password auth");
    if (!password) throw new ConfigError("GOALERT_PASSWORD is required when using password auth");
    auth = { mode: "password", username, password };
  }

  return {
    baseUrl,
    auth,
    readOnly: /^(1|true|yes)$/i.test(env.GOALERT_READ_ONLY?.trim() ?? ""),
    referer: env.GOALERT_REFERER?.trim() || baseUrl,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/config.test.ts` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: config loading and validation"
```

---

### Task 3: Errors & redaction

**Files:**
- Create: `src/client/errors.ts`, `src/client/errors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "vitest";
import { GoAlertError, GoAlertAuthError, mapGraphQLErrors, redact } from "./errors.js";

describe("errors", () => {
  test("mapGraphQLErrors picks first error with code and path", () => {
    const e = mapGraphQLErrors([
      { message: "bad field", path: ["createService", "name"], extensions: { code: "INVALID_INPUT_VALUE" } },
    ]);
    expect(e).toBeInstanceOf(GoAlertError);
    expect(e.message).toContain("bad field");
    expect(e.code).toBe("INVALID_INPUT_VALUE");
    expect(e.path).toEqual(["createService", "name"]);
  });

  test("mapGraphQLErrors joins multiple messages", () => {
    const e = mapGraphQLErrors([{ message: "a" }, { message: "b" }]);
    expect(e.message).toBe("a; b");
  });

  test("redact masks secrets anywhere in text", () => {
    expect(redact("login failed for pw=hunter2 token=abc", ["hunter2", "abc"]))
      .toBe("login failed for pw=*** token=***");
  });

  test("GoAlertAuthError is a GoAlertError", () => {
    expect(new GoAlertAuthError("nope")).toBeInstanceOf(GoAlertError);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/client/errors.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/client/errors.ts`**

```ts
export class GoAlertError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly path?: (string | number)[],
    public readonly status?: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class GoAlertAuthError extends GoAlertError {}

export interface GraphQLError {
  message: string;
  path?: (string | number)[];
  extensions?: { code?: string };
}

export function mapGraphQLErrors(errors: GraphQLError[]): GoAlertError {
  const first = errors[0];
  const message = errors.map((e) => e.message).join("; ");
  return new GoAlertError(message, first?.extensions?.code, first?.path);
}

export function redact(text: string, secrets: Array<string | undefined>): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= 3) out = out.split(s).join("***");
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass** — all PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: error types and secret redaction"`

---

### Task 4: Authenticator (login + token modes)

**Files:**
- Create: `src/client/auth.ts`, `src/client/auth.test.ts`

GoAlert login: `POST {baseUrl}/api/v2/identity/providers/basic?noRedirect=1`, header `Referer`, `Content-Type: application/x-www-form-urlencoded`, body `username=<u>&password=<p>`. On 200, the body **is** the session token (trim it). Non-200 or empty body → `GoAlertAuthError`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test, vi } from "vitest";
import { createAuthenticator } from "./auth.js";
import { GoAlertAuthError } from "./errors.js";
import type { GoAlertConfig } from "../config.js";

const cfg = (over: Partial<GoAlertConfig> = {}): GoAlertConfig => ({
  baseUrl: "https://ga.example.com",
  auth: { mode: "password", username: "admin", password: "pw" },
  readOnly: false,
  referer: "https://ga.example.com",
  ...over,
});

function mockFetch(impl: (url: string, init: RequestInit) => Partial<Response> & { text: () => Promise<string> }) {
  return vi.fn(async (url: any, init: any) => impl(String(url), init) as any);
}

describe("authenticator", () => {
  test("password mode logs in and caches the token", async () => {
    const f = mockFetch(() => ({ ok: true, status: 200, text: async () => "SESSION_TOKEN\n" }));
    const auth = createAuthenticator(cfg(), f as any);
    expect(auth.canRefresh).toBe(true);
    expect(await auth.getToken()).toBe("SESSION_TOKEN");
    expect(await auth.getToken()).toBe("SESSION_TOKEN"); // cached
    expect(f).toHaveBeenCalledTimes(1);

    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://ga.example.com/api/v2/identity/providers/basic?noRedirect=1");
    expect(init.method).toBe("POST");
    expect(init.headers.Referer).toBe("https://ga.example.com");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(init.body).toBe("username=admin&password=pw");
  });

  test("invalidate forces re-login", async () => {
    const f = mockFetch(() => ({ ok: true, status: 200, text: async () => "T" }));
    const auth = createAuthenticator(cfg(), f as any);
    await auth.getToken();
    auth.invalidate();
    await auth.getToken();
    expect(f).toHaveBeenCalledTimes(2);
  });

  test("failed login throws GoAlertAuthError without leaking the password", async () => {
    const f = mockFetch(() => ({ ok: false, status: 401, text: async () => "unauthorized" }));
    const auth = createAuthenticator(cfg(), f as any);
    await expect(auth.getToken()).rejects.toBeInstanceOf(GoAlertAuthError);
    await expect(auth.getToken()).rejects.not.toThrow(/pw/);
  });

  test("token mode returns the configured token and cannot refresh", async () => {
    const f = mockFetch(() => ({ ok: true, status: 200, text: async () => "X" }));
    const auth = createAuthenticator(cfg({ auth: { mode: "token", token: "BEARER" } }), f as any);
    expect(auth.canRefresh).toBe(false);
    expect(await auth.getToken()).toBe("BEARER");
    expect(f).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement `src/client/auth.ts`**

```ts
import type { GoAlertConfig } from "../config.js";
import { GoAlertAuthError, redact } from "./errors.js";

export interface Authenticator {
  getToken(): Promise<string>;
  invalidate(): void;
  readonly canRefresh: boolean;
}

export function createAuthenticator(config: GoAlertConfig, fetchFn: typeof fetch = fetch): Authenticator {
  if (config.auth.mode === "token") {
    const token = config.auth.token;
    return { canRefresh: false, async getToken() { return token; }, invalidate() {} };
  }

  const { username, password } = config.auth;
  let cached: string | null = null;

  async function login(): Promise<string> {
    const url = `${config.baseUrl}/api/v2/identity/providers/basic?noRedirect=1`;
    const body = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    let res: Response;
    try {
      res = await fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: config.referer },
        body,
      });
    } catch (err) {
      throw new GoAlertAuthError(redact(`login request failed: ${(err as Error).message}`, [password]));
    }
    const text = (await res.text()).trim();
    if (!res.ok || !text) {
      throw new GoAlertAuthError(
        redact(`login failed (HTTP ${res.status}): ${text || "empty response"}`, [password]),
        undefined, undefined, res.status,
      );
    }
    return text;
  }

  return {
    canRefresh: true,
    async getToken() {
      if (!cached) cached = await login();
      return cached;
    },
    invalidate() { cached = null; },
  };
}
```

- [ ] **Step 4: Run to verify pass** → all PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat: GoAlert authenticator (password + token modes)"`

---

### Task 5: Serialized GraphQL executor

**Files:**
- Create: `src/client/graphql.ts`, `src/client/graphql.test.ts`

Requirements: serialize requests (one in-flight at a time), attach `Authorization: Bearer`, map GraphQL `errors`, and on `Unauthorized` re-auth+retry once (password mode only).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test, vi } from "vitest";
import { createClient } from "./graphql.js";
import { GoAlertError, GoAlertAuthError } from "./errors.js";
import type { Authenticator } from "./auth.js";
import type { GoAlertConfig } from "../config.js";

const cfg: GoAlertConfig = {
  baseUrl: "https://ga.example.com", referer: "https://ga.example.com",
  readOnly: false, auth: { mode: "password", username: "a", password: "b" },
};

function fakeAuth(over: Partial<Authenticator> = {}): Authenticator {
  return { canRefresh: true, getToken: vi.fn(async () => "TOK"), invalidate: vi.fn(), ...over };
}

function jsonRes(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) } as any;
}

describe("graphql executor", () => {
  test("posts to /api/graphql with bearer token and returns data", async () => {
    const f = vi.fn(async () => jsonRes({ data: { service: { id: "1" } } }));
    const client = createClient(cfg, fakeAuth(), f as any);
    const data = await client.execute<{ service: { id: string } }>("query{service{id}}", { id: "1" });
    expect(data.service.id).toBe("1");
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://ga.example.com/api/graphql");
    expect((init as any).headers.Authorization).toBe("Bearer TOK");
    expect(JSON.parse((init as any).body)).toEqual({ query: "query{service{id}}", variables: { id: "1" } });
  });

  test("maps GraphQL errors to GoAlertError", async () => {
    const f = vi.fn(async () => jsonRes({ errors: [{ message: "boom", extensions: { code: "INVALID_INPUT_VALUE" } }] }));
    const client = createClient(cfg, fakeAuth(), f as any);
    await expect(client.execute("query{x}")).rejects.toMatchObject({ message: "boom", code: "INVALID_INPUT_VALUE" });
  });

  test("on 401 re-auths and retries once", async () => {
    const auth = fakeAuth();
    let call = 0;
    const f = vi.fn(async () => (++call === 1 ? jsonRes("unauthorized", 401) : jsonRes({ data: { ok: true } })));
    const client = createClient(cfg, auth, f as any);
    await expect(client.execute("query{ok}")).resolves.toEqual({ ok: true });
    expect(auth.invalidate).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledTimes(2);
  });

  test("on repeated 401 throws GoAlertAuthError (no infinite retry)", async () => {
    const f = vi.fn(async () => jsonRes("unauthorized", 401));
    const client = createClient(cfg, fakeAuth(), f as any);
    await expect(client.execute("query{ok}")).rejects.toBeInstanceOf(GoAlertAuthError);
    expect(f).toHaveBeenCalledTimes(2);
  });

  test("serializes: never two requests in flight at once", async () => {
    let inFlight = 0, maxInFlight = 0;
    const f = vi.fn(async () => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return jsonRes({ data: { ok: true } });
    });
    const client = createClient(cfg, fakeAuth(), f as any);
    await Promise.all([client.execute("q"), client.execute("q"), client.execute("q")]);
    expect(maxInFlight).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement `src/client/graphql.ts` (execute + mutex; paginate added in Task 6)**

```ts
import type { GoAlertConfig } from "../config.js";
import type { Authenticator } from "./auth.js";
import { GoAlertAuthError, GoAlertError, mapGraphQLErrors, type GraphQLError } from "./errors.js";

export interface Connection<T> {
  nodes: T[];
  pageInfo: { endCursor: string; hasNextPage: boolean };
}
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface GoAlertClient {
  execute<TResult = unknown>(query: string, variables?: Record<string, unknown>): Promise<TResult>;
  paginate<TNode>(
    query: string,
    variables: Record<string, unknown>,
    extract: (data: any) => Connection<TNode>,
    max?: number,
  ): Promise<Page<TNode>>;
}

interface GraphQLResponse<T> { data?: T; errors?: GraphQLError[] }

export function createClient(config: GoAlertConfig, auth: Authenticator, fetchFn: typeof fetch = fetch): GoAlertClient {
  let chain: Promise<unknown> = Promise.resolve();

  // Serialize: each call waits for the previous to finish (respects GoAlert's
  // one-in-flight-per-auth-source lock). Failures don't break the chain.
  function serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(fn, fn);
    chain = run.then(() => undefined, () => undefined);
    return run;
  }

  async function once<T>(query: string, variables: Record<string, unknown>): Promise<{ status: number; body: GraphQLResponse<T> | string }> {
    const token = await auth.getToken();
    const res = await fetchFn(`${config.baseUrl}/api/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Referer: config.referer,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 401) return { status: 401, body: await res.text() };
    return { status: res.status, body: (await res.json()) as GraphQLResponse<T> };
  }

  async function executeImpl<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    let attempt = await once<T>(query, variables);
    if (attempt.status === 401 && auth.canRefresh) {
      auth.invalidate();
      attempt = await once<T>(query, variables);
    }
    if (attempt.status === 401) {
      throw new GoAlertAuthError("Unauthorized — check GOALERT credentials / token validity", undefined, undefined, 401);
    }
    const body = attempt.body as GraphQLResponse<T>;
    if (body.errors?.length) throw mapGraphQLErrors(body.errors);
    if (body.data === undefined) throw new GoAlertError("GraphQL response had no data");
    return body.data;
  }

  return {
    execute<T>(query: string, variables: Record<string, unknown> = {}) {
      return serialize(() => executeImpl<T>(query, variables));
    },
    async paginate<TNode>() {
      throw new GoAlertError("paginate not implemented"); // replaced in Task 6
    },
  };
}
```

- [ ] **Step 4: Run to verify pass** → all PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat: serialized GraphQL executor with re-auth retry"`

---

### Task 6: Pagination helper

**Files:**
- Modify: `src/client/graphql.ts` (replace the `paginate` stub)
- Modify: `src/client/graphql.test.ts` (add cases)

- [ ] **Step 1: Add failing tests**

```ts
test("paginate follows cursors until hasNextPage is false", async () => {
  const pages = [
    { data: { services: { nodes: [{ id: "1" }], pageInfo: { endCursor: "c1", hasNextPage: true } } } },
    { data: { services: { nodes: [{ id: "2" }], pageInfo: { endCursor: "c2", hasNextPage: false } } } },
  ];
  let i = 0;
  const f = vi.fn(async () => jsonRes(pages[i++]));
  const client = createClient(cfg, fakeAuth(), f as any);
  const page = await client.paginate<{ id: string }>(
    "query($after:String){services(input:{after:$after}){nodes{id} pageInfo{endCursor hasNextPage}}}",
    {}, (d) => d.services,
  );
  expect(page.items.map((s) => s.id)).toEqual(["1", "2"]);
  expect(page.hasMore).toBe(false);
  expect(page.nextCursor).toBe("c2");
});

test("paginate stops at max and reports hasMore", async () => {
  const f = vi.fn(async () => jsonRes({ data: { services: { nodes: [{ id: "x" }], pageInfo: { endCursor: "c", hasNextPage: true } } } }));
  const client = createClient(cfg, fakeAuth(), f as any);
  const page = await client.paginate<{ id: string }>("q", {}, (d) => d.services, 2);
  expect(page.items).toHaveLength(2);
  expect(page.hasMore).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure** → FAIL (paginate stub throws).

- [ ] **Step 3: Replace the `paginate` method body**

```ts
async paginate<TNode>(
  query: string,
  variables: Record<string, unknown>,
  extract: (data: any) => Connection<TNode>,
  max = 200,
): Promise<Page<TNode>> {
  const items: TNode[] = [];
  let after: string | null = (variables.after as string | undefined) ?? null;
  let lastCursor: string | null = after;
  let hasNextPage = true;
  while (hasNextPage && items.length < max) {
    const data = await this.execute<any>(query, { ...variables, after });
    const conn = extract(data);
    items.push(...conn.nodes);
    lastCursor = conn.pageInfo.endCursor || lastCursor;
    after = conn.pageInfo.endCursor;
    hasNextPage = conn.pageInfo.hasNextPage;
  }
  return { items: items.slice(0, max), nextCursor: lastCursor, hasMore: hasNextPage || items.length > max };
}
```

> Note: `this.execute` works because the returned object's methods reference each other; if the executor is built as closures rather than an object literal with `this`, expose `execute` in scope and call it directly. Keep `execute` and `paginate` on the same returned object.

- [ ] **Step 4: Run to verify pass** → all PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat: cursor pagination helper"`

---

### Task 7: Output formatting

**Files:**
- Create: `src/format.ts`, `src/format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "vitest";
import { ok, listResult } from "./format.js";

describe("format", () => {
  test("ok returns text summary + json and structuredContent", () => {
    const r = ok("Found service", { id: "1", name: "API" });
    expect(r.content[0].type).toBe("text");
    expect(r.content[0].text).toContain("Found service");
    expect(r.content[0].text).toContain('"name": "API"');
    expect(r.structuredContent).toEqual({ id: "1", name: "API" });
    expect(r.isError).toBeUndefined();
  });

  test("listResult summarizes counts and pagination", () => {
    const r = listResult("Services", { items: [{ id: "1" }], nextCursor: "c", hasMore: true });
    expect(r.content[0].text).toContain("1 item");
    expect(r.content[0].text).toContain("more available");
    expect(r.structuredContent).toMatchObject({ count: 1, hasMore: true, nextCursor: "c" });
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement `src/format.ts`**

```ts
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Page } from "./client/graphql.js";

export function ok(summary: string, data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: `${summary}\n\n${JSON.stringify(data, null, 2)}` }],
    structuredContent: data as Record<string, unknown>,
  };
}

export function listResult<T>(summary: string, page: Page<T>): CallToolResult {
  const more = page.hasMore ? ` (more available — pass after: "${page.nextCursor}")` : "";
  const text = `${summary}: ${page.items.length} item${page.items.length === 1 ? "" : "s"}${more}\n\n${JSON.stringify(page.items, null, 2)}`;
  return {
    content: [{ type: "text", text }],
    structuredContent: { count: page.items.length, hasMore: page.hasMore, nextCursor: page.nextCursor, items: page.items },
  };
}
```

- [ ] **Step 4: Run to verify pass** → all PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat: tool output formatting helpers"`

---

### Task 8: Tool registry + read-only guard

**Files:**
- Create: `src/tools/types.ts`, `src/tools/registry.ts`, `src/tools/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test, vi } from "vitest";
import { registerTools } from "./registry.js";
import type { ToolDef } from "./types.js";
import { z } from "zod";

function fakeServer() {
  const registered: any[] = [];
  return {
    registered,
    registerTool: vi.fn((name: string, def: any, handler: any) => registered.push({ name, def, handler })),
  };
}

const defs: ToolDef[] = [
  { name: "read_thing", description: "r", inputSchema: {}, mutating: false, handler: async () => ({ content: [] }) },
  { name: "write_thing", description: "w", inputSchema: { id: z.string() }, mutating: true, destructive: true, handler: async () => ({ content: [] }) },
];

describe("registerTools", () => {
  test("registers all tools with annotations when not read-only", () => {
    const s = fakeServer();
    registerTools(s as any, {} as any, { readOnly: false } as any, defs);
    expect(s.registered).toHaveLength(2);
    expect(s.registered[0].def.annotations.readOnlyHint).toBe(true);
    expect(s.registered[1].def.annotations.destructiveHint).toBe(true);
  });

  test("omits mutating tools when read-only", () => {
    const s = fakeServer();
    registerTools(s as any, {} as any, { readOnly: true } as any, defs);
    expect(s.registered.map((r) => r.name)).toEqual(["read_thing"]);
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement `src/tools/types.ts`**

```ts
import type { ZodRawShape } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { GoAlertClient } from "../client/graphql.js";

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  mutating: boolean;
  destructive?: boolean;
  handler: (client: GoAlertClient, args: any) => Promise<CallToolResult>;
}
```

- [ ] **Step 4: Implement `src/tools/registry.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GoAlertConfig } from "../config.js";
import type { GoAlertClient } from "../client/graphql.js";
import { GoAlertError } from "../client/errors.js";
import type { ToolDef } from "./types.js";

export function registerTools(server: McpServer, client: GoAlertClient, config: GoAlertConfig, defs: ToolDef[]): void {
  for (const def of defs) {
    if (def.mutating && config.readOnly) continue;
    server.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: def.inputSchema,
        annotations: { readOnlyHint: !def.mutating, destructiveHint: Boolean(def.destructive) },
      },
      async (args: unknown) => {
        try {
          return await def.handler(client, args);
        } catch (err) {
          const e = err as GoAlertError;
          const detail = [e.message, e.code && `code=${e.code}`, e.path && `path=${e.path.join(".")}`]
            .filter(Boolean).join(" | ");
          return { isError: true, content: [{ type: "text", text: `GoAlert error: ${detail}` }] };
        }
      },
    );
  }
}
```

- [ ] **Step 5: Run to verify pass** → all PASS. Commit — `git commit -am "feat: tool registry with read-only guard and error wrapping"`

---

### Task 9: Server bootstrap

**Files:**
- Modify: `src/index.ts`
- Create: `src/server.ts`, `src/server.test.ts`

- [ ] **Step 1: Write the failing test (tool collection assembles & respects read-only)**

```ts
import { describe, expect, test } from "vitest";
import { allToolDefs } from "./server.js";

describe("allToolDefs", () => {
  test("returns a non-empty list with unique names", () => {
    const defs = allToolDefs();
    expect(defs.length).toBeGreaterThan(0);
    const names = defs.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("includes the read-only raw query tool", () => {
    expect(allToolDefs().some((d) => d.name === "goalert_graphql_query")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement `src/server.ts`** (imports grow as tool modules are added in later tasks)

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createAuthenticator } from "./client/auth.js";
import { createClient } from "./client/graphql.js";
import { registerTools } from "./tools/registry.js";
import type { ToolDef } from "./tools/types.js";
import { commonTools } from "./tools/common.js";
import { alertTools } from "./tools/alerts.js";
import { onCallTools } from "./tools/oncall.js";

export function allToolDefs(): ToolDef[] {
  return [...commonTools, ...alertTools, ...onCallTools];
}

export async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const auth = createAuthenticator(config);
  const client = createClient(config, auth);

  const server = new McpServer({ name: "goalert-mcp", version: "0.1.0" });
  registerTools(server, client, config, allToolDefs());

  await server.connect(new StdioServerTransport());
}
```

- [ ] **Step 4: Implement `src/index.ts`**

```ts
#!/usr/bin/env node
import { main } from "./server.js";

export const VERSION = "0.1.0";

main().catch((err) => {
  console.error(`[goalert-mcp] fatal: ${(err as Error).message}`);
  process.exit(1);
});
```

> The `src/smoke.test.ts` from Task 1 still imports `VERSION` — keep it exported.
> `allToolDefs` references `commonTools`, `alertTools`, `onCallTools` — created in Tasks 10–12. Create empty `export const X: ToolDef[] = []` stubs in those files first so the build compiles, then fill them.

- [ ] **Step 5: Create stub tool modules so the project compiles**

```ts
// src/tools/common.ts
import type { ToolDef } from "./types.js";
export const commonTools: ToolDef[] = [];
```
```ts
// src/tools/alerts.ts
import type { ToolDef } from "./types.js";
export const alertTools: ToolDef[] = [];
```
```ts
// src/tools/oncall.ts
import type { ToolDef } from "./types.js";
export const onCallTools: ToolDef[] = [];
```

- [ ] **Step 6: Run** — `npx vitest run src/server.test.ts` (will fail "non-empty" until tools exist) and `npm run typecheck` (must pass). Temporarily relax the "non-empty" assertion to `>= 0` if executing strictly TDD, then restore it after Task 10.

- [ ] **Step 7: Commit** — `git commit -am "feat: MCP server bootstrap (stdio)"`

---

### Task 10: `goalert_graphql_query` (read-only escape hatch)

**Files:**
- Create: `src/graphql/operations.ts` (operation string constants — start file)
- Modify: `src/tools/common.ts`, add `src/tools/common.test.ts`

GoAlert query documents must contain no mutation/subscription. Reject by scanning the parsed-ish document: reject if a top-level `mutation`/`subscription` keyword appears. Use a conservative regex check on the leading token plus a block scan.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test, vi } from "vitest";
import { commonTools } from "./common.js";

const tool = (name: string) => commonTools.find((t) => t.name === name)!;
const client = (execute: any) => ({ execute, paginate: vi.fn() }) as any;

describe("goalert_graphql_query", () => {
  test("runs a query and returns data", async () => {
    const execute = vi.fn(async () => ({ services: { nodes: [] } }));
    const r = await tool("goalert_graphql_query").handler(client(execute), { query: "query { services { nodes { id } } }" });
    expect(execute).toHaveBeenCalled();
    expect(r.structuredContent).toEqual({ services: { nodes: [] } });
  });

  test("rejects mutations", async () => {
    const execute = vi.fn();
    await expect(tool("goalert_graphql_query").handler(client(execute), { query: "mutation { createService(input:{name:\"x\"}) { id } }" }))
      .rejects.toThrow(/read-only/i);
    expect(execute).not.toHaveBeenCalled();
  });

  test("rejects subscriptions", async () => {
    await expect(tool("goalert_graphql_query").handler(client(vi.fn()), { query: "subscription { x }" }))
      .rejects.toThrow(/read-only/i);
  });

  test("is marked non-mutating", () => {
    expect(tool("goalert_graphql_query").mutating).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement (replace `src/tools/common.ts` contents for this tool)**

```ts
import { z } from "zod";
import type { ToolDef } from "./types.js";
import { ok } from "../format.js";
import { GoAlertError } from "../client/errors.js";

function assertReadOnly(query: string): void {
  // Strip comments, then ensure no top-level mutation/subscription operation.
  const stripped = query.replace(/#[^\n]*/g, "");
  if (/(^|\}|\s)\b(mutation|subscription)\b\s*[\w({]/.test(stripped) || /^\s*(mutation|subscription)\b/.test(stripped)) {
    throw new GoAlertError("goalert_graphql_query is read-only: mutations and subscriptions are not allowed. Use a dedicated write tool.");
  }
}

const graphqlQuery: ToolDef = {
  name: "goalert_graphql_query",
  description:
    "Run an arbitrary read-only GraphQL query against GoAlert's /api/graphql. Use this for reads not covered by a dedicated tool. Mutations/subscriptions are rejected. Pass `query` and optional `variables`.",
  inputSchema: {
    query: z.string().describe("A GraphQL query document (no mutations)."),
    variables: z.record(z.unknown()).optional().describe("Variables for the query."),
  },
  mutating: false,
  handler: async (client, args: { query: string; variables?: Record<string, unknown> }) => {
    assertReadOnly(args.query);
    const data = await client.execute(args.query, args.variables ?? {});
    return ok("GraphQL query result", data);
  },
};

export const commonTools: ToolDef[] = [graphqlQuery];
```

- [ ] **Step 4: Run to verify pass** → all PASS. Restore the Task 9 `server.test.ts` "non-empty" assertion to `>` and confirm it passes.

- [ ] **Step 5: Commit** — `git commit -am "feat: read-only raw GraphQL query tool"`

---

### Task 11: Alerts read — `list_alerts`, `get_alert`

**Files:**
- Modify: `src/graphql/operations.ts`, `src/tools/alerts.ts`, add `src/tools/alerts.test.ts`

Operations (add to `src/graphql/operations.ts`):

```ts
export const LIST_ALERTS = /* GraphQL */ `
query ListAlerts($input: AlertSearchOptions) {
  alerts(input: $input) {
    nodes { id alertID status summary serviceID service { id name } createdAt }
    pageInfo { endCursor hasNextPage }
  }
}`;

export const GET_ALERT = /* GraphQL */ `
query GetAlert($id: Int!) {
  alert(id: $id) {
    id alertID status summary details dedup createdAt
    service { id name }
    state { lastEscalation stepNumber repeatCount }
    recentEvents(input: { limit: 20 }) {
      nodes { timestamp message state { details status } }
    }
  }
}`;
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test, vi } from "vitest";
import { alertTools } from "./alerts.js";

const tool = (n: string) => alertTools.find((t) => t.name === n)!;

describe("list_alerts", () => {
  test("builds AlertSearchOptions and paginates", async () => {
    const paginate = vi.fn(async () => ({ items: [{ alertID: 5 }], nextCursor: null, hasMore: false }));
    const client = { execute: vi.fn(), paginate } as any;
    const r = await tool("list_alerts").handler(client, { serviceIDs: ["s1"], status: ["unacked"], first: 10 });
    const [, vars] = paginate.mock.calls[0];
    expect(vars.input.filterByServiceID).toEqual(["s1"]);
    expect(vars.input.filterByStatus).toEqual(["StatusUnacknowledged"]);
    expect(vars.input.first).toBe(10);
    expect(r.structuredContent).toMatchObject({ count: 1 });
  });
});

describe("get_alert", () => {
  test("fetches a single alert by numeric id", async () => {
    const execute = vi.fn(async () => ({ alert: { alertID: 7, status: "StatusClosed" } }));
    const r = await tool("get_alert").handler({ execute, paginate: vi.fn() } as any, { alertID: 7 });
    expect(execute.mock.calls[0][1]).toEqual({ id: 7 });
    expect(r.structuredContent).toMatchObject({ alertID: 7 });
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement `src/tools/alerts.ts`** (read tools; write tools appended in Task 15)

```ts
import { z } from "zod";
import type { ToolDef } from "./types.js";
import { ok, listResult } from "../format.js";
import { LIST_ALERTS, GET_ALERT } from "../graphql/operations.js";

const STATUS_MAP = {
  unacked: "StatusUnacknowledged",
  acked: "StatusAcknowledged",
  closed: "StatusClosed",
} as const;

const listAlerts: ToolDef = {
  name: "list_alerts",
  description:
    "List alerts, optionally filtered by service IDs, status (unacked/acked/closed), and free-text search. Cursor-paginated.",
  inputSchema: {
    serviceIDs: z.array(z.string()).optional().describe("Restrict to these service IDs."),
    status: z.array(z.enum(["unacked", "acked", "closed"])).optional(),
    search: z.string().optional(),
    first: z.number().int().min(1).max(100).optional().describe("Page size (default 25)."),
    after: z.string().optional().describe("Pagination cursor from a previous call."),
    all: z.boolean().optional().describe("Auto-paginate up to 200 results."),
  },
  mutating: false,
  handler: async (client, args) => {
    const input: Record<string, unknown> = {
      first: args.first ?? 25,
      after: args.after,
    };
    if (args.serviceIDs) input.filterByServiceID = args.serviceIDs;
    if (args.status) input.filterByStatus = args.status.map((s: keyof typeof STATUS_MAP) => STATUS_MAP[s]);
    if (args.search) input.search = args.search;
    const max = args.all ? 200 : (args.first ?? 25);
    const page = await client.paginate(LIST_ALERTS, { input }, (d: any) => d.alerts, max);
    return listResult("Alerts", page);
  },
};

const getAlert: ToolDef = {
  name: "get_alert",
  description: "Get full detail for one alert by its numeric alertID, including state and recent log events.",
  inputSchema: { alertID: z.number().int().describe("The numeric alert ID.") },
  mutating: false,
  handler: async (client, args) => {
    const data = await client.execute<{ alert: unknown }>(GET_ALERT, { id: args.alertID });
    return ok("Alert", data.alert);
  },
};

export const alertTools: ToolDef[] = [listAlerts, getAlert];
```

- [ ] **Step 4: Run to verify pass** → all PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat: list_alerts and get_alert tools"`

---

### Task 12: On-call — `get_on_call`

**Files:**
- Modify: `src/graphql/operations.ts`, `src/tools/oncall.ts`, add `src/tools/oncall.test.ts`

Operations:

```ts
export const ONCALL_BY_SERVICE = /* GraphQL */ `
query OnCallByService($id: ID!) {
  service(id: $id) { id name onCallUsers { userID userName stepNumber } }
}`;

export const ONCALL_BY_SCHEDULE = /* GraphQL */ `
query OnCallBySchedule($id: ID!, $start: ISOTimestamp!, $end: ISOTimestamp!) {
  schedule(id: $id) {
    id name timeZone
    shifts(start: $start, end: $end) { userID user { id name } start end truncated }
  }
}`;

export const ONCALL_BY_USER = /* GraphQL */ `
query OnCallByUser($id: ID!) {
  user(id: $id) {
    id name
    onCallOverview { serviceCount serviceAssignments { serviceID serviceName escalationPolicyName stepNumber } }
  }
}`;
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test, vi } from "vitest";
import { onCallTools } from "./oncall.js";

const handler = onCallTools[0].handler;
const client = (execute: any) => ({ execute, paginate: vi.fn() }) as any;

describe("get_on_call", () => {
  test("service mode", async () => {
    const execute = vi.fn(async () => ({ service: { onCallUsers: [{ userName: "Ann" }] } }));
    const r = await handler(client(execute), { serviceID: "s1" });
    expect(execute.mock.calls[0][1]).toEqual({ id: "s1" });
    expect(r.content[0].text).toContain("Ann");
  });

  test("schedule mode requires window and passes it", async () => {
    const execute = vi.fn(async () => ({ schedule: { shifts: [] } }));
    await handler(client(execute), { scheduleID: "sch1", start: "2026-06-03T00:00:00Z", end: "2026-06-04T00:00:00Z" });
    expect(execute.mock.calls[0][1]).toMatchObject({ id: "sch1", start: "2026-06-03T00:00:00Z" });
  });

  test("requires exactly one target", async () => {
    await expect(handler(client(vi.fn()), {})).rejects.toThrow(/one of/i);
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement `src/tools/oncall.ts`**

```ts
import { z } from "zod";
import type { ToolDef } from "./types.js";
import { ok } from "../format.js";
import { GoAlertError } from "../client/errors.js";
import { ONCALL_BY_SERVICE, ONCALL_BY_SCHEDULE, ONCALL_BY_USER } from "../graphql/operations.js";

const getOnCall: ToolDef = {
  name: "get_on_call",
  description:
    "Report who is on call. Provide exactly one of: serviceID (current on-call users), scheduleID (+ start/end window for shifts), or userID (their on-call overview).",
  inputSchema: {
    serviceID: z.string().optional(),
    scheduleID: z.string().optional(),
    userID: z.string().optional(),
    start: z.string().optional().describe("RFC3339 start (required with scheduleID)."),
    end: z.string().optional().describe("RFC3339 end (required with scheduleID)."),
  },
  mutating: false,
  handler: async (client, args) => {
    const targets = [args.serviceID, args.scheduleID, args.userID].filter(Boolean);
    if (targets.length !== 1) throw new GoAlertError("Provide exactly one of: serviceID, scheduleID, userID");
    if (args.serviceID) {
      const d = await client.execute<{ service: unknown }>(ONCALL_BY_SERVICE, { id: args.serviceID });
      return ok("On call (service)", d.service);
    }
    if (args.scheduleID) {
      if (!args.start || !args.end) throw new GoAlertError("scheduleID requires start and end (RFC3339)");
      const d = await client.execute<{ schedule: unknown }>(ONCALL_BY_SCHEDULE, { id: args.scheduleID, start: args.start, end: args.end });
      return ok("On call (schedule)", d.schedule);
    }
    const d = await client.execute<{ user: unknown }>(ONCALL_BY_USER, { id: args.userID });
    return ok("On call (user overview)", d.user);
  },
};

export const onCallTools: ToolDef[] = [getOnCall];
```

- [ ] **Step 4: Run to verify pass** → all PASS.

- [ ] **Step 5: Commit + Phase 1 checkpoint**

```bash
git commit -am "feat: get_on_call tool"
npm run typecheck && npm run test
```
**Milestone:** a working read-only MCP. Optional manual smoke: configure against the live instance and call `list_alerts`.

---

## Phase 2 — Cross-cutting writes + alert writes

### Task 13: `goalert_delete` (generic delete)

**Files:** modify `src/graphql/operations.ts`, `src/tools/common.ts`, `src/tools/common.test.ts`

Operation:
```ts
export const DELETE_ALL = /* GraphQL */ `mutation DeleteAll($input: [TargetInput!]) { deleteAll(input: $input) }`;
```

Valid `type` values (GoAlert `TargetType`): `service`, `schedule`, `rotation`, `escalationPolicy`, `escalationPolicyStep`, `integrationKey`, `heartbeatMonitor`, `userOverride`, `user`, `contactMethod`, `notificationRule`, `calendarSubscription`, `userSession`, `rotationParticipant`.

- [ ] **Step 1: Add failing tests** (append to `common.test.ts`)

```ts
import { vi } from "vitest";
test("goalert_delete requires confirm:true", async () => {
  const tool = commonTools.find((t) => t.name === "goalert_delete")!;
  await expect(tool.handler({ execute: vi.fn() } as any, { type: "service", ids: ["1"] }))
    .rejects.toThrow(/confirm/i);
});
test("goalert_delete sends TargetInput pairs", async () => {
  const execute = vi.fn(async () => ({ deleteAll: true }));
  const tool = commonTools.find((t) => t.name === "goalert_delete")!;
  await tool.handler({ execute } as any, { type: "service", ids: ["1", "2"], confirm: true });
  expect(execute.mock.calls[0][1]).toEqual({ input: [{ type: "service", id: "1" }, { type: "service", id: "2" }] });
});
test("goalert_delete is destructive+mutating", () => {
  const tool = commonTools.find((t) => t.name === "goalert_delete")!;
  expect(tool.mutating).toBe(true);
  expect(tool.destructive).toBe(true);
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** — append to `commonTools` in `src/tools/common.ts`:

```ts
const TARGET_TYPES = ["service","schedule","rotation","escalationPolicy","escalationPolicyStep","integrationKey","heartbeatMonitor","userOverride","user","contactMethod","notificationRule","calendarSubscription","userSession","rotationParticipant"] as const;

const deleteResource: ToolDef = {
  name: "goalert_delete",
  description:
    "Delete one or more GoAlert resources of a single type by ID (uses deleteAll). Covers services, schedules, rotations, escalation policies (and steps), integration keys, heartbeat monitors, user overrides, etc. Requires confirm:true.",
  inputSchema: {
    type: z.enum(TARGET_TYPES).describe("The resource type to delete."),
    ids: z.array(z.string()).min(1).describe("IDs of resources of that type."),
    confirm: z.literal(true).describe("Must be true to actually delete."),
  },
  mutating: true,
  destructive: true,
  handler: async (client, args) => {
    if (args.confirm !== true) throw new GoAlertError("Refusing to delete without confirm:true");
    const input = args.ids.map((id: string) => ({ type: args.type, id }));
    await client.execute(DELETE_ALL, { input });
    return ok(`Deleted ${args.ids.length} ${args.type}(s)`, { type: args.type, ids: args.ids });
  },
};
```
Add `deleteResource` to the exported `commonTools` array and import `DELETE_ALL`, `z` already imported.

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git commit -am "feat: generic goalert_delete tool"`

---

### Task 14: `goalert_set_favorite`, `goalert_set_label`

**Files:** modify `src/graphql/operations.ts`, `src/tools/common.ts`, `src/tools/common.test.ts`

Operations:
```ts
export const SET_FAVORITE = /* GraphQL */ `mutation SetFavorite($input: SetFavoriteInput!) { setFavorite(input: $input) }`;
export const SET_LABEL = /* GraphQL */ `mutation SetLabel($input: SetLabelInput!) { setLabel(input: $input) }`;
```
`SetFavoriteInput { target: TargetInput!, favorite: Boolean! }`. `SetLabelInput { target: TargetInput!, key: String!, value: String! }` (empty `value` deletes the label).

- [ ] **Step 1: Failing tests** — assert `set_favorite` builds `{ target: { type, id }, favorite }`, and `set_label` with empty value still sends (delete semantics). Both `mutating:true`, not destructive.

```ts
test("set_favorite builds input", async () => {
  const execute = vi.fn(async () => ({ setFavorite: true }));
  const tool = commonTools.find((t) => t.name === "goalert_set_favorite")!;
  await tool.handler({ execute } as any, { type: "service", id: "1", favorite: true });
  expect(execute.mock.calls[0][1]).toEqual({ input: { target: { type: "service", id: "1" }, favorite: true } });
});
test("set_label builds input (empty value = delete)", async () => {
  const execute = vi.fn(async () => ({ setLabel: true }));
  const tool = commonTools.find((t) => t.name === "goalert_set_label")!;
  await tool.handler({ execute } as any, { type: "service", id: "1", key: "team", value: "" });
  expect(execute.mock.calls[0][1]).toEqual({ input: { target: { type: "service", id: "1" }, key: "team", value: "" } });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (append to `commonTools`):

```ts
const FAVORITABLE = ["service", "schedule", "rotation", "user"] as const;

const setFavorite: ToolDef = {
  name: "goalert_set_favorite",
  description: "Mark a service, schedule, rotation, or user as favorite (or unfavorite).",
  inputSchema: {
    type: z.enum(FAVORITABLE),
    id: z.string(),
    favorite: z.boolean(),
  },
  mutating: true,
  handler: async (client, args) => {
    await client.execute(SET_FAVORITE, { input: { target: { type: args.type, id: args.id }, favorite: args.favorite } });
    return ok(`${args.favorite ? "Favorited" : "Unfavorited"} ${args.type} ${args.id}`, { type: args.type, id: args.id, favorite: args.favorite });
  },
};

const setLabel: ToolDef = {
  name: "goalert_set_label",
  description: "Set or remove a key/value label on a target (usually a service). An empty value deletes the label.",
  inputSchema: {
    type: z.enum(["service"]).describe("Currently only service labels are supported."),
    id: z.string(),
    key: z.string(),
    value: z.string().describe("Label value; empty string deletes the label."),
  },
  mutating: true,
  handler: async (client, args) => {
    await client.execute(SET_LABEL, { input: { target: { type: args.type, id: args.id }, key: args.key, value: args.value } });
    return ok(`Set label ${args.key} on ${args.type} ${args.id}`, { key: args.key, value: args.value });
  },
};
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git commit -am "feat: set_favorite and set_label tools"`

---

### Task 15: Alert writes — `create_alert`, `manage_alerts`

**Files:** modify `src/graphql/operations.ts`, `src/tools/alerts.ts`, `src/tools/alerts.test.ts`

Operations:
```ts
export const CREATE_ALERT = /* GraphQL */ `
mutation CreateAlert($input: CreateAlertInput!) { createAlert(input: $input) { id alertID status summary } }`;
export const UPDATE_ALERTS = /* GraphQL */ `
mutation UpdateAlerts($input: UpdateAlertsInput!) { updateAlerts(input: $input) { id alertID status } }`;
export const ESCALATE_ALERTS = /* GraphQL */ `mutation Escalate($ids: [Int!]) { escalateAlerts(input: $ids) { id alertID status } }`;
export const CLOSE_BY_SERVICE = /* GraphQL */ `
mutation CloseByService($input: UpdateAlertsByServiceInput!) { updateAlertsByService(input: $input) }`;
```
`CreateAlertInput { summary: String!, details: String, serviceID: ID!, dedup: String, sanitize: Boolean, meta: [AlertMetadataInput!] }`, `AlertMetadataInput { key: String!, value: String! }`. `UpdateAlertsInput { alertIDs: [Int!]!, newStatus: AlertStatus }` where AlertStatus ∈ `StatusUnacknowledged|StatusAcknowledged|StatusClosed`. `UpdateAlertsByServiceInput { serviceID: ID!, newStatus: AlertStatus! }`.

- [ ] **Step 1: Failing tests**

```ts
test("create_alert builds input incl meta", async () => {
  const execute = vi.fn(async () => ({ createAlert: { alertID: 9 } }));
  const r = await tool("create_alert").handler({ execute, paginate: vi.fn() } as any,
    { serviceID: "s1", summary: "Disk full", details: "x", dedup: "d", meta: { host: "db1" } });
  expect(execute.mock.calls[0][1].input).toMatchObject({ serviceID: "s1", summary: "Disk full", meta: [{ key: "host", value: "db1" }] });
});
test("manage_alerts ack by ids", async () => {
  const execute = vi.fn(async () => ({ updateAlerts: [] }));
  await tool("manage_alerts").handler({ execute, paginate: vi.fn() } as any, { action: "ack", alertIDs: [1, 2] });
  expect(execute.mock.calls[0][1]).toEqual({ input: { alertIDs: [1, 2], newStatus: "StatusAcknowledged" } });
});
test("manage_alerts escalate uses escalateAlerts", async () => {
  const execute = vi.fn(async () => ({ escalateAlerts: [] }));
  await tool("manage_alerts").handler({ execute, paginate: vi.fn() } as any, { action: "escalate", alertIDs: [3] });
  expect(execute.mock.calls[0][1]).toEqual({ ids: [3] });
});
test("manage_alerts close-all-for-service", async () => {
  const execute = vi.fn(async () => ({ updateAlertsByService: true }));
  await tool("manage_alerts").handler({ execute, paginate: vi.fn() } as any, { action: "close", serviceID: "s1" });
  expect(execute.mock.calls[0][1]).toEqual({ input: { serviceID: "s1", newStatus: "StatusClosed" } });
});
test("manage_alerts requires alertIDs or serviceID", async () => {
  await expect(tool("manage_alerts").handler({ execute: vi.fn(), paginate: vi.fn() } as any, { action: "ack" }))
    .rejects.toThrow(/alertIDs or serviceID/i);
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (append to `alertTools`):

```ts
import { CREATE_ALERT, UPDATE_ALERTS, ESCALATE_ALERTS, CLOSE_BY_SERVICE } from "../graphql/operations.js";
import { GoAlertError } from "../client/errors.js";

const ACTION_STATUS = { ack: "StatusAcknowledged", close: "StatusClosed", unack: "StatusUnacknowledged" } as const;

const createAlert: ToolDef = {
  name: "create_alert",
  description: "Create an alert on a service. Use dedup to coalesce repeated alerts; meta is an arbitrary key/value map.",
  inputSchema: {
    serviceID: z.string(),
    summary: z.string().describe("Short alert title."),
    details: z.string().optional(),
    dedup: z.string().optional().describe("Dedup key; repeated creates with the same key won't duplicate."),
    meta: z.record(z.string()).optional().describe("Arbitrary metadata key/value pairs."),
  },
  mutating: true,
  handler: async (client, args) => {
    const input: Record<string, unknown> = { serviceID: args.serviceID, summary: args.summary };
    if (args.details) input.details = args.details;
    if (args.dedup) input.dedup = args.dedup;
    if (args.meta) input.meta = Object.entries(args.meta).map(([key, value]) => ({ key, value }));
    const d = await client.execute<{ createAlert: unknown }>(CREATE_ALERT, { input });
    return ok("Alert created", d.createAlert);
  },
};

const manageAlerts: ToolDef = {
  name: "manage_alerts",
  description:
    "Acknowledge, close, unacknowledge, or escalate alerts. Target either specific alertIDs (numeric) or all alerts on a serviceID (close/ack only, not escalate).",
  inputSchema: {
    action: z.enum(["ack", "close", "unack", "escalate"]),
    alertIDs: z.array(z.number().int()).optional(),
    serviceID: z.string().optional().describe("Apply the action to all alerts on this service (not valid with escalate)."),
  },
  mutating: true,
  handler: async (client, args) => {
    if (!args.alertIDs?.length && !args.serviceID) throw new GoAlertError("Provide alertIDs or serviceID");
    if (args.action === "escalate") {
      if (!args.alertIDs?.length) throw new GoAlertError("escalate requires alertIDs");
      const d = await client.execute<{ escalateAlerts: unknown }>(ESCALATE_ALERTS, { ids: args.alertIDs });
      return ok("Alerts escalated", d.escalateAlerts);
    }
    const newStatus = ACTION_STATUS[args.action];
    if (args.serviceID && !args.alertIDs?.length) {
      await client.execute(CLOSE_BY_SERVICE, { input: { serviceID: args.serviceID, newStatus } });
      return ok(`All alerts on service ${args.serviceID} → ${newStatus}`, { serviceID: args.serviceID, newStatus });
    }
    const d = await client.execute<{ updateAlerts: unknown }>(UPDATE_ALERTS, { input: { alertIDs: args.alertIDs, newStatus } });
    return ok(`Alerts → ${newStatus}`, d.updateAlerts);
  },
};
```
Append `createAlert, manageAlerts` to `alertTools`.

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git commit -am "feat: create_alert and manage_alerts tools"`

---

## Phase 3 — Services & escalation policies

> Pattern is now established. Each task: add operation(s) to `src/graphql/operations.ts`, add the `ToolDef`(s) to the module, write a test that asserts the variables sent + output mapping, run, commit. Register new modules in `src/server.ts` `allToolDefs()` and import them.

### Task 16: Services read — `list_services`, `get_service`

**Files:** `src/graphql/operations.ts`, create `src/tools/services.ts` + `src/tools/services.test.ts`, modify `src/server.ts`.

Operations:
```ts
export const LIST_SERVICES = /* GraphQL */ `
query ListServices($input: ServiceSearchOptions) {
  services(input: $input) {
    nodes { id name description escalationPolicyID isFavorite }
    pageInfo { endCursor hasNextPage }
  }
}`;
export const GET_SERVICE = /* GraphQL */ `
query GetService($id: ID!) {
  service(id: $id) {
    id name description isFavorite maintenanceExpiresAt
    escalationPolicy { id name }
    onCallUsers { userID userName stepNumber }
    labels { key value }
    integrationKeys { id name type href }
    heartbeatMonitors { id name timeoutMinutes lastState href }
  }
}`;
```
`ServiceSearchOptions { search, first, after, favoritesOnly, favoritesFirst, omit, only }`.

- [ ] **Step 1: Test** — `list_services` passes `{ input: { first, after, search?, favoritesFirst? } }` to `paginate` (extractor `d.services`); `get_service` passes `{ id }` to `execute` and returns `data.service`. Both `mutating:false`.
- [ ] **Step 2: Run → FAIL. Step 3: Implement** `serviceTools = [listServices, getService]`:

```ts
import { z } from "zod";
import type { ToolDef } from "./types.js";
import { ok, listResult } from "../format.js";
import { LIST_SERVICES, GET_SERVICE } from "../graphql/operations.js";

const listServices: ToolDef = {
  name: "list_services",
  description: "List services (search, favorites-first, cursor pagination).",
  inputSchema: {
    search: z.string().optional(),
    first: z.number().int().min(1).max(100).optional(),
    after: z.string().optional(),
    favoritesFirst: z.boolean().optional(),
    all: z.boolean().optional(),
  },
  mutating: false,
  handler: async (client, args) => {
    const input: Record<string, unknown> = { first: args.first ?? 25, after: args.after };
    if (args.search) input.search = args.search;
    if (args.favoritesFirst) input.favoritesFirst = true;
    const page = await client.paginate(LIST_SERVICES, { input }, (d: any) => d.services, args.all ? 200 : (args.first ?? 25));
    return listResult("Services", page);
  },
};

const getService: ToolDef = {
  name: "get_service",
  description: "Get one service with its escalation policy, on-call users, labels, integration keys, and heartbeat monitors.",
  inputSchema: { id: z.string() },
  mutating: false,
  handler: async (client, args) => {
    const d = await client.execute<{ service: unknown }>(GET_SERVICE, { id: args.id });
    return ok("Service", d.service);
  },
};

export const serviceTools: ToolDef[] = [listServices, getService];
```
Wire into `server.ts`: `import { serviceTools } from "./tools/services.js";` and add to `allToolDefs()`.

- [ ] **Step 4: Run → PASS. Step 5: Commit** — `git commit -am "feat: list_services and get_service tools"`

---

### Task 17: Services write — `create_service`, `update_service`

**Files:** `src/graphql/operations.ts`, `src/tools/services.ts`, `src/tools/services.test.ts`.

Operations:
```ts
export const CREATE_SERVICE = /* GraphQL */ `
mutation CreateService($input: CreateServiceInput!) { createService(input: $input) { id name } }`;
export const UPDATE_SERVICE = /* GraphQL */ `
mutation UpdateService($input: UpdateServiceInput!) { updateService(input: $input) }`;
```
`CreateServiceInput { name: String!, description: String, escalationPolicyID: ID, favorite: Boolean, labels: [SetLabelInput!], newIntegrationKeys: [CreateIntegrationKeyInput!] }`. `UpdateServiceInput { id: ID!, name, description, escalationPolicyID, maintenanceExpiresAt: ISOTimestamp }`.

- [ ] **Step 1: Tests** — `create_service` sends `{ input: { name, escalationPolicyID? } }` and returns `createService`; `update_service` sends `{ input: { id, ... } }`. Both `mutating:true`. Maintenance window: `update_service` with `maintenanceMinutes` computes `maintenanceExpiresAt`? Keep it explicit: accept `maintenanceExpiresAt` (RFC3339) directly to avoid time math; document that omitting clears nothing.

```ts
test("create_service", async () => {
  const execute = vi.fn(async () => ({ createService: { id: "s9" } }));
  await tool("create_service").handler({ execute, paginate: vi.fn() } as any, { name: "Payments", escalationPolicyID: "ep1" });
  expect(execute.mock.calls[0][1].input).toEqual({ name: "Payments", escalationPolicyID: "ep1" });
});
test("update_service maintenance", async () => {
  const execute = vi.fn(async () => ({ updateService: true }));
  await tool("update_service").handler({ execute, paginate: vi.fn() } as any, { id: "s1", maintenanceExpiresAt: "2026-06-04T00:00:00Z" });
  expect(execute.mock.calls[0][1].input).toEqual({ id: "s1", maintenanceExpiresAt: "2026-06-04T00:00:00Z" });
});
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement** (append to `serviceTools`):

```ts
import { CREATE_SERVICE, UPDATE_SERVICE } from "../graphql/operations.js";

const createService: ToolDef = {
  name: "create_service",
  description: "Create a service. Requires a name; usually an escalationPolicyID. Optionally seed labels.",
  inputSchema: {
    name: z.string(),
    description: z.string().optional(),
    escalationPolicyID: z.string().optional(),
    favorite: z.boolean().optional(),
  },
  mutating: true,
  handler: async (client, args) => {
    const input: Record<string, unknown> = { name: args.name };
    if (args.description !== undefined) input.description = args.description;
    if (args.escalationPolicyID) input.escalationPolicyID = args.escalationPolicyID;
    if (args.favorite !== undefined) input.favorite = args.favorite;
    const d = await client.execute<{ createService: unknown }>(CREATE_SERVICE, { input });
    return ok("Service created", d.createService);
  },
};

const updateService: ToolDef = {
  name: "update_service",
  description:
    "Update a service's name, description, escalation policy, or maintenance window. maintenanceExpiresAt (RFC3339) puts the service in maintenance until that time.",
  inputSchema: {
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    escalationPolicyID: z.string().optional(),
    maintenanceExpiresAt: z.string().optional().describe("RFC3339 timestamp; service is in maintenance until then."),
  },
  mutating: true,
  handler: async (client, args) => {
    const input: Record<string, unknown> = { id: args.id };
    for (const k of ["name", "description", "escalationPolicyID", "maintenanceExpiresAt"] as const) {
      if (args[k] !== undefined) input[k] = args[k];
    }
    await client.execute(UPDATE_SERVICE, { input });
    return ok(`Service ${args.id} updated`, input);
  },
};
```

- [ ] **Step 4: Run → PASS. Step 5: Commit** — `git commit -am "feat: create_service and update_service tools"`

---

### Task 18: Escalation policies read — `list_escalation_policies`, `get_escalation_policy`

**Files:** `src/graphql/operations.ts`, create `src/tools/escalation.ts` + test, modify `src/server.ts`.

Operations:
```ts
export const LIST_EPS = /* GraphQL */ `
query ListEPs($input: EscalationPolicySearchOptions) {
  escalationPolicies(input: $input) {
    nodes { id name description stepCount }
    pageInfo { endCursor hasNextPage }
  }
}`;
export const GET_EP = /* GraphQL */ `
query GetEP($id: ID!) {
  escalationPolicy(id: $id) {
    id name description repeat
    steps { id stepNumber delayMinutes actions { type args displayInfo { ... on DestinationDisplayInfo { text } } } }
    assignedTo { id name }
  }
}`;
```
> Note: `actions` is `[Destination!]`; `Destination.displayInfo` is a union (`DestinationDisplayInfo | DestinationDisplayInfoError`). If the inline-fragment selection causes schema issues, fall back to `actions { type args }`. Verify against the live schema during implementation (run the query via `goalert_graphql_query` once auth works).

- [ ] **Step 1: Test** — list passes `{ input:{ first, after, search? } }` (extractor `d.escalationPolicies`); get passes `{ id }`, returns `escalationPolicy`. **Step 2: FAIL. Step 3: Implement** `escalationTools = [listEPs, getEP]` following the services read pattern (swap operations + extractor + names). **Step 4: PASS. Step 5: Commit** — `git commit -am "feat: list/get escalation policy tools"`. Wire into `server.ts`.

---

### Task 19: Escalation policies write — `create_escalation_policy`, `update_escalation_policy`

**Files:** `src/graphql/operations.ts`, `src/tools/escalation.ts`, test.

Operations:
```ts
export const CREATE_EP = /* GraphQL */ `mutation CreateEP($input: CreateEscalationPolicyInput!) { createEscalationPolicy(input: $input) { id name } }`;
export const UPDATE_EP = /* GraphQL */ `mutation UpdateEP($input: UpdateEscalationPolicyInput!) { updateEscalationPolicy(input: $input) }`;
```
`CreateEscalationPolicyInput { name: String!, description: String, repeat: Int, favorite: Boolean }`. `UpdateEscalationPolicyInput { id: ID!, name, description, repeat, stepIDs: [ID!] }` (stepIDs reorders steps).

- [ ] **Step 1: Tests** — create sends `{input:{name, repeat?}}`; update sends `{input:{id, repeat?}}`. Both mutating. **Step 2: FAIL. Step 3: Implement**:

```ts
const createEP: ToolDef = {
  name: "create_escalation_policy",
  description: "Create an escalation policy. repeat = number of times the policy loops (0 = once).",
  inputSchema: { name: z.string(), description: z.string().optional(), repeat: z.number().int().min(0).max(5).optional(), favorite: z.boolean().optional() },
  mutating: true,
  handler: async (client, args) => {
    const input: Record<string, unknown> = { name: args.name };
    for (const k of ["description", "repeat", "favorite"] as const) if (args[k] !== undefined) input[k] = args[k];
    const d = await client.execute<{ createEscalationPolicy: unknown }>(CREATE_EP, { input });
    return ok("Escalation policy created", d.createEscalationPolicy);
  },
};
const updateEP: ToolDef = {
  name: "update_escalation_policy",
  description: "Update an escalation policy's name, description, repeat count, or step order (stepIDs).",
  inputSchema: { id: z.string(), name: z.string().optional(), description: z.string().optional(), repeat: z.number().int().min(0).max(5).optional(), stepIDs: z.array(z.string()).optional().describe("Full ordered list of step IDs to reorder steps.") },
  mutating: true,
  handler: async (client, args) => {
    const input: Record<string, unknown> = { id: args.id };
    for (const k of ["name", "description", "repeat", "stepIDs"] as const) if (args[k] !== undefined) input[k] = args[k];
    await client.execute(UPDATE_EP, { input });
    return ok(`Escalation policy ${args.id} updated`, input);
  },
};
```
Append to `escalationTools`. **Step 4: PASS. Step 5: Commit** — `git commit -am "feat: create/update escalation policy tools"`

---

### Task 20: `manage_escalation_policy_steps`

**Files:** `src/graphql/operations.ts`, `src/tools/escalation.ts`, test.

Operations:
```ts
export const CREATE_EP_STEP = /* GraphQL */ `mutation CreateEPStep($input: CreateEscalationPolicyStepInput!) { createEscalationPolicyStep(input: $input) { id stepNumber } }`;
export const UPDATE_EP_STEP = /* GraphQL */ `mutation UpdateEPStep($input: UpdateEscalationPolicyStepInput!) { updateEscalationPolicyStep(input: $input) }`;
```
`CreateEscalationPolicyStepInput { escalationPolicyID: ID!, delayMinutes: Int!, actions: [DestinationInput!] }`. `UpdateEscalationPolicyStepInput { id: ID!, delayMinutes: Int, actions: [DestinationInput!] }`. `DestinationInput { type: DestinationType!, args: StringMap! }` (e.g. `type: "builtin-rotation", args: { rotation_id: "..." }`; schedule: `type: "builtin-schedule", args: { schedule_id }`; user: `type: "builtin-user", args: { user_id }`). Delete a step via `goalert_delete` with `type: "escalationPolicyStep"`.

- [ ] **Step 1: Tests** — `action:"add"` calls CREATE_EP_STEP with `{input:{escalationPolicyID, delayMinutes, actions}}`; `action:"update"` calls UPDATE_EP_STEP with `{input:{id, ...}}`. Actions map `{userIDs?, scheduleIDs?, rotationIDs?}` → DestinationInput[]. **Step 2: FAIL. Step 3: Implement**:

```ts
function toDestinations(a: { userIDs?: string[]; scheduleIDs?: string[]; rotationIDs?: string[] }) {
  const out: Array<{ type: string; args: Record<string, string> }> = [];
  for (const id of a.userIDs ?? []) out.push({ type: "builtin-user", args: { user_id: id } });
  for (const id of a.scheduleIDs ?? []) out.push({ type: "builtin-schedule", args: { schedule_id: id } });
  for (const id of a.rotationIDs ?? []) out.push({ type: "builtin-rotation", args: { rotation_id: id } });
  return out;
}

const manageEPSteps: ToolDef = {
  name: "manage_escalation_policy_steps",
  description:
    "Add or update an escalation policy step. A step notifies its targets (users/schedules/rotations) then waits delayMinutes before the next step. To remove a step, use goalert_delete with type 'escalationPolicyStep'. To reorder, use update_escalation_policy stepIDs.",
  inputSchema: {
    action: z.enum(["add", "update"]),
    escalationPolicyID: z.string().optional().describe("Required for action 'add'."),
    stepID: z.string().optional().describe("Required for action 'update'."),
    delayMinutes: z.number().int().min(1).optional(),
    userIDs: z.array(z.string()).optional(),
    scheduleIDs: z.array(z.string()).optional(),
    rotationIDs: z.array(z.string()).optional(),
  },
  mutating: true,
  handler: async (client, args) => {
    const actions = toDestinations(args);
    if (args.action === "add") {
      if (!args.escalationPolicyID || args.delayMinutes === undefined) throw new GoAlertError("add requires escalationPolicyID and delayMinutes");
      const d = await client.execute<{ createEscalationPolicyStep: unknown }>(CREATE_EP_STEP, { input: { escalationPolicyID: args.escalationPolicyID, delayMinutes: args.delayMinutes, actions } });
      return ok("Step added", d.createEscalationPolicyStep);
    }
    if (!args.stepID) throw new GoAlertError("update requires stepID");
    const input: Record<string, unknown> = { id: args.stepID };
    if (args.delayMinutes !== undefined) input.delayMinutes = args.delayMinutes;
    if (actions.length) input.actions = actions;
    await client.execute(UPDATE_EP_STEP, { input });
    return ok(`Step ${args.stepID} updated`, input);
  },
};
```
Import `GoAlertError`, `CREATE_EP_STEP`, `UPDATE_EP_STEP`; append to `escalationTools`. **Step 4: PASS. Step 5: Commit** — `git commit -am "feat: manage escalation policy steps"`

---

## Phase 4 — Schedules, rotations, users, sub-resources

### Task 21: Schedules read — `list_schedules`, `get_schedule`

**Files:** `src/graphql/operations.ts`, create `src/tools/schedules.ts` + test, modify `src/server.ts`.

Operations:
```ts
export const LIST_SCHEDULES = /* GraphQL */ `
query ListSchedules($input: ScheduleSearchOptions) {
  schedules(input: $input) { nodes { id name description timeZone isFavorite } pageInfo { endCursor hasNextPage } }
}`;
export const GET_SCHEDULE = /* GraphQL */ `
query GetSchedule($id: ID!, $start: ISOTimestamp!, $end: ISOTimestamp!) {
  schedule(id: $id) {
    id name description timeZone isFavorite
    targets { target { id name type } rules { id start end weekdayFilter } }
    shifts(start: $start, end: $end) { userID user { id name } start end truncated }
    temporarySchedules { start end shifts { userID start end } }
  }
}`;
```
> `get_schedule` needs a window for `shifts`/temp schedules. Default to now → now+7d. Since `Date.now()` is fine in the running server (only the *plan-writing* environment forbids it), compute defaults in the handler: `const start = args.start ?? new Date().toISOString();`.

- [ ] **Step 1: Test** — list extractor `d.schedules`; get passes `{ id, start, end }`, defaults applied when omitted. **Step 2: FAIL. Step 3: Implement** `scheduleTools=[listSchedules, getSchedule]` (list mirrors services; get computes default window). **Step 4: PASS. Step 5: Commit** — `git commit -am "feat: list/get schedule tools"`. Wire into `server.ts`.

```ts
// getSchedule handler core:
handler: async (client, args) => {
  const start = args.start ?? new Date().toISOString();
  const end = args.end ?? new Date(Date.now() + 7 * 864e5).toISOString();
  const d = await client.execute<{ schedule: unknown }>(GET_SCHEDULE, { id: args.id, start, end });
  return ok("Schedule", d.schedule);
},
```

---

### Task 22: Schedules write — `create_schedule`, `update_schedule`

**Files:** `src/graphql/operations.ts`, `src/tools/schedules.ts`, test.

Operations:
```ts
export const CREATE_SCHEDULE = /* GraphQL */ `mutation CreateSchedule($input: CreateScheduleInput!) { createSchedule(input: $input) { id name } }`;
export const UPDATE_SCHEDULE = /* GraphQL */ `mutation UpdateSchedule($input: UpdateScheduleInput!) { updateSchedule(input: $input) }`;
export const UPDATE_SCHEDULE_TARGET = /* GraphQL */ `mutation UpdateScheduleTarget($input: ScheduleTargetInput!) { updateScheduleTarget(input: $input) }`;
```
`CreateScheduleInput { name: String!, description: String, timeZone: String!, favorite: Boolean, targets: [ScheduleTargetInput!] }`. `UpdateScheduleInput { id: ID!, name, description, timeZone }`. `ScheduleTargetInput { scheduleID: ID, target: TargetInput, newRotation: ..., rules: [ScheduleRuleInput!] }`.

- [ ] **Step 1: Tests** — create sends `{input:{name, timeZone}}`; update sends `{input:{id,...}}`; `assign_target` sub-action sends ScheduleTargetInput. Keep `create_schedule` + `update_schedule` simple (name/desc/tz); expose target/rule assignment via a separate `assignTarget` field on `update_schedule` is overkill — instead document that schedule rules/targets are managed with `updateScheduleTarget`, surfaced through a dedicated optional param. For this iteration: `update_schedule` handles name/desc/tz only; add `set_schedule_target` as a third tool.

Implement three tools: `createSchedule`, `updateSchedule`, `setScheduleTarget`:

```ts
const setScheduleTarget: ToolDef = {
  name: "set_schedule_target",
  description:
    "Assign a rotation or user to a schedule with time rules (or update/clear an existing assignment). target is the assignee; rules define when they're on call.",
  inputSchema: {
    scheduleID: z.string(),
    targetType: z.enum(["rotation", "user"]),
    targetID: z.string(),
    rules: z.array(z.object({
      start: z.string().describe('Clock time "HH:MM".'),
      end: z.string().describe('Clock time "HH:MM".'),
      weekdayFilter: z.array(z.boolean()).length(7).describe("7 booleans, index 0 = Sunday."),
    })).describe("Empty array removes the assignment."),
  },
  mutating: true,
  handler: async (client, args) => {
    await client.execute(UPDATE_SCHEDULE_TARGET, { input: { scheduleID: args.scheduleID, target: { type: args.targetType, id: args.targetID }, rules: args.rules } });
    return ok(`Schedule ${args.scheduleID} target ${args.targetID} updated`, { rules: args.rules.length });
  },
};
```
`createSchedule`/`updateSchedule` follow the create/update pattern (name, description, timeZone). **Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit** — `git commit -am "feat: schedule create/update + set_schedule_target"`

---

### Task 23: `manage_overrides`

**Files:** `src/graphql/operations.ts`, `src/tools/schedules.ts`, test.

Operations:
```ts
export const CREATE_OVERRIDE = /* GraphQL */ `mutation CreateOverride($input: CreateUserOverrideInput!) { createUserOverride(input: $input) { id } }`;
export const UPDATE_OVERRIDE = /* GraphQL */ `mutation UpdateOverride($input: UpdateUserOverrideInput!) { updateUserOverride(input: $input) }`;
export const LIST_OVERRIDES = /* GraphQL */ `
query ListOverrides($input: UserOverrideSearchOptions) {
  userOverrides(input: $input) { nodes { id start end addUserID removeUserID } pageInfo { endCursor hasNextPage } }
}`;
```
`CreateUserOverrideInput { scheduleID: ID, start: ISOTimestamp!, end: ISOTimestamp!, addUserID: ID, removeUserID: ID }` (add only = add a user; remove only = remove; both = replace). `UpdateUserOverrideInput { id: ID!, start, end, addUserID, removeUserID }`. Delete via `goalert_delete` type `userOverride`.

- [ ] **Step 1: Tests** — `action:"create"` with addUserID/removeUserID/start/end; `action:"list"` paginates by scheduleID; `action:"update"` by id. **Step 2: FAIL. Step 3: Implement** a single `manage_overrides` tool with an `action` enum (`create|update|list`). Doc string must state overrides are schedule-scoped and are how you override a rotation-driven on-call user. **Step 4: PASS. Step 5: Commit** — `git commit -am "feat: manage_overrides tool"`

```ts
const manageOverrides: ToolDef = {
  name: "manage_overrides",
  description:
    "Create, update, or list schedule overrides. Overrides are schedule-scoped: addUserID adds a user, removeUserID removes one, both = replace removeUserID with addUserID for the window. This is how you override who is on call (including someone scheduled via a rotation) for a time range. Delete an override via goalert_delete type 'userOverride'.",
  inputSchema: {
    action: z.enum(["create", "update", "list"]),
    scheduleID: z.string().optional().describe("Required for create and list."),
    overrideID: z.string().optional().describe("Required for update."),
    addUserID: z.string().optional(),
    removeUserID: z.string().optional(),
    start: z.string().optional().describe("RFC3339; required for create."),
    end: z.string().optional().describe("RFC3339; required for create."),
  },
  mutating: true, // 'list' is read-only but the tool is gated as mutating to keep it together; see note
  handler: async (client, args) => {
    if (args.action === "list") {
      if (!args.scheduleID) throw new GoAlertError("list requires scheduleID");
      const page = await client.paginate(LIST_OVERRIDES, { input: { scheduleID: args.scheduleID, first: 50 } }, (d: any) => d.userOverrides, 200);
      return listResult("Overrides", page);
    }
    if (args.action === "create") {
      if (!args.scheduleID || !args.start || !args.end) throw new GoAlertError("create requires scheduleID, start, end");
      if (!args.addUserID && !args.removeUserID) throw new GoAlertError("create requires addUserID and/or removeUserID");
      const d = await client.execute<{ createUserOverride: { id: string } }>(CREATE_OVERRIDE, { input: { scheduleID: args.scheduleID, start: args.start, end: args.end, addUserID: args.addUserID, removeUserID: args.removeUserID } });
      return ok("Override created", d.createUserOverride);
    }
    if (!args.overrideID) throw new GoAlertError("update requires overrideID");
    const input: Record<string, unknown> = { id: args.overrideID };
    for (const k of ["start", "end", "addUserID", "removeUserID"] as const) if (args[k] !== undefined) input[k] = args[k];
    await client.execute(UPDATE_OVERRIDE, { input });
    return ok(`Override ${args.overrideID} updated`, input);
  },
};
```
> **Note on `mutating` + `list`:** because `list` is read-only but the tool is marked `mutating:true`, when `GOALERT_READ_ONLY=true` the whole tool is hidden — including its list action. That's acceptable (read-only mode users can list overrides via `get_schedule`/`goalert_graphql_query`). If you prefer list to remain available in read-only mode, split listing into `get_schedule` (already returns overrides via a field) — do not add a separate tool. Keep the surface lean.

---

### Task 24: `manage_temporary_schedule`

**Files:** `src/graphql/operations.ts`, `src/tools/schedules.ts`, test.

Operations:
```ts
export const SET_TEMP_SCHED = /* GraphQL */ `mutation SetTemp($input: SetTemporaryScheduleInput!) { setTemporarySchedule(input: $input) }`;
export const CLEAR_TEMP_SCHED = /* GraphQL */ `mutation ClearTemp($input: ClearTemporarySchedulesInput!) { clearTemporarySchedules(input: $input) }`;
```
`SetTemporaryScheduleInput { scheduleID: ID!, start: ISOTimestamp!, end: ISOTimestamp!, shifts: [SetScheduleShiftInput!]! }`, `SetScheduleShiftInput { userID: ID!, start: ISOTimestamp!, end: ISOTimestamp! }`. `ClearTemporarySchedulesInput { scheduleID: ID!, start: ISOTimestamp!, end: ISOTimestamp! }`.

- [ ] **Step 1: Tests** — `action:"set"` builds SetTemporaryScheduleInput with shifts; `action:"clear"` builds ClearTemporarySchedulesInput. **Step 2: FAIL. Step 3: Implement** single `manage_temporary_schedule` tool (`action: set|clear`, `shifts: [{userID,start,end}]`). **Step 4: PASS. Step 5: Commit** — `git commit -am "feat: manage_temporary_schedule tool"`

---

### Task 25: Rotations read — `list_rotations`, `get_rotation`

**Files:** `src/graphql/operations.ts`, create `src/tools/rotations.ts` + test, modify `src/server.ts`.

Operations:
```ts
export const LIST_ROTATIONS = /* GraphQL */ `
query ListRotations($input: RotationSearchOptions) {
  rotations(input: $input) { nodes { id name description type shiftLength timeZone } pageInfo { endCursor hasNextPage } }
}`;
export const GET_ROTATION = /* GraphQL */ `
query GetRotation($id: ID!) {
  rotation(id: $id) {
    id name description type shiftLength start timeZone
    activeUserIndex userIDs users { id name } nextHandoffTimes(num: 3)
  }
}`;
```
- [ ] **Step 1: Test** (list `d.rotations`; get `{id}` returns `rotation`). **Step 2: FAIL. Step 3: Implement** `rotationTools=[listRotations, getRotation]`. **Step 4: PASS. Step 5: Commit** — `git commit -am "feat: list/get rotation tools"`. Wire into `server.ts`.

---

### Task 26: Rotations write — `create_rotation`, `update_rotation`

**Files:** `src/graphql/operations.ts`, `src/tools/rotations.ts`, test.

Operations:
```ts
export const CREATE_ROTATION = /* GraphQL */ `mutation CreateRotation($input: CreateRotationInput!) { createRotation(input: $input) { id name } }`;
export const UPDATE_ROTATION = /* GraphQL */ `mutation UpdateRotation($input: UpdateRotationInput!) { updateRotation(input: $input) }`;
```
`CreateRotationInput { name: String!, description, timeZone: String!, start: ISOTimestamp!, favorite, type: RotationType!, shiftLength: Int = 1, userIDs: [ID!] }`. `UpdateRotationInput { id: ID!, name, description, timeZone, start, type, shiftLength, userIDs, activeUserIndex }`. `RotationType ∈ hourly|daily|weekly|monthly`. **`activeUserIndex` is the only rotation-level "override" — set it to change who is currently on call. It exists on update only, not create.**

- [ ] **Step 1: Tests** — create requires `name, timeZone, start, type`; update can set `activeUserIndex` and `userIDs`.

```ts
test("create_rotation", async () => {
  const execute = vi.fn(async () => ({ createRotation: { id: "r1" } }));
  await tool("create_rotation").handler({ execute, paginate: vi.fn() } as any,
    { name: "Primary", timeZone: "America/New_York", start: "2026-06-03T00:00:00Z", type: "daily", userIDs: ["u1", "u2"] });
  expect(execute.mock.calls[0][1].input).toMatchObject({ name: "Primary", type: "daily", shiftLength: 1, userIDs: ["u1", "u2"] });
});
test("update_rotation can set activeUserIndex (rotation override)", async () => {
  const execute = vi.fn(async () => ({ updateRotation: true }));
  await tool("update_rotation").handler({ execute, paginate: vi.fn() } as any, { id: "r1", activeUserIndex: 2 });
  expect(execute.mock.calls[0][1].input).toEqual({ id: "r1", activeUserIndex: 2 });
});
```

- [ ] **Step 2: FAIL. Step 3: Implement**:

```ts
const createRotation: ToolDef = {
  name: "create_rotation",
  description: "Create a rotation. type ∈ hourly|daily|weekly|monthly; shiftLength is in units of type; userIDs is the ordered participant list.",
  inputSchema: {
    name: z.string(),
    description: z.string().optional(),
    timeZone: z.string().describe('IANA tz, e.g. "America/New_York".'),
    start: z.string().describe("RFC3339 start of the first shift."),
    type: z.enum(["hourly", "daily", "weekly", "monthly"]),
    shiftLength: z.number().int().min(1).optional().describe("Default 1."),
    userIDs: z.array(z.string()).optional(),
    favorite: z.boolean().optional(),
  },
  mutating: true,
  handler: async (client, args) => {
    const input: Record<string, unknown> = { name: args.name, timeZone: args.timeZone, start: args.start, type: args.type, shiftLength: args.shiftLength ?? 1 };
    if (args.description !== undefined) input.description = args.description;
    if (args.userIDs) input.userIDs = args.userIDs;
    if (args.favorite !== undefined) input.favorite = args.favorite;
    const d = await client.execute<{ createRotation: unknown }>(CREATE_ROTATION, { input });
    return ok("Rotation created", d.createRotation);
  },
};
const updateRotation: ToolDef = {
  name: "update_rotation",
  description:
    "Update a rotation. Set activeUserIndex to override who is currently on call (the rotation-level override — there is no separate rotation-override API). userIDs replaces the ordered participant list.",
  inputSchema: {
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    timeZone: z.string().optional(),
    start: z.string().optional(),
    type: z.enum(["hourly", "daily", "weekly", "monthly"]).optional(),
    shiftLength: z.number().int().min(1).optional(),
    userIDs: z.array(z.string()).optional(),
    activeUserIndex: z.number().int().min(0).optional().describe("Index into userIDs to make currently-active (advance/override)."),
  },
  mutating: true,
  handler: async (client, args) => {
    const input: Record<string, unknown> = { id: args.id };
    for (const k of ["name", "description", "timeZone", "start", "type", "shiftLength", "userIDs", "activeUserIndex"] as const) {
      if (args[k] !== undefined) input[k] = args[k];
    }
    await client.execute(UPDATE_ROTATION, { input });
    return ok(`Rotation ${args.id} updated`, input);
  },
};
```
Append to `rotationTools`. **Step 4: PASS. Step 5: Commit** — `git commit -am "feat: create/update rotation tools (incl. activeUserIndex override)"`

---

### Task 27: Users read — `list_users`, `get_user`

**Files:** `src/graphql/operations.ts`, create `src/tools/users.ts` + test, modify `src/server.ts`.

Operations:
```ts
export const LIST_USERS = /* GraphQL */ `
query ListUsers($input: UserSearchOptions) {
  users(input: $input) { nodes { id name email role } pageInfo { endCursor hasNextPage } }
}`;
export const GET_USER = /* GraphQL */ `
query GetUser($id: ID!) {
  user(id: $id) {
    id name email role
    contactMethods { id name dest { type args } disabled pending }
    onCallOverview { serviceCount serviceAssignments { serviceID serviceName stepNumber } }
  }
}`;
```
- [ ] **Step 1: Test** (list `d.users`; get `{id}` returns `user`; both `mutating:false`). **Step 2: FAIL. Step 3: Implement** `userTools=[listUsers, getUser]`. **Step 4: PASS. Step 5: Commit** — `git commit -am "feat: list/get user tools (read-only)"`. Wire into `server.ts`.

---

### Task 28: `manage_integration_keys`

**Files:** `src/graphql/operations.ts`, create `src/tools/keys.ts` + test, modify `src/server.ts`.

Operations:
```ts
export const CREATE_INT_KEY = /* GraphQL */ `mutation CreateIntKey($input: CreateIntegrationKeyInput!) { createIntegrationKey(input: $input) { id name type href } }`;
export const LIST_INT_KEYS = /* GraphQL */ `query IntKeys($serviceID: ID!) { service(id: $serviceID) { integrationKeys { id name type href } } }`;
```
`CreateIntegrationKeyInput { serviceID: ID, name: String!, type: IntegrationKeyType! }`, `IntegrationKeyType ∈ generic|grafana|site24x7|prometheusAlertmanager|email|universal`. Delete via `goalert_delete` type `integrationKey`.

- [ ] **Step 1: Tests** — `action:"create"` builds `{input:{serviceID,name,type}}` and returns the key incl. `href`; `action:"list"` returns service.integrationKeys. **Step 2: FAIL. Step 3: Implement** single `manage_integration_keys` tool (`action: create|list`). create is `mutating:true`; whole tool gated as mutating (list available via `get_service` in read-only mode). **Step 4: PASS. Step 5: Commit** — `git commit -am "feat: manage_integration_keys tool"`. Wire into `server.ts`.

---

### Task 29: `manage_heartbeat_monitors`

**Files:** `src/graphql/operations.ts`, create `src/tools/heartbeats.ts` + test, modify `src/server.ts`.

Operations:
```ts
export const CREATE_HEARTBEAT = /* GraphQL */ `mutation CreateHB($input: CreateHeartbeatMonitorInput!) { createHeartbeatMonitor(input: $input) { id name timeoutMinutes href } }`;
export const UPDATE_HEARTBEAT = /* GraphQL */ `mutation UpdateHB($input: UpdateHeartbeatMonitorInput!) { updateHeartbeatMonitor(input: $input) }`;
```
`CreateHeartbeatMonitorInput { serviceID: ID!, name: String!, timeoutMinutes: Int!, additionalDetails: String }`. `UpdateHeartbeatMonitorInput { id: ID!, name, timeoutMinutes, additionalDetails }`. Returns `href` = the check-in URL. Delete via `goalert_delete` type `heartbeatMonitor`.

- [ ] **Step 1: Tests** — `action:"create"` builds `{input:{serviceID,name,timeoutMinutes}}` and surfaces `href`; `action:"update"` by id. **Step 2: FAIL. Step 3: Implement** single `manage_heartbeat_monitors` tool (`action: create|update`). **Step 4: PASS. Step 5: Commit** — `git commit -am "feat: manage_heartbeat_monitors tool"`. Wire into `server.ts`.

---

## Phase 5 — Polish & ship

### Task 30: Integration smoke test (read-only, env-gated)

**Files:** create `src/integration.test.ts`, `scripts/introspect.ts`

- [ ] **Step 1: Write the env-gated test**

```ts
import { describe, expect, test } from "vitest";
import { loadConfig } from "./config.js";
import { createAuthenticator } from "./client/auth.js";
import { createClient } from "./client/graphql.js";

const live = process.env.GOALERT_INTEGRATION === "1";
describe.runIf(live)("live read-only smoke", () => {
  test("authenticates and lists services", async () => {
    const config = loadConfig(process.env);
    const client = createClient(config, createAuthenticator(config));
    const data = await client.execute<{ services: { nodes: unknown[] } }>(
      "query{ services(input:{first:1}){ nodes{ id name } } }",
    );
    expect(Array.isArray(data.services.nodes)).toBe(true);
  });
});
```

- [ ] **Step 2: Write `scripts/introspect.ts`** (developer tool to dump the schema for reference; not run in CI)

```ts
import { loadConfig } from "../src/config.js";
import { createAuthenticator } from "../src/client/auth.js";
import { createClient } from "../src/client/graphql.js";
import { writeFileSync } from "node:fs";
import { getIntrospectionQuery, buildClientSchema, printSchema } from "graphql";

const config = loadConfig(process.env);
const client = createClient(config, createAuthenticator(config));
const data = await client.execute<any>(getIntrospectionQuery());
writeFileSync("schema.graphql", printSchema(buildClientSchema(data)));
console.log("Wrote schema.graphql");
```
> Add `graphql` as a devDependency (`npm i -D graphql`). This script is optional tooling; `schema.graphql` is gitignored.

- [ ] **Step 3: Run** — `npm run test` (smoke test skips without `GOALERT_INTEGRATION=1`). Optionally run live: `GOALERT_INTEGRATION=1 GOALERT_BASE_URL=... GOALERT_USERNAME=... GOALERT_PASSWORD=... npm run test`.

- [ ] **Step 4: Commit** — `git commit -am "test: env-gated live smoke + introspect script"`

---

### Task 31: README + build verification

**Files:** modify `README.md`

- [ ] **Step 1: Write `README.md`** with: one-line description; install/run via npx; the env-var table (from spec §6); two ready-to-paste config blocks (password mode and token mode) for Claude Desktop / Claude Code; a tool catalog grouped by area; a "read-only mode" note; a security note (creds stay local, never logged); how to obtain a session token manually (`curl -XPOST -H 'Referer: <url>' -d 'username=...&password=...' '<url>/api/v2/identity/providers/basic?noRedirect=1'`).

Example Claude Desktop config block to include:
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

- [ ] **Step 2: Full build + test + typecheck**

Run: `npm run build && npm run typecheck && npm run test`
Expected: build emits `dist/`, typecheck clean, all unit tests pass.

- [ ] **Step 3: Manual end-to-end check**

Run the built server against the live instance and confirm it starts and lists tools:
```bash
GOALERT_BASE_URL=https://goalert.example.com GOALERT_TOKEN=<token> node dist/index.js
```
(Use an MCP client or the inspector; confirm tools appear and `list_services` works.)

- [ ] **Step 4: Commit** — `git commit -am "docs: README with setup, config, and tool catalog"`

---

## Self-Review (completed during planning)

- **Spec coverage:** every tool in spec §5 maps to a task — common (T10,13,14), alerts (T11,15), on-call (T12), services (T16,17), escalation (T18,19,20), schedules (T21,22,23,24), rotations (T25,26), users (T27), integration keys (T28), heartbeats (T29). Config §6 → T2; auth/serialization/errors §3-4 → T3-6; read-only guard → T8; output/errors/pagination §7 → T6,7,8; testing §8 → unit tests per task + T30; distribution §9 → T1,31. Rotation-override question → T26 (`activeUserIndex`) + T23 doc.
- **Deviations from spec (intentional):** (1) no GraphQL codegen — hand-written types + operation strings, optional `introspect` script instead (live introspection needs auth; keeps builds hermetic). (2) Schedule rules/targets exposed as a dedicated `set_schedule_target` tool rather than folded into `update_schedule`. Tool count is ~32 incl. these.
- **Type/name consistency:** `GoAlertClient.execute`/`paginate`, `Page`, `Connection`, `ToolDef`, `ok`/`listResult`, `registerTools` used consistently across all tasks. Each tool module exports `<area>Tools: ToolDef[]`, all aggregated in `server.ts` `allToolDefs()`.
- **Open verification items (resolve during implementation against live schema via `goalert_graphql_query`):** exact `*SearchOptions` field names; `Destination.displayInfo` union selection in `get_escalation_policy`; `contactMethods.dest { type args }` shape on `get_user`. Each is isolated to one query string and surfaces a clear GraphQL error if a field name is off.
