import { describe, expect, test } from "vitest";
import { loadConfig } from "./config.js";
import { createAuthenticator } from "./client/auth.js";
import { createClient } from "./client/graphql.js";

const live = process.env.GOALERT_INTEGRATION === "1";
describe.runIf(live)("live read-only smoke", () => {
  test("authenticates and lists services", async () => {
    const config = loadConfig(process.env);
    const client = createClient(config, createAuthenticator(config));
    const data = await client.execute<{ services: { nodes: unknown[] } }>(
      "query{ services(input:{first:1}){ nodes{ id name } } }",
    );
    expect(Array.isArray(data.services.nodes)).toBe(true);
  });
});
