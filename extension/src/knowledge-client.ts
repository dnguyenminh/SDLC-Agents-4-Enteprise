/**
 * SA4E-85 — KnowledgeClient [v3.1].
 * HTTP client for the Backend Knowledge Service REST API
 * (backend/src/knowledge/routes.ts mounted under /api/v1).
 *
 * Security requirements:
 *  - #19: Bearer JWT (if auth provider available) + X-Project-Id workspace binding
 *  - #18: workspace-scoped thread access is enforced backend-side (404 on mismatch)
 *
 * Backend is the single source of truth; multi-IDE hydrate from here.
 * Timeout + retry are configurable; unreachable backend throws KbUnreachableError
 * (recoverable → STREAM_ERROR(recoverable) at the engine boundary).
 */
import * as vscode from "vscode";
import { httpGetJson, httpPostJson, httpPutJson, httpDeleteJson } from "./utils/http-client-utils";
// SA4E-320 Finding #1: static import so URL validation + the allowInsecureRemote
// bypass flag flow through ONE shared config path (same as getBackendUrl()).
// The previous lazy require() failed to resolve under vitest, skipping validation.
import { validateBackendUrl, getAllowInsecureRemote, getBackendUrl } from "./config/backend-url";

// --- KB Entity Models (mirror backend/src/knowledge/models.ts) ---

export type KbMessageRole = "user" | "assistant" | "system" | "tool";
export type KbThreadStatus = "active" | "completed" | "archived";

export interface KbThread {
  thread_id: string;
  workspace_id: string;
  title: string;
  agent_id: string | null;
  status: KbThreadStatus;
  created_at: string;
  updated_at: string;
}

export interface KbMessage {
  id: string;
  thread_id: string;
  workspace_id: string;
  role: KbMessageRole;
  content: string;
  agent_id: string | null;
  timestamp: string;
  seq: number;
}

export interface KbPendingWrite {
  task_id: string;
  channel: string;
  value: unknown;
}

export interface KbCheckpoint {
  thread_id: string;
  workspace_id: string;
  checkpoint: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  channel_versions: Record<string, unknown>;
  pending_writes: KbPendingWrite[];
  version: number;
  updated_at: string;
}

export interface KbCreateThreadInput {
  title?: string;
  agent_id?: string | null;
}

export interface KbSaveCheckpointInput {
  checkpoint?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  newVersions?: Record<string, unknown>;
  pendingWrites?: KbPendingWrite[];
  writes?: KbPendingWrite[];
  messages?: KbMessageInput[];
}

export interface KbMessageInput {
  id?: string;
  role: KbMessageRole;
  content: string;
  agent_id?: string | null;
  timestamp?: string;
}

/** Backend REST envelope: { data, error }. */
interface ApiEnvelope<T> {
  data: T | null;
  error: { code?: string; message?: string } | null;
}

// --- UUID v4 contract (PBT-HYD-01, STC §8.1) ---

export const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV4(value: string): boolean {
  return UUID_V4_REGEX.test(value);
}

/** Parse a raw thread JSON string, returning the thread or null. */
export function parseThreadJson(raw: string): KbThread | null {
  try {
    const parsed = JSON.parse(raw) as KbThread;
    return parsed && typeof parsed.thread_id === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/** Validate a raw thread JSON string against the UUID v4 contract. */
export function validateThreadJson(raw: string): { valid: boolean; reason?: string } {
  const thread = parseThreadJson(raw);
  if (!thread) { return { valid: false, reason: "not-json-or-missing-thread_id" }; }
  if (!isUuidV4(thread.thread_id)) { return { valid: false, reason: "invalid-thread-id" }; }
  return { valid: true };
}

// --- Recoverable backend-unreachable error ---

export class KbUnreachableError extends Error {
  readonly recoverable = true;
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "KbUnreachableError";
  }
}

// --- Options & URL resolution ---

export interface KnowledgeClientOptions {
  timeoutMs?: number;
  retries?: number;
  /** Build auth headers (Bearer token + X-Project-Id) per request. */
  getHeaders?: () => Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_RETRIES = 2;

/** Resolve the Backend KB base URL (no trailing slash). */
export function resolveKbBaseUrl(): string {
  // Check env override first (used in tests and when port differs)
  const envPort = process.env.CODE_INTEL_PORT;
  if (envPort) {
    const port = parseInt(envPort, 10);
    if (Number.isInteger(port) && port >= 1024 && port <= 65535) {
      return `http://127.0.0.1:${port}`;
    }
  }
  try {
    // Delegate to shared config utility — reads backend.url AND the
    // allowInsecureRemote flag from VS Code config (SA4E-320).
    return getBackendUrl();
  } catch {
    // Validation failure / config unavailable — fall back to default
    return "http://127.0.0.1:48721";
  }
}

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
