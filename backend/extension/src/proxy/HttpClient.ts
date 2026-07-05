/**
 * HttpClient — Auth-injecting HTTP wrapper for backend communication.
 * Handles token injection, 401 retry, timeouts, and streaming.
 */

import { AuthManager } from "../auth/AuthManager";

export class HttpError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export interface ToolResult {
  content: Array<{ type: string; text: string }>;
}

export class HttpClient {
  constructor(
    private _baseUrl: string,
    private readonly authManager: AuthManager
  ) {}

  get baseUrl(): string {
    return this._baseUrl;
  }

  set baseUrl(url: string) {
    this._baseUrl = url;
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.authManager.getAccessToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = "Bearer " + token;
    }
    return headers;
  }

  async get<T>(path: string, timeout?: number, _retried = false): Promise<T> {
    const headers = await this.getAuthHeaders();
    const url = this._baseUrl + path;
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(timeout || 10000),
    });
    if (response.status === 401 && !_retried) {
      await this.authManager.refreshToken();
      return this.get(path, timeout, true);
    }
    if (!response.ok) {
      throw new HttpError(response.status, await response.text());
    }
    return response.json() as Promise<T>;
  }

  async post<T>(path: string, body: unknown, timeout?: number, _retried = false): Promise<T> {
    const headers = await this.getAuthHeaders();
    const url = this._baseUrl + path;
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout || 10000),
    });
    if (response.status === 401 && !_retried) {
      await this.authManager.refreshToken();
      return this.post(path, body, timeout, true);
    }
    if (!response.ok) {
      throw new HttpError(response.status, await response.text());
    }
    return response.json() as Promise<T>;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    return this.post<ToolResult>("/mcp/tools/call", { tool_name: name, arguments: args }, 300000);
  }

  async stream(path: string, body: unknown, timeout?: number, _retried = false): Promise<ReadableStream<Uint8Array>> {
    const headers = await this.getAuthHeaders();
    const url = this._baseUrl + path;
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout || 120000),
    });
    if (response.status === 401 && !_retried) {
      await this.authManager.refreshToken();
      return this.stream(path, body, timeout, true);
    }
    if (!response.ok) {
      throw new HttpError(response.status, await response.text());
    }
    if (!response.body) {
      throw new HttpError(0, "No response body for streaming");
    }
    return response.body;
  }

  /**
   * Simple health check — GET /health, returns true if 200.
   */
  async healthCheck(timeout?: number): Promise<boolean> {
    try {
      const url = this._baseUrl + "/health";
      const response = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(timeout || 5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
