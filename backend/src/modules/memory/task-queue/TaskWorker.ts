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
import type { LLMMessage } from '../llm/types.js';
import { PendingTaskRepository } from './PendingTaskRepository.js';
import { TaskType } from './models.js';
import type { PendingTask } from './models.js';
import type { TaskWorkerConfig } from './TaskWorkerConfig.js';
import { DEFAULT_TASK_WORKER_CONFIG } from './TaskWorkerConfig.js';
import type { MemoryEngine } from '../engine/index.js';
import type { ContextChainInput, StructuredMapData } from '../llm/types.js';
import { safeParseStructuredMap } from '../llm/types.js';

/** SA4E-99: System prompt for code symbol summary + pseudo code generation. */
const CODE_ENRICHMENT_SYSTEM_PROMPT = `You are a code documentation generator. Given a code symbol (function, class, method), produce a concise summary and pseudo code.

## Output Format
Return ONLY valid JSON (no markdown, no code fences):

{
  "summary": "1-2 sentence description of what this symbol does, its purpose and key behavior",
  "pseudo_code": "Simplified pseudo code showing the algorithm/logic flow (max 10 lines)"
}

## Rules
- summary: max 200 chars, describe WHAT it does and WHY (business purpose)
- pseudo_code: simplified logic flow, not the actual code. Use plain English + simple control flow
- For classes: summary describes responsibility, pseudo_code lists key methods and their roles
- For functions: summary describes input→output, pseudo_code shows algorithm steps

## Example

Input: function calculateDiscount(order, customer)
Output: {"summary":"Calculates order discount based on customer loyalty tier and order total.","pseudo_code":"1. Get customer tier (gold/silver/bronze)\\n2. If tier=gold AND total>100: discount=20%\\n3. If tier=silver AND total>50: discount=10%\\n4. Apply max discount cap from config\\n5. Return final discounted price"}`;

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
  private llmService?: { getConfig(): { model: string }; complete(messages: LLMMessage[]): Promise<{ content: string }> };
  /** SA4E-107: Dedicated handler for CODE_ENRICHMENT tasks (PEGA_SUMMARY + FUNCTION_SUMMARY strategies). */
  private codeEnrichmentHandler?: { enrichSymbol(task: PendingTask): Promise<void> };
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
  setLlmService(service: { getConfig(): { model: string }; complete(messages: LLMMessage[]): Promise<{ content: string }> }): void { this.llmService = service; }

  /** SA4E-107: Wire CodeEnrichmentHandler — delegates CODE_ENRICHMENT tasks to proper handler. */
  setCodeEnrichmentHandler(handler: { enrichSymbol(task: PendingTask): Promise<void> }): void {
    this.codeEnrichmentHandler = handler;
    this.logger.info('[TaskWorker] CodeEnrichmentHandler wired — enrichSymbol() will handle CODE_ENRICHMENT tasks');
  }

  /** SA4E-99: Get current progress info (file being processed). */
  async getProgress(): Promise<{ file: string | null } | null> {
    const active = await this.repo.getFirstByStatus('PROCESSING');
    if (!active) return null;
    try {
      const payload = JSON.parse(active.payload);
      return { file: payload.filePath || payload.file_path || payload.source || null };
    } catch { return null; }
  }

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
    // On startup: bound table growth by purging superseded COMPLETED tasks
    // (keeps only the latest completed task per entry+type).
    this.purgeSupersededOnStartup().catch(err =>
      this.logger.warn({ err }, 'TaskWorker: startup purge failed (non-fatal)'),
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

  /** Purge superseded COMPLETED tasks on startup to bound pending_tasks growth. */
  async purgeSupersededOnStartup(): Promise<number> {
    const purged = await this.repo.purgeSupersededCompleted();
    if (purged > 0) this.logger.info({ purged }, 'TaskWorker: purged superseded COMPLETED tasks on startup');
    return purged;
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
        // SA4E-209: Periodic scan for unenriched symbols when queue is idle
        if (this.consecutiveEmpty === 5) {
          await this.scanForUnenrichedSymbols();
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

  /**
   * SA4E-209: Scan for unenriched symbols and create tasks automatically.
   * Runs when queue is idle (consecutiveEmpty hits threshold). Non-fatal.
   */
  private async scanForUnenrichedSymbols(): Promise<void> {
    try {
      const { CodeEnrichmentTaskCreator } = await import('../../../engine/enrichment/CodeEnrichmentTaskCreator.js');
      const adapter = this.engine.getAdapter();
      const creator = new CodeEnrichmentTaskCreator(adapter, this.logger);
      // Find all projects with unenriched symbols
      const projects = await adapter.allAsync<{ project_id: string }>(
        `SELECT DISTINCT project_id FROM symbols
         WHERE (enrichment_status IS NULL OR enrichment_status = '')
           AND kind NOT IN ('variable', 'import', 'namespace')
         LIMIT 10`,
        [],
      );
      for (const { project_id } of projects) {
        const created = await creator.createTasksForProject(project_id);
        if (created > 0) {
          this.logger.info({ created, projectId: project_id }, '[TaskWorker] Auto-created enrichment tasks for unenriched symbols');
        }
      }
    } catch (err) {
      this.logger.debug({ err }, '[TaskWorker] Unenriched symbol scan failed (non-fatal)');
    }
  }

  private async processTask(task: PendingTask): Promise<void> {
    try {
      // CODE_ENRICHMENT tasks use symbols table, not knowledge_entries
      if (task.task_type === TaskType.CODE_ENRICHMENT) {
        // SA4E-107: Delegate to CodeEnrichmentHandler (loads body from DB, uses proper strategy)
        if (this.codeEnrichmentHandler) {
          await this.codeEnrichmentHandler.enrichSymbol(task);
          await this.repo.markCompleted(task.id);
          return;
        }
        // Fallback: legacy processCodeSummary (payload must contain body field)
        let payload: any;
        try { payload = JSON.parse(task.payload); }
        catch { this.repo.markFailed(task.id, 'invalid_json_payload'); return; }
        await this.processCodeSummary(task, payload);
        return;
      }
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

    // SA4E-79: Check if already enriched by client (BR-12, BR-13)
    const entry = await this.engine.findById(task.entry_id);
    if (!entry) { await this.repo.markFailed(task.id, 'entry_not_found'); return; }
    if ((entry as any).enrichment_status === 'done') {
      this.logger.info({ entry_id: task.entry_id }, 'Skipping TAG_ENRICHMENT — already enriched');
      await this.repo.markCompleted(task.id);
      return;
    }

    const context = this.config.enableContextChain
        ? await this.loadPreviousContext(task.entry_id, payload.source)
        : null;

    if (context) {
      this.logger.debug({ entry_id: task.entry_id, prev_section_id: context.previous_section_id,
        component: 'TaskWorker' }, 'Context chain applied');
    }

    const result = await this.tagAnalyzer.analyzeTags(payload.content, payload.options, context);

    // TA-08: Re-check status after LLM call — client may have enriched during processing
    const currentEntry = await this.engine.findById(task.entry_id);
    if (!currentEntry || (currentEntry as any).enrichment_status === 'done') {
      this.logger.info({ entry_id: task.entry_id }, 'Client enriched during LLM processing — discarding result');
      await this.repo.markCompleted(task.id);
      return;
    }

    if (result.appliedTags.length > 0) {
      const existing = payload.existing_tags
          ? payload.existing_tags.split(',').map((t: string) => t.trim()).filter(Boolean)
          : [];
      const merged = [...new Set([...existing, ...result.appliedTags])];
      // NEW-03: Conditional update — only apply if still pending (race guard)
      await this.engine.getAdapter().runAsync(
          `UPDATE knowledge_entries SET tags = ? WHERE id = ? AND enrichment_status = 'pending'`,
          [merged.join(','), task.entry_id],
      );
    }

    // NEW-03: Conditional structured_map update — only if still pending
    await this.updateEntryStructuredMapConditional(task.entry_id, result, context);

    // SA4E-99: Propagate LLM summary to knowledge_entries.summary + graph_nodes.label
    if (result.summary && result.summary.length > 0) {
      await this.propagateSummary(task.entry_id, result.summary);
    }

    // SA4E-79: Mark entry as enriched by backend LLM (atomic — changes=0 if client won)
    const now = new Date().toISOString();
    const updateResult = await this.engine.getAdapter().runAsync(
        `UPDATE knowledge_entries
         SET enrichment_status = 'done', enriched_by = 'backend_llm', enriched_at = ?
         WHERE id = ? AND enrichment_status = 'pending'`,
        [now, task.entry_id],
    );

    if (updateResult.changes === 0) {
      this.logger.info({ entry_id: task.entry_id }, 'Client enriched during tag/map update — discarding');
    }

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

  /** NEW-03: Conditional structured_map update — only applies if entry still pending. */
  private async updateEntryStructuredMapConditional(
      entryId: number,
      result: TagAnalysisResult,
      context?: ContextChainInput | null,
  ): Promise<void> {
    try {
      const entry = await this.engine.findById(entryId);
      if (!entry) return;
      if ((entry as any).enrichment_status === 'done') return;
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
        jsonStr = JSON.stringify(structuredMap);
      }
      await this.engine.getAdapter().runAsync(
          `UPDATE knowledge_entries SET structured_map = ? WHERE id = ? AND enrichment_status = 'pending'`,
          [jsonStr, entryId],
      );
    } catch (err) {
      this.logger.warn({ entry_id: entryId, err, component: 'TaskWorker' },
          'structured_map conditional update failed');
    }
  }

  // ── SA4E-99: Code Symbol Summary + Pseudo Code ──

  /**
   * SA4E-99: Generate LLM summary + pseudo code for a code symbol.
   * Reads symbol body from body_embeddings, calls LLM, updates graph_nodes.label.
   * Runs async in background queue — does not block code indexing.
   */
  private async processCodeSummary(task: PendingTask, payload: any): Promise<void> {
  }

  /** Build prompt for code symbol summary generation. */
  private buildCodeSummaryPrompt(
      name: string, kind: string, signature: string | null, body: string, filePath: string,
  ): string {
    const sig = signature ? `\nSignature: ${signature}` : '';
    return `/no_think\n\nSymbol: ${name}\nKind: ${kind}\nFile: ${filePath}${sig}\n\nBody:\n\`\`\`\n${body.slice(0, 4000)}\n\`\`\``;
  }

  /** Parse LLM response for code summary. Falls back to name if parse fails. */
  private parseCodeSummaryResponse(
      llmOutput: string, name: string, kind: string,
  ): { summary: string; pseudoCode: string } {
    const defaults = { summary: `${kind}: ${name}`, pseudoCode: '' };
    if (!llmOutput || llmOutput.trim().length === 0) return defaults;
    try {
      const jsonMatch = llmOutput.match(/\{[\s\S]*"summary"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: (parsed.summary || defaults.summary).slice(0, 300),
          pseudoCode: (parsed.pseudo_code || parsed.pseudoCode || '').slice(0, 2000),
        };
      }
    } catch { /* fallback */ }
    // Fallback: treat first line as summary
    const lines = llmOutput.trim().split('\n');
    return { summary: lines[0].slice(0, 300), pseudoCode: lines.slice(1).join('\n').slice(0, 2000) };
  }

  /**
   * SA4E-99: Propagate LLM-generated summary to knowledge_entries.summary and graph_nodes.label.
   * Without this, entries display only the first heading line (e.g., "1. What's New").
   */
  private async propagateSummary(entryId: number, llmSummary: string): Promise<void> {
    const truncatedSummary = llmSummary.slice(0, 300);
    const graphLabel = llmSummary.slice(0, 60);
    try {
      await this.engine.getAdapter().runAsync(
          `UPDATE knowledge_entries SET summary = ? WHERE id = ? AND enrichment_status = 'pending'`,
          [truncatedSummary, entryId],
      );
      await this.engine.getAdapter().runAsync(
          `UPDATE graph_nodes SET label = ? WHERE entry_id = ?`,
          [graphLabel, `doc-${entryId}`],
      );
      this.logger.debug({ entry_id: entryId, component: 'TaskWorker' },
          'LLM summary propagated to KB entry + graph node');
    } catch (err) {
      this.logger.warn({ entry_id: entryId, err, component: 'TaskWorker' },
          'Summary propagation failed (non-fatal)');
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
        || err.message.includes('invalid_payload')
        || err.message.includes('entry_not_found')
        || err.message.includes('symbol_not_found');
    if (nonRetryable || task.retry_count + 1 >= task.max_retries) {
      await this.repo.markFailed(task.id, err.message);
    } else {
      await this.repo.markFailed(task.id, err.message);
      await this.repo.resetForRetry(task.id);
    }
  }
}