/**
 * FuzzyFilter — Lightweight fuzzy matching for context menu items
 * KSA-252
 */

import type { FuzzyMatchResult } from './types';

export function fuzzyMatch(target: string, query: string): FuzzyMatchResult {
  if (!query) {
    return { match: true, score: 0, highlights: [] };
  }

  const targetLower = target.toLowerCase();
  const queryLower = query.toLowerCase();
  const highlights: number[] = [];
  let qi = 0;
  let score = 0;
  let consecutive = 0;

  for (let ti = 0; ti < targetLower.length && qi < queryLower.length; ti++) {
    if (targetLower[ti] === queryLower[qi]) {
      highlights.push(ti);
      qi++;
      consecutive++;
      score += consecutive * 2;
      // Prefix bonus: matching from the start
      if (ti === qi - 1) {
        score += 5;
      }
      // Word boundary bonus
      if (ti === 0 || target[ti - 1] === ' ' || target[ti - 1] === '/' || target[ti - 1] === '.') {
        score += 3;
      }
    } else {
      consecutive = 0;
    }
  }

  return {
    match: qi === queryLower.length,
    score,
    highlights,
  };
}

export function filterItems<T extends { label: string }>(
  items: T[],
  query: string
): (T & { score: number; highlights: number[] })[] {
  if (!query) {
    return items.map((item) => ({ ...item, score: 0, highlights: [] }));
  }

  const matched = items
    .map((item) => {
      const result = fuzzyMatch(item.label, query);
      return { item, score: result.score, highlights: result.highlights, match: result.match };
    })
    .filter((entry) => entry.match)
    .sort((a, b) => b.score - a.score);

  return matched.map((entry) => ({
    ...entry.item,
    score: entry.score,
    highlights: entry.highlights,
  }));
}
