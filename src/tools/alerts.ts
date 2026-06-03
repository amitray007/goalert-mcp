import { z } from "zod";
import type { ToolDef } from "./types.js";
import { ok, listResult } from "../format.js";
import { LIST_ALERTS, GET_ALERT } from "../graphql/operations.js";

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

export const alertTools: ToolDef[] = [listAlerts, getAlert];
