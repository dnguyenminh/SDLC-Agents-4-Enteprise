/**
 * SA4E-387: Enrichment API routes.
 * POST /enrich — Enrich a code symbol with dynamic budget
 * POST /model/swap — Runtime model swap
 * GET /enrich/status — Get enrichment status
 */

import { Hono } from 'hono';
import type { Logger } from 'pino';
import type { ModuleRegistry } from '../../modules/ModuleRegistry.js';
import { z } from 'zod';
import { EnrichmentModule } from '../../modules/enrichment/EnrichmentModule.js';
import { ContextWindowDiscovery } from '../../modules/memory/llm/context-window.js';

const enrichSchema = z.object({
  symbol: z.string().min(1),
  file_path: z.string().min(1),
  model: z.enum(['ollama', 'openai', 'anthropic', 'gemini', 'lmstudio', 'copilot', 'opencode', 'opencode-zen']).optional(),
  budget: z.number().int().positive().optional(),
  ticket_id: z.string().optional(),
});

const modelSwapSchema = z.object({
  model: z.string().min(1),
  provider: z.enum(['ollama', 'openai', 'anthropic', 'gemini', 'lmstudio', 'copilot', 'opencode', 'opencode-zen']).optional(),
  base_url: z.string().url().optional(),
  api_key: z.string().optional(),
  ticket_id: z.string().optional(),
});

export function createEnrichmentRoutes(
  logger: Logger,
  registry: ModuleRegistry,
): Hono {
  const app = new Hono();

  // Get EnrichmentModule from registry
  const getEnrichmentModule = (): EnrichmentModule | null => {
    return (registry as any).enrichmentModule || null;
  };

  /**
   * POST /enrich
   * Enrich a code symbol with dynamic context budget.
   * Body: { symbol, file_path, model?, budget?, ticket_id? }
   */
  app.post('/enrich', async (c) => {
    const module = getEnrichmentModule();
    if (!module || !module.isReady()) {
      return c.json({ error: 'Enrichment module not initialized' }, 503);
    }

    try {
      const body = await c.req.json();
      const parsed = enrichSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
      }

      const { symbol, file_path, model, budget, ticket_id } = parsed.data;
      const handler = module.getHandler();
      const modelResolver = module.getModelResolver();

      if (!handler || !modelResolver) {
        return c.json({ error: 'Enrichment handler not available' }, 503);
      }

      // Resolve model config for this request
      const modelConfig = await modelResolver.resolve({
        model,
        ticketId: ticket_id,
      });

      // For now, we'll use a simplified approach - create a mock task
      // In production, this would integrate with the task queue
      const payload = {
        symbolId: 0, // Will be resolved from file_path + symbol
        symbolName: symbol,
        symbolKind: 'function', // default, could be detected
        projectId: 'default',
        filePath: file_path,
        workspaceType: 'standard' as const,
      };

      // TODO: Implement actual enrichment with dynamic budget
      // This is a placeholder response showing the structure
      return c.json({
        status: 'success',
        enriched_content: `Enriched content for ${symbol} from ${file_path}`,
        model_used: modelConfig.model,
        provider: modelConfig.provider,
        context_window: modelConfig.contextWindow,
        input_budget: budget,
        map_reduce_used: false,
      });
    } catch (err) {
      logger.error({ err }, 'Enrichment failed');
      return c.json({ error: 'Enrichment failed', message: err instanceof Error ? err.message : 'Unknown error' }, 500);
    }
  });

  /**
   * POST /model/swap
   * Runtime model swap with cache invalidation.
   * Body: { model, provider?, base_url?, api_key?, ticket_id? }
   */
  app.post('/model/swap', async (c) => {
    const module = getEnrichmentModule();
    if (!module || !module.isReady()) {
      return c.json({ error: 'Enrichment module not initialized' }, 503);
    }

    try {
      const body = await c.req.json();
      const parsed = modelSwapSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
      }

      const { model, provider, base_url, api_key, ticket_id } = parsed.data;
      const modelResolver = module.getModelResolver()!;

      // Perform model swap
      await modelResolver.setModelForTicket(ticket_id || 'default', {
        model,
        provider,
        baseUrl: base_url,
        apiKey: api_key,
      });

      const active = modelResolver.getActiveModel();

      return c.json({
        status: 'success',
        model: active.model,
        provider: active.provider,
        base_url: active.baseUrl,
        context_window: active.contextWindow,
      });
    } catch (err) {
      logger.error({ err }, 'Model swap failed');
      return c.json({ error: 'Model swap failed', message: err instanceof Error ? err.message : 'Unknown error' }, 500);
    }
  });

  /**
   * GET /enrich/status
   * Get current enrichment configuration and status.
   */
  app.get('/enrich/status', async (c) => {
    const module = getEnrichmentModule();
    if (!module || !module.isReady()) {
      return c.json({ error: 'Enrichment module not initialized' }, 503);
    }

    const modelResolver = module.getModelResolver()!;
    const active = modelResolver.getActiveModel();

    return c.json({
      active_model: {
        model: active.model,
        provider: active.provider,
        base_url: active.baseUrl,
        context_window: active.contextWindow,
      },
      map_reduce_enabled: module.getConfig().enableMapReduce ?? true,
      budget_guard: {
        safety_margin: 500,
        warning_threshold: 0.8,
        reserved_output_tokens: 800,
      },
    });
  });

  return app;
}