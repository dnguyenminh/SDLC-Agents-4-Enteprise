/**
 * BaseLlmProvider — Abstract base class for LLM providers (Template Method pattern).
 * Shared logic: availability check (ping with timeout), SSE/NDJSON stream reading.
 * Subclasses override hook methods to customize behavior.
 */
import type { LlmProvider, LlmMessage, LlmOptions, LlmResponse, LlmProviderType } from "../llm-provider";
import type { McpToolDefinition } from "../tool-registry";

const DEFAULT_TIMEOUT_MS = 8000;

export abstract class BaseLlmProvider implements LlmProvider {
  abstract readonly type: LlmProviderType;

  abstract chat(messages: LlmMessage[], options?: LlmOptions): Promise<string>;
  abstract chatStream(messages: LlmMessage[], options?: LlmOptions): AsyncGenerator<string>;
  abstract dispose(): void;

  chatWithTools?(messages: LlmMessage[], tools: McpToolDefinition[], options?: LlmOptions): Promise<LlmResponse>;

  /** Context window in tokens. Override in subclasses for accurate values. Default: 0 (unknown). */
  protected contextWindowTokens = 0;

  /** Get context window size in tokens. Returns 0 if unknown (no budget limit applied). */
  getContextWindow(): number {
    return this.contextWindowTokens;
  }

  /**
   * Template Method for availability check.
   * Subclasses override `getHealthCheckUrl()` and `isConfigured()`.
   */
  async isAvailable(): Promise<boolean> {
    if (!await this.isConfigured()) return false;
    return this.pingEndpoint();
  }

  /** Override: return true if provider has minimum config (key or URL) */
  protected abstract isConfigured(): Promise<boolean>;

  /** Override: return the URL to ping for health check */
  protected abstract getHealthCheckUrl(): string;

  /** Override: return HTTP method + headers + body for health check (default GET) */
  protected getHealthCheckRequest(): { method: string; headers?: Record<string, string>; body?: string } {
    return { method: "GET" };
  }

  /** Override: determine if response status means "available" */
  protected isHealthyStatus(status: number): boolean {
    return status >= 200 && status < 500;
  }

  /** Shared: ping endpoint with timeout */
  private async pingEndpoint(): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const { method, headers, body } = this.getHealthCheckRequest();
      const response = await fetch(this.getHealthCheckUrl(), {
        method, headers, body, signal: controller.signal,
      });
      clearTimeout(timeout);
      return this.isHealthyStatus(response.status);
    } catch {
      clearTimeout(timeout);
      return false;
    }
  }

  /** Shared utility: read SSE/NDJSON stream */
  protected async *readStream(
    response: Response,
    extractToken: (parsed: any) => string | null
  ): AsyncGenerator<string> {
    if (!response.body) throw new Error("No response body for streaming");
    const reader = (response.body as any).getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const data = trimmed.startsWith("data: ") ? trimmed.slice(6) : trimmed;
          if (data === "[DONE]") return;
          try {
            const parsed = JSON.parse(data);
            const token = extractToken(parsed);
            if (token) yield token;
          } catch { /* skip malformed */ }
        }
      }
      // Flush remaining buffer
      if (buffer.trim()) {
        try {
          const data = buffer.trim().startsWith("data: ") ? buffer.trim().slice(6) : buffer.trim();
          if (data !== "[DONE]") {
            const parsed = JSON.parse(data);
            const token = extractToken(parsed);
            if (token) yield token;
          }
        } catch { /* ignore */ }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
