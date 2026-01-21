/**
 * Builder command - create a new tab
 *
 * Returns: Tab: <uuid>
 * Compatible with flowctl.py parsing at line 255-259:
 *   match = re.search(r"Tab:\s*([A-Za-z0-9-]+)", output)
 */

import { createTab, getWindow } from "../state";

/**
 * Builder command response
 */
export interface BuilderResponse {
  tabId: string;
}

/**
 * Builder flags from expression parser
 */
export interface BuilderFlags {
  "response-type"?: string;
  [key: string]: string | boolean | undefined;
}

/**
 * Execute the builder command
 * Creates a new tab in the specified window
 *
 * @param windowId - The window ID to create the tab in
 * @param summary - Optional summary/description for the tab
 * @param flags - Optional flags (e.g., --response-type)
 * @returns Tab: <uuid> on success
 */
export async function builderCommand(
  windowId: number,
  summary?: string,
  flags?: BuilderFlags
): Promise<{
  success: boolean;
  data?: BuilderResponse;
  output?: string;
  error?: string;
}> {
  try {
    // Verify window exists
    await getWindow(windowId);

    // Create the tab
    const tab = await createTab(windowId);

    // Note: summary and flags like --response-type are accepted but
    // not used in this minimal implementation. The real RepoPrompt
    // uses them for its GUI features.

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
