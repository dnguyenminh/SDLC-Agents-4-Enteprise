const CHARS_PER_TOKEN = 4;
const TOKENS_PER_WORD = 1.3;

export class TokenCounter {
  estimate(text: string): number {
    if (!text) return 0;
    const byChars = Math.ceil(text.length / CHARS_PER_TOKEN);
    const words = text.split(/\s+/).filter(Boolean).length;
    const byWords = Math.round(words * TOKENS_PER_WORD);
    return Math.max(1, byChars, byWords);
  }

  fits(text: string, budget: number): boolean {
    return this.estimate(text) <= budget;
  }
}
