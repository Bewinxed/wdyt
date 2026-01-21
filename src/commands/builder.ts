/**
 * Builder command - create a new tab
 *
 * Parses JSON arg: {summary: string}
 * Returns: Tab: <uuid>
 * Compatible with flowctl.py parsing at line 255-259:
 *   match = re.search(r"Tab:\s*([A-Za-z0-9-]+)", output)
 */

import { createTab, getWindow } from "../state";
import type { BuilderConfig } from "../types";

/**
 * Builder command response
 */
export interface BuilderResponse {
  tabId: string;
}

/**
 * Parse builder JSON argument
 * Handles formats:
 * - {} or {"summary": "..."}  (JSON object)
 * - "summary text"            (JSON string - flowctl format)
 * - "summary" --response-type review  (flowctl with flags - flags ignored)
 *
 * @param args - JSON string or object
 * @returns Parsed BuilderConfig or null if invalid
 */
function parseBuilderArgs(args?: string): BuilderConfig | null {
  if (!args) {
    // Empty config is valid - just creates a blank tab
    return {};
  }

  let jsonPart = args.trim();

  // Strip --response-type flag if present (not supported, but don't fail)
  // flowctl passes: "summary" --response-type review
  const responseTypeMatch = jsonPart.match(/^(.+?)\s+--response-type\s+\w+$/);
  if (responseTypeMatch) {
    jsonPart = responseTypeMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonPart);

    // If parsed is a string, convert to BuilderConfig with summary
    if (typeof parsed === "string") {
      return { summary: parsed };
    }

    // Otherwise expect an object
    return parsed as BuilderConfig;
  } catch {
    return null;
  }
}

/**
 * Execute the builder command
 * Creates a new tab in the specified window
 *
 * @param windowId - The window ID to create the tab in
 * @param args - JSON string with optional summary, path, name
 * @returns Tab: <uuid> on success
 */
export async function builderCommand(
  windowId: number,
  args?: string
): Promise<{
  success: boolean;
  data?: BuilderResponse;
  output?: string;
  error?: string;
}> {
  try {
    // Verify window exists
    await getWindow(windowId);

    // Parse builder config (optional)
    const config = parseBuilderArgs(args);
    if (config === null) {
      return {
        success: false,
        error: `Invalid builder config JSON: ${args}`,
      };
    }

    // Create the tab
    const tab = await createTab(windowId);

    // Return in the format flowctl.py expects: Tab: <uuid>
    return {
      success: true,
      data: { tabId: tab.id },
      output: `Tab: ${tab.id}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to create tab: ${message}`,
    };
  }
}
