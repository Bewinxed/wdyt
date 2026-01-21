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

import { existsSync, readFileSync, mkdirSync } from "fs";
import { join, dirname, basename } from "path";
import { homedir } from "os";
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
    return join(xdgDataHome, "rp-cli", "chats");
  }
  return join(homedir(), ".rp-cli", "chats");
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
 * Read file content safely
 */
function readFileSafe(path: string): { success: boolean; content?: string; error?: string } {
  try {
    if (!existsSync(path)) {
      return { success: false, error: `File not found: ${path}` };
    }
    const content = readFileSync(path, "utf-8");
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
      const result = readFileSafe(filePath);
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

    // Check if this is a review request - if so, output subagent spawn instruction
    const isReviewMode = payload.mode === "review";

    if (isReviewMode) {
      // Build the review output that instructs Claude Code to spawn quality-auditor
      const reviewOutput = `Chat: \`${chatId}\`

[CLAUDE_CODE_REVIEW_REQUEST]
The context has been exported to: ${chatPath}

To complete this review, spawn a quality-auditor subagent with the Task tool:

Task(subagent_type="flow-next:quality-auditor", prompt="""
Review the code changes in this context file: ${chatPath}

Read the file, analyze the code for:
- Correctness - Logic errors, bugs
- Security - Injection, auth gaps
- Simplicity - Over-engineering
- Edge cases - Failure modes

Provide findings by severity (Critical > Major > Minor).

REQUIRED: End with exactly one verdict tag:
<verdict>SHIP</verdict> - Code is production-ready
<verdict>NEEDS_WORK</verdict> - Issues must be fixed first
""")

The subagent will return the review findings and verdict.
[/CLAUDE_CODE_REVIEW_REQUEST]`;

      return {
        success: true,
        data: { id: chatId, path: chatPath },
        output: reviewOutput,
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
