/**
 * Exploration Review Handler
 *
 * Implements Option C: Agentic Exploration
 *
 * For unknown scope, audit, or discovery tasks:
 * - No upfront context packing
 * - Agent uses glob/grep/read tools to explore
 * - Discovers relevant files incrementally
 * - Builds understanding as it goes
 *
 * Best for:
 * - "Audit this codebase"
 * - "Review this repo for security issues"
 * - Unknown scope reviews
 */

import { $ } from "bun";
import { join } from "path";
import { homedir } from "os";

/** Configuration for exploration review */
export interface ExplorationConfig {
  /** Root path to explore */
  rootPath: string;
  /** Base branch for git diff (optional) */
  baseBranch?: string;
  /** Maximum iterations to prevent runaway */
  maxIterations: number;
  /** Focus area for the audit */
  focus?: "security" | "performance" | "general";
  /** CLAUDE.md content for guidelines */
  guidelines?: string;
}

/** Result from exploration review */
export interface ExplorationResult {
  /** Review output */
  review: string;
  /** Files that were examined */
  filesExamined: string[];
  /** Verdict */
  verdict: "SHIP" | "NEEDS_WORK" | "MAJOR_RETHINK";
}

/**
 * Get chats directory path
 */
function getChatsDir(): string {
  const xdgDataHome = process.env.XDG_DATA_HOME;
  if (xdgDataHome) {
    return join(xdgDataHome, "wdyt", "chats");
  }
  return join(homedir(), ".wdyt", "chats");
}

/**
 * Build the exploration system prompt
 *
 * This prompt gives the agent access to tools and instructions
 * for exploring the codebase.
 */
function buildExplorationPrompt(config: ExplorationConfig): string {
  const focusInstructions: Record<string, string> = {
    security: `## Focus: Security Audit

You are performing a security audit. Look for:
- Injection vulnerabilities (SQL, XSS, command injection)
- Authentication and authorization issues
- Sensitive data exposure
- Hardcoded secrets or credentials
- Insecure dependencies
- Missing input validation

Use the tools to explore the codebase and find security issues.`,

    performance: `## Focus: Performance Audit

You are performing a performance audit. Look for:
- N+1 query patterns
- Unbounded data fetching
- Missing pagination
- Inefficient algorithms (O(n²) loops)
- Memory leaks
- Blocking operations on hot paths
- Missing caching opportunities

Use the tools to explore the codebase and find performance issues.`,

    general: `## Focus: General Code Audit

You are performing a general code audit. Look for:
- Correctness issues and bugs
- Security vulnerabilities
- Performance problems
- Code complexity and maintainability
- Test coverage gaps
- Documentation issues

Use the tools to explore the codebase systematically.`,
  };

  const instructions = focusInstructions[config.focus || "general"];
  const guidelines = config.guidelines
    ? `\n## Project Guidelines\n\n${config.guidelines}\n`
    : "";

  return `You are a code auditor exploring a codebase to find issues.

${instructions}
${guidelines}

## Tools Available

You have full access to Claude Code's tools:
- **Glob** - Find files by pattern (e.g., "**/*.ts")
- **Grep** - Search file contents for patterns
- **Read** - Read file contents
- **Bash** - Run git commands, etc.

Use these tools to explore the codebase systematically.

## Exploration Strategy

1. **Understand structure**: Use Glob to find key files
   - Look for package.json, tsconfig.json, entry points
   - Map out the directory structure

2. **Find relevant code**: Use Grep to search for patterns
   - For security: search for "password", "secret", "eval", "exec"
   - For performance: search for loops, database queries

3. **Deep dive**: Use Read to examine suspicious files
   - Look at the actual implementation
   - Check for edge cases and error handling

4. **Document findings** as you go with file:line references

## Output Format

As you explore, document findings in this format:

<finding>
  <severity>critical|major|minor</severity>
  <file>path/to/file.ts</file>
  <line>42</line>
  <issue>Description of the problem</issue>
  <evidence>Why this is a problem</evidence>
  <fix>Suggested fix</fix>
</finding>

When done, end with a summary:

<summary>
  <files_examined>N</files_examined>
  <findings_count>M</findings_count>
  <risk_level>low|medium|high</risk_level>
</summary>

<verdict>SHIP|NEEDS_WORK|MAJOR_RETHINK</verdict>

## Important

- Be thorough but efficient
- Focus on real issues, not style preferences
- Stop when you've covered the important areas
- Maximum ${config.maxIterations} tool calls allowed

## Root Path

The codebase is at: ${config.rootPath}

Begin your exploration.`;
}

/**
 * Run Claude CLI with exploration mode (agentic, read-only)
 *
 * Uses normal claude mode (not -p) for tool access, but restricted
 * to read-only tools via --allowedTools to prevent modifications.
 */
async function runExplorationClaude(prompt: string, rootPath: string): Promise<string> {
  const tempPath = join(getChatsDir(), `exploration-${Date.now()}.txt`);
  await Bun.write(tempPath, prompt);

  try {
    // Use agentic mode with read-only tools
    // --allowedTools restricts to safe, read-only operations
    // --no-session-persistence keeps it out of /resume history
    const allowedTools = "Glob,Grep,Read,LS,Bash";
    const result = await $`cd ${rootPath} && cat ${tempPath} | claude --no-session-persistence --allowedTools ${allowedTools}`.text();
    await $`rm ${tempPath}`.quiet();
    return result.trim();
  } catch (error) {
    await $`rm ${tempPath}`.quiet();
    throw error;
  }
}

/**
 * Parse verdict from exploration output
 */
function parseVerdict(output: string): ExplorationResult["verdict"] {
  const verdictMatch = output.match(/<verdict>(SHIP|NEEDS_WORK|MAJOR_RETHINK)<\/verdict>/i);
  if (verdictMatch) {
    return verdictMatch[1].toUpperCase() as ExplorationResult["verdict"];
  }
  return "NEEDS_WORK"; // Default to needs work if no clear verdict
}

/**
 * Parse files examined from output (if mentioned)
 */
function parseFilesExamined(output: string): string[] {
  // Try to find file paths mentioned in findings or exploration
  const fileMatches = output.match(/<file>([^<]+)<\/file>/g) || [];
  const files = fileMatches.map((m) => m.replace(/<\/?file>/g, ""));
  return [...new Set(files)]; // Dedupe
}

/**
 * Run exploration-based review
 *
 * @param config - Exploration configuration
 * @returns Review result
 */
export async function runExplorationReview(
  config: ExplorationConfig
): Promise<ExplorationResult> {
  console.error(`Starting exploration review in ${config.rootPath}...`);
  console.error(`Focus: ${config.focus || "general"}`);

  const prompt = buildExplorationPrompt(config);

  try {
    // Run with full agentic tool access
    const output = await runExplorationClaude(prompt, config.rootPath);
    const verdict = parseVerdict(output);
    const filesExamined = parseFilesExamined(output);

    return {
      review: output,
      filesExamined,
      verdict,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      review: `Exploration failed: ${message}`,
      filesExamined: [],
      verdict: "NEEDS_WORK",
    };
  }
}

/**
 * Default exploration configuration
 */
export const DEFAULT_EXPLORATION_CONFIG: Partial<ExplorationConfig> = {
  maxIterations: 50,
  focus: "general",
};
