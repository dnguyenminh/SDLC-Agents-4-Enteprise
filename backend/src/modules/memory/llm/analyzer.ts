/**
 * TagAnalyzerService — SA4E-47
 * LLM-based automatic tag assignment + expanded extraction for KB entries.
 * Supports context chain, chunking, and enhanced JSON parsing.
 */

import type { LLMMessage, ContextChainInput } from './types.js';
import { safeParseStructuredMap } from './types.js';
import { LLMService } from './LLMService.js';
import type { Logger } from 'pino';
import { SYSTEM_PROMPT, DEFAULT_TAXONOMY, KNOWN_KEYWORDS } from './prompts.js';
import type { TaskWorkerConfig } from '../task-queue/TaskWorkerConfig.js';

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
      const normalized = this.normalizeTags(llmResult.suggestions);
      return this.applyThresholdWithExtended(normalized, threshold, autoApply, llmResult);
    } catch (err) {
      this.logger?.warn({ err, component: 'TagAnalyzerService' }, 'LLM analysis failed, using fallback');
      return this.fallbackWithExtended(content, threshold);
    }
  }

  // ── LLM Communication ──

  private async analyzeWithLLM(
    content: string,
    options?: TagAnalyzeOptions,
    context?: ContextChainInput | null,
  ): Promise<{ suggestions: TagSuggestion[]; summary: string; business_entities: string[]; actors: string[]; business_rules: string[] }> {
    const userPrompt = this.buildContextPrompt(context, content);
    const messages: LLMMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];
    const timeoutMs = this.workerConfig?.llmTimeout ?? 30000;
    const response = await Promise.race([
      this.llmService.complete(messages),
      this.timeout(timeoutMs),
    ]);
    return this.parseEnhancedResponse(response.content);
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

  // ── Response Parsing ──

  parseEnhancedResponse(llmOutput: string): {
    suggestions: TagSuggestion[];
    summary: string;
    business_entities: string[];
    actors: string[];
    business_rules: string[];
  } {
    const defaults = { suggestions: [] as TagSuggestion[], summary: '',
      business_entities: [] as string[], actors: [] as string[], business_rules: [] as string[] };
    if (!llmOutput || llmOutput.trim().length === 0) return defaults;

    const jsonMatch = llmOutput.match(/\{[\s\S]*"tags"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const suggestions = (parsed.tags || parsed.suggestions || [])
          .filter((t: any) => t.tag && t.confidence !== undefined)
          .map((t: any) => ({
            tag: String(t.tag).toLowerCase().trim().replace(/\s+/g, '-'),
            category: String(t.category || 'feature'),
            confidence: Number(t.confidence),
            reason: String(t.reason || ''),
          }))
          .filter((t: TagSuggestion) => t.tag.length >= 3 && t.tag.length <= 50);
        return {
          suggestions,
          summary: String(parsed.summary || '').slice(0, 500),
          business_entities: (parsed.business_entities || [])
            .filter((e: any) => typeof e === 'string' && e.length <= 100).slice(0, 5),
          actors: (parsed.actors || [])
            .filter((a: any) => typeof a === 'string' && a.length <= 100).slice(0, 5),
          business_rules: (parsed.business_rules || [])
            .filter((r: any) => typeof r === 'string' && r.length <= 300).slice(0, 10),
        };
      } catch { /* fall through to regex */ }
    }

    const tagPattern = /["']([a-z][a-z0-9-]{4,40}[a-z0-9])["']/g;
    const found: string[] = [];
    let m;
    while ((m = tagPattern.exec(llmOutput)) !== null) {
      const tag = m[1];
      if (tag.includes('-') && !['let-me', 'wait-the', 'so-maybe', 'that-s'].includes(tag)) {
        found.push(tag);
      }
    }
    return { ...defaults, suggestions: [...new Set(found)].slice(-3).map(tag => ({
      tag, category: 'feature', confidence: 0.85, reason: 'extracted from reasoning',
    })) };
  }

  // ── Tag Normalization (map LLM tags to taxonomy) ──

  private normalizeTags(suggestions: TagSuggestion[]): TagSuggestion[] {
    return suggestions.map(s => {
      if (this.allValidTags.has(s.tag)) return s;
      const keywordMatch = KNOWN_KEYWORDS[s.tag] ?? KNOWN_KEYWORDS[s.tag.replace(/-/g, ' ')];
      if (keywordMatch) return { ...s, tag: keywordMatch };
      for (const validTag of this.allValidTags) {
        if (s.tag.includes(validTag) || validTag.includes(s.tag)) {
          return { ...s, tag: validTag, confidence: Math.min(s.confidence, 0.7) };
        }
      }
      return { ...s, confidence: Math.min(s.confidence, 0.3) };
    }).filter(s => {
      if (this.allValidTags.has(s.tag)) return true;
      return s.confidence >= 0.6;
    });
  }

  // ── Threshold & Fallback ──

  private applyThresholdWithExtended(
    suggestions: TagSuggestion[],
    threshold: number,
    autoApply: boolean,
    extended?: { summary: string; business_entities: string[]; actors: string[]; business_rules: string[] },
  ): TagAnalysisResult {
    const applied = autoApply ? suggestions.filter(t => t.confidence >= threshold) : [];
    const suggested = suggestions.filter(t => t.confidence < threshold);
    return {
      appliedTags: applied.map(t => t.tag).slice(0, 6),
      suggestedTags: suggested,
      fallbackUsed: false,
      summary: extended?.summary ?? '',
      business_entities: extended?.business_entities ?? [],
      actors: extended?.actors ?? [],
      business_rules: extended?.business_rules ?? [],
    };
  }

  private fallbackWithExtended(content: string, _threshold: number): TagAnalysisResult {
    const base = this.fallbackKeywordExtraction(content, _threshold);
    return { ...base, summary: '', business_entities: [], actors: [], business_rules: [] };
  }

  // ── Chunking ──

  chunkContent(
    content: string,
    chunkSize = 6000,
    overlap = 200,
  ): { chunks: string[]; totalChunks: number } {
    if (content.length <= chunkSize) {
      return { chunks: [content], totalChunks: 1 };
    }
    // Clamp overlap to prevent excessive/infinite loops when overlap >= chunkSize
    // Minimum step of 20% chunkSize ensures reasonable chunk count
    const maxOverlap = Math.max(Math.floor(chunkSize * 0.8), 1);
    const safeOverlap = Math.min(overlap, maxOverlap);
    const chunks: string[] = [];
    let start = 0;
    while (start < content.length) {
      const end = Math.min(start + chunkSize, content.length);
      chunks.push(content.slice(start, end));
      start = end - safeOverlap;
      if (start >= content.length - safeOverlap) break;
    }
    return { chunks, totalChunks: chunks.length };
  }

  async analyzeWithChunking(
    content: string,
    context?: ContextChainInput | null,
    chunkSize?: number,
    overlap?: number,
  ): Promise<TagAnalysisResult> {
    const { chunks } = this.chunkContent(content, chunkSize, overlap);
    this.logger?.info({ totalChunks: chunks.length, chunkSize, component: 'TagAnalyzerService' },
      'Chunking activated');
    const results: TagAnalysisResult[] = [];
    for (const chunk of chunks) {
      try {
        const ctx = results.length === 0 ? context : null;
        const llmResult = await this.analyzeWithLLM(chunk, undefined, ctx);
        const normalized = this.normalizeTags(llmResult.suggestions);
        results.push(this.applyThresholdWithExtended(normalized, 0.7, true, llmResult));
      } catch (err) {
        this.logger?.warn({ err, chunkIdx: results.length, component: 'TagAnalyzerService' }, 'Chunk LLM failed, using fallback');
        results.push({ ...this.fallbackKeywordExtraction(chunk, 0.7), summary: '', business_entities: [], actors: [], business_rules: [] });
      }
    }
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

  // ── Helpers ──

  private fallbackKeywordExtraction(content: string, _threshold: number): TagAnalysisResult {
    const lower = content.toLowerCase();
    const found: string[] = [];
    for (const [keyword, tag] of Object.entries(KNOWN_KEYWORDS)) {
      if (lower.includes(keyword) && !found.includes(tag)) found.push(tag);
    }
    if (lower.startsWith('decision:') || lower.includes('we decided')) {
      if (!found.includes('decision')) found.push('decision');
    }
    if (lower.includes('error') || lower.includes('bug') || lower.includes('fix')) {
      if (!found.includes('error-pattern')) found.push('error-pattern');
    }
    return { appliedTags: found.slice(0, 6), suggestedTags: [],
      fallbackUsed: true, summary: '', business_entities: [], actors: [], business_rules: [] };
  }

  private filterTaxonomy(categories?: string[]): Record<string, string[]> {
    if (!categories || categories.length === 0) return this.taxonomy;
    const filtered: Record<string, string[]> = {};
    for (const cat of categories) {
      if (this.taxonomy[cat]) filtered[cat] = this.taxonomy[cat];
    }
    return Object.keys(filtered).length > 0 ? filtered : this.taxonomy;
  }

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error('LLM timeout')), ms));
  }
}

export { safeParseStructuredMap };
