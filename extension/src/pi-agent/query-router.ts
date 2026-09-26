export type QueryIntent = 'LOCAL' | 'GLOBAL' | 'STRUCTURAL';

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
  /\bwhere\s+is\s+.+\s+(defined|declared|implemented)\b/i,
  /\bwhat\s+(classes|modules|packages|components)\b/i,
  /\bc\u1ea5?u\s+tr\u00fac\b/i,
];

export class QueryRouter {
  classify(query: string): IntentClassification {
    const trimmed = (query ?? '').trim();
    if (trimmed.length === 0) {
      return { intent: 'LOCAL', confidence: 0 };
    }
    for (const pattern of GLOBAL_PATTERNS) {
      if (pattern.test(trimmed)) return { intent: 'GLOBAL', confidence: 1 };
    }
    for (const pattern of STRUCTURAL_PATTERNS) {
      if (pattern.test(trimmed)) return { intent: 'STRUCTURAL', confidence: 1 };
    }
    return { intent: 'LOCAL', confidence: 0.5 };
  }
}
