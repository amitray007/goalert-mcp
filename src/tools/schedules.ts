import { z } from "zod";
import type { ToolDef } from "./types.js";
import { ok, listResult } from "../format.js";
import { GoAlertError } from "../client/errors.js";
import {
  LIST_SCHEDULES,
  GET_SCHEDULE,
  CREATE_SCHEDULE,
  UPDATE_SCHEDULE,
  UPDATE_SCHEDULE_TARGET,
  CREATE_OVERRIDE,
  UPDATE_OVERRIDE,
  LIST_OVERRIDES,
  SET_TEMP_SCHED,
  CLEAR_TEMP_SCHED,
} from "../graphql/operations.js";

// ---- Task 21: Schedules read ----

const listSchedules: ToolDef = {
  name: "list_schedules",
  description: "List schedules (search, favorites-first, cursor pagination).",
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
    const page = await client.paginate(LIST_SCHEDULES, { input }, (d: any) => d.schedules, max);
    return listResult("Schedules", page);
  },
};

const getSchedule: ToolDef = {
  name: "get_schedule",
  description:
    "Get one schedule with its targets (rotation/user assignments), rules, on-call shifts for the next 7 days, and temporary schedules. Optionally pass start/end (ISO8601) to override the default 7-day window.",
  inputSchema: {
    id: z.string(),
    start: z.string().optional().describe("ISO8601 timestamp; defaults to now."),
    end: z.string().optional().describe("ISO8601 timestamp; defaults to now+7d."),
  },
  mutating: false,
  handler: async (client, args) => {
    const start = args.start ?? new Date().toISOString();
    const end = args.end ?? new Date(Date.now() + 7 * 864e5).toISOString();
    const d = await client.execute<{ schedule: unknown }>(GET_SCHEDULE, { id: args.id, start, end });
    return ok("Schedule", d.schedule);
  },
};

// ---- Task 22: Schedules write ----

const createSchedule: ToolDef = {
  name: "create_schedule",
  description: "Create a schedule. Requires name and timeZone (IANA, e.g. 'America/New_York').",
  inputSchema: {
    name: z.string(),
    description: z.string().optional(),
    timeZone: z.string().describe('IANA timezone, e.g. "America/New_York".'),
    favorite: z.boolean().optional(),
  },
  mutating: true,
  handler: async (client, args) => {
    const input: Record<string, unknown> = { name: args.name, timeZone: args.timeZone };
    if (args.description !== undefined) input.description = args.description;
    if (args.favorite !== undefined) input.favorite = args.favorite;
    const d = await client.execute<{ createSchedule: unknown }>(CREATE_SCHEDULE, { input });
    return ok("Schedule created", d.createSchedule);
  },
};

const updateSchedule: ToolDef = {
  name: "update_schedule",
  description: "Update a schedule's name, description, or timeZone. To assign targets or set rules, use set_schedule_target.",
  inputSchema: {
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    timeZone: z.string().optional(),
  },
  mutating: true,
  handler: async (client, args) => {
    const input: Record<string, unknown> = { id: args.id };
    for (const k of ["name", "description", "timeZone"] as const) {
      if (args[k] !== undefined) input[k] = args[k];
    }
    await client.execute(UPDATE_SCHEDULE, { input });
    return ok(`Schedule ${args.id} updated`, input);
  },
};

const setScheduleTarget: ToolDef = {
  name: "set_schedule_target",
  description:
    "Assign a rotation or user to a schedule with time rules (or update/clear an existing assignment). target is the assignee; rules define when they're on call. An empty rules array removes the assignment.",
  inputSchema: {
    scheduleID: z.string(),
    targetType: z.enum(["rotation", "user"]),
    targetID: z.string(),
    rules: z
      .array(
        z.object({
          start: z.string().describe('Clock time "HH:MM".'),
          end: z.string().describe('Clock time "HH:MM".'),
          weekdayFilter: z
            .array(z.boolean())
            .length(7)
            .describe("7 booleans, index 0 = Sunday."),
        })
      )
      .describe("Empty array removes the assignment."),
  },
  mutating: true,
  handler: async (client, args) => {
    await client.execute(UPDATE_SCHEDULE_TARGET, {
      input: {
        scheduleID: args.scheduleID,
        target: { type: args.targetType, id: args.targetID },
        rules: args.rules,
      },
    });
    return ok(`Schedule ${args.scheduleID} target ${args.targetID} updated`, { rules: args.rules.length });
  },
};

// ---- Task 23: manage_overrides ----

const manageOverrides: ToolDef = {
  name: "manage_overrides",
  description:
    "Create, update, or list schedule overrides. Overrides are schedule-scoped: addUserID adds a user, removeUserID removes one, both = replace removeUserID with addUserID for the window. This is how you override who is on call (including someone scheduled via a rotation) for a time range. Delete an override via goalert_delete type 'userOverride'.",
  inputSchema: {
    action: z.enum(["create", "update", "list"]),
    scheduleID: z.string().optional().describe("Required for create and list."),
    overrideID: z.string().optional().describe("Required for update."),
    addUserID: z.string().optional(),
    removeUserID: z.string().optional(),
    start: z.string().optional().describe("RFC3339; required for create."),
    end: z.string().optional().describe("RFC3339; required for create."),
  },
  mutating: true,
  handler: async (client, args) => {
    if (args.action === "list") {
      if (!args.scheduleID) throw new GoAlertError("list requires scheduleID");
      const page = await client.paginate(
        LIST_OVERRIDES,
        { input: { scheduleID: args.scheduleID, first: 50 } },
        (d: any) => d.userOverrides,
        200
      );
      return listResult("Overrides", page);
    }
    if (args.action === "create") {
      if (!args.scheduleID || !args.start || !args.end)
        throw new GoAlertError("create requires scheduleID, start, end");
      if (!args.addUserID && !args.removeUserID)
        throw new GoAlertError("create requires addUserID and/or removeUserID");
      const input: Record<string, unknown> = {
        scheduleID: args.scheduleID,
        start: args.start,
        end: args.end,
      };
      if (args.addUserID !== undefined) input.addUserID = args.addUserID;
      if (args.removeUserID !== undefined) input.removeUserID = args.removeUserID;
      const d = await client.execute<{ createUserOverride: { id: string } }>(CREATE_OVERRIDE, { input });
      return ok("Override created", d.createUserOverride);
    }
    // action === "update"
    if (!args.overrideID) throw new GoAlertError("update requires overrideID");
    const input: Record<string, unknown> = { id: args.overrideID };
    for (const k of ["start", "end", "addUserID", "removeUserID"] as const) {
      if (args[k] !== undefined) input[k] = args[k];
    }
    await client.execute(UPDATE_OVERRIDE, { input });
    return ok(`Override ${args.overrideID} updated`, input);
  },
};

// ---- Task 24: manage_temporary_schedule ----

const manageTemporarySchedule: ToolDef = {
  name: "manage_temporary_schedule",
  description:
    "Set or clear a temporary schedule window. 'set' replaces the schedule's normal on-call for the given window with the provided shifts (each shift needs userID, start, end as ISO8601). 'clear' removes any temporary schedules overlapping the given window.",
  inputSchema: {
    action: z.enum(["set", "clear"]),
    scheduleID: z.string(),
    start: z.string().describe("ISO8601 start of the window."),
    end: z.string().optional().describe("ISO8601 end of the window; required."),
    shifts: z
      .array(
        z.object({
          userID: z.string(),
          start: z.string().describe("ISO8601 shift start."),
          end: z.string().describe("ISO8601 shift end."),
        })
      )
      .optional()
      .describe("Required for action 'set'."),
  },
  mutating: true,
  handler: async (client, args) => {
    if (args.action === "set") {
      if (!args.end || !args.shifts)
        throw new GoAlertError("set requires end and shifts");
      await client.execute(SET_TEMP_SCHED, {
        input: {
          scheduleID: args.scheduleID,
          start: args.start,
          end: args.end,
          shifts: args.shifts,
        },
      });
      return ok(`Temporary schedule set for ${args.scheduleID}`, { scheduleID: args.scheduleID, shifts: args.shifts.length });
    }
    // action === "clear"
    if (!args.end) throw new GoAlertError("clear requires end");
    await client.execute(CLEAR_TEMP_SCHED, {
      input: {
        scheduleID: args.scheduleID,
        start: args.start,
        end: args.end,
      },
    });
    return ok(`Temporary schedule cleared for ${args.scheduleID}`, { scheduleID: args.scheduleID });
  },
};

export const scheduleTools: ToolDef[] = [
  listSchedules,
  getSchedule,
  createSchedule,
  updateSchedule,
  setScheduleTarget,
  manageOverrides,
  manageTemporarySchedule,
];
