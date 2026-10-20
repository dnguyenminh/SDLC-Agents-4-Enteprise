/**
 * SA4E-95 + SA4E-214 — POST /pega/schema/generate route.
 * Extracted from pega-schema-routes.ts: harness parsing + JSON Schema
 * generation with optional LLM section extraction (non-fatal when absent).
 */

import { Hono } from 'hono';
import type { Logger } from 'pino';
import { HarnessParser } from '../../modules/pega/harness-schema/parser/HarnessParser.js';
import { LlmSectionExtractor } from '../../modules/pega/harness-schema/parser/LlmSectionExtractor.js';
import type { SchemaBuilder } from '../../modules/pega/harness-schema/generator/SchemaBuilder.js';
import type { PageContextResolver } from '../../modules/pega/harness-schema/resolver/PageContextResolver.js';
import { ClassHierarchyResolver } from '../../modules/pega/harness-schema/resolver/ClassHierarchyResolver.js';
import { SchemaGenerateRequestSchema } from '../../models/pega-schema.models.js';

/** Request body: extension sends raw harness + pre-fetched sections */
interface SchemaGenerateRequest {
  harnessJson: Record<string, unknown>;
  sectionJsons?: Record<string, Record<string, unknown>>;
  ruleType?: string;
}

/** Dependencies injected by createPegaSchemaRoutes. */
export interface SchemaGenerateDeps {
  logger: Logger;
  schemaBuilder: SchemaBuilder;
  contextResolver: PageContextResolver;
}

/**
 * POST /pega/schema/generate
 * Receives raw harness JSON + optional pre-fetched sections.
 * Returns generated JSON Schema.
 */
export function registerSchemaGenerateRoute(app: Hono, deps: SchemaGenerateDeps): void {
  app.post('/pega/schema/generate', async (c) => {
    const raw = await c.req.json();
    const parsed = SchemaGenerateRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({
        error: 'Invalid request',
        code: 'SCHEMA_INVALID_REQUEST',
        details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
      }, 400);
    }

    const body = parsed.data as SchemaGenerateRequest;

    try {
      // Create a local hierarchy resolver that uses provided sections (no API calls)
      const localResolver = createLocalResolver(body.sectionJsons || {});
      const llmExtractor = await wireLlmExtractor(deps.logger);

      const parser = new HarnessParser(
        createNoOpFetcher(),
        localResolver,
        deps.contextResolver,
        llmExtractor,
      );

      const parsedHarness = await parser.parse(body.harnessJson);
      const schema = deps.schemaBuilder.build(parsedHarness);
      const coverage = deps.schemaBuilder.calculateCoverage(parsedHarness);

      deps.logger.info({
        ruleType: parsedHarness.ruleType,
        fieldCount: Object.keys(schema.properties).length,
        coverage,
      }, '[pega-schema] Schema generated');

      return c.json({
        schema,
        ruleType: parsedHarness.ruleType,
        coverage,
        templateSections: parsedHarness.templateMarkers.map(m => m.sectionName),
      });
    } catch (err: any) {
      deps.logger.error({ err: err.message }, '[pega-schema] Generation failed');
      return c.json({
        error: 'Schema generation failed',
        ...(process.env.NODE_ENV !== 'production' && { details: err.message }),
      }, 500);
    }
  });
}

/** Wire LLM extractor if LLMService is available (non-fatal if not). */
async function wireLlmExtractor(logger: Logger): Promise<LlmSectionExtractor | undefined> {
  try {
    const { LLMService } = await import('../../modules/memory/llm/LLMService.js');
    const { loadPersistedLLMConfig } = await import('../../admin/admin-db.js');
    const envConfig = {
      provider: (process.env.LLM_PROVIDER || 'lmstudio') as any,
      model: process.env.LLM_MODEL || 'qwen2.5-vl-7b-instruct',
      baseUrl: process.env.LLM_BASE_URL || 'http://localhost:1234/v1',
      apiKey: process.env.LLM_API_KEY || undefined,
      temperature: 0.2,
      maxTokens: 2000,
    };
    let llmConfig = envConfig;
    try {
      const dbOverrides = await loadPersistedLLMConfig();
      llmConfig = { ...envConfig, ...(dbOverrides.model && { model: dbOverrides.model }), ...(dbOverrides.baseUrl && { baseUrl: dbOverrides.baseUrl }) };
    } catch { /* use env config */ }
    const llmService = new LLMService(llmConfig);
    return new LlmSectionExtractor(llmService);
  } catch (err) {
    logger.debug({ err }, '[pega-schema] LLM not available — using rule-based only');
    return undefined;
  }
}

/** Create a resolver that looks up sections from provided map (no network calls) */
function createLocalResolver(
  sectionJsons: Record<string, Record<string, unknown>>,
): ClassHierarchyResolver {
  const resolver = Object.create(ClassHierarchyResolver.prototype) as ClassHierarchyResolver;
  (resolver as any).resolveSection = async (name: string, _targetClass: string) => {
    const json = sectionJsons[name];
    if (!json) return null;
    return { sectionJson: json, resolvedClass: (json.pyClassName as string) || '@baseclass' };
  };
  (resolver as any).getClassHierarchy = (_className: string) => ['@baseclass'];
  return resolver;
}

/** No-op fetcher since backend doesn't call Pega API */
function createNoOpFetcher(): any {
  return {
    fetchHarness: async () => null,
    fetchSection: async () => null,
  };
}
