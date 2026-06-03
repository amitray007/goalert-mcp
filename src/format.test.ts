import { describe, expect, test } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ok, listResult } from "./format.js";

// CallToolResult.content is a union; narrow to the text block for assertions.
function firstText(r: CallToolResult): { type: string; text: string } {
  const block = r.content[0] as { type: string; text: string };
  return block;
}

describe("format", () => {
  test("ok returns text summary + json and structuredContent", () => {
    const r = ok("Found service", { id: "1", name: "API" });
    expect(firstText(r).type).toBe("text");
    expect(firstText(r).text).toContain("Found service");
    expect(firstText(r).text).toContain('"name": "API"');
    expect(r.structuredContent).toEqual({ id: "1", name: "API" });
    expect(r.isError).toBeUndefined();
  });

  test("ok wraps array data as { result } so structuredContent stays a record", () => {
    const r = ok("Alerts updated", [{ alertID: 1 }, { alertID: 2 }]);
    // MCP requires structuredContent to be an object, not an array.
    expect(Array.isArray(r.structuredContent)).toBe(false);
    expect(r.structuredContent).toEqual({ result: [{ alertID: 1 }, { alertID: 2 }] });
    // The raw array is still shown in the text block.
    expect(firstText(r).text).toContain('"alertID": 2');
  });

  test("listResult summarizes counts and pagination", () => {
    const r = listResult("Services", { items: [{ id: "1" }], nextCursor: "c", hasMore: true });
    expect(firstText(r).text).toContain("1 item");
    expect(firstText(r).text).toContain("more available");
    expect(r.structuredContent).toMatchObject({ count: 1, hasMore: true, nextCursor: "c" });
  });
});
