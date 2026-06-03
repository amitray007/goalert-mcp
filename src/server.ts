import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createAuthenticator } from "./client/auth.js";
import { createClient } from "./client/graphql.js";
import { registerTools } from "./tools/registry.js";
import type { ToolDef } from "./tools/types.js";
import { commonTools } from "./tools/common.js";
import { alertTools } from "./tools/alerts.js";
import { onCallTools } from "./tools/oncall.js";
import { serviceTools } from "./tools/services.js";
import { escalationTools } from "./tools/escalation.js";

export function allToolDefs(): ToolDef[] {
  return [...commonTools, ...alertTools, ...onCallTools, ...serviceTools, ...escalationTools];
}

export async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const auth = createAuthenticator(config);
  const client = createClient(config, auth);

  const server = new McpServer({ name: "goalert-mcp", version: "0.1.0" });
  registerTools(server, client, config, allToolDefs());

  await server.connect(new StdioServerTransport());
}
