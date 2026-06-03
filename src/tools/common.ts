import { z } from "zod";
import type { ToolDef } from "./types.js";
import { ok } from "../format.js";
import { GoAlertError } from "../client/errors.js";

function assertReadOnly(query: string): void {
  // Strip comments, then ensure no top-level mutation/subscription operation.
  const stripped = query.replace(/#[^\n]*/g, "");
  if (/(^|\}|\s)\b(mutation|subscription)\b\s*[\w({]/.test(stripped) || /^\s*(mutation|subscription)\b/.test(stripped)) {
    throw new GoAlertError("goalert_graphql_query is read-only: mutations and subscriptions are not allowed. Use a dedicated write tool.");
  }
}

const graphqlQuery: ToolDef = {
  name: "goalert_graphql_query",
  description:
    "Run an arbitrary read-only GraphQL query against GoAlert's /api/graphql. Use this for reads not covered by a dedicated tool. Mutations/subscriptions are rejected. Pass `query` and optional `variables`.",
  inputSchema: {
    query: z.string().describe("A GraphQL query document (no mutations)."),
    variables: z.record(z.unknown()).optional().describe("Variables for the query."),
  },
  mutating: false,
  handler: async (client, args: { query: string; variables?: Record<string, unknown> }) => {
    assertReadOnly(args.query);
    const data = await client.execute(args.query, args.variables ?? {});
    return ok("GraphQL query result", data);
  },
};

export const commonTools: ToolDef[] = [graphqlQuery];
