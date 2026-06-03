import type { ZodRawShape } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { GoAlertClient } from "../client/graphql.js";

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  mutating: boolean;
  destructive?: boolean;
  handler: (client: GoAlertClient, args: any) => Promise<CallToolResult>;
}
