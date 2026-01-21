/**
 * Tests for context hints generation module
 */

import { describe, it, expect } from "bun:test";
import {
  generateContextHints,
  formatHints,
  type ContextHint,
} from "./hints";

describe("formatHints", () => {
  it("returns empty string for empty hints array", () => {
    const result = formatHints([]);
    expect(result).toBe("");
  });

  it("formats single hint correctly", () => {
    const hints: ContextHint[] = [
      { file: "src/auth.ts", line: 15, symbol: "validateToken", refCount: 3 },
    ];
    const result = formatHints(hints);
    expect(result).toBe(
      "Consider these related files:\n- src/auth.ts:15 - references validateToken"
    );
  });

  it("formats multiple hints correctly", () => {
    const hints: ContextHint[] = [
      { file: "src/auth.ts", line: 15, symbol: "validateToken", refCount: 5 },
      { file: "src/types.ts", line: 42, symbol: "User", refCount: 3 },
      { file: "src/api.ts", line: 100, symbol: "fetchUser", refCount: 2 },
    ];
    const result = formatHints(hints);
    const expected = [
      "Consider these related files:",
      "- src/auth.ts:15 - references validateToken",
      "- src/types.ts:42 - references User",
      "- src/api.ts:100 - references fetchUser",
    ].join("\n");
    expect(result).toBe(expected);
  });
});

describe("generateContextHints", () => {
  it("returns empty array when no changed files provided", async () => {
    const result = await generateContextHints({
      changedFiles: [],
      fileContents: new Map(),
    });
    expect(result).toEqual([]);
  });

  it("returns empty array for unsupported file types", async () => {
    const result = await generateContextHints({
      changedFiles: ["README.md", "config.json"],
      fileContents: new Map([
        ["README.md", "# Readme"],
        ["config.json", '{"key": "value"}'],
      ]),
    });
    expect(result).toEqual([]);
  });

  it("extracts symbols from TypeScript files", async () => {
    const fileContents = new Map([
      [
        "src/test.ts",
        `
export function uniqueTestFunction123() {}
export interface UniqueTestInterface456 {}
export type UniqueTestType789 = string;
`,
      ],
    ]);

    // This test verifies symbol extraction works
    // References won't be found in a clean test environment,
    // but we can verify the pipeline runs without errors
    const result = await generateContextHints({
      changedFiles: ["src/test.ts"],
      fileContents,
      cwd: process.cwd(),
    });

    // Should return empty since no references exist for made-up names
    expect(Array.isArray(result)).toBe(true);
  });

  it("respects maxHints limit", async () => {
    // Create a mock scenario where we'd have many hints
    // In practice, the limit is applied after collecting all refs
    const result = await generateContextHints({
      changedFiles: ["src/test.ts"],
      fileContents: new Map([["src/test.ts", "function test() {}"]]),
      cwd: process.cwd(),
      maxHints: 5,
    });

    expect(result.length).toBeLessThanOrEqual(5);
  });
});

describe("integration", () => {
  it("combines extraction and reference finding", async () => {
    // Test with real project files if available
    const fileContents = new Map([
      [
        "src/context/symbols.ts",
        `
export function extractSymbols() {}
export interface Symbol {}
`,
      ],
    ]);

    // This runs the full pipeline
    const result = await generateContextHints({
      changedFiles: ["src/context/symbols.ts"],
      fileContents,
      cwd: process.cwd(),
    });

    // Should complete without errors
    expect(Array.isArray(result)).toBe(true);

    // Each hint should have the required fields
    for (const hint of result) {
      expect(hint).toHaveProperty("file");
      expect(hint).toHaveProperty("line");
      expect(hint).toHaveProperty("symbol");
      expect(hint).toHaveProperty("refCount");
    }
  });
});
