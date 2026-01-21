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
