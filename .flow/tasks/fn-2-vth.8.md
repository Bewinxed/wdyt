# fn-2-vth.8 Integration test with flowctl

## Description
## Integration Test with flowctl

End-to-end test verifying wdyt works correctly with flowctl.

### Test Scenarios
1. `flowctl rp setup-review` → wdyt builder → creates tab
2. `flowctl rp select-add` → wdyt select add → adds files
3. `flowctl rp chat-send` → wdyt chat_send → Claude review with:
   - Context hints from changed files
   - Git diff summary
   - Parsed verdict in response

### Test Script
```bash
# Setup
W=1
T=$(rp-cli -w $W -e 'builder "test"' --raw-json | jq -r '.tabId')

# Add files
rp-cli -w $W -t $T -e 'select add "src/context/symbols.ts"'

# Send review
rp-cli -w $W -t $T -e 'call chat_send {"message":"Review this","mode":"review"}'
# Should include context hints and return verdict
```

### Acceptance Criteria
- [ ] flowctl commands work with wdyt
- [ ] Context hints appear in review
- [ ] Git diff context appears in review
- [ ] Verdict is parsed and returned
- [ ] Re-review preamble works
## Acceptance
- [ ] TBD

## Done summary
Added comprehensive end-to-end integration tests verifying wdyt works correctly with flowctl's rp-cli interface, covering the full pipeline (builder, select add, chat_send), context hints generation, git diff formatting, verdict parsing, re-review workflow with cache-busting preamble, and Flow-Next spec loading. All 21 integration tests pass along with 148 total tests.
## Evidence
- Commits: 0d339a7fb2e595c5892ff88699db0922852f6872
- Tests: bun test src/integration.test.ts, bun test
- PRs: