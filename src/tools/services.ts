import { z } from "zod";
import type { ToolDef } from "./types.js";
import { ok, listResult } from "../format.js";
import { LIST_SERVICES, GET_SERVICE, CREATE_SERVICE, UPDATE_SERVICE } from "../graphql/operations.js";

const listServices: ToolDef = {
  name: "list_services",
  description: "List services (search, favorites-first, cursor pagination).",
  inputSchema: {
    search: z.string().optional(),
    first: z.number().int().min(1).max(100).optional(),
    after: z.string().optional(),
    favoritesFirst: z.boolean().optional(),
    all: z.boolean().optional(),
  },
  mutating: false,
  handler: async (client, args) => {
    const input: Record<string, unknown> = { first: args.first ?? 25, after: args.after };
    if (args.search) input.search = args.search;
    if (args.favoritesFirst) input.favoritesFirst = true;
    const max = args.all ? 200 : (args.first ?? 25);
    const page = await client.paginate(LIST_SERVICES, { input }, (d: any) => d.services, max);
    return listResult("Services", page);
  },
};

const getService: ToolDef = {
  name: "get_service",
  description: "Get one service with its escalation policy, on-call users, labels, integration keys, and heartbeat monitors.",
  inputSchema: { id: z.string() },
  mutating: false,
  handler: async (client, args) => {
    const d = await client.execute<{ service: unknown }>(GET_SERVICE, { id: args.id });
    return ok("Service", d.service);
  },
};

const createService: ToolDef = {
  name: "create_service",
  description: "Create a service. Requires a name; usually an escalationPolicyID. Optionally seed labels.",
  inputSchema: {
    name: z.string(),
    description: z.string().optional(),
    escalationPolicyID: z.string().optional(),
    favorite: z.boolean().optional(),
  },
  mutating: true,
  handler: async (client, args) => {
    const input: Record<string, unknown> = { name: args.name };
    if (args.description !== undefined) input.description = args.description;
    if (args.escalationPolicyID) input.escalationPolicyID = args.escalationPolicyID;
    if (args.favorite !== undefined) input.favorite = args.favorite;
    const d = await client.execute<{ createService: unknown }>(CREATE_SERVICE, { input });
    return ok("Service created", d.createService);
  },
};

const updateService: ToolDef = {
  name: "update_service",
  description:
    "Update a service's name, description, escalation policy, or maintenance window. maintenanceExpiresAt (RFC3339) puts the service in maintenance until that time.",
  inputSchema: {
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    escalationPolicyID: z.string().optional(),
    maintenanceExpiresAt: z.string().optional().describe("RFC3339 timestamp; service is in maintenance until then."),
  },
  mutating: true,
  handler: async (client, args) => {
    const input: Record<string, unknown> = { id: args.id };
    for (const k of ["name", "description", "escalationPolicyID", "maintenanceExpiresAt"] as const) {
      if (args[k] !== undefined) input[k] = args[k];
    }
    await client.execute(UPDATE_SERVICE, { input });
    return ok(`Service ${args.id} updated`, input);
  },
};

export const serviceTools: ToolDef[] = [listServices, getService, createService, updateService];
