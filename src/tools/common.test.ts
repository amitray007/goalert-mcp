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

  test("rejects the multi-op-in-string bypass (mutation hidden after a string-literal comment)", async () => {
    const execute = vi.fn();
    await expect(tool("goalert_graphql_query").handler(client(execute), { query: 'query{ a(b:"x # y") } mutation Z{ evil }' }))
      .rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });

  test("rejects multi-operation documents", async () => {
    const execute = vi.fn();
    await expect(tool("goalert_graphql_query").handler(client(execute), { query: "query A { x } query B { y }" }))
      .rejects.toThrow(/single/i);
    expect(execute).not.toHaveBeenCalled();
  });

  test("rejects invalid GraphQL", async () => {
    const execute = vi.fn();
    await expect(tool("goalert_graphql_query").handler(client(execute), { query: "query { this is not valid" }))
      .rejects.toThrow(/invalid graphql/i);
    expect(execute).not.toHaveBeenCalled();
  });

  test("rejects a fragment-only document (no operation)", async () => {
    const execute = vi.fn();
    await expect(tool("goalert_graphql_query").handler(client(execute), { query: "fragment F on Service { id }" }))
      .rejects.toThrow(/operation/i);
    expect(execute).not.toHaveBeenCalled();
  });

  test("allows a leading-comment query", async () => {
    const execute = vi.fn(async () => ({ x: 1 }));
    await expect(tool("goalert_graphql_query").handler(client(execute), { query: "# hi\nquery { x }" }))
      .resolves.toBeDefined();
    expect(execute).toHaveBeenCalled();
  });

  test("allows the shorthand query (anonymous operation)", async () => {
    const execute = vi.fn(async () => ({ x: 1 }));
    await expect(tool("goalert_graphql_query").handler(client(execute), { query: "{ x }" }))
      .resolves.toBeDefined();
    expect(execute).toHaveBeenCalled();
  });

  test("allows a query with a field literally named mutation", async () => {
    const execute = vi.fn(async () => ({ mutation: { id: "1" } }));
    await expect(tool("goalert_graphql_query").handler(client(execute), { query: "query { mutation { id } }" }))
      .resolves.toBeDefined();
    expect(execute).toHaveBeenCalled();
  });

  test("is marked non-mutating", () => {
    expect(tool("goalert_graphql_query").mutating).toBe(false);
  });
});
