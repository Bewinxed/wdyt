/**
 * MCP install/uninstall commands for wdyt
 *
 * Configures Claude Code to use the wdyt MCP server,
 * either at project scope (.mcp.json) or global scope (claude mcp add).
 * Optionally updates CLAUDE.md with tool usage instructions.
 */

import { readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";

const MCP_SERVER_CONFIG = {
  type: "stdio" as const,
  command: "bunx",
  args: ["-b", "wdyt-mcp"],
};

const CLAUDE_MD_BEGIN = "<!-- BEGIN WDYT -->";
const CLAUDE_MD_END = "<!-- END WDYT -->";

const CLAUDE_MD_SECTION = `${CLAUDE_MD_BEGIN}
## Code Analysis Tools (MCP)
When exploring code, prefer the wdyt MCP tools over raw grep/read:
- Use tldr_codemap to get file overviews instead of reading entire files
- Use tldr_impact to find function callers/callees instead of grepping
- Use tldr_semantic_search to find related code by behavior
- Use tldr_structure to list all definitions in a file
- Use tldr_context for deep investigation of a specific function
- Use tldr_complexity to check cyclomatic complexity before refactoring
${CLAUDE_MD_END}`;

export async function updateClaudeMd(dir: string): Promise<string> {
  const path = join(dir, "CLAUDE.md");
  let content = "";

  try {
    content = await readFile(path, "utf-8");
  } catch {
    // File doesn't exist, will create
  }

  // Check if section already exists
  const beginIdx = content.indexOf(CLAUDE_MD_BEGIN);
  const endIdx = content.indexOf(CLAUDE_MD_END);

  if (beginIdx !== -1 && endIdx !== -1) {
    // Replace existing section
    const before = content.slice(0, beginIdx);
    const after = content.slice(endIdx + CLAUDE_MD_END.length);
    content = before + CLAUDE_MD_SECTION + after;
  } else {
    // Append section
    content = content.trimEnd() + "\n\n" + CLAUDE_MD_SECTION + "\n";
  }

  await writeFile(path, content, "utf-8");
  return path;
}

export async function removeClaudeMdSection(dir: string): Promise<string | null> {
  const path = join(dir, "CLAUDE.md");

  try {
    let content = await readFile(path, "utf-8");
    const beginIdx = content.indexOf(CLAUDE_MD_BEGIN);
    const endIdx = content.indexOf(CLAUDE_MD_END);

    if (beginIdx === -1 || endIdx === -1) {
      return null;
    }

    const before = content.slice(0, beginIdx);
    const after = content.slice(endIdx + CLAUDE_MD_END.length);
    content = (before + after).replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
    await writeFile(path, content, "utf-8");
    return path;
  } catch {
    return null;
  }
}

interface McpJson {
  mcpServers?: Record<string, unknown>;
}

async function readMcpJson(dir: string): Promise<McpJson> {
  const path = join(dir, ".mcp.json");
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content) as McpJson;
  } catch {
    return {};
  }
}

async function writeMcpJson(dir: string, data: McpJson): Promise<void> {
  const path = join(dir, ".mcp.json");
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export async function mcpInstallCommand(
  scope: "project" | "global"
): Promise<{ success: boolean; output?: string; error?: string }> {
  if (scope === "global") {
    try {
      const proc = Bun.spawn(
        [
          "claude",
          "mcp",
          "add",
          "--scope",
          "user",
          "--transport",
          "stdio",
          "wdyt",
          "--",
          "bunx",
          "-b",
          "wdyt-mcp",
        ],
        {
          stdout: "pipe",
          stderr: "pipe",
        }
      );

      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        return {
          success: false,
          error: `claude mcp add failed (exit ${exitCode}): ${stderr.trim()}`,
        };
      }

      return {
        success: true,
        output: "wdyt MCP server added to Claude Code user settings.",
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to run 'claude' CLI: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // Project scope: write .mcp.json
  const dir = process.cwd();
  const existing = await readMcpJson(dir);

  if (!existing.mcpServers) {
    existing.mcpServers = {};
  }

  existing.mcpServers.wdyt = MCP_SERVER_CONFIG;
  await writeMcpJson(dir, existing);

  return {
    success: true,
    output: `wdyt MCP server added to ${join(dir, ".mcp.json")}`,
  };
}

export async function mcpUninstallCommand(
  scope: "project" | "global"
): Promise<{ success: boolean; output?: string; error?: string }> {
  if (scope === "global") {
    try {
      const proc = Bun.spawn(
        ["claude", "mcp", "remove", "--scope", "user", "wdyt"],
        {
          stdout: "pipe",
          stderr: "pipe",
        }
      );

      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        return {
          success: false,
          error: `claude mcp remove failed (exit ${exitCode}): ${stderr.trim()}`,
        };
      }

      return {
        success: true,
        output: "wdyt MCP server removed from Claude Code user settings.",
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to run 'claude' CLI: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // Project scope: remove from .mcp.json
  const dir = process.cwd();
  const existing = await readMcpJson(dir);

  if (!existing.mcpServers || !existing.mcpServers.wdyt) {
    return {
      success: true,
      output: "wdyt MCP server was not configured in .mcp.json.",
    };
  }

  delete existing.mcpServers.wdyt;

  // If mcpServers is now empty, remove the file
  if (Object.keys(existing.mcpServers).length === 0) {
    try {
      await unlink(join(dir, ".mcp.json"));
    } catch {
      // File might not exist, that's fine
    }
    return {
      success: true,
      output: `wdyt MCP server removed. ${join(dir, ".mcp.json")} deleted (was empty).`,
    };
  }

  await writeMcpJson(dir, existing);
  return {
    success: true,
    output: `wdyt MCP server removed from ${join(dir, ".mcp.json")}`,
  };
}
