/**
 * SA4E-107: Code Enrichment types and payload schemas.
 * Defines interfaces for LLM enrichment of source code symbols.
 */

import { z } from 'zod';

/** Valid tag categories for LLM-generated tags. */
export const VALID_TAG_CATEGORIES = [
  'design-pattern',
  'responsibility',
  'domain',
  'complexity',
  'dependency',
] as const;

export type TagCategory = typeof VALID_TAG_CATEGORIES[number];

/** Enrichment strategy per symbol kind. */
export type EnrichmentStrategy =
  | 'CLASS_SUMMARY'
  | 'FUNCTION_SUMMARY'
  | 'TAG_EXTRACTION'
  | 'PEGA_SUMMARY'
  // Salesforce declarative metadata (fields, objects, LWC/Aura components, flows,
  // properties). These have no code body — summary is grounded on name + signature
  // + parent + file path. No pseudo code (they are declarations, not logic).
  | 'METADATA_SUMMARY';

/** Context assembled for LLM prompt generation. */
export interface SymbolContext {
  name: string;
  kind: string;
  signature: string | null;
  docComment: string | null;
  /** Truncated to 4000 tokens before sending to LLM. */
  bodyText: string | null;
  /** Child members for classes/interfaces. */
  childMembers: string[] | null;
  /** Existing pseudo code for Pega rules. */
  existingPseudoCode: string | null;
  pegaClass?: string;
  pegaRuleset?: string;
  /** Enriched schema context (describes important fields for this rule type). */
  schemaContext?: string;
  /** Parent symbol name (e.g. owning object for a field). */
  parentSymbol?: string;
  /** Relative file path — grounds metadata summaries (component/field/object type). */
  filePath?: string;
}

/** Payload stored in pending_tasks for CODE_ENRICHMENT tasks. */
export const CodeEnrichmentPayloadSchema = z.object({
  symbolId: z.number(),
  symbolName: z.string(),
  symbolKind: z.string(),
  projectId: z.string(),
  filePath: z.string(),
  workspaceType: z.enum(['pega', 'standard']).default('standard'),
  pegaClass: z.string().optional(),
  pegaRuleset: z.string().optional(),
});

export type CodeEnrichmentPayload = z.infer<typeof CodeEnrichmentPayloadSchema>;

/** Expected JSON response structure from LLM. */
export interface CodeEnrichmentLLMResponse {
  summary: string;
  pseudo_code?: string;
  tags?: string[];
  /** SA4E-338 Task F: mapReduceReport always present in response/meta (BR-13). */
  mapReduceReport?: MapReduceReport;
}

/** Enrichment status values stored in symbols table. */
export type EnrichmentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'budget_error';

/** Map-reduce report persisted in symbols.enrichment_meta (BR-13). */
export interface MapReduceReport {
  trigger: 'proactive_over_budget' | 'context_length_error';
  strategy: string;
  chunks: Array<{ section: string; tokens: number; status: 'ok' | 'failed'; attempts: number }>;
  reduceRounds: number;
  chunksCompacted: number;
  tokensFreed: number;
  pinnedLogicIntact: boolean;
  boundsHit?: { chunksTried?: number; roundsTried?: number };
  budgetError?: { message: string; context: Record<string, unknown> };
}

/** Enrichment metadata stored in symbols.enrichment_meta (OI-02). */
export interface EnrichmentMeta {
  digestSource?: string;
  ruleClass?: string;
  window?: { tokens: number; source: string; model: string };
  budgetCheck?: { digestTokens: number; overheadTokens: number; inputBudget: number; withinBudget: boolean; utilization: number };
  schemaContextPresent?: boolean;
  mapReduceReport?: MapReduceReport;
  schemaContext?: Record<string, unknown>;
  truncatedAt?: string | null;
}
