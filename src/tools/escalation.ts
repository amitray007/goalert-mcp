import { z } from "zod";
import type { ToolDef } from "./types.js";
import { ok, listResult } from "../format.js";
import { GoAlertError } from "../client/errors.js";
import { LIST_EPS, GET_EP, CREATE_EP, UPDATE_EP, CREATE_EP_STEP, UPDATE_EP_STEP } from "../graphql/operations.js";

// Task 18: Escalation policies read

const listEPs: ToolDef = {
  name: "list_escalation_policies",
  description: "List escalation policies (search, cursor pagination).",
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
    const page = await client.paginate(LIST_EPS, { input }, (d: any) => d.escalationPolicies, max);
    return listResult("Escalation policies", page);
  },
};

const getEP: ToolDef = {
  name: "get_escalation_policy",
  description: "Get one escalation policy with its steps (actions) and assigned services.",
  inputSchema: { id: z.string() },
  mutating: false,
  handler: async (client, args) => {
    const d = await client.execute<{ escalationPolicy: unknown }>(GET_EP, { id: args.id });
    return ok("Escalation policy", d.escalationPolicy);
  },
};

// Task 19: Escalation policies write

const createEP: ToolDef = {
  name: "create_escalation_policy",
  description:
    "Create an escalation policy. repeat = number of times the policy loops after the last step (defaults to 3 if omitted; 0 = run once).",
  inputSchema: {
    name: z.string(),
    description: z.string().optional(),
    repeat: z.number().int().min(0).max(5).optional().describe("Defaults to 3 if omitted."),
    favorite: z.boolean().optional(),
  },
  mutating: true,
  handler: async (client, args) => {
    const input: Record<string, unknown> = { name: args.name };
    for (const k of ["description", "repeat", "favorite"] as const) {
      if (args[k] !== undefined) input[k] = args[k];
    }
    const d = await client.execute<{ createEscalationPolicy: unknown }>(CREATE_EP, { input });
    return ok("Escalation policy created", d.createEscalationPolicy);
  },
};

const updateEP: ToolDef = {
  name: "update_escalation_policy",
  description:
    "Update an escalation policy's name, description, repeat count, or step order (stepIDs). stepIDs is the full ordered list of step IDs to keep — omit a step ID to remove it.",
  inputSchema: {
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    repeat: z.number().int().min(0).max(5).optional(),
    stepIDs: z.array(z.string()).optional().describe("Full ordered list of step IDs to reorder or remove steps."),
  },
  mutating: true,
  handler: async (client, args) => {
    const input: Record<string, unknown> = { id: args.id };
    for (const k of ["name", "description", "repeat", "stepIDs"] as const) {
      if (args[k] !== undefined) input[k] = args[k];
    }
    await client.execute(UPDATE_EP, { input });
    return ok(`Escalation policy ${args.id} updated`, input);
  },
};

// Task 20: manage_escalation_policy_steps

function toDestinations(a: { userIDs?: string[]; scheduleIDs?: string[]; rotationIDs?: string[] }) {
  const out: Array<{ type: string; args: Record<string, string> }> = [];
  for (const id of a.userIDs ?? []) out.push({ type: "builtin-user", args: { user_id: id } });
  for (const id of a.scheduleIDs ?? []) out.push({ type: "builtin-schedule", args: { schedule_id: id } });
  for (const id of a.rotationIDs ?? []) out.push({ type: "builtin-rotation", args: { rotation_id: id } });
  return out;
}

const manageEPSteps: ToolDef = {
  name: "manage_escalation_policy_steps",
  description:
    "Add or update an escalation policy step. A step notifies its targets (users/schedules/rotations) then waits delayMinutes before the next step. To remove or reorder steps, use update_escalation_policy with stepIDs (the full ordered list of remaining step IDs).",
  inputSchema: {
    action: z.enum(["add", "update"]),
    escalationPolicyID: z.string().optional().describe("Required for action 'add'."),
    stepID: z.string().optional().describe("Required for action 'update'."),
    delayMinutes: z.number().int().min(1).optional(),
    userIDs: z.array(z.string()).optional(),
    scheduleIDs: z.array(z.string()).optional(),
    rotationIDs: z.array(z.string()).optional(),
  },
  mutating: true,
  handler: async (client, args) => {
    const actions = toDestinations(args);
    if (args.action === "add") {
      if (!args.escalationPolicyID || args.delayMinutes === undefined) {
        throw new GoAlertError("add requires escalationPolicyID and delayMinutes");
      }
      const d = await client.execute<{ createEscalationPolicyStep: unknown }>(CREATE_EP_STEP, {
        input: { escalationPolicyID: args.escalationPolicyID, delayMinutes: args.delayMinutes, actions },
      });
      return ok("Step added", d.createEscalationPolicyStep);
    }
    if (!args.stepID) throw new GoAlertError("update requires stepID");
    const input: Record<string, unknown> = { id: args.stepID };
    if (args.delayMinutes !== undefined) input.delayMinutes = args.delayMinutes;
    if (actions.length) input.actions = actions;
    await client.execute(UPDATE_EP_STEP, { input });
    return ok(`Step ${args.stepID} updated`, input);
  },
};

export const escalationTools: ToolDef[] = [listEPs, getEP, createEP, updateEP, manageEPSteps];
