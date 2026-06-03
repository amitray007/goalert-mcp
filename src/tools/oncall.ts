import { z } from "zod";
import type { ToolDef } from "./types.js";
import { ok } from "../format.js";
import { GoAlertError } from "../client/errors.js";
import { ONCALL_BY_SERVICE, ONCALL_BY_SCHEDULE, ONCALL_BY_USER } from "../graphql/operations.js";

const getOnCall: ToolDef = {
  name: "get_on_call",
  description:
    "Report who is on call. Provide exactly one of: serviceID (current on-call users), scheduleID (+ start/end window for shifts), or userID (their on-call overview).",
  inputSchema: {
    serviceID: z.string().optional(),
    scheduleID: z.string().optional(),
    userID: z.string().optional(),
    start: z.string().optional().describe("RFC3339 start (required with scheduleID)."),
    end: z.string().optional().describe("RFC3339 end (required with scheduleID)."),
  },
  mutating: false,
  handler: async (client, args) => {
    const targets = [args.serviceID, args.scheduleID, args.userID].filter(Boolean);
    if (targets.length !== 1) throw new GoAlertError("Provide exactly one of: serviceID, scheduleID, userID");
    if (args.serviceID) {
      const d = await client.execute<{ service: unknown }>(ONCALL_BY_SERVICE, { id: args.serviceID });
      return ok("On call (service)", d.service);
    }
    if (args.scheduleID) {
      if (!args.start || !args.end) throw new GoAlertError("scheduleID requires start and end (RFC3339)");
      const d = await client.execute<{ schedule: unknown }>(ONCALL_BY_SCHEDULE, { id: args.scheduleID, start: args.start, end: args.end });
      return ok("On call (schedule)", d.schedule);
    }
    const d = await client.execute<{ user: unknown }>(ONCALL_BY_USER, { id: args.userID });
    return ok("On call (user overview)", d.user);
  },
};

export const onCallTools: ToolDef[] = [getOnCall];
