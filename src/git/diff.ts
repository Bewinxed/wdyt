/**
 * Git diff context module for wdyt
 *
 * Gathers git context for code reviews including diff stats,
 * commit history, and changed files.
 */

import { spawn } from "child_process";

/** Options for getting git diff context */
export interface GitDiffOptions {
  /** Base branch/commit to diff against (default: "main") */
  base?: string;
  /** Target ref to compare (default: "HEAD") */
  head?: string;
  /** Working directory (defaults to cwd) */
  cwd?: string;
}

/** Git diff context result */
export interface GitDiffContext {
  /** Diff stat summary */
  diffStat: string;
  /** Commit history */
  commits: string[];
  /** List of changed files */
  changedFiles: string[];
  /** Current branch name */
  branch: string;
}

/**
 * Execute a git command and return stdout
 */
async function execGit(
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const process = spawn("git", args, {
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
      resolve({ stdout: "", stderr: "Failed to spawn git", exitCode: 1 });
    });
  });
}

/**
 * Get git diff --stat between base and head
 */
export async function getDiffStat(
  options: GitDiffOptions = {}
): Promise<string> {
  const { base = "main", head = "HEAD", cwd = process.cwd() } = options;

  const { stdout, exitCode } = await execGit(
    ["diff", "--stat", `${base}...${head}`],
    cwd
  );

  if (exitCode !== 0) {
    return "";
  }

  return stdout.trim();
}

/**
 * Get commit history between base and head
 */
export async function getCommits(
  options: GitDiffOptions = {}
): Promise<string[]> {
  const { base = "main", head = "HEAD", cwd = process.cwd() } = options;

  const { stdout, exitCode } = await execGit(
    ["log", "--oneline", `${base}..${head}`],
    cwd
  );

  if (exitCode !== 0) {
    return [];
  }

  return stdout
    .trim()
    .split("\n")
    .filter((line) => line.trim() !== "");
}

/**
 * Get list of changed files between base and head
 */
export async function getChangedFiles(
  options: GitDiffOptions = {}
): Promise<string[]> {
  const { base = "main", head = "HEAD", cwd = process.cwd() } = options;

  const { stdout, exitCode } = await execGit(
    ["diff", "--name-only", `${base}...${head}`],
    cwd
  );

  if (exitCode !== 0) {
    return [];
  }

  return stdout
    .trim()
    .split("\n")
    .filter((line) => line.trim() !== "");
}

/**
 * Get current branch name
 */
export async function getBranchName(cwd: string = process.cwd()): Promise<string> {
  const { stdout, exitCode } = await execGit(
    ["rev-parse", "--abbrev-ref", "HEAD"],
    cwd
  );

  if (exitCode !== 0) {
    return "";
  }

  return stdout.trim();
}

/**
 * Get full git diff context
 */
export async function getGitDiffContext(
  options: GitDiffOptions = {}
): Promise<GitDiffContext> {
  const { cwd = process.cwd() } = options;

  // Run all git commands in parallel
  const [diffStat, commits, changedFiles, branch] = await Promise.all([
    getDiffStat(options),
    getCommits(options),
    getChangedFiles(options),
    getBranchName(cwd),
  ]);

  return {
    diffStat,
    commits,
    changedFiles,
    branch,
  };
}

/**
 * Format git diff context as XML block (matching flowctl format)
 */
export function formatDiffContextXml(context: GitDiffContext): string {
  const sections: string[] = [];

  if (context.diffStat) {
    sections.push(`<diff_summary>\n${context.diffStat}\n</diff_summary>`);
  }

  if (context.commits.length > 0) {
    sections.push(`<commits>\n${context.commits.join("\n")}\n</commits>`);
  }

  if (context.changedFiles.length > 0) {
    sections.push(
      `<changed_files>\n${context.changedFiles.join("\n")}\n</changed_files>`
    );
  }

  return sections.join("\n\n");
}

/**
 * Get formatted git diff context as XML
 *
 * This is the main entry point for getting review context.
 */
export async function getFormattedDiffContext(
  options: GitDiffOptions = {}
): Promise<string> {
  const context = await getGitDiffContext(options);
  return formatDiffContextXml(context);
}
