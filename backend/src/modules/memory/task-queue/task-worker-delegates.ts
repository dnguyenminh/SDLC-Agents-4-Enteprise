/**
 * TaskWorker delegate shapers — extracted from TaskWorker.ts (BR-18 SRP split).
 * Owns: building the live-deps bundles handed to the extracted handler modules
 * (tag-enrichment, code-summary, task-dispatch, task-lifecycle).
 */

import type { Logger } from 'pino';
import type { PendingTaskRepository } from './PendingTaskRepository.js';
import type { TaskWorkerConfig } from './TaskWorkerConfig.js';
import type { MemoryEngine } from '../engine/index.js';
import type { TagAnalyzerService } from '../llm/analyzer.js';
import type { EmbeddingService } from '../../../engine/parsers/embedding/EmbeddingService.js';
import type {
  LlmServiceLike, CodeEnrichmentHandlerLike,
  CodeSummaryDeps, TaskDispatchDeps,
} from './worker-context.js';
import { processTagEnrichmentTask, loadPreviousContext } from './tag-enrichment.js';
import { processCodeSummaryTask, processVectorEmbeddingTask } from './code-summary.js';
import { handleTaskError } from './task-lifecycle.js';

/** Minimal TaskWorker surface needed by the deps shapers. */
export interface TaskWorkerInternals {
  repo: PendingTaskRepository;
  engine: MemoryEngine;
  config: TaskWorkerConfig;
  logger: Logger;
  tagAnalyzer?: TagAnalyzerService;
  embeddingService?: EmbeddingService;
  llmService?: LlmServiceLike;
  /** Overridable hook so tests can spy on the worker's own method (IT-02). */
  loadPreviousContextHook?: (entryId: number, source: string | null) => ReturnType<typeof loadPreviousContext>;
}

/** Public stats shape (owned here so TaskWorker.ts stays under the line gate). */
export interface TaskWorkerStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  isRunning: boolean;
  lastPollAt: string | null;
}

/** Deps bundle for tag-enrichment (live per call — SA4E-47). */
export function buildTagDeps(w: TaskWorkerInternals) {
  return {
    repo: w.repo, engine: w.engine, config: w.config, logger: w.logger,
    tagAnalyzer: w.tagAnalyzer, llmService: w.llmService,
    loadPreviousContext: (entryId: number, source: string | null) =>
      w.loadPreviousContextHook
        ? w.loadPreviousContextHook(entryId, source)
        : loadPreviousContext(buildTagDeps(w), entryId, source),
  };
}

/** Deps bundle for code-summary + vector embedding. */
export function buildCodeDeps(w: TaskWorkerInternals): CodeSummaryDeps {
  return {
    repo: w.repo, engine: w.engine, config: w.config, logger: w.logger,
    llmService: w.llmService, embeddingService: w.embeddingService,
  };
}

/** Deps bundle for the dispatcher — wires every task handler with live deps. */
export function buildDispatchDeps(
  w: TaskWorkerInternals,
  codeEnrichmentHandler?: CodeEnrichmentHandlerLike,
): TaskDispatchDeps {
  return {
    repo: w.repo, engine: w.engine, logger: w.logger,
    codeEnrichmentHandler,
    processTagEnrichment: (task, payload) => processTagEnrichmentTask(buildTagDeps(w), task, payload),
    processVectorEmbedding: (task, payload) => processVectorEmbeddingTask(buildCodeDeps(w), task, payload),
    processCodeSummary: (task, payload) => processCodeSummaryTask(buildCodeDeps(w), task, payload),
    handleTaskError: (task, err) => handleTaskError(w.repo, task, err),
  };
}
