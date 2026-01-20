# fn-1-c5m.5 Prompt commands (get/set/export)

## Description
Implement prompt commands: get, set (via `call prompt`), export.

**Size:** M
**Files:** `src/commands/prompt.ts`

## Approach
- `prompt get` - return current prompt text
- `call prompt {"op":"set","text":"..."}` - set prompt
- `prompt export <file>` - write prompt to file

## Key context
- flowctl.py lines 3925, 3939, 3993
## Acceptance
- [ ] `prompt get` returns current prompt text (empty string if none)
- [ ] `call prompt {"op":"set","text":"hello"}` sets prompt
- [ ] `prompt export /tmp/out.txt` writes prompt to file
- [ ] Round-trip: set then get returns same text
## Done summary
TBD

## Evidence
- Commits:
- Tests:
- PRs:
