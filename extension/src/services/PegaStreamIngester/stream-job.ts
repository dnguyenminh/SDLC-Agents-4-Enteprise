/**
 * Stream job lifecycle: NDJSON submit + status polling (SA4E-94, SA4E-362 FR-2).
 * Standalone functions — auth/retry/sanitization are injected by the facade class.
 */

import { type StreamMetadata, type JobStatusResponse, type LogFn, type StreamIngestResult, POLL_INTERVAL_MS } from "./ingest-types";
import { IngestAuthError, sanitizeIngestText } from "./ingest-auth";
import type { IngestAuthProvider } from "../../utils/backend-auth-headers";

/** Delegated instance behavior — built by PegaStreamIngester per call. */
export interface IngestJobContext {
  backendUrl: string;
  auth?: IngestAuthProvider;
  fetchWithAuthRetry: (
    send: (token: string | undefined) => Promise<Response>,
    endpoint?: string,
    log?: LogFn,
  ) => Promise<Response>;
  authHeaders: (projectId: string, extra?: Record<string, string>) => Record<string, string>;
  sanitize: (value: string) => string;
}

/** Promise-based sleep helper */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** POST the NDJSON body and extract jobId from 202 response */
export async function submitJobCore(
  ctx: IngestJobContext,
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

  const res = await ctx.fetchWithAuthRetry(async (token) => {
    const headers = ctx.authHeaders(projectId, { 'Content-Type': 'application/x-ndjson' });
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
      throw new IngestAuthError(`Ingest submit failed: HTTP ${res.status} — ${ctx.sanitize(text)}`, res.status);
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
export async function pollUntilCompleteCore(
  ctx: IngestJobContext,
  jobId: string,
  projectId: string,
  log: LogFn,
): Promise<StreamIngestResult> {
  const statusUrl = `${ctx.backendUrl}/api/v1/pega/jobs/${jobId}`;

  while (true) {
    await sleep(POLL_INTERVAL_MS); // GIỮ NGUYÊN nhịp poll (POLL_INTERVAL_MS = 3000)

    // SA4E-362 FR-2 edge (c): headers rebuild MỖI iteration (cũ: build 1 lần —
    // 401 giữa poll không bao giờ có token mới). Mỗi poll attempt đi qua refresh-retry độc lập.
    const res = await ctx.fetchWithAuthRetry(async (token) => {
      const headers = ctx.authHeaders(projectId);
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
