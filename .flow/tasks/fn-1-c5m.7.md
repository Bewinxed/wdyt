# fn-1-c5m.7 Chat send command

## Description
Implement `call chat_send` to export context for review.

**Size:** M
**Files:** `src/commands/chat.ts`

## Approach
- Parse JSON payload with message, model, etc.
- Assemble context: prompt + selected files as XML
- Export to file (since no GUI)
- Return `Chat: \`<id>\`` format

## Key context
- flowctl.py lines 3975, 272-289 for payload structure
- XML format: `<file path="...">content</file>`
## Acceptance
- [ ] `call chat_send {json}` exports context to `~/.rp-cli/chats/<id>.xml`
- [ ] Returns `Chat: \`<uuid>\`` (parseable by flowctl)
- [ ] XML includes directory structure and file contents
- [ ] Handles missing files gracefully
## Done summary
TBD

## Evidence
- Commits:
- Tests:
- PRs:
