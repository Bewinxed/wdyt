/**
 * Tests for context hints generation module (tldr-backed)
 */

import { describe, it, expect, mock } from "bun:test";
import {
  generateContextHints,
  formatHints,
  type ContextHint,
} from "./hints";
import { TldrClient } from "../tldr";
import type { TldrStructureEntry, TldrImpactResult, TldrSemanticResult } from "../tldr/types";

/**
 * Create a mock TldrClient with predefined responses
 */
function createMockTldr(options: {
  structure?: Map<string, TldrStructureEntry[]>;
  impact?: Map<string, TldrImpactResult>;
  semantic?: TldrSemanticResult[];
} = {}): TldrClient {
  const client = new TldrClient();

  client.structure = mock((filePath: string) => {
    const entries = options.structure?.get(filePath);
    return Promise.resolve(entries || []);
  });

  client.impact = mock((funcName: string) => {
    const result = options.impact?.get(funcName);
    if (result) return Promise.resolve(result);
    return Promise.resolve({ function: funcName, callers: [], callees: [] });
  });

  client.semantic = mock(() => {
    return Promise.resolve(options.semantic || []);
  });

  client.ensureWarmed = mock(() => Promise.resolve());

  return client;
}

const PROJECT_PATH = "/test/project";

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

describe("generateContextHints (tldr-backed)", () => {
  it("returns empty array when no changed files provided", async () => {
    const tldr = createMockTldr();
    const result = await generateContextHints(
      { changedFiles: [], fileContents: new Map() },
      tldr,
      PROJECT_PATH,
    );
    expect(result).toEqual([]);
  });

  it("returns empty array for unsupported file types", async () => {
    const tldr = createMockTldr();
    const result = await generateContextHints(
      {
        changedFiles: ["README.md", "config.json"],
        fileContents: new Map([
          ["README.md", "# Readme"],
          ["config.json", '{"key": "value"}'],
        ]),
      },
      tldr,
      PROJECT_PATH,
    );
    expect(result).toEqual([]);
  });

  it("generates hints from impact analysis", async () => {
    const tldr = createMockTldr({
      structure: new Map([
        ["src/utils.ts", [
          { name: "helper", type: "function", file: "src/utils.ts", line: 2 },
        ]],
      ]),
      impact: new Map([
        ["helper", {
          function: "helper",
          callers: [
            { name: "main", file: "src/main.ts", line: 10 },
            { name: "testHelper", file: "src/test.ts", line: 5 },
          ],
          callees: [],
        }],
      ]),
    });

    const result = await generateContextHints(
      {
        changedFiles: ["src/utils.ts"],
        fileContents: new Map([["src/utils.ts", "export function helper() {}"]]),
      },
      tldr,
      PROJECT_PATH,
    );

    expect(result.length).toBeGreaterThan(0);
    const files = result.map((h) => h.file);
    expect(files).toContain("src/main.ts");
    expect(files).toContain("src/test.ts");
  });

  it("includes semantic search results", async () => {
    const tldr = createMockTldr({
      structure: new Map([
        ["src/utils.ts", [
          { name: "helper", type: "function", file: "src/utils.ts", line: 2 },
        ]],
      ]),
      impact: new Map([
        ["helper", {
          function: "helper",
          callers: [],
          callees: [],
        }],
      ]),
      semantic: [
        { function: "relatedFunc", file: "src/related.ts", line: 20, score: 0.9 },
        { function: "anotherFunc", file: "src/another.ts", line: 30, score: 0.7 },
      ],
    });

    const result = await generateContextHints(
      {
        changedFiles: ["src/utils.ts"],
        fileContents: new Map([["src/utils.ts", "export function helper() {}"]]),
      },
      tldr,
      PROJECT_PATH,
    );

    const files = result.map((h) => h.file);
    expect(files).toContain("src/related.ts");
    expect(files).toContain("src/another.ts");
  });

  it("deduplicates hints by file:line", async () => {
    const tldr = createMockTldr({
      structure: new Map([
        ["src/utils.ts", [
          { name: "funcA", type: "function", file: "src/utils.ts", line: 1 },
          { name: "funcB", type: "function", file: "src/utils.ts", line: 5 },
        ]],
      ]),
      impact: new Map([
        ["funcA", {
          function: "funcA",
          callers: [{ name: "caller", file: "src/main.ts", line: 10 }],
          callees: [],
        }],
        ["funcB", {
          function: "funcB",
          callers: [{ name: "caller", file: "src/main.ts", line: 10 }],
          callees: [],
        }],
      ]),
    });

    const result = await generateContextHints(
      {
        changedFiles: ["src/utils.ts"],
        fileContents: new Map([["src/utils.ts", "content"]]),
      },
      tldr,
      PROJECT_PATH,
    );

    // Same file:line should appear only once
    const keys = result.map((h) => `${h.file}:${h.line}`);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  it("respects maxHints limit", async () => {
    const callers = Array.from({ length: 20 }, (_, i) => ({
      name: `caller${i}`,
      file: `src/file${i}.ts`,
      line: i + 1,
    }));

    const tldr = createMockTldr({
      structure: new Map([
        ["src/utils.ts", [
          { name: "helper", type: "function", file: "src/utils.ts", line: 1 },
        ]],
      ]),
      impact: new Map([
        ["helper", {
          function: "helper",
          callers,
          callees: [],
        }],
      ]),
    });

    const result = await generateContextHints(
      {
        changedFiles: ["src/utils.ts"],
        fileContents: new Map([["src/utils.ts", "content"]]),
        maxHints: 5,
      },
      tldr,
      PROJECT_PATH,
    );

    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("sorts hints by refCount (descending)", async () => {
    const tldr = createMockTldr({
      structure: new Map([
        ["src/utils.ts", [
          { name: "funcA", type: "function", file: "src/utils.ts", line: 1 },
          { name: "funcB", type: "function", file: "src/utils.ts", line: 5 },
        ]],
      ]),
      impact: new Map([
        ["funcA", {
          function: "funcA",
          callers: [{ name: "caller1", file: "src/one.ts", line: 1 }],
          callees: [],
        }],
        ["funcB", {
          function: "funcB",
          callers: [
            { name: "caller2", file: "src/two.ts", line: 1 },
            { name: "caller3", file: "src/three.ts", line: 1 },
            { name: "caller4", file: "src/four.ts", line: 1 },
          ],
          callees: [],
        }],
      ]),
    });

    const result = await generateContextHints(
      {
        changedFiles: ["src/utils.ts"],
        fileContents: new Map([["src/utils.ts", "content"]]),
      },
      tldr,
      PROJECT_PATH,
    );

    // funcB has more callers, so its refCount should be higher -> sorted first
    if (result.length >= 2) {
      expect(result[0].refCount).toBeGreaterThanOrEqual(result[1].refCount);
    }
  });
});
