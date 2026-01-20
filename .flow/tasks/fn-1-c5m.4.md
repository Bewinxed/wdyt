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
TBD

## Evidence
- Commits:
- Tests:
- PRs:
