#!/usr/bin/env bun
/**
 * rp-cli - Linux alternative for RepoPrompt CLI
 *
 * Implements the subset of commands that flowctl.py uses:
 * - windows: list windows
 * - builder: create tabs
 * - prompt get/set/export: manage prompts
 * - select get/add: track file selection
 * - chat_send: export context
 */

import { defineCommand, runMain } from "citty";
import type { CLIFlags } from "./types";
import { windowsCommand } from "./commands/windows";
import { builderCommand } from "./commands/builder";
import {
  promptGetCommand,
  promptSetCommand,
  promptExportCommand,
} from "./commands/prompt";

/**
 * Parse and execute an expression
 */
async function executeExpression(
  expression: string,
  flags: CLIFlags
): Promise<{ success: boolean; data?: unknown; output?: string; error?: string }> {
  const expr = expression.trim();

  // Parse command and arguments
  // Expressions can be: "windows", "builder {json}", "prompt get", etc.
  const match = expr.match(/^(\w+)(?:\s+(.*))?$/);
  if (!match) {
    return { success: false, error: `Invalid expression: ${expression}` };
  }

  const [, command, args] = match;

  switch (command) {
    case "windows":
      return await windowsCommand();

    case "builder":
      if (!flags.window) {
        return { success: false, error: "builder requires -w <window>" };
      }
      return await builderCommand(flags.window, args);

    case "prompt": {
      if (!flags.window || !flags.tab) {
        return {
          success: false,
          error: "prompt commands require -w <window> -t <tab>",
        };
      }

      // Parse subcommand: "get", "export <file>"
      const promptArgs = args?.trim();
      if (!promptArgs || promptArgs === "get") {
        return await promptGetCommand(flags.window, flags.tab);
      }

      if (promptArgs.startsWith("export ")) {
        // Extract file path - may be quoted with shlex.quote
        const filePath = promptArgs.slice(7).trim().replace(/^'|'$/g, "");
        return await promptExportCommand(flags.window, flags.tab, filePath);
      }

      return { success: false, error: `Unknown prompt subcommand: ${promptArgs}` };
    }

    case "select":
      // Will be implemented in fn-1-c5m.6
      if (!flags.window || !flags.tab) {
        return {
          success: false,
          error: "select commands require -w <window> -t <tab>",
        };
      }
      return { success: false, error: "select not yet implemented" };

    case "call": {
      // Handle "call prompt {json}" and "call chat_send {json}"
      if (args?.startsWith("prompt ")) {
        if (!flags.window || !flags.tab) {
          return {
            success: false,
            error: "prompt requires -w <window> -t <tab>",
          };
        }
        const payload = args.slice(7).trim();
        return await promptSetCommand(flags.window, flags.tab, payload);
      }

      if (args?.startsWith("chat_send")) {
        if (!flags.window || !flags.tab) {
          return {
            success: false,
            error: "chat_send requires -w <window> -t <tab>",
          };
        }
        return { success: false, error: "chat_send not yet implemented" };
      }
      return { success: false, error: `Unknown call: ${args}` };
    }

    default:
      return { success: false, error: `Unknown command: ${command}` };
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

const main = defineCommand({
  meta: {
    name: "rp-cli",
    version: "0.1.0",
    description: "Linux alternative for RepoPrompt CLI",
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
    const flags: CLIFlags = {
      rawJson: args["raw-json"],
      window: args.w ? parseInt(args.w, 10) : undefined,
      tab: args.t,
      expression: args.e,
    };

    // If no expression, show help message
    if (!flags.expression) {
      console.log("rp-cli - Linux alternative for RepoPrompt CLI");
      console.log("");
      console.log("Usage:");
      console.log("  rp-cli --raw-json -e <expression>");
      console.log("  rp-cli -w <window> -e <expression>");
      console.log("  rp-cli -w <window> -t <tab> -e <expression>");
      console.log("");
      console.log("Expressions:");
      console.log("  windows                    List all windows");
      console.log('  builder {"summary":"..."}  Create a new tab');
      console.log("  prompt get                 Get current prompt");
      console.log('  prompt set "text"          Set prompt text');
      console.log("  prompt export              Export prompt as XML");
      console.log("  select get                 Get selected files");
      console.log('  select add "path"          Add file to selection');
      console.log("  call chat_send {...}       Export context for chat");
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
