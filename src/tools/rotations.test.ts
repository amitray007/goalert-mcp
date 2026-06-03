import { describe, expect, test, vi } from "vitest";
import { rotationTools } from "./rotations.js";

const tool = (n: string) => rotationTools.find((t) => t.name === n)!;

// ---- Task 25: list_rotations ----

describe("list_rotations", () => {
  test("paginates using d.rotations extractor", async () => {
    const paginate = vi.fn(async (..._args: any[]) => ({
      items: [{ id: "r1", name: "Primary" }],
      nextCursor: null,
      hasMore: false,
    }));
    const client = { execute: vi.fn(), paginate } as any;
    const r = await tool("list_rotations").handler(client, { first: 10 });
    const [op, vars, extractor] = paginate.mock.calls[0]!;
    expect(op).toContain("ListRotations");
    expect(vars.input.first).toBe(10);
    // extractor should pick d.rotations
    const fakeData = {
      rotations: {
        nodes: [{ id: "r1" }],
        pageInfo: { endCursor: "c", hasNextPage: false },
      },
    };
    expect(extractor(fakeData)).toBe(fakeData.rotations);
    expect(r.structuredContent).toMatchObject({ count: 1 });
  });

  test("search and favoritesFirst passed through", async () => {
    const paginate = vi.fn(async (..._args: any[]) => ({
      items: [],
      nextCursor: null,
      hasMore: false,
    }));
    const client = { execute: vi.fn(), paginate } as any;
    await tool("list_rotations").handler(client, { search: "oncall", favoritesFirst: true });
    const [, vars] = paginate.mock.calls[0]!;
    expect(vars.input.search).toBe("oncall");
    expect(vars.input.favoritesFirst).toBe(true);
  });

  test("all:true sets max=200", async () => {
    const paginate = vi.fn(async (..._args: any[]) => ({
      items: [],
      nextCursor: null,
      hasMore: false,
    }));
    const client = { execute: vi.fn(), paginate } as any;
    await tool("list_rotations").handler(client, { all: true });
    expect(paginate.mock.calls[0]![3]).toBe(200);
  });

  test("default first=25", async () => {
    const paginate = vi.fn(async (..._args: any[]) => ({
      items: [],
      nextCursor: null,
      hasMore: false,
    }));
    const client = { execute: vi.fn(), paginate } as any;
    await tool("list_rotations").handler(client, {});
    expect(paginate.mock.calls[0]![1].input.first).toBe(25);
  });

  test("is marked non-mutating", () => {
    expect(tool("list_rotations").mutating).toBe(false);
  });
});

// ---- Task 25: get_rotation ----

describe("get_rotation", () => {
  test("passes id to execute and returns rotation", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({
      rotation: {
        id: "r1",
        name: "Primary",
        type: "daily",
        shiftLength: 1,
        activeUserIndex: 0,
        userIDs: ["u1", "u2"],
      },
    }));
    const r = await tool("get_rotation").handler({ execute, paginate: vi.fn() } as any, { id: "r1" });
    expect(execute.mock.calls[0]![1]).toEqual({ id: "r1" });
    expect(r.structuredContent).toMatchObject({ id: "r1", name: "Primary" });
  });

  test("is marked non-mutating", () => {
    expect(tool("get_rotation").mutating).toBe(false);
  });
});

// ---- Task 26: create_rotation ----

describe("create_rotation", () => {
  test("sends required fields and defaults shiftLength to 1", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ createRotation: { id: "r1" } }));
    const r = await tool("create_rotation").handler({ execute, paginate: vi.fn() } as any, {
      name: "Primary",
      timeZone: "America/New_York",
      start: "2026-06-03T00:00:00Z",
      type: "daily",
      userIDs: ["u1", "u2"],
    });
    expect(execute.mock.calls[0]![1].input).toMatchObject({
      name: "Primary",
      type: "daily",
      shiftLength: 1,
      userIDs: ["u1", "u2"],
    });
    expect(r.structuredContent).toMatchObject({ id: "r1" });
  });

  test("omits optional fields when not provided", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ createRotation: { id: "r1" } }));
    await tool("create_rotation").handler({ execute, paginate: vi.fn() } as any, {
      name: "Minimal",
      timeZone: "UTC",
      start: "2026-06-03T00:00:00Z",
      type: "weekly",
    });
    const input = execute.mock.calls[0]![1].input;
    expect(input).toEqual({
      name: "Minimal",
      timeZone: "UTC",
      start: "2026-06-03T00:00:00Z",
      type: "weekly",
      shiftLength: 1,
    });
  });

  test("includes description and favorite when provided", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ createRotation: { id: "r1" } }));
    await tool("create_rotation").handler({ execute, paginate: vi.fn() } as any, {
      name: "Oncall",
      timeZone: "UTC",
      start: "2026-06-03T00:00:00Z",
      type: "hourly",
      description: "Primary rotation",
      favorite: true,
    });
    expect(execute.mock.calls[0]![1].input).toMatchObject({
      description: "Primary rotation",
      favorite: true,
    });
  });

  test("is marked mutating", () => {
    expect(tool("create_rotation").mutating).toBe(true);
  });
});

// ---- Task 26: update_rotation ----

describe("update_rotation", () => {
  test("can set activeUserIndex (rotation override)", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ updateRotation: true }));
    await tool("update_rotation").handler({ execute, paginate: vi.fn() } as any, {
      id: "r1",
      activeUserIndex: 2,
    });
    expect(execute.mock.calls[0]![1].input).toEqual({ id: "r1", activeUserIndex: 2 });
  });

  test("preserves activeUserIndex: 0 (not dropped by a falsy check)", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ updateRotation: true }));
    await tool("update_rotation").handler({ execute, paginate: vi.fn() } as any, { id: "r1", activeUserIndex: 0 });
    expect(execute.mock.calls[0]![1].input).toEqual({ id: "r1", activeUserIndex: 0 });
  });

  test("can set userIDs to replace participant list", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ updateRotation: true }));
    await tool("update_rotation").handler({ execute, paginate: vi.fn() } as any, {
      id: "r1",
      userIDs: ["u3", "u4"],
    });
    expect(execute.mock.calls[0]![1].input).toMatchObject({ id: "r1", userIDs: ["u3", "u4"] });
  });

  test("sends only provided fields", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ updateRotation: true }));
    await tool("update_rotation").handler({ execute, paginate: vi.fn() } as any, {
      id: "r1",
      name: "Updated Name",
    });
    expect(execute.mock.calls[0]![1].input).toEqual({ id: "r1", name: "Updated Name" });
  });

  test("is marked mutating", () => {
    expect(tool("update_rotation").mutating).toBe(true);
  });
});
