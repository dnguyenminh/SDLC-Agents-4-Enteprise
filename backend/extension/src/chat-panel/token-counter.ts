/**
 * TokenCounter — KSA-240
 * Calculates token usage for conversations.
 * Uses character-based estimation (4 chars ~ 1 token) as default.
 * Can be upgraded to use tiktoken for exact counts.
 */

import { TabMessage, ContextThreshold } from "./conversation-types";

export interface TokenCounterConfig {
  warningThreshold: number;  // default 0.6 (60%)
  criticalThreshold: number; // default 0.8 (80%)
  fullThreshold: number;     // default 0.95 (95%)
}

const DEFAULT_CONFIG: TokenCounterConfig = {
  warningThreshold: 0.6,
  criticalThreshold: 0.8,
  fullThreshold: 0.95,
};

export class TokenCounter {
  private config: TokenCounterConfig;

  constructor(config: Partial<TokenCounterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Estimate token count for a single message.
   * Uses ~4 characters per token heuristic.
   * Override with tiktoken integration for production accuracy.
   */
  countMessageTokens(content: string): number {
    if (!content) return 0;
    // ~4 chars per token is a reasonable English estimate
    // Add overhead for message formatting (role, separators)
    return Math.ceil(content.length / 4) + 4;
  }

  /**
   * Calculate total token count for all messages in a conversation.
   */
  countConversationTokens(messages: TabMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      total += msg.tokenCount || this.countMessageTokens(msg.content);
    }
    // Add base overhead (system prompt, formatting)
    total += 100;
    return total;
  }

  /**
   * Get usage percentage (0-100).
   */
  getUsagePercentage(tokenCount: number, maxTokens: number): number {
    if (maxTokens <= 0) return 0;
    return Math.min(100, Math.round((tokenCount / maxTokens) * 100));
  }

  /**
   * Determine the threshold state based on usage percentage.
   */
  getThresholdState(percentage: number): ContextThreshold {
    const ratio = percentage / 100;
    if (ratio >= this.config.fullThreshold) return "full";
    if (ratio >= this.config.criticalThreshold) return "critical";
    if (ratio >= this.config.warningThreshold) return "warning";
    return "safe";
  }

  /**
   * Get max tokens for a given model.
   * Returns reasonable defaults based on known model context windows.
   */
  getMaxTokensForModel(model: string): number {
    const modelLimits: Record<string, number> = {
      "claude-sonnet-4-20250514": 200000,
      "claude-3-5-sonnet-20241022": 200000,
      "claude-3-haiku-20240307": 200000,
      "claude-3-opus-20240229": 200000,
      "gpt-4o": 128000,
      "gpt-4o-mini": 128000,
      "gpt-4-turbo": 128000,
      "deepseek-chat": 64000,
      "deepseek-coder": 64000,
    };

    // Check exact match first
    if (modelLimits[model]) return modelLimits[model];

    // Check prefix match
    for (const [key, value] of Object.entries(modelLimits)) {
      if (model.startsWith(key.split("-").slice(0, 2).join("-"))) {
        return value;
      }
    }

    // Default fallback
    return 128000;
  }
}
