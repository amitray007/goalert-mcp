import { describe, expect, test, vi } from "vitest";
import { serviceTools } from "./services.js";

const tool = (n: string) => serviceTools.find((t) => t.name === n)!;

describe("list_services", () => {
  test("passes search, favoritesFirst, first, after to paginate", async () => {
    const paginate = vi.fn(async (..._args: any[]) => ({ items: [{ id: "s1", name: "API" }], nextCursor: null, hasMore: false }));
    const client = { execute: vi.fn(), paginate } as any;
    const r = await tool("list_services").handler(client, { search: "api", favoritesFirst: true, first: 10, after: "cur1" });
    const [, vars] = paginate.mock.calls[0]!;
    expect(vars.input.search).toBe("api");
    expect(vars.input.favoritesFirst).toBe(true);
    expect(vars.input.first).toBe(10);
    expect(vars.input.after).toBe("cur1");
    expect(r.structuredContent).toMatchObject({ count: 1 });
  });

  test("uses extractor d.services", async () => {
    const paginate = vi.fn(async (..._args: any[]) => ({ items: [], nextCursor: null, hasMore: false }));
    const client = { execute: vi.fn(), paginate } as any;
    await tool("list_services").handler(client, {});
    const [op, , extractor] = paginate.mock.calls[0]!;
    expect(op).toContain("ListServices");
    // Verify extractor reads d.services
    const fakeData = { services: { nodes: [{ id: "s2" }], pageInfo: { endCursor: "c", hasNextPage: false } } };
    expect(extractor(fakeData)).toBe(fakeData.services);
  });

  test("all:true sets max=200", async () => {
    const paginate = vi.fn(async (..._args: any[]) => ({ items: [], nextCursor: null, hasMore: false }));
    const client = { execute: vi.fn(), paginate } as any;
    await tool("list_services").handler(client, { all: true });
    expect(paginate.mock.calls[0]![3]).toBe(200);
  });

  test("default first=25 when not specified", async () => {
    const paginate = vi.fn(async (..._args: any[]) => ({ items: [], nextCursor: null, hasMore: false }));
    const client = { execute: vi.fn(), paginate } as any;
    await tool("list_services").handler(client, {});
    expect(paginate.mock.calls[0]![1].input.first).toBe(25);
  });

  test("is marked non-mutating", () => {
    expect(tool("list_services").mutating).toBe(false);
  });
});

describe("get_service", () => {
  test("passes id to execute and returns service", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({
      service: { id: "s1", name: "Payments", escalationPolicy: { id: "ep1", name: "Oncall" } },
    }));
    const r = await tool("get_service").handler({ execute, paginate: vi.fn() } as any, { id: "s1" });
    expect(execute.mock.calls[0]![1]).toEqual({ id: "s1" });
    expect(r.structuredContent).toMatchObject({ id: "s1", name: "Payments" });
  });

  test("is marked non-mutating", () => {
    expect(tool("get_service").mutating).toBe(false);
  });
});

describe("create_service", () => {
  test("sends name and escalationPolicyID", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ createService: { id: "s9" } }));
    await tool("create_service").handler({ execute, paginate: vi.fn() } as any, { name: "Payments", escalationPolicyID: "ep1" });
    expect(execute.mock.calls[0]![1]).toMatchObject({ input: { name: "Payments", escalationPolicyID: "ep1" } });
  });

  test("omits optional fields when not provided", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ createService: { id: "s9" } }));
    await tool("create_service").handler({ execute, paginate: vi.fn() } as any, { name: "Minimal" });
    expect(execute.mock.calls[0]![1]).toEqual({ input: { name: "Minimal" } });
  });

  test("returns createService from response", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ createService: { id: "s9", name: "Payments" } }));
    const r = await tool("create_service").handler({ execute, paginate: vi.fn() } as any, { name: "Payments" });
    expect(r.structuredContent).toMatchObject({ id: "s9", name: "Payments" });
  });

  test("is marked mutating", () => {
    expect(tool("create_service").mutating).toBe(true);
  });
});

describe("update_service", () => {
  test("sends id and maintenanceExpiresAt", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ updateService: true }));
    await tool("update_service").handler({ execute, paginate: vi.fn() } as any, { id: "s1", maintenanceExpiresAt: "2026-06-04T00:00:00Z" });
    expect(execute.mock.calls[0]![1]).toMatchObject({ input: { id: "s1", maintenanceExpiresAt: "2026-06-04T00:00:00Z" } });
  });

  test("omits optional fields when not provided", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ updateService: true }));
    await tool("update_service").handler({ execute, paginate: vi.fn() } as any, { id: "s1" });
    expect(execute.mock.calls[0]![1]).toEqual({ input: { id: "s1" } });
  });

  test("is marked mutating", () => {
    expect(tool("update_service").mutating).toBe(true);
  });
});
