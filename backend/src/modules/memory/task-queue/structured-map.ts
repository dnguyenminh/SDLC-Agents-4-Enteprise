/**
 * structured_map construction for enrichment tasks — extracted from TaskWorker.
 * Shared by the LLM tag-enrichment path (SA4E-47) and its conditional variant.
 */
import type { TagAnalysisResult } from '../llm/analyzer.js';
import type { ContextChainInput, StructuredMapData } from '../llm/types.js';
import type { TaskWorkerConfig } from './TaskWorkerConfig.js';
import type { LlmServiceLike } from './worker-context.js';

/**
 * Build the structured_map payload from an LLM tag-analysis result merged with
 * the entry's existing map. Pure — persistence is handled by the callers.
 */
export function buildStructuredMap(
  result: TagAnalysisResult,
  existing: StructuredMapData,
  context: ContextChainInput | null | undefined,
  config: TaskWorkerConfig,
  llmService?: LlmServiceLike,
): StructuredMapData {
  return {
    tags: result.appliedTags,
    summary: result.summary || existing.summary || '',
    business_entities: result.business_entities || [],
    actors: result.actors || [],
    business_rules: result.business_rules || [],
    fileCreatedAt: existing.fileCreatedAt,
    fileAuthor: existing.fileAuthor,
    fileVersion: existing.fileVersion,
    context_chain: context ? {
      previous_section_id: context.previous_section_id,
      previous_summary: context.summary,
    } : undefined,
    extraction_meta: {
      model: llmService?.getConfig()?.model || 'unknown',
      timestamp: new Date().toISOString(),
      fallback_used: result.fallbackUsed,
      context_chain_enabled: config.enableContextChain,
    },
  };
}
