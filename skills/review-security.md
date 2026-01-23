---
name: review-security
description: Security-focused review for sensitive code
---

# Security Review

This code touches security-sensitive areas. Be paranoid.

## Process (Chain of Thought)

### 1. Trace Data Flow
Follow user input from entry to storage/output. Every trust boundary needs validation.

### 2. Check Input Validation
- All user input validated before use?
- SQL queries parameterized?
- File paths checked for traversal (../)?
- URLs validated before fetch/redirect?

### 3. Check Auth
- Auth checks on all protected routes?
- Session tokens cryptographically secure?
- Password handling uses proper hashing?
- No auth bypass paths?

### 4. Check Data Protection
- Sensitive data not logged?
- Secrets not hardcoded?
- PII properly handled?
- Encryption for sensitive storage/transit?

### 5. Common Vulnerabilities
- XSS vectors (user content escaped)?
- CSRF protection on state-changing operations?
- Open redirects?
- Rate limiting on sensitive endpoints?
- Error messages don't leak stack traces?

## Confidence Rule

For each issue, ask: Am I **80%+ confident** this is exploitable?
When in doubt about security, flag it anyway - better to discuss than to miss.

## Output

```markdown
## Security Review

### Threat Summary
- Attack surface: [what's exposed]
- Sensitive data: [what's at risk]
- Risk level: Low / Medium / High / Critical

### Vulnerabilities (by severity)

#### Critical
- **file:line** - [vulnerability type]
  - Attack: [how it could be exploited]
  - Impact: [what damage could result]
  - Fix: [specific remediation]

#### High
- **file:line** - [issue] → [fix]

#### Medium/Low
- **file:line** - [observation]

### Security Positives
- [good security practices observed]

### Recommendations
- [additional hardening suggestions]
```

Then:
```
<verdict>SHIP|NEEDS_WORK|MAJOR_RETHINK</verdict>
```
