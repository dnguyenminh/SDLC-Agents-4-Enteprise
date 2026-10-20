/**
 * Bigram text-similarity + relationship classification for ContradictionService.
 * Extracted (BR-18) — pure functions; no behavior change.
 */

export type Classification = 'CONTRADICTION' | 'SUPPLEMENT' | 'SUPERSEDE';

/** Bigram-based text similarity (Dice coefficient). */
export function textSimilarity(a: string, b: string): number {
  const bigramsA = getBigrams(a.toLowerCase());
  const bigramsB = getBigrams(b.toLowerCase());
  if (bigramsA.size === 0 || bigramsB.size === 0) return 0;

  let intersection = 0;
  for (const bigram of bigramsA) {
    if (bigramsB.has(bigram)) intersection++;
  }
  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

export function getBigrams(text: string): Set<string> {
  const words = text.split(/\s+/).filter(w => w.length > 2);
  const bigrams = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.add(`${words[i]} ${words[i + 1]}`);
  }
  return bigrams;
}

export function classifyRelationship(
  contentA: string, contentB: string, similarity: number,
): Classification {
  if (similarity > 0.95) return 'SUPERSEDE';
  if (contentB.length > contentA.length * 1.5) return 'SUPPLEMENT';
  if (contentA.length > contentB.length * 1.5) return 'SUPERSEDE';
  return 'CONTRADICTION';
}
