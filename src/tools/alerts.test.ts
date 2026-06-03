import { describe, expect, test, vi } from "vitest";
import { alertTools } from "./alerts.js";

const tool = (n: string) => alertTools.find((t) => t.name === n)!;

describe("list_alerts", () => {
  test("builds AlertSearchOptions and paginates", async () => {
    const paginate = vi.fn(async (..._args: any[]) => ({ items: [{ alertID: 5 }], nextCursor: null, hasMore: false }));
    const client = { execute: vi.fn(), paginate } as any;
    const r = await tool("list_alerts").handler(client, { serviceIDs: ["s1"], status: ["unacked"], first: 10 });
    const [, vars] = paginate.mock.calls[0]!;
    expect(vars.input.filterByServiceID).toEqual(["s1"]);
    expect(vars.input.filterByStatus).toEqual(["StatusUnacknowledged"]);
    expect(vars.input.first).toBe(10);
    expect(r.structuredContent).toMatchObject({ count: 1 });
  });

  test("all:true auto-paginates with max=200", async () => {
    const paginate = vi.fn(async (..._args: any[]) => ({ items: [], nextCursor: null, hasMore: false }));
    const client = { execute: vi.fn(), paginate } as any;
    await tool("list_alerts").handler(client, { all: true, first: 10 });
    expect(paginate.mock.calls[0]![3]).toBe(200);
  });

  test("without all, max is the page size", async () => {
    const paginate = vi.fn(async (..._args: any[]) => ({ items: [], nextCursor: null, hasMore: false }));
    const client = { execute: vi.fn(), paginate } as any;
    await tool("list_alerts").handler(client, { first: 10 });
    expect(paginate.mock.calls[0]![3]).toBe(10);
  });
});

describe("get_alert", () => {
  test("fetches a single alert by numeric id", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ alert: { alertID: 7, status: "StatusClosed" } }));
    const r = await tool("get_alert").handler({ execute, paginate: vi.fn() } as any, { alertID: 7 });
    expect(execute.mock.calls[0]![1]).toEqual({ id: 7 });
    expect(r.structuredContent).toMatchObject({ alertID: 7 });
  });
});
