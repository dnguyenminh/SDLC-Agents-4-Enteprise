/**
 * LLMInitializer — fire-and-forget LLM service setup for MemoryModule.
 * SRP fix: extracted from MemoryModule.initLLMInBackground() to keep
 * MemoryModule focused on lifecycle + tool routing, not LLM config details.
 */

import type { Logger } from 'pino';
import { LLMService } from './LLMService.js';
import { TagAnalyzerService } from './analyzer.js';
import { ClassifyService } from './classify-service.js';
import { EmbeddingService } from '../../../engine/parsers/embedding/EmbeddingService.js';
import type { MemoryToolDispatcher } from '../dispatchers/index.js';
import type { TaskWorker } from '../task-queue/TaskWorker.js';

/** Build LLM config from environment variables. */
function buildLLMConfig() {
  return {
    provider: (process.env.LLM_PROVIDER || 'lmstudio') as any,
    model: process.env.LLM_MODEL || 'qwen3-8b',
    baseUrl: process.env.LLM_BASE_URL || 'http://localhost:1234/v1',
    apiKey: process.env.LLM_API_KEY || undefined,
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '500', 10),
  };
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
  const llmConfig = buildLLMConfig();
  const healthUrl = llmConfig.baseUrl.replace(/\/v1\/?$/, '') + '/v1/models';

  (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const healthResp = await fetch(healthUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!healthResp.ok) {
        logger.info({ provider: llmConfig.provider }, 'TagAnalyzer LLM not reachable — keyword fallback only');
        return;
      }

      const llmService = new LLMService(llmConfig);

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
