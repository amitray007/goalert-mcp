import { describe, expect, test } from "vitest";
import { loadConfig } from "./config.js";

const base = { GOALERT_BASE_URL: "https://goalert.example.com/" };

describe("loadConfig", () => {
  test("password mode normalizes base url and sets defaults", () => {
    const c = loadConfig({ ...base, GOALERT_USERNAME: "admin", GOALERT_PASSWORD: "pw" });
    expect(c.baseUrl).toBe("https://goalert.example.com"); // trailing slash stripped
    expect(c.auth).toEqual({ mode: "password", username: "admin", password: "pw" });
    expect(c.readOnly).toBe(false);
    expect(c.referer).toBe("https://goalert.example.com");
  });

  test("token mode", () => {
    const c = loadConfig({ ...base, GOALERT_TOKEN: "abc" });
    expect(c.auth).toEqual({ mode: "token", token: "abc" });
  });

  test("READ_ONLY and REFERER overrides", () => {
    const c = loadConfig({ ...base, GOALERT_TOKEN: "abc", GOALERT_READ_ONLY: "true", GOALERT_REFERER: "https://x" });
    expect(c.readOnly).toBe(true);
    expect(c.referer).toBe("https://x");
  });

  test("missing base url throws", () => {
    expect(() => loadConfig({ GOALERT_TOKEN: "abc" })).toThrow(/GOALERT_BASE_URL/);
  });

  test("no credentials throws", () => {
    expect(() => loadConfig(base)).toThrow(/credential/i);
  });

  test("both credential modes throws", () => {
    expect(() => loadConfig({ ...base, GOALERT_TOKEN: "abc", GOALERT_USERNAME: "a", GOALERT_PASSWORD: "b" }))
      .toThrow(/both/i);
  });

  test("partial password (username only) throws", () => {
    expect(() => loadConfig({ ...base, GOALERT_USERNAME: "a" })).toThrow(/password/i);
  });
});
