/**
 * Shared dependency types for the extracted TaskWorker handler modules.
 * The TaskWorker facade passes its live fields here per call so runtime
 * wiring (setTagAnalyzer/setLlmService/…) is always honored.
 */
import type { Logger } from 'pino';
import type { LLMMessage, ContextChainInput } from '../llm/types.js';
import type { TagAnalyzerService } from '../llm/analyzer.js';
import type { EmbeddingService } from '../../../engine/parsers/embedding/EmbeddingService.js';
import type { PendingTask } from './models.js';
import type { PendingTaskRepository } from './PendingTaskRepository.js';
import type { TaskWorkerConfig } from './TaskWorkerConfig.js';
import type { MemoryEngine } from '../engine/index.js';

/** SA4E-99: LLM service contract used by the code-summary enrichment path. */
export type LlmServiceLike = {
  getConfig(): { model: string };
  complete(messages: LLMMessage[]): Promise<{ content: string }>;
};

/** SA4E-107: dedicated handler contract for CODE_ENRICHMENT tasks. */
export type CodeEnrichmentHandlerLike = { enrichSymbol(task: PendingTask): Promise<void> };

/** Dependency bundle for tag-enrichment handlers (processTagEnrichment + fallback). */
export interface TagEnrichmentDeps {
  repo: PendingTaskRepository;
  engine: MemoryEngine;
  config: TaskWorkerConfig;
  logger: Logger;
  tagAnalyzer?: TagAnalyzerService;
  llmService?: LlmServiceLike;
  /** Route through the facade method so test spies remain effective. */
  loadPreviousContext: (entryId: number, source: string | null) => Promise<ContextChainInput | null>;
}

/** Dependency bundle for structured_map persistence handlers. */
export interface StructuredMapDeps {
  engine: MemoryEngine;
  config: TaskWorkerConfig;
  logger: Logger;
  llmService?: LlmServiceLike;
}

/** Dependency bundle for code summary / vector embedding handlers. */
export interface CodeSummaryDeps {
  repo: PendingTaskRepository;
  engine: MemoryEngine;
  config: TaskWorkerConfig;
  logger: Logger;
  llmService?: LlmServiceLike;
  embeddingService?: EmbeddingService;
}

/** Dependency bundle for the task dispatcher. */
export interface TaskDispatchDeps {
  repo: PendingTaskRepository;
  engine: MemoryEngine;
  logger: Logger;
  codeEnrichmentHandler?: CodeEnrichmentHandlerLike;
  processTagEnrichment: (task: PendingTask, payload: any) => Promise<void>;
  processVectorEmbedding: (task: PendingTask, payload: any) => Promise<void>;
  processCodeSummary: (task: PendingTask, payload: any) => Promise<void>;
  handleTaskError: (task: PendingTask, err: Error) => Promise<void>;
}
