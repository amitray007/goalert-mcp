import { describe, expect, test, vi } from "vitest";
import { createAuthenticator } from "./auth.js";
import { GoAlertAuthError } from "./errors.js";
import type { GoAlertConfig } from "../config.js";

const cfg = (over: Partial<GoAlertConfig> = {}): GoAlertConfig => ({
  baseUrl: "https://ga.example.com",
  auth: { mode: "password", username: "admin", password: "pw" },
  readOnly: false,
  referer: "https://ga.example.com",
  ...over,
});

function mockFetch(impl: (url: string, init: RequestInit) => Partial<Response> & { text: () => Promise<string> }) {
  return vi.fn(async (url: any, init: any) => impl(String(url), init) as any);
}

describe("authenticator", () => {
  test("password mode logs in and caches the token", async () => {
    const f = mockFetch(() => ({ ok: true, status: 200, text: async () => "SESSION_TOKEN\n" }));
    const auth = createAuthenticator(cfg(), f as any);
    expect(auth.canRefresh).toBe(true);
    expect(await auth.getToken()).toBe("SESSION_TOKEN");
    expect(await auth.getToken()).toBe("SESSION_TOKEN"); // cached
    expect(f).toHaveBeenCalledTimes(1);

    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://ga.example.com/api/v2/identity/providers/basic?noRedirect=1");
    expect(init.method).toBe("POST");
    expect(init.headers.Referer).toBe("https://ga.example.com");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(init.body).toBe("username=admin&password=pw");
  });

  test("invalidate forces re-login", async () => {
    const f = mockFetch(() => ({ ok: true, status: 200, text: async () => "T" }));
    const auth = createAuthenticator(cfg(), f as any);
    await auth.getToken();
    auth.invalidate();
    await auth.getToken();
    expect(f).toHaveBeenCalledTimes(2);
  });

  test("failed login throws GoAlertAuthError without leaking the password", async () => {
    const f = mockFetch(() => ({ ok: false, status: 401, text: async () => "unauthorized" }));
    const auth = createAuthenticator(cfg(), f as any);
    await expect(auth.getToken()).rejects.toBeInstanceOf(GoAlertAuthError);
    await expect(auth.getToken()).rejects.not.toThrow(/pw/);
  });

  test("token mode returns the configured token and cannot refresh", async () => {
    const f = mockFetch(() => ({ ok: true, status: 200, text: async () => "X" }));
    const auth = createAuthenticator(cfg({ auth: { mode: "token", token: "BEARER" } }), f as any);
    expect(auth.canRefresh).toBe(false);
    expect(await auth.getToken()).toBe("BEARER");
    expect(f).not.toHaveBeenCalled();
  });
});
