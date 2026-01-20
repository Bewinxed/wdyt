# fn-1-c5m.8 flowctl integration test

## Description
Test full integration with flowctl.py review commands.

**Size:** S
**Files:** (test only, no new code)

## Approach
- Build rp-cli binary: `bun build --compile`
- Put in PATH or symlink
- Run `flowctl rp setup-review` and verify output
- Run `flowctl rp prompt-export` and verify file

## Key context
- flowctl.py expects specific exit codes and output formats
## Acceptance
- [ ] `flowctl rp pick-window` works without errors
- [ ] `flowctl rp setup-review --repo-root . --summary "test"` succeeds
- [ ] `flowctl rp prompt-export --file /tmp/test.txt` creates file
- [ ] No flowctl.py code changes required
## Done summary
Verified full flowctl.py integration with rp-cli. All acceptance criteria passed: pick-window, setup-review, prompt-export, select-add/get, and chat-send commands work correctly without requiring any flowctl.py code changes.
## Evidence
- Commits: 454089cd1ed3fe4174696991a2a7a4be9e8b93ac
- Tests: flowctl rp pick-window --repo-root ., flowctl rp setup-review --repo-root . --summary 'test', flowctl rp prompt-export --window 1 --tab <tab> --out /tmp/test.txt, flowctl rp select-add, flowctl rp select-get, flowctl rp chat-send --new-chat
- PRs: