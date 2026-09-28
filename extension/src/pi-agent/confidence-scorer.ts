export const SCORE_FAILURE_DEFAULT = 0.5;

/**
 * SEC-329-01 — "no signal" must fail toward escalation.
 * The neutral-heuristic default is deliberately BELOW the escalation
 * threshold (0.75): before this fix a hedging-free answer scored 0.8 > 0.75,
 * which made the small→large escalation gate effectively inert.
 */
export const NEUTRAL_DEFAULT_CONFIDENCE = 0.6;

/**
 * SEC-329-01 — trusted structured-metadata channel (SEC-329-D1 remediation).
 * `declaredConfidence` must come from the model API's structured metadata
 * side-channel — NEVER from text embedded in the answer itself.
 */
export interface ConfidenceMeta {
  declaredConfidence?: number;
}

const HEDGING_PATTERNS = [
  "i'm not sure",
  'i am not sure',
  "i don't know",
  'i do not know',
  'cannot answer',
  "can't answer",
  'unable to',
  'as an ai',
  'i apologize',
  'sorry',
];

const CONFIDENT_MARKERS = ['the answer is', "here's", 'here is', 'definitely', 'certainly', 'sure'];

export class ConfidenceScorer {
  /**
   * SEC-329-01 — gate decisions must NOT read answer-embedded confidence.
   * A prompt-injected answer carrying `confidence: 1.0` used to self-certify.
   * Now the only trusted channel is {@link ConfidenceMeta.declaredConfidence};
   * the answer text itself feeds the heuristic only.
   */
  score(answer: string | undefined | null, meta?: ConfidenceMeta): number {
    try {
      if (meta?.declaredConfidence !== undefined) {
        return ConfidenceScorer.trustedDeclared(meta.declaredConfidence);
      }
      if (typeof answer !== 'string' || answer.trim().length === 0) {
        return SCORE_FAILURE_DEFAULT;
      }
      return ConfidenceScorer.heuristicScore(answer);
    } catch {
      return SCORE_FAILURE_DEFAULT;
    }
  }

  /**
   * Parser kept for the trusted metadata channel: wiring may call this on a
   * model-API structured field (NOT on the answer body) and pass the value
   * via {@link ConfidenceMeta.declaredConfidence}.
   */
  static parseStructuredConfidence(answer: string): number | undefined {
    const match = answer.match(/confidence"?\s*[:=]\s*([01](?:\.\d+)?)/i);
    if (!match) {
      return undefined;
    }
    const value = Number.parseFloat(match[1]);
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : undefined;
  }

  private static trustedDeclared(value: number): number {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      return SCORE_FAILURE_DEFAULT; // out-of-range declared → fail toward escalation
    }
    return value;
  }

  private static heuristicScore(answer: string): number {
    const text = answer.toLowerCase();
    if (HEDGING_PATTERNS.some((pattern) => text.includes(pattern))) {
      return 0.3;
    }
    if (CONFIDENT_MARKERS.some((pattern) => text.includes(pattern))) {
      return 0.9;
    }
    return NEUTRAL_DEFAULT_CONFIDENCE;
  }
}
