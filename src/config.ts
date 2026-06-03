export type GoAlertAuth =
  | { mode: "password"; username: string; password: string }
  | { mode: "token"; token: string };

export interface GoAlertConfig {
  baseUrl: string;
  auth: GoAlertAuth;
  readOnly: boolean;
  referer: string;
}

export class ConfigError extends Error {}

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): GoAlertConfig {
  const rawBase = env.GOALERT_BASE_URL?.trim();
  if (!rawBase) throw new ConfigError("GOALERT_BASE_URL is required (e.g. https://goalert.example.com)");
  let url: URL;
  try {
    url = new URL(rawBase);
  } catch {
    throw new ConfigError(`GOALERT_BASE_URL is not a valid URL: ${rawBase}`);
  }
  const baseUrl = `${url.protocol}//${url.host}`;

  const username = env.GOALERT_USERNAME?.trim();
  const password = env.GOALERT_PASSWORD;
  const token = env.GOALERT_TOKEN?.trim();

  const hasPassword = Boolean(username || password);
  const hasToken = Boolean(token);
  if (hasPassword && hasToken) {
    throw new ConfigError("Provide either GOALERT_USERNAME/GOALERT_PASSWORD or GOALERT_TOKEN, not both");
  }
  if (!hasPassword && !hasToken) {
    throw new ConfigError("No credentials: set GOALERT_USERNAME + GOALERT_PASSWORD, or GOALERT_TOKEN");
  }

  let auth: GoAlertAuth;
  if (hasToken) {
    auth = { mode: "token", token: token! };
  } else {
    if (!username) throw new ConfigError("GOALERT_USERNAME is required when using password auth");
    if (!password) throw new ConfigError("GOALERT_PASSWORD is required when using password auth");
    auth = { mode: "password", username, password };
  }

  return {
    baseUrl,
    auth,
    readOnly: /^(1|true|yes)$/i.test(env.GOALERT_READ_ONLY?.trim() ?? ""),
    referer: env.GOALERT_REFERER?.trim() || baseUrl,
  };
}
