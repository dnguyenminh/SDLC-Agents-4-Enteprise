/**
 * IndexerHttpClientUpload — source-file upload segment: workspace file
 * discovery, batched uploads with 401 token-refresh re-send (SA4E-300 GAP 3),
 * and the mandatory full-index trigger after upload.
 * (Extracted from IndexerHttpClient.ts for BR-18; behavior unchanged.)
 */
import * as vscode from "vscode";
// SA4E-261: unified extension whitelist shared with backend/src/config/unified-extensions.ts
import { UNIFIED_EXTENSIONS } from "../unified-extensions";
import { FileEntry, UploadResult } from "./types";
import { getIndexerOutput } from "./state";
import { IndexerHttpClientIngest } from "./ingest-api";

export class IndexerHttpClientUpload extends IndexerHttpClientIngest {
    async uploadSourceFiles(
        report: vscode.Progress<{ message?: string; increment?: number }>,
        token?: string,
        log?: (msg: string) => void
    ): Promise<UploadResult> {
        // Priority 1: Project source code (exclude all library/vendor directories at ANY depth)
        const libraryExcludes = "**/{node_modules,dist,.git,build,out,.opencode,vendor,packages,bower_components,.kilo,scratch,.code-intel,.analysis,SDLC-Agents-4-Enterprise}/**";
        const projectFiles = await vscode.workspace.findFiles(
            `**/*.{${UNIFIED_EXTENSIONS.join(',')}}`, libraryExcludes
        );

        if (projectFiles.length === 0) { return { uploaded: 0, errors: 0, summary: "ℹ️ No source files found" }; }

        const url = `${this.backendUrl}/api/index/source`;
        let uploaded = 0;
        let errors = 0;
        // Create output channel for detailed error reporting
        const channel = getIndexerOutput();
        // SA4E-300: file-level retry — files the server fails to persist are
        // re-sent (with exponential backoff) until accepted or rounds exhausted.
        const retryRounds = this.readIndexRetryRounds();
        const retryQueue: FileEntry[] = [];

        // Upload project code first (high priority)
        const staged = await this.uploadAllBatches(projectFiles, url, token, report, log, retryQueue);
        uploaded += staged.uploaded;
        errors += staged.errors;
        token = staged.token;
        const drained = await this.drainSourceRetries(retryQueue, url, token, retryRounds, report, log);
        uploaded += drained.uploaded;
        errors += drained.errors;
        errors += staged.permanent;

        report.report({ message: `Indexing source code: 100% complete`, increment: 0 });

        const fullIndexFailed = await this.runFullIndexAfterUpload(uploaded, token, report);
        const summary = this.buildUploadSummary(uploaded, errors, fullIndexFailed);
        return { uploaded, errors, summary };
    }

    /** Upload every project batch, handling 401 refresh + retry queueing per batch. */
    private async uploadAllBatches(
        projectFiles: vscode.Uri[],
        url: string,
        token: string | undefined,
        report: vscode.Progress<{ message?: string; increment?: number }>,
        log: ((msg: string) => void) | undefined,
        retryQueue: FileEntry[],
    ): Promise<{ uploaded: number; errors: number; permanent: number; token: string | undefined }> {
        let uploaded = 0;
        let errors = 0;
        let permanentFailures = 0;
        const totalFiles = projectFiles.length;
        const batchSize = 20; // SA4E-99: reduced from 50 to avoid timeout on large files
        const totalBatches = Math.ceil(totalFiles / batchSize);
        const incrementPerBatch = 100 / totalBatches;
        for (let i = 0; i < totalFiles; i += batchSize) {
            const batch = projectFiles.slice(i, i + batchSize);
            const outcome = await this.uploadOneBatch(batch, i, batchSize, totalFiles, totalBatches, incrementPerBatch, url, token, report, log, retryQueue);
            uploaded += outcome.uploaded;
            errors += outcome.errors;
            permanentFailures += outcome.permanent;
            token = outcome.token;
        }
        return { uploaded, errors, permanent: permanentFailures, token };
    }

    /** Upload one project batch: progress, pacing delay, staging, retry semantics. */
    private async uploadOneBatch(
        batch: vscode.Uri[],
        batchIndex: number,
        batchSize: number,
        totalFiles: number,
        totalBatches: number,
        incrementPerBatch: number,
        url: string,
        token: string | undefined,
        report: vscode.Progress<{ message?: string; increment?: number }>,
        log: ((msg: string) => void) | undefined,
        retryQueue: FileEntry[],
    ): Promise<{ uploaded: number; errors: number; permanent: number; token: string | undefined }> {
        const batchNum = Math.floor(batchIndex / batchSize) + 1;
        const pct = Math.round((batchIndex / totalFiles) * 100);
        const progressMsg = `Indexing source code: ${pct}% (${batchIndex + 1}/${totalFiles} files, batch ${batchNum}/${totalBatches})`;
        report.report({ message: progressMsg, increment: incrementPerBatch });
        if (log) { log(progressMsg); }
        // SA4E-99: Delay between batches to prevent server overload (PG pool exhaustion)
        if (batchIndex > 0) { await new Promise(r => setTimeout(r, 500)); }
        const entries = await this.buildSourceEntries(batch);
        // SA4E-99: Retry with exponential backoff for 429/5xx/network errors
        const result = await this.sendBatchWithRetry(url, { files: entries }, token, 3);
        if (result.ok) {
            const applied = this.applySourceWriteOutcome(result.body, entries, batch.length, `Batch ${batchNum}/${totalBatches}`, retryQueue);
            return { uploaded: applied.written, errors: 0, permanent: applied.permanent, token };
        }
        if (result.status === 401 && this.tokenRefresher) {
            const retried = await this.handleSourceBatch401(url, entries, batch.length, `Batch ${batchNum}/${totalBatches}`, token, retryQueue);
            return { uploaded: retried.uploaded, errors: retried.errors, permanent: 0, token: retried.token };
        }
        // SA4E-300: HTTP attempts exhausted — the server never accepted these
        // files. Queue them for file-level retry instead of dropping them.
        retryQueue.push(...entries);
        this.logSourceBatchFailure(`\n⚠️ Batch ${batchNum}/${totalBatches} FAILED (${entries.length} files) — queued for retry`, result);
        return { uploaded: 0, errors: 0, permanent: 0, token };
    }

    /** Compose the final upload summary (full-index failure taints the result). */
    private buildUploadSummary(uploaded: number, errors: number, fullIndexFailed: boolean): string {
        // Summary must reflect reality: a successful upload with a failed full index is
        // NOT a successful index (symbols = 0). Do not report "✅ Indexed" in that case.
        if (fullIndexFailed) {
            return `❌ Uploaded ${uploaded} files but full index FAILED — no code symbols generated (see Output > Kiro Indexer)`;
        }
        return `✅ Indexed ${uploaded} project files` + (errors > 0 ? `, ⚠️ Failed: ${errors} (see Output > Kiro Indexer for details)` : "");
    }

    /**
     * SA4E-99: Trigger full re-index ONCE after all files written (not per-batch).
     * The full index is the step that PARSES uploaded files into symbols — uploading
     * alone produces 0 symbols. If it fails, the whole indexing run is effectively a
     * no-op, so the failure MUST surface (not be swallowed) and MUST taint the summary.
     * @returns true when the full index failed (result must be tainted).
     */
    private async runFullIndexAfterUpload(
        uploaded: number,
        token: string | undefined,
        report: vscode.Progress<{ message?: string; increment?: number }>,
    ): Promise<boolean> {
        if (uploaded <= 0) { return false; }
        report.report({ message: "Running full index on uploaded files..." });
        const full = await this.triggerFullIndex(token);
        if (full.ok) {
            // SA4E-99: Poll backend progress until index + LLM enrichment complete
            this.pollIndexProgress(token).catch(() => {}); // fire-and-forget, shows status bar
            return false;
        }
        this.logFullIndexFailure(full);
        return true;
    }

    /** Surface a failed full index — uploaded files were never parsed into symbols. */
    private logFullIndexFailure(full: { ok: boolean; status: number; error: string; details?: string; action?: string }): void {
        const channel = getIndexerOutput();
        channel.appendLine(`\n❌ Full index FAILED — uploaded files were NOT parsed into symbols.`);
        channel.appendLine(`   Status: ${full.status} | Error: ${full.error}`);
        if (full.details) { channel.appendLine(`   Details: ${full.details}`); }
        if (full.action) { channel.appendLine(`   Action: ${full.action}`); }
        channel.show(true);
        vscode.window.showErrorMessage(
            `Indexing incomplete: files uploaded but full index failed (${full.status || 'network error'}). Code symbols were not generated — see Output > Kiro Indexer.`,
        );
    }

    /**
     * SA4E-99: Trigger a full re-index on backend after all source files are written.
     * Returns a structured result so the caller can surface failures — a swallowed
     * failure here silently leaves the KB with 0 symbols despite a "successful" upload.
     * @returns ok=true on 2xx; otherwise ok=false with status/error/details for reporting.
     */
    private async triggerFullIndex(
        token?: string,
    ): Promise<{ ok: boolean; status: number; error: string; details?: string; action?: string }> {
        const url = `${this.backendUrl}/api/index/full`;
        let result = await this.httpPostWithDetail(url, {}, token);
        // Source upload can take minutes on large repos, so the JWT may expire before
        // the final full-index POST. Refresh once on 401 and retry (same pattern as batch upload).
        if (result.status === 401 && this.tokenRefresher) {
            const freshToken = await this.tokenRefresher();
            if (freshToken) {
                this.notifyTokenRefreshed(freshToken);
                result = await this.httpPostWithDetail(url, {}, freshToken);
            }
        }
        if (!result.ok) {
            // Do NOT swallow — return the failure so uploadSourceFiles can report it.
            return { ok: false, status: result.status, error: result.error, details: result.details, action: result.action };
        }
        return { ok: true, status: result.status || 200, error: '' };
    }
}
