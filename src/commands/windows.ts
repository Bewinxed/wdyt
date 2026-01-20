/**
 * Windows command - list all windows
 *
 * Returns JSON: {windows: [{windowID, rootFolderPaths}]}
 * Compatible with flowctl.py parsing at line 215-231
 */

import { getWindows } from "../state";

/**
 * Window data formatted for flowctl.py compatibility
 * Uses windowID (not id) to match expected format
 */
export interface WindowOutput {
  windowID: number;
  rootFolderPaths: string[];
}

/**
 * Windows command response
 */
export interface WindowsResponse {
  windows: WindowOutput[];
}

/**
 * Execute the windows command
 * Returns all windows with their IDs and root folder paths
 */
export async function windowsCommand(): Promise<{
  success: boolean;
  data?: WindowsResponse;
  error?: string;
}> {
  try {
    const windows = await getWindows();

    return {
      success: true,
      data: {
        windows: windows.map((w) => ({
          windowID: w.id,
          rootFolderPaths: w.rootFolderPaths,
        })),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to get windows: ${message}`,
    };
  }
}
