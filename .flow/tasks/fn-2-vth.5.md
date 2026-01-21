# fn-2-vth.5 Verdict parsing

## Description
## Verdict Parsing

Update `src/commands/chat.ts` to parse structured verdicts from Claude response.

### Requirements
- Parse `<verdict>SHIP|NEEDS_WORK|MAJOR_RETHINK</verdict>` from response
- Return structured result with verdict field
- Keep raw response for display

### Response Structure
```typescript
interface ChatResponse {
  id: string;
  path: string;
  review: string;
  verdict?: 'SHIP' | 'NEEDS_WORK' | 'MAJOR_RETHINK';
}
```

### Acceptance Criteria
- [ ] Parses SHIP verdict
- [ ] Parses NEEDS_WORK verdict
- [ ] Parses MAJOR_RETHINK verdict
- [ ] Handles missing verdict gracefully
- [ ] Returns both raw response and parsed verdict
## Acceptance
- [ ] TBD

## Done summary
Added verdict parsing to extract SHIP/NEEDS_WORK/MAJOR_RETHINK from Claude response using <verdict> XML tags. The ChatSendResponse now includes both the raw review text and the parsed verdict.
## Evidence
- Commits: 48b85d30880aff7e1ac4ffa072175a221ec1e158
- Tests: bun test, bun run build
- PRs: