import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Page } from "./client/graphql.js";

export function ok(summary: string, data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: `${summary}\n\n${JSON.stringify(data, null, 2)}` }],
    structuredContent: data as Record<string, unknown>,
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
