/**
 * Chat commands - chat_send
 *
 * Commands:
 * - call chat_send {json}: Export context (prompt + files) to XML
 *
 * Compatible with flowctl.py:
 * - Line 3975: call chat_send {payload}
 * - Line 272-289: build_chat_payload structure
 *
 * Payload structure:
 * {
 *   "message": string,      // The prompt/message
 *   "mode": string,         // Mode (e.g., "review")
 *   "new_chat"?: boolean,   // Start new chat
 *   "chat_name"?: string,   // Optional name
 *   "selected_paths"?: string[] // Files to include
 * }
 */

import { mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { $ } from "bun";
import { getTab, getWindow } from "../state";
import { processReReview, recordReview } from "../context/rereview";
import {
  buildOptimizedContext,
  formatContextPlanSummary,
} from "../context";

/**
 * Chat send payload structure (from flowctl.py build_chat_payload)
 */
export interface ChatSendPayload {
  message: string;
  mode: string;
  new_chat?: boolean;
  chat_name?: string;
  chat_id?: string; // Continue specific chat by ID (for re-reviews)
  selected_paths?: string[];
  base_branch?: string; // Base branch for changed files detection
  review_type?: string; // Type of review for preamble (e.g., "implementation", "plan")
}

/**
 * Verdict type for code reviews
 */
export type Verdict = "SHIP" | "NEEDS_WORK" | "MAJOR_RETHINK";

/**
 * Chat send response
 */
export interface ChatSendResponse {
  id: string;
  path: string;
  review?: string;
  verdict?: Verdict;
  isReReview?: boolean;
  changedFiles?: string[];
  /** Selected review strategy */
  strategy?: {
    type: string;
    reason: string;
  };
  /** Context plan showing what was included/excluded */
  contextPlan?: {
    fullFiles: number;
    codeMappedFiles: number;
    excludedFiles: number;
    totalTokens: number;
  };
}

/**
 * Get the chats directory path
 */
function getChatsDir(): string {
  const xdgDataHome = process.env.XDG_DATA_HOME;
  if (xdgDataHome) {
    return join(xdgDataHome, "wdyt", "chats");
  }
  return join(homedir(), ".wdyt", "chats");
}

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Check if claude CLI is available
 */
async function claudeCliAvailable(): Promise<boolean> {
  try {
    await $`which claude`.quiet();
    return true;
  } catch {
    return false;
  }
}

/**
 * Embedded quality-auditor skill (fallback when file not found)
 * This is used when running as a compiled binary
 */
const EMBEDDED_QUALITY_AUDITOR = `You are a pragmatic code auditor. Your job is to find real risks in recent changes - fast.

## Audit Strategy

### 1. Quick Scan (find obvious issues fast)
- **Secrets**: API keys, passwords, tokens in code
- **Debug code**: console.log, debugger, TODO/FIXME
- **Commented code**: Dead code that should be deleted
- **Large files**: Accidentally committed binaries, logs

### 2. Correctness Review
- Does the code match the stated intent?
- Are there off-by-one errors, wrong operators, inverted conditions?
- Do error paths actually handle errors?
- Are promises/async properly awaited?

### 3. Security Scan
- **Injection**: SQL, XSS, command injection vectors
- **Auth/AuthZ**: Are permissions checked? Can they be bypassed?
- **Data exposure**: Is sensitive data logged, leaked, or over-exposed?
- **Dependencies**: Any known vulnerable packages added?

### 4. Simplicity Check
- Could this be simpler?
- Is there duplicated code that should be extracted?
- Are there unnecessary abstractions?
- Over-engineering for hypothetical future needs?

### 5. Test Coverage
- Are new code paths tested?
- Do tests actually assert behavior (not just run)?
- Are edge cases from gap analysis covered?
- Are error paths tested?

### 6. Performance Red Flags
- N+1 queries or O(n²) loops
- Unbounded data fetching
- Missing pagination/limits
- Blocking operations on hot paths

## Output Format

\`\`\`markdown
## Quality Audit: [Branch/Feature]

### Summary
- Files changed: N
- Risk level: Low / Medium / High
- Ship recommendation: ✅ Ship / ⚠️ Fix first / ❌ Major rework

### Critical (MUST fix before shipping)
- **[File:line]**: [Issue]
  - Risk: [What could go wrong]
  - Fix: [Specific suggestion]

### Should Fix (High priority)
- **[File:line]**: [Issue]
  - [Brief fix suggestion]

### Consider (Nice to have)
- [Minor improvement suggestion]

### Test Gaps
- [ ] [Untested scenario]

### Security Notes
- [Any security observations]

### What's Good
- [Positive observations - patterns followed, good decisions]
\`\`\`

## Rules

- Find real risks, not style nitpicks
- Be specific: file:line + concrete fix
- Critical = could cause outage, data loss, security breach
- Don't block shipping for minor issues
- Acknowledge what's done well
- If no issues found, say so clearly`;

/**
 * Embedded router prompt - teaches Claude to load skills via wdyt CLI
 */
const EMBEDDED_ROUTER = `You are an expert code reviewer. First, analyze the context to decide the best review approach.

## Step 1: Analyze What You've Been Given

Look at the context provided:
- How many files?
- How many lines changed?
- What kind of change? (bug fix, feature, refactor, security-related)
- Is there a clear spec or requirements?

## Step 2: Choose and Load Your Skill

Based on your analysis, choose ONE approach and load its instructions:

### Quick Review
**When:** 1-3 files, <500 lines, clear purpose, bug fix or small feature
**Load:** Run \`wdyt -e 'skill get review-quick'\`

### Thorough Review
**When:** 4-10 files, significant changes, needs careful analysis
**Load:** Run \`wdyt -e 'skill get review-thorough'\`

### Security Review
**When:** Code touches auth, crypto, user input, sensitive data, or APIs
**Load:** Run \`wdyt -e 'skill get review-security'\`

### Exploration Review
**When:** No specific files given, asked to "audit" or "explore"
**Load:** Run \`wdyt -e 'skill get review-exploration'\`

## Step 3: Execute

1. State which approach you're using and why (1 sentence)
2. Run the wdyt command to load the skill instructions
3. Follow those instructions exactly

## Output

Always end with:
\`\`\`
<verdict>SHIP|NEEDS_WORK|MAJOR_RETHINK</verdict>
\`\`\``;

/**
 * Get the skills directory path (bundled with the package)
 */
function getSkillsDir(): string {
  // import.meta.dir is the directory of this file (src/commands)
  // skills/ is at the package root, so go up two levels
  return join(import.meta.dir, "..", "..", "skills");
}

/**
 * Load a skill prompt from a .md file
 * Falls back to embedded prompt when running as compiled binary
 */
async function loadSkillPrompt(skillName: string): Promise<string> {
  // Try to load from file first
  const skillPath = join(getSkillsDir(), `${skillName}.md`);
  const file = Bun.file(skillPath);

  if (await file.exists()) {
    const content = await file.text();
    // Strip YAML frontmatter if present
    const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n/);
    if (frontmatterMatch) {
      return content.slice(frontmatterMatch[0].length).trim();
    }
    return content.trim();
  }

  // Fallback to embedded prompt (for compiled binary)
  if (skillName === "quality-auditor") {
    return EMBEDDED_QUALITY_AUDITOR;
  }
  if (skillName === "review-router") {
    return EMBEDDED_ROUTER;
  }

  throw new Error(`Skill not found: ${skillName}`);
}

/**
 * Parse verdict from Claude's response
 * Looks for <verdict>SHIP|NEEDS_WORK|MAJOR_RETHINK</verdict> tag
 *
 * @param response - The raw response from Claude
 * @returns The parsed verdict or undefined if not found
 */
function parseVerdict(response: string): Verdict | undefined {
  const verdictMatch = response.match(/<verdict>(SHIP|NEEDS_WORK|MAJOR_RETHINK)<\/verdict>/i);
  if (verdictMatch) {
    // Normalize to uppercase since the regex is case-insensitive
    return verdictMatch[1].toUpperCase() as Verdict;
  }
  return undefined;
}

/**
 * Run an agentic review using Claude CLI
 * Uses the router prompt to let Claude decide the review strategy
 * Claude loads skills via `wdyt -e 'skill get <name>'` command
 *
 * @param contextXml - The packed context XML
 * @param userPrompt - User's review request
 * @param rootPath - Root path of the project (for tool access)
 */
async function runAgenticReview(contextXml: string, userPrompt: string, rootPath: string): Promise<string> {
  // Load the router prompt (teaches Claude to load skills via wdyt CLI)
  const routerPrompt = await loadSkillPrompt("review-router");

  // Build the full prompt with router + user request + context
  const fullPrompt = `${routerPrompt}

## User Request

${userPrompt}

## Context

${contextXml}`;

  // Write prompt to temp file to avoid shell escaping issues
  const tempPromptPath = join(getChatsDir(), `prompt-${Date.now()}.txt`);
  await Bun.write(tempPromptPath, fullPrompt);

  try {
    // Run claude CLI in AGENTIC mode (no -p flag) with tool access
    // Allow Read tool so Claude can load skill files
    const allowedTools = "Read,Glob,Grep,Bash";
    const result = await $`cd ${rootPath} && cat ${tempPromptPath} | claude --no-session-persistence --allowedTools ${allowedTools}`.text();

    // Clean up temp file
    await $`rm ${tempPromptPath}`.quiet();

    return result.trim();
  } catch (error) {
    // Clean up temp file on error too
    await $`rm ${tempPromptPath}`.quiet();

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Claude CLI review failed: ${message}`);
  }
}


/**
 * Read file content safely using Bun's file API
 */
async function readFileSafe(path: string): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) {
      return { success: false, error: `File not found: ${path}` };
    }
    const content = await file.text();
    return { success: true, content };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Chat send command
 *
 * Exports context (prompt + selected files) to an XML file
 *
 * @param windowId - Window ID
 * @param tabId - Tab ID
 * @param payloadJson - JSON string with chat_send payload
 * @returns Chat ID in format "Chat: `<uuid>`"
 */
export async function chatSendCommand(
  windowId: number,
  tabId: string,
  payloadJson: string
): Promise<{
  success: boolean;
  data?: ChatSendResponse;
  output?: string;
  error?: string;
}> {
  try {
    // Parse the JSON payload
    const payload = JSON.parse(payloadJson) as ChatSendPayload;

    // Get tab state for prompt and selected files
    const tab = await getTab(windowId, tabId);
    const window = await getWindow(windowId);

    // Check for re-review scenario
    // Re-review is detected when:
    // - chat_id is provided (continuing a previous chat)
    // - new_chat is explicitly false (not starting fresh)
    const isReReviewExplicit = payload.chat_id !== undefined || payload.new_chat === false;
    const reReviewResult = await processReReview({
      chatId: payload.chat_id,
      isReReview: isReReviewExplicit,
      baseBranch: payload.base_branch,
      reviewType: payload.review_type,
    });

    // Use message from payload as the prompt, or fall back to tab's prompt
    // Prepend re-review preamble if this is a re-review
    let prompt = payload.message || tab.prompt;
    if (reReviewResult.isReReview && reReviewResult.preamble) {
      prompt = reReviewResult.preamble + prompt;
    }

    // Resolve root path first for git operations
    const rootPath = window.rootFolderPaths[0] || process.cwd();

    // Determine which files to include
    // Use selected_paths from payload if provided, otherwise use tab's selectedFiles
    let filePaths = payload.selected_paths || tab.selectedFiles;

    // Resolve relative paths against window root (rootPath already defined above)
    filePaths = filePaths.map((p) => {
      if (p.startsWith("/")) return p;
      return join(rootPath, p);
    });

    // Read file contents
    const files: Array<{ path: string; content: string }> = [];

    for (const filePath of filePaths) {
      const result = await readFileSafe(filePath);
      if (result.success && result.content !== undefined) {
        files.push({ path: filePath, content: result.content });
      }
      // Missing files are silently ignored to avoid polluting stderr
    }

    // Load router prompt for token budget calculation (it's small)
    const routerPrompt = await loadSkillPrompt("review-router");

    // Build optimized context with code maps for large files
    const { xml: xmlContent, plan: contextPlan } = await buildOptimizedContext(
      files,
      prompt,
      routerPrompt,
      {
        maxTokens: 50_000, // Safe limit (RepoPrompt uses 60k)
        baseBranch: payload.base_branch,
        rootPath,
        includeGitDiff: true,
      }
    );

    // Log context plan summary if any files were excluded or converted to code maps
    if (contextPlan.codeMappedFiles.length > 0 || contextPlan.excludedFiles.length > 0) {
      console.error(formatContextPlanSummary(contextPlan));
    }

    // Generate chat ID
    const chatId = generateUUID();

    // Ensure chats directory exists
    const chatsDir = getChatsDir();
    mkdirSync(chatsDir, { recursive: true });

    // Write the XML file
    const chatPath = join(chatsDir, `${chatId}.xml`);
    await Bun.write(chatPath, xmlContent);

    // Record this review for future re-review detection
    recordReview(chatId, files.map((f) => f.path));

    // Build context plan summary for response
    const contextPlanSummary = {
      fullFiles: contextPlan.fullFiles.length,
      codeMappedFiles: contextPlan.codeMappedFiles.length,
      excludedFiles: contextPlan.excludedFiles.length,
      totalTokens: contextPlan.totalTokens,
    };

    // Run agentic review - Claude decides the strategy
    if (await claudeCliAvailable()) {
      console.error("Running agentic review (Claude decides strategy)...");
      const response = await runAgenticReview(xmlContent, prompt, rootPath);
      const verdict = parseVerdict(response);

      return {
        success: true,
        data: {
          id: chatId,
          path: chatPath,
          review: response,
          verdict,
          isReReview: reReviewResult.isReReview,
          changedFiles: reReviewResult.changedFiles,
          strategy: {
            type: "agentic",
            reason: "Claude decides based on context",
          },
          contextPlan: contextPlanSummary,
        },
        output: `Chat: \`${chatId}\`\n\n${response}`,
      };
    }

    // Fallback: just return the chat ID if Claude CLI isn't available
    return {
      success: true,
      data: {
        id: chatId,
        path: chatPath,
        isReReview: reReviewResult.isReReview,
        changedFiles: reReviewResult.changedFiles,
        strategy: {
          type: "context-only",
          reason: "Claude CLI not available",
        },
        contextPlan: contextPlanSummary,
      },
      output: `Chat: \`${chatId}\`\n\nContext exported to: ${chatPath}\n(Install Claude CLI for automatic LLM processing)`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to send chat: ${message}`,
    };
  }
}
