import { describe, expect, test, vi } from "vitest";
import { escalationTools } from "./escalation.js";

const tool = (n: string) => escalationTools.find((t) => t.name === n)!;

describe("list_escalation_policies", () => {
  test("passes search, first, after to paginate", async () => {
    const paginate = vi.fn(async (..._args: any[]) => ({ items: [{ id: "ep1", name: "Primary" }], nextCursor: null, hasMore: false }));
    const client = { execute: vi.fn(), paginate } as any;
    const r = await tool("list_escalation_policies").handler(client, { search: "primary", first: 10, after: "cur1" });
    const [, vars] = paginate.mock.calls[0]!;
    expect(vars.input.search).toBe("primary");
    expect(vars.input.first).toBe(10);
    expect(vars.input.after).toBe("cur1");
    expect(r.structuredContent).toMatchObject({ count: 1 });
  });

  test("uses extractor d.escalationPolicies", async () => {
    const paginate = vi.fn(async (..._args: any[]) => ({ items: [], nextCursor: null, hasMore: false }));
    const client = { execute: vi.fn(), paginate } as any;
    await tool("list_escalation_policies").handler(client, {});
    const [op, , extractor] = paginate.mock.calls[0]!;
    expect(op).toContain("ListEPs");
    const fakeData = { escalationPolicies: { nodes: [{ id: "ep1" }], pageInfo: { endCursor: "c", hasNextPage: false } } };
    expect(extractor(fakeData)).toBe(fakeData.escalationPolicies);
  });

  test("all:true sets max=200", async () => {
    const paginate = vi.fn(async (..._args: any[]) => ({ items: [], nextCursor: null, hasMore: false }));
    const client = { execute: vi.fn(), paginate } as any;
    await tool("list_escalation_policies").handler(client, { all: true });
    expect(paginate.mock.calls[0]![3]).toBe(200);
  });

  test("default first=25 when not specified", async () => {
    const paginate = vi.fn(async (..._args: any[]) => ({ items: [], nextCursor: null, hasMore: false }));
    const client = { execute: vi.fn(), paginate } as any;
    await tool("list_escalation_policies").handler(client, {});
    expect(paginate.mock.calls[0]![1].input.first).toBe(25);
  });

  test("is marked non-mutating", () => {
    expect(tool("list_escalation_policies").mutating).toBe(false);
  });
});

describe("get_escalation_policy", () => {
  test("passes id to execute and returns escalationPolicy", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({
      escalationPolicy: {
        id: "ep1",
        name: "Primary",
        repeat: 0,
        steps: [{ id: "st1", stepNumber: 0, delayMinutes: 5, actions: [{ type: "builtin-user", args: { user_id: "u1" } }] }],
        assignedTo: [{ id: "s1", type: "service", name: "Payments" }],
      },
    }));
    const r = await tool("get_escalation_policy").handler({ execute, paginate: vi.fn() } as any, { id: "ep1" });
    expect(execute.mock.calls[0]![1]).toEqual({ id: "ep1" });
    expect(r.structuredContent).toMatchObject({ id: "ep1", name: "Primary" });
  });

  test("is marked non-mutating", () => {
    expect(tool("get_escalation_policy").mutating).toBe(false);
  });
});

describe("create_escalation_policy", () => {
  test("sends name and optional fields", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ createEscalationPolicy: { id: "ep9", name: "Secondary" } }));
    await tool("create_escalation_policy").handler({ execute, paginate: vi.fn() } as any, { name: "Secondary", repeat: 2 });
    expect(execute.mock.calls[0]![1]).toMatchObject({ input: { name: "Secondary", repeat: 2 } });
  });

  test("omits optional fields when not provided", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ createEscalationPolicy: { id: "ep9", name: "Min" } }));
    await tool("create_escalation_policy").handler({ execute, paginate: vi.fn() } as any, { name: "Min" });
    expect(execute.mock.calls[0]![1]).toEqual({ input: { name: "Min" } });
  });

  test("returns createEscalationPolicy from response", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ createEscalationPolicy: { id: "ep9", name: "New" } }));
    const r = await tool("create_escalation_policy").handler({ execute, paginate: vi.fn() } as any, { name: "New" });
    expect(r.structuredContent).toMatchObject({ id: "ep9" });
  });

  test("is marked mutating", () => {
    expect(tool("create_escalation_policy").mutating).toBe(true);
  });
});

describe("update_escalation_policy", () => {
  test("sends id and repeat", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ updateEscalationPolicy: true }));
    await tool("update_escalation_policy").handler({ execute, paginate: vi.fn() } as any, { id: "ep1", repeat: 3 });
    expect(execute.mock.calls[0]![1]).toMatchObject({ input: { id: "ep1", repeat: 3 } });
  });

  test("sends stepIDs for reordering", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ updateEscalationPolicy: true }));
    await tool("update_escalation_policy").handler({ execute, paginate: vi.fn() } as any, { id: "ep1", stepIDs: ["st2", "st1"] });
    expect(execute.mock.calls[0]![1]).toMatchObject({ input: { id: "ep1", stepIDs: ["st2", "st1"] } });
  });

  test("omits optional fields when not provided", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ updateEscalationPolicy: true }));
    await tool("update_escalation_policy").handler({ execute, paginate: vi.fn() } as any, { id: "ep1" });
    expect(execute.mock.calls[0]![1]).toEqual({ input: { id: "ep1" } });
  });

  test("is marked mutating", () => {
    expect(tool("update_escalation_policy").mutating).toBe(true);
  });
});

describe("manage_escalation_policy_steps", () => {
  test("add action calls CREATE_EP_STEP with destinations", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ createEscalationPolicyStep: { id: "st1", stepNumber: 0 } }));
    await tool("manage_escalation_policy_steps").handler({ execute, paginate: vi.fn() } as any, {
      action: "add",
      escalationPolicyID: "ep1",
      delayMinutes: 10,
      userIDs: ["u1"],
      scheduleIDs: ["sch1"],
      rotationIDs: ["r1"],
    });
    const callArgs = execute.mock.calls[0]![1];
    expect(callArgs.input.escalationPolicyID).toBe("ep1");
    expect(callArgs.input.delayMinutes).toBe(10);
    expect(callArgs.input.actions).toEqual([
      { type: "builtin-user", args: { user_id: "u1" } },
      { type: "builtin-schedule", args: { schedule_id: "sch1" } },
      { type: "builtin-rotation", args: { rotation_id: "r1" } },
    ]);
  });

  test("add returns createEscalationPolicyStep", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ createEscalationPolicyStep: { id: "st1", stepNumber: 0 } }));
    const r = await tool("manage_escalation_policy_steps").handler({ execute, paginate: vi.fn() } as any, {
      action: "add",
      escalationPolicyID: "ep1",
      delayMinutes: 5,
    });
    expect(r.structuredContent).toMatchObject({ id: "st1", stepNumber: 0 });
  });

  test("add without escalationPolicyID throws", async () => {
    const execute = vi.fn();
    await expect(
      tool("manage_escalation_policy_steps").handler({ execute, paginate: vi.fn() } as any, { action: "add", delayMinutes: 5 }),
    ).rejects.toThrow(/escalationPolicyID/i);
  });

  test("add without delayMinutes throws", async () => {
    const execute = vi.fn();
    await expect(
      tool("manage_escalation_policy_steps").handler({ execute, paginate: vi.fn() } as any, { action: "add", escalationPolicyID: "ep1" }),
    ).rejects.toThrow(/delayMinutes/i);
  });

  test("update action calls UPDATE_EP_STEP with stepID", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ updateEscalationPolicyStep: true }));
    await tool("manage_escalation_policy_steps").handler({ execute, paginate: vi.fn() } as any, {
      action: "update",
      stepID: "st1",
      delayMinutes: 15,
      rotationIDs: ["r2"],
    });
    const callArgs = execute.mock.calls[0]![1];
    expect(callArgs.input.id).toBe("st1");
    expect(callArgs.input.delayMinutes).toBe(15);
    expect(callArgs.input.actions).toEqual([{ type: "builtin-rotation", args: { rotation_id: "r2" } }]);
  });

  test("update without targets leaves actions untouched (does not clobber)", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ updateEscalationPolicyStep: true }));
    await tool("manage_escalation_policy_steps").handler({ execute, paginate: vi.fn() } as any, {
      action: "update",
      stepID: "ep-step-1",
      delayMinutes: 10,
    });
    const input = execute.mock.calls[0]![1].input;
    expect(input).toEqual({ id: "ep-step-1", delayMinutes: 10 });
    expect(input).not.toHaveProperty("actions");
  });

  test("update without stepID throws", async () => {
    await expect(
      tool("manage_escalation_policy_steps").handler({ execute: vi.fn(), paginate: vi.fn() } as any, { action: "update" }),
    ).rejects.toThrow(/stepID/i);
  });

  test("is marked mutating", () => {
    expect(tool("manage_escalation_policy_steps").mutating).toBe(true);
  });
});
