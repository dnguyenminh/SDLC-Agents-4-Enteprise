/**
 * OpenAIProvider — KSA-210. LLM provider using OpenAI Chat Completions API via fetch().
 * Extends BaseLlmProvider for shared availability check and streaming.
 */
import type { LlmMessage, LlmOptions, LlmResponse, LlmToolCall } from "../core/llm-provider";
import type { McpToolDefinition } from "../vscode/tool-registry";
import { BaseLlmProvider } from "./BaseLlmProvider";
import { formatMessages, formatMessagesForTools, buildHeaders } from "./openai-helpers";

const OPENAI_SECRET_KEY = "kiroSdlc.openaiApiKey";
const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_API_BASE = "https://api.openai.com/v1";

export class OpenAIProvider extends BaseLlmProvider {
  readonly type = "openai" as const;
  private readonly getApiKey: () => Promise<string | undefined>;
  private readonly apiBase: string;
  private readonly defaultModel: string;
  private detectedModel: string | undefined;

  constructor(getApiKey: () => Promise<string | undefined>, baseUrl?: string, defaultModel?: string) {
    super();
    this.getApiKey = getApiKey;
    this.apiBase = (baseUrl || DEFAULT_API_BASE).replace(/\/$/, "");
    this.defaultModel = defaultModel || DEFAULT_MODEL;
    // Set context window based on whether this is a local server (LM Studio) or cloud
    this.contextWindowTokens = this.isLocalServer() ? 8192 : 128000;
  }

  /** Resolve the effective model: prefer explicit override, then configured default,
   *  then auto-detect the first loaded model from the local server (LM Studio). */
  private async resolveModel(modelOverride?: string): Promise<string> {
    if (modelOverride) { return modelOverride; }
    const explicit = this.defaultModel;
    if (explicit && explicit !== "local-model") { return explicit; }
    if (this.isLocalServer()) {
      const detected = await this.detectFirstModel();
      if (detected) { return detected; }
    }
    return explicit || DEFAULT_MODEL;
  }

  /** Detect the first loaded model id from the local server /v1/models endpoint. */
  private async detectFirstModel(): Promise<string | undefined> {
    if (this.detectedModel) { return this.detectedModel; }
    try {
      const response = await fetch(`${this.apiBase}/models`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = await response.json() as { data?: Array<{ id: string }> };
        const id = data.data?.[0]?.id;
        if (id) { this.detectedModel = id; return id; }
      }
    } catch (err) {
      console.debug(`[OpenAIProvider] model detection failed (non-fatal): ${(err as Error).message}`);
    }
    return undefined;
  }

  /** Detect context window from /v1/models endpoint (LM Studio / local servers) */
  async detectContextWindow(): Promise<void> {
    if (!this.isLocalServer()) return; // Cloud providers have known limits
    try {
      const response = await fetch(`${this.apiBase}/models`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = await response.json() as { data?: Array<{ id: string; context_length?: number; meta?: { n_ctx?: number } }> };
        const model = data.data?.[0];
        // Standard OpenAI field
        if (model?.context_length && model.context_length > 0) {
          this.contextWindowTokens = model.context_length;
        }
        // llama-server uses meta.n_ctx instead
        else if (model?.meta?.n_ctx && model.meta.n_ctx > 0) {
          this.contextWindowTokens = model.meta.n_ctx;
        }
      }
    } catch (err) {
      console.debug(`[OpenAIProvider] context window detection failed (non-fatal): ${(err as Error).message}`);
      /* keep default */
    }
  }

  async chat(messages: LlmMessage[], options?: LlmOptions): Promise<string> {
    const apiKey = await this.requireApiKey();
    const body = await this.buildChatBody(messages, options, false);
    const response = await fetch(`${this.apiBase}/chat/completions`, {
      method: "POST", headers: buildHeaders(apiKey),
      body: JSON.stringify(body), signal: options?.signal,
    });
    if (!response.ok) {
      throw new Error(`OpenAI API error ${response.status}: ${await response.text().catch(() => "Unknown")}`);
    }
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content || "";
  }

  async *chatStream(messages: LlmMessage[], options?: LlmOptions): AsyncGenerator<string> {
    const apiKey = await this.requireApiKey();
    const body = await this.buildChatBody(messages, options, true);
    const response = await fetch(`${this.apiBase}/chat/completions`, {
      method: "POST", headers: buildHeaders(apiKey),
      body: JSON.stringify(body), signal: options?.signal,
    });
    if (!response.ok) {
      throw new Error(`OpenAI API error ${response.status}: ${await response.text().catch(() => "Unknown")}`);
    }
    yield* this.readStream(response, (parsed) => {
      return parsed.choices?.[0]?.delta?.content || null;
    });
  }

  async chatWithTools(messages: LlmMessage[], tools: McpToolDefinition[], options?: LlmOptions): Promise<LlmResponse> {
    const apiKey = await this.requireApiKey();
    const openaiTools = tools.map(t => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }));
    const body: Record<string, unknown> = {
      model: await this.resolveModel(options?.model),
      messages: formatMessagesForTools(messages),
      max_tokens: options?.maxTokens || DEFAULT_MAX_TOKENS,
      tools: openaiTools,
    };
    if (options?.temperature !== undefined) { body.temperature = options.temperature; }
    const response = await fetch(`${this.apiBase}/chat/completions`, {
      method: "POST", headers: buildHeaders(apiKey),
      body: JSON.stringify(body), signal: options?.signal,
    });
    if (!response.ok) {
      throw new Error(`OpenAI API error ${response.status}: ${await response.text().catch(() => "Unknown")}`);
    }
    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>
    };
    const toolCalls = data.choices?.[0]?.message?.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      const calls: LlmToolCall[] = toolCalls.map(tc => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments);
        } catch (parseErr) {
          // Malformed tool call arguments — log and continue with empty args rather than silently failing
          console.warn(`[OpenAIProvider] Failed to parse tool call arguments for '${tc.function.name}': ${(parseErr as Error).message}`);
        }
        return { id: tc.id, name: tc.function.name, arguments: args };
      });
      return { type: "tool_use", toolCalls: calls };
    }
    return { type: "text", text: data.choices?.[0]?.message?.content || "" };
  }

  dispose(): void { /* stateless */ }

  // --- Template Method hooks ---

  protected async isConfigured(): Promise<boolean> {
    const key = await this.getApiKey();
    return !!(key || this.apiBase !== DEFAULT_API_BASE);
  }

  protected getHealthCheckUrl(): string {
    const isLocal = this.isLocalServer();
    return isLocal ? `${this.apiBase}/models` : `${this.apiBase}/chat/completions`;
  }

  protected async getHealthCheckRequest() {
    // Attach Authorization when an API key is configured. Many self-hosted
    // OpenAI-compatible gateways (LiteLLM, OmniRoute, vLLM behind auth) require
    // a bearer token even on GET /v1/models, and would otherwise return 401.
    const apiKey = await this.getApiKey();
    if (this.isLocalServer()) {
      return { method: "GET", headers: buildHeaders(apiKey || "") };
    }
    return {
      method: "POST",
      headers: buildHeaders(apiKey || ""),
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
      }),
    };
  }

  protected isHealthyStatus(status: number): boolean {
    // 200 = OK. 401/403 mean the server is reachable but the credentials are
    // rejected — that is an auth problem, not an unreachable endpoint, so we
    // still consider the provider "available". 429 = rate limited but alive.
    return status === 200 || status === 401 || status === 403 || status === 429;
  }

  // --- Private helpers ---

  private isLocalServer(): boolean {
    return this.apiBase !== DEFAULT_API_BASE;
  }

  private async buildChatBody(messages: LlmMessage[], options: LlmOptions | undefined, stream: boolean): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = {
      model: await this.resolveModel(options?.model),
      messages: formatMessages(messages),
      max_tokens: options?.maxTokens || DEFAULT_MAX_TOKENS,
      stream,
    };
    if (options?.temperature !== undefined) { body.temperature = options.temperature; }
    return body;
  }

  private async requireApiKey(): Promise<string> {
    const key = await this.getApiKey();
    if (!key && this.apiBase === DEFAULT_API_BASE) {
      throw new Error("OpenAI API key not configured.");
    }
    return key || "";
  }
}
