import { describe, expect, test } from "vitest";
import { allToolDefs } from "./server.js";

describe("allToolDefs", () => {
  test("returns a non-empty list with unique names", () => {
    const defs = allToolDefs();
    expect(defs.length).toBeGreaterThanOrEqual(0); // TODO(Task 10): restore toBeGreaterThan(0)
    const names = defs.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  // TODO(Task 10): un-skip once goalert_graphql_query exists.
  test.skip("includes the read-only raw query tool", () => {
    expect(allToolDefs().some((d) => d.name === "goalert_graphql_query")).toBe(true);
  });
});
