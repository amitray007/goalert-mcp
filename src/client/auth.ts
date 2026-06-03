import type { GoAlertConfig } from "../config.js";
import { GoAlertAuthError, redact } from "./errors.js";

export interface Authenticator {
  getToken(): Promise<string>;
  invalidate(): void;
  readonly canRefresh: boolean;
}

export function createAuthenticator(config: GoAlertConfig, fetchFn: typeof fetch = fetch): Authenticator {
  if (config.auth.mode === "token") {
    const token = config.auth.token;
    return { canRefresh: false, async getToken() { return token; }, invalidate() {} };
  }

  const { username, password } = config.auth;
  let cached: string | null = null;

  async function login(): Promise<string> {
    const url = `${config.baseUrl}/api/v2/identity/providers/basic?noRedirect=1`;
    const body = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    let res: Response;
    try {
      res = await fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: config.referer },
        body,
      });
    } catch (err) {
      throw new GoAlertAuthError(redact(`login request failed: ${(err as Error).message}`, [password]));
    }
    const text = (await res.text()).trim();
    if (!res.ok || !text) {
      throw new GoAlertAuthError(
        redact(`login failed (HTTP ${res.status}): ${text || "empty response"}`, [password]),
        undefined, undefined, res.status,
      );
    }
    return text;
  }

  return {
    canRefresh: true,
    async getToken() {
      if (!cached) cached = await login();
      return cached;
    },
    invalidate() { cached = null; },
  };
}
