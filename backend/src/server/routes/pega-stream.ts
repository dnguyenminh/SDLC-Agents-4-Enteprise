/**
 * Async NDJSON ingest endpoint for Pega rules (SA4E-94).
 * POST /pega/ingest-stream — accepts NDJSON body, returns 202 + jobId immediately.
 * GET /pega/jobs/:id — poll job progress/status.
 * Background processing via setImmediate batches (50 rules/tick) to avoid blocking event loop.
 */

import { Hono } from 'hono';
import type { Logger } from 'pino';
import type { ModuleRegistry } from '../../modules/ModuleRegistry.js';
import { PegaService } from '../../modules/pega/PegaService.js';
import { queryPegaTotals, registerPegaProject, processOneLine } from './pega-stream-helpers.js';
import type { StreamMetadata } from './pega-stream-helpers.js';
import { pegaJobStore } from './pega-job-store.js';
import type { JobResult } from './pega-job-store.js';

/** Number of rules processed per setImmediate tick */
const BATCH_SIZE = 50;

/**
 * Create Hono routes for async NDJSON ingest + job polling.
 * @param registry - Module registry for accessing memory/PegaService
 * @param logger - Pino logger instance
 */
/** Hono env — SA4E-241: jwtAuth injects the authenticated project identity here. */
type PegaEnv = { Variables: { projectContext?: { projectId?: string; userId?: string } } };

export function createPegaStreamRoutes(registry: ModuleRegistry, logger: Logger): Hono<PegaEnv> {
  const app = new Hono<PegaEnv>();

  /** Lazily resolve PegaService from memory module */
  const resolvePegaService = (): PegaService | null => {
    const memModule = registry.getModule('memory') as any;
    if (!memModule || memModule.status !== 'ready') return null;
    return new PegaService(memModule.getEngine());
  };

  // POST /pega/ingest-stream — buffer body, return 202 + jobId, process in background
  app.post('/pega/ingest-stream', async (c) => {
    const service = resolvePegaService();
    if (!service) {
      return c.json({ data: null, error: { code: 'NOT_READY', message: 'Memory module not ready' } }, 503);
    }

    // SA4E-241 SEC-01: this is a WRITE path — scope by authenticated identity.
    // Processing runs in the background (after 202), so authz MUST be enforced here.
    const identityProjectId = (c.get('projectContext') as { projectId?: string } | undefined)?.projectId ?? '';
    if (!identityProjectId) {
      return c.json({ data: null, error: { code: 'MISSING_PROJECT_IDENTITY',
        message: 'X-Project-Id header or JWT pid claim is required.' } }, 401);
    }

    // Stream body line-by-line to avoid OOM on large payloads (39K+ rules)
    const reader = c.req.raw.body?.getReader();
    if (!reader) {
      return c.json({ data: null, error: { code: 'NO_BODY', message: 'Request body is empty' } }, 400);
    }

    // Read stream into lines incrementally (still buffers lines array, but not raw text)
    const lines: string[] = [];
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() || '';
      for (const p of parts) { if (p.trim()) lines.push(p); }
    }
    if (buffer.trim()) lines.push(buffer);

    if (lines.length === 0) {
      return c.json({ data: null, error: { code: 'NO_BODY', message: 'Request body is empty' } }, 400);
    }

    const jobId = pegaJobStore.createJob(lines.length);

    logger.info({ jobId, lineCount: lines.length }, '[pega-stream] Job created, processing in background');
    // Pass the authenticated identity so background processing scopes by it,
    // never by the (client-controlled) projectId in the NDJSON metadata (SEC-01).
    processInBackground(jobId, lines, service, logger, identityProjectId);

    return c.json({ data: { jobId }, error: null }, 202);
  });

  // GET /pega/jobs/:id — return current job status + progress
  app.get('/pega/jobs/:id', (c) => {
    const id = c.req.param('id');
    const job = pegaJobStore.getJob(id);

    if (!job) {
      return c.json({ data: null, error: { code: 'NOT_FOUND', message: `Job ${id} not found or expired` } }, 404);
    }

    return c.json({
      data: { status: job.status, progress: job.progress, result: job.result, error: job.error },
      error: null,
    });
  });

  return app;
}

/**
 * Process NDJSON lines in background using setImmediate batches.
 * Processes BATCH_SIZE rules per tick to avoid blocking the event loop.
 */
function processInBackground(
  jobId: string, lines: string[], service: PegaService, logger: Logger, identityProjectId: string,
): void {
  let meta: StreamMetadata | null = null;
  let stored = 0;
  let index = 0;
  const ingestedRules: Record<string, unknown>[] = [];

  const processNextBatch = (): void => {
    const end = Math.min(index + BATCH_SIZE, lines.length);

    const promises: Promise<void>[] = [];
    for (let i = index; i < end; i++) {
      promises.push(processOneLine(lines[i], meta, service, logger).then((result) => {
        // SEC-01: force the metadata's projectId to the authenticated identity so
        // no rule is ever written under a client-supplied project.
        if (result.isMeta) { meta = { ...result.meta!, projectId: identityProjectId }; }
        if (result.stored) { stored++; ingestedRules.push(result.rule!); }
      }));
    }

    Promise.all(promises)
      .then(() => {
        index = end;
        pegaJobStore.updateProgress(jobId, index);

        if (index < lines.length) {
          setImmediate(processNextBatch);
        } else {
          return finalizeJob(jobId, meta, stored, ingestedRules, service, logger);
        }
      })
      .catch((err) => {
        logger.error({ err, jobId }, '[pega-stream] Background processing failed');
        pegaJobStore.fail(jobId, err.message || 'Unknown processing error');
      });
  };

  setImmediate(processNextBatch);
}

/** Compute totals + next batch after all lines processed, then mark job done */
async function finalizeJob(
  jobId: string,
  meta: StreamMetadata | null,
  stored: number,
  ingestedRules: Record<string, unknown>[],
  service: PegaService,
  logger: Logger,
): Promise<void> {
  let totals = { totalRulesInDb: 0, totalKbEntriesInDb: 0, totalGraphNodesInDb: 0 };
  const nextBatch: JobResult['nextBatch'] = []; 

  try {
    totals = await queryPegaTotals(service, meta?.projectId || '');
  } catch (err: any) {
    logger.warn({ err: err.message }, '[pega-stream] queryPegaTotals failed — using zeros');
  }

  // SA4E-94: computeNextBatch removed — enumeration is handled by extension

  if (meta) await registerPegaProject(service, meta.projectId, ingestedRules);

  // SA4E-209: Batch catch-up — create enrichment tasks for any unenriched Pega symbols
  if (meta?.projectId) {
    try {
      const { CodeEnrichmentTaskCreator } = await import('../../engine/enrichment/CodeEnrichmentTaskCreator.js');
      const adapter = (service as any).memoryEngine.getAdapter();
      const taskCreator = new CodeEnrichmentTaskCreator(adapter, logger);
      const created = await taskCreator.createTasksForProject(meta.projectId);
      if (created > 0) logger.info({ created, projectId: meta.projectId }, '[pega-stream] Enrichment catch-up tasks created');
    } catch (err: any) {
      logger.warn({ err: err.message }, '[pega-stream] Enrichment catch-up failed (non-fatal)');
    }
  }

  const result: JobResult = { stored, ...totals, nextBatch };
  pegaJobStore.complete(jobId, result);
  logger.info({ jobId, stored, total: totals.totalRulesInDb }, '[pega-stream] Job complete');
}
