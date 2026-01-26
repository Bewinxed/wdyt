/**
 * Strategy Selector Module
 *
 * Analyzes task characteristics and selects the optimal review strategy:
 * - Single-Pass: Small/medium changes with clear scope
 * - Multi-Pass: Large/critical changes needing multiple perspectives
 * - Exploration: Unknown scope, audit, or discovery tasks
 *
 * Research-backed decisions:
 * - Problem descriptions boost accuracy +22% (arxiv 2505.20206)
 * - Multiple perspectives catch more issues (Claude official)
 * - Confidence scoring reduces false positives (Claude official)
 */

import { $ } from "bun";

/** Strategy types */
export type StrategyType = "single-pass" | "multi-pass" | "exploration";

/** Context for strategy selection */
export interface StrategyContext {
  /** Files changed in the diff */
  filesChanged: string[];
  /** Lines added */
  linesAdded: number;
  /** Lines removed */
  linesRemoved: number;
  /** Whether a task spec exists */
  hasTaskSpec: boolean;
  /** Path to task spec if available */
  taskSpecPath?: string;
  /** Type of review requested */
  reviewType?: "implementation" | "plan" | "security" | "audit";
  /** CLI flags */
  flags?: {
    /** Force multi-pass review */
    thorough?: boolean;
    /** Force single-pass review */
    quick?: boolean;
  };
  /** Average cyclomatic complexity of changed functions (from tldr cfg) */
  avgComplexity?: number;
}

/** Configuration for each strategy */
export interface StrategyConfig {
  /** Include task spec in context */
  includeSpec: boolean;
  /** Include CLAUDE.md in context */
  includeGuidelines: boolean;
  /** Include code maps for related files */
  includeCodeMaps: boolean;
  /** Number of parallel review agents (multi-pass only) */
  parallelAgents?: number;
  /** Focus areas for parallel agents */
  focuses?: string[];
  /** Confidence threshold for filtering (multi-pass only) */
  confidenceThreshold?: number;
  /** Enable tool-based exploration */
  useTools?: boolean;
  /** Maximum exploration iterations */
  maxIterations?: number;
}

/** Selected review strategy */
export interface ReviewStrategy {
  /** Strategy type */
  type: StrategyType;
  /** Human-readable reason for selection */
  reason: string;
  /** Strategy-specific configuration */
  config: StrategyConfig;
}

/** Git diff statistics */
export interface GitDiffStats {
  /** List of changed file paths */
  files: string[];
  /** Total lines added */
  additions: number;
  /** Total lines removed */
  deletions: number;
}

/**
 * Get git diff statistics
 *
 * @param baseBranch - Base branch to compare against (default: HEAD~1)
 * @returns Diff statistics with file list and line counts
 */
export async function getGitDiffStats(baseBranch?: string): Promise<GitDiffStats> {
  const branch = baseBranch || "HEAD~1";

  try {
    // Get list of changed files
    const filesResult = await $`git diff --name-only ${branch}`.text();
    const files = filesResult
      .trim()
      .split("\n")
      .filter(Boolean);

    // Get numstat for additions/deletions
    const statResult = await $`git diff --numstat ${branch}`.text();
    let additions = 0;
    let deletions = 0;

    for (const line of statResult.trim().split("\n")) {
      if (!line) continue;
      const [add, del] = line.split("\t");
      // Binary files show as "-" for add/del
      if (add !== "-") additions += parseInt(add, 10) || 0;
      if (del !== "-") deletions += parseInt(del, 10) || 0;
    }

    return { files, additions, deletions };
  } catch {
    // Not a git repo or git command failed
    return { files: [], additions: 0, deletions: 0 };
  }
}

/**
 * Select the optimal review strategy based on task characteristics
 *
 * Decision logic:
 * 1. Explicit flags override auto-detection
 * 2. Audit/exploration tasks use agentic exploration
 * 3. Large changes (>10 files) use multi-pass
 * 4. Security reviews use multi-pass
 * 5. Everything else uses optimized single-pass
 *
 * @param ctx - Strategy context with task characteristics
 * @returns Selected strategy with configuration
 */
export function selectStrategy(ctx: StrategyContext): ReviewStrategy {
  const totalLines = ctx.linesAdded + ctx.linesRemoved;
  const fileCount = ctx.filesChanged.length;

  // 1. Explicit flag overrides
  if (ctx.flags?.thorough) {
    return {
      type: "multi-pass",
      reason: "--thorough flag",
      config: {
        includeSpec: true,
        includeGuidelines: true,
        includeCodeMaps: true,
        parallelAgents: 3,
        focuses: ["correctness", "security", "simplicity"],
        confidenceThreshold: 80,
      },
    };
  }

  if (ctx.flags?.quick) {
    return {
      type: "single-pass",
      reason: "--quick flag",
      config: {
        includeSpec: ctx.hasTaskSpec,
        includeGuidelines: true,
        includeCodeMaps: false, // Skip code maps for speed
      },
    };
  }

  // 2. Audit/exploration tasks
  if (ctx.reviewType === "audit") {
    return {
      type: "exploration",
      reason: "Audit requires discovery",
      config: {
        includeSpec: false,
        includeGuidelines: true,
        includeCodeMaps: false,
        useTools: true,
        maxIterations: 50,
      },
    };
  }

  // 3. Large changes need multi-pass
  if (fileCount > 10) {
    return {
      type: "multi-pass",
      reason: `${fileCount} files changed`,
      config: {
        includeSpec: ctx.hasTaskSpec,
        includeGuidelines: true,
        includeCodeMaps: true,
        parallelAgents: 3,
        focuses: ["correctness", "security", "simplicity"],
        confidenceThreshold: 80,
      },
    };
  }

  // 4. Security reviews always use multi-pass
  if (ctx.reviewType === "security") {
    return {
      type: "multi-pass",
      reason: "Security review",
      config: {
        includeSpec: ctx.hasTaskSpec,
        includeGuidelines: true,
        includeCodeMaps: true,
        parallelAgents: 3,
        focuses: ["security", "auth", "injection"],
        confidenceThreshold: 90, // Higher threshold for security
      },
    };
  }

  // 5. High complexity: upgrade to multi-pass even for small changes
  if (ctx.avgComplexity !== undefined && ctx.avgComplexity > 15) {
    return {
      type: "multi-pass",
      reason: `High complexity (avg ${Math.round(ctx.avgComplexity)})`,
      config: {
        includeSpec: ctx.hasTaskSpec,
        includeGuidelines: true,
        includeCodeMaps: true,
        parallelAgents: 3,
        focuses: ["correctness", "edge-cases", "simplicity"],
        confidenceThreshold: 80,
      },
    };
  }

  // 6. Small/medium changes with spec use optimized single-pass
  if (fileCount <= 3 && totalLines < 500) {
    return {
      type: "single-pass",
      reason: `Small change (${fileCount} files, ${totalLines} lines)`,
      config: {
        includeSpec: ctx.hasTaskSpec,
        includeGuidelines: true,
        includeCodeMaps: false, // Small changes don't need code maps
      },
    };
  }

  // 7. Medium changes (4-10 files)
  return {
    type: "single-pass",
    reason: `Medium change (${fileCount} files)`,
    config: {
      includeSpec: ctx.hasTaskSpec,
      includeGuidelines: true,
      includeCodeMaps: true, // Include code maps for context
    },
  };
}

/**
 * Format strategy selection for logging
 *
 * @param strategy - Selected strategy
 * @returns Human-readable strategy summary
 */
export function formatStrategy(strategy: ReviewStrategy): string {
  const { type, reason, config } = strategy;

  const parts: string[] = [`Strategy: ${type}`];
  parts.push(`(${reason})`);

  if (config.parallelAgents) {
    parts.push(`[${config.parallelAgents} agents]`);
  }

  if (config.confidenceThreshold) {
    parts.push(`[confidence >= ${config.confidenceThreshold}]`);
  }

  return parts.join(" ");
}
