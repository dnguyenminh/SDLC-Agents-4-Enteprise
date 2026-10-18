/**
 * IndexerHttpClientRetryDrain — file-level retry drain (SA4E-300): re-sends
 * files the server failed to persist until they are accepted or the configured
 * retry rounds run out.
 * (Extracted from IndexerHttpClient.ts for BR-18; behavior unchanged.)
 */
import { FileEntry, FileRetryDelaySource } from "./types";
import { getIndexerOutput } from "./state";
import { IndexerHttpClientRetry } from "./retry";

export class IndexerHttpClientRetryDrain extends IndexerHttpClientRetry {
    /**
     * SA4E-300: drain the file-retry queue — re-send files the server failed to
     * persist UNTIL they are accepted or the configured retry rounds run out
     * (sdlcAgents.backend.indexRetryRounds, default 5). Exponential backoff
     * between rounds; permanent rejections are never retried. Files that still
     * fail after all rounds stay in the queue for the caller to count/report.
     */
    protected async drainRetryQueue(
        queue: FileEntry[],
        url: string,
        token: string | undefined,
        rounds: number,
        log?: (msg: string) => void,
    ): Promise<{ uploaded: number; errors: number }> {
        const channel = getIndexerOutput();
        let uploaded = 0;
        let errors = 0;
        for (let round = 1; round <= rounds && queue.length > 0; round++) {
            // Read via the runtime class so test-mutated statics are honored.
            const retryDelays = this.constructor as unknown as FileRetryDelaySource;
            const delay = Math.min(
                retryDelays.FILE_RETRY_BASE_DELAY_MS * Math.pow(2, round - 1),
                retryDelays.FILE_RETRY_MAX_DELAY_MS,
            );
            await new Promise((r) => setTimeout(r, delay));
            const pending = queue.splice(0);
            const outcome = await this.runRetryRound(pending, url, token, rounds, round, queue, log);
            uploaded += outcome.uploaded;
            errors += outcome.errors;
        }
        return { uploaded, errors };
    }

    /** Re-send one drained round of pending files (round banner + batch loop). */
    private async runRetryRound(
        pending: FileEntry[], url: string, token: string | undefined,
        rounds: number, round: number, queue: FileEntry[], log?: (msg: string) => void,
    ): Promise<{ uploaded: number; errors: number }> {
        const channel = getIndexerOutput();
        let uploaded = 0;
        let errors = 0;
        const msg = `🔄 Retrying ${pending.length} file(s) not yet saved (round ${round}/${rounds})...`;
        channel.appendLine(msg);
        if (log) { log(msg); }
        const retryBatchSize = 20;
        for (let i = 0; i < pending.length; i += retryBatchSize) {
            const batch = pending.slice(i, i + retryBatchSize);
            const outcome = await this.resendRetryBatch(batch, url, token, queue);
            uploaded += outcome.uploaded;
            errors += outcome.errors;
        }
        return { uploaded, errors };
    }

    /** Re-send one pending batch; still-failing files are pushed back onto the queue. */
    private async resendRetryBatch(
        batch: FileEntry[], url: string, token: string | undefined, queue: FileEntry[],
    ): Promise<{ uploaded: number; errors: number }> {
        const channel = getIndexerOutput();
        let uploaded = 0;
        let errors = 0;
        const result = await this.sendBatchWithRetry(url, { files: batch }, token, 2);
        if (!result.ok) {
            queue.push(...batch); // still not accepted by the server — next round
            return { uploaded, errors };
        }
        const outcome = IndexerHttpClientRetry.batchWriteOutcome(result.body, batch.length);
        uploaded += outcome.written;
        const classified = IndexerHttpClientRetry.classifyRejections(result.body, batch, queue);
        for (const r of classified.permanent) {
            errors++;
            channel.appendLine(`   ✗ Permanent: ${r.file} — ${r.code}: ${r.message}`);
        }
        return { uploaded, errors };
    }
}
