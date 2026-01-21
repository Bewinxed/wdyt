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
import { join, dirname, basename } from "path";
import { homedir } from "os";
import { $ } from "bun";
import { getTab, getWindow } from "../state";

/**
 * Chat send payload structure (from flowctl.py build_chat_payload)
 */
export interface ChatSendPayload {
  message: string;
  mode: string;
  new_chat?: boolean;
  chat_name?: string;
  selected_paths?: string[];
}

/**
 * Chat send response
 */
export interface ChatSendResponse {
  id: string;
  path: string;
  review?: string;
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
 * Run a review using Claude CLI
 * Returns the review output including verdict
 */
async function runClaudeReview(contextPath: string, prompt: string): Promise<string> {
  // Read the context file content first
  const contextFile = Bun.file(contextPath);
  const contextContent = await contextFile.text();

  const reviewPrompt = `You are reviewing code changes. Analyze the following context and provide a thorough review.

Review instructions:
${prompt}

<context>
${contextContent}
</context>

Analyze the code for:
- Correctness - Logic errors, bugs, spec compliance
- Security - Injection risks, auth gaps, data exposure
- Simplicity - Over-engineering, unnecessary complexity
- Edge cases - Failure modes, boundary conditions

Provide findings organized by severity (Critical > Major > Minor).

REQUIRED: End your review with exactly one verdict tag:
<verdict>SHIP</verdict> - Code is production-ready
<verdict>NEEDS_WORK</verdict> - Issues must be fixed first
<verdict>MAJOR_RETHINK</verdict> - Fundamental problems require redesign`;

  // Write prompt to temp file to avoid shell escaping issues
  const tempPromptPath = join(getChatsDir(), `review-prompt-${Date.now()}.txt`);
  await Bun.write(tempPromptPath, reviewPrompt);

  try {
    // Run claude CLI in print mode, reading from temp file
    const result = await $`cat ${tempPromptPath} | claude -p`.text();

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
 * Build XML content with prompt and files
 *
 * Format:
 * <context>
 *   <prompt>...</prompt>
 *   <files>
 *     <file path="...">content</file>
 *     ...
 *   </files>
 *   <directory_structure>...</directory_structure>
 * </context>
 */
function buildContextXml(
  prompt: string,
  files: Array<{ path: string; content: string }>,
  directoryStructure: string
): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push("<context>");

  // Add prompt
  lines.push("  <prompt>");
  lines.push(`    ${escapeXml(prompt)}`);
  lines.push("  </prompt>");

  // Add files
  if (files.length > 0) {
    lines.push("  <files>");
    for (const file of files) {
      lines.push(`    <file path="${escapeXml(file.path)}">`);
      lines.push(escapeXml(file.content));
      lines.push("    </file>");
    }
    lines.push("  </files>");
  }

  // Add directory structure
  if (directoryStructure) {
    lines.push("  <directory_structure>");
    lines.push(`    ${escapeXml(directoryStructure)}`);
    lines.push("  </directory_structure>");
  }

  lines.push("</context>");
  return lines.join("\n");
}

/**
 * Build directory structure string from file paths
 */
function buildDirectoryStructure(paths: string[]): string {
  if (paths.length === 0) return "";

  // Group files by directory
  const dirs = new Map<string, string[]>();

  for (const path of paths) {
    const dir = dirname(path);
    const file = basename(path);
    if (!dirs.has(dir)) {
      dirs.set(dir, []);
    }
    dirs.get(dir)!.push(file);
  }

  // Build tree-like structure
  const lines: string[] = [];
  const sortedDirs = Array.from(dirs.keys()).sort();

  for (const dir of sortedDirs) {
    lines.push(`${dir}/`);
    const files = dirs.get(dir)!.sort();
    for (const file of files) {
      lines.push(`  ${file}`);
    }
  }

  return lines.join("\n");
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

    // Use message from payload as the prompt, or fall back to tab's prompt
    const prompt = payload.message || tab.prompt;

    // Determine which files to include
    // Use selected_paths from payload if provided, otherwise use tab's selectedFiles
    let filePaths = payload.selected_paths || tab.selectedFiles;

    // Resolve relative paths against window root
    const rootPath = window.rootFolderPaths[0] || process.cwd();
    filePaths = filePaths.map((p) => {
      if (p.startsWith("/")) return p;
      return join(rootPath, p);
    });

    // Read file contents
    const files: Array<{ path: string; content: string }> = [];
    const errors: string[] = [];

    for (const filePath of filePaths) {
      const result = await readFileSafe(filePath);
      if (result.success && result.content !== undefined) {
        files.push({ path: filePath, content: result.content });
      } else {
        // Handle missing files gracefully - just skip them and log
        errors.push(`Skipped: ${filePath} (${result.error})`);
      }
    }

    // Log any skipped files to stderr so users are aware
    if (errors.length > 0) {
      console.error(`Warning: ${errors.length} file(s) skipped:`);
      for (const err of errors) {
        console.error(`  ${err}`);
      }
    }

    // Build directory structure from the files we successfully read
    const directoryStructure = buildDirectoryStructure(files.map((f) => f.path));

    // Build the XML content
    const xmlContent = buildContextXml(prompt, files, directoryStructure);

    // Generate chat ID
    const chatId = generateUUID();

    // Ensure chats directory exists
    const chatsDir = getChatsDir();
    mkdirSync(chatsDir, { recursive: true });

    // Write the XML file
    const chatPath = join(chatsDir, `${chatId}.xml`);
    await Bun.write(chatPath, xmlContent);

    // Check if this is a review request - if so, run Claude CLI to do the review
    const isReviewMode = payload.mode === "review";

    if (isReviewMode) {
      // Check if claude CLI is available
      if (!(await claudeCliAvailable())) {
        return {
          success: false,
          error: "Review mode requires Claude CLI (claude) to be installed and in PATH",
        };
      }

      // Run the review using Claude CLI
      console.error("Running review with Claude CLI...");
      const reviewOutput = await runClaudeReview(chatPath, prompt);

      return {
        success: true,
        data: { id: chatId, path: chatPath, review: reviewOutput },
        output: `Chat: \`${chatId}\`\n\n${reviewOutput}`,
      };
    }

    // Return in the expected format: Chat: `<uuid>`
    return {
      success: true,
      data: { id: chatId, path: chatPath },
      output: `Chat: \`${chatId}\``,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to send chat: ${message}`,
    };
  }
}
