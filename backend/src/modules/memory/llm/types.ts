/**
 * LLM Provider types — multi-provider support.
 */

export type LLMProvider = 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'lmstudio' | 'copilot';

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  baseUrl: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  provider: LLMProvider;
  tokensUsed?: number;
}

export interface LLMAdapter {
  complete(messages: LLMMessage[], config: LLMConfig): Promise<LLMResponse>;
  isAvailable(config: LLMConfig): Promise<boolean>;
}

/**
 * SA4E-47: Context chain input — passed from previous section to current section.
 */
export interface ContextChainInput {
  previous_section_id: number;
  summary: string;
  business_entities: string[];
  actors: string[];
  business_rules: string[];
}

/**
 * SA4E-47: structured_map JSON schema for knowledge_entries column.
 */
export interface StructuredMapData {
  tags?: string[];
  summary?: string;
  business_entities?: string[];
  actors?: string[];
  business_rules?: string[];
  fileCreatedAt?: string;
  fileAuthor?: string;
  fileVersion?: string;
  context_chain?: {
    previous_section_id: number;
    previous_summary?: string;
  };
  extraction_meta?: {
    model: string;
    timestamp: string;
    fallback_used: boolean;
    context_chain_enabled: boolean;
  };
}

/**
 * SA4E-47: Safely parse structured_map JSON, handling null/empty/invalid values.
 */
export function safeParseStructuredMap(json: string | null | undefined): StructuredMapData {
  if (!json || json === '' || json === '{}') return {};
  try {
    const parsed = JSON.parse(json);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as StructuredMapData;
  } catch {
    return {};
  }
}
