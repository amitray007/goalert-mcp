#!/usr/bin/env node
import { argv } from "node:process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { main } from "./server.js";

export const VERSION = "0.1.0";

// Compare real paths so that npm bin symlinks resolve correctly.
// When installed via `npm install -g` or `npx`, argv[1] is the symlink path
// inside node_modules/.bin/, not the actual dist/index.js path; a naive
// string comparison would fail and the server would never start.
export function isMainModule(moduleUrl: string, argv1: string | undefined): boolean {
  if (!argv1) return false;
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argv1);
  } catch {
    return false;
  }
}

// Only start the server when this file is run directly as the bin entry point,
// not when it is imported (e.g. by tests reading VERSION).
if (isMainModule(import.meta.url, argv[1])) {
  main().catch((err) => {
    console.error(`[goalert-mcp] fatal: ${(err as Error).message}`);
    process.exit(1);
  });
}
