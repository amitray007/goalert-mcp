import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GoAlertConfig } from "../config.js";
import type { GoAlertClient } from "../client/graphql.js";
import { GoAlertError } from "../client/errors.js";
import type { ToolDef } from "./types.js";

export function registerTools(server: McpServer, client: GoAlertClient, config: GoAlertConfig, defs: ToolDef[]): void {
  for (const def of defs) {
    if (def.mutating && config.readOnly) continue;
    server.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: def.inputSchema,
        annotations: { readOnlyHint: !def.mutating, destructiveHint: Boolean(def.destructive) },
      },
      async (args: unknown) => {
        try {
          return await def.handler(client, args);
        } catch (err) {
          // Normalize first: a thrown non-Error (string, undefined, etc.) must
          // not make the catch itself throw a TypeError that escapes.
          const e = (err instanceof Error ? err : new Error(String(err))) as GoAlertError;
          const detail = [e.message, e.code && `code=${e.code}`, e.path && `path=${e.path.join(".")}`]
            .filter(Boolean).join(" | ");
          return { isError: true, content: [{ type: "text", text: `GoAlert error: ${detail}` }] };
        }
      },
    );
  }
}
