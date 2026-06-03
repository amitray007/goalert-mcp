import { describe, expect, test, vi } from "vitest";
import { heartbeatTools } from "./heartbeats.js";

const tool = (n: string) => heartbeatTools.find((t) => t.name === n)!;

// ---- Task 29: manage_heartbeat_monitors ----

describe("manage_heartbeat_monitors", () => {
  test("action:create builds input with serviceID, name, timeoutMinutes and surfaces href", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({
      createHeartbeatMonitor: {
        id: "hb1",
        name: "API Check",
        timeoutMinutes: 5,
        href: "https://goalert.example.com/api/v2/heartbeat/hb1",
      },
    }));
    const r = await tool("manage_heartbeat_monitors").handler({ execute, paginate: vi.fn() } as any, {
      action: "create",
      serviceID: "s1",
      name: "API Check",
      timeoutMinutes: 5,
    });
    expect(execute.mock.calls[0]![1]).toMatchObject({
      input: { serviceID: "s1", name: "API Check", timeoutMinutes: 5 },
    });
    const content = r.structuredContent as any;
    expect(content.href).toContain("heartbeat");
  });

  test("action:create with additionalDetails", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({
      createHeartbeatMonitor: { id: "hb2", name: "DB Check", timeoutMinutes: 10, href: "https://goalert.example.com/hb2" },
    }));
    await tool("manage_heartbeat_monitors").handler({ execute, paginate: vi.fn() } as any, {
      action: "create",
      serviceID: "s1",
      name: "DB Check",
      timeoutMinutes: 10,
      additionalDetails: "Checks DB connectivity",
    });
    expect(execute.mock.calls[0]![1].input).toMatchObject({
      additionalDetails: "Checks DB connectivity",
    });
  });

  test("action:create requires serviceID", async () => {
    await expect(
      tool("manage_heartbeat_monitors").handler({ execute: vi.fn(), paginate: vi.fn() } as any, {
        action: "create",
        name: "API Check",
        timeoutMinutes: 5,
      })
    ).rejects.toThrow(/serviceID/i);
  });

  test("action:create requires name and timeoutMinutes", async () => {
    await expect(
      tool("manage_heartbeat_monitors").handler({ execute: vi.fn(), paginate: vi.fn() } as any, {
        action: "create",
        serviceID: "s1",
        timeoutMinutes: 5,
      })
    ).rejects.toThrow(/name/i);
  });

  test("action:update sends id and changed fields", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ updateHeartbeatMonitor: true }));
    const r = await tool("manage_heartbeat_monitors").handler({ execute, paginate: vi.fn() } as any, {
      action: "update",
      id: "hb1",
      timeoutMinutes: 15,
    });
    expect(execute.mock.calls[0]![1]).toMatchObject({
      input: { id: "hb1", timeoutMinutes: 15 },
    });
    expect(r.structuredContent).toMatchObject({ id: "hb1" });
  });

  test("action:update requires id", async () => {
    await expect(
      tool("manage_heartbeat_monitors").handler({ execute: vi.fn(), paginate: vi.fn() } as any, {
        action: "update",
        timeoutMinutes: 10,
      })
    ).rejects.toThrow(/id/i);
  });

  test("is marked mutating", () => {
    expect(tool("manage_heartbeat_monitors").mutating).toBe(true);
  });
});
