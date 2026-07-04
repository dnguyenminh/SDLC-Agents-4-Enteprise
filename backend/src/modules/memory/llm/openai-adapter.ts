/**
 * OpenAI-compatible adapter — works for OpenAI, Azure, vLLM, LM Studio, etc.
 */

import type { LLMAdapter, LLMConfig, LLMMessage, LLMResponse } from './types.js';

export class OpenAIAdapter implements LLMAdapter {
  async complete(messages: LLMMessage[], config: LLMConfig): Promise<LLMResponse> {
    const url = `${config.baseUrl}/chat/completions`;
    const body: Record<string, any> = {
      model: config.model,
      messages,
      temperature: config.temperature ?? 0.3,
      max_tokens: config.maxTokens ?? 500,
      chat_template_kwargs: { enable_thinking: false },
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`OpenAI error: ${res.status} ${await res.text()}`);
    const data = await res.json() as any;

    const msg = data.choices?.[0]?.message;
    const content = msg?.content || msg?.reasoning_content || '';

    return {
      content,
      model: config.model,
      provider: config.provider,
      tokensUsed: data.usage?.total_tokens,
    };
  }

  async isAvailable(config: LLMConfig): Promise<boolean> {
    try {
      const headers: Record<string, string> = {};
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
      const res = await fetch(`${config.baseUrl}/models`, { headers, signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch { return false; }
  }
}
