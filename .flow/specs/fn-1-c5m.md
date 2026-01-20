# rp-cli Alternative for Linux (TypeScript/Bun)

## Problem
RepoPrompt's `rp-cli` is macOS-only (talks to a native app). On Linux, flow-next's code review features (`/flow-next:plan-review`, `/flow-next:impl-review`) cannot work because there's no rp-cli binary.

## Goal
Build a drop-in replacement CLI named `rp-cli` using TypeScript/Bun that implements the subset of commands flowctl.py actually uses, storing state in files instead of a GUI app.

## Key Context
- flowctl.py integration points: `.flow/bin/flowctl.py:3814-4083`
- Commands needed: `windows`, `builder`, `prompt get/set/export`, `select get/add`, `chat_send`, `manage_workspaces`
- State persists in `~/.rp-cli/` (windows, tabs, selections, prompts)
- Uses `ignore` npm package for gitignore, Bun Glob for file walking

## Quick commands
```bash
# Build
bun install && bun build ./src/cli.ts --compile --outfile rp-cli

# Test
./rp-cli --raw-json -e "windows"
./rp-cli -w 1 -e "builder {\"summary\": \"test\"}"
```

## Acceptance
- [ ] `rp-cli --raw-json -e "windows"` returns valid JSON with window list
- [ ] `rp-cli -w <id> -e "builder {json}"` creates tab and returns `Tab: <uuid>`
- [ ] `rp-cli -w <id> -t <tab> -e "prompt get/set/export"` work correctly
- [ ] `rp-cli -w <id> -t <tab> -e "select get/add"` track file selection
- [ ] `rp-cli -w <id> -t <tab> -e "call chat_send {json}"` exports context
- [ ] flowctl.py works with this replacement on Linux without code changes
