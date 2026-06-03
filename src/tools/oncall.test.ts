import { describe, expect, test, vi } from "vitest";
import { onCallTools } from "./oncall.js";

const handler = onCallTools[0]!.handler;
const client = (execute: any) => ({ execute, paginate: vi.fn() }) as any;

describe("get_on_call", () => {
  test("service mode", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ service: { onCallUsers: [{ userName: "Ann" }] } }));
    const r = await handler(client(execute), { serviceID: "s1" });
    expect(execute.mock.calls[0]![1]).toEqual({ id: "s1" });
    const block = r.content[0] as { type: string; text: string };
    expect(block.text).toContain("Ann");
  });

  test("schedule mode requires window and passes it", async () => {
    const execute = vi.fn(async (..._args: any[]) => ({ schedule: { shifts: [] } }));
    await handler(client(execute), { scheduleID: "sch1", start: "2026-06-03T00:00:00Z", end: "2026-06-04T00:00:00Z" });
    expect(execute.mock.calls[0]![1]).toMatchObject({ id: "sch1", start: "2026-06-03T00:00:00Z" });
  });

  test("requires exactly one target", async () => {
    await expect(handler(client(vi.fn()), {})).rejects.toThrow(/one of/i);
  });
});
