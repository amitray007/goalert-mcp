import { z } from "zod";
import type { ToolDef } from "./types.js";
import { ok, listResult } from "../format.js";
import { LIST_USERS, GET_USER } from "../graphql/operations.js";

// ---- Task 27: Users read (read-only tier — no writes) ----

const listUsers: ToolDef = {
  name: "list_users",
  description: "List users (search, cursor pagination). Read-only.",
  inputSchema: {
    search: z.string().optional(),
    first: z.number().int().min(1).max(100).optional(),
    after: z.string().optional(),
    all: z.boolean().optional(),
  },
  mutating: false,
  handler: async (client, args) => {
    const input: Record<string, unknown> = { first: args.first ?? 25, after: args.after };
    if (args.search) input.search = args.search;
    const max = args.all ? 200 : (args.first ?? 25);
    const page = await client.paginate(LIST_USERS, { input }, (d: any) => d.users, max);
    return listResult("Users", page);
  },
};

const getUser: ToolDef = {
  name: "get_user",
  description:
    "Get one user with their contact methods (dest type + args), and on-call overview (services and assignments). Read-only.",
  inputSchema: { id: z.string() },
  mutating: false,
  handler: async (client, args) => {
    const d = await client.execute<{ user: unknown }>(GET_USER, { id: args.id });
    return ok("User", d.user);
  },
};

export const userTools: ToolDef[] = [listUsers, getUser];
