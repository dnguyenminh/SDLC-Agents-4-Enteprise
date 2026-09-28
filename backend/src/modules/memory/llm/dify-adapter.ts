import type { LLMAdapter, LLMConfig, LLMMessage, LLMResponse } from './types.js';

export class DifyAdapter implements LLMAdapter {
  async complete(messages: LLMMessage[], config: LLMConfig): Promise<LLMResponse> {
    const base = config.baseUrl.replace(/\/+$/, '');
    const url = `${base}/v1/chat-messages`;

    // Dify takes a single query string; fold system/assistant context in front
    const nonUserMessages = messages.filter(m => m.role !== 'user');
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const prefix = nonUserMessages.map(m => m.content).join('\n');
    const query = prefix ? `${prefix}\n\n${lastUser?.content ?? ''}` : (lastUser?.content ?? '');

    const body = {
      inputs: {},
      query,
      response_mode: 'blocking',
      conversation_id: '',
      user: 'llm-service',
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Dify error: ${res.status} ${await res.text()}`);

    const data = await res.json() as any;
    return {
      content: data.answer ?? '',
      model: config.model,
      provider: 'dify',
      tokensUsed: data.metadata?.usage?.total_tokens,
    };
  }

  async isAvailable(config: LLMConfig): Promise<boolean> {
    try {
      const base = config.baseUrl.replace(/\/+$/, '');
      const headers: Record<string, string> = {};
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
      const res = await fetch(`${base}/v1/info`, { headers, signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch { return false; }
  }
}
