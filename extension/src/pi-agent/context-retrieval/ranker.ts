import type { RankedSymbol, SearchCandidate } from './types';

const KIND_WEIGHTS: Record<string, number> = {
  class: 1.5,
  interface: 1.4,
  function: 1.3,
  method: 1.2,
};

const MAX_TERMS = 8;

export class Ranker {
  rankSymbols(candidates: SearchCandidate[], query: string): RankedSymbol[] {
    const terms = extractTerms(query);
    const seen = new Set<string>();
    const scored: RankedSymbol[] = [];
    for (const candidate of candidates ?? []) {
      const key = `${candidate.filePath}::${candidate.name}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      scored.push({ ...candidate, score: this.score(candidate, terms), rank: 0 });
    }
    scored.sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath));
    scored.forEach((symbol, index) => (symbol.rank = index + 1));
    return scored;
  }

  private score(candidate: SearchCandidate, terms: string[]): number {
    const name = candidate.name.toLowerCase();
    const filePath = candidate.filePath.toLowerCase();
    const doc = (candidate.docComment ?? '').toLowerCase();
    let score = KIND_WEIGHTS[candidate.kind.toLowerCase()] ?? 1.0;
    for (const term of terms) {
      if (name.includes(term)) score += 3;
      if (filePath.includes(term)) score += 2;
      if (doc.includes(term)) score += 1;
    }
    if (candidate.signature) score += 0.2;
    return score;
  }
}

function extractTerms(query: string): string[] {
  return (query ?? '')
    .toLowerCase()
    .split(/[^a-z0-9_.]+/)
    .filter((term) => term.length > 1)
    .slice(0, MAX_TERMS);
}
