/**
 * OllamaProvider --- KSA-210
 * LLM provider backed by Ollama REST API (local inference).
 * Extends BaseLlmProvider for shared availability check and streaming.
 */
import type { LlmMessage, LlmOptions, LlmResponse } from "../llm-provider";
import type { McpToolDefinition } from "../tool-registry";
import { BaseLlmProvider } from "./BaseLlmProvider";
import { ollamaChatWithTools } from "./ollama-tools";

const DEFAULT_MODEL = "llama3.1";
const DEFAULT_BASE_URL = "http://localhost:11434";

export class OllamaProvider extends BaseLlmProvider {
  readonly type = "ollama" as const;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(baseUrl?: string, defaultModel?: string) {
    super();
    this.baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
    this.defaultModel = defaultModel || DEFAULT_MODEL;
    this.contextWindowTokens = 8192; // Conservative default for Ollama models
  }

  /** Fetch actual context window from Ollama /api/show endpoint */
  async detectContextWindow(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: this.defaultModel }),
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = await response.json() as { model_info?: Record<string, unknown> };
        const ctxLen = data.model_info?.["context_length"] as number
          || data.model_info?.["llama.context_length"] as number;
        if (ctxLen && ctxLen > 0) { this.contextWindowTokens = ctxLen; }
      }
    } catch { /* keep default */ }
  }

  async chat(messages: LlmMessage[], options?: LlmOptions): Promise<string> {
    const body = this.buildChatBody(messages, options, false);
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: options?.signal,
    });
    if (!response.ok) {
      throw new Error(`Ollama API error ${response.status}: ${await response.text().catch(() => "Unknown")}`);
    }
    const data = await response.json() as { message?: { content?: string } };
    return data.message?.content || "";
  }

  async *chatStream(messages: LlmMessage[], options?: LlmOptions): AsyncGenerator<string> {
    const body = this.buildChatBody(messages, options, true);
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: options?.signal,
    });
    if (!response.ok) {
      throw new Error(`Ollama API error ${response.status}: ${await response.text().catch(() => "Unknown")}`);
    }
    yield* this.readStream(response, (parsed) => {
      return parsed.message?.content || null;
    });
  }

  async chatWithTools(messages: LlmMessage[], tools: McpToolDefinition[], options?: LlmOptions): Promise<LlmResponse> {
    return ollamaChatWithTools(
      this.baseUrl, this.defaultModel, messages, tools, options,
      this.formatMessages.bind(this),
    );
  }

  dispose(): void {}

  // --- Template Method hooks ---

  protected async isConfigured(): Promise<boolean> {
    return true; // Always local, no config needed
  }

  protected getHealthCheckUrl(): string {
    return `${this.baseUrl}/api/tags`;
  }

  protected isHealthyStatus(status: number): boolean {
    return status === 200;
  }

  // --- Private helpers ---

  private buildChatBody(messages: LlmMessage[], options: LlmOptions | undefined, stream: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: options?.model || this.defaultModel,
      messages: this.formatMessages(messages),
      stream,
    };
    if (options?.temperature !== undefined) {
      body.options = { temperature: options.temperature };
    }
    return body;
  }

  private formatMessages(messages: LlmMessage[]): Array<{ role: string; content: string }> {
    return messages.map((m) => {
      if (m.role === "tool") { return { role: "tool", content: m.content }; }
      return { role: m.role, content: m.content };
    });
  }
}
