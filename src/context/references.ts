/**
 * Reference finding module for wdyt
 *
 * Finds where symbols are used across the codebase using llm-tldr's
 * call graph analysis (replaces git grep).
 */

import type { TldrClient } from "../tldr";

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
  /** File patterns to search (e.g., "*.ts", "*.js") — unused with tldr, kept for compat */
  filePatterns?: string[];
}

/** Default maximum results per symbol */
const DEFAULT_LIMIT = 20;

/**
 * Normalize file path for comparison
 */
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Find references to a symbol using llm-tldr's call graph impact analysis.
 *
 * @param options - Search options
 * @param tldr - TldrClient instance
 * @param projectPath - Project root path
 * @returns Array of references found
 */
export async function findReferences(
  options: FindReferencesOptions,
  tldr: TldrClient,
  projectPath: string,
): Promise<Reference[]> {
  const {
    symbol,
    definitionFile,
    limit = DEFAULT_LIMIT,
  } = options;

  if (!symbol) return [];

  try {
    const impact = await tldr.impact(symbol, projectPath);

    const normalizedDefinitionFile = definitionFile
      ? normalizePath(definitionFile)
      : null;

    const references: Reference[] = [];

    for (const caller of impact.callers) {
      // Exclude the definition file
      if (normalizedDefinitionFile) {
        const normalizedCallerFile = normalizePath(caller.file);
        if (
          normalizedCallerFile === normalizedDefinitionFile ||
          normalizedCallerFile.endsWith(`/${normalizedDefinitionFile}`) ||
          normalizedDefinitionFile.endsWith(`/${normalizedCallerFile}`)
        ) {
          continue;
        }
      }

      references.push({
        file: caller.file,
        line: caller.line,
        context: `${caller.name} calls ${symbol}`,
      });

      if (references.length >= limit) break;
    }

    return references;
  } catch {
    return [];
  }
}

/**
 * Find references for multiple symbols
 *
 * @param symbols - Array of symbol names
 * @param definitionFile - File where symbols are defined (excluded from results)
 * @param cwd - Working directory (unused with tldr, kept for compat)
 * @param limitPerSymbol - Maximum references per symbol (default: 10)
 * @param tldr - TldrClient instance
 * @param projectPath - Project root path
 * @returns Map of symbol name to references
 */
export async function findReferencesForSymbols(
  symbols: string[],
  definitionFile: string | undefined,
  cwd: string | undefined,
  limitPerSymbol: number = 10,
  tldr: TldrClient,
  projectPath: string,
): Promise<Map<string, Reference[]>> {
  const results = new Map<string, Reference[]>();

  const promises = symbols.map(async (symbol) => {
    const refs = await findReferences(
      { symbol, definitionFile, cwd, limit: limitPerSymbol },
      tldr,
      projectPath,
    );
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
 */
export function formatReferences(references: Reference[]): string[] {
  return references.map((ref) => `${ref.file}:${ref.line}:${ref.context}`);
}

/**
 * Check if git is available and cwd is a git repository
 */
export async function isGitRepository(cwd?: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["git", "rev-parse", "--git-dir"], {
      cwd: cwd ?? process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}
