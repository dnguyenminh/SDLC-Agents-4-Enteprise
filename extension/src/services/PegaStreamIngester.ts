/**
 * PegaStreamIngester — Async NDJSON ingest client for Pega rules (SA4E-94).
 * Sends rules as NDJSON via chunked HTTP POST, receives 202 + jobId,
 * then polls GET /pega/jobs/:id every 3s until done or failed.
 * SA4E-362: refresh-on-401 (retry đúng một lần) cho cả 3 call site + typed IngestAuthError.
 * Job lifecycle lives in ./PegaStreamIngester/*.
 */

import { withAuthRetry, type IngestAuthProvider } from "../utils/backend-auth-headers";
import type {
  IngestSingleRuleResult,
  LogFn,
  StreamIngestResult,
} from "./PegaStreamIngester/ingest-types";
import { IngestAuthError, sanitizeIngestText } from "./PegaStreamIngester/ingest-auth";
import { DEFAULT_INGEST_RETRY, type RetryConfig } from "./PegaStreamIngester/ingest-retry";
import { ingestSingleRuleCore, type SingleRuleContext } from "./PegaStreamIngester/single-rule";
import {
  submitJobCore,
  pollUntilCompleteCore,
  type IngestJobContext,
} from "./PegaStreamIngester/stream-job";

export type {
  StreamIngestResult,
  IngestSingleRuleResult,
} from "./PegaStreamIngester/ingest-types";
export { IngestAuthError, IngestRejectedError } from "./PegaStreamIngester/ingest-auth";

/**
 * Stream rules to backend via NDJSON POST, then poll for completion.
 * Pattern: Facade — simplifies async job lifecycle for callers.
 */
export class PegaStreamIngester {
  private readonly backendUrl: string;
  private readonly auth?: IngestAuthProvider;
  /** Optional logger for retry visibility in the Pega panel (Fix 5). */
  private readonly log?: LogFn;
  /** Retry tuning for transient single-rule ingest faults (Fix 5). */
  private readonly retryConfig: RetryConfig;
  /** SA4E-375 client-side: projects already pre-registered this session (avoids re-registering per rule). */
  private registeredProjects = new Set<string>();

  constructor(backendUrl: string, auth?: IngestAuthProvider, log?: LogFn, retryConfig: RetryConfig = DEFAULT_INGEST_RETRY) {
    this.backendUrl = backendUrl;
    this.auth = auth;
    this.log = log;
    this.retryConfig = retryConfig;
  }

  /** Delegated context for the standalone job lifecycle functions. */
  private jobCtx(): IngestJobContext {
    return {
      backendUrl: this.backendUrl,
      auth: this.auth,
      fetchWithAuthRetry: (send, endpoint, log) => this.fetchWithAuthRetry(send, endpoint, log),
      authHeaders: (projectId, extra) => this.authHeaders(projectId, extra),
      sanitize: (value) => this.truncate(value),
    };
  }

  /** SA4E-362 FR-2 — delegate sang helper chung (một chỗ định nghĩa retry logic). */
  private fetchWithAuthRetry(
    send: (token: string | undefined) => Promise<Response>,
    endpoint = "rule",
    log?: LogFn,
  ): Promise<Response> {
    return withAuthRetry(send, this.auth, log, endpoint);
  }

  /**
   * SA4E-375 client-side fallback: Ensure the project is registered before ingest.
   * Production backends without the SA4E-375 server-side auto-upsert still
   * reject unregistered projects with PROJECT_NOT_REGISTERED. This pre-registers
   * the project so ingest works on both old and new backends.
   * Fire-and-forget: on failure, proceed with ingest (backend might auto-upsert).
   */
  private async ensureProjectRegistered(projectId: string, appName?: string): Promise<void> {
    if (this.registeredProjects.has(projectId)) { return; }
    this.registeredProjects.add(projectId); // mark first — even if register fails, don't retry per rule
    try {
      const endpoint = `${this.backendUrl}/api/admin/projects/register`;
      const body = JSON.stringify({ projectId, displayName: appName || projectId });
      await this.fetchWithAuthRetry(async (token) => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Project-Id': projectId,
        };
        if (token) { headers['Authorization'] = `Bearer ${token}`; }
        return fetch(endpoint, { method: 'POST', headers, body });
      }, "projects/register");
    } catch {
      // Registration failed — proceed with ingest anyway (backend might auto-upsert)
    }
  }

  /** SA4E-362 FR-2 — Dựng headers: X-Project-Id (identity — SEC-01) + Authorization chỉ khi token khác rỗng (BR-5). */
  private authHeaders(projectId: string, extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...(extra ?? {}) };
    if (projectId) { headers["X-Project-Id"] = projectId; }
    const token = this.auth?.getTokenSync(); // đọc MỖI lần gọi — không cache headers
    if (token) { headers["Authorization"] = `Bearer ${token}`; }
    return headers;
  }

  /**
   * SA4E-362 SEC-02 + SECA-01 (3.7): sanitize text embedded in IngestAuthError —
   * strip CR/LF first (a multi-line 401 body could inject forged log lines), then
   * cap at 200 characters.
   */
  private truncate(value: string): string {
    return sanitizeIngestText(value);
  }

  /** Context passed to the per-rule ingest flow (single-rule.ts). */
  private singleRuleCtx(): SingleRuleContext {
    return {
      backendUrl: this.backendUrl,
      auth: this.auth,
      log: this.log,
      retryConfig: this.retryConfig,
      registeredProjects: this.registeredProjects,
      fetchWithAuthRetry: (send, endpoint) => this.fetchWithAuthRetry(send, endpoint),
      authHeaders: (projectId, extra) => this.authHeaders(projectId, extra),
      truncate: (value) => this.truncate(value),
      ensureProjectRegistered: (projectId, appName) => this.ensureProjectRegistered(projectId, appName),
    };
  }

  /**
   * Ingest rules via async job pattern:
   * 1. POST NDJSON body → 202 + jobId
   * 2. Poll GET /pega/jobs/:id every 3s
   * 3. Return result when status === "done"
   */
  async streamIngest(
    rules: Record<string, unknown>[],
    projectId: string,
    checksums: Record<string, string>,
    versions: Record<string, string>,
    visitedKeys: string[],
    log: LogFn,
  ): Promise<StreamIngestResult> {
    const endpoint = `${this.backendUrl}/api/v1/pega/ingest-stream`;
    log(`[Pega Ingester] 🌊 Streaming ${rules.length} rules via NDJSON to ${endpoint}`);

    const jobId = await this.submitJob(rules, projectId, checksums, versions, visitedKeys, endpoint, log);
    // SA4E-362 FR-2: projectId truyền thêm để poll rebuild headers per-request (BR-5/SEC-01).
    return this.pollUntilComplete(jobId, projectId, log);
  }

  /** POST the NDJSON body and extract jobId from 202 response */
  private async submitJob(
    rules: Record<string, unknown>[],
    projectId: string,
    checksums: Record<string, string>,
    versions: Record<string, string>,
    visitedKeys: string[],
    endpoint: string,
    log: LogFn,
  ): Promise<string> {
    return submitJobCore(this.jobCtx(), rules, projectId, checksums, versions, visitedKeys, endpoint, log);
  }

  /** Poll the job status endpoint until done or failed */
  private async pollUntilComplete(jobId: string, projectId: string, log: LogFn): Promise<StreamIngestResult> {
    return pollUntilCompleteCore(this.jobCtx(), jobId, projectId, log);
  }

  /**
   * Ingest a single rule via POST /api/v1/pega/ingest-rule.
   * SA4E-156: Per-rule ingestion returning unresolved dependencies for BFS.
   * @param projectId - 12-char hex project identifier
   * @param ruleJson - Full Pega rule JSON
   * @param checksum - Optional content checksum for dedup
   * @param version - Optional rule version
   * @param appName - Optional Pega application name (from pega-project.json) for registry display
   * @returns Response with status, ruleId, and unresolvedDependencies
   */
  async ingestSingleRule(
    projectId: string,
    ruleJson: Record<string, unknown>,
    checksum?: string,
    version?: string,
    appName?: string,
  ): Promise<IngestSingleRuleResult> {
    // Per-rule ingest (endpoint validation, timeout, defensive body read, retry,
    // envelope handling) lives in single-rule.ts (BR-18 ≤200-LOC).
    return ingestSingleRuleCore(this.singleRuleCtx(), { projectId, ruleJson, checksum, version, appName });
  }
}
