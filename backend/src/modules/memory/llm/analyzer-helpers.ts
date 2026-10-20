/**
 * TagAnalyzerService — pure helpers (SA4E-47).
 * Extracted from analyzer.ts: LLM response parsing, tag normalization,
 * threshold application, keyword fallback and content chunking.
 */

import type { Logger } from 'pino';
import { KNOWN_KEYWORDS } from './prompts.js';
import type { TagSuggestion, TagAnalysisResult } from './analyzer.js';

/** Parse the enhanced LLM JSON response; regex fallback extracts tags from prose. */
export function parseEnhancedLlmResponse(
  llmOutput: string,
  logger?: Logger,
): {
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
      return parseTagJson(JSON.parse(jsonMatch[0]));
    } catch (err) { logger?.debug({ err }, '[analyzer] LLM parse failed, falling through to regex'); }
  }
  return regexExtractSuggestions(llmOutput, defaults);
}

/** Map a parsed JSON payload to the enhanced response shape. */
function parseTagJson(parsed: any): {
  suggestions: TagSuggestion[]; summary: string;
  business_entities: string[]; actors: string[]; business_rules: string[];
} {
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
}

/** Last-resort regex extraction of kebab-case tokens from free text. */
function regexExtractSuggestions(
  llmOutput: string,
  defaults: { suggestions: TagSuggestion[]; summary: string; business_entities: string[]; actors: string[]; business_rules: string[] },
): { suggestions: TagSuggestion[]; summary: string; business_entities: string[]; actors: string[]; business_rules: string[] } {
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

/** Map LLM tags onto the known taxonomy (keyword + fuzzy matching). */
export function normalizeTagSuggestions(
  suggestions: TagSuggestion[],
  allValidTags: Set<string>,
): TagSuggestion[] {
  return suggestions.map(s => {
    if (allValidTags.has(s.tag)) return s;
    const keywordMatch = KNOWN_KEYWORDS[s.tag] ?? KNOWN_KEYWORDS[s.tag.replace(/-/g, ' ')];
    if (keywordMatch) return { ...s, tag: keywordMatch };
    // Fuzzy match: only consider valid tags ≥5 chars to avoid false positives
    // from short taxonomy entries (e.g. 'low' matching 'auth-flow-login')
    for (const validTag of allValidTags) {
      if (validTag.length < 5) continue;
      if (s.tag.includes(validTag) || validTag.includes(s.tag)) {
        return { ...s, tag: validTag, confidence: Math.min(s.confidence, 0.7) };
      }
    }
    // Unknown tags retain original confidence — LLM-assigned confidence is authoritative
    return s;
  });
}

/** Split suggestions into applied (>= threshold) vs suggested (< threshold). */
export function applyThresholdWithExtended(
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

/** Keyword-based fallback when the LLM is unavailable (deterministic). */
export function fallbackKeywordExtraction(content: string, _threshold: number): TagAnalysisResult {
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

/**
 * Split content into overlapping chunks.
 * Clamp overlap to prevent excessive/infinite loops when overlap >= chunkSize;
 * minimum step of 20% chunkSize ensures reasonable chunk count.
 */
export function chunkContent(
  content: string,
  chunkSize = 6000,
  overlap = 200,
): { chunks: string[]; totalChunks: number } {
  if (content.length <= chunkSize) {
    return { chunks: [content], totalChunks: 1 };
  }
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

/** Reject after `ms` milliseconds (LLM timeout guard). */
export function llmTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error('LLM timeout')), ms));
}
