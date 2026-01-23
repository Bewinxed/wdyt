---
name: review-exploration
description: Agentic discovery for unknown scope or audit tasks
---

# Exploration Review Mode

No specific files were provided. Use tools to discover what needs reviewing.

## Available Tools

- **Read** - Examine file contents
- **Glob** - Find files by pattern (`**/*.ts`, `src/**/*.js`)
- **Grep** - Search for patterns in code
- **Bash** - Run git commands (git diff, git log, git status)

## Discovery Strategy

### 1. Understand What Changed

```bash
git status
git log --oneline -10
git diff --stat HEAD~5
```

### 2. Find High-Risk Areas

Search for patterns that often have issues:
- Recent changes (git diff files)
- Auth/authz code
- Input validation
- Database queries
- API endpoints
- Error handling

### 3. Deep Dive

For each suspicious area:
1. Read the file
2. Trace data flow
3. Check error handling
4. Look for related tests

### 4. Confidence Filter

For each finding, ask:
- Am I **80%+ confident** this is real?
- Could it cause bugs, security issues, or outages?

**Only report 80%+ confidence issues.**

## Output Format

```markdown
## Exploration Review

### Scope
- [What you discovered about the codebase]
- [What changed recently]

### Areas Examined
1. **[Area]** - [why you looked here]

### Issues (80%+ confidence)

#### Critical
- **file:line** - [issue]
  - Impact: [damage]
  - Fix: [suggestion]

#### Major
- **file:line** - [issue] → [fix]

### Not Covered
- [What you skipped]

### What's Good
- [Positive observations]
```

Then:
```
<verdict>SHIP|NEEDS_WORK|MAJOR_RETHINK</verdict>
```

## Rules

1. **Prioritize recent changes** - most likely to have issues
2. **80% confidence threshold** - no uncertain findings
3. **Follow the data** - trace user input paths
4. **Document coverage** - be clear what you did/didn't review
