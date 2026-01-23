/**
 * Context Builder Module
 *
 * Orchestrates building optimized context for Claude CLI.
 * Implements RepoPrompt-compatible format with:
 * - File tree
 * - Code maps (signatures only for large/low-priority files)
 * - Full file contents (for high-priority files)
 * - Git diff
 * - Token budgeting
 */

import { dirname, basename, relative } from "path";
import { $ } from "bun";
import { extractCodeMap, formatCodeMap, type CodeMap } from "./codemap";

/** Token budget configuration */
export interface TokenBudget {
  /** Maximum total tokens (default: 50000) */
  maxTokens: number;
  /** Tokens reserved for skill prompt */
  skillTokens: number;
  /** Tokens reserved for user prompt */
  userPromptTokens: number;
  /** Available tokens for context (files + git diff) */
  availableTokens: number;
}

/** File with content and priority */
export interface RankedFile {
  path: string;
  content: string;
  /** Priority (higher = more important) */
  priority: number;
  /** Estimated tokens for full content */
  fullTokens: number;
  /** Whether file is in git diff */
  isChanged: boolean;
}

/** Context plan showing what's included */
export interface ContextPlan {
  /** Files included with full content */
  fullFiles: RankedFile[];
  /** Files included as code maps */
  codeMappedFiles: Array<{ file: RankedFile; codeMap: CodeMap }>;
  /** Files excluded due to budget */
  excludedFiles: RankedFile[];
  /** Total tokens used */
  totalTokens: number;
  /** Budget info */
  budget: TokenBudget;
  /** Git diff content (if any) */
  gitDiff?: string;
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Estimate tokens for a string (~4 chars per token)
 */
function estimateTokens(str: string): number {
  return Math.ceil(str.length / 4);
}

/**
 * Get list of changed files from git
 */
async function getChangedFiles(baseBranch?: string): Promise<Set<string>> {
  try {
    const branch = baseBranch || "HEAD~1";
    const result = await $`git diff --name-only ${branch}`.text();
    return new Set(result.trim().split("\n").filter(Boolean));
  } catch {
    return new Set();
  }
}

/**
 * Get git diff for changed files
 */
async function getGitDiff(baseBranch?: string): Promise<string> {
  try {
    const branch = baseBranch || "HEAD~1";
    const result = await $`git diff ${branch}`.text();
    return result.trim();
  } catch {
    return "";
  }
}

/**
 * Rank files by relevance
 */
export function rankFiles(
  files: Array<{ path: string; content: string }>,
  changedFiles: Set<string>,
  rootPath: string
): RankedFile[] {
  return files.map((file) => {
    const relPath = relative(rootPath, file.path);
    let priority = 50; // Base priority

    // Changed files get highest priority
    if (changedFiles.has(relPath) || changedFiles.has(file.path)) {
      priority += 100;
    }

    // Entry points get high priority
    const name = basename(file.path);
    if (
      name === "index.ts" ||
      name === "index.js" ||
      name === "main.ts" ||
      name === "main.js" ||
      name === "+page.svelte" ||
      name === "+layout.svelte" ||
      name === "+page.server.ts" ||
      name === "+server.ts"
    ) {
      priority += 30;
    }

    // Config files get medium priority
    if (
      name === "package.json" ||
      name === "tsconfig.json" ||
      name === "svelte.config.js" ||
      name.endsWith(".config.ts") ||
      name.endsWith(".config.js")
    ) {
      priority += 20;
    }

    // Test files get lower priority (unless changed)
    if (file.path.includes("test") || file.path.includes("spec")) {
      priority -= 10;
    }

    // Smaller files are easier to include
    const tokens = estimateTokens(file.content);
    if (tokens < 500) priority += 10;
    if (tokens > 2000) priority -= 10;

    return {
      path: file.path,
      content: file.content,
      priority,
      fullTokens: tokens,
      isChanged: changedFiles.has(relPath) || changedFiles.has(file.path),
    };
  });
}

/**
 * Build a context plan that fits within the token budget
 */
export function buildContextPlan(
  rankedFiles: RankedFile[],
  budget: TokenBudget,
  gitDiff?: string
): ContextPlan {
  // Sort by priority (highest first)
  const sorted = [...rankedFiles].sort((a, b) => b.priority - a.priority);

  const fullFiles: RankedFile[] = [];
  const codeMappedFiles: Array<{ file: RankedFile; codeMap: CodeMap }> = [];
  const excludedFiles: RankedFile[] = [];

  // Reserve tokens for git diff if present
  const gitDiffTokens = gitDiff ? estimateTokens(gitDiff) : 0;
  let availableTokens = budget.availableTokens - gitDiffTokens;
  let usedTokens = gitDiffTokens;

  for (const file of sorted) {
    // Changed files should always be included with full content if possible
    if (file.isChanged && file.fullTokens <= availableTokens) {
      fullFiles.push(file);
      usedTokens += file.fullTokens;
      availableTokens -= file.fullTokens;
      continue;
    }

    // Try to include full content
    if (file.fullTokens <= availableTokens) {
      fullFiles.push(file);
      usedTokens += file.fullTokens;
      availableTokens -= file.fullTokens;
      continue;
    }

    // Try code map
    const codeMap = extractCodeMap(file.path, file.content);
    const codeMapTokens = estimateTokens(formatCodeMap(codeMap));

    if (codeMapTokens <= availableTokens) {
      codeMappedFiles.push({ file, codeMap });
      usedTokens += codeMapTokens;
      availableTokens -= codeMapTokens;
      continue;
    }

    // Doesn't fit, exclude
    excludedFiles.push(file);
  }

  return {
    fullFiles,
    codeMappedFiles,
    excludedFiles,
    totalTokens: usedTokens + budget.skillTokens + budget.userPromptTokens,
    budget,
    gitDiff,
  };
}

/**
 * Build file tree string from file paths
 */
function buildFileTree(paths: string[], rootPath: string): string {
  // Group files by directory
  const dirs = new Map<string, string[]>();

  for (const path of paths) {
    const relPath = relative(rootPath, path);
    const dir = dirname(relPath);
    const file = basename(relPath);

    if (!dirs.has(dir)) {
      dirs.set(dir, []);
    }
    dirs.get(dir)!.push(file);
  }

  // Build tree
  const lines: string[] = [];
  const sortedDirs = Array.from(dirs.keys()).sort();

  for (const dir of sortedDirs) {
    if (dir !== ".") {
      lines.push(`${dir}/`);
    }
    const files = dirs.get(dir)!.sort();
    for (const file of files) {
      lines.push(dir === "." ? file : `  ${file}`);
    }
  }

  return lines.join("\n");
}

/**
 * Build XML context from a context plan
 *
 * Format (RepoPrompt-compatible):
 * <context>
 *   <file_tree>...</file_tree>
 *   <codemaps>
 *     <codemap path="...">...</codemap>
 *   </codemaps>
 *   <files>
 *     <file path="...">...</file>
 *   </files>
 *   <git_diff>...</git_diff>
 *   <prompt>...</prompt>
 * </context>
 */
export function buildContextXml(plan: ContextPlan, prompt: string, rootPath: string): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push("<context>");

  // File tree (all files, including code-mapped and full)
  const allPaths = [
    ...plan.fullFiles.map((f) => f.path),
    ...plan.codeMappedFiles.map((f) => f.file.path),
  ];
  if (allPaths.length > 0) {
    const fileTree = buildFileTree(allPaths, rootPath);
    lines.push("  <file_tree>");
    lines.push(`    ${escapeXml(fileTree).replace(/\n/g, "\n    ")}`);
    lines.push("  </file_tree>");
  }

  // Code maps
  if (plan.codeMappedFiles.length > 0) {
    lines.push("  <codemaps>");
    for (const { file, codeMap } of plan.codeMappedFiles) {
      const relPath = relative(rootPath, file.path);
      lines.push(`    <codemap path="${escapeXml(relPath)}">`);
      lines.push(`      ${escapeXml(formatCodeMap(codeMap)).replace(/\n/g, "\n      ")}`);
      lines.push("    </codemap>");
    }
    lines.push("  </codemaps>");
  }

  // Full files
  if (plan.fullFiles.length > 0) {
    lines.push("  <files>");
    for (const file of plan.fullFiles) {
      const relPath = relative(rootPath, file.path);
      const changed = file.isChanged ? ' changed="true"' : "";
      lines.push(`    <file path="${escapeXml(relPath)}"${changed}>`);
      lines.push(escapeXml(file.content));
      lines.push("    </file>");
    }
    lines.push("  </files>");
  }

  // Git diff
  if (plan.gitDiff) {
    lines.push("  <git_diff>");
    lines.push(`    ${escapeXml(plan.gitDiff).replace(/\n/g, "\n    ")}`);
    lines.push("  </git_diff>");
  }

  // Prompt
  lines.push("  <prompt>");
  lines.push(`    ${escapeXml(prompt)}`);
  lines.push("  </prompt>");

  lines.push("</context>");
  return lines.join("\n");
}

/**
 * Build optimized context for a set of files
 *
 * @param files - Files with their content
 * @param prompt - User's prompt
 * @param skillPrompt - Skill prompt content
 * @param options - Build options
 * @returns Context XML and plan info
 */
export async function buildOptimizedContext(
  files: Array<{ path: string; content: string }>,
  prompt: string,
  skillPrompt: string,
  options: {
    maxTokens?: number;
    baseBranch?: string;
    rootPath?: string;
    includeGitDiff?: boolean;
  } = {}
): Promise<{
  xml: string;
  plan: ContextPlan;
}> {
  const maxTokens = options.maxTokens || 50_000;
  const rootPath = options.rootPath || process.cwd();

  // Calculate budget
  const skillTokens = estimateTokens(skillPrompt);
  const userPromptTokens = estimateTokens(prompt);
  const availableTokens = maxTokens - skillTokens - userPromptTokens;

  const budget: TokenBudget = {
    maxTokens,
    skillTokens,
    userPromptTokens,
    availableTokens,
  };

  // Get changed files and git diff
  const changedFiles = await getChangedFiles(options.baseBranch);
  const gitDiff = options.includeGitDiff ? await getGitDiff(options.baseBranch) : undefined;

  // Rank files
  const rankedFiles = rankFiles(files, changedFiles, rootPath);

  // Build plan
  const plan = buildContextPlan(rankedFiles, budget, gitDiff);

  // Build XML
  const xml = buildContextXml(plan, prompt, rootPath);

  return { xml, plan };
}

/**
 * Format a context plan summary for display
 */
export function formatContextPlanSummary(plan: ContextPlan): string {
  const lines: string[] = [];
  lines.push("Context Plan:");
  lines.push(`  Total tokens: ~${Math.round(plan.totalTokens / 1000)}k / ${Math.round(plan.budget.maxTokens / 1000)}k`);
  lines.push(`  Full files: ${plan.fullFiles.length}`);
  lines.push(`  Code maps: ${plan.codeMappedFiles.length}`);
  lines.push(`  Excluded: ${plan.excludedFiles.length}`);

  if (plan.excludedFiles.length > 0) {
    lines.push("\n  Excluded files:");
    for (const file of plan.excludedFiles.slice(0, 5)) {
      lines.push(`    - ${basename(file.path)} (~${file.fullTokens} tokens)`);
    }
    if (plan.excludedFiles.length > 5) {
      lines.push(`    ... and ${plan.excludedFiles.length - 5} more`);
    }
  }

  return lines.join("\n");
}
