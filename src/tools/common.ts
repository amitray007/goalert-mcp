import { z } from "zod";
import { parse, Kind, type OperationDefinitionNode } from "graphql";
import type { ToolDef } from "./types.js";
import { ok } from "../format.js";
import { GoAlertError } from "../client/errors.js";

function assertReadOnly(query: string): void {
  // Parse the document properly: a regex can't distinguish a real `mutation`
  // operation from the word "mutation" appearing inside a string literal or as
  // a field name, and it can be bypassed by hiding a second operation behind a
  // string that looks like a comment.
  let doc;
  try {
    doc = parse(query);
  } catch (e) {
    throw new GoAlertError("Invalid GraphQL query: " + (e as Error).message);
  }

  const operations = doc.definitions.filter(
    (d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION,
  );

  if (operations.length === 0) {
    throw new GoAlertError("No GraphQL operation found; provide a single read-only query.");
  }
  if (operations.length > 1) {
    throw new GoAlertError("Provide a single query operation; multiple operations are not allowed.");
  }
  if (operations[0]!.operation !== "query") {
    throw new GoAlertError(
      "goalert_graphql_query is read-only: only `query` operations are allowed (not mutation/subscription). Use a dedicated write tool.",
    );
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
