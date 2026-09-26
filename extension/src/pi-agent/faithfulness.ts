export interface SourceCitation {
  path: string;
  line?: number;
  excerpt?: string;
}

export interface GradeResult {
  score: number;
  issues: string[];
}

export const GROUNDING_MIN_TOKEN_COVERAGE = 0.6;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'by', 'from', 'at', 'as',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'this', 'that', 'these', 'those', 'has', 'have',
  'had', 'not', 'no', 'can', 'could', 'will', 'would', 'should', 'may', 'might', 'you', 'we',
  'they', 'i', 'if', 'then', 'than', 'so', 'such', 'its',
]);

export function splitClaims(answer: string): string[] {
  return answer
    .split(/(?<=[.!?])\s+/)
    .map((claim) => claim.trim())
    .filter((claim) => claim.length > 0);
}

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function significantTokens(text: string): string[] {
  return tokenize(text).filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function sourceTokenSet(sources: SourceCitation[]): Set<string> {
  const text = sources.map((s) => `${s.path} ${s.excerpt ?? ''}`).join(' ');
  return new Set(tokenize(text));
}

function isClaimGrounded(claim: string, sourceTokens: Set<string>): boolean {
  const tokens = significantTokens(claim);
  if (tokens.length === 0) return true;
  const covered = tokens.filter((t) => sourceTokens.has(t)).length;
  return covered / tokens.length >= GROUNDING_MIN_TOKEN_COVERAGE;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Deterministic faithfulness rubric (OI-328-01):
 * score = grounded claims / total claims, grounded when >=60% of
 * significant tokens appear in the cited sources.
 */
export function computeFaithfulness(answer: string, sources: SourceCitation[]): GradeResult {
  const claims = splitClaims(answer);
  if (claims.length === 0) return { score: 0, issues: ['Empty answer'] };
  const sourceTokens = sourceTokenSet(sources);
  const issues: string[] = [];
  for (const claim of claims) {
    if (!isClaimGrounded(claim, sourceTokens)) {
      issues.push(`Ungrounded claim: ${claim.slice(0, 80)}`);
    }
  }
  return { score: round2((claims.length - issues.length) / claims.length), issues };
}
