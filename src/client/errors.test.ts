import { describe, expect, test } from "vitest";
import { GoAlertError, GoAlertAuthError, mapGraphQLErrors, redact } from "./errors.js";

describe("errors", () => {
  test("mapGraphQLErrors picks first error with code and path", () => {
    const e = mapGraphQLErrors([
      { message: "bad field", path: ["createService", "name"], extensions: { code: "INVALID_INPUT_VALUE" } },
    ]);
    expect(e).toBeInstanceOf(GoAlertError);
    expect(e.message).toContain("bad field");
    expect(e.code).toBe("INVALID_INPUT_VALUE");
    expect(e.path).toEqual(["createService", "name"]);
  });

  test("mapGraphQLErrors joins multiple messages", () => {
    const e = mapGraphQLErrors([{ message: "a" }, { message: "b" }]);
    expect(e.message).toBe("a; b");
  });

  test("redact masks secrets anywhere in text", () => {
    expect(redact("login failed for pw=hunter2 token=abc", ["hunter2", "abc"]))
      .toBe("login failed for pw=*** token=***");
  });

  test("GoAlertAuthError is a GoAlertError", () => {
    expect(new GoAlertAuthError("nope")).toBeInstanceOf(GoAlertError);
  });
});
