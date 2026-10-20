/**
 * SA4E-107: Pega schema context loading (extracted from CodeEnrichmentHandler).
 * Loads enriched schemas from KB for a rule type, creates on-the-fly when
 * missing, and formats schema JSON for safe LLM prompt inclusion (R-03).
 */

import type { Logger } from 'pino';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import type { LLMService } from '../../modules/memory/llm/LLMService.js';
import { PegaSchemaCreator } from '../../modules/pega/schema/PegaSchemaCreator.js';
import { SchemaStorageService, type IDatabaseAdapter } from '../../modules/pega/schema/SchemaStorageService.js';

/**
 * Owns Pega schema lookup/creation for PEGA_SUMMARY enrichment.
 * Progressive: schema is enriched once per rule type, reused for all instances.
 */
export class EnrichmentSchemaContextLoader {
  private readonly schemaStorage: SchemaStorageService;
  private readonly schemaCreator: PegaSchemaCreator;

  constructor(
    private readonly adapter: DatabaseAdapter,
    llmService: LLMService,
    private readonly logger: Logger,
  ) {
    this.schemaStorage = new SchemaStorageService(adapter as unknown as IDatabaseAdapter, logger);
    this.schemaCreator = new PegaSchemaCreator(llmService, this.schemaStorage, logger);
  }

  /**
   * Load enriched schema from KB for this rule type.
   * If not found, create on-the-fly using LLM + current rule instance as sample.
   */
  async loadOrCreateSchemaContext(ruleType: string | null, bodyText: string | null): Promise<string | undefined> {
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
      // S5: Schema parsing failure - wrap in delimiters to prevent injection
      return [
        '--- BEGIN SCHEMA CONTEXT (PARSE FAILURE) ---',
        schemaJson,
        '--- END SCHEMA CONTEXT (PARSE FAILURE) ---',
      ].join('\n');
    }
  }
}
