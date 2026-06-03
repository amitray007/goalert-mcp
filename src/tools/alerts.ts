import { z } from "zod";
import type { ToolDef } from "./types.js";
import { ok, listResult } from "../format.js";
import { LIST_ALERTS, GET_ALERT, CREATE_ALERT, UPDATE_ALERTS, ESCALATE_ALERTS, CLOSE_BY_SERVICE } from "../graphql/operations.js";
import { GoAlertError } from "../client/errors.js";

const STATUS_MAP = {
  unacked: "StatusUnacknowledged",
  acked: "StatusAcknowledged",
  closed: "StatusClosed",
} as const;

const listAlerts: ToolDef = {
  name: "list_alerts",
  description:
    "List alerts, optionally filtered by service IDs, status (unacked/acked/closed), and free-text search. Cursor-paginated.",
  inputSchema: {
    serviceIDs: z.array(z.string()).optional().describe("Restrict to these service IDs."),
    status: z.array(z.enum(["unacked", "acked", "closed"])).optional(),
    search: z.string().optional(),
    first: z.number().int().min(1).max(100).optional().describe("Page size (default 25)."),
    after: z.string().optional().describe("Pagination cursor from a previous call."),
    all: z.boolean().optional().describe("Auto-paginate up to 200 results."),
  },
  mutating: false,
  handler: async (client, args) => {
    const input: Record<string, unknown> = {
      first: args.first ?? 25,
      after: args.after,
    };
    if (args.serviceIDs) input.filterByServiceID = args.serviceIDs;
    if (args.status) input.filterByStatus = args.status.map((s: keyof typeof STATUS_MAP) => STATUS_MAP[s]);
    if (args.search) input.search = args.search;
    const max = args.all ? 200 : (args.first ?? 25);
    const page = await client.paginate(LIST_ALERTS, { input }, (d: any) => d.alerts, max);
    return listResult("Alerts", page);
  },
};

const getAlert: ToolDef = {
  name: "get_alert",
  description: "Get full detail for one alert by its numeric alertID, including state and recent log events.",
  inputSchema: { alertID: z.number().int().describe("The numeric alert ID.") },
  mutating: false,
  handler: async (client, args) => {
    const data = await client.execute<{ alert: unknown }>(GET_ALERT, { id: args.alertID });
    return ok("Alert", data.alert);
  },
};

const ACTION_STATUS = { ack: "StatusAcknowledged", close: "StatusClosed", unack: "StatusUnacknowledged" } as const;

const createAlert: ToolDef = {
  name: "create_alert",
  description: "Create an alert on a service. Use dedup to coalesce repeated alerts; meta is an arbitrary key/value map.",
  inputSchema: {
    serviceID: z.string(),
    summary: z.string().describe("Short alert title."),
    details: z.string().optional(),
    dedup: z.string().optional().describe("Dedup key; repeated creates with the same key won't duplicate."),
    meta: z.record(z.string()).optional().describe("Arbitrary metadata key/value pairs."),
  },
  mutating: true,
  handler: async (client, args) => {
    const input: Record<string, unknown> = { serviceID: args.serviceID, summary: args.summary };
    if (args.details) input.details = args.details;
    if (args.dedup) input.dedup = args.dedup;
    if (args.meta) input.meta = Object.entries(args.meta).map(([key, value]) => ({ key, value }));
    const d = await client.execute<{ createAlert: unknown }>(CREATE_ALERT, { input });
    return ok("Alert created", d.createAlert);
  },
};

const manageAlerts: ToolDef = {
  name: "manage_alerts",
  description:
    "Acknowledge, close, unacknowledge, or escalate alerts. Target either specific alertIDs (numeric) or all alerts on a serviceID (close/ack only, not escalate).",
  inputSchema: {
    action: z.enum(["ack", "close", "unack", "escalate"]),
    alertIDs: z.array(z.number().int()).optional(),
    serviceID: z.string().optional().describe("Apply the action to all alerts on this service (not valid with escalate)."),
  },
  mutating: true,
  handler: async (client, args) => {
    if (!args.alertIDs?.length && !args.serviceID) throw new GoAlertError("Provide alertIDs or serviceID");
    if (args.action === "escalate") {
      if (!args.alertIDs?.length) throw new GoAlertError("escalate requires alertIDs");
      const d = await client.execute<{ escalateAlerts: unknown }>(ESCALATE_ALERTS, { ids: args.alertIDs });
      return ok("Alerts escalated", d.escalateAlerts);
    }
    const newStatus = ACTION_STATUS[args.action as keyof typeof ACTION_STATUS];
    if (args.serviceID && !args.alertIDs?.length) {
      await client.execute(CLOSE_BY_SERVICE, { input: { serviceID: args.serviceID, newStatus } });
      return ok(`All alerts on service ${args.serviceID} → ${newStatus}`, { serviceID: args.serviceID, newStatus });
    }
    const d = await client.execute<{ updateAlerts: unknown }>(UPDATE_ALERTS, { input: { alertIDs: args.alertIDs, newStatus } });
    return ok(`Alerts → ${newStatus}`, d.updateAlerts);
  },
};

export const alertTools: ToolDef[] = [listAlerts, getAlert, createAlert, manageAlerts];
