/**
 * SA4E-214 — SchemaStorageService: KB CRUD for enriched schemas.
 * Stores schemas in knowledge_entries table with type='PEGA_SCHEMA_ENRICHED'.
 * Pattern: Repository — encapsulates all DB operations for enriched schemas.
 */

import type { Logger } from 'pino';
import type { EnrichedSchema, FieldDescriptor } from '../../../models/pega-schema.models.js';

/** Database adapter interface (matches existing DatabaseAdapter pattern) */
export interface IDatabaseAdapter {
  getAsync<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  runAsync(sql: string, params?: unknown[]): Promise<{ lastID?: number; changes?: number }>;
}

/** Interface for schema storage operations (TDD §5.2) */
export interface ISchemaStorageService {
  store(schema: EnrichedSchema): Promise<number>;
  find(ruleType: string): Promise<EnrichedSchema | null>;
  update(ruleType: string, newFields: FieldDescriptor[]): Promise<number>;
}

/** KB source prefix for enriched schemas */
const SOURCE_PREFIX = 'pega-schema:';

/**
 * CRUD operations on enriched schemas stored in knowledge_entries.
 * Query pattern: type='PEGA_SCHEMA_ENRICHED', source='pega-schema:{ruleType}'.
 */
export class SchemaStorageService implements ISchemaStorageService {
  constructor(
    private readonly db: IDatabaseAdapter,
    private readonly logger: Logger,
  ) {}

  /** Store a new enriched schema. Throws on duplicate ruleType. */
  async store(schema: EnrichedSchema): Promise<number> {
    const source = `${SOURCE_PREFIX}${schema.rule_type}`;
    const content = JSON.stringify(schema);
    const now = new Date().toISOString();
    const tags = `pega,schema,enriched,${schema.rule_type}`;
    const summary = `Enriched schema for ${schema.rule_type}: ${schema.known_fields.length} fields, ${schema.coverage}% coverage`;

    // Check for existing
    const existing = await this.db.getAsync<{ id: number }>(
      `SELECT id FROM knowledge_entries WHERE type = 'PEGA_SCHEMA_ENRICHED' AND source = ?`,
      [source],
    );
    if (existing) {
      throw new SchemaAlreadyExistsError(schema.rule_type);
    }

    const result = await this.db.runAsync(
      `INSERT INTO knowledge_entries (content, summary, type, source, tags, scope, tier, created_at, enrichment_status)
       VALUES (?, ?, 'PEGA_SCHEMA_ENRICHED', ?, ?, 'PROJECT', 'SEMANTIC', ?, 'done')`,
      [content, summary, source, tags, now],
    );

    this.logger.info({ ruleType: schema.rule_type, id: result.lastID }, '[schema-store] Schema stored');
    return result.lastID || 0;
  }

  /** Find schema by ruleType. Returns null if not found. */
  async find(ruleType: string): Promise<EnrichedSchema | null> {
    const source = `${SOURCE_PREFIX}${ruleType}`;
    let row;
    try {
      row = await this.db.getAsync<{ content: string }>(
        `SELECT content FROM knowledge_entries WHERE type = 'PEGA_SCHEMA_ENRICHED' AND source = ? LIMIT 1`,
        [source],
      );
    } catch (err) {
      // Fresh DBs may not have knowledge_entries in this adapter's view yet
      // (snapshot semantics) — treat as "not found" (route → 404), not 500.
      this.logger.debug({ err, ruleType }, '[schema-store] Find failed (treating as not found)');
      return null;
    }

    if (!row?.content) return null;

    try {
      return JSON.parse(row.content) as EnrichedSchema;
    } catch {
      this.logger.warn({ ruleType }, '[schema-store] Failed to parse stored schema');
      return null;
    }
  }

  /** Progressive update: append new fields, increment version. */
  async update(ruleType: string, newFields: FieldDescriptor[]): Promise<number> {
    const existing = await this.find(ruleType);
    if (!existing) {
      throw new SchemaNotFoundError(ruleType);
    }

    // Append new fields to appropriate category buckets
    for (const field of newFields) {
      switch (field.category) {
        case 'identity': existing.identity_fields[field.path] = field; break;
        case 'connectivity': existing.connectivity_fields[field.path] = field; break;
        default: existing.logic_fields[field.path] = field; break;
      }
      if (!existing.known_fields.includes(field.path)) {
        existing.known_fields.push(field.path);
      }
    }

    existing.schema_version += 1;
    existing.updated_at = new Date().toISOString();

    const source = `${SOURCE_PREFIX}${ruleType}`;
    const content = JSON.stringify(existing);
    const summary = `Enriched schema for ${ruleType}: ${existing.known_fields.length} fields, ${existing.coverage}% coverage (v${existing.schema_version})`;

    await this.db.runAsync(
      `UPDATE knowledge_entries SET content = ?, summary = ?, updated_at = ? WHERE type = 'PEGA_SCHEMA_ENRICHED' AND source = ?`,
      [content, summary, existing.updated_at, source],
    );

    this.logger.info({ ruleType, version: existing.schema_version }, '[schema-store] Schema updated');
    return existing.schema_version;
  }
}

// ─── Error Classes ────────────────────────────────────────────────────────

export class SchemaNotFoundError extends Error {
  constructor(ruleType: string) {
    super(`Schema not found for rule type: ${ruleType}`);
    this.name = 'SchemaNotFoundError';
  }
}

export class SchemaAlreadyExistsError extends Error {
  constructor(ruleType: string) {
    super(`Schema already exists for rule type: ${ruleType}`);
    this.name = 'SchemaAlreadyExistsError';
  }
}
