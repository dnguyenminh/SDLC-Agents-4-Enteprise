/**
 * PegaSchemaOrchestrator contracts (SA4E-214, TDD §5.2, §10.1).
 */

import type { EnrichedSchema } from '../../models/EnrichedSchema';

/** Interface for the schema orchestrator (TDD §5.2) */
export interface ISchemaOrchestrator {
  createSchema(ruleType: string): Promise<EnrichedSchema | null>;
  getSchema(ruleType: string): Promise<EnrichedSchema | null>;
  validateAndUpdate(ruleType: string, ruleJson: Record<string, unknown>): Promise<void>;
}

/** Config thresholds from extension settings (TDD §10.1) */
export interface OrchestratorConfig {
  maxDepth: number;
  circuitBreakerThreshold: number;
  totalTimeoutMs: number;
}

export const DEFAULT_CONFIG: OrchestratorConfig = {
  maxDepth: 5,
  circuitBreakerThreshold: 20,
  totalTimeoutMs: 60_000,
};
