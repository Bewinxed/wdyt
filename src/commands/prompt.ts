/**
 * Prompt commands - get, set (via call), export
 *
 * Commands:
 * - prompt get: returns current prompt text
 * - call prompt {"op":"set","text":"..."}: sets prompt text
 * - prompt export <file>: writes prompt to file
 *
 * Compatible with flowctl.py:
 * - cmd_rp_prompt_get (line 3924): prompt get
 * - cmd_rp_prompt_set (line 3930): call prompt {"op":"set","text":"..."}
 * - cmd_rp_prompt_export (line 3986): prompt export <file>
 */

import { getTab, updateTab } from "../state";

/**
 * Prompt get response
 */
export interface PromptGetResponse {
  prompt: string;
}

/**
 * Prompt set payload
 */
export interface PromptSetPayload {
  op: "set";
  text: string;
}

/**
 * Get prompt text for a tab
 *
 * @param windowId - Window ID
 * @param tabId - Tab ID
 * @returns Current prompt text (empty string if none)
 */
export async function promptGetCommand(
  windowId: number,
  tabId: string
): Promise<{
  success: boolean;
  data?: PromptGetResponse;
  output?: string;
  error?: string;
}> {
  try {
    const tab = await getTab(windowId, tabId);

    // Return just the prompt text, no JSON wrapping when not --raw-json
    return {
      success: true,
      data: { prompt: tab.prompt },
      output: tab.prompt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to get prompt: ${message}`,
    };
  }
}

/**
 * Set prompt text for a tab
 *
 * Called as: call prompt {"op":"set","text":"..."}
 *
 * @param windowId - Window ID
 * @param tabId - Tab ID
 * @param payload - JSON payload with op and text
 * @returns Success status
 */
export async function promptSetCommand(
  windowId: number,
  tabId: string,
  payload: string
): Promise<{
  success: boolean;
  data?: { success: boolean };
  output?: string;
  error?: string;
}> {
  try {
    // Parse the JSON payload
    const data = JSON.parse(payload) as PromptSetPayload;

    if (data.op !== "set") {
      return {
        success: false,
        error: `Unknown prompt operation: ${data.op}`,
      };
    }

    if (typeof data.text !== "string") {
      return {
        success: false,
        error: "Prompt text must be a string",
      };
    }

    // Update the tab's prompt
    await updateTab(windowId, tabId, { prompt: data.text });

    return {
      success: true,
      data: { success: true },
      output: "OK",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to set prompt: ${message}`,
    };
  }
}

/**
 * Export prompt to a file
 *
 * Called as: prompt export <file>
 *
 * @param windowId - Window ID
 * @param tabId - Tab ID
 * @param filePath - Path to write prompt to
 * @returns Success status
 */
export async function promptExportCommand(
  windowId: number,
  tabId: string,
  filePath: string
): Promise<{
  success: boolean;
  data?: { path: string };
  output?: string;
  error?: string;
}> {
  try {
    const tab = await getTab(windowId, tabId);

    // Write prompt to file
    await Bun.write(filePath, tab.prompt);

    return {
      success: true,
      data: { path: filePath },
      output: `Exported to ${filePath}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to export prompt: ${message}`,
    };
  }
}
