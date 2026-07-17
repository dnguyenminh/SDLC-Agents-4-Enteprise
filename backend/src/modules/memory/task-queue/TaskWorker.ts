/**
 * TaskWorker — SA4E-44
 * Background polling worker for pending tasks.
 * Non-blocking start, exponential backoff, graceful shutdown.
 */

import type { Logger } from 'pino';
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { TagAnalyzerService } from '../llm/analyzer.js';
import type { EmbeddingService } from '../../../engine/parsers/embedding/EmbeddingService.js';
import { PendingTaskRepository } from './PendingTaskRepository.js';
import { TaskType } from './models.js';
import type { PendingTask } from './models.js';
import type { TaskWorkerConfig } from './TaskWorkerConfig.js';
import { DEFAULT_TASK_WORKER_CONFIG } from './TaskWorkerConfig.js';
import type { MemoryEngine } from '../engine/index.js';

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

  setTagAnalyzer(analyzer: TagAnalyzerService): void {
    this.tagAnalyzer = analyzer;
  }

  setEmbeddingService(service: EmbeddingService): void {
    this.embeddingService = service;
  }

  /** Start the polling loop. Non-blocking (BR-8). */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.logger.info('TaskWorker started');
    this.schedulePoll(0);
  }

  /** Graceful shutdown — waits for current task to finish. */
  stop(): Promise<void> {
    if (!this.running) return Promise.resolve();
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (!this.processing) {
      this.logger.info('TaskWorker stopped');
      return Promise.resolve();
    }
    return new Promise<void>(resolve => {
      this.shutdownResolve = resolve;
    });
  }

  /** Recover stale tasks on startup (UC-3). */
  recoverStaleTasks(): number {
    const recovered = this.repo.recoverStaleTasks(
      this.config.staleThreshold,
    );
    if (recovered > 0) {
      this.logger.info({ recovered }, 'Recovered stale tasks');
    }
    return recovered;
  }

  getStats(): TaskWorkerStats {
    const dbStats = this.repo.getStats();
    return {
      ...dbStats,
      isRunning: this.running,
      lastPollAt: this.lastPollAt,
    };
  }

  getRepository(): PendingTaskRepository {
    return this.repo;
  }

  // ── Private ──

  private schedulePoll(delayMs: number): void {
    if (!this.running) return;
    this.pollTimer = setTimeout(() => this.poll(), delayMs);
  }

  private async poll(): Promise<void> {
    if (!this.running) {
      this.finishShutdown();
      return;
    }
    this.lastPollAt = new Date().toISOString();
    try {
      const task = this.repo.claimNext();
      if (!task) {
        this.consecutiveEmpty++;
        const delay = Math.min(
          this.config.baseInterval * Math.pow(2, this.consecutiveEmpty),
          this.config.maxInterval,
        );
        this.schedulePoll(delay);
        return;
      }
      this.consecutiveEmpty = 0;
      this.processing = true;
      await this.processTask(task);
      this.processing = false;
      if (!this.running) { this.finishShutdown(); return; }
      this.schedulePoll(this.config.baseInterval);
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
    try {
      const entry = this.engine.findById(task.entry_id);
      if (!entry) {
        this.repo.markFailed(task.id, 'entry_not_found');
        return;
      }
      let payload: any;
      try { payload = JSON.parse(task.payload); }
      catch { this.repo.markFailed(task.id, 'invalid_json_payload'); return; }

      switch (task.task_type) {
        case TaskType.TAG_ENRICHMENT:
          await this.processTagEnrichment(task, payload);
          break;
        case TaskType.VECTOR_EMBEDDING:
          await this.processVectorEmbedding(task, payload);
          break;
        default:
          this.repo.markFailed(task.id, `unknown_task_type: ${task.task_type}`);
      }
    } catch (err: any) {
      this.handleTaskError(task, err);
    }
  }

  private async processTagEnrichment(
    task: PendingTask, payload: any,
  ): Promise<void> {
    if (!this.tagAnalyzer) {
      this.repo.resetForRetry(task.id);
      return;
    }
    const result = await this.tagAnalyzer.analyzeTags(
      payload.content, payload.options,
    );
    if (result.appliedTags.length > 0) {
      const existing = payload.existing_tags
        ? payload.existing_tags.split(',').map((t: string) => t.trim()).filter(Boolean)
        : [];
      const merged = [...new Set([...existing, ...result.appliedTags])];
      this.engine.updateTags(task.entry_id, merged.join(','));
    }
    this.repo.markCompleted(task.id);
  }

  private async processVectorEmbedding(
    task: PendingTask, payload: any,
  ): Promise<void> {
    if (!this.embeddingService) {
      this.repo.resetForRetry(task.id);
      return;
    }
    const vector = await this.embeddingService.generateEmbedding(payload.text);
    const buf = Buffer.from(new Float32Array(vector).buffer);
    this.engine.getDb().prepare(
      'UPDATE knowledge_entries SET vector = ? WHERE id = ?',
    ).run(buf, task.entry_id);
    this.repo.markCompleted(task.id);
  }

  private handleTaskError(task: PendingTask, err: Error): void {
    const nonRetryable = err.message.includes('invalid_json')
      || err.message.includes('entry_not_found');
    if (nonRetryable || task.retry_count + 1 >= task.max_retries) {
      this.repo.markFailed(task.id, err.message);
    } else {
      this.repo.markFailed(task.id, err.message);
      this.repo.resetForRetry(task.id);
    }
  }
}
