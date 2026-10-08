/**
 * Ollama LLM adapter — local inference via REST API.
 * Handles qwen3 "thinking" mode: appends /no_think and falls back to thinking field.
 */

import type { LLMAdapter, LLMConfig, LLMMessage, LLMResponse } from './types.js';
import { buildProviderHttpError } from './error-classifier.js';

export class OllamaAdapter implements LLMAdapter {
  async complete(messages: LLMMessage[], config: LLMConfig): Promise<LLMResponse> {
    const url = `${config.baseUrl}/api/chat`;

    // For qwen3 models: disable thinking mode by appending /no_think
    const isQwen3 = config.model.includes('qwen3');
    const processedMessages = messages.map(m => {
      if (isQwen3 && m.role === 'system') {
        return { role: m.role, content: m.content + ' /no_think' };
      }
      return { role: m.role, content: m.content };
    });
    if (isQwen3 && !messages.some(m => m.role === 'system')) {
      processedMessages.unshift({ role: 'system', content: 'Be concise. /no_think' });
    }

    const body = {
      model: config.model,
      messages: processedMessages,
      stream: false,
      options: {
        temperature: config.temperature ?? 0.3,
        num_predict: config.maxTokens ?? 200,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    // SA4E-338 S3 (D-SEC-07): redaction at construct — never throw the raw provider body.
    if (!res.ok) throw buildProviderHttpError('Ollama', res.status, await res.text());
    const data = await res.json() as any;

    // qwen3 puts response in "thinking" when content is empty
    const content = data.message?.content || data.message?.thinking || '';

    return {
      content,
      model: config.model,
      provider: 'ollama',
      tokensUsed: data.eval_count,
    };
  }

  async isAvailable(config: LLMConfig): Promise<boolean> {
    try {
      const res = await fetch(`${config.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch { return false; }
  }
}
