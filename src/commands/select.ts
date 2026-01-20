/**
 * Select commands - get, add
 *
 * Commands:
 * - select get: returns selected file paths (newline-separated)
 * - select add <paths>: adds files to selection
 *
 * Compatible with flowctl.py:
 * - cmd_rp_select_get (line 3946): select get
 * - cmd_rp_select_add (line 3955): select add <paths>
 */

import { existsSync } from "fs";
import { resolve } from "path";
import { getTab, updateTab, getWindow } from "../state";

/**
 * Select get response
 */
export interface SelectGetResponse {
  files: string[];
}

/**
 * Get selected files for a tab
 *
 * @param windowId - Window ID
 * @param tabId - Tab ID
 * @returns Newline-separated file paths
 */
export async function selectGetCommand(
  windowId: number,
  tabId: string
): Promise<{
  success: boolean;
  data?: SelectGetResponse;
  output?: string;
  error?: string;
}> {
  try {
    const tab = await getTab(windowId, tabId);

    // Return newline-separated paths for non-JSON output
    const output = tab.selectedFiles.join("\n");

    return {
      success: true,
      data: { files: tab.selectedFiles },
      output,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to get selection: ${message}`,
    };
  }
}

/**
 * Parse shell-quoted paths from the arguments string
 *
 * Handles paths that may be quoted with single quotes (from shlex.quote)
 * Example: "'path/to/file.ts' 'another file.ts'"
 */
function parsePaths(argsString: string): string[] {
  const paths: string[] = [];
  let remaining = argsString.trim();

  while (remaining.length > 0) {
    remaining = remaining.trimStart();

    if (remaining.startsWith("'")) {
      // Single-quoted path
      const endQuote = remaining.indexOf("'", 1);
      if (endQuote === -1) {
        // Unterminated quote, take rest
        paths.push(remaining.slice(1));
        break;
      }
      paths.push(remaining.slice(1, endQuote));
      remaining = remaining.slice(endQuote + 1);
    } else if (remaining.startsWith('"')) {
      // Double-quoted path
      const endQuote = remaining.indexOf('"', 1);
      if (endQuote === -1) {
        paths.push(remaining.slice(1));
        break;
      }
      paths.push(remaining.slice(1, endQuote));
      remaining = remaining.slice(endQuote + 1);
    } else {
      // Unquoted path - ends at whitespace
      const spaceIndex = remaining.search(/\s/);
      if (spaceIndex === -1) {
        paths.push(remaining);
        break;
      }
      paths.push(remaining.slice(0, spaceIndex));
      remaining = remaining.slice(spaceIndex);
    }
  }

  return paths.filter((p) => p.length > 0);
}

/**
 * Add files to selection for a tab
 *
 * @param windowId - Window ID
 * @param tabId - Tab ID
 * @param argsString - Space-separated file paths (may be shell-quoted)
 * @returns Success status with count of added files
 */
export async function selectAddCommand(
  windowId: number,
  tabId: string,
  argsString: string
): Promise<{
  success: boolean;
  data?: { added: number; total: number };
  output?: string;
  error?: string;
}> {
  try {
    // Parse the paths from the args string
    const pathsToAdd = parsePaths(argsString);

    if (pathsToAdd.length === 0) {
      return {
        success: false,
        error: "select add requires at least one path",
      };
    }

    // Get window to determine root paths for resolving relative paths
    const window = await getWindow(windowId);
    const rootPath = window.rootFolderPaths[0] || process.cwd();

    // Get current selection
    const tab = await getTab(windowId, tabId);
    const existingFiles = new Set(tab.selectedFiles);

    // Process each path
    let addedCount = 0;
    for (const path of pathsToAdd) {
      // Resolve to absolute path if relative
      const absolutePath = resolve(rootPath, path);

      // Skip if already selected (deduplicate)
      if (existingFiles.has(absolutePath)) {
        continue;
      }

      // Check if file exists - silently skip non-existent files
      if (!existsSync(absolutePath)) {
        continue;
      }

      existingFiles.add(absolutePath);
      addedCount++;
    }

    // Update the tab with new selection
    const newSelection = Array.from(existingFiles);
    await updateTab(windowId, tabId, { selectedFiles: newSelection });

    return {
      success: true,
      data: { added: addedCount, total: newSelection.length },
      output: `Added ${addedCount} file(s), total: ${newSelection.length}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to add to selection: ${message}`,
    };
  }
}
