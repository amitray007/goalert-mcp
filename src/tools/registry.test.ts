import { describe, expect, test, vi } from "vitest";
import { registerTools } from "./registry.js";
import type { ToolDef } from "./types.js";
import { GoAlertError } from "../client/errors.js";
import { z } from "zod";

function fakeServer() {
  const registered: any[] = [];
  return {
    registered,
    registerTool: vi.fn((name: string, def: any, handler: any) => registered.push({ name, def, handler })),
  };
}

const defs: ToolDef[] = [
  { name: "read_thing", description: "r", inputSchema: {}, mutating: false, handler: async () => ({ content: [] }) },
  { name: "write_thing", description: "w", inputSchema: { id: z.string() }, mutating: true, destructive: true, handler: async () => ({ content: [] }) },
];

describe("registerTools", () => {
  test("registers all tools with annotations when not read-only", () => {
    const s = fakeServer();
    registerTools(s as any, {} as any, { readOnly: false } as any, defs);
    expect(s.registered).toHaveLength(2);
    expect(s.registered[0].def.annotations.readOnlyHint).toBe(true);
    expect(s.registered[1].def.annotations.destructiveHint).toBe(true);
  });

  test("omits mutating tools when read-only", () => {
    const s = fakeServer();
    registerTools(s as any, {} as any, { readOnly: true } as any, defs);
    expect(s.registered.map((r) => r.name)).toEqual(["read_thing"]);
  });

  test("wraps a thrown GoAlertError into an isError result with code and path", async () => {
    const s = fakeServer();
    const failing: ToolDef[] = [
      {
        name: "boom_thing",
        description: "b",
        inputSchema: {},
        mutating: false,
        handler: async () => {
          throw new GoAlertError("boom", "INVALID_INPUT_VALUE", ["createService", "name"]);
        },
      },
    ];
    registerTools(s as any, {} as any, { readOnly: false } as any, failing);
    const result = await s.registered[0].handler({});
    expect(result.isError).toBe(true);
    const text = result.content[0].text as string;
    expect(text).toContain("boom");
    expect(text).toContain("code=INVALID_INPUT_VALUE");
    expect(text).toContain("path=createService.name");
  });

  test("normalizes a non-Error rejection without throwing from the catch", async () => {
    const s = fakeServer();
    const failing: ToolDef[] = [
      {
        name: "weird_throw",
        description: "w",
        inputSchema: {},
        mutating: false,
        handler: async () => {
          throw "just a string"; // eslint-disable-line no-throw-literal
        },
      },
    ];
    registerTools(s as any, {} as any, { readOnly: false } as any, failing);
    const result = await s.registered[0].handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text as string).toContain("just a string");
  });
});
