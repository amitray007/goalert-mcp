// src/smoke.test.ts
import { expect, test } from "vitest";
import { VERSION } from "./index.js";

test("version is exported", () => {
  expect(VERSION).toBe("0.1.0");
});
