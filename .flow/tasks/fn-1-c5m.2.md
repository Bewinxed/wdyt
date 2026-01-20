# fn-1-c5m.2 State management layer

## Description
Create state persistence layer for windows, tabs, workspaces, and selections.

**Size:** M
**Files:** `src/state.ts`, `src/types.ts`

## Approach
- Store state in `~/.rp-cli/state.json`
- Window = { id, rootFolderPaths, tabs: [] }
- Tab = { id, prompt, selectedFiles: [] }
- Auto-create default window on first use

## Key context
- Use `Bun.file()` and `Bun.write()` for persistence
- XDG_DATA_HOME fallback: `~/.local/share/rp-cli`
## Acceptance
- [ ] State loads from disk or creates default
- [ ] `getWindow(id)` returns window or throws
- [ ] `createTab(windowId)` returns new tab with UUID
- [ ] `updateTab(windowId, tabId, data)` persists changes
- [ ] State survives process restarts
## Done summary
Implemented state persistence layer storing windows/tabs in ~/.rp-cli/state.json with getWindow, createTab, updateTab functions. All 10 unit tests pass.
## Evidence
- Commits: 9abe8e70b1f66c52d50de639bffc99b21a341a02
- Tests: bun test src/state.test.ts
- PRs: