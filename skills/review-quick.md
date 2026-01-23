---
name: review-quick
description: Fast review for small, focused changes
---

# Quick Review

Small, focused change. Be efficient but thorough.

## Process (Chain of Thought)

1. **Understand Intent** - What is this change trying to do?
2. **Check Correctness** - Does the code match the intent? Off-by-one? Null checks?
3. **Check Error Handling** - Are errors caught and handled properly?
4. **Security Basics** - No hardcoded secrets? No obvious injection vectors?

## Confidence Rule

For each issue, ask: Am I **80%+ confident** this is real?
Only report high-confidence issues.

## Skip

- Style nitpicks
- Refactoring suggestions
- "Nice to have" improvements

## Output

```markdown
## Quick Review

**Change:** [1-sentence summary]
**Risk:** Low / Medium

### Issues (80%+ confidence)
- **file:line** - [issue] → [fix]

### Looks Good
- [positive observation]
```

Then:
```
<verdict>SHIP|NEEDS_WORK</verdict>
```

Keep it brief. If it's clean, say so and ship it.
