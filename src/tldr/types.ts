/**
 * Types for llm-tldr JSON output
 *
 * These types represent the JSON output from `uvx --from llm-tldr tldr` commands.
 * llm-tldr provides tree-sitter AST analysis, call graph traversal, and semantic search.
 */

/** Entry from `tldr structure <path>` — AST-based function/class/type listing */
export interface TldrStructureEntry {
  name: string;
  type: "function" | "class" | "method" | "interface" | "type";
  file: string;
  line: number;
  signature?: string;
}

/** Result from `tldr impact <func> <path>` — call graph callers/callees */
export interface TldrImpactResult {
  function: string;
  callers: Array<{ name: string; file: string; line: number }>;
  callees: Array<{ name: string; file: string; line: number }>;
}

/** Result from `tldr semantic <query> <path>` — semantic search */
export interface TldrSemanticResult {
  function: string;
  file: string;
  line: number;
  score: number;
}

/** Result from `tldr context <func> --project <path>` — rich context */
export interface TldrContextResult {
  function: string;
  file: string;
  signature: string;
  callers: string[];
  callees: string[];
  complexity: number;
}
