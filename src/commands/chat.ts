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
 * Get the skills directory path (bundled with the package)
 */
function getSkillsDir(): string {
  // import.meta.dir is the directory of this file (src/commands)
  // skills/ is at the package root, so go up two levels
  return join(import.meta.dir, "..", "..", "skills");
}

/**
 * Load a skill prompt from a .md file
 * Strips YAML frontmatter (---...---) and returns the content
 */
async function loadSkillPrompt(skillName: string): Promise<string> {
  const skillPath = join(getSkillsDir(), `${skillName}.md`);
  const file = Bun.file(skillPath);

  if (!(await file.exists())) {
    throw new Error(`Skill not found: ${skillPath}`);
  }

  const content = await file.text();

  // Strip YAML frontmatter if present
  const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n/);
  if (frontmatterMatch) {
    return content.slice(frontmatterMatch[0].length).trim();
  }

  return content.trim();
}

/**
 * Run a chat using Claude CLI
 * Sends the prompt + context to Claude and returns the response
 */
async function runClaudeChat(contextPath: string, prompt: string): Promise<string> {
  // Read the context file content first
  const contextFile = Bun.file(contextPath);
  const contextContent = await contextFile.text();

  // Load the quality auditor skill prompt
  const skillPrompt = await loadSkillPrompt("quality-auditor");

  // Build the full prompt with skill prompt + user prompt + context
  const fullPrompt = `${skillPrompt}

## User Request

${prompt}

<context>
${contextContent}
</context>`;

  // Write prompt to temp file to avoid shell escaping issues
  const tempPromptPath = join(getChatsDir(), `prompt-${Date.now()}.txt`);
  await Bun.write(tempPromptPath, fullPrompt);

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

    // Always run Claude CLI to process the chat - that's what a drop-in rp-cli replacement does
    if (await claudeCliAvailable()) {
      console.error("[wdyt] Processing with Claude CLI...");
      const response = await runClaudeChat(chatPath, prompt);

      return {
        success: true,
        data: { id: chatId, path: chatPath, review: response },
        output: `Chat: \`${chatId}\`\n\n${response}`,
      };
    }

    // Fallback: just return the chat ID if Claude CLI isn't available
    console.error("[wdyt] Claude CLI not found, returning context only");
    return {
      success: true,
      data: { id: chatId, path: chatPath },
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
