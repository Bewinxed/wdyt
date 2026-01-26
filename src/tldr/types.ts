/**
 * Types for llm-tldr JSON output
 *
 * These types represent the PUBLIC interface returned by TldrClient methods.
 * The client internally converts the raw CLI output to these shapes.
 */

/** Entry from `tldr extract <file>` — AST-based function/class/type listing */
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

/** Result from `tldr semantic search <query>` — semantic search */
export interface TldrSemanticResult {
  function: string;
  file: string;
  line: number;
  score: number;
}

/** Result from `tldr context <func> --project <path>` — rich context (text) */
export type TldrContextResult = string;

// --- Raw CLI output types (internal, used by client for conversion) ---

/** Raw output from `tldr extract <file>` */
export interface RawExtractResult {
  file_path: string;
  language: string;
  classes: Array<{
    name: string;
    line_number: number;
    signature: string;
    methods: Array<{
      name: string;
      line_number: number;
      signature: string;
    }>;
  }>;
  functions?: Array<{
    name: string;
    line_number: number;
    signature: string;
  }>;
}

/** Raw caller entry from impact (recursive structure) */
export interface RawImpactCaller {
  function: string;
  file: string;
  caller_count: number;
  callers: RawImpactCaller[];
  truncated: boolean;
}

/** Raw output from `tldr impact <func> <path>` */
export interface RawImpactResult {
  targets: Record<
    string,
    {
      function: string;
      file: string;
      caller_count: number;
      callers: RawImpactCaller[];
      truncated: boolean;
      note?: string;
    }
  >;
  total_targets: number;
  error?: string;
}

/** Raw output from `tldr semantic search <query>` */
export interface RawSemanticResult {
  name: string;
  qualified_name: string;
  file: string;
  line: number;
  unit_type: string;
  signature: string;
  score: number;
}

/** Raw output from `tldr cfg <file> <function>` */
export interface RawCfgResult {
  function: string;
  cyclomatic_complexity: number;
}
