/**
 * KSA-158/159: Token Budget Manager — estimates tokens and assembles context within budget.
 */

export class TokenBudgetManager {
  private budget: number;
  private consumed: number = 0;

  constructor(budget: number) {
    this.budget = Math.max(budget, 500); // Minimum 500 tokens
  }

  static estimateTokens(content: any): number {
    const dummy = new TokenBudgetManager(1);
    return dummy.estimateTokens(content);
  }

  /** Estimate token count for content (~4 chars per token). */
  estimateTokens(content: any): number {
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    return Math.ceil(text.length / 4);
  }

  /** Check if tokens can fit within remaining budget. */
  canFit(tokens: number): boolean {
    return this.consumed + tokens <= this.budget;
  }

  /** Consume tokens from budget. */
  consume(tokens: number): void {
    this.consumed += tokens;
  }

  /** Mark budget as fully consumed. */
  consumeAll(): void {
    this.consumed = this.budget;
  }

  /** Get remaining token budget. */
  remaining(): number {
    return Math.max(0, this.budget - this.consumed);
  }

  /** Get total tokens consumed. */
  used(): number {
    return this.consumed;
  }

  /** Check if budget is effectively exhausted (<50 tokens remaining). */
  isExhausted(): boolean {
    return this.remaining() < 50;
  }

  /** Truncate content to fit remaining budget. */
  truncateToFit(content: any): any {
    const maxChars = this.remaining() * 4;

    if (typeof content === 'string') {
      if (content.length <= maxChars) return content;
      return content.substring(0, maxChars) + '\n... (truncated)';
    }

    if (Array.isArray(content)) {
      let chars = 0;
      const result: any[] = [];
      for (const item of content) {
        const itemStr = JSON.stringify(item);
        if (chars + itemStr.length > maxChars) break;
        result.push(item);
        chars += itemStr.length;
      }
      return result;
    }

    const text = JSON.stringify(content);
    if (text.length <= maxChars) return content;
    return text.substring(0, maxChars);
  }

  /**
   * Assemble multiple sections into a result within token budget.
   * Sections are sorted by priority (lower = higher priority).
   */
  assemble(
    sections: Record<string, { content: any; priority: number }>,
    budget: number
  ): { result: Record<string, any>; tokenCount: number; included: string[]; excluded: string[] } {
    const sorted = Object.entries(sections)
      .filter(([_, v]) => v.content != null)
      .sort(([_, a], [__, b]) => a.priority - b.priority);

    const result: Record<string, any> = {};
    let usedTokens = 0;
    const included: string[] = [];
    const excluded: string[] = [];

    for (const [key, { content }] of sorted) {
      const tokens = this.estimateTokens(content);

      if (usedTokens + tokens <= budget) {
        result[key] = content;
        usedTokens += tokens;
        included.push(key);
      } else if (Array.isArray(content) && content.length > 0) {
        // Try truncation for arrays
        const remaining = budget - usedTokens;
        const truncated = this.truncateArray(content, remaining);
        if (truncated.length > 0) {
          result[key] = truncated;
          usedTokens += this.estimateTokens(truncated);
          included.push(`${key} (truncated: ${truncated.length}/${content.length})`);
          continue;
        }
        excluded.push(key);
      } else {
        excluded.push(key);
      }
    }

    return { result, tokenCount: usedTokens, included, excluded };
  }

  private truncateArray(arr: any[], tokenBudget: number): any[] {
    const result: any[] = [];
    let used = 0;
    for (const item of arr) {
      const tokens = this.estimateTokens(item);
      if (used + tokens > tokenBudget) break;
      result.push(item);
      used += tokens;
    }
    return result;
  }
}
