/**
 * AnthropicProvider — KSA-210. LLM provider backed by Anthropic Messages API.
 * Extends BaseLlmProvider for shared availability check and streaming.
 */
import type { LlmMessage, LlmOptions, LlmResponse, LlmToolCall } from "../llm-provider";
import type { McpToolDefinition } from "../tool-registry";
import { BaseLlmProvider } from "./BaseLlmProvider";
import { splitMessages, formatMessagesForTools } from "./anthropic-helpers";

export const ANTHROPIC_SECRET_KEY = "kiroSdlc.anthropicApiKey";
const DEFAULT_MODEL = "claude-sonnet-4-latest";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_BASE_URL = "https://api.anthropic.com";

export class AnthropicProvider extends BaseLlmProvider {
  readonly type = "anthropic" as const;
  private client: any = null;
  private readonly getApiKey: () => Promise<string | undefined>;
  private readonly baseUrl: string;

  constructor(getApiKey: () => Promise<string | undefined>, baseUrl?: string) {
    super();
    this.getApiKey = getApiKey;
    this.baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
    this.contextWindowTokens = 200000; // Claude models have 200K context
  }

  async chat(messages: LlmMessage[], options?: LlmOptions): Promise<string> {
    const client = await this.ensureClient();
    const { systemPrompt, userMessages } = splitMessages(messages);
    const params = this.buildParams(userMessages, options, systemPrompt, false);
    const response = await client.messages.create(params);
    return this.extractTextContent(response);
  }

  async *chatStream(messages: LlmMessage[], options?: LlmOptions): AsyncGenerator<string> {
    const client = await this.ensureClient();
    const { systemPrompt, userMessages } = splitMessages(messages);
    const params = this.buildParams(userMessages, options, systemPrompt, true);
    const stream = client.messages.stream(params);
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta?.text) {
        yield event.delta.text;
      }
    }
  }

  async chatWithTools(messages: LlmMessage[], tools: McpToolDefinition[], options?: LlmOptions): Promise<LlmResponse> {
    const client = await this.ensureClient();
    const { systemPrompt, userMessages } = splitMessages(messages);
    const anthropicTools = tools.map(t => ({
      name: t.name, description: t.description, input_schema: t.inputSchema,
    }));
    const formattedMessages = formatMessagesForTools(userMessages);
    const params: Record<string, unknown> = {
      model: options?.model || DEFAULT_MODEL,
      max_tokens: options?.maxTokens || DEFAULT_MAX_TOKENS,
      messages: formattedMessages, tools: anthropicTools, stream: false,
    };
    if (systemPrompt) { params.system = systemPrompt; }
    if (options?.temperature !== undefined) { params.temperature = options.temperature; }
    const response = await client.messages.create(params);
    const content = Array.isArray(response?.content) ? response.content : [];
    const toolUseBlocks = content.filter((b: any) => b.type === "tool_use");
    if (toolUseBlocks.length > 0) {
      const toolCalls: LlmToolCall[] = toolUseBlocks.map((b: any) => ({
        id: b.id, name: b.name, arguments: b.input || {},
      }));
      return { type: "tool_use", toolCalls };
    }
    return { type: "text", text: this.extractTextContent(response) };
  }

  dispose(): void { this.client = null; }

  // --- Template Method hooks ---

  protected async isConfigured(): Promise<boolean> {
    const key = await this.getApiKey();
    return !!(key || this.baseUrl !== DEFAULT_BASE_URL);
  }

  protected getHealthCheckUrl(): string {
    return `${this.baseUrl}/v1/messages`;
  }

  protected getHealthCheckRequest() {
    return {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "health-check",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL, max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
    };
  }

  protected isHealthyStatus(status: number): boolean {
    return status < 500;
  }

  // --- Private helpers ---

  private buildParams(
    userMessages: LlmMessage[], options: LlmOptions | undefined,
    systemPrompt: string | undefined, stream: boolean
  ): Record<string, unknown> {
    const params: Record<string, unknown> = {
      model: options?.model || DEFAULT_MODEL,
      max_tokens: options?.maxTokens || DEFAULT_MAX_TOKENS,
      messages: userMessages.map(m => ({ role: m.role, content: m.content })),
      stream,
    };
    if (systemPrompt) { params.system = systemPrompt; }
    if (options?.temperature !== undefined) { params.temperature = options.temperature; }
    return params;
  }

  private extractTextContent(response: any): string {
    const content = Array.isArray(response?.content) ? response.content : [];
    return content.filter((b: any) => b.type === "text").map((b: any) => b.text || "").join("");
  }

  private async ensureClient(): Promise<any> {
    if (this.client) { return this.client; }
    const apiKey = await this.getApiKey();
    if (!apiKey && this.baseUrl === DEFAULT_BASE_URL) {
      throw new Error("Anthropic API key not configured.");
    }
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const opts: Record<string, any> = {};
    if (apiKey) { opts.apiKey = apiKey; }
    if (this.baseUrl !== DEFAULT_BASE_URL) { opts.baseURL = this.baseUrl; }
    if (!apiKey && this.baseUrl !== DEFAULT_BASE_URL) { opts.apiKey = "not-needed"; }
    this.client = new Anthropic(opts);
    return this.client;
  }
}
