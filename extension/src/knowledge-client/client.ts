/**
 * KnowledgeClient — HTTP client for the Backend Knowledge API (SA4E-85 v3.1).
 * All methods are workspace-bound via X-Project-Id (Finding #18/#19).
 * Security: #19 Bearer JWT + X-Project-Id; #18 workspace-scoped access enforced backend-side.
 */

import { httpGetJson, httpPostJson, httpPutJson, httpDeleteJson } from "../utils/http-client-utils";
import { validateBackendUrl, getAllowInsecureRemote } from "../config/backend-url";
import type {
  ApiEnvelope,
  KbCheckpoint,
  KbCreateThreadInput,
  KbMessage,
  KbSaveCheckpointInput,
  KbThread,
} from "./models";
import { KbUnreachableError } from "./validation";
import { DEFAULT_RETRIES, DEFAULT_TIMEOUT_MS, type KnowledgeClientOptions } from "./url";

/**
 * HTTP client for the Backend Knowledge API.
 * All methods are workspace-bound via X-Project-Id (Finding #18/#19).
 */
export class KnowledgeClient {
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly getHeaders: () => Record<string, string>;

  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    options: KnowledgeClientOptions = {}
  ) {
    try {
      // SA4E-320 Finding #1: forward the opt-in bypass flag so KnowledgeClient
      // validation is consistent with getBackendUrl()/resolveKbBaseUrl().
      // Flag read failure → fail-closed (bypass OFF, enforcement stays ON).
      let allowInsecureRemote = false;
      try {
        allowInsecureRemote = getAllowInsecureRemote() === true;
      } catch {
        allowInsecureRemote = false;
      }
      this.baseUrl = validateBackendUrl(baseUrl, { allowInsecureRemote });
    } catch (err: any) {
      if (err.message && err.message.startsWith("[Security]")) throw err;
      this.baseUrl = (baseUrl || "").replace(/\/$/, "");
    }
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = options.retries ?? DEFAULT_RETRIES;
    this.getHeaders = options.getHeaders ?? (() => ({}));
  }

  /** GET /api/v1/threads — list threads for this workspace. */
  async listThreads(): Promise<KbThread[]> {
    const env = await this.withRetry(() =>
      httpGetJson<ApiEnvelope<KbThread[]>>(`${this.baseUrl}/api/v1/threads`, this.httpOptions())
    );
    return env?.data ?? [];
  }

  /** POST /api/v1/threads — create a new thread (returns UUID v4 thread_id). */
  async createThread(input: KbCreateThreadInput = {}): Promise<KbThread> {
    const env = await this.withRetry(() =>
      httpPostJson<ApiEnvelope<KbThread>>(`${this.baseUrl}/api/v1/threads`, input, this.httpOptions())
    );
    if (!env?.data) {
      throw new KbUnreachableError(
        env?.error?.message || "Failed to create thread on backend",
        env?.error
      );
    }
    return env.data;
  }

  /** GET /api/v1/threads/:id/messages — full message history (null if thread missing). */
  async getMessages(threadId: string): Promise<KbMessage[] | null> {
    try {
      const env = await this.withRetry(() =>
        httpGetJson<ApiEnvelope<KbMessage[]>>(`${this.baseUrl}/api/v1/threads/${encodeURIComponent(threadId)}/messages`, this.httpOptions())
      );
      if (env?.error) { return null; }
      return env?.data ?? [];
    } catch (err) {
      if (isNotFound(err)) { return null; }
      throw err;
    }
  }

  /** GET /api/v1/threads/:id/checkpoint — saved checkpoint (null if none). */
  async getCheckpoint(threadId: string): Promise<KbCheckpoint | null> {
    try {
      const env = await this.withRetry(() =>
        httpGetJson<ApiEnvelope<KbCheckpoint>>(`${this.baseUrl}/api/v1/threads/${encodeURIComponent(threadId)}/checkpoint`, this.httpOptions())
      );
      if (env?.error || !env?.data) { return null; }
      return env.data;
    } catch (err) {
      if (isNotFound(err)) { return null; }
      throw err;
    }
  }

  /** PUT /api/v1/threads/:id/checkpoint — persist checkpoint (+ optional messages). */
  async saveCheckpoint(threadId: string, input: KbSaveCheckpointInput): Promise<KbCheckpoint | null> {
    const env = await this.withRetry(() =>
      httpPutJson<ApiEnvelope<KbCheckpoint>>(`${this.baseUrl}/api/v1/threads/${encodeURIComponent(threadId)}/checkpoint`, input, this.httpOptions())
    );
    if (env?.error || !env?.data) { return null; }
    return env.data;
  }

  /** DELETE /api/v1/threads/:id — remove a thread. */
  async deleteThread(threadId: string): Promise<boolean> {
    try {
      const env = await this.withRetry(() =>
        httpDeleteJson<ApiEnvelope<{ deleted: boolean }>>(`${this.baseUrl}/api/v1/threads/${encodeURIComponent(threadId)}`, this.httpOptions())
      );
      return env?.data?.deleted === true;
    } catch (err) {
      if (isNotFound(err)) { return false; }
      throw err;
    }
  }

  private httpOptions() {
    return {
      headers: this.getHeaders(),
      timeoutMs: this.timeoutMs,
    };
  }

  /** Retry transient failures (network errors / timeouts) with short backoff. */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const isTimeout = (err as Error).message?.includes("timeout");
        // Undici fetch surfaces the node errno on `cause.code` (e.g. TypeError: fetch failed).
        const cause = (err as any)?.cause as NodeJS.ErrnoException | undefined;
        const isFetchFailure = err instanceof TypeError && /fetch failed/i.test((err as Error).message ?? "");
        const isNetwork = (err as NodeJS.ErrnoException).code === "ECONNREFUSED"
          || (err as NodeJS.ErrnoException).code === "ECONNRESET"
          || (err as NodeJS.ErrnoException).code === "ENOTFOUND"
          || cause?.code === "ECONNREFUSED"
          || cause?.code === "ECONNRESET"
          || cause?.code === "ENOTFOUND"
          || isFetchFailure;
        // SA4E-104: HTTP 4xx/5xx errors are not retryable — throw immediately
        const httpStatus = (err as any)?.status;
        if (httpStatus && httpStatus >= 400) { throw err; }
        if (!isTimeout && !isNetwork) { throw err; }
        if (attempt < this.retries) {
          await sleep(50 * Math.pow(2, attempt));
        }
      }
    }
    throw new KbUnreachableError(
      `Backend KB unreachable after ${this.retries + 1} attempts: ${(lastErr as Error)?.message ?? String(lastErr)}`,
      lastErr
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True when the backend answered HTTP 404 (thread/checkpoint not found contract). */
function isNotFound(err: unknown): boolean {
  return (err as { status?: number })?.status === 404;
}
