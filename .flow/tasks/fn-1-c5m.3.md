# fn-1-c5m.3 Windows command

## Description
Implement `windows` command that lists all windows.

**Size:** S
**Files:** `src/commands/windows.ts`

## Approach
- Return JSON: `{windows: [{windowID, rootFolderPaths}]}`
- Match flowctl.py parsing at line 215-231

## Key context
- flowctl handles multiple key formats: `windowID`, `windowId`, `id`
## Acceptance
- [ ] `rp-cli --raw-json -e "windows"` returns valid JSON
- [ ] JSON has `windows` array with `windowID` and `rootFolderPaths`
- [ ] Empty state returns empty array (no crash)
## Done summary
TBD

## Evidence
- Commits:
- Tests:
- PRs:
