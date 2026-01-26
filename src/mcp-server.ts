#!/usr/bin/env bun
/**
 * wdyt MCP Server
 *
 * Exposes llm-tldr code analysis tools (AST structure, call graph,
 * semantic search, complexity) over the Model Context Protocol.
 *
 * Transport: stdio (local subprocess)
 * Tools: 8 read-only analysis tools + warm/status
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TldrClient } from "./tldr";
import { extractCodeMapFromFile, formatCodeMap } from "./context/codemap";
import { isAbsolute, resolve } from "node:path";
import type {
  TldrStructureEntry,
  TldrImpactResult,
  TldrSemanticResult,
} from "./tldr/types";

import pkg from "../package.json";

const server = new McpServer({ name: "wdyt", version: pkg.version });
const tldr = new TldrClient();
const defaultProjectPath = process.cwd();

// --- Concurrency-safe warm guard ---

let warmingPromise: Promise<void> | null = null;

async function ensureReady(projectPath: string): Promise<void> {
  if (!(await tldr.isAvailable())) {
    throw new Error(
      "llm-tldr requires uv (Python package runner).\n" +
        "Install: curl -LsSf https://astral.sh/uv/install.sh | sh"
    );
  }
  if (!warmingPromise) {
    warmingPromise = tldr.ensureWarmed(projectPath).finally(() => {
      warmingPromise = null;
    });
  }
  await warmingPromise;
}

// --- Output formatters ---

function formatStructure(entries: TldrStructureEntry[]): string {
  if (entries.length === 0) return "(no symbols found)";

  const groups: Record<string, TldrStructureEntry[]> = {};
  for (const entry of entries) {
    const key = entry.type;
    if (!groups[key]) groups[key] = [];
    groups[key].push(entry);
  }

  const lines: string[] = [];
  const order = ["function", "class", "method", "interface", "type"];

  for (const type of order) {
    const group = groups[type];
    if (!group) continue;
    const label = type === "class" ? "Classes" : `${type.charAt(0).toUpperCase() + type.slice(1)}s`;
    lines.push(`\n${label}:`);
    for (const e of group) {
      lines.push(`  ${e.signature || e.name}  [line ${e.line}]`);
    }
  }

  return lines.join("\n").trim();
}

function formatImpact(result: TldrImpactResult): string {
  const lines: string[] = [`Function: ${result.function}`];

  lines.push(`\nCallers (${result.callers.length}):`);
  for (const c of result.callers) {
    lines.push(`  ${c.name}  ${c.file}${c.line ? `:${c.line}` : ""}`);
  }

  lines.push(`\nCallees (${result.callees.length}):`);
  for (const c of result.callees) {
    lines.push(`  ${c.name}  ${c.file}${c.line ? `:${c.line}` : ""}`);
  }

  return lines.join("\n");
}

function formatSemanticResults(results: TldrSemanticResult[]): string {
  if (results.length === 0) return "(no results)";
  return results
    .map(
      (r, i) =>
        `${i + 1}. ${r.function}  ${r.file}:${r.line}  (score: ${r.score.toFixed(2)})`
    )
    .join("\n");
}

// context() now returns rich text directly from llm-tldr, no formatting needed

// --- Helper ---

function resolvePath(path: string, projectPath: string): string {
  return isAbsolute(path) ? path : resolve(projectPath, path);
}

// --- Tool registrations ---

server.registerTool(
  "tldr_structure",
  {
    title: "File Structure (AST)",
    description:
      "Get all functions, classes, types, and interfaces in a file using tree-sitter AST parsing. " +
      "More accurate than grep/regex for understanding code structure. " +
      "Use this instead of reading entire large files when you only need to know what's defined in them.",
    inputSchema: {
      path: z
        .string()
        .describe("File path (absolute or relative to project root)"),
      projectPath: z
        .string()
        .optional()
        .describe("Project root (defaults to cwd)"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ path, projectPath: pp }) => {
    try {
      const projPath = pp || defaultProjectPath;
      const resolved = resolvePath(path, projPath);
      const entries = await tldr.structure(resolved, projPath);
      return { content: [{ type: "text" as const, text: formatStructure(entries) }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "tldr_impact",
  {
    title: "Call Graph Impact",
    description:
      "Find all callers and callees of a function via call graph traversal. " +
      "Shows the blast radius of changes — which functions call this one, and which functions it calls. " +
      "More complete than grep because it understands actual call relationships, not just text matches. " +
      "Requires project to be indexed (run tldr_warm first if needed).",
    inputSchema: {
      function_name: z.string().describe("Name of the function to analyze"),
      projectPath: z
        .string()
        .optional()
        .describe("Project root (defaults to cwd)"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ function_name, projectPath: pp }) => {
    try {
      const projPath = pp || defaultProjectPath;
      await ensureReady(projPath);
      const result = await tldr.impact(function_name, projPath);
      return { content: [{ type: "text" as const, text: formatImpact(result) }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "tldr_semantic_search",
  {
    title: "Semantic Code Search",
    description:
      "Find code semantically related to a natural language query using embeddings. " +
      "Discovers behavioral relationships that text search misses. " +
      "Use when grep returns too many irrelevant results or you need to find code by what it does, not what it's named. " +
      "Requires project to be indexed (run tldr_warm first if needed).",
    inputSchema: {
      query: z.string().describe("Natural language query describing what you're looking for"),
      projectPath: z
        .string()
        .optional()
        .describe("Project root (defaults to cwd)"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ query, projectPath: pp }) => {
    try {
      const projPath = pp || defaultProjectPath;
      await ensureReady(projPath);
      const results = await tldr.semantic(query, projPath);
      return {
        content: [{ type: "text" as const, text: formatSemanticResults(results) }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "tldr_complexity",
  {
    title: "Function Complexity",
    description:
      "Get cyclomatic complexity score for a specific function. " +
      "Scores: 1-10 simple, 11-20 moderate, 21-50 complex, 50+ untestable. " +
      "Useful for identifying code that may need refactoring or extra test coverage.",
    inputSchema: {
      file: z
        .string()
        .describe("File path (absolute or relative to project root)"),
      function_name: z.string().describe("Name of the function to analyze"),
      projectPath: z
        .string()
        .optional()
        .describe("Project root (defaults to cwd)"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ file, function_name, projectPath: pp }) => {
    try {
      const projPath = pp || defaultProjectPath;
      const resolved = resolvePath(file, projPath);
      const score = await tldr.complexity(resolved, function_name, projPath);
      return {
        content: [
          {
            type: "text" as const,
            text: `Complexity of ${function_name}: ${score}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "tldr_codemap",
  {
    title: "File Code Map",
    description:
      "Get a compact signatures-only overview of a file (70-90% smaller than full content). " +
      "Shows function signatures, class declarations, type definitions — without implementation bodies. " +
      "Use this before reading full files to understand structure quickly.",
    inputSchema: {
      path: z
        .string()
        .describe("File path (absolute or relative to project root)"),
      projectPath: z
        .string()
        .optional()
        .describe("Project root (defaults to cwd)"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ path, projectPath: pp }) => {
    try {
      const projPath = pp || defaultProjectPath;
      const resolved = resolvePath(path, projPath);
      const codeMap = await extractCodeMapFromFile(resolved, tldr, projPath);
      if (!codeMap) {
        return {
          content: [{ type: "text" as const, text: `File not found: ${path}` }],
          isError: true,
        };
      }
      return { content: [{ type: "text" as const, text: formatCodeMap(codeMap) }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "tldr_context",
  {
    title: "Function Context",
    description:
      "Get comprehensive context for a function in one call: its signature, cyclomatic complexity, " +
      "all callers, and all callees. Use for deep investigation of a specific function's role in the codebase. " +
      "Requires project to be indexed (run tldr_warm first if needed).",
    inputSchema: {
      function_name: z.string().describe("Name of the function to analyze"),
      projectPath: z
        .string()
        .optional()
        .describe("Project root (defaults to cwd)"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ function_name, projectPath: pp }) => {
    try {
      const projPath = pp || defaultProjectPath;
      await ensureReady(projPath);
      const result = await tldr.context(function_name, projPath);
      return { content: [{ type: "text" as const, text: result }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "tldr_warm",
  {
    title: "Index Project",
    description:
      "Index or reindex the project for call graph and semantic search. " +
      "Builds both the call graph cache and semantic embedding index. " +
      "Required before tldr_impact, tldr_semantic_search, and tldr_context work. " +
      "Run once per project, or after major code changes. " +
      "First run downloads an embedding model (~1.3GB).",
    inputSchema: {
      projectPath: z
        .string()
        .optional()
        .describe("Project root (defaults to cwd)"),
    },
    annotations: { readOnlyHint: false },
  },
  async ({ projectPath: pp }) => {
    try {
      const projPath = pp || defaultProjectPath;
      if (!(await tldr.isAvailable())) {
        return {
          content: [
            {
              type: "text" as const,
              text: "llm-tldr requires uv (Python package runner).\nInstall: curl -LsSf https://astral.sh/uv/install.sh | sh",
            },
          ],
          isError: true,
        };
      }
      await tldr.ensureWarmed(projPath);
      return {
        content: [
          { type: "text" as const, text: `Project indexed successfully: ${projPath}` },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "tldr_status",
  {
    title: "TLDR Status",
    description:
      "Check if llm-tldr is installed (uvx available) and whether the current project is indexed. " +
      "Use to diagnose issues with other tldr tools.",
    inputSchema: {
      projectPath: z
        .string()
        .optional()
        .describe("Project root (defaults to cwd)"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ projectPath: pp }) => {
    try {
      const projPath = pp || defaultProjectPath;
      const available = await tldr.isAvailable();

      let callGraph = false;
      let semantic = false;
      let languages: string[] = [];

      if (available) {
        callGraph = await Bun.file(`${projPath}/.tldr/cache/call_graph.json`).exists().catch(() => false);
        semantic = await Bun.file(`${projPath}/.tldr/cache/semantic/index.faiss`).exists().catch(() => false);
        try {
          const langFile = await Bun.file(`${projPath}/.tldr/languages.json`).json() as { languages: string[] };
          languages = langFile.languages || [];
        } catch { /* no languages file */ }
      }

      const lines = [
        `uvx available: ${available ? "yes" : "no"}`,
        `call graph: ${callGraph ? "yes" : "no"}`,
        `semantic index: ${semantic ? "yes" : "no"}`,
        `languages: ${languages.length ? languages.join(", ") : "none"}`,
        `project path: ${projPath}`,
      ];
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- Start server ---

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("wdyt MCP server started");
