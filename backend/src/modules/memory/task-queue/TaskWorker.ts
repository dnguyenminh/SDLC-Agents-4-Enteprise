/**
 * TaskWorker — SA4E-44 / SA4E-47: background polling worker for pending tasks.
 * Facade owning the polling lifecycle; task handlers live in sibling modules
 * (BR-18): fallback-tags, code-summary, tag-enrichment, structured-map,
 * task-dispatch, worker-context, task-lifecycle.
 */

import type { Logger } from 'pino';
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { TagAnalyzerService } from '../llm/analyzer.js';
import type { EmbeddingService } from '../../../engine/parsers/embedding/EmbeddingService.js';
import { PendingTaskRepository } from './PendingTaskRepository.js';
import type { PendingTask } from './models.js';
import type { TaskWorkerConfig } from './TaskWorkerConfig.js';
import { DEFAULT_TASK_WORKER_CONFIG } from './TaskWorkerConfig.js';
import type { MemoryEngine } from '../engine/index.js';
import { processTagEnrichmentTask, loadPreviousContext } from './tag-enrichment.js';
import { processCodeSummaryTask, processVectorEmbeddingTask } from './code-summary.js';
import { dispatchTask, scanForUnenrichedSymbols } from './task-dispatch.js';
import {
  applyConfigPatch, getWorkerProgress, getWorkerStats, handleTaskError,
  purgeSupersededOnStartup, recoverStaleTasks, resetProcessingOnStartup,
} from './task-lifecycle.js';
import type {
  LlmServiceLike, CodeEnrichmentHandlerLike,
  CodeSummaryDeps, TaskDispatchDeps,
} from './worker-context.js';

export { extractFallbackTags } from './fallback-tags.js';

export interface TaskWorkerStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  isRunning: boolean;
  lastPollAt: string | null;
}

export class TaskWorker {
  private readonly repo: PendingTaskRepository;
  private readonly config: TaskWorkerConfig;
  private readonly logger: Logger;
  private readonly engine: MemoryEngine;
  private tagAnalyzer?: TagAnalyzerService;
  private embeddingService?: EmbeddingService;
  private llmService?: LlmServiceLike;
  /** SA4E-107: Dedicated handler for CODE_ENRICHMENT tasks (PEGA_SUMMARY + FUNCTION_SUMMARY strategies). */
  private codeEnrichmentHandler?: CodeEnrichmentHandlerLike;
  private running = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private consecutiveEmpty = 0;
  private lastPollAt: string | null = null;
  private processing = false;
  private shutdownResolve: (() => void) | null = null;

  constructor(
    db: DatabaseAdapter,
    engine: MemoryEngine,
    logger: Logger,
    config?: Partial<TaskWorkerConfig>,
  ) {
    this.repo = new PendingTaskRepository(db);
    this.engine = engine;
    this.logger = logger.child({ component: 'TaskWorker' });
    this.config = { ...DEFAULT_TASK_WORKER_CONFIG, ...config };
  }

  setTagAnalyzer(analyzer: TagAnalyzerService): void { this.tagAnalyzer = analyzer; }
  setEmbeddingService(service: EmbeddingService): void { this.embeddingService = service; }
  setLlmService(service: LlmServiceLike): void { this.llmService = service; }

  /** SA4E-107: Wire CodeEnrichmentHandler — delegates CODE_ENRICHMENT tasks to proper handler. */
  setCodeEnrichmentHandler(handler: CodeEnrichmentHandlerLike): void {
    this.codeEnrichmentHandler = handler;
    this.logger.info('[TaskWorker] CodeEnrichmentHandler wired — enrichSymbol() will handle CODE_ENRICHMENT tasks');
  }

  async getProgress(): Promise<{ file: string | null } | null> {
    return getWorkerProgress(this.repo);
  }

  updateConfig(patch: Partial<Pick<TaskWorkerConfig, 'concurrency' | 'baseInterval' | 'maxInterval'>>): void {
    applyConfigPatch(this.config, patch, this.logger);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.logger.info('TaskWorker started');
    // On startup: reset any PROCESSING tasks from previous run (crash/restart recovery)
    this.resetProcessingOnStartup().catch(err =>
      this.logger.warn({ err }, 'TaskWorker: startup reset failed (non-fatal)'),
    );
    // On startup: bound table growth by purging superseded COMPLETED tasks
    // (keeps only the latest completed task per entry+type).
    this.purgeSupersededOnStartup().catch(err =>
      this.logger.warn({ err }, 'TaskWorker: startup purge failed (non-fatal)'),
    );
    // Delay first poll by 6s to allow LLM health check + tagAnalyzer init to complete.
    // LLMInitializer is fire-and-forget async (5s timeout) — 6s ensures it's ready.
    this.schedulePoll(6000);
  }

  stop(): Promise<void> {
    if (!this.running) return Promise.resolve();
    this.running = false;
    if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null; }
    if (!this.processing) { this.logger.info('TaskWorker stopped'); return Promise.resolve(); }
    return new Promise<void>(resolve => { this.shutdownResolve = resolve; });
  }

  /** Reset ALL tasks stuck in PROCESSING to PENDING on startup (crash recovery). */
  async resetProcessingOnStartup(): Promise<number> {
    return resetProcessingOnStartup(this.repo, this.logger);
  }

  async purgeSupersededOnStartup(): Promise<number> {
    return purgeSupersededOnStartup(this.repo, this.logger);
  }

  async recoverStaleTasks(): Promise<number> {
    return recoverStaleTasks(this.repo, this.config, this.logger);
  }

  async getStats(): Promise<TaskWorkerStats> {
    return getWorkerStats(this.repo, this.running, this.lastPollAt);
  }

  getRepository(): PendingTaskRepository { return this.repo; }

  getConcurrency(): number { return this.config.concurrency ?? 1; }

  private schedulePoll(delayMs: number): void {
    if (!this.running) return;
    this.pollTimer = setTimeout(() => this.poll(), delayMs);
  }

  private async poll(): Promise<void> {
    if (!this.running) { this.finishShutdown(); return; }
    this.lastPollAt = new Date().toISOString();
    try {
      const concurrency = this.config.concurrency ?? 1;
      const tasks = await this.repo.claimBatch(concurrency);
      if (tasks.length === 0) {
        this.consecutiveEmpty++;
        // SA4E-209: Periodic scan for unenriched symbols when queue is idle
        if (this.consecutiveEmpty === 5) {
          await scanForUnenrichedSymbols(this.engine, this.logger);
        }
        const delay = Math.min(
          this.config.baseInterval * Math.pow(2, this.consecutiveEmpty),
          this.config.maxInterval);
        this.schedulePoll(delay);
        return;
      }
      this.consecutiveEmpty = 0;
      this.processing = true;
      // Run all claimed tasks concurrently — keeps GPU busy between token batches
      const batchStart = Date.now();
      await Promise.allSettled(tasks.map(task => this.processTask(task)));
      const batchDuration = Date.now() - batchStart;
      this.processing = false;
      if (!this.running) { this.finishShutdown(); return; }
      // Fast-path: if batch completed in <500ms (skipped/cached), poll immediately
      // This avoids wasting 2s delay between already-enriched entries
      const delay = batchDuration < 500 ? 0 : this.config.baseInterval;
      this.schedulePoll(delay);
    } catch (err) {
      this.processing = false;
      this.logger.error({ err }, 'Poll cycle error');
      this.schedulePoll(this.config.baseInterval * 2);
    }
  }

  private finishShutdown(): void {
    this.logger.info('TaskWorker stopped');
    this.shutdownResolve?.();
    this.shutdownResolve = null;
  }

  private async processTask(task: PendingTask): Promise<void> {
    await dispatchTask(this.dispatchDeps(), task);
  }

  private dispatchDeps(): TaskDispatchDeps {
    return {
      repo: this.repo, engine: this.engine, logger: this.logger,
      codeEnrichmentHandler: this.codeEnrichmentHandler,
      processTagEnrichment: (task, payload) => this.processTagEnrichment(task, payload),
      processVectorEmbedding: (task, payload) => this.processVectorEmbedding(task, payload),
      processCodeSummary: (task, payload) => this.processCodeSummary(task, payload),
      handleTaskError: (task, err) => handleTaskError(this.repo, task, err),
    };
  }

  // ── Delegations to extracted handler modules (live deps per call) ──

  private tagDeps() {
    return {
      repo: this.repo, engine: this.engine, config: this.config, logger: this.logger, tagAnalyzer: this.tagAnalyzer, llmService: this.llmService,
      loadPreviousContext: (entryId: number, source: string | null) => this.loadPreviousContext(entryId, source),
    };
  }

  private codeDeps(): CodeSummaryDeps {
    return { repo: this.repo, engine: this.engine, config: this.config, logger: this.logger, llmService: this.llmService, embeddingService: this.embeddingService };
  }

  private async processTagEnrichment(task: PendingTask, payload: any): Promise<void> {
    await processTagEnrichmentTask(this.tagDeps(), task, payload);
  }

  private async processCodeSummary(task: PendingTask, payload: any): Promise<void> {
    await processCodeSummaryTask(this.codeDeps(), task, payload);
  }

  private async processVectorEmbedding(task: PendingTask, payload: any): Promise<void> {
    await processVectorEmbeddingTask(this.codeDeps(), task, payload);
  }

  private async loadPreviousContext(entryId: number, source: string | null) {
    return loadPreviousContext(this.tagDeps(), entryId, source);
  }

  private async handleTaskError(task: PendingTask, err: Error): Promise<void> {
    await handleTaskError(this.repo, task, err);
  }
}
