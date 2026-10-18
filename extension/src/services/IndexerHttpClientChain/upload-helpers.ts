/**
 * IndexerHttpClientUploadHelpers — source-upload support segment: workspace
 * entry staging, per-batch 200-outcome application, 401 re-send handling
 * (SA4E-300 GAP 3), failed-batch logging, and the source retry-queue drain.
 * (Extracted from IndexerHttpClient.ts for BR-18; behavior unchanged.)
 */
import * as vscode from "vscode";
import { FileEntry, PostDetailResult } from "./types";
import { getIndexerOutput } from "./state";
import { IndexerHttpClientRetryDrain } from "./retry-drain";

export class IndexerHttpClientUploadHelpers extends IndexerHttpClientRetryDrain {
    /** SA4E-99: Read a batch of project files and strip the workspace root prefix. */
    protected async buildSourceEntries(batch: readonly vscode.Uri[]): Promise<FileEntry[]> {
        return Promise.all(
            batch.map(async (file) => {
                const content = await vscode.workspace.fs.readFile(file);
                // SA4E-99: Strip workspace folder prefix to avoid nested folder creation
                const folder = vscode.workspace.getWorkspaceFolder(file);
                let relPath: string;
                if (folder) {
                    relPath = file.fsPath.substring(folder.uri.fsPath.length + 1).replace(/\\/g, '/');
                } else {
                    // Fallback: strip first workspace folder path manually
                    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
                    relPath = file.fsPath.startsWith(root)
                        ? file.fsPath.substring(root.length + 1).replace(/\\/g, '/')
                        : file.fsPath.replace(/\\/g, '/');
                }
                return { path: relPath, content: Buffer.from(content).toString("utf-8") };
            })
        );
    }

    /**
     * SA4E-300: apply a 200 write outcome — count real writes, classify
     * rejections (transient → re-queued) and log permanent ones.
     * @returns counts to accumulate into the caller's totals.
     */
    protected applySourceWriteOutcome(
        body: any, entries: FileEntry[], batchLen: number, label: string, retryQueue: FileEntry[],
    ): { written: number; permanent: number } {
        const channel = getIndexerOutput();
        const outcome = IndexerHttpClientRetryDrain.batchWriteOutcome(body, batchLen);
        const classified = IndexerHttpClientRetryDrain.classifyRejections(body, entries, retryQueue);
        if (classified.queued > 0) {
            channel.appendLine(`⚠️ ${label}: ${classified.queued}/${batchLen} file(s) failed to save (transient) — queued for retry`);
        }
        for (const r of classified.permanent) {
            channel.appendLine(`   ✗ Permanent: ${r.file} — ${r.code}: ${r.message}`);
        }
        if (classified.queued > 0 || classified.permanent.length > 0) { channel.show(true); }
        return { written: outcome.written, permanent: classified.permanent.length };
    }

    /**
     * SA4E-300 GAP 3: handle a 401 on the batch POST — refresh the token once,
     * propagate it to subscribers, and re-send the batch. Returns the counts to
     * accumulate plus the (possibly refreshed) token for subsequent calls.
     */
    protected async handleSourceBatch401(
        url: string,
        entries: FileEntry[],
        batchLen: number,
        batchLabel: string,
        token: string | undefined,
        retryQueue: FileEntry[],
    ): Promise<{ uploaded: number; errors: number; token: string | undefined }> {
        let uploaded = 0;
        let errors = 0;
        const freshToken = await this.tokenRefresher?.();
        if (!freshToken) {
            errors += batchLen;
            const channel = getIndexerOutput();
            channel.appendLine(`\n⚠️ ${batchLabel} FAILED — no token`);
            channel.show(true);
            return { uploaded, errors, token };
        }
        // SA4E-300 GAP 3: propagate the refreshed token to subscribers
        this.notifyTokenRefreshed(freshToken);
        const retry = await this.sendBatchWithRetry(url, { files: entries }, freshToken, 2);
        const applied = await this.applyRefreshedRetry(retry, entries, batchLen, batchLabel, retryQueue);
        return { uploaded: uploaded + applied.uploaded, errors: errors + applied.errors, token: freshToken };
    }

    /** Handle the re-sent batch result after a token refresh (SA4E-300). */
    private async applyRefreshedRetry(
        retry: PostDetailResult, entries: FileEntry[], batchLen: number,
        batchLabel: string, retryQueue: FileEntry[],
    ): Promise<{ uploaded: number; errors: number }> {
        if (retry.ok) {
            const applied = this.applySourceWriteOutcome(retry.body, entries, batchLen, `${batchLabel} (after token refresh)`, retryQueue);
            return { uploaded: applied.written, errors: applied.permanent };
        }
        if (retry.status === 401) {
            // Auth is broken beyond this token — retrying cannot succeed.
            this.logSourceBatchFailure(`\n⚠️ ${batchLabel} FAILED after token refresh (auth)`, retry);
            return { uploaded: 0, errors: batchLen };
        }
        // SA4E-300: server never accepted these files — queue, don't drop.
        retryQueue.push(...entries);
        this.logSourceBatchFailure(`\n⚠️ ${batchLabel} FAILED after token refresh — ${entries.length} file(s) queued for retry`, retry);
        return { uploaded: 0, errors: 0 };
    }

    /** Log a failed batch with its error envelope (details/action when present). */
    protected logSourceBatchFailure(
        header: string, result: { error: string; details?: string; action?: string; status: number },
    ): void {
        const channel = getIndexerOutput();
        channel.appendLine(header);
        channel.appendLine(`   Error: ${result.error} | Status: ${result.status}`);
        if (result.details) channel.appendLine(`   Details: ${result.details}`);
        if (result.action) channel.appendLine(`   Action: ${result.action}`);
        channel.show(true);
    }

    /**
     * SA4E-300: drain the file-retry queue BEFORE the full index — every file
     * that can still be saved must be on disk before parsing starts.
     */
    protected async drainSourceRetries(
        retryQueue: FileEntry[], url: string, token: string | undefined, retryRounds: number,
        report: vscode.Progress<{ message?: string; increment?: number }>,
        log: ((msg: string) => void) | undefined,
    ): Promise<{ uploaded: number; errors: number }> {
        let uploaded = 0;
        let errors = 0;
        const channel = getIndexerOutput();
        if (retryQueue.length > 0 && retryRounds > 0) {
            report.report({ message: `Retrying ${retryQueue.length} unsaved file(s)...`, increment: 0 });
            const drain = await this.drainRetryQueue(retryQueue, url, token, retryRounds, log);
            uploaded += drain.uploaded;
            errors += drain.errors;
        }
        if (retryQueue.length > 0) {
            errors += retryQueue.length;
            channel.appendLine(`\n❌ ${retryQueue.length} file(s) still not saved after ${retryRounds} retry round(s) — re-run indexing to try again.`);
            channel.show(true);
        }
        return { uploaded, errors };
    }
}
