export type QueryIntent = 'LOCAL' | 'GLOBAL' | 'STRUCTURAL';

/** SEC-325-D4: hard cap on query length before classification/search — bounds
 * regex work on (future) LLM/tool-derived input and space-flooded pastes. */
export const MAX_QUERY_CHARS = 4096;

export interface IntentClassification {
  intent: QueryIntent;
  confidence: number;
}

const GLOBAL_PATTERNS: RegExp[] = [
  /\bexplain\s+(the\s+)?(architecture|codebase|repo|repository|project)\b/i,
  /\b(give|provide)\s+(me\s+)?(an?\s+)?overview\b/i,
  /\bsummarize\s+(the\s+)?(repo|repository|project|codebase)\b/i,
  /\bhow\s+does\s+(the\s+)?(system|project|application)\s+work\b/i,
  /\bdescribe\s+(the\s+)?(architecture|system|codebase|project)\b/i,
  /\bt\u00f4?ng\s+quan\b/i,
];

const STRUCTURAL_PATTERNS: RegExp[] = [
  /\bproject\s+structure\b/i,
  /\bdirectory\s+(tree|layout)\b/i,
  /\b(list|show)\s+(all\s+)?files\b/i,
  // SEC-325-D4: linear-safe bounded-lazy wildcard — was unbounded `.+` next to
  // `\s+` (quadratic backtracking on space-flooded input); the hard {1,1024}
  // bound keeps matching linear even before whitespace normalization.
  /\bwhere\s+is\s+.{1,1024}?\s+(defined|declared|implemented)\b/i,
  /\bwhat\s+(classes|modules|packages|components)\b/i,
  /\bc\u1ea5?u\s+tr\u00fac\b/i,
];

export class QueryRouter {
  // SEC-325-D4: bound query length + collapse whitespace runs before regex —
  // `\s+` then matches a single separator and backtracking stays linear.
  classify(query: string): IntentClassification {
    return classifyText(query);
  }
}

function classifyText(query: string): IntentClassification {
  const normalized = (query ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY_CHARS);
  if (normalized.length === 0) {
    return { intent: 'LOCAL', confidence: 0 };
  }
  for (const pattern of GLOBAL_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'GLOBAL', confidence: 1 };
  }
  for (const pattern of STRUCTURAL_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'STRUCTURAL', confidence: 1 };
  }
  return { intent: 'LOCAL', confidence: 0.5 };
}
