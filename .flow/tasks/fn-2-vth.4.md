# fn-2-vth.4 Git diff context injection

## Description
## Git Diff Context Injection

Create `src/git/diff.ts` that gathers git context for reviews.

### Requirements
- Get `git diff --stat` between base and HEAD
- Get commit history (git log)
- Get list of changed files
- Get current branch name
- Format as XML context block

### Output Format (matching flowctl)
```xml
<diff_summary>
 src/auth.ts     |  45 +++
 src/types.ts    |  12 ++
 3 files changed, 57 insertions(+)
</diff_summary>

<commits>
abc1234 feat: add auth
def5678 fix: token validation
</commits>

<changed_files>
src/auth.ts
src/types.ts
</changed_files>
```

### Acceptance Criteria
- [ ] Gets git diff --stat
- [ ] Gets commit history
- [ ] Gets changed files list
- [ ] Gets branch name
- [ ] Accepts base branch parameter (default: main)
- [ ] Unit tests pass
## Acceptance
- [ ] TBD

## Done summary
TBD

## Evidence
- Commits:
- Tests:
- PRs:
