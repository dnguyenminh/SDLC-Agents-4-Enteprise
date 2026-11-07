/**
 * SA4E-85 — IdeContextManager (Task 6.1-6.5).
 * Extension Host context manager — tracks token usage, file list,
 * implements context pruning, and emits state change events.
 * Business Rules: BR-08 (pulse >80%), BR-09 (auto-suggest >90%), BR-10 (/clear).
 */

import type * as vscode from 'vscode';
import type { IContextManager, ContextState, ContextFile } from './types';
import { suggestPrune } from './pruningAlgorithm';
import type { PruneCandidate } from './pruningAlgorithm';

/** Threshold percentages for UI behavior triggers */
const PULSE_THRESHOLD = 80;
const AUTO_SUGGEST_THRESHOLD = 90;

/**
 * Concrete implementation of IContextManager.
 * Manages token budget, file tracking, and pruning suggestions.
 * Emits onContextChanged when state mutates.
 */
export class IdeContextManager implements IContextManager {
  private files: Map<string, ContextFile> = new Map();
  private maxTokens: number;
  private readonly emitter: vscode.EventEmitter<ContextState>;
  readonly onContextChanged: vscode.Event<ContextState>;

  constructor(
    maxTokens: number,
    eventEmitterFactory: () => vscode.EventEmitter<ContextState>
  ) {
    this.maxTokens = maxTokens;
    this.emitter = eventEmitterFactory();
    this.onContextChanged = this.emitter.event;
  }

  /** Get current snapshot of context state */
  getState(): ContextState {
    const files = Array.from(this.files.values());
    const tokenCount = this.computeTotalTokens(files);
    const usagePercent = this.computeUsagePercent(tokenCount);
    const pruneSuggestions = this.computePruneSuggestions(tokenCount, files);

    return { tokenCount, maxTokens: this.maxTokens, files, usagePercent, pruneSuggestions };
  }

  /** Add a file to the context window. importanceScore defaults to a path-heuristic value. */
  pinFile(filePath: string, tokenCount: number, importanceScore?: number): void {
    const file: ContextFile = {
      filePath,
      tokenCount,
      pinnedAt: Date.now(),
      relevanceScore: 1.0,
      importanceScore: importanceScore ?? this.determineImportanceScore(filePath),
    };
    this.files.set(filePath, file);
    this.emitChange();
  }

  /** Remove a file from context, freeing its tokens */
  unpinFile(filePath: string): void {
    if (!this.files.has(filePath)) return;
    this.files.delete(filePath);
    this.emitChange();
  }

  /** Clear all context files (BR-10: /clear resets ALL) */
  clearAll(): void {
    this.files.clear();
    this.emitChange();
  }

  /** Get pruning suggestions based on current usage */
  suggestPrune(): PruneCandidate[] {
    const files = Array.from(this.files.values());
    const tokenCount = this.computeTotalTokens(files);
    return suggestPrune(files, tokenCount, this.maxTokens);
  }

  /** Update relevance score for a specific file */
  updateRelevance(filePath: string, relevanceScore: number): void {
    const file = this.files.get(filePath);
    if (!file) return;
    file.relevanceScore = Math.max(0, Math.min(1, relevanceScore));
    this.emitChange();
  }

  /** Update maximum token capacity */
  setMaxTokens(maxTokens: number): void {
    this.maxTokens = maxTokens;
    this.emitChange();
  }

  /** Check if badge should pulse (BR-08: >80%) */
  shouldPulse(): boolean {
    const state = this.getState();
    return state.usagePercent > PULSE_THRESHOLD;
  }

  /** Check if auto-suggest should activate (BR-09: >90%) */
  shouldAutoSuggest(): boolean {
    const state = this.getState();
    return state.usagePercent > AUTO_SUGGEST_THRESHOLD;
  }

  /** Determine importance score based on file path heuristics */
  private determineImportanceScore(filePath: string): number {
    const lowerPath = filePath.toLowerCase();
    if (lowerPath.includes('system') || lowerPath.includes('prompt')) return 1.0;
    if (lowerPath.includes('current') || lowerPath.includes('request')) return 1.0;
    if (lowerPath.includes('tool') && lowerPath.includes('result')) return 0.8;
    if (lowerPath.includes('code') || lowerPath.includes('api')) return 0.7;
    if (lowerPath.includes('old') || lowerPath.includes('log')) return 0.1;
    return 0.3; // default importance
  }

  /** Dispose the event emitter */
  dispose(): void {
    this.emitter.dispose();
  }

  /** Sum token counts across all pinned files */
  private computeTotalTokens(files: ContextFile[]): number {
    return files.reduce((sum, f) => sum + f.tokenCount, 0);
  }

  /** Calculate usage percentage (0-100) */
  private computeUsagePercent(tokenCount: number): number {
    if (this.maxTokens <= 0) return 0;
    return Math.round((tokenCount / this.maxTokens) * 100);
  }

  /** Generate prune suggestions when over auto-suggest threshold */
  private computePruneSuggestions(
    tokenCount: number,
    files: ContextFile[]
  ): PruneCandidate[] {
    const usagePercent = this.computeUsagePercent(tokenCount);
    if (usagePercent <= AUTO_SUGGEST_THRESHOLD) return [];
    return suggestPrune(files, tokenCount, this.maxTokens);
  }

  /** Emit current state to listeners */
  private emitChange(): void {
    this.emitter.fire(this.getState());
  }
}
