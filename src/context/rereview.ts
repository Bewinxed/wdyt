/**
 * Re-review cache-busting module
 *
 * Detects when a chat is a re-review (same chat ID continuing) and prepends
 * cache-busting instructions telling the model to re-read changed files.
 *
 * Compatible with flowctl.py:
 * - build_rereview_preamble() (line 974-998)
 * - is_rereview detection via session_id/chat_id (line 4314-4324)
 */

import { $ } from "bun";

/**
 * Re-review options
 */
export interface ReReviewOptions {
  /** Previous chat ID (if continuing a chat) */
  chatId?: string;
  /** Explicit flag indicating this is a re-review */
  isReReview?: boolean;
  /** Base branch/commit for computing changed files */
  baseBranch?: string;
  /** Review type for the preamble message */
  reviewType?: string;
}

/**
 * Re-review state tracking
 * Maps chat IDs to their last review timestamp/commit
 */
const reReviewState = new Map<string, { timestamp: number; files: string[] }>();

/**
 * Build the re-review preamble instructing the model to re-read changed files.
 *
 * Based on flowctl's build_rereview_preamble()
 *
 * @param changedFiles - List of files that have changed since last review
 * @param reviewType - Type of review (e.g., "implementation", "plan")
 * @returns The preamble markdown string
 */
export function buildReReviewPreamble(changedFiles: string[], reviewType: string = "implementation"): string {
  // Cap at 30 files to avoid overwhelming the preamble
  const MAX_FILES = 30;
  let filesList = changedFiles.slice(0, MAX_FILES).map((f) => `- ${f}`).join("\n");

  if (changedFiles.length > MAX_FILES) {
    filesList += `\n- ... and ${changedFiles.length - MAX_FILES} more files`;
  }

  return `## IMPORTANT: Re-review After Fixes

This is a RE-REVIEW. Code has been modified since your last review.

**You MUST re-read these files before reviewing** - your cached view is stale:
${filesList}

Use your file reading tools to get the CURRENT content of these files.
Do NOT rely on what you saw in the previous review - the code has changed.

After re-reading, conduct a fresh ${reviewType} review on the updated code.

---

`;
}

/**
 * Get changed files using git diff against a base branch/commit
 *
 * @param baseBranch - Base branch or commit to diff against (default: "main")
 * @returns Array of changed file paths
 */
export async function getChangedFiles(baseBranch: string = "main"): Promise<string[]> {
  try {
    // Get list of changed files (both staged and unstaged)
    const result = await $`git diff --name-only ${baseBranch}...HEAD`.text();
    const files = result
      .trim()
      .split("\n")
      .filter((f) => f.length > 0);
    return files;
  } catch {
    // Fallback: try diffing against base directly (not merge-base)
    try {
      const result = await $`git diff --name-only ${baseBranch}`.text();
      const files = result
        .trim()
        .split("\n")
        .filter((f) => f.length > 0);
      return files;
    } catch {
      return [];
    }
  }
}

/**
 * Detect if this is a re-review scenario
 *
 * A re-review is detected when:
 * 1. chatId is provided AND matches a previous review state
 * 2. isReReview flag is explicitly set to true
 * 3. The payload contains chat_id (indicating continuation)
 *
 * @param options - Re-review detection options
 * @returns True if this is a re-review scenario
 */
export function detectReReview(options: ReReviewOptions): boolean {
  // Explicit flag takes precedence
  if (options.isReReview === true) {
    return true;
  }

  // Check if chatId indicates a re-review (continuing same chat)
  if (options.chatId) {
    return reReviewState.has(options.chatId);
  }

  return false;
}

/**
 * Record that a review was performed for a chat
 *
 * This is used to track review state for detecting re-reviews
 *
 * @param chatId - The chat ID that was reviewed
 * @param files - Files that were included in the review
 */
export function recordReview(chatId: string, files: string[]): void {
  reReviewState.set(chatId, {
    timestamp: Date.now(),
    files,
  });
}

/**
 * Get previous review state for a chat
 *
 * @param chatId - The chat ID to look up
 * @returns Previous review state or undefined
 */
export function getPreviousReviewState(chatId: string): { timestamp: number; files: string[] } | undefined {
  return reReviewState.get(chatId);
}

/**
 * Clear review state (useful for testing)
 */
export function clearReviewState(): void {
  reReviewState.clear();
}

/**
 * Process re-review and prepend preamble if needed
 *
 * This is the main entry point for re-review handling.
 * It detects if this is a re-review, gets changed files, and
 * returns the preamble to prepend to the prompt.
 *
 * @param options - Re-review options
 * @returns Object with isReReview flag and optional preamble
 */
export async function processReReview(options: ReReviewOptions): Promise<{
  isReReview: boolean;
  preamble?: string;
  changedFiles?: string[];
}> {
  const isReReview = detectReReview(options);

  if (!isReReview) {
    return { isReReview: false };
  }

  // Get changed files
  const baseBranch = options.baseBranch || "main";
  const changedFiles = await getChangedFiles(baseBranch);

  if (changedFiles.length === 0) {
    // No changed files, but still a re-review - use a simpler preamble
    return {
      isReReview: true,
      preamble: `## IMPORTANT: Re-review After Fixes

This is a RE-REVIEW. Please re-read any files you reviewed previously as they may have changed.

---

`,
      changedFiles: [],
    };
  }

  const reviewType = options.reviewType || "implementation";
  const preamble = buildReReviewPreamble(changedFiles, reviewType);

  return {
    isReReview: true,
    preamble,
    changedFiles,
  };
}
