/**
 * Context module exports
 *
 * Provides symbol extraction, reference finding, and context hints
 * generation for code reviews.
 */

// Symbol extraction
export {
  extractSymbols,
  extractSymbolsFromFile,
  isSupported,
  getSupportedExtensions,
  type Symbol,
  type SymbolType,
} from "./symbols";

// Reference finding
export {
  findReferences,
  findReferencesForSymbols,
  formatReferences,
  isGitRepository,
  type Reference,
  type FindReferencesOptions,
} from "./references";

// Context hints generation
export {
  generateContextHints,
  getFormattedContextHints,
  generateHintsFromDiff,
  formatHints,
  type ContextHint,
  type GenerateHintsOptions,
} from "./hints";

// Re-review cache-busting
export {
  buildReReviewPreamble,
  getChangedFiles,
  detectReReview,
  recordReview,
  getPreviousReviewState,
  clearReviewState,
  processReReview,
  type ReReviewOptions,
} from "./rereview";

// Code map extraction (signatures without bodies)
export {
  extractCodeMap,
  extractCodeMapFromFile,
  formatCodeMap,
  estimateCodeMapTokens,
  type CodeMap,
  type CodeMapEntry,
  type CodeMapEntryType,
} from "./codemap";

// Context builder (RepoPrompt-compatible)
export {
  buildOptimizedContext,
  buildContextPlan,
  buildContextXml,
  rankFiles,
  formatContextPlanSummary,
  type TokenBudget,
  type RankedFile,
  type ContextPlan,
} from "./builder";

// Strategy selection (adaptive review approach)
export {
  selectStrategy,
  getGitDiffStats,
  formatStrategy,
  type StrategyType,
  type StrategyContext,
  type StrategyConfig,
  type ReviewStrategy,
  type GitDiffStats,
} from "./strategy";

// Multi-pass review (Option B)
export {
  runMultiPassReview,
  DEFAULT_MULTIPASS_CONFIG,
  type MultiPassConfig,
  type Finding,
  type MultiPassResult,
} from "./multipass";

// Exploration review (Option C)
export {
  runExplorationReview,
  DEFAULT_EXPLORATION_CONFIG,
  type ExplorationConfig,
  type ExplorationResult,
} from "./exploration";
