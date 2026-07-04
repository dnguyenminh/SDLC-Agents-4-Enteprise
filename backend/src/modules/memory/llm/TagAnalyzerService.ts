/**
 * TagAnalyzerService — LLM-based automatic tag assignment for KB entries.
 * Called internally during mem_ingest pipeline (NOT an MCP tool).
 * Zero context token cost for agents.
 */

import type { LLMMessage } from './types.js';
import { LLMService } from './LLMService.js';
import type { Logger } from 'pino';

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
}

export interface TagAnalyzeOptions {
  taxonomyCategories?: string[];
  threshold?: number;
  autoApply?: boolean;
}

const DEFAULT_TAXONOMY: Record<string, string[]> = {
  'business-domain': [
    'authentication', 'payment', 'notification', 'reporting',
    'user-management', 'scheduling', 'integration', 'messaging',
    'configuration', 'admin-portal', 'knowledge-base', 'search',
  ],
  'technical': [
    'architecture', 'api-design', 'database', 'security',
    'performance', 'testing', 'caching', 'logging', 'monitoring',
    'mcp', 'llm', 'embedding', 'onnx', 'vector-search', 'graph',
    'websocket', 'sse', 'streaming', 'docker', 'ci-cd',
  ],
  'sdlc-phase': [
    'requirements', 'design', 'implementation', 'testing', 'deployment',
    'code-review', 'documentation', 'planning', 'retrospective',
  ],
  'document-type': [
    'decision', 'error-pattern', 'procedure', 'architecture-note',
    'meeting-note', 'tutorial', 'configuration', 'bugfix',
    'feature-spec', 'api-contract', 'user-guide', 'release-note',
  ],
  'agent-workflow': [
    'multi-agent', 'orchestration', 'pipeline', 'tool-call',
    'prompt-engineering', 'context-management', 'memory-kb',
    'jira', 'workflow', 'state-machine', 'transition',
  ],
  'code-pattern': [
    'refactoring', 'design-pattern', 'anti-pattern', 'migration',
    'dependency', 'module-structure', 'interface-design',
    'error-handling', 'validation', 'serialization',
  ],
  'priority': ['critical', 'high', 'medium', 'low'],
};

const KNOWN_KEYWORDS: Record<string, string> = {
  'auth': 'authentication', 'jwt': 'authentication', 'oauth': 'authentication',
  'login': 'authentication', 'session': 'authentication', 'token': 'authentication',
  'payment': 'payment', 'billing': 'payment', 'invoice': 'payment',
  'api': 'api-design', 'rest': 'api-design', 'graphql': 'api-design', 'endpoint': 'api-design',
  'database': 'database', 'sql': 'database', 'migration': 'database', 'sqlite': 'database',
  'cache': 'caching', 'redis': 'caching', 'memcached': 'caching',
  'security': 'security', 'vulnerability': 'security', 'xss': 'security',
  'test': 'testing', 'unit test': 'testing', 'integration test': 'testing', 'e2e': 'testing',
  'deploy': 'deployment', 'ci/cd': 'ci-cd', 'docker': 'docker', 'pipeline': 'pipeline',
  'performance': 'performance', 'latency': 'performance', 'throughput': 'performance',
  'mcp': 'mcp', 'model context protocol': 'mcp', 'tool call': 'tool-call',
  'llm': 'llm', 'embedding': 'embedding', 'vector': 'vector-search',
  'jira': 'jira', 'ticket': 'jira', 'sprint': 'planning',
  'agent': 'multi-agent', 'orchestrat': 'orchestration', 'workflow': 'workflow',
  'langgraph': 'orchestration', 'state machine': 'state-machine',
  'architecture': 'architecture', 'design pattern': 'design-pattern',
  'refactor': 'refactoring', 'bug': 'error-pattern', 'fix': 'bugfix',
  'config': 'configuration', 'setting': 'configuration',
};

const SYSTEM_PROMPT = `You tag knowledge entries with SPECIFIC feature names. Output ONLY JSON.

WRONG (too generic): "testing", "api-design", "configuration", "architecture", "llm", "bugfix"
RIGHT (specific features): "admin-panel-routing-fix", "llm-config-ui-dropdown", "kb-entry-auto-tagging", "jira-ticket-comment-sync"

Examples:
Content: "Fixed admin page routing where sidebar items show wrong page"
Output: {"tags":[{"tag":"admin-panel-page-routing","category":"feature","confidence":0.95,"reason":"fixes page navigation bug"}]}

Content: "Added provider dropdown and model selector to LLM configuration page"
Output: {"tags":[{"tag":"llm-config-ui","category":"feature","confidence":0.9,"reason":"new UI for LLM settings"},{"tag":"admin-portal-settings","category":"component","confidence":0.85,"reason":"part of admin portal"}]}

Content: "User asked about how ingest pipeline uses LLM for tag analysis"
Output: {"tags":[{"tag":"kb-llm-tag-analysis","category":"feature","confidence":0.9,"reason":"about auto-tagging feature"}]}

Rules: max 3 tags, lowercase-hyphenated, 3-6 words each, confidence 0-1. Return ONLY {"tags":[...]}`;

export class TagAnalyzerService {
  private llmService: LLMService;
  private taxonomy: Record<string, string[]>;
  private allValidTags: Set<string>;
  private logger?: Logger;

  constructor(llmService: LLMService, logger?: Logger) {
    this.llmService = llmService;
    this.taxonomy = DEFAULT_TAXONOMY;
    this.allValidTags = new Set(
      Object.values(this.taxonomy).flat()
    );
    this.logger = logger;
  }

  async analyzeTags(
    content: string,
    options?: TagAnalyzeOptions
  ): Promise<TagAnalysisResult> {
    if (!content || content.trim().length < 10) {
      return { appliedTags: [], suggestedTags: [], fallbackUsed: false };
    }

    const threshold = options?.threshold ?? 0.7;
    const autoApply = options?.autoApply ?? true;

    try {
      const result = await this.analyzeWithLLM(content, options);
      return this.applyThreshold(result, threshold, autoApply);
    } catch (err) {
      this.logger?.warn({ err }, 'LLM tag analysis failed, using fallback');
      return this.fallbackKeywordExtraction(content, threshold);
    }
  }

  private async analyzeWithLLM(
    content: string,
    options?: TagAnalyzeOptions
  ): Promise<TagSuggestion[]> {
    const truncatedContent = content.slice(0, 2000);

    const userPrompt = `/no_think\nTag this:\n${truncatedContent}`;
    const messages: LLMMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    const response = await Promise.race([
      this.llmService.complete(messages),
      this.timeout(30000),
    ]);

    return this.parseResponse(response.content);
  }

  private parseResponse(llmOutput: string): TagSuggestion[] {
    if (!llmOutput || llmOutput.trim().length === 0) return [];

    // Try JSON first
    const jsonMatch = llmOutput.match(/\{[\s\S]*"tags"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const tags = parsed.tags || parsed.suggestions || [];
        return tags
          .filter((t: any) => t.tag && t.confidence !== undefined)
          .map((t: any) => ({
            tag: String(t.tag).toLowerCase().trim().replace(/\s+/g, '-'),
            category: String(t.category || 'feature'),
            confidence: Number(t.confidence),
            reason: String(t.reason || ''),
          }))
          .filter((t: TagSuggestion) => t.tag.length >= 3 && t.tag.length <= 50);
      } catch { /* fall through to regex extraction */ }
    }

    // Fallback: extract hyphenated tag patterns from reasoning/thinking text
    const tagPattern = /["']([a-z][a-z0-9-]{4,40}[a-z0-9])["']/g;
    const found: string[] = [];
    let m;
    while ((m = tagPattern.exec(llmOutput)) !== null) {
      const tag = m[1];
      if (tag.includes('-') && !['let-me', 'wait-the', 'so-maybe', 'that-s'].includes(tag)) {
        found.push(tag);
      }
    }
    // Deduplicate and take last 3 (final thinking = best answer)
    const unique = [...new Set(found)].slice(-3);
    return unique.map(tag => ({
      tag, category: 'feature', confidence: 0.85, reason: 'extracted from reasoning',
    }));
  }

  private applyThreshold(
    suggestions: TagSuggestion[],
    threshold: number,
    autoApply: boolean
  ): TagAnalysisResult {
    const applied = autoApply
      ? suggestions.filter(t => t.confidence >= threshold)
      : [];
    const suggested = suggestions.filter(t => t.confidence < threshold);

    return {
      appliedTags: applied.map(t => t.tag).slice(0, 6),
      suggestedTags: suggested,
      fallbackUsed: false,
    };
  }

  private fallbackKeywordExtraction(
    content: string,
    _threshold: number
  ): TagAnalysisResult {
    const lower = content.toLowerCase();
    const found: string[] = [];

    for (const [keyword, tag] of Object.entries(KNOWN_KEYWORDS)) {
      if (lower.includes(keyword) && !found.includes(tag)) {
        found.push(tag);
      }
    }

    if (lower.startsWith('decision:') || lower.includes('we decided')) {
      if (!found.includes('decision')) found.push('decision');
    }
    if (lower.includes('error') || lower.includes('bug') || lower.includes('fix')) {
      if (!found.includes('error-pattern')) found.push('error-pattern');
    }

    return {
      appliedTags: found.slice(0, 6),
      suggestedTags: [],
      fallbackUsed: true,
    };
  }

  private filterTaxonomy(
    categories?: string[]
  ): Record<string, string[]> {
    if (!categories || categories.length === 0) return this.taxonomy;
    const filtered: Record<string, string[]> = {};
    for (const cat of categories) {
      if (this.taxonomy[cat]) filtered[cat] = this.taxonomy[cat];
    }
    return Object.keys(filtered).length > 0 ? filtered : this.taxonomy;
  }

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error('LLM timeout')), ms)
    );
  }
}
