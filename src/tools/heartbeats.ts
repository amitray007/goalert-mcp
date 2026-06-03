import { z } from "zod";
import type { ToolDef } from "./types.js";
import { ok } from "../format.js";
import { GoAlertError } from "../client/errors.js";
import { CREATE_HEARTBEAT, UPDATE_HEARTBEAT } from "../graphql/operations.js";

// ---- Task 29: manage_heartbeat_monitors ----

const manageHeartbeatMonitors: ToolDef = {
  name: "manage_heartbeat_monitors",
  description:
    "Create or update a heartbeat monitor for a service. Returns the check-in href (the URL the monitored service must ping). Delete a monitor via goalert_delete type 'heartbeatMonitor'.",
  inputSchema: {
    action: z.enum(["create", "update"]),
    // create fields
    serviceID: z.string().optional().describe("Required for create."),
    name: z.string().optional().describe("Required for create."),
    timeoutMinutes: z.number().int().min(1).optional().describe("Required for create; update can change it."),
    additionalDetails: z.string().optional().describe("Optional extra context shown in alerts."),
    // update fields
    id: z.string().optional().describe("Required for update (heartbeat monitor ID)."),
  },
  mutating: true,
  handler: async (client, args) => {
    if (args.action === "create") {
      if (!args.serviceID) throw new GoAlertError("create requires serviceID");
      if (!args.name) throw new GoAlertError("create requires name");
      if (args.timeoutMinutes === undefined) throw new GoAlertError("create requires timeoutMinutes");

      const input: Record<string, unknown> = {
        serviceID: args.serviceID,
        name: args.name,
        timeoutMinutes: args.timeoutMinutes,
      };
      if (args.additionalDetails !== undefined) input.additionalDetails = args.additionalDetails;

      const d = await client.execute<{ createHeartbeatMonitor: unknown }>(CREATE_HEARTBEAT, { input });
      return ok("Heartbeat monitor created", d.createHeartbeatMonitor);
    }

    // action === "update"
    if (!args.id) throw new GoAlertError("update requires id");

    const input: Record<string, unknown> = { id: args.id };
    for (const k of ["name", "timeoutMinutes", "additionalDetails"] as const) {
      if (args[k] !== undefined) input[k] = args[k];
    }
    await client.execute(UPDATE_HEARTBEAT, { input });
    return ok(`Heartbeat monitor ${args.id} updated`, input);
  },
};

export const heartbeatTools: ToolDef[] = [manageHeartbeatMonitors];
