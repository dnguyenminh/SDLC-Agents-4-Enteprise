/**
 * SA4E-107: Code Enrichment Handler (facade).
 * Main handler: loads symbol context, calls LLM, parses response, stores results.
 * Strategy pattern selects enrichment approach per symbol kind.
 * SA4E-387: Wires per-call active model, context window discovery, dynamic budget,
 * and routes to single-shot or map-reduce enrichment.
 *
 * Implementation submodules (same directory):
 * - symbol-context-loader.ts      — DB loads for symbol context
 * - enrichment-schema-context.ts  — Pega schema KB lookup / on-the-fly creation
 * - enrichment-response-parser.ts — LLM response parsing with regex fallback
 * - enrichment-result-store.ts    — persistence of enrichment results
 * - budget-guard.ts               — dynamic budget calculation
 * - reduction-pipeline.ts         — real map-reduce for large symbols
 * - context-window.ts             — context window discovery + TTL cache
 */

import type { Logger } from 'pino';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import type { LLMService } from '../../modules/memory/llm/LLMService.js';
import type { WindowInfo } from '../../modules/memory/llm/context-window.js';
import { ContextWindowDiscovery } from '../../modules/memory/llm/context-window.js';
import type { PendingTask } from '../../modules/memory/task-queue/models.js';
import { CodeEnrichmentPromptBuilder } from './CodeEnrichmentPromptBuilder.js';
import { CodeEnrichmentPayloadSchema } from './types.js';
import type { EnrichmentStrategy } from './types.js';
import { isPegaKind } from '../../modules/pega/pega-mapping.js';
import { loadSymbolContext } from './symbol-context-loader.js';
import { EnrichmentSchemaContextLoader } from './enrichment-schema-context.js';
import { parseEnrichmentResponse } from './enrichment-response-parser.js';
import { storeEnrichmentResults } from './enrichment-result-store.js';
import { BudgetGuard } from './budget-guard.js';
import { ReductionPipeline, ReductionContext } from './reduction-pipeline.js';

/** LLM call timeout in milliseconds (BR-02). Env override: LLM_ENRICH_TIMEOUT_MS. Default 120s for slow local models. */
const LLM_TIMEOUT_MS = parseInt(process.env.LLM_ENRICH_TIMEOUT_MS || '120000', 10);

// Strategy selection: which symbol kinds map to which enrichment strategy.
// apex_class routes to CLASS_SUMMARY; trigger/constructor route to FUNCTION_SUMMARY
// so Salesforce Apex entities are enriched with summary (+ pseudo code) like the rest.
const CLASS_KINDS = new Set([
  'class', 'interface', 'enum', 'apex_class',
  'configuration', 'constant', 'controller', 'entity',
  'repository', 'service', 'namespace', 'jsp_page'
]);
const FUNCTION_KINDS = new Set([
  'function', 'method', 'arrow_function', 'generator', 'constructor', 'trigger',
  'http_get', 'http_post', 'transactional'
]);
// Salesforce declarative metadata + properties: summarized from signature/name
// (no code body, no pseudo code). Routed to METADATA_SUMMARY.
const METADATA_KINDS = new Set([
  'property', 'sf_field', 'sf_object', 'lwc_component', 'aura_component',
  'flow', 'visualforce_page',
]);

/**
 * Orchestrates LLM enrichment for a single code symbol.
 * Injected into TaskWorker via setCodeEnrichmentHandler().
 * SA4E-387: Supports runtime model swap, dynamic budget, and map-reduce.
 */
export class CodeEnrichmentHandler {
  private readonly promptBuilder: CodeEnrichmentPromptBuilder;
  private readonly schemaContext: EnrichmentSchemaContextLoader;
  private readonly windowDiscovery: ContextWindowDiscovery;
  private readonly reductionPipeline: ReductionPipeline;

  constructor(
    private readonly adapter: DatabaseAdapter,
    private readonly llmService: LLMService,
    private readonly logger: Logger,
  ) {
    this.promptBuilder = new CodeEnrichmentPromptBuilder();
    this.schemaContext = new EnrichmentSchemaContextLoader(adapter, llmService, logger);
    // ContextWindowDiscovery will be initialized per-call with active model config
    this.windowDiscovery = new ContextWindowDiscovery('ollama', '', ''); // placeholder, updated per-call
    this.reductionPipeline = new ReductionPipeline();

    // Wire LLMService.onModelChanged to invalidate window cache
    this.llmService.onModelChanged = (config) => {
      this.windowDiscovery.invalidateWindowCache(`${config.provider}:${config.model}:${config.baseUrl}`);
      this.logger?.info?.({ model: config.model, provider: config.provider }, 'Model changed, invalidated window cache');
    };
  }

  /**
   * Enrich a single symbol from a CODE_ENRICHMENT task.
   * For Pega rules: checks KB for enriched schema, creates on-the-fly if missing.
   * SA4E-387: Per-call model resolution, window discovery, budget calculation,
   * and routing to single-shot or map-reduce.
   * @param task - The pending task with payload
   */
  async enrichSymbol(task: PendingTask): Promise<void> {
    const parsed = CodeEnrichmentPayloadSchema.safeParse(JSON.parse(task.payload));
    if (!parsed.success) {
      throw new Error(`invalid_payload: ${parsed.error.message}`);
    }
    const payload = parsed.data;
    const context = await loadSymbolContext(this.adapter, payload);
    const strategy = this.selectStrategy(payload.symbolKind, payload.workspaceType);

    // For Pega rules: load or create enriched schema context.
    // ruleType = pxObjClass, taken from the FQN signature (first ':'-segment) —
    // the original class, not reverse-engineered from the kind string.
    if (strategy === 'PEGA_SUMMARY') {
      const ruleType = (context.signature || '').split(':')[0] || null;
      context.schemaContext = await this.schemaContext.loadOrCreateSchemaContext(ruleType, context.bodyText);
    }

    // SA4E-387: Per-call model resolution and window discovery
    const activeConfig = this.llmService.resolveActive();
    this.windowDiscovery.setProvider(activeConfig.provider);
    this.windowDiscovery.setModel(activeConfig.model);
    this.windowDiscovery.setBaseUrl(activeConfig.baseUrl);

    const windowInfo = await this.windowDiscovery.getContextWindow();

    // Calculate dynamic budget
    const promptOverheadTokens = 2000; // estimate for system prompt + schema + signature + instructions
    const budgetDecision = BudgetGuard.check({
      digest: context.bodyText || '',
      window: windowInfo,
      promptOverheadTokens,
    });

    const inputBudget = budgetDecision.inputBudget;

    // Build messages with dynamic budget
    const messages = this.promptBuilder.build(strategy, context, inputBudget);

    // Route: single-shot vs map-reduce
    let raw: string;
    if (budgetDecision.withinBudget) {
      // Single-shot enrichment
      raw = await this.callLLMWithTimeout(messages);
    } else {
      // Map-reduce enrichment for large symbols
      const reductionCtx: ReductionContext = {
        llmService: this.llmService,
        buildPrompt: (chunk: string) => {
          // For map-reduce, build a simpler prompt focused on the chunk
          const chunkContext = { ...context, bodyText: chunk };
          return this.promptBuilder.build(strategy, chunkContext, inputBudget);
        },
        trigger: 'budget_exceeded',
        strategy,
        budget: inputBudget,
      };
      const outcome = await this.reductionPipeline.reduce(null, context.bodyText || '', 'budget_exceeded', inputBudget, reductionCtx);
      if (outcome.kind === 'budget_error') {
        this.logger?.warn?.({ report: outcome.report }, 'Map-reduce failed, falling back to truncated single-shot');
        raw = await this.callLLMWithTimeout(messages);
      } else {
        raw = outcome.text || '';
        // Log map-reduce metrics
        this.logger?.info?.({ report: outcome.report }, 'Map-reduce enrichment completed');
      }
    }

    const response = parseEnrichmentResponse(raw, strategy);
    await storeEnrichmentResults(this.adapter, this.logger, payload.symbolId, response, strategy);
  }

  private selectStrategy(kind: string, workspaceType: string): EnrichmentStrategy {
    // SA4E-171: use isPegaKind() for all 16+ pega kinds (replaces static set)
    if (workspaceType === 'pega' && isPegaKind(kind)) return 'PEGA_SUMMARY';
    if (FUNCTION_KINDS.has(kind)) return 'FUNCTION_SUMMARY';
    if (CLASS_KINDS.has(kind)) return 'CLASS_SUMMARY';
    if (METADATA_KINDS.has(kind)) return 'METADATA_SUMMARY';
    return 'CLASS_SUMMARY'; // Fallback
  }

  /** Call LLM with timeout via Promise.race (BR-02). Supports per-call model override. */
  private async callLLMWithTimeout(messages: { role: string; content: string }[], override?: any): Promise<string> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('llm_timeout')), LLM_TIMEOUT_MS),
    );
    const result = await Promise.race([
      this.llmService.complete(messages as any, override),
      timeout,
    ]);
    return result.content;
  }
}