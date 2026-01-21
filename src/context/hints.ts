/**
 * Context hints generation module for wdyt
 *
 * Combines symbol extraction + reference finding to generate
 * context hints for code reviews, matching flowctl's gather_context_hints().
 */

import { extractSymbols, isSupported, type Symbol } from "./symbols";
import { findReferences, type Reference } from "./references";

/** Maximum number of context hints to return */
const MAX_HINTS = 15;

/** Maximum references to fetch per symbol (before curation) */
const REFS_PER_SYMBOL = 5;

/** Context hint for a related file */
export interface ContextHint {
  file: string;
  line: number;
  symbol: string;
  refCount: number;
}

/** Options for generating context hints */
export interface GenerateHintsOptions {
  /** Changed files to analyze */
  changedFiles: string[];
  /** File contents (path -> content) */
  fileContents: Map<string, string>;
  /** Working directory (defaults to cwd) */
  cwd?: string;
  /** Maximum hints to return (default: 15) */
  maxHints?: number;
}

/**
 * Extract symbols from changed files
 *
 * @param changedFiles - Array of changed file paths
 * @param fileContents - Map of file path to content
 * @returns Map of file path to extracted symbols
 */
function extractSymbolsFromFiles(
  changedFiles: string[],
  fileContents: Map<string, string>
): Map<string, Symbol[]> {
  const result = new Map<string, Symbol[]>();

  for (const filePath of changedFiles) {
    // Skip unsupported files
    if (!isSupported(filePath)) {
      continue;
    }

    const content = fileContents.get(filePath);
    if (!content) {
      continue;
    }

    const symbols = extractSymbols(content, filePath);
    if (symbols.length > 0) {
      result.set(filePath, symbols);
    }
  }

  return result;
}

/**
 * Find references for all symbols across files
 *
 * @param symbolsByFile - Map of file path to symbols
 * @param cwd - Working directory
 * @returns Map of symbol name to references (with reference count)
 */
async function findAllReferences(
  symbolsByFile: Map<string, Symbol[]>,
  cwd: string
): Promise<Map<string, { refs: Reference[]; count: number }>> {
  const results = new Map<string, { refs: Reference[]; count: number }>();
  const promises: Promise<void>[] = [];

  for (const [filePath, symbols] of Array.from(symbolsByFile.entries())) {
    for (const symbol of symbols) {
      const promise = findReferences({
        symbol: symbol.name,
        definitionFile: filePath,
        cwd,
        limit: REFS_PER_SYMBOL,
      }).then((refs) => {
        const existing = results.get(symbol.name);
        if (existing) {
          // Merge refs and update count
          existing.refs.push(...refs);
          existing.count += refs.length;
        } else {
          results.set(symbol.name, { refs, count: refs.length });
        }
      });
      promises.push(promise);
    }
  }

  await Promise.all(promises);
  return results;
}

/**
 * Curate hints to max limit, prioritizing by reference frequency
 *
 * @param referenceMap - Map of symbol to references
 * @param maxHints - Maximum hints to return
 * @returns Array of curated context hints
 */
function curateHints(
  referenceMap: Map<string, { refs: Reference[]; count: number }>,
  maxHints: number
): ContextHint[] {
  // Flatten all references with their symbol info
  const allHints: ContextHint[] = [];
  const seenFileLines = new Set<string>();

  for (const [symbol, { refs, count }] of Array.from(referenceMap.entries())) {
    for (const ref of refs) {
      // Deduplicate by file:line
      const key = `${ref.file}:${ref.line}`;
      if (seenFileLines.has(key)) {
        continue;
      }
      seenFileLines.add(key);

      allHints.push({
        file: ref.file,
        line: ref.line,
        symbol,
        refCount: count,
      });
    }
  }

  // Sort by reference count (descending) - most referenced symbols first
  allHints.sort((a, b) => b.refCount - a.refCount);

  // Take top maxHints
  return allHints.slice(0, maxHints);
}

/**
 * Format hints as flowctl-compatible output
 *
 * Output format:
 * ```
 * Consider these related files:
 * - src/auth.ts:15 - references validateToken
 * - src/types.ts:42 - references User
 * ```
 *
 * @param hints - Array of context hints
 * @returns Formatted string matching flowctl gather_context_hints() output
 */
export function formatHints(hints: ContextHint[]): string {
  if (hints.length === 0) {
    return "";
  }

  const lines = ["Consider these related files:"];

  for (const hint of hints) {
    lines.push(`- ${hint.file}:${hint.line} - references ${hint.symbol}`);
  }

  return lines.join("\n");
}

/**
 * Generate context hints from changed files
 *
 * Combines symbol extraction + reference finding to identify
 * related files that may be affected by changes.
 *
 * @param options - Generation options
 * @returns Array of context hints (max 15 by default)
 */
export async function generateContextHints(
  options: GenerateHintsOptions
): Promise<ContextHint[]> {
  const {
    changedFiles,
    fileContents,
    cwd = process.cwd(),
    maxHints = MAX_HINTS,
  } = options;

  // Step 1: Extract symbols from changed files
  const symbolsByFile = extractSymbolsFromFiles(changedFiles, fileContents);

  if (symbolsByFile.size === 0) {
    return [];
  }

  // Step 2: Find references to extracted symbols
  const referenceMap = await findAllReferences(symbolsByFile, cwd);

  // Step 3: Curate to max hints, prioritized by relevance
  return curateHints(referenceMap, maxHints);
}

/**
 * Generate formatted context hints string
 *
 * This is the main entry point for getting context hints in flowctl format.
 *
 * @param options - Generation options
 * @returns Formatted hints string (empty if no hints found)
 */
export async function getFormattedContextHints(
  options: GenerateHintsOptions
): Promise<string> {
  const hints = await generateContextHints(options);
  return formatHints(hints);
}

/**
 * Generate context hints from git diff
 *
 * Convenience function that reads file contents and generates hints.
 *
 * @param changedFiles - List of changed file paths (relative to cwd)
 * @param cwd - Working directory (defaults to process.cwd())
 * @param maxHints - Maximum hints to return (default: 15)
 * @returns Formatted hints string
 */
export async function generateHintsFromDiff(
  changedFiles: string[],
  cwd: string = process.cwd(),
  maxHints: number = MAX_HINTS
): Promise<string> {
  const { join } = await import("path");

  // Read file contents
  const fileContents = new Map<string, string>();

  for (const filePath of changedFiles) {
    const fullPath = filePath.startsWith("/") ? filePath : join(cwd, filePath);
    const file = Bun.file(fullPath);

    if (await file.exists()) {
      try {
        const content = await file.text();
        fileContents.set(filePath, content);
      } catch {
        // Skip files we can't read
      }
    }
  }

  return getFormattedContextHints({
    changedFiles,
    fileContents,
    cwd,
    maxHints,
  });
}
