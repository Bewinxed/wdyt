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

/**
 * Parse and execute an expression
 */
function executeExpression(
  expression: string,
  flags: CLIFlags
): { success: boolean; data?: unknown; error?: string } {
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
      // Will be implemented in fn-1-c5m.3
      return {
        success: true,
        data: { windows: [] },
      };

    case "builder":
      // Will be implemented in fn-1-c5m.4
      if (!flags.window) {
        return { success: false, error: "builder requires -w <window>" };
      }
      return { success: false, error: "builder not yet implemented" };

    case "prompt":
      // Will be implemented in fn-1-c5m.5
      if (!flags.window || !flags.tab) {
        return {
          success: false,
          error: "prompt commands require -w <window> -t <tab>",
        };
      }
      return { success: false, error: "prompt not yet implemented" };

    case "select":
      // Will be implemented in fn-1-c5m.6
      if (!flags.window || !flags.tab) {
        return {
          success: false,
          error: "select commands require -w <window> -t <tab>",
        };
      }
      return { success: false, error: "select not yet implemented" };

    case "call":
      // Handle "call chat_send {json}" - will be implemented in fn-1-c5m.7
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

    default:
      return { success: false, error: `Unknown command: ${command}` };
  }
}

/**
 * Format output based on --raw-json flag
 */
function formatOutput(
  result: { success: boolean; data?: unknown; error?: string },
  rawJson: boolean
): string {
  if (rawJson) {
    if (result.success) {
      return JSON.stringify(result.data);
    }
    return JSON.stringify({ error: result.error });
  }

  if (result.success) {
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
  run({ args }) {
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
    const result = executeExpression(flags.expression, flags);
    const output = formatOutput(result, flags.rawJson);
    console.log(output);

    // Exit with code 1 on error
    if (!result.success) {
      process.exit(1);
    }
  },
});

runMain(main);
