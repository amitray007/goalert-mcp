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

// A response whose raw body is `text` (not JSON). `json()` throws like a real
// Response would when the body isn't valid JSON.
function textRes(text: string, status = 200): Response {
  return {
    ok: status < 400,
    status,
    text: async () => text,
    json: async () => {
      throw new SyntaxError(`Unexpected token in JSON: ${text.slice(0, 10)}`);
    },
  } as any;
}

describe("graphql executor", () => {
  test("posts to /api/graphql with bearer token and returns data", async () => {
    const f = vi.fn(async () => jsonRes({ data: { service: { id: "1" } } }));
    const client = createClient(cfg, fakeAuth(), f as any);
    const data = await client.execute<{ service: { id: string } }>("query{service{id}}", { id: "1" });
    expect(data.service.id).toBe("1");
    const [url, init] = (f.mock.calls as any[])[0];
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

  test("non-OK non-401 (500 with HTML body) throws GoAlertError, not SyntaxError", async () => {
    const f = vi.fn(async () => textRes("<html><body>502 Bad Gateway</body></html>", 500));
    const client = createClient(cfg, fakeAuth(), f as any);
    await expect(client.execute("query{x}")).rejects.toBeInstanceOf(GoAlertError);
    await expect(client.execute("query{x}")).rejects.toMatchObject({ status: 500 });
  });

  test("200 with non-JSON body throws GoAlertError, not SyntaxError", async () => {
    const f = vi.fn(async () => textRes("not json at all", 200));
    const client = createClient(cfg, fakeAuth(), f as any);
    const err = await client.execute("query{x}").catch((e) => e);
    expect(err).toBeInstanceOf(GoAlertError);
    expect(err).not.toBeInstanceOf(SyntaxError);
  });

  test("body-level Unauthorized error triggers one re-auth + retry, then throws", async () => {
    const auth = fakeAuth();
    const f = vi.fn(async () => jsonRes({ errors: [{ message: "Unauthorized" }] }));
    const client = createClient(cfg, auth, f as any);
    await expect(client.execute("query{ok}")).rejects.toBeInstanceOf(GoAlertError);
    expect(auth.invalidate).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledTimes(2);
  });

  test("body-level Unauthorized then success on retry resolves", async () => {
    const auth = fakeAuth();
    let call = 0;
    const f = vi.fn(async () =>
      ++call === 1 ? jsonRes({ errors: [{ message: "Unauthorized" }] }) : jsonRes({ data: { ok: true } }),
    );
    const client = createClient(cfg, auth, f as any);
    await expect(client.execute("query{ok}")).resolves.toEqual({ ok: true });
    expect(auth.invalidate).toHaveBeenCalledTimes(1);
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
      {}, (d: any) => d.services,
    );
    expect(page.items.map((s) => s.id)).toEqual(["1", "2"]);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBe("c2");
  });

  test("paginate advances the cursor inside input.after, preserving other input fields", async () => {
    const pages = [
      { data: { services: { nodes: [{ id: "1" }], pageInfo: { endCursor: "c1", hasNextPage: true } } } },
      { data: { services: { nodes: [{ id: "2" }], pageInfo: { endCursor: "c2", hasNextPage: false } } } },
    ];
    let i = 0;
    const f = vi.fn(async (..._args: any[]) => jsonRes(pages[i++]));
    const client = createClient(cfg, fakeAuth(), f as any);
    await client.paginate<{ id: string }>("q", { input: { first: 25, search: "x" } }, (d: any) => d.services);
    // Page 1 carries the original input (after null/undefined); page 2 must carry
    // the page-1 endCursor INSIDE input, with first/search preserved.
    const body1 = JSON.parse((f.mock.calls[0]![1] as any).body);
    const body2 = JSON.parse((f.mock.calls[1]![1] as any).body);
    expect(body1.variables.input).toMatchObject({ first: 25, search: "x" });
    expect(body2.variables.input).toEqual({ first: 25, search: "x", after: "c1" });
  });

  test("paginate stops at max and reports hasMore", async () => {
    const f = vi.fn(async () => jsonRes({ data: { services: { nodes: [{ id: "x" }], pageInfo: { endCursor: "c", hasNextPage: true } } } }));
    const client = createClient(cfg, fakeAuth(), f as any);
    const page = await client.paginate<{ id: string }>("q", {}, (d: any) => d.services, 2);
    expect(page.items).toHaveLength(2);
    expect(page.hasMore).toBe(true);
  });
});
