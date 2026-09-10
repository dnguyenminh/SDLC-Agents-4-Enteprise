/**
 * SA4E-107: Code Enrichment Handler.
 * Main handler: loads symbol context, calls LLM, parses response, stores results.
 * Strategy pattern selects enrichment approach per symbol kind.
 */

import type { Logger } from 'pino';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import type { LLMService } from '../../modules/memory/llm/LLMService.js';
import type { PendingTask } from '../../modules/memory/task-queue/models.js';
import { CodeEnrichmentPromptBuilder } from './CodeEnrichmentPromptBuilder.js';
import { CodeEnrichmentPayloadSchema } from './types.js';
import type { CodeEnrichmentPayload, EnrichmentStrategy, SymbolContext, CodeEnrichmentLLMResponse } from './types.js';
import { validateTags } from './tag-validator.js';
import { isPegaKind } from '../../modules/pega/pega-mapping.js';
import { PegaSchemaCreator } from '../../modules/pega/schema/PegaSchemaCreator.js';
import { SchemaStorageService, type IDatabaseAdapter } from '../../modules/pega/schema/SchemaStorageService.js';

/** LLM call timeout in milliseconds (BR-02). Env override: LLM_ENRICH_TIMEOUT_MS. Default 120s for slow local models. */
const LLM_TIMEOUT_MS = parseInt(process.env.LLM_ENRICH_TIMEOUT_MS || '120000', 10);
/** Max pseudo code length (BR-05). */
const MAX_PSEUDO_CODE_LENGTH = 2000;

// Strategy selection: which symbol kinds map to which enrichment strategy.
// apex_class routes to CLASS_SUMMARY; trigger/constructor route to FUNCTION_SUMMARY
// so Salesforce Apex entities are enriched with summary (+ pseudo code) like the rest.
const CLASS_KINDS = new Set(['class', 'interface', 'enum', 'apex_class']);
const FUNCTION_KINDS = new Set(['function', 'method', 'arrow_function', 'generator', 'constructor', 'trigger']);
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
  private readonly schemaStorage: SchemaStorageService;
  private readonly schemaCreator: PegaSchemaCreator;

  constructor(
    private readonly adapter: DatabaseAdapter,
    private readonly llmService: LLMService,
    private readonly logger: Logger,
  ) {
    this.promptBuilder = new CodeEnrichmentPromptBuilder();
    this.schemaStorage = new SchemaStorageService(this.adapter as unknown as IDatabaseAdapter, this.logger);
    this.schemaCreator = new PegaSchemaCreator(this.llmService, this.schemaStorage, this.logger);
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
    const context = await this.loadContext(payload);
    const strategy = this.selectStrategy(payload.symbolKind, payload.workspaceType);

    // For Pega rules: load or create enriched schema context.
    // ruleType = pxObjClass, taken from the FQN signature (first ':'-segment) —
    // the original class, not reverse-engineered from the kind string.
    if (strategy === 'PEGA_SUMMARY') {
      const ruleType = (context.signature || '').split(':')[0] || null;
      context.schemaContext = await this.loadOrCreateSchemaContext(ruleType, context.bodyText);
    }

    const messages = this.promptBuilder.build(strategy, context);
    const raw = await this.callLLMWithTimeout(messages);
    const response = this.parseResponse(raw, strategy);
    await this.storeResults(payload.symbolId, response, strategy);
  }

  /**
   * Load enriched schema from KB for this rule type.
   * If not found, create on-the-fly using LLM + current rule instance as sample.
   * Progressive: schema is enriched once per rule type, reused for all instances.
   */
  private async loadOrCreateSchemaContext(ruleType: string | null, bodyText: string | null): Promise<string | undefined> {
    if (!ruleType) return undefined;

    // Check KB for existing enriched schema (canonical key first)
    const existing = await this.findEnrichedSchema(ruleType);
    if (existing) return existing;

    // No enriched schema yet — create on-the-fly via PegaSchemaCreator (stores canonical key)
    if (!bodyText || bodyText.length < 50) return undefined;
    try {
      const schema = await this.schemaCreator.createSchemaOnTheFly(ruleType, bodyText);
      if (schema) {
        await this.schemaCreator.storeSchema(schema);
        return this.formatSchemaForPrompt(JSON.stringify(schema));
      }
    } catch (err) {
      this.logger.debug({ err, ruleType }, '[enrichment] Schema creation failed (non-fatal)');
    }
    return undefined;
  }

  /** Search KB (knowledge_entries) for enriched schema of this rule type. */
  private async findEnrichedSchema(ruleType: string): Promise<string | null> {
    // SA4E-222 (DISC-1 fix): canonical key pega-schema:{ruleType} (pure JSON) via storage service
    try {
      const schema = await this.schemaStorage.find(ruleType);
      if (schema) return this.formatSchemaForPrompt(JSON.stringify(schema));
    } catch (err) {
      this.logger.warn({ err, ruleType }, '[enrichment] Canonical schema lookup failed');
    }

    // Legacy format fallback (backward compat with SA4E-214 rows)
    const row = await this.adapter.getAsync<{ content: string }>(
      `SELECT content FROM knowledge_entries
       WHERE type = 'PEGA_SCHEMA_ENRICHED' AND source = ?
       ORDER BY id DESC LIMIT 1`,
      [`pega-schema-enriched/${ruleType}`],
    );
    if (!row?.content) return null;
    // Extract the JSON schema part after the prefix
    const prefixEnd = row.content.indexOf(' | schema=');
    if (prefixEnd === -1) return row.content;
    return row.content.substring(prefixEnd + ' | schema='.length);
  }

  /**
   * Format enriched schema JSON for inclusion in LLM prompt.
   * R-03: Wraps schema content in clear delimiters to prevent prompt injection.
   */
  private formatSchemaForPrompt(schemaJson: string): string {
    try {
      const schema = JSON.parse(schemaJson);
      const fields = [
        ...Object.values(schema.identity_fields || {}),
        ...Object.values(schema.logic_fields || {}),
        ...Object.values(schema.connectivity_fields || {}),
      ] as Array<{ path: string; category: string; description: string }>;

      const fieldList = fields.map(f => `- ${f.path} (${f.category}): ${f.description}`).join('\n');
      const hints = schema.extraction_hints || {};

      // R-03: Use clear delimiters to separate schema context from user content
      const nestedPaths = (hints.nested_logic_paths || []).join(', ') || 'none';
      return [
        '--- BEGIN SCHEMA CONTEXT ---',
        `Rule Type: ${schema.rule_type}`,
        `Primary Logic Field: ${hints.primary_logic_field || 'unknown'}`,
        `Logic Structure: ${hints.logic_structure || 'unknown'}`,
        `Nested Logic Paths: ${nestedPaths}`,
        `Known Fields (${fields.length}):`,
        fieldList,
        '--- END SCHEMA CONTEXT ---',
      ].join('\n');
    } catch {
      return schemaJson;
    }
  }

  private selectStrategy(kind: string, workspaceType: string): EnrichmentStrategy {
    // SA4E-171: use isPegaKind() for all 16+ pega kinds (replaces static set)
    if (workspaceType === 'pega' && isPegaKind(kind)) return 'PEGA_SUMMARY';
    if (FUNCTION_KINDS.has(kind)) return 'FUNCTION_SUMMARY';
    if (CLASS_KINDS.has(kind)) return 'CLASS_SUMMARY';
    if (METADATA_KINDS.has(kind)) return 'METADATA_SUMMARY';
    return 'CLASS_SUMMARY'; // Fallback
  }

  private async loadContext(payload: CodeEnrichmentPayload): Promise<SymbolContext> {
    const sym = await this.adapter.getAsync<{
      name: string; kind: string; signature: string | null;
      doc_comment: string | null; parent_symbol: string | null;
    }>(
      'SELECT name, kind, signature, doc_comment, parent_symbol FROM symbols WHERE id = ?',
      [payload.symbolId],
    );
    if (!sym) throw new Error(`symbol_not_found: ${payload.symbolId}`);
    // filePath comes from the task payload (already relative_path) — grounds metadata prompts.

    const bodyText = await this.loadBodyText(payload.symbolId);
    const childMembers = await this.loadChildMembers(payload.symbolId);
    const existingPseudoCode = await this.loadExistingPseudoCode(payload.symbolId);

    return {
      name: sym.name,
      kind: sym.kind,
      signature: sym.signature,
      docComment: sym.doc_comment,
      bodyText,
      childMembers,
      existingPseudoCode,
      // SA4E-106: Pega class from payload or parent_symbol; ruleset from payload
      pegaClass: payload.pegaClass || sym.parent_symbol || undefined,
      pegaRuleset: payload.pegaRuleset || undefined,
      // Metadata grounding: owning object/component + source file path.
      parentSymbol: sym.parent_symbol || undefined,
      filePath: payload.filePath || undefined,
    };
  }

  private async loadBodyText(symbolId: number): Promise<string | null> {
    const row = await this.adapter.getAsync<{ embedding: Buffer }>(
      'SELECT embedding FROM body_embeddings WHERE symbol_id = ? AND chunk_index = 0',
      [symbolId],
    );
    if (!row?.embedding) return null;
    return Buffer.from(row.embedding).toString('utf-8');
  }

  private async loadChildMembers(symbolId: number): Promise<string[] | null> {
    const rows = await this.adapter.allAsync<{ name: string; kind: string }>(
      'SELECT name, kind FROM symbols WHERE parent_symbol_id = ? LIMIT 30',
      [symbolId],
    );
    if (rows.length === 0) return null;
    return rows.map(r => `${r.kind}:${r.name}`);
  }

  private async loadExistingPseudoCode(symbolId: number): Promise<string | null> {
    const row = await this.adapter.getAsync<{ pseudo_code: string | null }>(
      'SELECT pseudo_code FROM symbols WHERE id = ?', [symbolId],
    );
    return row?.pseudo_code ?? null;
  }

  /** Call LLM with 30s timeout via Promise.race (BR-02). */
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

  /** Parse LLM response with regex fallback on JSON parse failure. */
  private parseResponse(raw: string, strategy: EnrichmentStrategy): CodeEnrichmentLLMResponse {
    // Attempt 1: direct JSON parse
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.summary === 'string') return parsed;
    } catch { /* fallback below */ }

    // Attempt 2: extract from markdown code fence
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      try {
        const parsed = JSON.parse(fenceMatch[1].trim());
        if (parsed && typeof parsed.summary === 'string') return parsed;
      } catch { /* fallback below */ }
    }

    // Attempt 3: regex extraction of individual fields
    return this.regexFallbackParse(raw, strategy);
  }

  private regexFallbackParse(raw: string, strategy: EnrichmentStrategy): CodeEnrichmentLLMResponse {
    const summaryMatch = raw.match(/"summary"\s*:\s*"([^"]+)"/);
    const pseudoMatch = raw.match(/"pseudo_code"\s*:\s*"([^"]+)"/);
    const tagsMatch = raw.match(/"tags"\s*:\s*\[([^\]]*)\]/);

    const summary = summaryMatch?.[1] ?? raw.slice(0, 200).replace(/["\n]/g, ' ').trim();
    const result: CodeEnrichmentLLMResponse = { summary };

    if (strategy !== 'TAG_EXTRACTION' && pseudoMatch) {
      result.pseudo_code = pseudoMatch[1];
    }
    if (tagsMatch) {
      const tagStrs = tagsMatch[1].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, ''));
      result.tags = tagStrs ?? [];
    }
    return result;
  }

  /** Persist enrichment results to symbols table (last-write-wins, BR-07). */
  private async storeResults(
    symbolId: number, response: CodeEnrichmentLLMResponse, strategy: EnrichmentStrategy,
  ): Promise<void> {
    const tags = validateTags(response.tags);
    const tagsJson = tags.length > 0 ? JSON.stringify(tags) : null;

    // Store pseudo_code for all summarizing strategies (CLASS, FUNCTION, PEGA).
    // Only TAG_EXTRACTION produces no pseudo code.
    let pseudoCode: string | null = null;
    if (strategy !== 'TAG_EXTRACTION' && response.pseudo_code) {
      pseudoCode = response.pseudo_code.length > MAX_PSEUDO_CODE_LENGTH
        ? response.pseudo_code.slice(0, MAX_PSEUDO_CODE_LENGTH) + '...'
        : response.pseudo_code;
    }

    const now = new Date().toISOString();
    // Write pseudo_code directly (not COALESCE): on re-enrichment the fresh LLM
    // output must overwrite stale/incorrect values instead of being preserved.
    await this.adapter.runAsync(
      `UPDATE symbols SET summary = ?, pseudo_code = ?,
       llm_tags = ?, enrichment_status = 'COMPLETED', enriched_at = ? WHERE id = ?`,
      [response.summary, pseudoCode, tagsJson, now, symbolId],
    );
  }
}
