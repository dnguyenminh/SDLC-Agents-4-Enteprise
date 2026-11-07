/**
 * SA4E-85 — Pruning Algorithm (Task 6.3).
 * Pure function implementing context file pruning logic.
 * Sort by: (age*0.4 + size*0.3 + (1-relevance)*0.3) * importance
 * Collect files until freed >= threshold (tokenCount - maxTokens*0.7).
 */

/** Context file data used for pruning calculations */
export interface PrunableFile {
  filePath: string;
  tokenCount: number;
  pinnedAt: number;
  relevanceScore: number;
  importanceScore: number; // 0-1: P0=1.0 (never cut), P3=0.1 (cut first)
}

/** Result of pruning calculation for a single file */
export interface PruneCandidate {
  filePath: string;
  tokensSaved: number;
  score: number;
}

/** Weight constants for pruning score factors */
const WEIGHT_AGE = 0.4;
const WEIGHT_SIZE = 0.3;
const WEIGHT_RELEVANCE = 0.3;

/** Target usage after pruning: 70% of max capacity */
const TARGET_USAGE_RATIO = 0.7;

/**
 * Compute normalized age score (0-1) for a file.
 * Older files score higher (more likely to be pruned).
 * @param pinnedAt - Timestamp when file was pinned
 * @param now - Current timestamp
 * @param maxAge - Maximum age range for normalization
 */
function computeAgeScore(pinnedAt: number, now: number, maxAge: number): number {
  if (maxAge <= 0) return 0;
  const age = now - pinnedAt;
  return Math.min(age / maxAge, 1);
}

/**
 * Compute normalized size score (0-1) for a file.
 * Larger files score higher (freeing them saves more tokens).
 * @param tokenCount - Token count for this file
 * @param maxTokens - Maximum token count across all files
 */
function computeSizeScore(tokenCount: number, maxTokens: number): number {
  if (maxTokens <= 0) return 0;
  return Math.min(tokenCount / maxTokens, 1);
}

/**
 * Compute composite pruning score for a single file.
 * Higher score = more likely to be pruned.
 * Formula: age*0.4 + size*0.3 + (1-relevance)*0.3
 */
function computePruneScore(
  ageScore: number,
  sizeScore: number,
  relevanceScore: number,
  importanceScore: number
): number {
  const invertedRelevance = 1 - Math.max(0, Math.min(1, relevanceScore));
  return (WEIGHT_AGE * ageScore + WEIGHT_SIZE * sizeScore + WEIGHT_RELEVANCE * invertedRelevance) * importanceScore;
}

/**
 * Calculate how many tokens must be freed to reach target usage.
 * Target = maxTokens * 0.7
 * @param currentTokens - Current total token usage
 * @param maxTokens - Maximum token capacity
 * @returns Tokens to free (0 if already under target)
 */
export function computeFreedThreshold(currentTokens: number, maxTokens: number): number {
  const target = maxTokens * TARGET_USAGE_RATIO;
  return Math.max(0, currentTokens - target);
}

/**
 * Suggest files to prune from context.
 * Sorts by composite score and collects until freed >= threshold.
 * @param files - All pinned files in context
 * @param currentTokens - Current total token usage
 * @param maxTokens - Maximum token capacity
 * @returns Ordered list of files to unpin
 */
export function suggestPrune(
  files: PrunableFile[],
  currentTokens: number,
  maxTokens: number
): PruneCandidate[] {
  const threshold = computeFreedThreshold(currentTokens, maxTokens);
  if (threshold <= 0 || files.length === 0) return [];

  const now = Date.now();
  const maxAge = computeMaxAge(files, now);
  const maxFileTokens = computeMaxFileTokens(files);

  const scored = files.map((f) => ({
    filePath: f.filePath,
    tokensSaved: f.tokenCount,
    score: computePruneScore(
      computeAgeScore(f.pinnedAt, now, maxAge),
      computeSizeScore(f.tokenCount, maxFileTokens),
      f.relevanceScore,
      f.importanceScore
    ),
  }));

  // Sort descending by score (highest = prune first)
  scored.sort((a, b) => b.score - a.score);

  return collectUntilFreed(scored, threshold);
}

/** Find maximum age across all files for normalization */
function computeMaxAge(files: PrunableFile[], now: number): number {
  if (files.length === 0) return 1;
  return Math.max(...files.map((f) => now - f.pinnedAt), 1);
}

/** Find maximum token count across all files for normalization */
function computeMaxFileTokens(files: PrunableFile[]): number {
  if (files.length === 0) return 1;
  return Math.max(...files.map((f) => f.tokenCount), 1);
}

/** Collect candidates until freed tokens >= threshold */
function collectUntilFreed(
  candidates: PruneCandidate[],
  threshold: number
): PruneCandidate[] {
  const result: PruneCandidate[] = [];
  let freed = 0;

  for (const candidate of candidates) {
    if (freed >= threshold) break;
    result.push(candidate);
    freed += candidate.tokensSaved;
  }

  return result;
}
