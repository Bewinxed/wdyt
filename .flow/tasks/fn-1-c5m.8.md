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
TBD

## Evidence
- Commits:
- Tests:
- PRs:
