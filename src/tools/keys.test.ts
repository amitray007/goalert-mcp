import { describe, expect, test, vi } from "vitest";
import { keyTools } from "./keys.js";

const tool = (n: string) => keyTools.find((t) => t.name === n)!;

// ---- Task 28: manage_integration_keys ----

describe("manage_integration_keys", () => {
  test("action:create builds input with serviceID, name, type and returns key including href", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({
      createIntegrationKey: { id: "k1", name: "Grafana", type: "grafana", href: "https://goalert.example.com/api/v2/grafana/k1" },
    }));
    const r = await tool("manage_integration_keys").handler({ execute, paginate: vi.fn() } as any, {
      action: "create",
      serviceID: "s1",
      name: "Grafana",
      type: "grafana",
    });
    expect(execute.mock.calls[0]![1]).toMatchObject({
      input: { serviceID: "s1", name: "Grafana", type: "grafana" },
    });
    const content = r.structuredContent as any;
    expect(content.href).toContain("grafana");
  });

  test("action:create with generic type", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({
      createIntegrationKey: { id: "k2", name: "Generic", type: "generic", href: "https://goalert.example.com/api/v2/generic/k2" },
    }));
    await tool("manage_integration_keys").handler({ execute, paginate: vi.fn() } as any, {
      action: "create",
      serviceID: "s1",
      name: "Generic",
      type: "generic",
    });
    expect(execute.mock.calls[0]![1].input).toMatchObject({ type: "generic" });
  });

  test("action:create requires serviceID, name, type", async () => {
    const { GoAlertError } = await import("../client/errors.js");
    await expect(
      tool("manage_integration_keys").handler({ execute: vi.fn(), paginate: vi.fn() } as any, {
        action: "create",
        name: "Missing",
        type: "generic",
      })
    ).rejects.toThrow(/serviceID/i);
  });

  test("action:list returns service integrationKeys", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({
      service: {
        integrationKeys: [
          { id: "k1", name: "Grafana", type: "grafana", href: "https://goalert.example.com/api/v2/grafana/k1" },
        ],
      },
    }));
    const r = await tool("manage_integration_keys").handler({ execute, paginate: vi.fn() } as any, {
      action: "list",
      serviceID: "s1",
    });
    expect(execute.mock.calls[0]![1]).toEqual({ serviceID: "s1" });
    const content = r.structuredContent as any;
    expect(content.result).toHaveLength(1);
    expect(content.result[0]).toMatchObject({ id: "k1", type: "grafana" });
  });

  test("action:list requires serviceID", async () => {
    await expect(
      tool("manage_integration_keys").handler({ execute: vi.fn(), paginate: vi.fn() } as any, {
        action: "list",
      })
    ).rejects.toThrow(/serviceID/i);
  });

  test("is marked mutating", () => {
    expect(tool("manage_integration_keys").mutating).toBe(true);
  });
});
