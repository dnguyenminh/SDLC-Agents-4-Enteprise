/**
 * Recursive sub-section discovery for schema orchestration (SA4E-214, TDD §5.3).
 * Circuit breaker: >threshold sections at one level → stop.
 */

import type { PegaHttpClient } from '../PegaHttpClient';
import type { ISchemaApiClient } from '../SchemaApiClient';
import type { FieldDescriptor, SchemaAnalyzeResponse } from '../../models/EnrichedSchema';
import type { OrchestratorConfig } from './types';
import { checkTotalTimeout } from './timeout';

/**
 * Recursively fetch and analyze sub-sections, accumulating fields.
 * Standalone helper — holds no shared state with the orchestrator facade.
 */
export class RecursiveSectionDiscoverer {
  constructor(
    private readonly apiClient: ISchemaApiClient,
    private readonly pegaClient: PegaHttpClient,
    private readonly log: (msg: string) => void,
    private readonly config: OrchestratorConfig,
  ) {}

  /** Recursively fetch and analyze sub-sections, accumulating fields. */
  async discover(
    ruleType: string,
    sectionNames: string[],
    depth: number,
    visited: Set<string>,
    allFields: FieldDescriptor[],
    startTime: number,
  ): Promise<void> {
    if (depth > this.config.maxDepth) return;

    // Circuit breaker: >20 sections at one level → stop (TDD §5.3)
    if (sectionNames.length > this.config.circuitBreakerThreshold) {
      this.log(`[Schema] ⚡ Circuit breaker: ${sectionNames.length} sections at depth ${depth} for ${ruleType}`);
      return;
    }

    for (const sectionName of sectionNames) {
      if (visited.has(sectionName)) continue;
      visited.add(sectionName);

      checkTotalTimeout(startTime, this.config.totalTimeoutMs, ruleType);

      const sectionJson = await this.fetchSection(sectionName);
      if (!sectionJson) continue;

      try {
        const result: SchemaAnalyzeResponse = await this.apiClient.analyze({
          harnessJson: sectionJson,
          ruleType,
          depth,
        });
        allFields.push(...result.fields);

        // Recurse into sub-sections
        if (result.sub_sections.length > 0) {
          await this.discover(
            ruleType, result.sub_sections, depth + 1, visited, allFields, startTime,
          );
        }
      } catch (err: any) {
        this.log(`[Schema] ⚠️ Section ${sectionName} analysis failed: ${err.message}`);
      }
    }
  }

  /** Fetch section JSON from Pega server. */
  private async fetchSection(sectionName: string): Promise<Record<string, unknown> | null> {
    try {
      const result = await this.pegaClient.queryRuleByTriple(
        'Rule-HTML-Section', '@baseclass', sectionName,
      );
      return result || null;
    } catch {
      return null;
    }
  }
}
