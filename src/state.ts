/**
 * State management layer for wdyt
 *
 * Persists windows, tabs, and selections to disk.
 * State is stored in ~/.wdyt/state.json (or XDG_DATA_HOME/wdyt/state.json)
 */

import { join } from "path";
import { homedir } from "os";
import { mkdirSync, existsSync, renameSync } from "fs";
import type { StateFile, Window, Tab, TabUpdate } from "./types";

const STATE_VERSION = 1;

/**
 * Get the data directory path
 * Uses XDG_DATA_HOME if set, otherwise falls back to ~/.wdyt
 */
function getDataDir(): string {
  const xdgDataHome = process.env.XDG_DATA_HOME;
  if (xdgDataHome) {
    return join(xdgDataHome, "wdyt");
  }
  return join(homedir(), ".wdyt");
}

/**
 * Get the state file path
 */
function getStatePath(): string {
  return join(getDataDir(), "state.json");
}

/**
 * Create default state with a single window
 */
function createDefaultState(): StateFile {
  return {
    version: STATE_VERSION,
    windows: [
      {
        id: 1,
        rootFolderPaths: [],
        tabs: [],
      },
    ],
  };
}

/**
 * Generate a UUID v4 for tab IDs
 */
function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Load state from disk, creating default if not exists
 */
export async function loadState(): Promise<StateFile> {
  const statePath = getStatePath();

  // Check if file exists first
  if (!existsSync(statePath)) {
    return createDefaultState();
  }

  try {
    const file = Bun.file(statePath);
    const content = await file.text();
    const state = JSON.parse(content) as StateFile;

    // Validate basic structure
    if (!state || typeof state !== "object" || !Array.isArray(state.windows)) {
      throw new Error("Invalid state structure");
    }

    // Validate and migrate if needed
    if (!state.version || state.version < STATE_VERSION) {
      // Future: handle migrations
      state.version = STATE_VERSION;
    }

    return state;
  } catch (error) {
    // State file exists but is corrupted - backup and start fresh
    const backupPath = `${statePath}.backup.${Date.now()}`;
    try {
      renameSync(statePath, backupPath);
      console.error(`Warning: State file corrupted, backed up to ${backupPath}`);
    } catch {
      console.error(`Warning: Could not backup corrupted state file: ${error}`);
    }
    return createDefaultState();
  }
}

/**
 * Save state to disk
 */
export async function saveState(state: StateFile): Promise<void> {
  const statePath = getStatePath();
  const dataDir = getDataDir();

  // Ensure directory exists using proper mkdir
  mkdirSync(dataDir, { recursive: true });

  // Write state file atomically
  const content = JSON.stringify(state, null, 2);
  await Bun.write(statePath, content);
}

/**
 * Get a window by ID
 * @throws Error if window not found
 */
export async function getWindow(id: number): Promise<Window> {
  const state = await loadState();
  const window = state.windows.find((w) => w.id === id);

  if (!window) {
    throw new Error(`Window ${id} not found`);
  }

  return window;
}

/**
 * Get all windows
 */
export async function getWindows(): Promise<Window[]> {
  const state = await loadState();
  return state.windows;
}

/**
 * Create a new tab in a window
 * @returns The newly created tab
 */
export async function createTab(windowId: number): Promise<Tab> {
  const state = await loadState();
  const window = state.windows.find((w) => w.id === windowId);

  if (!window) {
    throw new Error(`Window ${windowId} not found`);
  }

  const tab: Tab = {
    id: generateUUID(),
    prompt: "",
    selectedFiles: [],
    createdAt: new Date().toISOString(),
  };

  window.tabs.push(tab);
  await saveState(state);

  return tab;
}

/**
 * Get a tab by ID from a window
 * @throws Error if window or tab not found
 */
export async function getTab(windowId: number, tabId: string): Promise<Tab> {
  const window = await getWindow(windowId);
  const tab = window.tabs.find((t) => t.id === tabId);

  if (!tab) {
    throw new Error(`Tab ${tabId} not found in window ${windowId}`);
  }

  return tab;
}

/**
 * Update a tab in a window
 * @returns The updated tab
 */
export async function updateTab(
  windowId: number,
  tabId: string,
  update: TabUpdate
): Promise<Tab> {
  const state = await loadState();
  const window = state.windows.find((w) => w.id === windowId);

  if (!window) {
    throw new Error(`Window ${windowId} not found`);
  }

  const tabIndex = window.tabs.findIndex((t) => t.id === tabId);
  if (tabIndex === -1) {
    throw new Error(`Tab ${tabId} not found in window ${windowId}`);
  }

  // Merge update into existing tab
  const tab = window.tabs[tabIndex];
  if (update.prompt !== undefined) {
    tab.prompt = update.prompt;
  }
  if (update.selectedFiles !== undefined) {
    tab.selectedFiles = update.selectedFiles;
  }

  await saveState(state);

  return tab;
}

/**
 * Delete a tab from a window
 */
export async function deleteTab(windowId: number, tabId: string): Promise<void> {
  const state = await loadState();
  const window = state.windows.find((w) => w.id === windowId);

  if (!window) {
    throw new Error(`Window ${windowId} not found`);
  }

  const tabIndex = window.tabs.findIndex((t) => t.id === tabId);
  if (tabIndex === -1) {
    throw new Error(`Tab ${tabId} not found in window ${windowId}`);
  }

  window.tabs.splice(tabIndex, 1);
  await saveState(state);
}

/**
 * Create a new window
 * @returns The newly created window
 */
export async function createWindow(
  rootFolderPaths: string[] = []
): Promise<Window> {
  const state = await loadState();

  // Find the next available ID
  const maxId = state.windows.reduce((max, w) => Math.max(max, w.id), 0);

  const window: Window = {
    id: maxId + 1,
    rootFolderPaths,
    tabs: [],
  };

  state.windows.push(window);
  await saveState(state);

  return window;
}

/**
 * Update window root folder paths
 */
export async function updateWindowPaths(
  windowId: number,
  rootFolderPaths: string[]
): Promise<Window> {
  const state = await loadState();
  const window = state.windows.find((w) => w.id === windowId);

  if (!window) {
    throw new Error(`Window ${windowId} not found`);
  }

  window.rootFolderPaths = rootFolderPaths;
  await saveState(state);

  return window;
}

/**
 * Ensure state file exists, creating if necessary
 * Called on startup to initialize state
 */
export async function ensureState(): Promise<void> {
  const state = await loadState();
  await saveState(state);
}
