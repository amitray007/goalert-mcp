import { z } from "zod";
import type { ToolDef } from "./types.js";
import { ok, listResult } from "../format.js";
import { LIST_ROTATIONS, GET_ROTATION, CREATE_ROTATION, UPDATE_ROTATION } from "../graphql/operations.js";

// ---- Task 25: Rotations read ----

const listRotations: ToolDef = {
  name: "list_rotations",
  description: "List rotations (search, favorites-first, cursor pagination).",
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
    const page = await client.paginate(LIST_ROTATIONS, { input }, (d: any) => d.rotations, max);
    return listResult("Rotations", page);
  },
};

const getRotation: ToolDef = {
  name: "get_rotation",
  description:
    "Get one rotation with its users, active user index, next handoff times, and shift configuration.",
  inputSchema: { id: z.string() },
  mutating: false,
  handler: async (client, args) => {
    const d = await client.execute<{ rotation: unknown }>(GET_ROTATION, { id: args.id });
    return ok("Rotation", d.rotation);
  },
};

// ---- Task 26: Rotations write ----

const createRotation: ToolDef = {
  name: "create_rotation",
  description:
    "Create a rotation. type ∈ hourly|daily|weekly|monthly; shiftLength is in units of type; userIDs is the ordered participant list.",
  inputSchema: {
    name: z.string(),
    description: z.string().optional(),
    timeZone: z.string().describe('IANA tz, e.g. "America/New_York".'),
    start: z.string().describe("RFC3339 start of the first shift."),
    type: z.enum(["hourly", "daily", "weekly", "monthly"]),
    shiftLength: z.number().int().min(1).optional().describe("Default 1."),
    userIDs: z.array(z.string()).optional(),
    favorite: z.boolean().optional(),
  },
  mutating: true,
  handler: async (client, args) => {
    const input: Record<string, unknown> = {
      name: args.name,
      timeZone: args.timeZone,
      start: args.start,
      type: args.type,
      shiftLength: args.shiftLength ?? 1,
    };
    if (args.description !== undefined) input.description = args.description;
    if (args.userIDs) input.userIDs = args.userIDs;
    if (args.favorite !== undefined) input.favorite = args.favorite;
    const d = await client.execute<{ createRotation: unknown }>(CREATE_ROTATION, { input });
    return ok("Rotation created", d.createRotation);
  },
};

const updateRotation: ToolDef = {
  name: "update_rotation",
  description:
    "Update a rotation. Set activeUserIndex to override who is currently on call (the rotation-level override — there is no separate rotation-override API). userIDs replaces the ordered participant list.",
  inputSchema: {
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    timeZone: z.string().optional(),
    start: z.string().optional(),
    type: z.enum(["hourly", "daily", "weekly", "monthly"]).optional(),
    shiftLength: z.number().int().min(1).optional(),
    userIDs: z.array(z.string()).optional(),
    activeUserIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Index into userIDs to make currently-active (advance/override)."),
  },
  mutating: true,
  handler: async (client, args) => {
    const input: Record<string, unknown> = { id: args.id };
    for (const k of [
      "name",
      "description",
      "timeZone",
      "start",
      "type",
      "shiftLength",
      "userIDs",
      "activeUserIndex",
    ] as const) {
      if (args[k] !== undefined) input[k] = args[k];
    }
    await client.execute(UPDATE_ROTATION, { input });
    return ok(`Rotation ${args.id} updated`, input);
  },
};

export const rotationTools: ToolDef[] = [listRotations, getRotation, createRotation, updateRotation];
