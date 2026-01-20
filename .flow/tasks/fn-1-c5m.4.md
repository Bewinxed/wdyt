# fn-1-c5m.4 Builder command

## Description
Implement `builder` command that creates a new tab.

**Size:** S
**Files:** `src/commands/builder.ts`

## Approach
- Parse JSON arg: `{summary: string}`
- Create tab in state, return `Tab: <uuid>`
- Match flowctl.py regex at line 255-259

## Key context
- Output format: `Tab: <uuid>` (parsed by regex `Tab:\s*([A-Za-z0-9-]+)`)
## Acceptance
- [ ] `rp-cli -w 1 -e "builder {\"summary\":\"test\"}"` returns `Tab: <uuid>`
- [ ] Tab UUID is valid format (alphanumeric + hyphens)
- [ ] Tab is persisted in state under the window
## Done summary
Implemented builder command that creates tabs in a window. The command parses JSON args with summary field, creates a tab in state, and returns Tab: <uuid> matching flowctl.py regex.
## Evidence
- Commits: 9f5e83469d37db06a211735c12f680129db7b7ee
- Tests: ./rp-cli -w 1 -e 'builder {"summary":"test"}', ./rp-cli -w 1 -e 'builder {}', ./rp-cli -w 1 -e 'builder', cat ~/.rp-cli/state.json
- PRs: