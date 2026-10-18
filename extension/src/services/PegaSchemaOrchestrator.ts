/**
 * SA4E-214 — PegaSchemaOrchestrator: Facade orchestrating recursive schema creation.
 * Extension-side: drives Pega harness/section fetching, delegates analysis to backend.
 * Implements mutex, circuit breaker, and total-timeout safety mechanisms.
 * Recursion/aggregation helpers live in ./PegaSchemaOrchestrator/*.
 */

import type { ISchemaCache } from './SchemaLocalCache';
import type { ISchemaApiClient } from './SchemaApiClient';
import type { PegaHttpClient } from './PegaHttpClient';
import type { EnrichedSchema, FieldDescriptor, SchemaAnalyzeResponse } from '../models/EnrichedSchema';
import { DEFAULT_CONFIG, type ISchemaOrchestrator, type OrchestratorConfig } from './PegaSchemaOrchestrator/types';
import { checkTotalTimeout } from './PegaSchemaOrchestrator/timeout';
import { buildSchema, findNewFields } from './PegaSchemaOrchestrator/schema-builder';
import { RecursiveSectionDiscoverer } from './PegaSchemaOrchestrator/discovery';
import { fetchHarnessRuleForm } from './PegaSchemaOrchestrator/rule-fetcher';

export type { ISchemaOrchestrator } from './PegaSchemaOrchestrator/types';

/**
 * Orchestrates full schema creation: fetch harness → analyze → discover sub-sections → aggregate.
 * Pattern: Facade (single entry point), Mutex (prevent concurrent creation), Circuit Breaker.
 */
export class PegaSchemaOrchestrator implements ISchemaOrchestrator {
  private readonly creatingTypes = new Set<string>();
  private readonly config: OrchestratorConfig;

  constructor(
    private readonly cache: ISchemaCache,
    private readonly apiClient: ISchemaApiClient,
    private readonly pegaClient: PegaHttpClient,
    private readonly log: (msg: string) => void,
    config?: Partial<OrchestratorConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create enriched schema for a rule type — async, non-blocking to BFS.
   * Returns null on failure (fail-safe: indexing continues regardless).
   */
  async createSchema(ruleType: string): Promise<EnrichedSchema | null> {
    // Mutex: skip if already creating this type
    if (this.creatingTypes.has(ruleType)) {
      this.log(`[Schema] ⏳ Already creating ${ruleType} — skipping`);
      return null;
    }

    // Check cache first
    const cached = this.cache.get(ruleType);
    if (cached) return cached;

    this.creatingTypes.add(ruleType);
    const startTime = Date.now();
    this.log(`[Schema] 🔧 Creating schema for ${ruleType}...`);

    try {
      const schema = await this.createWithTimeout(ruleType, startTime);
      if (schema) {
        this.cache.set(ruleType, schema);
        // Store in backend KB (fire-and-forget)
        this.apiClient.store(schema).catch(err =>
          this.log(`[Schema] ⚠️ KB store failed for ${ruleType}: ${err.message}`),
        );
        this.log(`[Schema] ✅ ${ruleType}: ${schema.known_fields.length} fields, ${schema.coverage}% coverage`);
      }
      return schema;
    } catch (err: any) {
      this.log(`[Schema] ❌ ${ruleType} failed: ${err.message}`);
      return null;
    } finally {
      this.creatingTypes.delete(ruleType);
    }
  }

  /** Get schema from cache or backend — does NOT trigger creation. */
  async getSchema(ruleType: string): Promise<EnrichedSchema | null> {
    const cached = this.cache.get(ruleType);
    if (cached) return cached;

    try {
      const remote = await this.apiClient.find(ruleType);
      if (remote) {
        this.cache.set(ruleType, remote);
        return remote;
      }
    } catch {
      // Non-fatal: backend may be unreachable
    }
    return null;
  }

  /** Progressive enrichment: compare rule JSON against schema, update if new fields found. */
  async validateAndUpdate(ruleType: string, ruleJson: Record<string, unknown>): Promise<void> {
    const schema = await this.getSchema(ruleType);
    if (!schema) return;

    const newFields = findNewFields(schema, ruleJson);
    if (newFields.length === 0) return;

    this.log(`[Schema] 📐 ${ruleType}: found ${newFields.length} new fields — updating`);
    try {
      const result = await this.apiClient.update(ruleType, newFields);
      // Update local cache version
      schema.schema_version = result.new_version;
      schema.known_fields.push(...newFields.map(f => f.path));
      schema.updated_at = new Date().toISOString();
      this.cache.set(ruleType, schema);
    } catch (err: any) {
      this.log(`[Schema] ⚠️ Progressive update failed for ${ruleType}: ${err.message}`);
    }
  }

  // ─── Private Implementation ─────────────────────────────────────────────

  /** Create schema with total-timeout enforcement (TDD §10.1: 60s). */
  private async createWithTimeout(ruleType: string, startTime: number): Promise<EnrichedSchema | null> {
    // Step 1: Fetch harness RuleForm from Pega
    const harnessJson = await fetchHarnessRuleForm(this.pegaClient, ruleType, this.log);
    if (!harnessJson) return null;

    checkTotalTimeout(startTime, this.config.totalTimeoutMs, ruleType);

    // Step 2: Send to backend for analysis
    const analyzeResult = await this.apiClient.analyze({
      harnessJson,
      ruleType,
      depth: 0,
    });

    // Step 3: Recursive section discovery
    const allFields: FieldDescriptor[] = [...analyzeResult.fields];
    const visited = new Set<string>();

    const discoverer = new RecursiveSectionDiscoverer(
      this.apiClient, this.pegaClient, this.log, this.config,
    );
    await discoverer.discover(ruleType, analyzeResult.sub_sections, 1, visited, allFields, startTime);

    // Step 4: Aggregate into EnrichedSchema
    return buildSchema(ruleType, allFields, analyzeResult, visited);
  }
}
