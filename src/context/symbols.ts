/**
 * Symbol extraction module for wdyt
 *
 * Extracts function names, class names, type definitions, and interface names
 * from source files using llm-tldr's tree-sitter AST.
 * Supports 16+ languages via tree-sitter.
 */

import type { TldrClient } from "../tldr";
import type { TldrStructureEntry } from "../tldr/types";

/** Symbol types that can be extracted from source code */
export type SymbolType = "function" | "class" | "type" | "interface" | "const";

/** Extracted symbol information */
export interface Symbol {
  name: string;
  type: SymbolType;
  line: number;
}

/**
 * Map tldr type to SymbolType
 */
function mapSymbolType(tldrType: TldrStructureEntry["type"]): SymbolType {
  switch (tldrType) {
    case "function":
      return "function";
    case "class":
      return "class";
    case "method":
      return "function";
    case "interface":
      return "interface";
    case "type":
      return "type";
    default:
      return "function";
  }
}

/** All file extensions supported by llm-tldr's tree-sitter */
const SUPPORTED_EXTENSIONS = new Set([
  ".ts", ".tsx", ".mts", ".cts",
  ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".pyw",
  ".go",
  ".rs",
  ".rb",
  ".java",
  ".kt", ".kts",
  ".swift",
  ".c", ".h",
  ".cpp", ".cxx", ".cc", ".hpp",
  ".cs",
  ".php",
  ".scala",
  ".zig",
  ".lua",
  ".svelte",
]);

/**
 * Get the file extension from a file path
 */
function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filePath.slice(lastDot).toLowerCase();
}

/**
 * Extract symbols from file content using llm-tldr's tree-sitter AST.
 *
 * @param content - The source file content (unused — kept for interface compat)
 * @param filePath - The file path
 * @param tldr - TldrClient instance
 * @param projectPath - Project root path
 * @returns Array of extracted symbols with name, type, and line number
 */
export async function extractSymbols(
  content: string,
  filePath: string,
  tldr: TldrClient,
  projectPath: string,
): Promise<Symbol[]> {
  if (!isSupported(filePath)) {
    return [];
  }

  try {
    const entries = await tldr.structure(filePath, projectPath);

    const symbols: Symbol[] = entries.map((entry) => ({
      name: entry.name,
      type: mapSymbolType(entry.type),
      line: entry.line,
    }));

    // Sort by line number
    symbols.sort((a, b) => a.line - b.line);

    return symbols;
  } catch {
    return [];
  }
}

/**
 * Extract symbols from a file path
 *
 * @param filePath - Absolute path to the source file
 * @param tldr - TldrClient instance
 * @param projectPath - Project root path
 * @returns Array of extracted symbols
 */
export async function extractSymbolsFromFile(
  filePath: string,
  tldr: TldrClient,
  projectPath: string,
): Promise<Symbol[]> {
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return [];
  }

  const content = await file.text();
  return extractSymbols(content, filePath, tldr, projectPath);
}

/**
 * Check if a file extension is supported for symbol extraction
 */
export function isSupported(filePath: string): boolean {
  const extension = getExtension(filePath);
  return SUPPORTED_EXTENSIONS.has(extension);
}

/**
 * Get list of supported file extensions
 */
export function getSupportedExtensions(): string[] {
  return Array.from(SUPPORTED_EXTENSIONS);
}
