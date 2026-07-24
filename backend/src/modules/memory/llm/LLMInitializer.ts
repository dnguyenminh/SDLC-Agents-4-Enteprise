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

/** Build LLM config: DB overrides > env vars > hardcoded defaults. */
async function buildLLMConfig() {
  const envConfig = {
    provider: (process.env.LLM_PROVIDER || 'lmstudio') as any,
    model: process.env.LLM_MODEL || 'qwen2.5-vl-7b-instruct',
    baseUrl: process.env.LLM_BASE_URL || 'http://localhost:1234/v1',
    apiKey: process.env.LLM_API_KEY || undefined,
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '800', 10),
  };

  // Merge DB overrides on top (Admin UI wins over env vars)
  try {
    const dbOverrides = await loadPersistedLLMConfig();
    return {
      ...envConfig,
      ...(dbOverrides.provider && { provider: dbOverrides.provider as any }),
      ...(dbOverrides.model && { model: dbOverrides.model }),
      ...(dbOverrides.baseUrl && { baseUrl: dbOverrides.baseUrl }),
      ...(dbOverrides.apiKey && dbOverrides.apiKey !== '***' && { apiKey: dbOverrides.apiKey }),
      ...(dbOverrides.temperature !== undefined && { temperature: dbOverrides.temperature }),
      ...(dbOverrides.maxTokens !== undefined && { maxTokens: dbOverrides.maxTokens }),
    };
  } catch {
    // DB not ready at startup — use env vars only
    return envConfig;
  }
}

/**
 * Attempt LLM health check and wire TagAnalyzer + ClassifyService + EmbeddingService.
 * Fire-and-forget — never blocks module startup. Errors are silently logged.
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
  (async () => {
    try {
      const llmConfig = await buildLLMConfig();
      logger.info({ provider: llmConfig.provider, model: llmConfig.model }, '[LLMInitializer] Resolved LLM config');

      const healthUrl = llmConfig.baseUrl.replace(/\/v1\/?$/, '') + '/v1/models';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const healthResp = await fetch(healthUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!healthResp.ok) {
        logger.info({ provider: llmConfig.provider }, 'TagAnalyzer LLM not reachable — keyword fallback only');
        return;
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

      try {
        const embSvc = EmbeddingService.getInstance();
        taskWorker?.setEmbeddingService(embSvc);
        dispatcher.setEmbeddingAvailable(true);
      } catch { /* ONNX not available */ }
    } catch (err) {
      logger.info({ err }, 'TagAnalyzer LLM unavailable — keyword fallback only');
    }
  })();
}
