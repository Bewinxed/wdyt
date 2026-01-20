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
Implemented prompt commands: get (returns current prompt text), set via `call prompt {"op":"set","text":"..."}`, and export to file via `prompt export <file>`.
## Evidence
- Commits: eb557dede4324029b6044ce15717bbf81d0a03a1
- Tests: ./rp-cli -w 1 -t <tab> -e 'prompt get', ./rp-cli -w 1 -t <tab> -e 'call prompt {"op":"set","text":"hello"}', ./rp-cli -w 1 -t <tab> -e 'prompt export /tmp/out.txt'
- PRs: