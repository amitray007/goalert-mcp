import { describe, expect, test, vi } from "vitest";
import { userTools } from "./users.js";

const tool = (n: string) => userTools.find((t) => t.name === n)!;

// ---- Task 27: list_users ----

describe("list_users", () => {
  test("paginates using d.users extractor", async () => {
    const paginate = vi.fn(async (..._args: any[]) => ({
      items: [{ id: "u1", name: "Alice", email: "alice@example.com" }],
      nextCursor: null,
      hasMore: false,
    }));
    const client = { execute: vi.fn(), paginate } as any;
    const r = await tool("list_users").handler(client, { first: 10 });
    const [op, vars, extractor] = paginate.mock.calls[0]!;
    expect(op).toContain("ListUsers");
    expect(vars.input.first).toBe(10);
    // extractor should pick d.users
    const fakeData = {
      users: {
        nodes: [{ id: "u1" }],
        pageInfo: { endCursor: "c", hasNextPage: false },
      },
    };
    expect(extractor(fakeData)).toBe(fakeData.users);
    expect(r.structuredContent).toMatchObject({ count: 1 });
  });

  test("search passed through", async () => {
    const paginate = vi.fn(async (..._args: any[]) => ({
      items: [],
      nextCursor: null,
      hasMore: false,
    }));
    const client = { execute: vi.fn(), paginate } as any;
    await tool("list_users").handler(client, { search: "alice" });
    const [, vars] = paginate.mock.calls[0]!;
    expect(vars.input.search).toBe("alice");
  });

  test("all:true sets max=200", async () => {
    const paginate = vi.fn(async (..._args: any[]) => ({
      items: [],
      nextCursor: null,
      hasMore: false,
    }));
    const client = { execute: vi.fn(), paginate } as any;
    await tool("list_users").handler(client, { all: true });
    expect(paginate.mock.calls[0]![3]).toBe(200);
  });

  test("default first=25", async () => {
    const paginate = vi.fn(async (..._args: any[]) => ({
      items: [],
      nextCursor: null,
      hasMore: false,
    }));
    const client = { execute: vi.fn(), paginate } as any;
    await tool("list_users").handler(client, {});
    expect(paginate.mock.calls[0]![1].input.first).toBe(25);
  });

  test("is marked non-mutating", () => {
    expect(tool("list_users").mutating).toBe(false);
  });
});

// ---- Task 27: get_user ----

describe("get_user", () => {
  test("passes id to execute and returns user", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({
      user: {
        id: "u1",
        name: "Alice",
        email: "alice@example.com",
        role: "user",
        contactMethods: [],
        onCallOverview: { serviceCount: 0, serviceAssignments: [] },
      },
    }));
    const r = await tool("get_user").handler({ execute, paginate: vi.fn() } as any, { id: "u1" });
    expect(execute.mock.calls[0]![1]).toEqual({ id: "u1" });
    expect(r.structuredContent).toMatchObject({ id: "u1", name: "Alice" });
  });

  test("is marked non-mutating", () => {
    expect(tool("get_user").mutating).toBe(false);
  });
});
