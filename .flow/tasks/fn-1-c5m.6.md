# fn-1-c5m.6 Select commands (get/add)

## Description
Implement select commands: get, add.

**Size:** M
**Files:** `src/commands/select.ts`

## Approach
- `select get` - return selected file paths
- `select add <paths>` - add files to selection
- Use `ignore` package for gitignore filtering

## Key context
- flowctl.py lines 3946, 3955
- Paths should be absolute or relative to window root
## Acceptance
- [ ] `select get` returns newline-separated file paths
- [ ] `select add src/foo.ts src/bar.ts` adds files
- [ ] Duplicate paths are deduplicated
- [ ] Non-existent files are silently skipped
## Done summary
Implemented select get and select add commands. select get returns newline-separated file paths; select add parses shell-quoted paths, deduplicates, and silently skips non-existent files.
## Evidence
- Commits: d5a58e4d137718962c27364dbb0f77d0f248e659
- Tests: bun build && ./rp-cli -w 1 -t <tab> -e 'select get', ./rp-cli -w 1 -t <tab> -e 'select add src/cli.ts src/state.ts'
- PRs: