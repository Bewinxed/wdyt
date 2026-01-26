/**
 * Tests for symbol extraction module (tldr-backed)
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
  extractSymbols,
  extractSymbolsFromFile,
  isSupported,
  getSupportedExtensions,
  type Symbol,
} from "./symbols";
import { TldrClient } from "../tldr";
import type { TldrStructureEntry } from "../tldr/types";

/**
 * Create a mock TldrClient that returns predefined structure entries
 */
function createMockTldr(entries: TldrStructureEntry[]): TldrClient {
  const client = new TldrClient();
  // Override the structure method to return mock data
  client.structure = mock(() => Promise.resolve(entries));
  client.impact = mock(() =>
    Promise.resolve({ function: "", callers: [], callees: [] })
  );
  client.semantic = mock(() => Promise.resolve([]));
  client.ensureWarmed = mock(() => Promise.resolve());
  return client;
}

const PROJECT_PATH = "/test/project";

describe("Symbol extraction (tldr-backed)", () => {
  describe("TypeScript/JavaScript", () => {
    test("extracts function declarations", async () => {
      const tldr = createMockTldr([
        { name: "hello", type: "function", file: "test.ts", line: 2 },
        { name: "goodbye", type: "function", file: "test.ts", line: 3 },
        { name: "asyncFn", type: "function", file: "test.ts", line: 4 },
        { name: "exportAsyncFn", type: "function", file: "test.ts", line: 5 },
      ]);

      const symbols = await extractSymbols("content", "test.ts", tldr, PROJECT_PATH);

      expect(symbols).toHaveLength(4);
      expect(symbols[0]).toEqual({ name: "hello", type: "function", line: 2 });
      expect(symbols[1]).toEqual({ name: "goodbye", type: "function", line: 3 });
      expect(symbols[2]).toEqual({ name: "asyncFn", type: "function", line: 4 });
      expect(symbols[3]).toEqual({ name: "exportAsyncFn", type: "function", line: 5 });
    });

    test("extracts class declarations", async () => {
      const tldr = createMockTldr([
        { name: "MyClass", type: "class", file: "test.ts", line: 2 },
        { name: "ExportedClass", type: "class", file: "test.ts", line: 3 },
      ]);

      const symbols = await extractSymbols("content", "test.ts", tldr, PROJECT_PATH);

      expect(symbols).toHaveLength(2);
      expect(symbols[0]).toEqual({ name: "MyClass", type: "class", line: 2 });
      expect(symbols[1]).toEqual({ name: "ExportedClass", type: "class", line: 3 });
    });

    test("extracts type and interface declarations", async () => {
      const tldr = createMockTldr([
        { name: "MyType", type: "type", file: "test.ts", line: 2 },
        { name: "ExportedType", type: "type", file: "test.ts", line: 3 },
        { name: "MyInterface", type: "interface", file: "test.ts", line: 4 },
        { name: "ExportedInterface", type: "interface", file: "test.ts", line: 5 },
      ]);

      const symbols = await extractSymbols("content", "test.ts", tldr, PROJECT_PATH);

      expect(symbols).toHaveLength(4);
      expect(symbols[0]).toEqual({ name: "MyType", type: "type", line: 2 });
      expect(symbols[1]).toEqual({ name: "ExportedType", type: "type", line: 3 });
      expect(symbols[2]).toEqual({ name: "MyInterface", type: "interface", line: 4 });
      expect(symbols[3]).toEqual({ name: "ExportedInterface", type: "interface", line: 5 });
    });

    test("maps method type to function", async () => {
      const tldr = createMockTldr([
        { name: "myMethod", type: "method", file: "test.ts", line: 5 },
      ]);

      const symbols = await extractSymbols("content", "test.ts", tldr, PROJECT_PATH);

      expect(symbols).toHaveLength(1);
      expect(symbols[0].type).toBe("function");
    });

    test("handles all JS/TS extensions", async () => {
      const tldr = createMockTldr([
        { name: "test", type: "function", file: "test.ts", line: 1 },
      ]);

      for (const ext of [".js", ".jsx", ".tsx", ".mjs", ".cjs"]) {
        const symbols = await extractSymbols("content", `file${ext}`, tldr, PROJECT_PATH);
        expect(symbols).toHaveLength(1);
        expect(symbols[0].name).toBe("test");
      }
    });
  });

  describe("Supported languages", () => {
    test("handles Python files", async () => {
      const tldr = createMockTldr([
        { name: "hello", type: "function", file: "test.py", line: 2 },
        { name: "MyClass", type: "class", file: "test.py", line: 5 },
      ]);

      const symbols = await extractSymbols("content", "test.py", tldr, PROJECT_PATH);
      expect(symbols).toHaveLength(2);
    });

    test("handles Go files", async () => {
      const tldr = createMockTldr([
        { name: "Hello", type: "function", file: "test.go", line: 2 },
        { name: "Config", type: "class", file: "test.go", line: 5 },
      ]);

      const symbols = await extractSymbols("content", "test.go", tldr, PROJECT_PATH);
      expect(symbols).toHaveLength(2);
    });

    test("handles Rust files", async () => {
      const tldr = createMockTldr([
        { name: "hello", type: "function", file: "test.rs", line: 2 },
        { name: "Server", type: "class", file: "test.rs", line: 5 },
        { name: "Logger", type: "interface", file: "test.rs", line: 8 },
      ]);

      const symbols = await extractSymbols("content", "test.rs", tldr, PROJECT_PATH);
      expect(symbols).toHaveLength(3);
    });
  });

  describe("Unsupported/edge cases", () => {
    test("returns empty array for unsupported extensions", async () => {
      const tldr = createMockTldr([]);

      expect(await extractSymbols("content", "file.txt", tldr, PROJECT_PATH)).toEqual([]);
      expect(await extractSymbols("content", "file", tldr, PROJECT_PATH)).toEqual([]);
    });

    test("returns empty array on tldr error", async () => {
      const tldr = createMockTldr([]);
      tldr.structure = mock(() => Promise.reject(new Error("tldr failed")));

      const symbols = await extractSymbols("content", "test.ts", tldr, PROJECT_PATH);
      expect(symbols).toEqual([]);
    });

    test("symbols are sorted by line number", async () => {
      const tldr = createMockTldr([
        { name: "z", type: "function", file: "test.ts", line: 10 },
        { name: "a", type: "function", file: "test.ts", line: 2 },
        { name: "m", type: "class", file: "test.ts", line: 5 },
      ]);

      const symbols = await extractSymbols("content", "test.ts", tldr, PROJECT_PATH);
      expect(symbols[0].line).toBeLessThan(symbols[1].line);
      expect(symbols[1].line).toBeLessThan(symbols[2].line);
    });
  });

  describe("isSupported", () => {
    test("returns true for supported extensions", () => {
      expect(isSupported("file.ts")).toBe(true);
      expect(isSupported("file.tsx")).toBe(true);
      expect(isSupported("file.js")).toBe(true);
      expect(isSupported("file.jsx")).toBe(true);
      expect(isSupported("file.py")).toBe(true);
      expect(isSupported("file.go")).toBe(true);
      expect(isSupported("file.rs")).toBe(true);
      expect(isSupported("file.java")).toBe(true);
      expect(isSupported("file.rb")).toBe(true);
      expect(isSupported("file.cpp")).toBe(true);
      expect(isSupported("file.c")).toBe(true);
    });

    test("returns false for unsupported extensions", () => {
      expect(isSupported("file.txt")).toBe(false);
      expect(isSupported("file.md")).toBe(false);
      expect(isSupported("file")).toBe(false);
    });

    test("handles case-insensitive extensions", () => {
      expect(isSupported("file.TS")).toBe(true);
      expect(isSupported("file.PY")).toBe(true);
    });
  });

  describe("getSupportedExtensions", () => {
    test("returns all supported extensions", () => {
      const extensions = getSupportedExtensions();

      expect(extensions).toContain(".ts");
      expect(extensions).toContain(".tsx");
      expect(extensions).toContain(".js");
      expect(extensions).toContain(".py");
      expect(extensions).toContain(".go");
      expect(extensions).toContain(".rs");
      expect(extensions).toContain(".java");
      expect(extensions).toContain(".rb");
      expect(extensions).toContain(".cpp");
      expect(extensions).toContain(".c");
      expect(extensions).toContain(".swift");
      expect(extensions).toContain(".php");
    });
  });
});
