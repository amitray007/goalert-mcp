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

test("create_alert builds input incl meta", async () => {
  const execute = vi.fn(async (..._args: any[]) => ({ createAlert: { alertID: 9 } }));
  const r = await tool("create_alert").handler({ execute, paginate: vi.fn() } as any,
    { serviceID: "s1", summary: "Disk full", details: "x", dedup: "d", meta: { host: "db1" } });
  expect(execute.mock.calls[0]![1]).toMatchObject({ input: { serviceID: "s1", summary: "Disk full", meta: [{ key: "host", value: "db1" }] } });
});
test("manage_alerts ack by ids", async () => {
  const execute = vi.fn(async (..._args: any[]) => ({ updateAlerts: [] }));
  await tool("manage_alerts").handler({ execute, paginate: vi.fn() } as any, { action: "ack", alertIDs: [1, 2] });
  expect(execute.mock.calls[0]![1]).toEqual({ input: { alertIDs: [1, 2], newStatus: "StatusAcknowledged" } });
});
test("manage_alerts escalate uses escalateAlerts", async () => {
  const execute = vi.fn(async (..._args: any[]) => ({ escalateAlerts: [] }));
  await tool("manage_alerts").handler({ execute, paginate: vi.fn() } as any, { action: "escalate", alertIDs: [3] });
  expect(execute.mock.calls[0]![1]).toEqual({ ids: [3] });
});
test("manage_alerts close-all-for-service", async () => {
  const execute = vi.fn(async (..._args: any[]) => ({ updateAlertsByService: true }));
  await tool("manage_alerts").handler({ execute, paginate: vi.fn() } as any, { action: "close", serviceID: "s1" });
  expect(execute.mock.calls[0]![1]).toEqual({ input: { serviceID: "s1", newStatus: "StatusClosed" } });
});
test("manage_alerts requires alertIDs or serviceID", async () => {
  await expect(tool("manage_alerts").handler({ execute: vi.fn(), paginate: vi.fn() } as any, { action: "ack" }))
    .rejects.toThrow(/alertIDs or serviceID/i);
});
test("manage_alerts escalate with no target throws alertIDs or serviceID", async () => {
  await expect(tool("manage_alerts").handler({ execute: vi.fn(), paginate: vi.fn() } as any, { action: "escalate" }))
    .rejects.toThrow(/alertIDs or serviceID/i);
});
test("manage_alerts escalate with only serviceID throws escalate requires alertIDs", async () => {
  await expect(tool("manage_alerts").handler({ execute: vi.fn(), paginate: vi.fn() } as any, { action: "escalate", serviceID: "s1" }))
    .rejects.toThrow(/escalate requires alertIDs/i);
});
test("create_alert omits optional fields when only serviceID and summary given", async () => {
  const execute = vi.fn(async (..._args: any[]) => ({ createAlert: { alertID: 9 } }));
  await tool("create_alert").handler({ execute, paginate: vi.fn() } as any, { serviceID: "s1", summary: "Disk full" });
  expect(execute.mock.calls[0]![1]).toEqual({ input: { serviceID: "s1", summary: "Disk full" } });
});
