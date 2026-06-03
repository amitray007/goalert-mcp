import { z } from "zod";
import type { ToolDef } from "./types.js";
import { ok } from "../format.js";
import { GoAlertError } from "../client/errors.js";
import { CREATE_INT_KEY, LIST_INT_KEYS } from "../graphql/operations.js";

// ---- Task 28: manage_integration_keys ----
// The whole tool is gated as mutating because of the create action. The read-only
// `list` action is also reachable via get_service (which returns integrationKeys),
// so listing keys remains available even when the server runs in read-only mode.

const manageIntegrationKeys: ToolDef = {
  name: "manage_integration_keys",
  description:
    "Create or list integration keys for a service. type ∈ generic|grafana|site24x7|prometheusAlertmanager|email|universal. Returns the key href (the inbound webhook URL). Delete a key via goalert_delete type 'integrationKey'.",
  inputSchema: {
    action: z.enum(["create", "list"]),
    serviceID: z.string().optional().describe("Required for both create and list."),
    name: z.string().optional().describe("Required for create."),
    type: z
      .enum(["generic", "grafana", "site24x7", "prometheusAlertmanager", "email", "universal"])
      .optional()
      .describe("Required for create."),
  },
  mutating: true,
  handler: async (client, args) => {
    if (!args.serviceID) throw new GoAlertError("serviceID is required");

    if (args.action === "list") {
      const d = await client.execute<{ service: { integrationKeys: unknown[] } }>(LIST_INT_KEYS, {
        serviceID: args.serviceID,
      });
      return ok("Integration keys", d.service.integrationKeys);
    }

    // action === "create"
    if (!args.name || !args.type) {
      throw new GoAlertError("create requires name and type");
    }
    const d = await client.execute<{ createIntegrationKey: unknown }>(CREATE_INT_KEY, {
      input: { serviceID: args.serviceID, name: args.name, type: args.type },
    });
    return ok("Integration key created", d.createIntegrationKey);
  },
};

export const keyTools: ToolDef[] = [manageIntegrationKeys];
