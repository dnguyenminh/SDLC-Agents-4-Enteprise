/**
 * PegaStreamIngester — Async NDJSON ingest client for Pega rules (SA4E-94).
 * Sends rules as NDJSON via chunked HTTP POST, receives 202 + jobId,
 * then polls GET /pega/jobs/:id every 3s until done or failed.
 */

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
 * Stream rules to backend via NDJSON POST, then poll for completion.
 * Pattern: Facade — simplifies async job lifecycle for callers.
 */
export class PegaStreamIngester {
  private readonly backendUrl: string;

  constructor(backendUrl: string) {
    this.backendUrl = backendUrl;
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
    return this.pollUntilComplete(jobId, log);
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

    // True streaming: use ReadableStream to avoid holding entire payload in memory
    const encoder = new TextEncoder();
    let idx = 0;
    const readable = new ReadableStream<Uint8Array>({
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

    const res = await fetch(endpoint, {
      method: 'POST',
      // SA4E-241 SEC-01: send project identity so the backend scopes the write by
      // the authenticated project (not body.projectId).
      headers: { 'Content-Type': 'application/x-ndjson', 'X-Project-Id': projectId },
      body: readable,
      // @ts-expect-error — Node.js fetch supports duplex for streaming uploads
      duplex: 'half',
    });

    if (res.status !== 202) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ingest submit failed: HTTP ${res.status} — ${text}`);
    }

    const json = (await res.json()) as { data?: { jobId: string }; error?: unknown };
    const jobId = json.data?.jobId;
    if (!jobId) throw new Error('Backend returned 202 but no jobId');

    log(`[Pega Ingester] 📋 Job accepted: ${jobId}`);
    return jobId;
  }

  /** Poll the job status endpoint until done or failed */
  private async pollUntilComplete(jobId: string, log: LogFn): Promise<StreamIngestResult> {
    const statusUrl = `${this.backendUrl}/api/v1/pega/jobs/${jobId}`;

    while (true) {
      await this.sleep(POLL_INTERVAL_MS);

      const res = await fetch(statusUrl);
      if (!res.ok) {
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
   * @returns Response with status, ruleId, and unresolvedDependencies
   */
  async ingestSingleRule(
    projectId: string,
    ruleJson: Record<string, unknown>,
    checksum?: string,
    version?: string,
  ): Promise<IngestSingleRuleResult> {
    const endpoint = `${this.backendUrl}/api/v1/pega/ingest-rule`;

    const body = JSON.stringify({ projectId, ruleJson, checksum, version });
    const res = await fetch(endpoint, {
      method: 'POST',
      // SA4E-241 SEC-01: send project identity for the write path (backend scopes
      // by identity, not body.projectId).
      headers: { 'Content-Type': 'application/json', 'X-Project-Id': projectId },
      body,
    });

    const json = (await res.json()) as IngestSingleRuleResponse;
    if (json.error) {
      throw new Error(`Ingest failed: ${json.error.message}`);
    }
    if (!json.data) {
      throw new Error('Ingest returned empty data');
    }

    return json.data;
  }
}
