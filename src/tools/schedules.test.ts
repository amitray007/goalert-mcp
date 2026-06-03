import { describe, expect, test, vi } from "vitest";
import { scheduleTools } from "./schedules.js";

const tool = (n: string) => scheduleTools.find((t) => t.name === n)!;

// ---- Task 21: list_schedules ----

describe("list_schedules", () => {
  test("paginates using d.schedules extractor", async () => {
    const paginate = vi.fn(async (..._args: any[]) => ({ items: [{ id: "sc1", name: "Primary" }], nextCursor: null, hasMore: false }));
    const client = { execute: vi.fn(), paginate } as any;
    const r = await tool("list_schedules").handler(client, { first: 10 });
    const [op, vars, extractor] = paginate.mock.calls[0]!;
    expect(op).toContain("ListSchedules");
    expect(vars.input.first).toBe(10);
    // extractor should pick d.schedules
    const fakeData = { schedules: { nodes: [{ id: "sc1" }], pageInfo: { endCursor: "c", hasNextPage: false } } };
    expect(extractor(fakeData)).toBe(fakeData.schedules);
    expect(r.structuredContent).toMatchObject({ count: 1 });
  });

  test("search and favoritesFirst passed through", async () => {
    const paginate = vi.fn(async (..._args: any[]) => ({ items: [], nextCursor: null, hasMore: false }));
    const client = { execute: vi.fn(), paginate } as any;
    await tool("list_schedules").handler(client, { search: "oncall", favoritesFirst: true });
    const [, vars] = paginate.mock.calls[0]!;
    expect(vars.input.search).toBe("oncall");
    expect(vars.input.favoritesFirst).toBe(true);
  });

  test("all:true sets max=200", async () => {
    const paginate = vi.fn(async (..._args: any[]) => ({ items: [], nextCursor: null, hasMore: false }));
    const client = { execute: vi.fn(), paginate } as any;
    await tool("list_schedules").handler(client, { all: true });
    expect(paginate.mock.calls[0]![3]).toBe(200);
  });

  test("default first=25", async () => {
    const paginate = vi.fn(async (..._args: any[]) => ({ items: [], nextCursor: null, hasMore: false }));
    const client = { execute: vi.fn(), paginate } as any;
    await tool("list_schedules").handler(client, {});
    expect(paginate.mock.calls[0]![1].input.first).toBe(25);
  });

  test("is marked non-mutating", () => {
    expect(tool("list_schedules").mutating).toBe(false);
  });
});

// ---- Task 21: get_schedule ----

describe("get_schedule", () => {
  test("passes id with computed start/end window and returns schedule", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ schedule: { id: "sc1", name: "Primary", shifts: [] } }));
    const r = await tool("get_schedule").handler({ execute, paginate: vi.fn() } as any, { id: "sc1" });
    const vars = execute.mock.calls[0]![1];
    expect(vars.id).toBe("sc1");
    // start and end should be ISO strings
    expect(typeof vars.start).toBe("string");
    expect(typeof vars.end).toBe("string");
    // end should be after start
    expect(new Date(vars.end).getTime()).toBeGreaterThan(new Date(vars.start).getTime());
    expect(r.structuredContent).toMatchObject({ id: "sc1", name: "Primary" });
  });

  test("accepts explicit start/end overrides", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ schedule: { id: "sc1" } }));
    await tool("get_schedule").handler({ execute, paginate: vi.fn() } as any, {
      id: "sc1",
      start: "2026-06-01T00:00:00Z",
      end: "2026-06-08T00:00:00Z",
    });
    const vars = execute.mock.calls[0]![1];
    expect(vars.start).toBe("2026-06-01T00:00:00Z");
    expect(vars.end).toBe("2026-06-08T00:00:00Z");
  });

  test("is marked non-mutating", () => {
    expect(tool("get_schedule").mutating).toBe(false);
  });
});

// ---- Task 22: create_schedule ----

describe("create_schedule", () => {
  test("sends name and timeZone", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ createSchedule: { id: "sc9", name: "OnCall" } }));
    const r = await tool("create_schedule").handler({ execute, paginate: vi.fn() } as any, {
      name: "OnCall",
      timeZone: "America/New_York",
    });
    expect(execute.mock.calls[0]![1]).toMatchObject({ input: { name: "OnCall", timeZone: "America/New_York" } });
    expect(r.structuredContent).toMatchObject({ id: "sc9", name: "OnCall" });
  });

  test("omits optional description and favorite when not provided", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ createSchedule: { id: "sc9" } }));
    await tool("create_schedule").handler({ execute, paginate: vi.fn() } as any, { name: "Minimal", timeZone: "UTC" });
    expect(execute.mock.calls[0]![1]).toEqual({ input: { name: "Minimal", timeZone: "UTC" } });
  });

  test("includes description and favorite when provided", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ createSchedule: { id: "sc9" } }));
    await tool("create_schedule").handler({ execute, paginate: vi.fn() } as any, {
      name: "OnCall",
      timeZone: "UTC",
      description: "Primary on-call",
      favorite: true,
    });
    expect(execute.mock.calls[0]![1]).toMatchObject({
      input: { name: "OnCall", timeZone: "UTC", description: "Primary on-call", favorite: true },
    });
  });

  test("is marked mutating", () => {
    expect(tool("create_schedule").mutating).toBe(true);
  });
});

// ---- Task 22: update_schedule ----

describe("update_schedule", () => {
  test("sends id and changed fields only", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ updateSchedule: true }));
    await tool("update_schedule").handler({ execute, paginate: vi.fn() } as any, {
      id: "sc1",
      name: "Primary Oncall",
      timeZone: "UTC",
    });
    expect(execute.mock.calls[0]![1]).toMatchObject({ input: { id: "sc1", name: "Primary Oncall", timeZone: "UTC" } });
  });

  test("sends only id when no other fields provided", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ updateSchedule: true }));
    await tool("update_schedule").handler({ execute, paginate: vi.fn() } as any, { id: "sc1" });
    expect(execute.mock.calls[0]![1]).toEqual({ input: { id: "sc1" } });
  });

  test("is marked mutating", () => {
    expect(tool("update_schedule").mutating).toBe(true);
  });
});

// ---- Task 22: set_schedule_target ----

describe("set_schedule_target", () => {
  test("sends ScheduleTargetInput with target and rules", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ updateScheduleTarget: true }));
    const r = await tool("set_schedule_target").handler({ execute, paginate: vi.fn() } as any, {
      scheduleID: "sc1",
      targetType: "rotation",
      targetID: "rot1",
      rules: [
        { start: "09:00", end: "17:00", weekdayFilter: [false, true, true, true, true, true, false] },
      ],
    });
    const vars = execute.mock.calls[0]![1];
    expect(vars.input.scheduleID).toBe("sc1");
    expect(vars.input.target).toEqual({ type: "rotation", id: "rot1" });
    expect(vars.input.rules).toHaveLength(1);
    expect(vars.input.rules[0]).toMatchObject({ start: "09:00", end: "17:00" });
    expect(r.structuredContent).toMatchObject({ rules: 1 });
  });

  test("empty rules array clears the assignment", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ updateScheduleTarget: true }));
    await tool("set_schedule_target").handler({ execute, paginate: vi.fn() } as any, {
      scheduleID: "sc1",
      targetType: "user",
      targetID: "u1",
      rules: [],
    });
    const vars = execute.mock.calls[0]![1];
    expect(vars.input.rules).toEqual([]);
  });

  test("is marked mutating", () => {
    expect(tool("set_schedule_target").mutating).toBe(true);
  });
});

// ---- Task 23: manage_overrides ----

describe("manage_overrides", () => {
  test("action:create sends CreateUserOverrideInput", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ createUserOverride: { id: "ov1" } }));
    const r = await tool("manage_overrides").handler({ execute, paginate: vi.fn() } as any, {
      action: "create",
      scheduleID: "sc1",
      addUserID: "u2",
      removeUserID: "u1",
      start: "2026-06-10T00:00:00Z",
      end: "2026-06-11T00:00:00Z",
    });
    expect(execute.mock.calls[0]![1]).toMatchObject({
      input: {
        scheduleID: "sc1",
        addUserID: "u2",
        removeUserID: "u1",
        start: "2026-06-10T00:00:00Z",
        end: "2026-06-11T00:00:00Z",
      },
    });
    expect(r.structuredContent).toMatchObject({ id: "ov1" });
  });

  test("action:create with addUserID only (add-only override)", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ createUserOverride: { id: "ov2" } }));
    await tool("manage_overrides").handler({ execute, paginate: vi.fn() } as any, {
      action: "create",
      scheduleID: "sc1",
      addUserID: "u2",
      start: "2026-06-10T00:00:00Z",
      end: "2026-06-11T00:00:00Z",
    });
    const vars = execute.mock.calls[0]![1];
    expect(vars.input.addUserID).toBe("u2");
    expect(vars.input.removeUserID).toBeUndefined();
  });

  test("action:create throws when scheduleID/start/end missing", async () => {
    await expect(
      tool("manage_overrides").handler({ execute: vi.fn(), paginate: vi.fn() } as any, {
        action: "create",
        addUserID: "u2",
        start: "2026-06-10T00:00:00Z",
        end: "2026-06-11T00:00:00Z",
      })
    ).rejects.toThrow(/scheduleID/i);
  });

  test("action:create throws when no user IDs provided", async () => {
    await expect(
      tool("manage_overrides").handler({ execute: vi.fn(), paginate: vi.fn() } as any, {
        action: "create",
        scheduleID: "sc1",
        start: "2026-06-10T00:00:00Z",
        end: "2026-06-11T00:00:00Z",
      })
    ).rejects.toThrow(/addUserID.*removeUserID/i);
  });

  test("action:list paginates by scheduleID", async () => {
    const paginate = vi.fn(async (..._args: any[]) => ({ items: [{ id: "ov1" }], nextCursor: null, hasMore: false }));
    const r = await tool("manage_overrides").handler({ execute: vi.fn(), paginate } as any, {
      action: "list",
      scheduleID: "sc1",
    });
    const [op, vars] = paginate.mock.calls[0]!;
    expect(op).toContain("ListOverrides");
    expect(vars.input.scheduleID).toBe("sc1");
    expect(r.structuredContent).toMatchObject({ count: 1 });
  });

  test("action:list throws when scheduleID missing", async () => {
    await expect(
      tool("manage_overrides").handler({ execute: vi.fn(), paginate: vi.fn() } as any, { action: "list" })
    ).rejects.toThrow(/scheduleID/i);
  });

  test("action:update sends UpdateUserOverrideInput", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ updateUserOverride: true }));
    const r = await tool("manage_overrides").handler({ execute, paginate: vi.fn() } as any, {
      action: "update",
      overrideID: "ov1",
      start: "2026-06-12T00:00:00Z",
      end: "2026-06-13T00:00:00Z",
    });
    expect(execute.mock.calls[0]![1]).toMatchObject({
      input: { id: "ov1", start: "2026-06-12T00:00:00Z", end: "2026-06-13T00:00:00Z" },
    });
    expect(r.structuredContent).toMatchObject({ id: "ov1" });
  });

  test("action:update throws when overrideID missing", async () => {
    await expect(
      tool("manage_overrides").handler({ execute: vi.fn(), paginate: vi.fn() } as any, {
        action: "update",
        start: "2026-06-12T00:00:00Z",
      })
    ).rejects.toThrow(/overrideID/i);
  });

  test("is marked mutating", () => {
    expect(tool("manage_overrides").mutating).toBe(true);
  });
});

// ---- Task 24: manage_temporary_schedule ----

describe("manage_temporary_schedule", () => {
  test("action:set sends SetTemporaryScheduleInput with shifts", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ setTemporarySchedule: true }));
    const r = await tool("manage_temporary_schedule").handler({ execute, paginate: vi.fn() } as any, {
      action: "set",
      scheduleID: "sc1",
      start: "2026-06-10T00:00:00Z",
      end: "2026-06-11T00:00:00Z",
      shifts: [
        { userID: "u1", start: "2026-06-10T08:00:00Z", end: "2026-06-10T16:00:00Z" },
      ],
    });
    const vars = execute.mock.calls[0]![1];
    expect(vars.input.scheduleID).toBe("sc1");
    expect(vars.input.start).toBe("2026-06-10T00:00:00Z");
    expect(vars.input.end).toBe("2026-06-11T00:00:00Z");
    expect(vars.input.shifts).toHaveLength(1);
    expect(vars.input.shifts[0]).toMatchObject({ userID: "u1" });
    expect(r.structuredContent).toMatchObject({ shifts: 1 });
  });

  test("action:set throws when required fields missing", async () => {
    await expect(
      tool("manage_temporary_schedule").handler({ execute: vi.fn(), paginate: vi.fn() } as any, {
        action: "set",
        scheduleID: "sc1",
        start: "2026-06-10T00:00:00Z",
        // missing end and shifts
      })
    ).rejects.toThrow(/end.*shifts|shifts.*end/i);
  });

  test("action:clear sends ClearTemporarySchedulesInput", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ clearTemporarySchedules: true }));
    const r = await tool("manage_temporary_schedule").handler({ execute, paginate: vi.fn() } as any, {
      action: "clear",
      scheduleID: "sc1",
      start: "2026-06-10T00:00:00Z",
      end: "2026-06-11T00:00:00Z",
    });
    const vars = execute.mock.calls[0]![1];
    expect(vars.input.scheduleID).toBe("sc1");
    expect(vars.input.start).toBe("2026-06-10T00:00:00Z");
    expect(vars.input.end).toBe("2026-06-11T00:00:00Z");
    expect(r.structuredContent).toMatchObject({ scheduleID: "sc1" });
  });

  test("action:clear throws when start/end missing", async () => {
    await expect(
      tool("manage_temporary_schedule").handler({ execute: vi.fn(), paginate: vi.fn() } as any, {
        action: "clear",
        scheduleID: "sc1",
        start: "2026-06-10T00:00:00Z",
        // missing end
      })
    ).rejects.toThrow(/end/i);
  });

  test("is marked mutating", () => {
    expect(tool("manage_temporary_schedule").mutating).toBe(true);
  });
});
