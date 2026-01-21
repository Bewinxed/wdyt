/**
 * Expression parser for wdyt CLI
 *
 * Properly parses shell-like expressions into command + args + flags
 * Example: 'builder "summary text" --response-type review'
 * -> { command: "builder", positional: ["summary text"], flags: { responseType: "review" } }
 */

import { parseArgs } from "node:util";
import { parse as shellParse } from "shell-quote";

/**
 * Tokenize a shell-like string
 *
 * Uses shell-quote for most parsing, but preserves JSON objects literally
 * since shell-quote would strip internal quotes from JSON.
 */
export function tokenize(input: string): string[] {
  // Check if input contains a JSON object (starts with {)
  const jsonStart = input.indexOf("{");

  if (jsonStart !== -1) {
    // Split into pre-JSON and JSON parts
    const preJson = input.slice(0, jsonStart).trim();
    const jsonPart = input.slice(jsonStart);

    // Parse the pre-JSON part with shell-quote
    const preTokens = preJson
      ? shellParse(preJson).filter((t): t is string => typeof t === "string")
      : [];

    // Keep the JSON part as-is
    return [...preTokens, jsonPart];
  }

  // No JSON, use shell-quote for everything
  const parsed = shellParse(input);
  return parsed.filter((t): t is string => typeof t === "string");
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
