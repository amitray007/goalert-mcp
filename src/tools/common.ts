import { z } from "zod";
import { parse, Kind, type OperationDefinitionNode } from "graphql";
import type { ToolDef } from "./types.js";
import { ok } from "../format.js";
import { GoAlertError } from "../client/errors.js";
import { DELETE_ALL, SET_FAVORITE, SET_LABEL } from "../graphql/operations.js";

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

// Operator-scoped subset of GoAlert's TargetType enum (verified via live
// introspection). No user-account targets; no non-existent enum values.
const TARGET_TYPES = ["service", "schedule", "rotation", "escalationPolicy", "integrationKey", "heartbeatMonitor", "userOverride", "calendarSubscription"] as const;

const deleteResource: ToolDef = {
  name: "goalert_delete",
  description:
    "Delete one or more GoAlert resources of a single type by ID (uses deleteAll). Covers services, schedules, rotations, escalation policies, integration keys, heartbeat monitors, user overrides, and calendar subscriptions. (Escalation-policy STEPS are not deletable here — they're removed via update_escalation_policy stepIDs, coming in a later phase.) Requires confirm:true.",
  inputSchema: {
    type: z.enum(TARGET_TYPES).describe("The resource type to delete."),
    ids: z.array(z.string()).min(1).describe("IDs of resources of that type."),
    confirm: z.literal(true).describe("Must be true to actually delete."),
  },
  mutating: true,
  destructive: true,
  handler: async (client, args) => {
    if (args.confirm !== true) throw new GoAlertError("Refusing to delete without confirm:true");
    const input = args.ids.map((id: string) => ({ type: args.type, id }));
    await client.execute(DELETE_ALL, { input });
    return ok(`Deleted ${args.ids.length} ${args.type}(s)`, { type: args.type, ids: args.ids });
  },
};

const FAVORITABLE = ["service", "schedule", "rotation", "user"] as const;

const setFavorite: ToolDef = {
  name: "goalert_set_favorite",
  description: "Mark a service, schedule, rotation, or user as favorite (or unfavorite).",
  inputSchema: {
    type: z.enum(FAVORITABLE),
    id: z.string(),
    favorite: z.boolean(),
  },
  mutating: true,
  handler: async (client, args) => {
    await client.execute(SET_FAVORITE, { input: { target: { type: args.type, id: args.id }, favorite: args.favorite } });
    return ok(`${args.favorite ? "Favorited" : "Unfavorited"} ${args.type} ${args.id}`, { type: args.type, id: args.id, favorite: args.favorite });
  },
};

const setLabel: ToolDef = {
  name: "goalert_set_label",
  description: "Set or remove a key/value label on a target (usually a service). An empty value deletes the label.",
  inputSchema: {
    type: z.enum(["service"]).describe("Currently only service labels are supported."),
    id: z.string(),
    key: z.string(),
    value: z.string().describe("Label value; empty string deletes the label."),
  },
  mutating: true,
  handler: async (client, args) => {
    await client.execute(SET_LABEL, { input: { target: { type: args.type, id: args.id }, key: args.key, value: args.value } });
    return ok(`Set label ${args.key} on ${args.type} ${args.id}`, { key: args.key, value: args.value });
  },
};

export const commonTools: ToolDef[] = [graphqlQuery, deleteResource, setFavorite, setLabel];
