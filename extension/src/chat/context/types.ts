/**
 * SA4E-85 — Context Management Types.
 * Interfaces for the IdeContextManager and its state objects.
 * Decoupled from vscode namespace for testability.
 */

import type { PruneCandidate } from './pruningAlgorithm';

/** A file pinned in the active context window */
export interface ContextFile {
  filePath: string;
  tokenCount: number;
  pinnedAt: number;
  relevanceScore: number;
  /** 0-1: P0=1.0 (never cut) … P3=0.1 (cut first). Multiplies the prune score. */
  importanceScore: number;
}

/** Full snapshot of context manager state */
export interface ContextState {
  tokenCount: number;
  maxTokens: number;
  files: ContextFile[];
  usagePercent: number;
  pruneSuggestions: PruneCandidate[];
}

/**
 * Context manager interface (DIP: depend on abstraction).
 * Tracks token usage, file list, and pruning logic.
 */
export interface IContextManager {
  /** Get current context state snapshot */
  getState(): ContextState;
  /** Add file to context with its token count */
  pinFile(filePath: string, tokenCount: number): void;
  /** Remove file from context */
  unpinFile(filePath: string): void;
  /** Clear all context (BR-10: /clear) */
  clearAll(): void;
  /** Get prune suggestions when over threshold */
  suggestPrune(): PruneCandidate[];
  /** Event fired when context state changes */
  onContextChanged: unknown;
}
