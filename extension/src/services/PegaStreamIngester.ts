/**
 * PegaStreamIngester — Async NDJSON ingest client for Pega rules (SA4E-94).
 * Sends rules as NDJSON via chunked HTTP POST, receives 202 + jobId,
 * then polls GET /pega/jobs/:id every 3s until done or failed.
 * SA4E-362: refresh-on-401 (retry đúng một lần) cho cả 3 call site + typed IngestAuthError.
 * Job lifecycle lives in ./PegaStreamIngester/*.
 */

import { withAuthRetry, type IngestAuthProvider } from "../utils/backend-auth-headers";
import type {
  IngestSingleRuleResponse,
  IngestSingleRuleResult,
  LogFn,
  StreamIngestResult,
} from "./PegaStreamIngester/ingest-types";
import { IngestAuthError, sanitizeIngestText } from "./PegaStreamIngester/ingest-auth";
import {
  submitJobCore,
  pollUntilCompleteCore,
  type IngestJobContext,
} from "./PegaStreamIngester/stream-job";

export type {
  StreamIngestResult,
  IngestSingleRuleResult,
} from "./PegaStreamIngester/ingest-types";
export { IngestAuthError } from "./PegaStreamIngester/ingest-auth";

/**
 * Stream rules to backend via NDJSON POST, then poll for completion.
 * Pattern: Facade — simplifies async job lifecycle for callers.
 */
export class PegaStreamIngester {
  private readonly backendUrl: string;
  private readonly auth?: IngestAuthProvider;

  constructor(backendUrl: string, auth?: IngestAuthProvider) {
    this.backendUrl = backendUrl;
    this.auth = auth;
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
    const endpoint = `${this.backendUrl}/api/v1/pega/ingest-rule`;

    // SA4E-338 B1: forward the Pega application name (read by the caller from
    // pega-project.json) so the backend registers the project under its real app
    // name instead of a random rule's class.
    const body = JSON.stringify({ projectId, ruleJson, checksum, version, appName }); // JSON string — replay-safe

    const res = await this.fetchWithAuthRetry(async (token) => {
      const headers = this.authHeaders(projectId, { 'Content-Type': 'application/json' });
      if (token) { headers['Authorization'] = `Bearer ${token}`; }
      return fetch(endpoint, {
        method: 'POST',
        // SA4E-241 SEC-01: send project identity for the write path (backend scopes
        // by identity, not body.projectId).
        headers,
        body,
      });
    }, "rule");

    const json = (await res.json()) as IngestSingleRuleResponse;
    if (json.error) {
      // SA4E-362 FR-3: 401 persists → typed error, message GIỮ contract hiện có
      // ("Ingest failed: Invalid or expired token") — caller/log test phụ thuộc chuỗi này.
      // SEC-02 (3.7): envelope message được cap 200 ký tự.
      if (res.status === 401) {
        throw new IngestAuthError(`Ingest failed: ${this.truncate(json.error.message)}`, res.status);
      }
      throw new Error(`Ingest failed: ${json.error.message}`); // non-auth envelope error giữ nguyên
    }
    if (!json.data) {
      throw new Error('Ingest returned empty data');
    }

    return json.data;
  }
}
