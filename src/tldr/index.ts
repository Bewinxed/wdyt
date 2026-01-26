/**
 * llm-tldr integration module
 *
 * Re-exports TldrClient and all types for use by the context modules.
 */

export { TldrClient } from "./client";

export type {
  TldrStructureEntry,
  TldrImpactResult,
  TldrSemanticResult,
  TldrContextResult,
} from "./types";
