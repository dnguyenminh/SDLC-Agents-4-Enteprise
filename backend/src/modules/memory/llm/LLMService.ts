/**
 * LLMService — facade for multi-provider LLM access.
 * Reads config from backend config, selects appropriate adapter.
 */

import type { LLMAdapter, LLMConfig, LLMMessage, LLMProvider, LLMResponse } from './types.js';
import { OllamaAdapter } from './ollama-adapter.js';
import { OpenAIAdapter } from './openai-adapter.js';

const ADAPTERS: Record<LLMProvider, () => LLMAdapter> = {
  ollama: () => new OllamaAdapter(),
  openai: () => new OpenAIAdapter(),
  anthropic: () => new OpenAIAdapter(), // Anthropic via compatible API
  gemini: () => new OpenAIAdapter(),    // Gemini via compatible API
  lmstudio: () => new OpenAIAdapter(),  // LM Studio via OpenAI-compatible API
  copilot: () => new OpenAIAdapter(),   // Copilot via compatible API
};

const DEFAULT_CONFIGS: Record<LLMProvider, Partial<LLMConfig>> = {
  ollama: { baseUrl: 'http://localhost:11434', model: 'qwen2.5:7b-instruct-q4_K_M', temperature: 0.3, maxTokens: 2048 },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', temperature: 0.3, maxTokens: 2048 },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-haiku-20240307', temperature: 0.3, maxTokens: 2048 },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-1.5-flash', temperature: 0.3, maxTokens: 2048 },
  lmstudio: { baseUrl: 'http://localhost:1234/v1', model: 'default', temperature: 0.3, maxTokens: 2048 },
  copilot: { baseUrl: 'http://localhost:11435', model: 'copilot', temperature: 0.3, maxTokens: 2048 },
};

export class LLMService {
  private config: LLMConfig;
  private adapter: LLMAdapter;

  constructor(config?: Partial<LLMConfig>) {
    const provider: LLMProvider = (config?.provider || process.env.LLM_PROVIDER || 'ollama') as LLMProvider;
    const defaults = DEFAULT_CONFIGS[provider] || DEFAULT_CONFIGS.ollama;

    this.config = {
      provider,
      model: config?.model || process.env.LLM_MODEL || defaults.model || 'qwen3:8b',
      baseUrl: config?.baseUrl || process.env.LLM_BASE_URL || defaults.baseUrl || 'http://localhost:11434',
      apiKey: config?.apiKey || process.env.LLM_API_KEY || undefined,
      temperature: config?.temperature ?? defaults.temperature ?? 0.3,
      maxTokens: config?.maxTokens ?? defaults.maxTokens ?? 2048,
    };

    this.adapter = ADAPTERS[provider]?.() || new OllamaAdapter();
  }

  async complete(messages: LLMMessage[]): Promise<LLMResponse> {
    return this.adapter.complete(messages, this.config);
  }

  async isAvailable(): Promise<boolean> {
    return this.adapter.isAvailable(this.config);
  }

  getConfig(): LLMConfig { return { ...this.config }; }

  /** Convenience: ask a simple question */
  async ask(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: LLMMessage[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });
    const res = await this.complete(messages);
    return res.content;
  }

  /** Name a cluster of entries given their summaries */
  async nameCluster(summaries: string[]): Promise<string> {
    const systemPrompt = `You are a technical project analyst. Given a list of document summaries from the same project area, provide a concise business feature name (3-8 words, English). Return ONLY the name, nothing else.`;
    const userPrompt = `These documents belong to the same feature area:\n${summaries.slice(0, 8).map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nBusiness feature name:`;
    const result = await this.ask(userPrompt, systemPrompt);
    // Clean up: remove quotes, newlines, prefixes
    return result.replace(/^["'\s]+|["'\s]+$/g, '').split('\n')[0].trim().substring(0, 80);
  }
}
