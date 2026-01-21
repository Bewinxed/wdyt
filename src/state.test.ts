/**
 * Tests for state management layer
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { rm } from "fs/promises";
import {
  loadState,
  saveState,
  getWindow,
  getWindows,
  createTab,
  getTab,
  updateTab,
  deleteTab,
  createWindow,
  ensureState,
} from "./state";

// Use a test-specific directory
const TEST_DIR = join(import.meta.dir, "..", ".test-state");

beforeEach(async () => {
  // Set XDG_DATA_HOME to test directory
  process.env.XDG_DATA_HOME = TEST_DIR;

  // Clean up any existing test state
  try {
    await rm(TEST_DIR, { recursive: true, force: true });
  } catch {
    // Directory might not exist
  }
});

afterEach(async () => {
  // Clean up test directory
  try {
    await rm(TEST_DIR, { recursive: true, force: true });
  } catch {
    // Directory might not exist
  }
  delete process.env.XDG_DATA_HOME;
});

describe("State management", () => {
  test("loadState creates default state if none exists", async () => {
    const state = await loadState();

    expect(state).toBeDefined();
    expect(state.version).toBe(1);
    expect(state.windows).toHaveLength(1);
    expect(state.windows[0].id).toBe(1);
    expect(state.windows[0].tabs).toHaveLength(0);
    expect(state.windows[0].rootFolderPaths).toEqual([]);
  });

  test("state survives process restarts (save and reload)", async () => {
    // Initial load creates default
    await ensureState();

    // Create a tab
    const tab = await createTab(1);
    expect(tab.id).toBeDefined();
    expect(tab.prompt).toBe("");
    expect(tab.selectedFiles).toEqual([]);

    // Update the tab
    await updateTab(1, tab.id, {
      prompt: "test prompt",
      selectedFiles: ["file1.ts", "file2.ts"],
    });

    // Reload state (simulating process restart)
    const reloadedState = await loadState();
    const reloadedWindow = reloadedState.windows.find((w) => w.id === 1);
    expect(reloadedWindow).toBeDefined();
    expect(reloadedWindow!.tabs).toHaveLength(1);

    const reloadedTab = reloadedWindow!.tabs[0];
    expect(reloadedTab.id).toBe(tab.id);
    expect(reloadedTab.prompt).toBe("test prompt");
    expect(reloadedTab.selectedFiles).toEqual(["file1.ts", "file2.ts"]);
  });

  test("getWindow returns window or throws", async () => {
    await ensureState();

    // Window 1 should exist by default
    const window = await getWindow(1);
    expect(window.id).toBe(1);

    // Window 999 should not exist
    await expect(getWindow(999)).rejects.toThrow("Window 999 not found");
  });

  test("createTab returns new tab with UUID", async () => {
    await ensureState();

    const tab = await createTab(1);

    expect(tab.id).toBeDefined();
    expect(tab.id.length).toBe(36); // UUID length
    expect(tab.prompt).toBe("");
    expect(tab.selectedFiles).toEqual([]);
    expect(tab.createdAt).toBeDefined();

    // Verify it was persisted
    const window = await getWindow(1);
    expect(window.tabs).toHaveLength(1);
    expect(window.tabs[0].id).toBe(tab.id);
  });

  test("updateTab persists changes", async () => {
    await ensureState();

    const tab = await createTab(1);

    // Update prompt only
    const updated1 = await updateTab(1, tab.id, { prompt: "new prompt" });
    expect(updated1.prompt).toBe("new prompt");
    expect(updated1.selectedFiles).toEqual([]);

    // Update selectedFiles only
    const updated2 = await updateTab(1, tab.id, {
      selectedFiles: ["a.ts", "b.ts"],
    });
    expect(updated2.prompt).toBe("new prompt");
    expect(updated2.selectedFiles).toEqual(["a.ts", "b.ts"]);

    // Verify persistence
    const reloadedTab = await getTab(1, tab.id);
    expect(reloadedTab.prompt).toBe("new prompt");
    expect(reloadedTab.selectedFiles).toEqual(["a.ts", "b.ts"]);
  });

  test("createTab throws for non-existent window", async () => {
    await ensureState();

    await expect(createTab(999)).rejects.toThrow("Window 999 not found");
  });

  test("updateTab throws for non-existent tab", async () => {
    await ensureState();

    await expect(updateTab(1, "fake-id", { prompt: "test" })).rejects.toThrow(
      "Tab fake-id not found"
    );
  });

  test("deleteTab removes tab from window", async () => {
    await ensureState();

    const tab = await createTab(1);
    const window1 = await getWindow(1);
    expect(window1.tabs).toHaveLength(1);

    await deleteTab(1, tab.id);

    const window2 = await getWindow(1);
    expect(window2.tabs).toHaveLength(0);
  });

  test("createWindow adds new window with incremented ID", async () => {
    await ensureState();

    const newWindow = await createWindow(["/path/to/project"]);

    expect(newWindow.id).toBe(2);
    expect(newWindow.rootFolderPaths).toEqual(["/path/to/project"]);
    expect(newWindow.tabs).toHaveLength(0);

    const windows = await getWindows();
    expect(windows).toHaveLength(2);
  });

  test("getWindows returns all windows", async () => {
    await ensureState();

    const windows = await getWindows();
    expect(windows).toHaveLength(1);
    expect(windows[0].id).toBe(1);
  });
});
