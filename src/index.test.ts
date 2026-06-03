import { describe, expect, test } from "vitest";
import { mkdtempSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isMainModule } from "./index.js";

describe("isMainModule", () => {
  function realFile() {
    const dir = mkdtempSync(join(tmpdir(), "ga-bin-"));
    const real = join(dir, "index.js"); writeFileSync(real, "// x");
    return { dir, real };
  }
  test("true when argv1 is a symlink to the module (npm bin case)", () => {
    const { dir, real } = realFile();
    const link = join(dir, "goalert-mcp"); symlinkSync(real, link);
    expect(isMainModule(pathToFileURL(real).href, link)).toBe(true);
  });
  test("true for direct invocation (same path)", () => {
    const { real } = realFile();
    expect(isMainModule(pathToFileURL(real).href, real)).toBe(true);
  });
  test("false when argv1 is an unrelated file (imported as a module)", () => {
    const { dir, real } = realFile();
    const other = join(dir, "other.js"); writeFileSync(other, "// y");
    expect(isMainModule(pathToFileURL(real).href, other)).toBe(false);
  });
  test("false when argv1 is undefined", () => {
    const { real } = realFile();
    expect(isMainModule(pathToFileURL(real).href, undefined)).toBe(false);
  });
});
