/**
 * Context hints generation module for wdyt
 *
 * Combines llm-tldr's semantic search + call graph impact analysis
 * to generate context hints for code reviews.
 * Replaces the old symbol→grep pipeline with AST-aware analysis.
 */

import { extractSymbols, isSupported, type Symbol } from "./symbols";
import { findReferences, type Reference } from "./references";
import type { TldrClient } from "../tldr";

/** Maximum number of context hints to return */
const MAX_HINTS = 15;

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
 * Extract symbols from changed files using tldr
 */
async function extractSymbolsFromFiles(
  changedFiles: string[],
  fileContents: Map<string, string>,
  tldr: TldrClient,
  projectPath: string,
): Promise<Map<string, Symbol[]>> {
  const result = new Map<string, Symbol[]>();

  const promises = changedFiles
    .filter((f) => isSupported(f))
    .map(async (filePath) => {
      const content = fileContents.get(filePath);
      if (!content) return null;

      const symbols = await extractSymbols(content, filePath, tldr, projectPath);
      if (symbols.length > 0) {
        return { filePath, symbols };
      }
      return null;
    });

  const results = await Promise.all(promises);

  for (const entry of results) {
    if (entry) {
      result.set(entry.filePath, entry.symbols);
    }
  }

  return result;
}

/**
 * Find references for all symbols using tldr impact analysis
 */
async function findAllReferences(
  symbolsByFile: Map<string, Symbol[]>,
  tldr: TldrClient,
  projectPath: string,
): Promise<Map<string, { refs: Reference[]; count: number }>> {
  const results = new Map<string, { refs: Reference[]; count: number }>();
  const promises: Promise<void>[] = [];

  for (const [filePath, symbols] of Array.from(symbolsByFile.entries())) {
    for (const symbol of symbols) {
      const promise = findReferences(
        { symbol: symbol.name, definitionFile: filePath, limit: 5 },
        tldr,
        projectPath,
      ).then((refs) => {
        const existing = results.get(symbol.name);
        if (existing) {
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
 * Get semantic search results for the diff context
 */
async function getSemanticHints(
  changedFiles: string[],
  fileContents: Map<string, string>,
  tldr: TldrClient,
  projectPath: string,
  limit: number,
): Promise<ContextHint[]> {
  // Build a query from the changed file names and content snippets
  const queryParts: string[] = [];
  for (const file of changedFiles.slice(0, 5)) {
    const content = fileContents.get(file);
    if (content) {
      // Use first 200 chars as a semantic query
      queryParts.push(content.slice(0, 200));
    }
  }

  if (queryParts.length === 0) return [];

  try {
    const query = queryParts.join(" ");
    const results = await tldr.semantic(query, projectPath);

    // Filter out the changed files themselves
    const changedSet = new Set(changedFiles);
    return results
      .filter((r) => !changedSet.has(r.file))
      .slice(0, limit)
      .map((r) => ({
        file: r.file,
        line: r.line,
        symbol: r.function,
        refCount: Math.round(r.score * 10), // Convert score to refCount-like metric
      }));
  } catch {
    return [];
  }
}

/**
 * Curate hints to max limit, prioritizing by reference frequency
 */
function curateHints(
  impactHints: Map<string, { refs: Reference[]; count: number }>,
  semanticHints: ContextHint[],
  maxHints: number,
): ContextHint[] {
  const allHints: ContextHint[] = [];
  const seenFileLines = new Set<string>();

  // Add impact-based hints
  for (const [symbol, { refs, count }] of Array.from(impactHints.entries())) {
    for (const ref of refs) {
      const key = `${ref.file}:${ref.line}`;
      if (seenFileLines.has(key)) continue;
      seenFileLines.add(key);

      allHints.push({
        file: ref.file,
        line: ref.line,
        symbol,
        refCount: count,
      });
    }
  }

  // Add semantic hints (deduplicated)
  for (const hint of semanticHints) {
    const key = `${hint.file}:${hint.line}`;
    if (seenFileLines.has(key)) continue;
    seenFileLines.add(key);
    allHints.push(hint);
  }

  // Sort by reference count (descending)
  allHints.sort((a, b) => b.refCount - a.refCount);

  return allHints.slice(0, maxHints);
}

/**
 * Format hints as flowctl-compatible output
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
 * Generate context hints from changed files using llm-tldr.
 *
 * Pipeline:
 * 1. Extract symbols from changed files via tldr structure
 * 2. Find callers/callees for each symbol via tldr impact
 * 3. Run semantic search for behaviorally related files
 * 4. Merge, deduplicate, sort by relevance
 *
 * @param options - Generation options
 * @param tldr - TldrClient instance
 * @param projectPath - Project root path
 * @returns Array of context hints (max 15 by default)
 */
export async function generateContextHints(
  options: GenerateHintsOptions,
  tldr: TldrClient,
  projectPath: string,
): Promise<ContextHint[]> {
  const {
    changedFiles,
    fileContents,
    maxHints = MAX_HINTS,
  } = options;

  if (changedFiles.length === 0) return [];

  // Step 1: Extract symbols from changed files
  const symbolsByFile = await extractSymbolsFromFiles(
    changedFiles, fileContents, tldr, projectPath,
  );

  // Step 2: Find references via tldr impact
  const impactHints = symbolsByFile.size > 0
    ? await findAllReferences(symbolsByFile, tldr, projectPath)
    : new Map();

  // Step 3: Semantic search for related files
  const semanticHints = await getSemanticHints(
    changedFiles, fileContents, tldr, projectPath, maxHints,
  );

  // Step 4: Merge and curate
  return curateHints(impactHints, semanticHints, maxHints);
}

/**
 * Generate formatted context hints string
 */
export async function getFormattedContextHints(
  options: GenerateHintsOptions,
  tldr: TldrClient,
  projectPath: string,
): Promise<string> {
  const hints = await generateContextHints(options, tldr, projectPath);
  return formatHints(hints);
}

/**
 * Generate context hints from git diff
 *
 * Convenience function that reads file contents and generates hints.
 */
export async function generateHintsFromDiff(
  changedFiles: string[],
  cwd: string = process.cwd(),
  maxHints: number = MAX_HINTS,
  tldr: TldrClient,
  projectPath: string,
): Promise<string> {
  const { join } = await import("path");

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

  return getFormattedContextHints(
    { changedFiles, fileContents, cwd, maxHints },
    tldr,
    projectPath,
  );
}
