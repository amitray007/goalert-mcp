import { loadConfig } from "../src/config.js";
import { createAuthenticator } from "../src/client/auth.js";
import { createClient } from "../src/client/graphql.js";
import { writeFileSync } from "node:fs";
import { getIntrospectionQuery, buildClientSchema, printSchema } from "graphql";

const config = loadConfig(process.env);
const client = createClient(config, createAuthenticator(config));
const data = await client.execute<any>(getIntrospectionQuery());
writeFileSync("schema.graphql", printSchema(buildClientSchema(data)));
console.log("Wrote schema.graphql");
