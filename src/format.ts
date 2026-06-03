import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Page } from "./client/graphql.js";

export function ok(summary: string, data: unknown): CallToolResult {
  // MCP requires `structuredContent` to be a JSON object (a "record"). Arrays
  // and primitives are wrapped as { result: data } so tools that return a list
  // (e.g. updateAlerts -> [Alert!]) or a scalar still produce a valid result.
  const structuredContent =
    data !== null && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : { result: data };
  return {
    content: [{ type: "text", text: `${summary}\n\n${JSON.stringify(data, null, 2)}` }],
    structuredContent,
  };
}

export function listResult<T>(summary: string, page: Page<T>): CallToolResult {
  const more = page.hasMore ? ` (more available — pass after: "${page.nextCursor}")` : "";
  const text = `${summary}: ${page.items.length} item${page.items.length === 1 ? "" : "s"}${more}\n\n${JSON.stringify(page.items, null, 2)}`;
  return {
    content: [{ type: "text", text }],
    structuredContent: { count: page.items.length, hasMore: page.hasMore, nextCursor: page.nextCursor, items: page.items },
  };
}
