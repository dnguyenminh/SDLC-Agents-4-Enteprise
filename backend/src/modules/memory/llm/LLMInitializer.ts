/**
 * LLMInitializer — fire-and-forget LLM service setup for MemoryModule.
 * SRP: config resolution lives in llm-config.ts; this file owns the wiring
 * of the created LLMService into dispatcher/TaskWorker + the retry loop.
 */

import type { Logger } from 'pino';
import { LLMService } from './LLMService.js';
import { describeError, isConnectivityFailure } from './llm-error.js';
import { TagAnalyzerService } from './analyzer.js';
import { ClassifyService } from './classify-service.js';
import { EmbeddingService } from '../../../engine/parsers/embedding/EmbeddingService.js';
import type { MemoryToolDispatcher } from '../dispatchers/index.js';
import type { TaskWorker } from '../task-queue/TaskWorker.js';
import { buildLLMConfig, modelsProbeUrl, LLM_PROBE_TIMEOUT_MS } from './llm-config.js';
import { bus, Events } from '../../../shared/EventBus.js';

/**
 * Attempt LLM health check and wire TagAnalyzer + ClassifyService + EmbeddingService.
 * Fire-and-forget — never blocks module startup. Errors are silently logged.
 * If init fails, retries every 60s until LLM becomes available.
 *
 * @param dispatcher - MemoryToolDispatcher to wire services into
 * @param taskWorker - TaskWorker to wire TagAnalyzer + EmbeddingService into
 * @param logger - Module logger
 */
export function initLLMInBackground(
  dispatcher: MemoryToolDispatcher,
  taskWorker: TaskWorker | null,
  logger: Logger,
): void {
  /** Retry interval in ms (60s). */
  const RETRY_INTERVAL_MS = 60_000;
  let retryTimer: ReturnType<typeof setInterval> | null = null;

  const doInit = async (): Promise<boolean> => {
    try {
      const llmConfig = await buildLLMConfig();
      logger.info({ provider: llmConfig.provider, model: llmConfig.model }, '[LLMInitializer] Resolved LLM config');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), LLM_PROBE_TIMEOUT_MS);
      const healthResp = await fetch(modelsProbeUrl(llmConfig.baseUrl), { signal: controller.signal });
      clearTimeout(timeout);

      if (!healthResp.ok) {
        logger.info({ provider: llmConfig.provider }, 'TagAnalyzer LLM not reachable — will retry in 60s');
        return false;
      }

      const llmService = new LLMService(llmConfig);

      taskWorker?.setLlmService(llmService);

      const tagAnalyzer = new TagAnalyzerService(llmService, logger);
      dispatcher.setTagAnalyzer(tagAnalyzer);
      taskWorker?.setTagAnalyzer(tagAnalyzer);
      logger.info({ provider: llmConfig.provider, model: llmConfig.model }, 'TagAnalyzerService initialized');

      const classifyService = new ClassifyService(llmService);
      dispatcher.setClassifyService(classifyService);
      logger.info('ClassifyService initialized — Smart KB Ingest enabled');

      // SA4E-107: Wire CodeEnrichmentHandler into TaskWorker for LLM enrichment of code symbols
      try {
        const { CodeEnrichmentHandler } = await import('../../../engine/enrichment/CodeEnrichmentHandler.js');
        const { getDbAdapter } = await import('../../../admin/db/core.js');
        const adapter = getDbAdapter();
        const enrichHandler = new CodeEnrichmentHandler(adapter, llmService, logger);
        taskWorker?.setCodeEnrichmentHandler(enrichHandler);
        logger.info('CodeEnrichmentHandler initialized — LLM code enrichment enabled');
      } catch (err) {
        logger.warn({ err }, '[LLMInitializer] CodeEnrichmentHandler init failed (non-fatal)');
      }

      // SA4E-387: announce availability so deferred consumers (e.g. the
      // EnrichmentModule) can complete their lazy wiring without a restart.
      bus.emit<{ llmService: LLMService }>(Events.LLM_SERVICE_READY, { llmService });

      try {
        const embSvc = EmbeddingService.getInstance();
        taskWorker?.setEmbeddingService(embSvc);
        dispatcher.setEmbeddingAvailable(true);
      } catch (err) { logger.debug({ err }, '[LLMInitializer] ONNX not available '); }

      return true;
    } catch (err) {
      // An unreachable LLM server is EXPECTED while it is not running (the retry
      // loop below keeps probing) — log it as warn with the expanded cause chain,
      // and reserve error for genuine config/programming failures.
      const detail = describeError(err);
      if (isConnectivityFailure(err)) {
        logger.warn({ detail }, '[LLMInitializer] LLM server unreachable — will retry in 60s');
      } else {
        logger.error({ detail, err }, '[LLMInitializer] LLM initialization FAILED — will retry in 60s');
      }
      return false;
    }
  };

  // First attempt
  doInit().then(success => {
    if (success) return;
    // Schedule periodic retry until LLM connects
    logger.info('[LLMInitializer] Scheduling periodic LLM health check (every 60s)');
    retryTimer = setInterval(async () => {
      logger.debug('[LLMInitializer] Retrying LLM connection...');
      const ok = await doInit();
      if (ok && retryTimer) {
        clearInterval(retryTimer);
        retryTimer = null;
        logger.info('[LLMInitializer] LLM connected after retry — periodic check stopped');
      }
    }, RETRY_INTERVAL_MS);
  });
}
