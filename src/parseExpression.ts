/**
 * Expression parser for wdyt CLI
 *
 * Properly parses shell-like expressions into command + args + flags
 * Example: 'builder "summary text" --response-type review'
 * -> { command: "builder", positional: ["summary text"], flags: { responseType: "review" } }
 */

import { parseArgs } from "node:util";

/**
 * Tokenize a shell-like string, respecting quotes
 * "builder \"hello world\" --flag" -> ["builder", "hello world", "--flag"]
 */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote: string | null = null;
  let escape = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (escape) {
      current += char;
      escape = false;
      continue;
    }

    if (char === "\\") {
      escape = true;
      continue;
    }

    if (char === '"' || char === "'") {
      if (inQuote === char) {
        // End of quoted string
        inQuote = null;
      } else if (inQuote === null) {
        // Start of quoted string
        inQuote = char;
      } else {
        // Different quote inside a quoted string
        current += char;
      }
      continue;
    }

    if (char === " " && inQuote === null) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Parsed expression result
 */
export interface ParsedExpression {
  command: string;
  subcommand?: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

/**
 * Parse an expression string into structured parts
 */
export function parseExpression(expression: string): ParsedExpression {
  const tokens = tokenize(expression.trim());

  if (tokens.length === 0) {
    return { command: "", positional: [], flags: {} };
  }

  const command = tokens[0];
  const rest = tokens.slice(1);

  // Use parseArgs for the remaining tokens
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      "response-type": { type: "string" },
      "new-chat": { type: "boolean" },
      "chat-name": { type: "string" },
      "chat-id": { type: "string" },
    },
    allowPositionals: true,
    strict: false, // Don't error on unknown flags
  });

  // Determine subcommand for commands that have them
  let subcommand: string | undefined;
  let finalPositional = positionals;

  if (command === "prompt" || command === "select") {
    // First positional is the subcommand (get, set, add, export)
    if (positionals.length > 0) {
      subcommand = positionals[0];
      finalPositional = positionals.slice(1);
    }
  }

  return {
    command,
    subcommand,
    positional: finalPositional,
    flags: values as Record<string, string | boolean>,
  };
}
