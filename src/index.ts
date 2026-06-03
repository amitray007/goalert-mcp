#!/usr/bin/env node
import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import { main } from "./server.js";

export const VERSION = "0.1.0";

// Only start the server when this file is run directly as the bin entry point,
// not when it is imported (e.g. by tests reading VERSION).
const isEntryPoint = argv[1] !== undefined && fileURLToPath(import.meta.url) === argv[1];
if (isEntryPoint) {
  main().catch((err) => {
    console.error(`[goalert-mcp] fatal: ${(err as Error).message}`);
    process.exit(1);
  });
}
