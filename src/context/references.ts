/**
 * Reference finding module for wdyt
 *
 * Finds where symbols are used across the codebase using git grep.
 */

import { spawn } from "child_process";

/** Reference information for a symbol */
export interface Reference {
  file: string;
  line: number;
  context: string;
}

/** Options for finding references */
export interface FindReferencesOptions {
  /** The symbol name to search for */
  symbol: string;
  /** File path where the symbol is defined (will be excluded from results) */
  definitionFile?: string;
  /** Working directory (defaults to cwd) */
  cwd?: string;
  /** Maximum number of results to return (default: 20) */
  limit?: number;
  /** File patterns to search (e.g., "*.ts", "*.js") */
  filePatterns?: string[];
}

/** Default maximum results per symbol */
const DEFAULT_LIMIT = 20;

/**
 * Execute git grep and return raw output
 */
async function execGitGrep(
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const process = spawn("git", ["grep", ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    process.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    process.on("close", (exitCode) => {
      resolve({ stdout, stderr, exitCode: exitCode ?? 0 });
    });

    process.on("error", () => {
      resolve({ stdout: "", stderr: "Failed to spawn git grep", exitCode: 1 });
    });
  });
}

/**
 * Parse git grep output line into Reference object
 *
 * git grep -n output format: file:line:context
 */
function parseGrepLine(line: string): Reference | null {
  // Handle format: file:line:context
  // Need to handle Windows paths (C:\...) and colons in context
  const match = line.match(/^([^:]+):(\d+):(.*)$/);
  if (!match) return null;

  const [, file, lineStr, context] = match;
  const lineNum = parseInt(lineStr, 10);

  if (isNaN(lineNum)) return null;

  return {
    file,
    line: lineNum,
    context: context.trim(),
  };
}

/**
 * Normalize file path for comparison
 */
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Find references to a symbol across the codebase using git grep
 *
 * @param options - Search options
 * @returns Array of references found
 */
export async function findReferences(
  options: FindReferencesOptions
): Promise<Reference[]> {
  const {
    symbol,
    definitionFile,
    cwd = process.cwd(),
    limit = DEFAULT_LIMIT,
    filePatterns,
  } = options;

  // Build git grep arguments
  // -w: word boundary matching (whole word only)
  // -n: show line numbers
  const args: string[] = ["-w", "-n", symbol];

  // Add file patterns if specified
  if (filePatterns && filePatterns.length > 0) {
    args.push("--");
    args.push(...filePatterns);
  }

  const { stdout, exitCode } = await execGitGrep(args, cwd);

  // Exit code 1 means no matches found (not an error)
  if (exitCode !== 0 && exitCode !== 1) {
    return [];
  }

  // Parse output lines
  const lines = stdout.split("\n").filter((line) => line.trim() !== "");
  const references: Reference[] = [];

  const normalizedDefinitionFile = definitionFile
    ? normalizePath(definitionFile)
    : null;

  for (const line of lines) {
    const ref = parseGrepLine(line);
    if (!ref) continue;

    // Exclude the definition file
    if (normalizedDefinitionFile) {
      const normalizedRefFile = normalizePath(ref.file);
      if (
        normalizedRefFile === normalizedDefinitionFile ||
        normalizedRefFile.endsWith(`/${normalizedDefinitionFile}`) ||
        normalizedDefinitionFile.endsWith(`/${normalizedRefFile}`)
      ) {
        continue;
      }
    }

    references.push(ref);

    // Stop if we've reached the limit
    if (references.length >= limit) {
      break;
    }
  }

  return references;
}

/**
 * Find references for multiple symbols
 *
 * @param symbols - Array of symbol names
 * @param definitionFile - File where symbols are defined (excluded from results)
 * @param cwd - Working directory
 * @param limitPerSymbol - Maximum references per symbol (default: 10)
 * @returns Map of symbol name to references
 */
export async function findReferencesForSymbols(
  symbols: string[],
  definitionFile?: string,
  cwd?: string,
  limitPerSymbol: number = 10
): Promise<Map<string, Reference[]>> {
  const results = new Map<string, Reference[]>();

  // Process symbols in parallel for better performance
  const promises = symbols.map(async (symbol) => {
    const refs = await findReferences({
      symbol,
      definitionFile,
      cwd,
      limit: limitPerSymbol,
    });
    return { symbol, refs };
  });

  const resolvedResults = await Promise.all(promises);

  for (const { symbol, refs } of resolvedResults) {
    results.set(symbol, refs);
  }

  return results;
}

/**
 * Format references as file:line:context strings
 *
 * @param references - References to format
 * @returns Array of formatted strings
 */
export function formatReferences(references: Reference[]): string[] {
  return references.map((ref) => `${ref.file}:${ref.line}:${ref.context}`);
}

/**
 * Check if git is available and cwd is a git repository
 */
export async function isGitRepository(cwd?: string): Promise<boolean> {
  return new Promise((resolve) => {
    const process = spawn("git", ["rev-parse", "--git-dir"], {
      cwd: cwd ?? process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    process.on("close", (exitCode) => {
      resolve(exitCode === 0);
    });

    process.on("error", () => {
      resolve(false);
    });
  });
}
