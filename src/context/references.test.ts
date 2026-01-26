/**
 * Tests for reference finding module (tldr-backed)
 */

import { describe, test, expect, mock } from "bun:test";
import {
  findReferences,
  findReferencesForSymbols,
  formatReferences,
  isGitRepository,
  type Reference,
} from "./references";
import { TldrClient } from "../tldr";
import type { TldrImpactResult } from "../tldr/types";

/**
 * Create a mock TldrClient with predefined impact results
 */
function createMockTldr(impactResults: Map<string, TldrImpactResult>): TldrClient {
  const client = new TldrClient();
  client.impact = mock((funcName: string) => {
    const result = impactResults.get(funcName);
    if (result) return Promise.resolve(result);
    return Promise.resolve({ function: funcName, callers: [], callees: [] });
  });
  client.structure = mock(() => Promise.resolve([]));
  client.semantic = mock(() => Promise.resolve([]));
  client.ensureWarmed = mock(() => Promise.resolve());
  return client;
}

const PROJECT_PATH = "/test/project";

describe("Reference finding (tldr-backed)", () => {
  describe("findReferences", () => {
    test("finds references to a symbol via impact callers", async () => {
      const impactResults = new Map([
        ["helper", {
          function: "helper",
          callers: [
            { name: "main", file: "main.ts", line: 4 },
            { name: "testHelper", file: "test.ts", line: 5 },
          ],
          callees: [],
        }],
      ]);
      const tldr = createMockTldr(impactResults);

      const refs = await findReferences(
        { symbol: "helper" },
        tldr,
        PROJECT_PATH,
      );

      expect(refs.length).toBe(2);
      expect(refs[0].file).toBe("main.ts");
      expect(refs[1].file).toBe("test.ts");
    });

    test("excludes definition file from results", async () => {
      const impactResults = new Map([
        ["helper", {
          function: "helper",
          callers: [
            { name: "otherFunc", file: "utils.ts", line: 6 },
            { name: "main", file: "main.ts", line: 4 },
            { name: "testHelper", file: "test.ts", line: 5 },
          ],
          callees: [],
        }],
      ]);
      const tldr = createMockTldr(impactResults);

      const refs = await findReferences(
        { symbol: "helper", definitionFile: "utils.ts" },
        tldr,
        PROJECT_PATH,
      );

      const files = refs.map((r) => r.file);
      expect(files).not.toContain("utils.ts");
      expect(refs.length).toBe(2);
    });

    test("returns line numbers", async () => {
      const impactResults = new Map([
        ["helper", {
          function: "helper",
          callers: [
            { name: "main", file: "main.ts", line: 42 },
          ],
          callees: [],
        }],
      ]);
      const tldr = createMockTldr(impactResults);

      const refs = await findReferences(
        { symbol: "helper" },
        tldr,
        PROJECT_PATH,
      );

      expect(refs[0].line).toBe(42);
    });

    test("returns context for each reference", async () => {
      const impactResults = new Map([
        ["helper", {
          function: "helper",
          callers: [
            { name: "main", file: "main.ts", line: 4 },
          ],
          callees: [],
        }],
      ]);
      const tldr = createMockTldr(impactResults);

      const refs = await findReferences(
        { symbol: "helper" },
        tldr,
        PROJECT_PATH,
      );

      expect(refs[0].context).toBe("main calls helper");
    });

    test("respects limit option", async () => {
      const impactResults = new Map([
        ["helper", {
          function: "helper",
          callers: [
            { name: "a", file: "a.ts", line: 1 },
            { name: "b", file: "b.ts", line: 2 },
            { name: "c", file: "c.ts", line: 3 },
            { name: "d", file: "d.ts", line: 4 },
            { name: "e", file: "e.ts", line: 5 },
          ],
          callees: [],
        }],
      ]);
      const tldr = createMockTldr(impactResults);

      const refs = await findReferences(
        { symbol: "helper", limit: 2 },
        tldr,
        PROJECT_PATH,
      );

      expect(refs.length).toBe(2);
    });

    test("handles symbols with no references gracefully", async () => {
      const tldr = createMockTldr(new Map());

      const refs = await findReferences(
        { symbol: "nonExistent" },
        tldr,
        PROJECT_PATH,
      );

      expect(refs).toEqual([]);
    });

    test("handles empty symbol", async () => {
      const tldr = createMockTldr(new Map());

      const refs = await findReferences(
        { symbol: "" },
        tldr,
        PROJECT_PATH,
      );

      expect(refs).toEqual([]);
    });

    test("handles tldr error gracefully", async () => {
      const client = new TldrClient();
      client.impact = mock(() => Promise.reject(new Error("tldr error")));
      client.ensureWarmed = mock(() => Promise.resolve());

      const refs = await findReferences(
        { symbol: "helper" },
        client,
        PROJECT_PATH,
      );

      expect(refs).toEqual([]);
    });
  });

  describe("findReferencesForSymbols", () => {
    test("finds references for multiple symbols", async () => {
      const impactResults = new Map([
        ["helper", {
          function: "helper",
          callers: [{ name: "main", file: "main.ts", line: 4 }],
          callees: [],
        }],
        ["main", {
          function: "main",
          callers: [{ name: "app", file: "app.ts", line: 1 }],
          callees: [],
        }],
      ]);
      const tldr = createMockTldr(impactResults);

      const results = await findReferencesForSymbols(
        ["helper", "main"],
        undefined,
        undefined,
        10,
        tldr,
        PROJECT_PATH,
      );

      expect(results.size).toBe(2);
      expect(results.has("helper")).toBe(true);
      expect(results.has("main")).toBe(true);
    });

    test("excludes definition file for all symbols", async () => {
      const impactResults = new Map([
        ["helper", {
          function: "helper",
          callers: [
            { name: "internal", file: "utils.ts", line: 10 },
            { name: "main", file: "main.ts", line: 4 },
          ],
          callees: [],
        }],
      ]);
      const tldr = createMockTldr(impactResults);

      const results = await findReferencesForSymbols(
        ["helper"],
        "utils.ts",
        undefined,
        10,
        tldr,
        PROJECT_PATH,
      );

      const refs = results.get("helper") ?? [];
      const files = refs.map((r) => r.file);
      expect(files).not.toContain("utils.ts");
    });

    test("respects per-symbol limit", async () => {
      const impactResults = new Map([
        ["helper", {
          function: "helper",
          callers: [
            { name: "a", file: "a.ts", line: 1 },
            { name: "b", file: "b.ts", line: 2 },
            { name: "c", file: "c.ts", line: 3 },
          ],
          callees: [],
        }],
      ]);
      const tldr = createMockTldr(impactResults);

      const results = await findReferencesForSymbols(
        ["helper"],
        undefined,
        undefined,
        1,
        tldr,
        PROJECT_PATH,
      );

      const refs = results.get("helper") ?? [];
      expect(refs.length).toBeLessThanOrEqual(1);
    });
  });

  describe("formatReferences", () => {
    test("formats references as file:line:context", () => {
      const refs: Reference[] = [
        { file: "main.ts", line: 4, context: "main calls helper" },
        { file: "test.ts", line: 5, context: "testHelper calls helper" },
      ];

      const formatted = formatReferences(refs);

      expect(formatted).toEqual([
        "main.ts:4:main calls helper",
        "test.ts:5:testHelper calls helper",
      ]);
    });

    test("handles empty array", () => {
      expect(formatReferences([])).toEqual([]);
    });
  });

  describe("Edge cases", () => {
    test("handles definition file with path prefix", async () => {
      const impactResults = new Map([
        ["helper", {
          function: "helper",
          callers: [
            { name: "internal", file: "utils.ts", line: 10 },
            { name: "main", file: "main.ts", line: 4 },
          ],
          callees: [],
        }],
      ]);
      const tldr = createMockTldr(impactResults);

      const refs = await findReferences(
        { symbol: "helper", definitionFile: "./utils.ts" },
        tldr,
        PROJECT_PATH,
      );

      const files = refs.map((r) => r.file);
      expect(files).not.toContain("utils.ts");
    });
  });
});
