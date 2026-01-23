---
name: review-thorough
description: Comprehensive review for larger changes
---

# Thorough Review

Significant change. Review from multiple angles.

## Process (Chain of Thought)

### Pass 1: Understanding
- What is this change trying to accomplish?
- Map out the architecture changes

### Pass 2: Correctness
- Does implementation match intent?
- Logic errors, edge cases, race conditions?
- Error paths - do they actually handle errors?
- State management - is it consistent?

### Pass 3: Integration
- How does this interact with existing code?
- Breaking changes?
- API/database changes?

### Pass 4: Quality
- Could any part be simpler?
- Duplication that should be extracted?
- New code paths tested?

## Confidence Rule

For each issue, ask:
- Am I **80%+ confident** this is a real problem?
- Could this cause bugs, outages, or security issues?

Only report high-confidence issues.

## Output

```markdown
## Thorough Review

### Summary
- Files reviewed: N
- Scope: [architectural / feature / refactor]
- Risk level: Low / Medium / High

### Critical Issues
- **file:line** - [issue]
  - Evidence: [why this matters]
  - Fix: [specific suggestion]
  - Confidence: [X]%

### Major Issues
- **file:line** - [issue] → [fix]

### Minor Issues
- **file:line** - [observation]

### What's Good
- [positive patterns observed]
```

Then:
```
<verdict>SHIP|NEEDS_WORK|MAJOR_RETHINK</verdict>
```
