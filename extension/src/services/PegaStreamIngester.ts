/**
 * PegaStreamIngester — Async NDJSON ingest client for Pega rules (SA4E-94).
 * Sends rules as NDJSON via chunked HTTP POST, receives 202 + jobId,
 * then polls GET /pega/jobs/:id every 3s until done or failed.
 * SA4E-362: refresh-on-401 (retry đúng một lần) cho cả 3 call site + typed IngestAuthError.
 */

import { withAuthRetry, type IngestAuthProvider } from "../utils/backend-auth-headers";

/** Result returned by backend after job completes */
export interface StreamIngestResult {
  stored: number;
  totalRulesInDb?: number;
  totalKbEntriesInDb?: number;
  totalGraphNodesInDb?: number;
  nextBatch?: Array<{ insKey: string; pxObjClass: string; pyClassName: string; pyRuleName: string }>;
}

/** Metadata line sent as first NDJSON record */
interface StreamMetadata {
  __meta: true;
  projectId: string;
  checksums: Record<string, string>;
  versions: Record<string, string>;
  visitedKeys: string[];
}

/** Job status response from GET /pega/jobs/:id */
interface JobStatusResponse {
  data: {
    status: 'processing' | 'done' | 'failed';
    progress: { processed: number; total: number };
    result: StreamIngestResult | null;
    error: string | null;
  } | null;
  error: { code: string; message: string } | null;
}

/** SA4E-156: Response from POST /api/v1/pega/ingest-rule */
export interface IngestSingleRuleResult {
  status: string;
  ruleId?: number;
  unresolvedDependencies: Array<{ insKey?: string | null; ruleType: string; className: string; ruleName: string }>;
  reason?: string;
}

/** SA4E-156: Full envelope from POST /api/v1/pega/ingest-rule */
interface IngestSingleRuleResponse {
  data: IngestSingleRuleResult | null;
  error: { code: string; message: string } | null;
}

type LogFn = (msg: string) => void;

/** Polling interval in milliseconds */
const POLL_INTERVAL_MS = 3_000;

/**
 * SA4E-362 FR-3 — Typed error báo hiệu auth đã chết sau refresh-retry (401 persists).
 * Bắt bằng instanceof (CẤM regex trên message — ≥4 format message, "HTTP 401" body rỗng miss mọi regex).
 * Export từ đây vì cả 3 throw sites nằm ở file này; PegaBfsIndexer ĐÃ import từ đây — không cycle.
 */
export class IngestAuthError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "IngestAuthError"; // instance field — err.name đúng cả sau serialization
  }
}

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
    return value.replace(/[\r\n]+/g, " ").slice(0, 200);
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
    const meta: StreamMetadata = { __meta: true, projectId, checksums, versions, visitedKeys };
    const encoder = new TextEncoder();

    // SA4E-362 FR-2 edge (b): ReadableStream consume-là-hết, không replay được →
    // mỗi lần send() tạo stream instance MỚI qua factory. `idx` nằm TRONG factory
    // để mỗi stream instance encode lại toàn bộ từ đầu.
    const makeBody = (): ReadableStream<Uint8Array> => {
      let idx = 0;
      return new ReadableStream<Uint8Array>({
        pull(controller) {
          if (idx === 0) {
            controller.enqueue(encoder.encode(JSON.stringify(meta) + '\n'));
            idx++;
          } else if (idx <= rules.length) {
            controller.enqueue(encoder.encode(JSON.stringify(rules[idx - 1]) + '\n'));
            idx++;
          } else {
            controller.close();
          }
        },
      });
    };

    const res = await this.fetchWithAuthRetry(async (token) => {
      const headers = this.authHeaders(projectId, { 'Content-Type': 'application/x-ndjson' });
      if (token) { headers['Authorization'] = `Bearer ${token}`; } // token của LẦN GỬI ĐÓ (fresh ở retry)
      return fetch(endpoint, {
        method: 'POST',
        // SA4E-241 SEC-01: send project identity so the backend scopes the write by
        // the authenticated project (not body.projectId).
        headers,
        body: makeBody(),
        // @ts-expect-error — Node.js fetch supports duplex for streaming uploads
        duplex: 'half', // BẮT BUỘC ở CẢ HAI lần gửi (undici yêu cầu cho streaming body)
      });
    }, "submit", log);

    if (res.status !== 202) {
      const text = await res.text().catch(() => '');
      // SA4E-362 FR-3: 401 persists sau refresh-retry → typed error (catch bằng instanceof).
      // SEC-02 (3.7): body 401 được cap 200 ký tự — không nhúng text upstream không giới hạn.
      if (res.status === 401) {
        throw new IngestAuthError(`Ingest submit failed: HTTP ${res.status} — ${this.truncate(text)}`, res.status);
      }
      throw new Error(`Ingest submit failed: HTTP ${res.status} — ${text}`); // non-401 giữ nguyên
    }

    const json = (await res.json()) as { data?: { jobId: string }; error?: unknown };
    const jobId = json.data?.jobId;
    if (!jobId) throw new Error('Backend returned 202 but no jobId');

    log(`[Pega Ingester] 📋 Job accepted: ${jobId}`);
    return jobId;
  }

  /** Poll the job status endpoint until done or failed */
  private async pollUntilComplete(jobId: string, projectId: string, log: LogFn): Promise<StreamIngestResult> {
    const statusUrl = `${this.backendUrl}/api/v1/pega/jobs/${jobId}`;

    while (true) {
      await this.sleep(POLL_INTERVAL_MS); // GIỮ NGUYÊN nhịp poll (POLL_INTERVAL_MS = 3000)

      // SA4E-362 FR-2 edge (c): headers rebuild MỖI iteration (cũ: build 1 lần —
      // 401 giữa poll không bao giờ có token mới). Mỗi poll attempt đi qua refresh-retry độc lập.
      const res = await this.fetchWithAuthRetry(async (token) => {
        const headers = this.authHeaders(projectId);
        if (token) { headers['Authorization'] = `Bearer ${token}`; }
        return fetch(statusUrl, { headers });
      }, "poll", log);

      if (!res.ok) {
        // SA4E-362 FR-3: 401 persists → typed error; non-401 giữ message hiện có.
        if (res.status === 401) {
          throw new IngestAuthError(`Job poll failed: HTTP ${res.status}`, res.status);
        }
        throw new Error(`Job poll failed: HTTP ${res.status}`);
      }

      const json = (await res.json()) as JobStatusResponse;
      const data = json.data;
      if (!data) throw new Error(`Job ${jobId} returned empty data`);

      if (data.status === 'processing') {
        const pct = data.progress.total > 0
          ? Math.round((data.progress.processed / data.progress.total) * 100)
          : 0;
        log(`[Pega Ingester] ⏳ Progress: ${data.progress.processed}/${data.progress.total} (${pct}%)`);
        continue;
      }

      if (data.status === 'done') {
        log(`[Pega Ingester] ✅ Job complete: ${data.result?.stored ?? 0} rules stored`);
        return data.result ?? { stored: 0 };
      }

      if (data.status === 'failed') {
        throw new Error(`Ingest job failed: ${data.error || 'unknown error'}`);
      }
    }
  }

  /** Promise-based sleep helper */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
