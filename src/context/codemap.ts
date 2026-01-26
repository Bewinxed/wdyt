/**
 * Code Map Generation Module
 *
 * Extracts lightweight code maps from source files — function signatures,
 * type definitions, and class structures WITHOUT implementation bodies.
 * This reduces token usage by 70-90% while preserving architectural context.
 *
 * Uses llm-tldr's tree-sitter AST for accurate extraction across 16+ languages.
 */

import type { TldrClient } from "../tldr";
import type { TldrStructureEntry } from "../tldr/types";

/** Code map entry types */
export type CodeMapEntryType =
  | "import"
  | "export"
  | "function"
  | "class"
  | "interface"
  | "type"
  | "const"
  | "method"
  | "property";

/** A single code map entry */
export interface CodeMapEntry {
  type: CodeMapEntryType;
  signature: string;
  line: number;
}

/** Complete code map for a file */
export interface CodeMap {
  path: string;
  language: string;
  entries: CodeMapEntry[];
  /** Original file size in bytes */
  originalSize: number;
  /** Code map size in bytes (for token estimation) */
  mapSize: number;
  /** Compression ratio (1 - mapSize/originalSize) */
  compressionRatio: number;
}

/**
 * Map tldr structure entry type to CodeMapEntryType
 */
function mapEntryType(tldrType: TldrStructureEntry["type"]): CodeMapEntryType {
  switch (tldrType) {
    case "function":
      return "function";
    case "class":
      return "class";
    case "method":
      return "method";
    case "interface":
      return "interface";
    case "type":
      return "type";
    default:
      return "function";
  }
}

/**
 * Detect language from file path (for CodeMap.language field)
 */
function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";

  const langMap: Record<string, string> = {
    ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
    js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
    py: "python", pyw: "python",
    svelte: "svelte",
    go: "go",
    rs: "rust",
    rb: "ruby",
    java: "java",
    kt: "kotlin", kts: "kotlin",
    swift: "swift",
    c: "c", h: "c",
    cpp: "cpp", cxx: "cpp", cc: "cpp", hpp: "cpp",
    cs: "csharp",
    php: "php",
    scala: "scala",
    zig: "zig",
    lua: "lua",
  };

  return langMap[ext] || "unknown";
}

/**
 * Extract code map from a file using llm-tldr's tree-sitter AST.
 *
 * @param filePath - Path to the source file
 * @param content - File content (used for size calculation)
 * @param tldr - TldrClient instance
 * @param projectPath - Project root path
 * @returns Code map with AST-extracted entries
 */
export async function extractCodeMap(
  filePath: string,
  content: string,
  tldr: TldrClient,
  projectPath: string,
): Promise<CodeMap> {
  const language = detectLanguage(filePath);
  let entries: CodeMapEntry[] = [];

  try {
    const structureEntries = await tldr.structure(filePath, projectPath);

    entries = structureEntries.map((entry) => ({
      type: mapEntryType(entry.type),
      signature: entry.signature || entry.name,
      line: entry.line,
    }));
  } catch {
    // If tldr fails for this file, return empty entries
    // (unsupported language, binary file, etc.)
  }

  const originalSize = content.length;
  const mapContent = entries.map((e) => e.signature).join("\n");
  const mapSize = mapContent.length;
  const compressionRatio = originalSize > 0 ? 1 - mapSize / originalSize : 0;

  return {
    path: filePath,
    language,
    entries,
    originalSize,
    mapSize,
    compressionRatio,
  };
}

/**
 * Extract code map from a file path
 */
export async function extractCodeMapFromFile(
  filePath: string,
  tldr: TldrClient,
  projectPath: string,
): Promise<CodeMap | null> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return null;
  }

  const content = await file.text();
  return extractCodeMap(filePath, content, tldr, projectPath);
}

/**
 * Format a code map as a string for inclusion in context
 */
export function formatCodeMap(codeMap: CodeMap): string {
  if (codeMap.entries.length === 0) {
    return `// ${codeMap.path} (no extractable signatures)`;
  }

  const lines = [`// ${codeMap.path} (${Math.round(codeMap.compressionRatio * 100)}% smaller)`];

  for (const entry of codeMap.entries) {
    lines.push(entry.signature);
  }

  return lines.join("\n");
}

/**
 * Estimate tokens for a code map
 */
export function estimateCodeMapTokens(codeMap: CodeMap): number {
  return Math.ceil(codeMap.mapSize / 4);
}
