/**
 * LLMInitializer — fire-and-forget LLM service setup for MemoryModule.
 * SRP fix: extracted from MemoryModule.initLLMInBackground() to keep
 * MemoryModule focused on lifecycle + tool routing, not LLM config details.
 *
 * Config priority (highest to lowest):
 *   1. Admin UI saved values (persisted in config_changes DB table)
 *   2. Environment variables
 *   3. Hardcoded defaults
 */

import type { Logger } from 'pino';
import { LLMService } from './LLMService.js';
import { TagAnalyzerService } from './analyzer.js';
import { ClassifyService } from './classify-service.js';
import { EmbeddingService } from '../../../engine/parsers/embedding/EmbeddingService.js';
import type { MemoryToolDispatcher } from '../dispatchers/index.js';
import type { TaskWorker } from '../task-queue/TaskWorker.js';
import { loadPersistedLLMConfig } from '../../../admin/db/config.js';

/** Build LLM config: DB overrides > env vars > auto-detect from LMStudio. */
async function buildLLMConfig() {
  const provider = process.env.LLM_PROVIDER || '';
  const model = process.env.LLM_MODEL || '';
  const baseUrl = process.env.LLM_BASE_URL || 'http://localhost:1234/v1';

  const envConfig = {
    provider: (provider || 'lmstudio') as any,
    model,
    baseUrl,
    apiKey: process.env.LLM_API_KEY || undefined,
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '800', 10),
  };

  // Merge DB overrides on top (Admin UI wins over env vars)
  try {
    const dbOverrides = await loadPersistedLLMConfig();
    const merged = {
      ...envConfig,
      ...(dbOverrides.provider && { provider: dbOverrides.provider as any }),
      ...(dbOverrides.model && { model: dbOverrides.model }),
      ...(dbOverrides.baseUrl && { baseUrl: dbOverrides.baseUrl }),
      ...(dbOverrides.apiKey && dbOverrides.apiKey !== '***' && { apiKey: dbOverrides.apiKey }),
      ...(dbOverrides.temperature !== undefined && { temperature: dbOverrides.temperature }),
      ...(dbOverrides.maxTokens !== undefined && { maxTokens: dbOverrides.maxTokens }),
    };
    if (merged.model) return merged;
    // Auto-detect: query LMStudio /v1/models and use first available
    merged.model = await autoDetectModel(merged.baseUrl);
    return merged;
  } catch (err: any) {
    if (err.message?.includes('LLM_MODEL')) throw err;
    // DB not ready — try env, then auto-detect
    if (envConfig.model) return envConfig;
    envConfig.model = await autoDetectModel(envConfig.baseUrl);
    return envConfig;
  }
}

/** Auto-detect model from LLM server's /v1/models endpoint. Throws if unavailable. */
async function autoDetectModel(baseUrl: string): Promise<string> {
  const modelsUrl = baseUrl.replace(/\/v1\/?$/, '') + '/v1/models';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(modelsUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`LLM server returned ${resp.status}`);
    const json = await resp.json() as { data?: Array<{ id: string }> };
    const models = json.data?.filter(m => !m.id.includes('embedding')) || [];
    if (models.length === 0) {
      throw new Error('LLM_MODEL not configured and no models found on LLM server. Set LLM_MODEL or load a model in LMStudio.');
    }
    return models[0].id;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.message?.includes('LLM_MODEL')) throw err;
    throw new Error(`LLM_MODEL not configured and cannot auto-detect from ${modelsUrl}: ${err.message}`, { cause: err });
  }
}

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

      const llmService = new LLMService(llmConfig);
      if (!await llmService.isAvailable()) {
        logger.info({ provider: llmConfig.provider }, 'TagAnalyzer LLM not reachable — will retry in 60s');
        return false;
      }

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

      try {
        const embSvc = EmbeddingService.getInstance();
        taskWorker?.setEmbeddingService(embSvc);
        dispatcher.setEmbeddingAvailable(true);
      } catch (err) { logger.debug({ err }, '[LLMInitializer] ONNX not available '); }

      return true;
    } catch (err) {
      logger.error({ err }, '[LLMInitializer] LLM initialization FAILED — will retry in 60s');
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
