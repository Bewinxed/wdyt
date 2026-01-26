#!/usr/bin/env bun
/**
 * wdyt - Code review context builder for LLMs
 *
 * Get a second opinion on your code by building context for AI review.
 * Compatible with flowctl.py (rp-cli interface).
 *
 * Commands:
 * - windows: list windows
 * - builder: create tabs
 * - prompt get/set/export: manage prompts
 * - select get/add: track file selection
 * - chat_send: export context for review
 */

import { defineCommand, runMain } from "citty";
import type { CLIFlags } from "./types";
import pkg from "../package.json";
import { windowsCommand } from "./commands/windows";
import { builderCommand } from "./commands/builder";
import {
  promptGetCommand,
  promptSetCommand,
  promptExportCommand,
} from "./commands/prompt";
import { selectGetCommand, selectAddCommand } from "./commands/select";
import { chatSendCommand } from "./commands/chat";
import { skillGetCommand, skillListCommand } from "./commands/skill";
import { parseExpression } from "./parseExpression";
import { TldrClient } from "./tldr";

/**
 * Execute a parsed expression
 */
async function executeExpression(
  expression: string,
  flags: CLIFlags
): Promise<{ success: boolean; data?: unknown; output?: string; error?: string }> {
  const parsed = parseExpression(expression);

  if (!parsed.command) {
    return { success: false, error: `Invalid expression: ${expression}` };
  }

  switch (parsed.command) {
    case "windows":
      return await windowsCommand();

    case "builder": {
      if (!flags.window) {
        return { success: false, error: "builder requires -w <window>" };
      }
      // Pass the first positional (summary) and flags
      const summary = parsed.positional[0];
      return await builderCommand(flags.window, summary, parsed.flags);
    }

    case "prompt": {
      if (!flags.window || !flags.tab) {
        return {
          success: false,
          error: "prompt commands require -w <window> -t <tab>",
        };
      }

      const subcommand = parsed.subcommand || "get";

      if (subcommand === "get") {
        return await promptGetCommand(flags.window, flags.tab);
      }

      if (subcommand === "export") {
        const filePath = parsed.positional[0];
        if (!filePath) {
          return { success: false, error: "prompt export requires a file path" };
        }
        return await promptExportCommand(flags.window, flags.tab, filePath);
      }

      return { success: false, error: `Unknown prompt subcommand: ${subcommand}` };
    }

    case "select": {
      if (!flags.window || !flags.tab) {
        return {
          success: false,
          error: "select commands require -w <window> -t <tab>",
        };
      }

      const subcommand = parsed.subcommand || "get";

      if (subcommand === "get") {
        return await selectGetCommand(flags.window, flags.tab);
      }

      if (subcommand === "add") {
        // All remaining positionals are paths
        const paths = parsed.positional.join(" ");
        if (!paths) {
          return { success: false, error: "select add requires file paths" };
        }
        return await selectAddCommand(flags.window, flags.tab, paths);
      }

      return { success: false, error: `Unknown select subcommand: ${subcommand}` };
    }

    case "skill": {
      // skill get <name> - return skill content for agentic loading
      const subcommand = parsed.subcommand || parsed.positional[0];

      if (subcommand === "get") {
        const skillName = parsed.positional[1] || parsed.positional[0];
        if (!skillName || skillName === "get") {
          return { success: false, error: "skill get requires a skill name" };
        }
        return await skillGetCommand(skillName);
      }

      if (subcommand === "list") {
        return await skillListCommand();
      }

      return { success: false, error: `Unknown skill subcommand: ${subcommand}` };
    }

    case "call": {
      // Handle "call prompt {json}" and "call chat_send {json}"
      const callTarget = parsed.subcommand || parsed.positional[0];

      if (callTarget === "prompt") {
        if (!flags.window || !flags.tab) {
          return {
            success: false,
            error: "prompt requires -w <window> -t <tab>",
          };
        }
        const payload = parsed.positional.slice(1).join(" ") || "{}";
        return await promptSetCommand(flags.window, flags.tab, payload);
      }

      if (callTarget === "chat_send") {
        if (!flags.window || !flags.tab) {
          return {
            success: false,
            error: "chat_send requires -w <window> -t <tab>",
          };
        }
        const payload = parsed.positional.slice(1).join(" ") || "{}";
        return await chatSendCommand(flags.window, flags.tab, payload);
      }

      return { success: false, error: `Unknown call: ${callTarget}` };
    }

    case "tldr": {
      const subcommand = parsed.subcommand || parsed.positional[0];
      const tldr = new TldrClient();

      if (subcommand === "warm") {
        const projectPath = parsed.positional[1] || process.cwd();
        try {
          await tldr.ensureWarmed(projectPath);
          return { success: true, output: "tldr index warmed successfully." };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { success: false, error: message };
        }
      }

      if (subcommand === "status") {
        const projectPath = parsed.positional[1] || process.cwd();
        const available = await tldr.isAvailable();
        const warmed = available ? await tldr.isWarmed(projectPath) : false;

        const status = {
          uvxAvailable: available,
          projectWarmed: warmed,
          projectPath,
        };

        return {
          success: true,
          data: status,
          output: [
            `uvx available: ${available ? "yes" : "no"}`,
            `project warmed: ${warmed ? "yes" : "no"}`,
            `project path: ${projectPath}`,
          ].join("\n"),
        };
      }

      return { success: false, error: `Unknown tldr subcommand: ${subcommand}. Use 'warm' or 'status'.` };
    }

    default:
      return { success: false, error: `Unknown command: ${parsed.command}` };
  }
}

/**
 * Format output based on --raw-json flag
 */
function formatOutput(
  result: { success: boolean; data?: unknown; output?: string; error?: string },
  rawJson: boolean
): string {
  if (rawJson) {
    if (result.success) {
      return JSON.stringify(result.data);
    }
    return JSON.stringify({ error: result.error });
  }

  // For non-raw-json mode, prefer the output field if present
  // This allows commands like builder to return "Tab: <uuid>" format
  if (result.success) {
    // Check if output is defined (not undefined), allowing empty strings
    if (result.output !== undefined) {
      return result.output;
    }
    if (typeof result.data === "object") {
      return JSON.stringify(result.data, null, 2);
    }
    return String(result.data);
  }

  return `Error: ${result.error}`;
}

/**
 * Handle `wdyt mcp install|uninstall [--global]` before citty parses flags.
 * citty's subcommand resolution conflicts with the -e flag pattern,
 * so we intercept mcp commands from process.argv directly.
 */
async function promptScope(): Promise<"project" | "user"> {
  const { createInterface } = await import("node:readline");
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, resolve));

  console.log("Where should the MCP server be configured?\n");
  console.log("  1) project  — .mcp.json in this directory (recommended)");
  console.log("               Available to anyone who clones this repo.");
  console.log("  2) user     — Claude Code user settings (via claude mcp add)");
  console.log("               Available in all your projects.\n");

  while (true) {
    const choice = (await ask("Scope [1]: ")).trim();
    if (choice === "" || choice === "1" || choice === "project") { rl.close(); return "project"; }
    if (choice === "2" || choice === "user") { rl.close(); return "user"; }
  }
}

function parseScope(args: string[]): "project" | "user" | null {
  if (args.includes("--project")) return "project";
  if (args.includes("--global") || args.includes("--user")) return "user";
  return null;
}

async function handleMcpSubcommand(): Promise<boolean> {
  const args = process.argv.slice(2);
  if (args[0] !== "mcp") return false;

  const sub = args[1];

  if (sub === "install") {
    const scope = parseScope(args) ?? await promptScope();
    const { mcpInstallCommand } = await import("./commands/mcp");
    const result = await mcpInstallCommand(scope === "user" ? "global" : "project");
    console.log(result.output || result.error);
    process.exit(result.success ? 0 : 1);
  }

  if (sub === "uninstall") {
    const scope = parseScope(args) ?? await promptScope();
    const { mcpUninstallCommand } = await import("./commands/mcp");
    const result = await mcpUninstallCommand(scope === "user" ? "global" : "project");
    console.log(result.output || result.error);
    process.exit(result.success ? 0 : 1);
  }

  console.error("Unknown mcp subcommand. Use 'install' or 'uninstall'.");
  console.error("  wdyt mcp install [--project | --user]");
  console.error("  wdyt mcp uninstall [--project | --user]");
  process.exit(1);
}

// Handle mcp commands before citty takes over
await handleMcpSubcommand();

const main = defineCommand({
    meta: {
      name: "wdyt",
      version: pkg.version,
      description: "Code review context builder for LLMs",
    },
    args: {
      "raw-json": {
        type: "boolean",
        description: "Output raw JSON (no formatting)",
        default: false,
      },
      w: {
        type: "string",
        description: "Window ID",
      },
      t: {
        type: "string",
        description: "Tab ID",
      },
      e: {
        type: "string",
        description: "Expression to execute",
      },
    },
    async run({ args }) {
      // Parse and validate window ID
      let windowId: number | undefined;
      if (args.w) {
        windowId = parseInt(args.w, 10);
        if (isNaN(windowId) || windowId < 1) {
          console.error(`Error: Invalid window ID "${args.w}". Must be a positive integer.`);
          process.exit(1);
        }
      }

      const flags: CLIFlags = {
        rawJson: args["raw-json"],
        window: windowId,
        tab: args.t,
        expression: args.e,
      };

      // If no expression, show help message
      if (!flags.expression) {
        console.log("wdyt - Code review context builder for LLMs");
        console.log("");
        console.log("Install:");
        console.log("  bun add -g wdyt        # Install globally (creates wdyt + rp-cli)");
        console.log("");
        console.log("Usage:");
        console.log("  wdyt --raw-json -e <expression>");
        console.log("  wdyt -w <window> -e <expression>");
        console.log("  wdyt -w <window> -t <tab> -e <expression>");
        console.log("");
        console.log("Expressions:");
        console.log("  windows                    List all windows");
        console.log('  builder {"summary":"..."}  Create a new tab');
        console.log("  prompt get                 Get current prompt");
        console.log("  prompt export <file>       Export prompt to file");
        console.log("  select get                 Get selected files");
        console.log('  select add "path"          Add file to selection');
        console.log("  call chat_send {...}       Export context for review");
        console.log("  tldr warm                  Index project for llm-tldr");
        console.log("  tldr status                Show llm-tldr status");
        console.log("");
        console.log("Commands:");
        console.log("  mcp install                Add wdyt MCP tools to Claude Code");
        console.log("  mcp uninstall              Remove wdyt MCP tools from Claude Code");
        console.log("");
        console.log("Flags:");
        console.log("  --raw-json    Output raw JSON");
        console.log("  -w <id>       Window ID");
        console.log("  -t <id>       Tab ID");
        console.log("  -e <expr>     Expression to execute");
        process.exit(0);
      }

      // Execute expression
      const result = await executeExpression(flags.expression, flags);
      const output = formatOutput(result, flags.rawJson);
      console.log(output);

      // Exit with code 1 on error
      if (!result.success) {
        process.exit(1);
      }
    },
});

runMain(main);
