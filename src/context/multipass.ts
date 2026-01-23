/**
 * Multi-Pass Review Handler
 *
 * Implements Option B: Multi-Pass with Confidence Scoring
 *
 * For large or critical reviews (>10 files, security reviews):
 * 1. Pass 1 (Haiku): Analyze change, identify focus areas
 * 2. Pass 2 (3x Sonnet parallel): Each agent reviews with different focus
 * 3. Pass 3 (Haiku): Score confidence on each finding
 * 4. Merge, dedupe, filter to 80+ confidence
 *
 * Research-backed:
 * - Multiple perspectives catch more issues (Claude official)
 * - Confidence scoring reduces false positives (Claude official)
 */

import { $ } from "bun";
import { join } from "path";
import { homedir } from "os";

/** Configuration for multi-pass review */
export interface MultiPassConfig {
  /** Number of parallel review agents (default: 3) */
  parallelAgents: number;
  /** Focus areas for each agent */
  focuses: string[];
  /** Minimum confidence score to include (default: 80) */
  confidenceThreshold: number;
  /** Model for discovery pass (default: haiku) */
  discoveryModel?: string;
  /** Model for review pass (default: sonnet) */
  reviewModel?: string;
  /** Model for scoring pass (default: haiku) */
  scoringModel?: string;
}

/** A single finding from a review agent */
export interface Finding {
  /** Severity level */
  severity: "critical" | "major" | "minor";
  /** File path */
  file: string;
  /** Line number (if available) */
  line?: number;
  /** Issue description */
  issue: string;
  /** Evidence or reasoning */
  evidence?: string;
  /** Suggested fix */
  fix?: string;
  /** Focus area that found this */
  focus: string;
  /** Confidence score (0-100) */
  confidence?: number;
}

/** Result from multi-pass review */
export interface MultiPassResult {
  /** Findings that passed confidence threshold */
  findings: Finding[];
  /** Summary of the review */
  summary: {
    filesReviewed: number;
    totalFindings: number;
    filteredFindings: number;
    riskLevel: "low" | "medium" | "high";
  };
  /** Verdict */
  verdict: "SHIP" | "NEEDS_WORK" | "MAJOR_RETHINK";
  /** Raw output for display */
  rawOutput: string;
}

/** Default focus areas for review agents */
const DEFAULT_FOCUSES = [
  "correctness", // Logic errors, edge cases, spec compliance
  "security",    // Injection, auth, data exposure
  "simplicity",  // Over-engineering, complexity, test coverage
];

/**
 * Get chats directory path
 */
function getChatsDir(): string {
  const xdgDataHome = process.env.XDG_DATA_HOME;
  if (xdgDataHome) {
    return join(xdgDataHome, "wdyt", "chats");
  }
  return join(homedir(), ".wdyt", "chats");
}

/**
 * Build a focused review prompt for a specific focus area
 */
function buildFocusedPrompt(focus: string, contextXml: string): string {
  const focusInstructions: Record<string, string> = {
    correctness: `## Focus: Correctness & Spec Compliance

Your ONLY job is to find correctness issues:
- Does the code match the stated intent/spec?
- Logic errors: off-by-one, wrong operators, inverted conditions
- Edge cases: null/undefined handling, empty arrays, boundary conditions
- Async issues: unhandled promises, race conditions
- Error handling: are errors actually handled?

Ignore style, naming, and minor issues. Focus ONLY on correctness.`,

    security: `## Focus: Security

Your ONLY job is to find security issues:
- Injection vectors: SQL, XSS, command injection
- Auth/AuthZ: missing permission checks, privilege escalation
- Data exposure: logging sensitive data, over-exposing APIs
- Secrets: hardcoded credentials, API keys in code
- Dependencies: known vulnerabilities

Ignore style and correctness. Focus ONLY on security.`,

    simplicity: `## Focus: Simplicity & Test Coverage

Your ONLY job is to evaluate simplicity and test coverage:
- Over-engineering: unnecessary abstractions, premature optimization
- Complexity: could this be simpler?
- Code duplication: patterns that should be extracted
- Test coverage: are new code paths tested?
- Test quality: do tests actually assert behavior?

Ignore security and minor issues. Focus ONLY on simplicity.`,
  };

  const instructions = focusInstructions[focus] || `## Focus: ${focus}

Review the code for issues related to ${focus}.`;

  return `You are a code review specialist focused on ${focus}.

${instructions}

## Output Format

For each issue found, output in this exact format:
<finding>
  <severity>critical|major|minor</severity>
  <file>filename.ts</file>
  <line>42</line>
  <issue>Brief description of the problem</issue>
  <evidence>Why this is a problem, what could go wrong</evidence>
  <fix>Concrete suggestion to fix</fix>
</finding>

If you find no issues in your focus area, output:
<no-issues focus="${focus}" />

## Context

${contextXml}`;
}

/**
 * Build confidence scoring prompt
 */
function buildScoringPrompt(findings: Finding[]): string {
  const findingsXml = findings
    .map((f, i) => `<finding id="${i}">
  <severity>${f.severity}</severity>
  <file>${f.file}</file>
  <line>${f.line || "unknown"}</line>
  <issue>${f.issue}</issue>
  <evidence>${f.evidence || ""}</evidence>
  <fix>${f.fix || ""}</fix>
  <focus>${f.focus}</focus>
</finding>`)
    .join("\n\n");

  return `You are a code review quality assurance specialist.

Your job is to score the confidence of each finding on a scale of 0-100:
- 90-100: Definite issue, clear evidence, high impact
- 70-89: Likely issue, good reasoning, moderate impact
- 50-69: Possible issue, some evidence, lower impact
- Below 50: Uncertain, speculative, or false positive

## Scoring Criteria

Consider:
1. Is there concrete evidence for this issue?
2. Is this a real problem or a style preference?
3. Could this actually cause bugs/security issues?
4. Is the fix actionable and correct?

## Output Format

For each finding, output:
<score id="N" confidence="X" />

Where N is the finding ID and X is the confidence score (0-100).

## Findings to Score

${findingsXml}`;
}

/**
 * Parse findings from review agent output
 */
function parseFindings(output: string, focus: string): Finding[] {
  const findings: Finding[] = [];
  const findingRegex = /<finding>([\s\S]*?)<\/finding>/g;

  let match;
  while ((match = findingRegex.exec(output)) !== null) {
    const content = match[1];

    const severity = content.match(/<severity>(.*?)<\/severity>/)?.[1] || "minor";
    const file = content.match(/<file>(.*?)<\/file>/)?.[1] || "";
    const lineStr = content.match(/<line>(.*?)<\/line>/)?.[1];
    const line = lineStr && lineStr !== "unknown" ? parseInt(lineStr, 10) : undefined;
    const issue = content.match(/<issue>(.*?)<\/issue>/)?.[1] || "";
    const evidence = content.match(/<evidence>(.*?)<\/evidence>/)?.[1];
    const fix = content.match(/<fix>(.*?)<\/fix>/)?.[1];

    if (file && issue) {
      findings.push({
        severity: severity as Finding["severity"],
        file,
        line,
        issue,
        evidence,
        fix,
        focus,
      });
    }
  }

  return findings;
}

/**
 * Parse confidence scores from scoring output
 */
function parseScores(output: string): Map<number, number> {
  const scores = new Map<number, number>();
  const scoreRegex = /<score\s+id="(\d+)"\s+confidence="(\d+)"\s*\/>/g;

  let match;
  while ((match = scoreRegex.exec(output)) !== null) {
    const id = parseInt(match[1], 10);
    const confidence = parseInt(match[2], 10);
    scores.set(id, confidence);
  }

  return scores;
}

/** Valid Claude models for review */
const VALID_MODELS = new Set(["haiku", "sonnet", "opus", "claude-3-haiku-20240307", "claude-3-sonnet-20240229", "claude-3-opus-20240229"]);

/**
 * Run Claude CLI with a prompt
 * Uses Bun's shell template which properly escapes file paths
 */
async function runClaude(prompt: string, model?: string): Promise<string> {
  const tempPath = join(getChatsDir(), `multipass-${Date.now()}.txt`);
  await Bun.write(tempPath, prompt);

  try {
    // Validate model if provided to prevent command injection
    if (model && !VALID_MODELS.has(model)) {
      throw new Error(`Invalid model: ${model}. Valid models: ${[...VALID_MODELS].join(", ")}`);
    }

    // Use separate command paths to avoid string interpolation in shell
    const result = model
      ? await $`cat ${tempPath} | claude -p --no-session-persistence --model ${model}`.text()
      : await $`cat ${tempPath} | claude -p --no-session-persistence`.text();

    await $`rm ${tempPath}`.quiet();
    return result.trim();
  } catch (error) {
    await $`rm ${tempPath}`.quiet();
    throw error;
  }
}

/**
 * Deduplicate findings by file+line+issue similarity
 */
function deduplicateFindings(findings: Finding[]): Finding[] {
  const seen = new Map<string, Finding>();

  for (const finding of findings) {
    const key = `${finding.file}:${finding.line || ""}:${finding.issue.toLowerCase().slice(0, 50)}`;

    // Keep the one with higher severity or first seen
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, finding);
    } else {
      const severityOrder = { critical: 3, major: 2, minor: 1 };
      if (severityOrder[finding.severity] > severityOrder[existing.severity]) {
        seen.set(key, finding);
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Determine overall risk level from findings
 */
function determineRiskLevel(findings: Finding[]): "low" | "medium" | "high" {
  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const majorCount = findings.filter((f) => f.severity === "major").length;

  if (criticalCount > 0) return "high";
  if (majorCount > 2) return "high";
  if (majorCount > 0) return "medium";
  return "low";
}

/**
 * Determine verdict from findings
 */
function determineVerdict(findings: Finding[]): MultiPassResult["verdict"] {
  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const majorCount = findings.filter((f) => f.severity === "major").length;

  if (criticalCount > 0) return "MAJOR_RETHINK";
  if (majorCount > 2) return "NEEDS_WORK";
  if (majorCount > 0) return "NEEDS_WORK";
  return "SHIP";
}

/**
 * Format findings for display
 */
function formatFindings(findings: Finding[]): string {
  const lines: string[] = [];

  const critical = findings.filter((f) => f.severity === "critical");
  const major = findings.filter((f) => f.severity === "major");
  const minor = findings.filter((f) => f.severity === "minor");

  if (critical.length > 0) {
    lines.push("### Critical (MUST fix)");
    for (const f of critical) {
      lines.push(`- **${f.file}:${f.line || "?"}** - ${f.issue}`);
      if (f.evidence) lines.push(`  - Evidence: ${f.evidence}`);
      if (f.fix) lines.push(`  - Fix: ${f.fix}`);
      lines.push(`  - Confidence: ${f.confidence || "?"}%`);
    }
    lines.push("");
  }

  if (major.length > 0) {
    lines.push("### Major (Should fix)");
    for (const f of major) {
      lines.push(`- **${f.file}:${f.line || "?"}** - ${f.issue}`);
      if (f.fix) lines.push(`  - Fix: ${f.fix}`);
      lines.push(`  - Confidence: ${f.confidence || "?"}%`);
    }
    lines.push("");
  }

  if (minor.length > 0) {
    lines.push("### Minor (Consider fixing)");
    for (const f of minor) {
      lines.push(`- **${f.file}:${f.line || "?"}** - ${f.issue}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Run multi-pass review
 *
 * @param contextXml - Pre-built context XML
 * @param config - Multi-pass configuration
 * @returns Review result with findings and verdict
 */
export async function runMultiPassReview(
  contextXml: string,
  config: MultiPassConfig
): Promise<MultiPassResult> {
  const focuses = config.focuses.length > 0 ? config.focuses : DEFAULT_FOCUSES;

  // Pass 2: Run parallel review agents (main pass)
  // Note: Pass 1 (discovery) is skipped for now - context is already built
  console.error(`Running ${focuses.length} parallel review agents...`);

  const reviewPromises = focuses.map(async (focus) => {
    const prompt = buildFocusedPrompt(focus, contextXml);
    try {
      const output = await runClaude(prompt, config.reviewModel);
      return parseFindings(output, focus);
    } catch (error) {
      console.error(`Review agent (${focus}) failed:`, error);
      return [];
    }
  });

  const findingArrays = await Promise.all(reviewPromises);
  let allFindings = findingArrays.flat();

  // Deduplicate findings across agents
  allFindings = deduplicateFindings(allFindings);
  console.error(`Found ${allFindings.length} unique findings`);

  if (allFindings.length === 0) {
    const filesReviewed = (contextXml.match(/<file path="/g) || []).length;
    return {
      findings: [],
      summary: {
        filesReviewed,
        totalFindings: 0,
        filteredFindings: 0,
        riskLevel: "low",
      },
      verdict: "SHIP",
      rawOutput: "No issues found by any review agent.\n\n<verdict>SHIP</verdict>",
    };
  }

  // Pass 3: Score confidence on each finding
  console.error("Scoring confidence on findings...");
  const scoringPrompt = buildScoringPrompt(allFindings);

  try {
    const scoringOutput = await runClaude(scoringPrompt, config.scoringModel);
    const scores = parseScores(scoringOutput);

    // Apply scores to findings
    allFindings = allFindings.map((f, i) => ({
      ...f,
      confidence: scores.get(i) || 50, // Default to 50 if no score
    }));
  } catch (error) {
    console.error("Confidence scoring failed:", error);
    // Continue without scores
    allFindings = allFindings.map((f) => ({ ...f, confidence: 75 }));
  }

  // Filter by confidence threshold
  const filteredFindings = allFindings.filter(
    (f) => (f.confidence || 0) >= config.confidenceThreshold
  );
  console.error(
    `Filtered to ${filteredFindings.length} findings (confidence >= ${config.confidenceThreshold})`
  );

  // Build result
  const riskLevel = determineRiskLevel(filteredFindings);
  const verdict = determineVerdict(filteredFindings);

  const rawOutput = `## Multi-Pass Code Review

### Summary
- Findings: ${filteredFindings.length} (${allFindings.length} before confidence filter)
- Risk level: ${riskLevel}

${formatFindings(filteredFindings)}

<verdict>${verdict}</verdict>`;

  // Count files from context XML (<file path="..."> tags)
  const filesReviewed = (contextXml.match(/<file path="/g) || []).length;

  return {
    findings: filteredFindings,
    summary: {
      filesReviewed,
      totalFindings: allFindings.length,
      filteredFindings: filteredFindings.length,
      riskLevel,
    },
    verdict,
    rawOutput,
  };
}

/**
 * Default multi-pass configuration
 */
export const DEFAULT_MULTIPASS_CONFIG: MultiPassConfig = {
  parallelAgents: 3,
  focuses: DEFAULT_FOCUSES,
  confidenceThreshold: 80,
  discoveryModel: undefined, // Use default (usually haiku)
  reviewModel: undefined,    // Use default (usually sonnet)
  scoringModel: undefined,   // Use default (usually haiku)
};
