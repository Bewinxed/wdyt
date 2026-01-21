# Epic: wdyt Proper Implementation

## Summary
Transform wdyt from a shallow rp-cli mimic into a proper drop-in replacement that uses the same techniques as real flowctl/RepoPrompt for context surfacing, review orchestration, and Flow-Next integration.

## Background
The impl-review revealed wdyt is missing critical features:
- No intelligent context surfacing (symbol extraction + reference finding)
- No git diff context injection
- No verdict parsing
- No re-review cache-busting
- No task spec loading from `.flow/`
- Single backend only (Claude CLI)

## Goals
1. Implement intelligent context gathering like flowctl's `gather_context_hints()`
2. Include git diff context (stat, commits, changed files)
3. Parse structured verdicts from responses
4. Support re-review with cache-busting preamble
5. Load task specs from `.flow/` directory
6. Support multiple review backends

## Non-Goals
- Full flowctl reimplementation (focus on rp-cli drop-in)
- GUI features
- Codex session management (complex, defer)

## Technical Approach
- Add `src/context/` module for intelligent context gathering
- Add `src/git/` module for diff context
- Enhance chat.ts with verdict parsing and re-review support
- Add `.flow/` integration for spec loading

## Success Criteria
- flowctl's `rp chat-send` works seamlessly with wdyt
- Reviews include intelligent context hints
- Verdicts are parsed and returned structured
- Re-reviews properly invalidate model cache
