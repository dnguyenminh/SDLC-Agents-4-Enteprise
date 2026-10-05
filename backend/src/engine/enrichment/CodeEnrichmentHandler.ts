/**
 * SA4E-338 Task D + C: Code Enrichment Handler — budget-aware orchestration.
 *
 * For PEGA rules:
 *  1. Context-window discovery (UC-1)
 *  2. Budget check (BR-01, BR-12 warn ≥80%)
 *  3. Within budget → single LLM attempt (BR-16, no truncation)
 *  4. Context-length error → reactive map-reduce, 0 full-prompt retries (BR-08)
 *  5. Over budget → proactive map-reduce before any LLM call (UC-3 step 5b)
 *  6. BudgetError → persist report THEN throw terminal (BR-13, OI-05)
 *  7. Non-context error → provider retry ≤3 then failed (no map-reduce)
 *
 * For non-PEGA strategies: existing behavior unchanged.
 */

import type { Logger } from 'pino';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import type { LLMService } from '../../modules/memory/llm/LLMService.js';
import type { PendingTask } from '../../modules/memory/task-queue/models.js';
import { CodeEnrichmentPromptBuilder } from './CodeEnrichmentPromptBuilder.js';
import { CodeEnrichmentPayloadSchema, type EnrichmentStatus, type MapReduceReport, type EnrichmentMeta } from './types.js';
import type { CodeEnrichmentPayload, EnrichmentStrategy, SymbolContext, CodeEnrichmentLLMResponse } from './types.js';
import { validateTags } from './tag-validator.js';
import { isPegaKind } from '../../modules/pega/pega-mapping.js';
import { PegaSchemaCreator } from '../../modules/pega/schema/PegaSchemaCreator.js';
import { SchemaStorageService, type IDatabaseAdapter } from '../../modules/pega/schema/SchemaStorageService.js';
import { BudgetGuard, type BudgetInput, type BudgetDecision } from './budget-guard.js';
import { reduce, type ReductionOutcome, type AstNode as ReductionAstNode } from './reduction-pipeline.js';
import { estimateTokens } from '../context/token-budget-manager.js';

const LLM_TIMEOUT_MS = parseInt(process.env.LLM_ENRICH_TIMEOUT_MS || '120000', 10);
const MAX_PSEUDO_CODE_LENGTH = 2000;
const PROVIDER_MAX_RETRIES = 3;

const CLASS_KINDS = new Set([
  'class', 'interface', 'enum', 'apex_class',
  'configuration', 'constant', 'controller', 'entity',
  'repository', 'service', 'namespace', 'jsp_page',
]);
const FUNCTION_KINDS = new Set([
  'function', 'method', 'arrow_function', 'generator', 'constructor', 'trigger',
  'http_get', 'http_post', 'transactional',
]);
const METADATA_KINDS = new Set([
  'property', 'sf_field', 'sf_object', 'lwc_component', 'aura_component',
  'flow', 'visualforce_page',
]);

export class CodeEnrichmentHandler {
  private readonly promptBuilder: CodeEnrichmentPromptBuilder;
  private readonly schemaStorage: SchemaStorageService;
  private readonly schemaCreator: PegaSchemaCreator;
  private readonly budgetGuard = new BudgetGuard();

  constructor(
    private readonly adapter: DatabaseAdapter,
    private readonly llmService: LLMService,
    private readonly logger: Logger,
  ) {
    this.promptBuilder = new CodeEnrichmentPromptBuilder();
    this.schemaStorage = new SchemaStorageService(this.adapter as unknown as IDatabaseAdapter, this.logger);
    this.schemaCreator = new PegaSchemaCreator(this.llmService, this.schemaStorage, this.logger);
  }

  async enrichSymbol(task: PendingTask): Promise<void> {
    const parsed = CodeEnrichmentPayloadSchema.safeParse(JSON.parse(task.payload));
    if (!parsed.success) {
      throw new Error(`invalid_payload: ${parsed.error.message}`);
    }
    const payload = parsed.data;
    const context = await this.loadContext(payload);
    const strategy = this.selectStrategy(payload.symbolKind, payload.workspaceType);

    if (strategy === 'PEGA_SUMMARY') {
      const ruleType = (context.signature || '').split(':')[0] || null;
      context.schemaContext = await this.loadOrCreateSchemaContext(ruleType, context.bodyText);
    }

    if (strategy === 'PEGA_SUMMARY') {
      return this.enrichPegaWithBudget(payload.symbolId, context, task);
    }

    await this.enrichWithProviderRetry(payload.symbolId, context, strategy);
  }

  private async enrichPegaWithBudget(
    symbolId: number,
    context: SymbolContext,
    task: PendingTask,
  ): Promise<void> {
    const digest = context.bodyText || '';
    const ast = this.digestToAst(digest);

    const window = await this.llmService.getContextWindow();
    const overhead = estimateTokens(this.promptBuilder.buildPromptForBudget(context));
    const budgetInput: BudgetInput = { digest, window, promptOverheadTokens: overhead };
    const decision: BudgetDecision = this.budgetGuard.check(budgetInput);

    if (decision.warnContextFraction) {
      this.logger.warn({
        utilization: decision.budgetUtilization,
        estimatedTokens: decision.estimatedTokens,
        inputBudget: decision.inputBudget,
      }, 'budget utilization ≥80% — approaching context limit');
    }

    if (decision.overBudgetReason === 'non_positive_budget') {
      const outcome = await this.runReduction(ast, digest, 'proactive_over_budget', decision.inputBudget, context);
      await this.handleReductionOutcome(symbolId, outcome, context);
      return;
    }

    if (decision.withinBudget) {
      try {
        const messages = this.promptBuilder.build('PEGA_SUMMARY', context);
        const raw = await this.callLLMWithTimeout(messages);
        const response = this.parseResponse(raw, 'PEGA_SUMMARY');
        await this.storeResults(symbolId, response, 'PEGA_SUMMARY', null, !!context.schemaContext);
        return;
      } catch (err) {
        if (this.llmService.isContextLengthError(err)) {
          this.logger.warn({ symbolId }, 'context_length_error → reactive map-reduce');
          const outcome = await this.runReduction(ast, digest, 'context_length_error', decision.inputBudget, context);
          await this.handleReductionOutcome(symbolId, outcome, context);
          return;
        }
        await this.handleProviderError(symbolId, err, context, 'PEGA_SUMMARY');
        return;
      }
    }

    this.logger.info({ symbolId, estimatedTokens: decision.estimatedTokens, inputBudget: decision.inputBudget },
      'prompt over budget → proactive map-reduce');
    const outcome = await this.runReduction(ast, digest, 'proactive_over_budget', decision.inputBudget, context);
    await this.handleReductionOutcome(symbolId, outcome, context);
  }

  private async enrichWithProviderRetry(
    symbolId: number,
    context: SymbolContext,
    strategy: EnrichmentStrategy,
  ): Promise<void> {
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt <= PROVIDER_MAX_RETRIES; attempt++) {
      try {
        const messages = this.promptBuilder.build(strategy, context);
        const raw = await this.callLLMWithTimeout(messages);
        const response = this.parseResponse(raw, strategy);
        await this.storeResults(symbolId, response, strategy, null, !!context.schemaContext);
        return;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        if (this.llmService.isContextLengthError(lastErr)) {
          this.logger.warn({ symbolId }, 'context_length_error in non-PEGA → map-reduce');
          const window = await this.llmService.getContextWindow();
          const overhead = estimateTokens(this.promptBuilder.buildPromptForBudget(context));
          const budget = window.contextWindow - window.reservedOutputTokens - overhead;
          const ast = this.digestToAst(context.bodyText || '');
          const outcome = await this.runReduction(ast, context.bodyText || '', 'context_length_error', budget, context);
          await this.handleReductionOutcome(symbolId, outcome, context);
          return;
        }
        if (attempt < PROVIDER_MAX_RETRIES) {
          await this.backoff(attempt);
          continue;
        }
        await this.storeResults(symbolId, {
          summary: `Enrichment failed after ${PROVIDER_MAX_RETRIES + 1} attempts: ${lastErr.message}`,
          pseudo_code: '',
          tags: [],
        }, strategy, null, !!context.schemaContext);
        return;
      }
    }
    if (lastErr) {
      await this.storeResults(symbolId, {
        summary: `Enrichment failed: ${lastErr.message}`,
        pseudo_code: '',
        tags: [],
      }, strategy, null, !!context.schemaContext);
    }
  }

  private async runReduction(
    ast: ReductionAstNode,
    digest: string,
    trigger: 'proactive_over_budget' | 'context_length_error',
    budget: number,
    context: SymbolContext,
  ): Promise<ReductionOutcome> {
    return reduce(ast, digest, trigger, budget, {
      llm: this.llmService,
      budget,
      trigger,
      ast,
      digest,
    });
  }

  private async handleReductionOutcome(
    symbolId: number,
    outcome: ReductionOutcome,
    context: SymbolContext,
  ): Promise<void> {
    if (outcome.kind === 'success') {
      const response = this.parseResponse(outcome.text || '', 'PEGA_SUMMARY');
      response.mapReduceReport = outcome.report;
      await this.storeResults(symbolId, response, 'PEGA_SUMMARY', outcome.report, !!context.schemaContext);
    } else {
      // BR-13: persist report BEFORE throw — mapReduceReport always present in every run
      await this.storeResults(symbolId, {
        summary: outcome.error?.message || 'Budget exhausted',
        pseudo_code: '',
        tags: [],
        mapReduceReport: outcome.report,
      }, 'PEGA_SUMMARY', outcome.report, !!context.schemaContext);
      await this.persistBudgetErrorStatus(symbolId);
      throw this.toBudgetTaskError(outcome.error!, outcome.report);
    }
  }

  private async persistBudgetErrorStatus(symbolId: number): Promise<void> {
    try {
      await this.adapter.runAsync(
        `UPDATE symbols SET enrichment_status = 'budget_error' WHERE id = ?`,
        [symbolId],
      );
    } catch {
      // Don't fail the batch on persistence error
    }
  }

  private toBudgetTaskError(error: Error, report: MapReduceReport): Error {
    const reportJson = JSON.stringify(report);
    return new Error(`budget_error: ${error.message} | report=${reportJson}`);
  }

  private async handleProviderError(
    symbolId: number,
    err: unknown,
    context: SymbolContext,
    strategy: EnrichmentStrategy,
  ): Promise<void> {
    let lastErr = err instanceof Error ? err : new Error(String(err));
    for (let attempt = 0; attempt <= PROVIDER_MAX_RETRIES; attempt++) {
      if (attempt < PROVIDER_MAX_RETRIES) {
        await this.backoff(attempt);
        try {
          const messages = this.promptBuilder.build(strategy, context);
          const raw = await this.callLLMWithTimeout(messages);
          const response = this.parseResponse(raw, strategy);
          await this.storeResults(symbolId, response, strategy, null, !!context.schemaContext);
          return;
        } catch (retryErr) {
          lastErr = retryErr instanceof Error ? retryErr : new Error(String(retryErr));
          if (this.llmService.isContextLengthError(lastErr)) {
            const window = await this.llmService.getContextWindow();
            const overhead = estimateTokens(this.promptBuilder.buildPromptForBudget(context));
            const budget = window.contextWindow - window.reservedOutputTokens - overhead;
            const ast = this.digestToAst(context.bodyText || '');
            const outcome = await this.runReduction(ast, context.bodyText || '', 'context_length_error', budget, context);
            await this.handleReductionOutcome(symbolId, outcome, context);
            return;
          }
          continue;
        }
      }
    }
    await this.storeResults(symbolId, {
      summary: `Enrichment failed after ${PROVIDER_MAX_RETRIES + 1} attempts`,
      pseudo_code: '',
      tags: [],
    }, strategy, null, !!context.schemaContext);
  }

  private digestToAst(digest: string): ReductionAstNode {
    const sections = digest.split(/\n(?=---|\*\*|#|\d+\.)/).filter(Boolean);
    const children: ReductionAstNode[] = sections.map((section, i) => ({
      id: `section_${i}`,
      type: section.substring(0, 50).trim(),
      content: section,
      logicNode: /step|condition|expression|decision|rule/i.test(section.substring(0, 80)),
    }));
    return {
      id: 'root',
      type: 'root',
      content: digest,
      children: children.length > 0 ? children : [{ id: 'section_0', type: 'content', content: digest, logicNode: false }],
    };
  }

  private backoff(attempt: number): Promise<void> {
    return new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
  }

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

  private parseResponse(raw: string, strategy: EnrichmentStrategy): CodeEnrichmentLLMResponse {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.summary === 'string') return parsed;
    } catch { /* fallback below */ }

    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      try {
        const parsed = JSON.parse(fenceMatch[1].trim());
        if (parsed && typeof parsed.summary === 'string') return parsed;
      } catch { /* fallback below */ }
    }

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

  private async storeResults(
    symbolId: number,
    response: CodeEnrichmentLLMResponse,
    strategy: EnrichmentStrategy,
    report: MapReduceReport | null,
    schemaContextPresent = false,
  ): Promise<void> {
    const tags = validateTags(response.tags);
    const tagsJson = tags.length > 0 ? JSON.stringify(tags) : null;

    let pseudoCode: string | null = null;
    if (strategy !== 'TAG_EXTRACTION' && response.pseudo_code) {
      pseudoCode = response.pseudo_code.length > MAX_PSEUDO_CODE_LENGTH
        ? response.pseudo_code.slice(0, MAX_PSEUDO_CODE_LENGTH) + '...'
        : response.pseudo_code;
    }

    const now = new Date().toISOString();

    const meta: EnrichmentMeta = {
      digestSource: 'ast_digest',
      window: { tokens: 0, source: 'unknown', model: '' },
      budgetCheck: { digestTokens: 0, overheadTokens: 0, inputBudget: 0, withinBudget: true, utilization: 0 },
      schemaContextPresent,
      mapReduceReport: report ?? undefined,
      truncatedAt: null,
    };

    const metaJson = JSON.stringify(meta);

    await this.adapter.runAsync(
      `UPDATE symbols SET summary = ?, pseudo_code = ?,
       llm_tags = ?, enrichment_status = 'COMPLETED', enriched_at = ?, enrichment_meta = ?
       WHERE id = ?`,
      [response.summary, pseudoCode, tagsJson, now, metaJson, symbolId],
    );
  }

  private selectStrategy(kind: string, workspaceType: string): EnrichmentStrategy {
    if (workspaceType === 'pega' && isPegaKind(kind)) return 'PEGA_SUMMARY';
    if (FUNCTION_KINDS.has(kind)) return 'FUNCTION_SUMMARY';
    if (CLASS_KINDS.has(kind)) return 'CLASS_SUMMARY';
    if (METADATA_KINDS.has(kind)) return 'METADATA_SUMMARY';
    return 'CLASS_SUMMARY';
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
      pegaClass: payload.pegaClass || sym.parent_symbol || undefined,
      pegaRuleset: payload.pegaRuleset || undefined,
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

  private async loadOrCreateSchemaContext(ruleType: string | null, bodyText: string | null): Promise<string | undefined> {
    if (!ruleType) return undefined;
    try {
      const existing = await this.schemaStorage.find(ruleType);
      if (existing) return this.formatSchemaForPrompt(JSON.stringify(existing));
    } catch (err) {
      this.logger.warn({ err, ruleType }, '[enrichment] Canonical schema lookup failed');
    }
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
}
