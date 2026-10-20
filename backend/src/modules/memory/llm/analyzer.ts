/**
 * TagAnalyzerService (facade) — SA4E-47
 * LLM-based automatic tag assignment + expanded extraction for KB entries.
 * Supports context chain, chunking, and enhanced JSON parsing.
 *
 * Implementation submodules (same directory):
 * - analyzer-helpers.ts — response parsing, normalization, fallback, chunking
 */

import type { LLMMessage, ContextChainInput } from './types.js';
import { safeParseStructuredMap } from './types.js';
import { LLMService } from './LLMService.js';
import type { Logger } from 'pino';
import { SYSTEM_PROMPT, DEFAULT_TAXONOMY } from './prompts.js';
import type { TaskWorkerConfig } from '../task-queue/TaskWorkerConfig.js';
import {
  parseEnhancedLlmResponse, normalizeTagSuggestions,
  applyThresholdWithExtended, fallbackKeywordExtraction,
  chunkContent, llmTimeout,
} from './analyzer-helpers.js';

export interface TagSuggestion {
  tag: string;
  category: string;
  confidence: number;
  reason: string;
}

export interface TagAnalysisResult {
  appliedTags: string[];
  suggestedTags: TagSuggestion[];
  fallbackUsed: boolean;
  /** SA4E-155: Error message when fallback was triggered by LLM failure */
  fallbackReason?: string;
  /** SA4E-47: 1-3 sentence summary (max 500 chars) */
  summary: string;
  /** SA4E-47: Extracted business entities (max 5) */
  business_entities: string[];
  /** SA4E-47: Extracted actors/roles (max 5) */
  actors: string[];
  /** SA4E-47: Extracted business rules (max 10) */
  business_rules: string[];
}

export interface TagAnalyzeOptions {
  taxonomyCategories?: string[];
  threshold?: number;
  autoApply?: boolean;
}

export class TagAnalyzerService {
  private llmService: LLMService;
  private taxonomy: Record<string, string[]>;
  private allValidTags: Set<string>;
  private logger?: Logger;
  private workerConfig?: TaskWorkerConfig;

  constructor(llmService: LLMService, logger?: Logger, workerConfig?: TaskWorkerConfig) {
    this.llmService = llmService;
    this.taxonomy = DEFAULT_TAXONOMY;
    this.allValidTags = new Set(Object.values(this.taxonomy).flat());
    this.logger = logger;
    this.workerConfig = workerConfig;
  }

  // ── Public API ──

  async analyzeTags(
    content: string,
    options?: TagAnalyzeOptions,
    context?: ContextChainInput | null,
  ): Promise<TagAnalysisResult> {
    if (!content || content.trim().length < 10) {
      return { appliedTags: [], suggestedTags: [], fallbackUsed: false,
        summary: '', business_entities: [], actors: [], business_rules: [] };
    }
    const threshold = options?.threshold ?? 0.7;
    const autoApply = options?.autoApply ?? true;
    try {
      const maxTokens = this.llmService.getConfig().maxTokens ?? 2048;
      const estimatedTokens = Math.ceil(content.length / 3);
      const chunkSize = this.workerConfig?.llmChunkSize ?? 6000;
      if (estimatedTokens > maxTokens && content.length > chunkSize) {
        return this.analyzeWithChunking(content, context ?? null,
          this.workerConfig?.llmChunkSize ?? 6000,
          this.workerConfig?.llmChunkOverlap ?? 200);
      }
      const llmResult = await this.analyzeWithLLM(content, options, context ?? null);
      const normalized = normalizeTagSuggestions(llmResult.suggestions, this.allValidTags);
      return applyThresholdWithExtended(normalized, threshold, autoApply, llmResult);
    } catch (err) {
      this.logger?.warn({ err, component: 'TagAnalyzerService' }, 'LLM analysis failed, using fallback');
      const fallback = fallbackKeywordExtraction(content, threshold);
      fallback.fallbackReason = err instanceof Error ? err.message : String(err);
      return fallback;
    }
  }

  // ── LLM Communication ──

  private async analyzeWithLLM(
    content: string,
    options?: TagAnalyzeOptions,
    context?: ContextChainInput | null,
  ): Promise<{ suggestions: TagSuggestion[]; summary: string; business_entities: string[]; actors: string[]; business_rules: string[] }> {
    void options;
    const userPrompt = this.buildContextPrompt(context, content);
    const messages: LLMMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];
    const timeoutMs = this.workerConfig?.llmTimeout ?? 30000;
    this.logger?.info({ contentLen: content.length, timeoutMs, model: this.llmService.getConfig().model },
      '[TagAnalyzer] Calling LLM...');
    const response = await Promise.race([
      this.llmService.complete(messages),
      llmTimeout(timeoutMs),
    ]);
    this.logger?.info({ responseLen: response.content.length }, '[TagAnalyzer] LLM responded');
    return parseEnhancedLlmResponse(response.content, this.logger);
  }

  // ── Context Prompt Builder ──

  buildContextPrompt(context?: ContextChainInput | null, content?: string): string {
    if (!context) return `/no_think\n\n${content}`;
    const contextBlock = `[Previous section context]\nSummary: ${context.summary || ''}`
      + (context.business_entities?.length ? `\nBusiness entities: ${context.business_entities.join(', ')}` : '')
      + (context.actors?.length ? `\nActors: ${context.actors.join(', ')}` : '')
      + (context.business_rules?.length ? `\nBusiness rules: ${context.business_rules.slice(0, 3).join('; ')}` : '');
    return `/no_think\n\n${contextBlock}\n\n---\n\n${content}`;
  }

  // ── Response Parsing / Chunking (public, delegate to helpers) ──

  parseEnhancedResponse(llmOutput: string): {
    suggestions: TagSuggestion[];
    summary: string;
    business_entities: string[];
    actors: string[];
    business_rules: string[];
  } {
    return parseEnhancedLlmResponse(llmOutput, this.logger);
  }

  chunkContent(
    content: string,
    chunkSize = 6000,
    overlap = 200,
  ): { chunks: string[]; totalChunks: number } {
    return chunkContent(content, chunkSize, overlap);
  }

  async analyzeWithChunking(
    content: string,
    context?: ContextChainInput | null,
    chunkSize?: number,
    overlap?: number,
  ): Promise<TagAnalysisResult> {
    const { chunks } = chunkContent(content, chunkSize, overlap);
    this.logger?.info({ totalChunks: chunks.length, chunkSize, component: 'TagAnalyzerService' },
      'Chunking activated');
    const results: TagAnalysisResult[] = [];
    for (const chunk of chunks) {
      results.push(await this.analyzeOneChunk(chunk, context, results.length));
    }
    return mergeChunkResults(results);
  }

  /** Analyze a single chunk; falls back to keywords on LLM failure. */
  private async analyzeOneChunk(
    chunk: string, context: ContextChainInput | null | undefined, chunkIdx: number,
  ): Promise<TagAnalysisResult> {
    try {
      const ctx = chunkIdx === 0 ? context : null;
      const llmResult = await this.analyzeWithLLM(chunk, undefined, ctx);
      const normalized = normalizeTagSuggestions(llmResult.suggestions, this.allValidTags);
      return applyThresholdWithExtended(normalized, 0.7, true, llmResult);
    } catch (err) {
      this.logger?.warn({ err, chunkIdx, component: 'TagAnalyzerService' }, 'Chunk LLM failed, using fallback');
      return { ...fallbackKeywordExtraction(chunk, 0.7), summary: '', business_entities: [], actors: [], business_rules: [] };
    }
  }
}

/** Merge per-chunk results: union tags/entities, first-chunk summary wins. */
function mergeChunkResults(results: TagAnalysisResult[]): TagAnalysisResult {
  return {
    appliedTags: [...new Set(results.flatMap(r => r.appliedTags))].slice(0, 6),
    suggestedTags: results[0]?.suggestedTags ?? [],
    fallbackUsed: results.some(r => r.fallbackUsed),
    summary: results[0]?.summary ?? '',
    business_entities: [...new Set(results.flatMap(r => r.business_entities))].slice(0, 5),
    actors: [...new Set(results.flatMap(r => r.actors))].slice(0, 5),
    business_rules: [...new Set(results.flatMap(r => r.business_rules))].slice(0, 10),
  };
}

export { safeParseStructuredMap };
