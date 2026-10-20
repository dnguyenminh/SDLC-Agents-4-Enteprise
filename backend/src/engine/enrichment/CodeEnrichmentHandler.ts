/**
 * SA4E-107: Code Enrichment Handler (facade).
 * Main handler: loads symbol context, calls LLM, parses response, stores results.
 * Strategy pattern selects enrichment approach per symbol kind.
 *
 * Implementation submodules (same directory):
 * - symbol-context-loader.ts      — DB loads for symbol context
 * - enrichment-schema-context.ts  — Pega schema KB lookup / on-the-fly creation
 * - enrichment-response-parser.ts — LLM response parsing with regex fallback
 * - enrichment-result-store.ts    — persistence of enrichment results
 */

import type { Logger } from 'pino';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import type { LLMService } from '../../modules/memory/llm/LLMService.js';
import type { PendingTask } from '../../modules/memory/task-queue/models.js';
import { CodeEnrichmentPromptBuilder } from './CodeEnrichmentPromptBuilder.js';
import { CodeEnrichmentPayloadSchema } from './types.js';
import type { EnrichmentStrategy } from './types.js';
import { isPegaKind } from '../../modules/pega/pega-mapping.js';
import { loadSymbolContext } from './symbol-context-loader.js';
import { EnrichmentSchemaContextLoader } from './enrichment-schema-context.js';
import { parseEnrichmentResponse } from './enrichment-response-parser.js';
import { storeEnrichmentResults } from './enrichment-result-store.js';

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
 */
export class CodeEnrichmentHandler {
  private readonly promptBuilder: CodeEnrichmentPromptBuilder;
  private readonly schemaContext: EnrichmentSchemaContextLoader;

  constructor(
    private readonly adapter: DatabaseAdapter,
    private readonly llmService: LLMService,
    private readonly logger: Logger,
  ) {
    this.promptBuilder = new CodeEnrichmentPromptBuilder();
    this.schemaContext = new EnrichmentSchemaContextLoader(adapter, llmService, logger);
  }

  /**
   * Enrich a single symbol from a CODE_ENRICHMENT task.
   * For Pega rules: checks KB for enriched schema, creates on-the-fly if missing.
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

    const messages = this.promptBuilder.build(strategy, context);
    const raw = await this.callLLMWithTimeout(messages);
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

  /** Call LLM with timeout via Promise.race (BR-02). */
  private async callLLMWithTimeout(messages: { role: string; content: string }[]): Promise<string> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('llm_timeout')), LLM_TIMEOUT_MS),
    );
    const result = await Promise.race([
      this.llmService.complete(messages as any),
      timeout,
    ]);
    return result.content;
  }
}
