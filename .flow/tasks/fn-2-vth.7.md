# fn-2-vth.7 Flow-Next spec loading

## Description
## Flow-Next Spec Loading

Create `src/flow/specs.ts` to load task specs from .flow/ directory.

### Requirements
- Parse task ID (fn-N.M format)
- Load spec from .flow/tasks/fn-N/fn-N.M.md or similar
- Include spec content in review context
- Graceful fallback if no spec found

### Output Format
```xml
<task_spec>
## Task: fn-2.3 - Context hints generation

### Requirements
...

### Acceptance Criteria
...
</task_spec>
```

### Acceptance Criteria
- [ ] Parses task ID from payload
- [ ] Loads spec from .flow/ directory
- [ ] Includes spec in XML context
- [ ] Handles missing spec gracefully
## Acceptance
- [ ] TBD

## Done summary
Implemented Flow-Next spec loading module at `src/flow/specs.ts` that parses task IDs (fn-N.M format), loads specs from .flow/tasks/ or .flow/specs/, formats them as XML, and handles missing specs gracefully.
## Evidence
- Commits: 021a2cb7ec1136b11c880fa4b41ebf122f895b3c
- Tests: bun test src/flow/specs.test.ts
- PRs: