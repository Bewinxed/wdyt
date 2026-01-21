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
TBD

## Evidence
- Commits:
- Tests:
- PRs:
