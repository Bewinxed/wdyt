## Re-review Cache-busting

Update chat handling to detect re-reviews and prepend cache-busting instructions.

### Requirements
- Track chat state (is this a re-review of same context?)
- Prepend preamble for re-reviews telling model to re-read files
- Based on flowctl's `build_rereview_preamble()`

### Preamble Format
```markdown
## IMPORTANT: Re-review After Fixes

This is a RE-REVIEW. Code has been modified since your last review.

**You MUST re-read these files before reviewing** - your cached view is stale:
- src/auth.ts
- src/types.ts

Use your file reading tools to get the CURRENT content of these files.
```

### Acceptance Criteria
- [ ] Detects re-review scenario (same chat ID or explicit flag)
- [ ] Prepends cache-busting preamble
- [ ] Lists files that changed since last review
- [ ] Works with flowctl's chat-send --new-chat vs without
