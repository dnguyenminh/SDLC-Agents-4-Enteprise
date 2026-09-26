export const SCORE_FAILURE_DEFAULT = 0.5;

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
  score(answer: string | undefined | null): number {
    try {
      if (typeof answer !== 'string' || answer.trim().length === 0) {
        return SCORE_FAILURE_DEFAULT;
      }
      const structured = ConfidenceScorer.parseStructuredConfidence(answer);
      if (structured !== undefined) {
        return structured;
      }
      return ConfidenceScorer.heuristicScore(answer);
    } catch {
      return SCORE_FAILURE_DEFAULT;
    }
  }

  static parseStructuredConfidence(answer: string): number | undefined {
    const match = answer.match(/confidence"?\s*[:=]\s*([01](?:\.\d+)?)/i);
    if (!match) {
      return undefined;
    }
    const value = Number.parseFloat(match[1]);
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : undefined;
  }

  private static heuristicScore(answer: string): number {
    const text = answer.toLowerCase();
    if (HEDGING_PATTERNS.some((pattern) => text.includes(pattern))) {
      return 0.3;
    }
    if (CONFIDENT_MARKERS.some((pattern) => text.includes(pattern))) {
      return 0.9;
    }
    return 0.8;
  }
}
