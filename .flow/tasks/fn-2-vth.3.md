# fn-2-vth.3 Context hints generation

## Description
## Context Hints Generation

Create `src/context/hints.ts` that combines symbol extraction + reference finding.

### Requirements
- For each changed file, extract symbols
- For each symbol, find references
- Curate to max 15 hints (most relevant)
- Output format matching flowctl's `gather_context_hints()`

### Output Format
```
Consider these related files:
- src/auth.ts:15 - references validateToken
- src/types.ts:42 - references User
```

### Acceptance Criteria
- [ ] Combines symbol extraction + reference finding
- [ ] Limits to 15 context hints max
- [ ] Prioritizes by relevance (frequency of reference)
- [ ] Output matches flowctl format
- [ ] Integration with chat.ts
## Acceptance
- [ ] TBD

## Done summary
Implemented context hints generation module that combines symbol extraction and reference finding to identify related files affected by code changes, with output format matching flowctl's gather_context_hints(). Module limits to 15 hints prioritized by reference frequency.
## Evidence
- Commits: 8bb2d78396fcbc6e13f2be41fff0637263989fb5
- Tests: bun test src/context/hints.test.ts, bun test src/context/
- PRs: