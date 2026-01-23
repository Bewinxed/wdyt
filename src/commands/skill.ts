/**
 * Skill commands - skill get, skill list
 *
 * Allows agentic Claude to fetch skill prompts via CLI
 * Works cross-platform without hardcoded paths
 */

import { join } from "path";
import { homedir } from "os";
import { readdir } from "fs/promises";

/**
 * Get the skills directory path
 * Checks multiple locations in order:
 * 1. Source mode: import.meta.dir/../../skills
 * 2. User config: ~/.wdyt/skills
 * 3. Bundled with package (npm global install)
 */
async function getSkillsDir(): Promise<string | null> {
  const candidates = [
    // Source mode (development)
    join(import.meta.dir, "..", "..", "skills"),
    // User config
    join(homedir(), ".wdyt", "skills"),
    // Common npm global locations
    join(homedir(), ".bun", "install", "global", "node_modules", "wdyt", "skills"),
    join(homedir(), ".npm", "lib", "node_modules", "wdyt", "skills"),
  ];

  for (const dir of candidates) {
    try {
      const files = await readdir(dir);
      if (files.some((f) => f.endsWith(".md"))) {
        return dir;
      }
    } catch {
      // Directory doesn't exist or isn't readable, try next
    }
  }

  return null;
}

/**
 * Load a skill prompt from a .md file
 */
async function loadSkill(skillName: string): Promise<string | null> {
  const skillsDir = await getSkillsDir();
  if (!skillsDir) {
    return null;
  }

  const skillPath = join(skillsDir, `${skillName}.md`);
  const file = Bun.file(skillPath);

  if (!(await file.exists())) {
    return null;
  }

  const content = await file.text();
  // Strip YAML frontmatter if present
  const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n/);
  if (frontmatterMatch) {
    return content.slice(frontmatterMatch[0].length).trim();
  }
  return content.trim();
}

/**
 * Get a skill by name
 */
export async function skillGetCommand(
  skillName: string
): Promise<{ success: boolean; output?: string; error?: string }> {
  // Try file system first
  const content = await loadSkill(skillName);
  if (content) {
    return { success: true, output: content };
  }

  // Fall back to embedded skills (for compiled binary)
  const embedded = EMBEDDED_SKILLS[skillName];
  if (embedded) {
    return { success: true, output: embedded };
  }

  // List available skills in error message
  const availableSkills = Object.keys(EMBEDDED_SKILLS);
  return {
    success: false,
    error: `Skill not found: ${skillName}. Available: ${availableSkills.join(", ")}`,
  };
}

/**
 * List all available skills
 */
export async function skillListCommand(): Promise<{
  success: boolean;
  data?: string[];
  output?: string;
  error?: string;
}> {
  const skillsDir = await getSkillsDir();

  if (skillsDir) {
    try {
      const files = await readdir(skillsDir);
      const skills = files
        .filter((f) => f.endsWith(".md"))
        .map((f) => f.replace(".md", ""));

      return {
        success: true,
        data: skills,
        output: skills.join("\n"),
      };
    } catch {
      // Fall through to embedded skills
    }
  }

  // Fall back to embedded skills list
  const skills = Object.keys(EMBEDDED_SKILLS);
  return {
    success: true,
    data: skills,
    output: skills.join("\n"),
  };
}

/**
 * Embedded skills for compiled binary
 */
const EMBEDDED_SKILLS: Record<string, string> = {
  "review-router": `You are an expert code reviewer. First, analyze the context to decide the best review approach.

## Step 1: Analyze What You've Been Given

Look at the context provided:
- How many files?
- How many lines changed?
- What kind of change? (bug fix, feature, refactor, security-related)
- Is there a clear spec or requirements?

## Step 2: Choose and Load Your Skill

Based on your analysis, choose ONE approach and load its instructions:

### Quick Review
**When:** 1-3 files, <500 lines, clear purpose, bug fix or small feature
**Load:** Run \`wdyt -e 'skill get review-quick'\`

### Thorough Review
**When:** 4-10 files, significant changes, needs careful analysis
**Load:** Run \`wdyt -e 'skill get review-thorough'\`

### Security Review
**When:** Code touches auth, crypto, user input, sensitive data, or APIs
**Load:** Run \`wdyt -e 'skill get review-security'\`

### Exploration Review
**When:** No specific files given, asked to "audit" or "explore"
**Load:** Run \`wdyt -e 'skill get review-exploration'\`

## Step 3: Execute

1. State which approach you're using and why (1 sentence)
2. Run the wdyt command to load the skill instructions
3. Follow those instructions exactly

## Output

Always end with:
\`\`\`
<verdict>SHIP|NEEDS_WORK|MAJOR_RETHINK</verdict>
\`\`\``,

  "review-quick": `# Quick Review

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

\`\`\`markdown
## Quick Review

**Change:** [1-sentence summary]
**Risk:** Low / Medium

### Issues (80%+ confidence)
- **file:line** - [issue] → [fix]

### Looks Good
- [positive observation]
\`\`\`

Then:
\`\`\`
<verdict>SHIP|NEEDS_WORK</verdict>
\`\`\`

Keep it brief. If it's clean, say so and ship it.`,

  "review-thorough": `# Thorough Review

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

\`\`\`markdown
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
\`\`\`

Then:
\`\`\`
<verdict>SHIP|NEEDS_WORK|MAJOR_RETHINK</verdict>
\`\`\``,

  "review-security": `# Security Review

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

\`\`\`markdown
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
\`\`\`

Then:
\`\`\`
<verdict>SHIP|NEEDS_WORK|MAJOR_RETHINK</verdict>
\`\`\``,

  "review-exploration": `# Exploration Review

No specific files were provided. Use tools to discover what needs reviewing.

## Available Tools

- **Read** - Examine file contents
- **Glob** - Find files by pattern
- **Grep** - Search for patterns in code
- **Bash** - Run git commands (git diff, git log, git status)

## Discovery Strategy

### 1. Understand What Changed

\`\`\`bash
git status
git log --oneline -10
git diff --stat HEAD~5
\`\`\`

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

## Output

\`\`\`markdown
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
\`\`\`

Then:
\`\`\`
<verdict>SHIP|NEEDS_WORK|MAJOR_RETHINK</verdict>
\`\`\`

## Rules

1. **Prioritize recent changes** - most likely to have issues
2. **80% confidence threshold** - no uncertain findings
3. **Follow the data** - trace user input paths
4. **Document coverage** - be clear what you did/didn't review`,
};

/**
 * Get embedded skill (for compiled binary)
 */
export function getEmbeddedSkill(skillName: string): string | null {
  return EMBEDDED_SKILLS[skillName] || null;
}
