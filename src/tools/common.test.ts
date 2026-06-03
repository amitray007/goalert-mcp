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
