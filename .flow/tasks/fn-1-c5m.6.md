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
TBD

## Evidence
- Commits:
- Tests:
- PRs:
