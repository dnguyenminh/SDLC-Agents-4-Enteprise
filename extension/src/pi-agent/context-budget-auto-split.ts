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
 * Decide if auto-chunk should be applied for the given tier and prompt size.
 */
export function shouldAutoChunk(tier: 'small' | 'medium' | 'large', promptTokens: number, cfg: AutoChunkConfig): boolean {
  if (tier !== 'small') return false;
  return promptTokens > cfg.maxTokensPerChunk;
}

/**
 * Summarize chunk results incrementally.
 * Wire-only: simple concatenation with separators.
 */
export function synthesizeChunks(results: string[]): string {
  return results.filter(Boolean).join('\n\n---\n\n');
}
