/**
 * Context Budget Auto-Split — SA4E-355
 * Wire existing mechanisms for incremental processing on small context windows.
 */

/** TSDoc: auto-chunk configuration */
export interface AutoChunkConfig {
  /** Max tokens per sub-prompt for small-tier models. */
  maxTokensPerChunk: number;
  /** Enable incremental steering load for small tier. */
  incrementalSteering: boolean;
  /** Force lean loadout for small tier. */
  leanLoadout: boolean;
}

/** Default auto-chunk config for tier small. */
export const DEFAULT_AUTO_CHUNK_CONFIG: AutoChunkConfig = {
  maxTokensPerChunk: 1024,
  incrementalSteering: true,
  leanLoadout: true,
};

/** Token estimator (chars/4). */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Split prompt into chunks by paragraphs respecting max token budget.
 * Wire-only: uses existing estimateTokens, no new algorithm.
 */
export function chunkPrompt(text: string, maxTokens: number): string[] {
  const parts = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let current = '';
  for (const part of parts) {
    const candidate = current ? `${current}\n\n${part}` : part;
    if (estimateTokens(candidate) <= maxTokens) {
      current = candidate;
    } else {
      if (current) chunks.push(current);
      if (estimateTokens(part) > maxTokens) {
        chunks.push(part);
        current = '';
      } else {
        current = part;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [text];
}

/**
 * History-aware chunk threshold for medium/large tiers (SA4E-355 UAT fix).
 * The UAT 400 came from promptTokens + ACCUMULATED HISTORY approaching n_ctx
 * — a prompt-only check can never see that overflow.
 */
export interface AutoChunkThreshold {
  /** Usable prompt budget for the model: nCtx − reserveOutput − safetyMargin (BR-02). */
  usableTokens: number;
  /** Tokens already consumed by accumulated conversation history. */
  historyTokens?: number;
}

/**
 * Approach ratio for medium/large tiers: chunk proactively once the request
 * (prompt + history) exceeds 70% of the usable budget (SA4E-355 UAT fix #2).
 */
export const MEDIUM_AUTO_CHUNK_RATIO = 0.7;

/**
 * Decide if auto-chunk should be applied for the given tier and request size.
 *
 * - small: prompt alone exceeds the per-chunk cap (unchanged Wave-1 rule).
 * - medium/large (SA4E-355 UAT fix): trigger when promptTokens + historyTokens
 *   exceed {@link MEDIUM_AUTO_CHUNK_RATIO} of the usable budget. Without a
 *   valid threshold (no resolved budget) the decision fails open → false.
 */
export function shouldAutoChunk(
  tier: 'small' | 'medium' | 'large',
  promptTokens: number,
  cfg: AutoChunkConfig,
  threshold?: AutoChunkThreshold
): boolean {
  if (tier === 'small') return promptTokens > cfg.maxTokensPerChunk;
  if (!threshold || !Number.isFinite(threshold.usableTokens) || threshold.usableTokens <= 0) {
    return false;
  }
  const historyTokens = Math.max(0, threshold.historyTokens ?? 0);
  return promptTokens + historyTokens > threshold.usableTokens * MEDIUM_AUTO_CHUNK_RATIO;
}

/**
 * Summarize chunk results incrementally.
 * Wire-only: simple concatenation with separators.
 */
export function synthesizeChunks(results: string[]): string {
  return results.filter(Boolean).join('\n\n---\n\n');
}
