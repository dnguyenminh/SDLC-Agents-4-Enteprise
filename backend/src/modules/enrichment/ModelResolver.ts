/**
 * SA4E-387: ModelResolver — Per-call model resolution for enrichment.
 * Resolves the active model configuration for each enrichment call,
 * supporting runtime model swap without restart.
 */

import type { LLMConfig, LLMProvider } from '../memory/llm/types.js';
import type { LLMService } from '../memory/llm/LLMService.js';

export interface ModelResolverConfig {
  defaultProvider: LLMProvider;
  defaultModel: string;
  defaultBaseUrl: string;
}

export interface ResolvedModelConfig {
  provider: LLMProvider;
  model: string;
  baseUrl: string;
  apiKey?: string;
  contextWindow?: number;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Resolves model configuration per enrichment call.
 * Supports explicit model override, ticket-scoped model, or global active model.
 */
export class ModelResolver {
  private ticketModelCache = new Map<string, ResolvedModelConfig>();

  constructor(
    private readonly llmService: LLMService,
    private readonly config: ModelResolverConfig,
  ) {}

  /**
   * Resolve model config for an enrichment call.
   * Priority: explicit override > ticket-scoped > global active > defaults
   */
  async resolve(request: {
    model?: string;
    provider?: LLMProvider;
    baseUrl?: string;
    ticketId?: string;
  }): Promise<ResolvedModelConfig> {
    // 1. Explicit override from request
    if (request.model || request.provider || request.baseUrl) {
      const active = this.llmService.resolveActive();
      return {
        provider: request.provider || active.provider,
        model: request.model || active.model,
        baseUrl: request.baseUrl || active.baseUrl,
        apiKey: active.apiKey,
        contextWindow: active.contextWindow,
        temperature: active.temperature,
        maxTokens: active.maxTokens,
      };
    }

    // 2. Ticket-scoped model (persisted per ticket)
    if (request.ticketId) {
      const cached = this.ticketModelCache.get(request.ticketId);
      if (cached) {
        return cached;
      }
    }

    // 3. Global active model
    const active = this.llmService.resolveActive();
    const resolved: ResolvedModelConfig = {
      provider: active.provider,
      model: active.model,
      baseUrl: active.baseUrl,
      apiKey: active.apiKey,
      contextWindow: active.contextWindow,
      temperature: active.temperature,
      maxTokens: active.maxTokens,
    };

    // Cache ticket-scoped model if ticketId provided
    if (request.ticketId) {
      this.ticketModelCache.set(request.ticketId, resolved);
    }

    return resolved;
  }

  /**
   * Set model for a specific ticket (runtime model swap).
   * Updates global LLMService and caches for the ticket.
   */
  async setModelForTicket(ticketId: string, modelConfig: Partial<ResolvedModelConfig>): Promise<void> {
    // Update global LLMService
    this.llmService.setActiveModel(modelConfig);

    // Update ticket cache
    const active = this.llmService.resolveActive();
    this.ticketModelCache.set(ticketId, {
      provider: active.provider,
      model: active.model,
      baseUrl: active.baseUrl,
      apiKey: active.apiKey,
      contextWindow: active.contextWindow,
      temperature: active.temperature,
      maxTokens: active.maxTokens,
    });
  }

  /**
   * Get currently active model config (global).
   */
  getActiveModel(): ResolvedModelConfig {
    const active = this.llmService.resolveActive();
    return {
      provider: active.provider,
      model: active.model,
      baseUrl: active.baseUrl,
      apiKey: active.apiKey,
      contextWindow: active.contextWindow,
      temperature: active.temperature,
      maxTokens: active.maxTokens,
    };
  }

  /** Clear ticket-scoped model cache */
  clearTicketCache(ticketId?: string): void {
    if (ticketId) {
      this.ticketModelCache.delete(ticketId);
    } else {
      this.ticketModelCache.clear();
    }
  }
}