import { getSetting } from "../../config/settings-migration";
/**
 * IndexerHttpClientRetry — batch retry segment: exponential-backoff batch sends
 * (SA4E-99), per-file rejection classification (SA4E-300) and the file-level
 * retry-round configuration.
 * (Extracted from IndexerHttpClient.ts for BR-18; behavior unchanged.)
 */
import * as vscode from "vscode";
import {
    BatchWriteOutcomeResult,
    FileEntry,
    PostDetailResult,
    RejectionRecord,
} from "./types";
import { IndexerHttpClientTransport } from "./transport";

export class IndexerHttpClientRetry extends IndexerHttpClientTransport {
    /** SA4E-300: file-level retry tuning. Static (not readonly) so tests can shorten delays. */
    static FILE_RETRY_BASE_DELAY_MS = 1000;
    static FILE_RETRY_MAX_DELAY_MS = 30000;

    /**
     * SA4E-300: per-batch write outcome from a 200 index response.
     * The server awaits EVERY disk write before responding — async I/O is not
     * fire-and-forget — and reports per-file failures inside the body:
     *   /api/index/source    → { written, rejected, rejectedReasons }
     *   /api/index/documents → { indexed, rejected, rejectedReasons }
     * Falls back to batchLength when the field is absent (older servers).
     */
    protected static batchWriteOutcome(body: any, batchLength: number): BatchWriteOutcomeResult {
        const writtenField = typeof body?.written === 'number' ? body.written
            : typeof body?.indexed === 'number' ? body.indexed
            : batchLength;
        const rejectedReasons = Array.isArray(body?.rejectedReasons) ? body.rejectedReasons : [];
        const written = Math.max(0, Math.min(writtenField, batchLength));
        return { written, failed: batchLength - written, rejectedReasons };
    }

    /**
     * SA4E-300: classify a per-file rejection as retryable (transient) or permanent.
     * "Unsafe path" EACCES is a CLIENT bug — the path can never become safe, so
     * retrying would burn every round. ENOENT/EINVAL/ENAMETOOLONG/ENOTDIR/EISDIR
     * are permanent FS conditions. Everything else (ENOSPC disk-full, EIO, EBUSY,
     * EMFILE, EAGAIN, UNKNOWN…) is worth re-sending: space may free up, mounts
     * may recover, permissions may be fixed mid-run.
     */
    protected static isRetryableRejection(r: { code?: string; message?: string }): boolean {
        const code = String(r?.code || 'UNKNOWN').toUpperCase();
        const message = String(r?.message || '');
        if (code === 'EACCES' && /unsafe path/i.test(message)) { return false; }
        if (['ENOENT', 'EINVAL', 'ENAMETOOLONG', 'ENOTDIR', 'EISDIR'].includes(code)) { return false; }
        return true;
    }

    /**
     * SA4E-300: route each per-file rejection of a batch — retryable ones are
     * pushed back to the queue (with their content, ready to re-send), permanent
     * ones are returned for immediate reporting. Unknown paths (server echoed a
     * path we did not send) are treated as permanent to avoid queue corruption.
     */
    protected static classifyRejections(
        body: any, batch: FileEntry[], queue: FileEntry[],
    ): { queued: number; permanent: RejectionRecord[] } {
        const reasons: RejectionRecord[] =
            Array.isArray(body?.rejectedReasons) ? body.rejectedReasons : [];
        let queued = 0;
        const permanent: RejectionRecord[] = [];
        for (const r of reasons) {
            const entry = batch.find((b) => b.path === r.file);
            if (entry && IndexerHttpClientRetry.isRetryableRejection(r)) {
                queue.push(entry);
                queued++;
            } else {
                permanent.push({ file: r.file, code: String(r?.code || 'UNKNOWN'), message: String(r?.message || '') });
            }
        }
        return { queued, permanent };
    }

    /**
     * SA4E-99: Send batch with exponential backoff retry.
     * Retries on: 429 (server busy), 5xx, network errors (ECONNRESET, ECONNREFUSED, timeout).
     * Does NOT retry on 401 (handled by caller with token refresh).
     */
    protected async sendBatchWithRetry(
        url: string, payload: unknown, token: string | undefined, maxRetries: number,
    ): Promise<PostDetailResult> {
        let lastResult: PostDetailResult = { ok: false, error: 'no attempt', status: 0 };
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            if (attempt > 0) {
                // Exponential backoff: 2s, 4s, 8s (longer to allow server recovery)
                const delay = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
                await new Promise(r => setTimeout(r, delay));
            }
            lastResult = await this.httpPostWithDetail(url, payload, token);
            if (lastResult.ok) return lastResult;
            // Don't retry on 401 (auth issue) or 400 (client error)
            if (lastResult.status === 401 || lastResult.status === 400) return lastResult;
            // Retry on: 429, 5xx, network errors (status 0)
            const shouldRetry = lastResult.status === 429
                || lastResult.status >= 500
                || lastResult.status === 0;
            if (!shouldRetry) return lastResult;
        }
        return lastResult;
    }

    /** SA4E-300: read the configured file-retry rounds (0 when invalid/disabled). */
    protected readIndexRetryRounds(): number {
        const configuredRounds = Number(getSetting<number>("backend.indexRetryRounds", "backend.indexRetryRounds", 5));
        return Number.isFinite(configuredRounds) && configuredRounds > 0 ? Math.floor(configuredRounds) : 0;
    }
}
