/**
 * TaskWorker — SA4E-44 / SA4E-47
 * Background polling worker for pending tasks.
 * Non-blocking start, exponential backoff, graceful shutdown.
 * Supports context chain + structured_map persistence.
 */

import type { Logger } from 'pino';
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { TagAnalyzerService, TagAnalysisResult } from '../llm/analyzer.js';
import type { EmbeddingService } from '../../../engine/parsers/embedding/EmbeddingService.js';
import { PendingTaskRepository } from './PendingTaskRepository.js';
import { TaskType } from './models.js';
import type { PendingTask } from './models.js';
import type { TaskWorkerConfig } from './TaskWorkerConfig.js';
import { DEFAULT_TASK_WORKER_CONFIG } from './TaskWorkerConfig.js';
import type { MemoryEngine } from '../engine/index.js';
import type { ContextChainInput, StructuredMapData } from '../llm/types.js';
import { safeParseStructuredMap } from '../llm/types.js';

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
  private llmService?: { getConfig(): { model: string } };
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
  setLlmService(service: { getConfig(): { model: string } }): void { this.llmService = service; }

  /**
   * Update mutable config fields at runtime — no restart needed.
   * Called when admin changes taskWorker config via Admin UI.
   * Supported keys: concurrency (1-8), baseInterval, maxInterval.
   */
  updateConfig(patch: Partial<Pick<TaskWorkerConfig, 'concurrency' | 'baseInterval' | 'maxInterval'>>): void {
    if (patch.concurrency !== undefined) {
      (this.config as any).concurrency = Math.max(1, Math.min(patch.concurrency, 8));
    }
    if (patch.baseInterval !== undefined) (this.config as any).baseInterval = patch.baseInterval;
    if (patch.maxInterval !== undefined) (this.config as any).maxInterval = patch.maxInterval;
    this.logger.info(
      { concurrency: this.config.concurrency, baseInterval: this.config.baseInterval },
      '[TaskWorker] Config updated live',
    );
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.logger.info('TaskWorker started');
    // On startup: reset any PROCESSING tasks from previous run (crash/restart recovery)
    this.resetProcessingOnStartup().catch(err =>
      this.logger.warn({ err }, 'TaskWorker: startup reset failed (non-fatal)'),
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

  /**
   * Reset ALL tasks stuck in PROCESSING to PENDING on startup.
   * Called once at start() — handles server restart/crash recovery immediately,
   * no need to wait for staleThreshold timeout.
   */
  async resetProcessingOnStartup(): Promise<number> {
    const result = await this.repo.resetAllProcessing();
    if (result > 0) this.logger.info({ reset: result }, 'TaskWorker: reset stuck PROCESSING tasks on startup');
    return result;
  }

  async recoverStaleTasks(): Promise<number> {
    const recovered = await this.repo.recoverStaleTasks(this.config.staleThreshold);
    if (recovered > 0) this.logger.info({ recovered }, 'Recovered stale tasks');
    return recovered;
  }

  async getStats(): Promise<TaskWorkerStats> {
    const dbStats = await this.repo.getStats();
    return { ...dbStats, isRunning: this.running, lastPollAt: this.lastPollAt };
  }

  getRepository(): PendingTaskRepository { return this.repo; }

  // ── Private ──

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
        const delay = Math.min(
          this.config.baseInterval * Math.pow(2, this.consecutiveEmpty),
          this.config.maxInterval);
        this.schedulePoll(delay);
        return;
      }
      this.consecutiveEmpty = 0;
      this.processing = true;
      // Run all claimed tasks concurrently — keeps GPU busy between token batches
      await Promise.allSettled(tasks.map(task => this.processTask(task)));
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
      const entry = await this.engine.findById(task.entry_id);
      if (!entry) { await this.repo.markFailed(task.id, 'entry_not_found'); return; }
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
          await this.repo.markFailed(task.id, `unknown_task_type: ${task.task_type}`);
      }
    } catch (err: any) { await this.handleTaskError(task, err); }
  }

  // ── SA4E-47: Enhanced Tag Enrichment ──

  private async processTagEnrichment(task: PendingTask, payload: any): Promise<void> {
    if (!this.tagAnalyzer) { this.repo.resetForRetry(task.id); return; }

    const context = this.config.enableContextChain
      ? await this.loadPreviousContext(task.entry_id, payload.source)
      : null;

    if (context) {
      this.logger.debug({ entry_id: task.entry_id, prev_section_id: context.previous_section_id,
        component: 'TaskWorker' }, 'Context chain applied');
    }

    const result = await this.tagAnalyzer.analyzeTags(payload.content, payload.options, context);

    if (result.appliedTags.length > 0) {
      const existing = payload.existing_tags
        ? payload.existing_tags.split(',').map((t: string) => t.trim()).filter(Boolean)
        : [];
      const merged = [...new Set([...existing, ...result.appliedTags])];
      await this.engine.updateTags(task.entry_id, merged.join(','));
    }

    await this.updateEntryStructuredMap(task.entry_id, result, context);
    await this.repo.markCompleted(task.id);
  }

  private async loadPreviousContext(
    entryId: number,
    source: string | null,
  ): Promise<ContextChainInput | null> {
    if (!source) return null;
    try {
      const prevEntry = await this.engine.getAdapter().getAsync<{ id: number; structured_map: string | null }>(
        'SELECT id, structured_map FROM knowledge_entries WHERE source = ? AND id < ? ORDER BY id DESC LIMIT 1',
        [source, entryId],
      );
      if (!prevEntry) {
        this.logger.debug({ entry_id: entryId, component: 'TaskWorker' },
          'No previous section found');
        return null;
      }
      const map = safeParseStructuredMap(prevEntry.structured_map);
      if (!map.summary && (!map.business_entities || map.business_entities.length === 0)) {
        this.logger.debug({ entry_id: entryId, component: 'TaskWorker' },
          'Previous section has no extractable data');
        return null;
      }
      return {
        previous_section_id: prevEntry.id,
        summary: (map.summary || '').slice(0, this.config.contextChainMaxLength),
        business_entities: (map.business_entities || []).slice(0, 5),
        actors: (map.actors || []).slice(0, 5),
        business_rules: (map.business_rules || []).slice(0, 10),
      };
    } catch (err) {
      this.logger.warn({ entry_id: entryId, err, component: 'TaskWorker' },
        'Failed to load previous context');
      return null;
    }
  }

  private async updateEntryStructuredMap(
    entryId: number,
    result: TagAnalysisResult,
    context?: ContextChainInput | null,
  ): Promise<void> {
    try {
      const entry = await this.engine.findById(entryId);
      if (!entry) return;
      const existing = safeParseStructuredMap(entry.structured_map);
      const structuredMap: StructuredMapData = {
        tags: result.appliedTags,
        summary: result.summary || existing.summary || '',
        business_entities: result.business_entities || [],
        actors: result.actors || [],
        business_rules: result.business_rules || [],
        fileCreatedAt: existing.fileCreatedAt,
        fileAuthor: existing.fileAuthor,
        fileVersion: existing.fileVersion,
        context_chain: context ? {
          previous_section_id: context.previous_section_id,
          previous_summary: context.summary,
        } : undefined,
        extraction_meta: {
          model: this.llmService?.getConfig()?.model || 'unknown',
          timestamp: new Date().toISOString(),
          fallback_used: result.fallbackUsed,
          context_chain_enabled: this.config.enableContextChain,
        },
      };
      let jsonStr = JSON.stringify(structuredMap);
      if (jsonStr.length > (this.config.structuredMapMaxSize ?? 102400)) {
        structuredMap.business_rules = (structuredMap.business_rules || []).slice(0, 5);
        structuredMap.actors = (structuredMap.actors || []).slice(0, 3);
        this.logger.warn({ entry_id: entryId, size: jsonStr.length, component: 'TaskWorker' },
          'structured_map truncated due to size limit');
        jsonStr = JSON.stringify(structuredMap);
      }
      await this.engine.updateStructuredMap(entryId, jsonStr);
    } catch (err) {
      this.logger.warn({ entry_id: entryId, err, component: 'TaskWorker' },
        'structured_map update failed');
    }
  }

  private async processVectorEmbedding(task: PendingTask, payload: any): Promise<void> {
    if (!this.embeddingService) { this.repo.resetForRetry(task.id); return; }
    const vector = await this.embeddingService.generateEmbedding(payload.text);
    const buf = Buffer.from(new Float32Array(vector).buffer);
    await this.engine.getAdapter().runAsync(
      'UPDATE knowledge_entries SET vector = ? WHERE id = ?',
      [buf, task.entry_id],
    );
    await this.repo.markCompleted(task.id);
  }

  private async handleTaskError(task: PendingTask, err: Error): Promise<void> {
    const nonRetryable = err.message.includes('invalid_json')
      || err.message.includes('entry_not_found');
    if (nonRetryable || task.retry_count + 1 >= task.max_retries) {
      await this.repo.markFailed(task.id, err.message);
    } else {
      await this.repo.markFailed(task.id, err.message);
      await this.repo.resetForRetry(task.id);
    }
  }
}

