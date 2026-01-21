# fn-2-vth.2 Reference finding via git grep

## Description
## Reference Finding via git grep

Create `src/context/references.ts` that finds where symbols are used across the codebase.

### Requirements
- Use `git grep -w -n <symbol>` to find references
- Filter out the definition file itself
- Return array of `{ file: string, line: number, context: string }`
- Limit results per symbol to avoid overwhelming context

### Implementation Reference (from flowctl.py find_references, line 579-642)
```bash
git grep -w -n "symbolName" -- "*.ts" "*.js" "*.py"
```

### Acceptance Criteria
- [ ] Finds references using git grep
- [ ] Excludes the definition file from results
- [ ] Returns file:line:context format
- [ ] Handles symbols with no references gracefully
- [ ] Unit tests pass
## Acceptance
- [ ] TBD

## Done summary
## Summary

Implemented reference finding module at `src/context/references.ts` using `git grep -w -n` to find symbol references across the codebase.

## Features
- Uses git grep for fast, accurate reference finding
- Filters out definition file from results
- Returns file:line:context format
- Handles symbols with no references gracefully

## Files Changed
- src/context/references.ts (new) - Main reference finding logic
- src/context/references.test.ts (new) - 19 comprehensive tests

## Test Results
All 19 tests pass.
## Evidence
- Commits: 33892ca
- Tests: src/context/references.test.ts
- PRs: