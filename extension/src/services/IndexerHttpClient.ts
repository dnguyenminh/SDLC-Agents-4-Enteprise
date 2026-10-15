/**
 * HTTP client for indexer operations — document ingestion and source file upload.
 * Delegates raw HTTP to http-client-utils for DRY compliance.
 */
import * as vscode from "vscode";
import * as path from "path";
import { httpPostJson as utilHttpPostJson } from "../utils/http-client-utils";
// SA4E-261: unified extension whitelist shared with backend/src/config/unified-extensions.ts
import { UNIFIED_EXTENSIONS } from "./unified-extensions";

export interface DocEntry {
    path: string;
    type: string;
    ticket: string;
    format?: string;
    content?: string;
}

export interface FileEntry {
    path: string;
    content: string;
}

export interface UnconvertibleEntry {
    file: string;
    reason: string;
}

export interface IngestResult {
    ingested: number;
    errors: number;
    summary: string;
    unconvertible: UnconvertibleEntry[];
}

export interface UploadResult {
    uploaded: number;
    errors: number;
    summary: string;
}

export class IndexerHttpClient {
    private tokenRefresher?: () => Promise<string | undefined>;
    private onTokenRefreshed?: (token: string) => void;
    private lastRefreshedToken?: string;
    private static outputChannel?: vscode.OutputChannel;
    private _autoRegisterAttempted = false;

    constructor(private readonly backendUrl: string) {}

    static getIndexerOutput(): vscode.OutputChannel {
        if (!IndexerHttpClient.outputChannel) {
            IndexerHttpClient.outputChannel = vscode.window.createOutputChannel("Kiro Indexer");
        }
        return IndexerHttpClient.outputChannel;
    }

    /**
     * Extract detailed failure reason from progress payload. Backend returns
     * `error: {message, stack, file}` — surface it instead of 'unknown error'.
     */
    static formatIndexError(progress: any): string {
        const msg = progress?.error?.message || progress?.message || 'unknown error';
        const file = progress?.error?.file || progress?.currentFile;
        return file ? `${msg} (file: ${file})` : msg;
    }

    /**
     * Persist a terminal (non-success) index outcome to the Output channel so it
     * outlives the transient status bar item (which auto-disposes after 5–8s).
     * Logs phase/status/percentage/file so the user can diagnose after the fact.
     * @param outcome Terminal state label (failed/interrupted/cancelled/timeout)
     * @param progress Last parsed progress payload from /api/index/progress
     * @param reveal When true, bring the Output channel to front (used for failures)
     */
    /**
     * Derive a display percentage, computing from current/total when the
     * backend omits the percentage field. Returns null when unknowable.
     */
    static progressPct(progress: any): number | null {
        if (typeof progress?.percentage === 'number') return progress.percentage;
        if (typeof progress?.current === 'number' && typeof progress?.total === 'number'
            && progress.total > 0) {
            return Math.round((progress.current / progress.total) * 100);
        }
        return null;
    }

    static logTerminalIndexState(outcome: string, progress: any, reveal: boolean): void {
        const channel = IndexerHttpClient.getIndexerOutput();
        const when = new Date().toLocaleTimeString();
        const pct = typeof progress?.percentage === 'number' ? `${progress.percentage}%` : 'n/a';
        const counts = (typeof progress?.current === 'number' && typeof progress?.total === 'number')
            ? ` (${progress.current}/${progress.total} files)` : '';
        const elapsed = typeof progress?.elapsedMs === 'number' ? ` after ${Math.round(progress.elapsedMs / 1000)}s` : '';
        const file = progress?.currentFile ? ` — last file: ${progress.currentFile}` : '';
        const errMsg = progress?.error?.message || progress?.message;
        const detail = errMsg ? ` — ${IndexerHttpClient.formatIndexError(progress)}` : '';
        const icon = outcome === 'complete' ? '✅' : '❌';
        channel.appendLine(
            `[Indexer] ${icon} Index ${outcome} @ ${when} — phase ${progress?.phase ?? 'unknown'}, ${pct}${counts}${elapsed}${file}${detail}`,
        );
        if (progress?.error?.stack) { channel.appendLine(`   Stack: ${progress.error.stack}`); }
        if (reveal) { channel.show(true); }
    }

    /** SA4E-99: Set token refresher callback — called on 401 to get a fresh token. */
    setTokenRefresher(refresher: () => Promise<string | undefined>): void {
        this.tokenRefresher = refresher;
    }
    /**
     * SA4E-300 GAP 3: Subscribe to refreshed tokens so long-lived callers
     * (IndexingService) can update their stored token. Optional — does not
     * change existing call signatures.
     */
    setOnTokenRefreshed(cb: (token: string) => void): void {
        this.onTokenRefreshed = cb;
    }
    /** SA4E-300 GAP 3: Last token obtained via refresh (undefined if never refreshed). */
    getCurrentToken(): string | undefined {
        return this.lastRefreshedToken;
    }
    private notifyTokenRefreshed(token: string): void {
        this.lastRefreshedToken = token;
        try { this.onTokenRefreshed?.(token); } catch { /* non-fatal */ }
    }
	/** Expose backend base URL for other callers. */
	getBaseUrl(): string { return this.backendUrl; }

	/** SA4E-215: Auto-register project if backend reports PROJECT_NOT_REGISTERED. */
	private async maybeAutoRegister(token?: string): Promise<boolean> {
		if (this._autoRegisterAttempted) return false;
		this._autoRegisterAttempted = true;
		const workspaceFolders = vscode.workspace.workspaceFolders;
		const workspaceFolder = workspaceFolders?.[0]?.uri.fsPath || '';
		const folderName = workspaceFolder ? path.basename(workspaceFolder) : 'unknown';
		const { getProjectId } = await import("../extension");
		const projectId = getProjectId();
		if (!projectId) return false;
		try {
			const headers = await this.buildHeaders(token);
			const resp = await fetch(`${this.backendUrl}/api/admin/projects/register`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...headers },
				body: JSON.stringify({ projectId, displayName: folderName, workspacePath: workspaceFolder }),
				signal: AbortSignal.timeout(15000),
			});
			if (resp.ok) {
				IndexerHttpClient.getIndexerOutput().appendLine(`[IndexerHttpClient] Auto-registered project: ${projectId}`);
				return true;
			}
			return false;
		} catch (err) {
			IndexerHttpClient.getIndexerOutput().appendLine(`[IndexerHttpClient] Auto-register failed: ${(err as Error).message}`);
			return false;
		}
	}

	/**
     * SA4E-99: Poll /api/index/progress until idle. Shows status bar progress.
     * Resolves when indexing completes or times out after maxWaitMs.
     */
    async pollIndexProgress(token?: string, maxWaitMs = 900000): Promise<void> {
        const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
        statusBar.show();
        const start = Date.now();
        let lastProgress: any = null;
        let lastPct: number | null = null;
        try {
            while (Date.now() - start < maxWaitMs) {
                await new Promise(r => setTimeout(r, 2000));
                // Shared GET path: 401 refresh + 10s timeout. A raw fetch here
                // loses auth mid-run (long index → expired JWT → 401) and the
                // bar collapses to a %‑less "Indexing..." for the rest of the run.
                const { ok, body } = await this.getIndexProgress(token);
                if (!ok) {
                    statusBar.text = lastPct !== null
                        ? `$(sync~spin) Indexing: ${lastPct}% (reconnecting…)`
                        : "$(sync~spin) Indexing...";
                    statusBar.tooltip = "Code Intelligence: Indexing workspace... (progress poll retrying)";
                    continue;
                }
                try {
                    const progress = JSON.parse(body);
                    lastProgress = progress;
                    const status = progress.status;
                    if (status === 'idle' || progress.phase === 'idle') {
                        statusBar.text = "$(check) Index complete";
                        statusBar.tooltip = "Code Intelligence: Indexing finished successfully";
                        setTimeout(() => statusBar.dispose(), 5000);
                        return;
                    }
                    if (status === 'interrupted') {
                        statusBar.text = "$(warning) Index interrupted";
                        statusBar.tooltip = "Code Intelligence: Indexing was interrupted by backend restart";
                        // Persist to Output — the transient status bar vanishes after 8s.
                        IndexerHttpClient.logTerminalIndexState('interrupted', progress, false);
                        setTimeout(() => statusBar.dispose(), 8000);
                        return;
                    }
                    if (status === 'superseded') {
                        statusBar.text = "$(info) Index superseded";
                        statusBar.tooltip = "Code Intelligence: Previous index was superseded by a new run";
                        setTimeout(() => statusBar.dispose(), 8000);
                        return;
                    }
                    if (status === 'completed' || progress.phase === 'complete') {
                        statusBar.text = "$(check) Index complete";
                        statusBar.tooltip = "Code Intelligence: Indexing finished successfully";
                        IndexerHttpClient.logTerminalIndexState('complete', progress, false);
                        setTimeout(() => statusBar.dispose(), 5000);
                        return;
                    }
                    if (status === 'failed' || progress.phase === 'error') {
                        const errDetail = IndexerHttpClient.formatIndexError(progress);
                        statusBar.text = "$(error) Index failed";
                        statusBar.tooltip = `Code Intelligence: Indexing failed — ${errDetail}`;
                        // Persist + surface: failure detail must outlive the 8s status bar so
                        // the user can read why the index failed (see Output > Kiro Indexer).
                        IndexerHttpClient.logTerminalIndexState('failed', progress, true);
                        vscode.window.showErrorMessage(`Indexing failed: ${errDetail}`, "Open Output")
                            .then(action => { if (action === "Open Output") { IndexerHttpClient.getIndexerOutput().show(); } });
                        setTimeout(() => statusBar.dispose(), 8000);
                        return;
                    }
                    if (status === 'cancelled' || progress.phase === 'cancelled') {
                        statusBar.text = "$(stop) Index cancelled";
                        statusBar.tooltip = "Code Intelligence: Indexing was cancelled";
                        IndexerHttpClient.logTerminalIndexState('cancelled', progress, false);
                        setTimeout(() => statusBar.dispose(), 5000);
                        return;
                    }
                    const elapsed = Math.round((progress.elapsedMs || 0) / 1000);
                    const checksumStats = progress.checksumStats;
                    let checksumInfo = '';
                    if (checksumStats) {
                        checksumInfo = `\nChecksum: skipped ${checksumStats.files_skipped}, processed ${checksumStats.files_processed}, pending ${checksumStats.files_pending}`;
                    }
                    const pct = IndexerHttpClient.progressPct(progress);
                    if (pct !== null) lastPct = pct;
                    const shown = pct ?? lastPct;
                    const pctText = shown !== null ? `${shown}%` : 'n/a';
                    statusBar.text = shown !== null ? `$(sync~spin) Indexing: ${shown}%` : "$(sync~spin) Indexing...";
                    statusBar.tooltip = `Code Intelligence — ${progress.phase}${status ? ' (' + status + ')' : ''}\n`
                        + `Progress: ${progress.current}/${progress.total} files (${pctText})\n`
                        + `Elapsed: ${elapsed}s${checksumInfo}\n`
                        + (progress.currentFile ? `Current: ${progress.currentFile}` : '');
                } catch {
                    statusBar.text = lastPct !== null
                        ? `$(sync~spin) Indexing: ${lastPct}% (reconnecting…)`
                        : "$(sync~spin) Indexing...";
                    statusBar.tooltip = "Code Intelligence: Processing... (progress poll retrying)";
                }
            }
            statusBar.text = "$(warning) Index timeout";
            // Persist + reveal — a timeout is a failure the user needs to see.
            IndexerHttpClient.logTerminalIndexState('timeout', lastProgress ?? {}, true);
            setTimeout(() => statusBar.dispose(), 5000);
        } catch { statusBar.dispose(); }
    }

    async ingestDocuments(
        docs: DocEntry[],
        report: vscode.Progress<{ message?: string }>,
        token?: string
    ): Promise<IngestResult> {
        // SA4E-99: Unified approach — write docs to Temp (same as source), then batch ingest
        let ingested = 0;
        let errors = 0;
        const unconvertible: UnconvertibleEntry[] = [];
        // SA4E-300 GAP 3: reuse singleton channel (was a fresh "Kiro Doc Indexer" per call)
        const channel = IndexerHttpClient.getIndexerOutput();
        // SA4E-300: file-level retry for doc writes (same policy as source uploads).
        const configuredRounds = Number(vscode.workspace.getConfiguration("sdlcAgents").get<number>("backend.indexRetryRounds", 5));
        const retryRounds = Number.isFinite(configuredRounds) && configuredRounds > 0 ? Math.floor(configuredRounds) : 0;
        const retryQueue: FileEntry[] = [];
        let permanentFailures = 0;
        const batchSize = 20;

        for (let i = 0; i < docs.length; i += batchSize) {
            const batch = docs.slice(i, i + batchSize);
            const batchNum = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(docs.length / batchSize);
            const pct = Math.round((i / docs.length) * 100);
            report.report({ message: `Ingesting documents: ${pct}% (${i + 1}/${docs.length} files, batch ${batchNum}/${totalBatches})` });
            if (i > 0) { await new Promise(r => setTimeout(r, 200)); }

            const entries: FileEntry[] = [];
            for (const d of batch) {
                let fileContent = d.content;
                if (!fileContent) { fileContent = await this.readFileContent(d.path); }
                if (!fileContent) { errors++; channel.appendLine(`⚠️ ${d.path}: no content`); continue; }
                entries.push({ path: d.path, content: fileContent });
            }

            if (entries.length === 0) continue;

            // Write to Temp via /api/index/documents (batch write to disk)
            const writeResult = await this.sendBatchWithRetry(
                `${this.backendUrl}/api/index/documents`,
                { files: entries }, token, 3,
            );
            if (writeResult.ok) {
                // SA4E-300: per-file disk-write failures arrive INSIDE the 200 body —
                // count real writes; retryable rejections are re-queued with backoff.
                const outcome = IndexerHttpClient.batchWriteOutcome(writeResult.body, entries.length);
                ingested += outcome.written;
                const classified = IndexerHttpClient.classifyRejections(writeResult.body, entries, retryQueue);
                permanentFailures += classified.permanent.length;
                if (classified.queued > 0) {
                    channel.appendLine(`⚠️ Doc batch ${Math.floor(i / batchSize) + 1}: ${classified.queued}/${entries.length} file(s) failed to save (transient) — queued for retry`);
                }
                for (const r of classified.permanent) {
                    channel.appendLine(`   ✗ Permanent: ${r.file} — ${r.code}: ${r.message}`);
                }
            } else {
                // SA4E-300: server never accepted these files — queue, don't drop.
                retryQueue.push(...entries);
                channel.appendLine(`⚠️ Doc batch ${Math.floor(i / batchSize) + 1}: ${writeResult.error} — ${entries.length} file(s) queued for retry`);
            }
        }

        // SA4E-300: retry unsaved doc files BEFORE the single KB ingest call.
        if (retryQueue.length > 0 && retryRounds > 0) {
            const drain = await this.drainRetryQueue(retryQueue, `${this.backendUrl}/api/index/documents`, token, retryRounds);
            ingested += drain.uploaded;
            errors += drain.errors;
        }
        if (retryQueue.length > 0) {
            errors += retryQueue.length;
            channel.appendLine(`❌ ${retryQueue.length} doc file(s) still not saved after ${retryRounds} retry round(s).`);
        }
        errors += permanentFailures;

        if (errors > 0) { channel.show(true); }

        // Trigger KB ingest from Temp files (single call)
        let kbIngested = 0;
        let kbErrors = 0;
        if (ingested > 0) {
            report.report({ message: "Running document KB ingest..." });
            const kbResult = await this.triggerDocumentIngest(token);
            kbIngested = kbResult.ingested;
            kbErrors = kbResult.errors;
        }

        const parts = [`✅ Indexed: ${ingested} files`];
        if (errors > 0) { parts.push(`⚠️ Failed: ${errors}`); }
        if (unconvertible.length > 0) { parts.push(`⏭️ Un-convertible: ${unconvertible.length}`); }
        // SA4E-337 F7: only surface the KB line when a KB ingest actually ran/report something.
        if (kbIngested + kbErrors > 0) { parts.push(`📚 KB: ${kbIngested} ingested`); }
        return { ingested, errors, summary: parts.join(", "), unconvertible };
    }

    /**
     * SA4E-99: Trigger backend to ingest documents from Temp folder into KB.
     * SA4E-337 F5: on non-OK responses the body is parsed for {error, details, action}
     * so the user sees the same detail lines as httpPostWithDetail produced before
     * the rewrite (60s timeout and return shape unchanged).
     */
    private async triggerDocumentIngest(token?: string): Promise<{ ingested: number; errors: number; total: number }> {
        const url = `${this.backendUrl}/api/index/ingest-docs`;
        const headers = await this.buildHeaders(token);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...headers },
                body: JSON.stringify({}),
                signal: AbortSignal.timeout(60000),
            });
            const bodyText = await response.text();
            const channel = IndexerHttpClient.getIndexerOutput();
            if (!response.ok) {
                // F5: restore error/details/action surfacing (was dropped with httpPostWithDetail)
                const detail = IndexerHttpClient.parseErrorBody(bodyText);
                channel.appendLine(`⚠️ Document ingest failed: status ${response.status}${detail.error ? ` — ${detail.error}` : ''}`);
                if (detail.details) channel.appendLine(`   Details: ${detail.details}`);
                if (detail.action) channel.appendLine(`   Action: ${detail.action}`);
                return { ingested: 0, errors: 0, total: 0 };
            }
            let parsed: any;
            try {
                parsed = JSON.parse(bodyText || '{}');
            } catch {
                // FSD TC-20 / STC UT-81(a): invalid body → notify, keep the run going
                channel.appendLine('⚠️ Could not parse ingest response');
                return { ingested: 0, errors: 0, total: 0 };
            }
            const ingested = parsed?.ingested ?? 0;
            const errors = parsed?.errors ?? 0;
            const total = parsed?.total ?? 0;
            channel.appendLine(`   KB ingest: ${ingested}/${total} files ingested, ${errors} errors`);
            return { ingested, errors, total };
        } catch (err: any) {
            const channel = IndexerHttpClient.getIndexerOutput();
            channel.appendLine(`⚠️ Document ingest error: ${err?.message || String(err)}`);
            return { ingested: 0, errors: 0, total: 0 };
        }
    }

    /** SA4E-337 F5: best-effort parse of an error response body ({error, details, action}). */
    private static parseErrorBody(bodyText: string): { error?: string; details?: string; action?: string } {
        if (!bodyText) return {};
        try {
            const body = JSON.parse(bodyText);
            if (body && typeof body === 'object') {
                return {
                    error: typeof body.error === 'string' ? body.error : undefined,
                    details: typeof body.details === 'string' ? body.details : undefined,
                    action: typeof body.action === 'string' ? body.action : undefined,
                };
            }
        } catch { /* non-JSON error body (HTML proxy page, plain text) — no detail lines */ }
        return {};
    }

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
        const totalFiles = projectFiles.length;
        const batchSize = 20; // SA4E-99: reduced from 50 to avoid timeout on large files
        const totalBatches = Math.ceil(totalFiles / batchSize);
        const incrementPerBatch = 100 / totalBatches;

        // Create output channel for detailed error reporting
        const channel = IndexerHttpClient.getIndexerOutput();

        // SA4E-300: file-level retry — files the server fails to persist are
        // re-sent (with exponential backoff) until accepted or rounds exhausted.
        const configuredRounds = Number(vscode.workspace.getConfiguration("sdlcAgents").get<number>("backend.indexRetryRounds", 5));
        const retryRounds = Number.isFinite(configuredRounds) && configuredRounds > 0 ? Math.floor(configuredRounds) : 0;
        const retryQueue: FileEntry[] = [];
        let permanentFailures = 0;

        // Upload project code first (high priority)
        for (let i = 0; i < totalFiles; i += batchSize) {
            const batchNum = Math.floor(i / batchSize) + 1;
            const pct = Math.round((i / totalFiles) * 100);
            const progressMsg = `Indexing source code: ${pct}% (${i + 1}/${totalFiles} files, batch ${batchNum}/${totalBatches})`;
            report.report({ message: progressMsg, increment: incrementPerBatch });
            if (log) { log(progressMsg); }
            // SA4E-99: Delay between batches to prevent server overload (PG pool exhaustion)
            if (i > 0) { await new Promise(r => setTimeout(r, 500)); }
            const batch = projectFiles.slice(i, i + batchSize);
            const entries = await Promise.all(
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
            // SA4E-99: Retry with exponential backoff for 429/5xx/network errors
            const result = await this.sendBatchWithRetry(url, { files: entries }, token, 3);
            if (result.ok) {
                // SA4E-300: per-file disk-write failures arrive INSIDE the 200 body —
                // count real writes; retryable rejections are re-queued with backoff.
                const outcome = IndexerHttpClient.batchWriteOutcome(result.body, batch.length);
                uploaded += outcome.written;
                const classified = IndexerHttpClient.classifyRejections(result.body, entries, retryQueue);
                permanentFailures += classified.permanent.length;
                if (classified.queued > 0) {
                    channel.appendLine(`⚠️ Batch ${batchNum}/${totalBatches}: ${classified.queued}/${batch.length} file(s) failed to save (transient) — queued for retry`);
                }
                for (const r of classified.permanent) {
                    channel.appendLine(`   ✗ Permanent: ${r.file} — ${r.code}: ${r.message}`);
                }
                if (classified.queued > 0 || classified.permanent.length > 0) { channel.show(true); }
            } else if (result.status === 401 && this.tokenRefresher) {
                const freshToken = await this.tokenRefresher();
                if (freshToken) {
                    token = freshToken;
                    // SA4E-300 GAP 3: propagate the refreshed token to subscribers
                    this.notifyTokenRefreshed(freshToken);
                    const retry = await this.sendBatchWithRetry(url, { files: entries }, token, 2);
                    if (retry.ok) {
                        const retryOutcome = IndexerHttpClient.batchWriteOutcome(retry.body, batch.length);
                        uploaded += retryOutcome.written;
                        const retryClassified = IndexerHttpClient.classifyRejections(retry.body, entries, retryQueue);
                        permanentFailures += retryClassified.permanent.length;
                        if (retryClassified.queued > 0) {
                            channel.appendLine(`⚠️ Batch ${batchNum}/${totalBatches} (after token refresh): ${retryClassified.queued}/${batch.length} file(s) failed to save (transient) — queued for retry`);
                        }
                        for (const r of retryClassified.permanent) {
                            channel.appendLine(`   ✗ Permanent: ${r.file} — ${r.code}: ${r.message}`);
                        }
                        if (retryClassified.queued > 0 || retryClassified.permanent.length > 0) { channel.show(true); }
                    }
                    else if (retry.status === 401) {
                        // Auth is broken beyond this token — retrying cannot succeed.
                        errors += batch.length;
                        channel.appendLine(`\n⚠️ Batch ${batchNum}/${totalBatches} FAILED after token refresh (auth)`);
                        channel.appendLine(`   Error: ${retry.error} | Status: ${retry.status}`);
                        if (retry.details) channel.appendLine(`   Details: ${retry.details}`);
                        if (retry.action) channel.appendLine(`   Action: ${retry.action}`);
                        channel.show(true);
                    }
                    else {
                        // SA4E-300: server never accepted these files — queue, don't drop.
                        retryQueue.push(...entries);
                        channel.appendLine(`\n⚠️ Batch ${batchNum}/${totalBatches} FAILED after token refresh — ${entries.length} file(s) queued for retry`);
                        channel.appendLine(`   Error: ${retry.error} | Status: ${retry.status}`);
                        if (retry.details) channel.appendLine(`   Details: ${retry.details}`);
                        if (retry.action) channel.appendLine(`   Action: ${retry.action}`);
                        channel.show(true);
                    }
                } else {
                    errors += batch.length;
                    channel.appendLine(`\n⚠️ Batch ${batchNum}/${totalBatches} FAILED — no token`);
                    channel.show(true);
                }
            } else {
                // SA4E-300: HTTP attempts exhausted — the server never accepted these
                // files. Queue them for file-level retry instead of dropping them.
                retryQueue.push(...entries);
                channel.appendLine(`\n⚠️ Batch ${batchNum}/${totalBatches} FAILED (${entries.length} files) — queued for retry`);
                channel.appendLine(`   Error: ${result.error} | Status: ${result.status}`);
                if (result.details) channel.appendLine(`   Details: ${result.details}`);
                if (result.action) channel.appendLine(`   Action: ${result.action}`);
                channel.show(true);
            }
        }
        // SA4E-300: drain the file-retry queue BEFORE the full index — every file
        // that can still be saved must be on disk before parsing starts.
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
        errors += permanentFailures;

        report.report({ message: `Indexing source code: 100% complete`, increment: 0 });

        // SA4E-99: Trigger full re-index ONCE after all files written (not per-batch).
        // The full index is the step that PARSES uploaded files into symbols — uploading
        // alone produces 0 symbols. If it fails, the whole indexing run is effectively a
        // no-op, so the failure MUST surface (not be swallowed) and MUST taint the summary.
        let fullIndexFailed = false;
        if (uploaded > 0) {
            report.report({ message: "Running full index on uploaded files..." });
            const full = await this.triggerFullIndex(token);
            if (!full.ok) {
                fullIndexFailed = true;
                const channel = IndexerHttpClient.getIndexerOutput();
                channel.appendLine(`\n❌ Full index FAILED — uploaded files were NOT parsed into symbols.`);
                channel.appendLine(`   Status: ${full.status} | Error: ${full.error}`);
                if (full.details) { channel.appendLine(`   Details: ${full.details}`); }
                if (full.action) { channel.appendLine(`   Action: ${full.action}`); }
                channel.show(true);
                vscode.window.showErrorMessage(
                    `Indexing incomplete: files uploaded but full index failed (${full.status || 'network error'}). Code symbols were not generated — see Output > Kiro Indexer.`,
                );
            } else {
                // SA4E-99: Poll backend progress until index + LLM enrichment complete
                this.pollIndexProgress(token).catch(() => {}); // fire-and-forget, shows status bar
            }
        }

        // Summary must reflect reality: a successful upload with a failed full index is
        // NOT a successful index (symbols = 0). Do not report "✅ Indexed" in that case.
        let summary: string;
        if (fullIndexFailed) {
            summary = `❌ Uploaded ${uploaded} files but full index FAILED — no code symbols generated (see Output > Kiro Indexer)`;
        } else {
            summary = `✅ Indexed ${uploaded} project files` + (errors > 0 ? `, ⚠️ Failed: ${errors} (see Output > Kiro Indexer for details)` : "");
        }
        return { uploaded, errors, summary };
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

    /**
     * SA4E-99: Send batch with exponential backoff retry.
     * Retries on: 429 (server busy), 5xx, network errors (ECONNRESET, ECONNREFUSED, timeout).
     * Does NOT retry on 401 (handled by caller with token refresh).
     */
    /**
     * SA4E-300: per-batch write outcome from a 200 index response.
     * The server awaits EVERY disk write before responding — async I/O is not
     * fire-and-forget — and reports per-file failures inside the body:
     *   /api/index/source    → { written, rejected, rejectedReasons }
     *   /api/index/documents → { indexed, rejected, rejectedReasons }
     * Falls back to batchLength when the field is absent (older servers).
     */
    private static batchWriteOutcome(
        body: any, batchLength: number,
    ): { written: number; failed: number; rejectedReasons: Array<{ file: string; code: string; message: string }> } {
        const writtenField = typeof body?.written === 'number' ? body.written
            : typeof body?.indexed === 'number' ? body.indexed
            : batchLength;
        const rejectedReasons = Array.isArray(body?.rejectedReasons) ? body.rejectedReasons : [];
        const written = Math.max(0, Math.min(writtenField, batchLength));
        return { written, failed: batchLength - written, rejectedReasons };
    }

    /** SA4E-300: file-level retry tuning. Static (not readonly) so tests can shorten delays. */
    static FILE_RETRY_BASE_DELAY_MS = 1000;
    static FILE_RETRY_MAX_DELAY_MS = 30000;

    /**
     * SA4E-300: classify a per-file rejection as retryable (transient) or permanent.
     * "Unsafe path" EACCES is a CLIENT bug — the path can never become safe, so
     * retrying would burn every round. ENOENT/EINVAL/ENAMETOOLONG/ENOTDIR/EISDIR
     * are permanent FS conditions. Everything else (ENOSPC disk-full, EIO, EBUSY,
     * EMFILE, EAGAIN, UNKNOWN…) is worth re-sending: space may free up, mounts
     * may recover, permissions may be fixed mid-run.
     */
    private static isRetryableRejection(r: { code?: string; message?: string }): boolean {
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
    private static classifyRejections(
        body: any, batch: FileEntry[], queue: FileEntry[],
    ): { queued: number; permanent: Array<{ file: string; code: string; message: string }> } {
        const reasons: Array<{ file: string; code: string; message: string }> =
            Array.isArray(body?.rejectedReasons) ? body.rejectedReasons : [];
        let queued = 0;
        const permanent: Array<{ file: string; code: string; message: string }> = [];
        for (const r of reasons) {
            const entry = batch.find((b) => b.path === r.file);
            if (entry && IndexerHttpClient.isRetryableRejection(r)) {
                queue.push(entry);
                queued++;
            } else {
                permanent.push({ file: r.file, code: String(r?.code || 'UNKNOWN'), message: String(r?.message || '') });
            }
        }
        return { queued, permanent };
    }

    private async sendBatchWithRetry(
        url: string, payload: unknown, token: string | undefined, maxRetries: number,
    ): Promise<{ ok: boolean; error: string; details?: string; action?: string; status: number; body?: any }> {
        let lastResult: { ok: boolean; error: string; details?: string; action?: string; status: number; body?: any } = { ok: false, error: 'no attempt', status: 0 };
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

    /**
     * SA4E-300: drain the file-retry queue — re-send files the server failed to
     * persist UNTIL they are accepted or the configured retry rounds run out
     * (sdlcAgents.backend.indexRetryRounds, default 5). Exponential backoff
     * between rounds; permanent rejections are never retried. Files that still
     * fail after all rounds stay in the queue for the caller to count/report.
     */
    private async drainRetryQueue(
        queue: FileEntry[],
        url: string,
        token: string | undefined,
        rounds: number,
        log?: (msg: string) => void,
    ): Promise<{ uploaded: number; errors: number }> {
        const channel = IndexerHttpClient.getIndexerOutput();
        let uploaded = 0;
        let errors = 0;
        const retryBatchSize = 20;
        for (let round = 1; round <= rounds && queue.length > 0; round++) {
            const delay = Math.min(
                IndexerHttpClient.FILE_RETRY_BASE_DELAY_MS * Math.pow(2, round - 1),
                IndexerHttpClient.FILE_RETRY_MAX_DELAY_MS,
            );
            await new Promise((r) => setTimeout(r, delay));
            const pending = queue.splice(0);
            const msg = `🔄 Retrying ${pending.length} file(s) not yet saved (round ${round}/${rounds})...`;
            channel.appendLine(msg);
            if (log) { log(msg); }
            for (let i = 0; i < pending.length; i += retryBatchSize) {
                const batch = pending.slice(i, i + retryBatchSize);
                const result = await this.sendBatchWithRetry(url, { files: batch }, token, 2);
                if (!result.ok) {
                    queue.push(...batch); // still not accepted by the server — next round
                    continue;
                }
                const outcome = IndexerHttpClient.batchWriteOutcome(result.body, batch.length);
                uploaded += outcome.written;
                const classified = IndexerHttpClient.classifyRejections(result.body, batch, queue);
                for (const r of classified.permanent) {
                    errors++;
                    channel.appendLine(`   ✗ Permanent: ${r.file} — ${r.code}: ${r.message}`);
                }
            }
        }
        return { uploaded, errors };
    }

    /**
     * Trigger code symbol sync on backend — syncs indexed code symbols into KB knowledge_entries.
     * Calls mem_sync_code via backend MCP endpoint. Auto-triggered after source upload.
     */
    async syncCodeSymbols(): Promise<string | null> {
        const url = `${this.backendUrl}/mcp`;
        const payload = {
            jsonrpc: "2.0",
            id: Date.now(),
            method: "tools/call",
            params: { name: "mem_sync_code", arguments: {} },
        };
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(60000),
            });
            if (!response.ok) {
                IndexerHttpClient.getIndexerOutput().appendLine(`[IndexerHttpClient] syncCodeSymbols failed with status ${response.status}`);
                return null;
            }
            const text = await response.text();
            try {
                const result = JSON.parse(text) as any;
                const content = result?.result?.content?.[0]?.text;
                return typeof content === "string" ? content : text;
            } catch {
                return text;
            }
        } catch (err) {
            IndexerHttpClient.getIndexerOutput().appendLine(`[IndexerHttpClient] syncCodeSymbols failed: ${(err as Error).message}`);
            return null;
        }
    }

    private async uploadDocumentFile(relPath: string, content: string, token?: string): Promise<boolean> {
        return this.httpPost(`${this.backendUrl}/api/index/document`, { path: relPath, content }, token);
    }

    private async readFileContent(relPath: string): Promise<string | undefined> {
        try {
            const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (root) {
                const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(path.join(root, relPath)));
                return Buffer.from(raw).toString("utf-8");
            }
        } catch (err) {
          IndexerHttpClient.getIndexerOutput().appendLine(`[IndexerHttpClient] readFileContent failed for '${relPath}': ${(err as Error).message}`);
        }
        return undefined;
    }

    /**
     * POST JSON and return raw body + ok status. Uses fetch() (proxy-patched globally).
     * On 401, refreshes the token once (if a refresher is set) and retries — long
     * operations (e.g. Pega crawl of hundreds of rules) can outlive the JWT, so the
     * final sync POST must refresh rather than fail with Unauthorized.
     */
	private async httpPostJson(url: string, payload: unknown, token: string | undefined): Promise<{ ok: boolean; body: string }> {
		const first = await this.httpPostJsonOnce(url, payload, token);
		// SA4E-215: Auto-register project if not registered
		if (first.status === 404 && first.body) {
			try {
				const body = JSON.parse(first.body);
				if (body?.__error?.error?.code === 'PROJECT_NOT_REGISTERED') {
					const registered = await this.maybeAutoRegister(token);
					if (registered) {
						const retry = await this.httpPostJsonOnce(url, payload, token);
						return { ok: retry.status >= 200 && retry.status < 300, body: retry.body };
					}
				}
			} catch { /* not JSON, proceed normally */ }
		}
		if (first.status !== 401 || !this.tokenRefresher) {
			return { ok: first.status >= 200 && first.status < 300, body: first.body };
		}
		// Token likely expired mid-operation — refresh once and retry.
		const freshToken = await this.tokenRefresher();
		if (!freshToken) { return { ok: false, body: first.body }; }
		// SA4E-300 GAP 3: propagate refreshed token outward
		this.notifyTokenRefreshed(freshToken);
		const retry = await this.httpPostJsonOnce(url, payload, freshToken);
		return { ok: retry.status >= 200 && retry.status < 300, body: retry.body };
	}

    /** Single POST attempt returning HTTP status + raw body (status 0 on network error). */
    private async httpPostJsonOnce(url: string, payload: unknown, token: string | undefined): Promise<{ status: number; body: string }> {
        const headers = await this.buildHeaders(token);
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(30000),
            });
            const body = await response.text();
            return { status: response.status, body };
        } catch (err) {
            IndexerHttpClient.getIndexerOutput().appendLine(`[IndexerHttpClient] httpPostJson failed (non-fatal): ${(err as Error).message}`);
            return { status: 0, body: "" };
        }
    }

    /** Simple POST returning boolean success. Delegates to http-client-utils. */
    private async httpPost(url: string, payload: unknown, token: string | undefined): Promise<boolean> {
        const headers = await this.buildHeaders(token);
        return utilHttpPostJson<unknown>(url, payload, { headers, timeoutMs: 30000 })
            .then(() => true)
            .catch(() => false);
    }

	/** POST with detailed error info for user-facing error reporting.
	 * SA4E-300: on 2xx the parsed body is returned as `body` — the index
	 * endpoints report per-file disk-write failures INSIDE a 200 response
	 * ({written|indexed, rejected, rejectedReasons}), so callers must be able
	 * to read them (previously the body was discarded on success). */
	private async httpPostWithDetail(url: string, payload: unknown, token: string | undefined): Promise<{ ok: boolean; error: string; details?: string; action?: string; status: number; body?: any }> {
		const headers = await this.buildHeaders(token);
		try {
			const result = await utilHttpPostJson<any>(url, payload, { headers, timeoutMs: 60000 });
			return { ok: true, error: "", status: 200, body: result };
		} catch (err: any) {
			const status = err?.statusCode || err?.status || 0;
			const body = err?.body || {};
			const errorMsg = body?.error || err?.message || String(err);
			const details = body?.details;
			const action = body?.action;
			if (status === 401) return { ok: false, error: "Unauthorized", details, action, status: 401 };
			// SA4E-215: Auto-register project if not registered
			if (status === 404 && body?.__error?.error?.code === 'PROJECT_NOT_REGISTERED') {
				const registered = await this.maybeAutoRegister(token);
				if (registered) {
					// Retry original request
					try {
						const retryBody = await utilHttpPostJson<any>(url, payload, { headers, timeoutMs: 60000 });
						return { ok: true, error: "", status: 200, body: retryBody };
					} catch (retryErr: any) {
						const rStatus = retryErr?.statusCode || retryErr?.status || 0;
						const rBody = retryErr?.body || {};
						return { ok: false, error: String(rBody?.error || retryErr?.message || retryErr).slice(0, 500), details: rBody?.details, action: rBody?.action, status: rStatus };
					}
				}
			}
			// SA4E-300 GAP 3: widened from 200 → 500 chars so important details survive
			return { ok: false, error: String(errorMsg).slice(0, 500), details, action, status };
		}
	}

    /** Build standard auth + project-id headers. */
    private async buildHeaders(token: string | undefined): Promise<Record<string, string>> {
        const headers: Record<string, string> = {};
        if (token) { headers["Authorization"] = `Bearer ${token}`; }
        const { getProjectId } = await import("../extension");
        const pid = getProjectId();
        if (pid) { headers["X-Project-Id"] = pid; }
        // Send workspace root so server registers correct display_name
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            headers["X-Workspace-Root"] = workspaceFolders[0].uri.fsPath;
        }
        // Client-requested rate limit (rpm). Server clamps this to its own hard cap,
        // so this can only lower (never raise) the effective limit above the server max.
        const rpm = vscode.workspace.getConfiguration("sdlcAgents").get<number>("backend.rateLimitRpm");
        if (typeof rpm === "number" && Number.isInteger(rpm) && rpm > 0) {
            headers["X-Rate-Limit-RPM"] = String(rpm);
        }
        return headers;
    }

    /** SA4E-209: Trigger async Pega sync (POST returns 202, actual sync runs in background). */
    async syncPegaRulesToKb(projectId: string, token?: string): Promise<{ message: string }> {
        const url = `${this.backendUrl}/api/index/sync-pega-rules`;
        const { ok, body } = await this.httpPostJson(url, { projectId }, token);
        if (!ok) return { message: `Pega sync failed: ${body}` };
        try {
            const data = JSON.parse(body);
            return { message: data.message || "Pega sync started" };
        } catch { return { message: body || "Pega sync started" }; }
    }

    /** SA4E-99: Get enrichment status (GET /api/v1/enrichment/status). */
    async getEnrichmentStatus(token?: string): Promise<{ ok: boolean; body: string }> {
        const url = `${this.backendUrl}/api/v1/enrichment/status`;
        return this.httpGet(url, token);
    }

    /**
     * Get current index/parse progress (GET /api/index/progress). Reports the
     * synchronous code-indexing phase (scanning → indexing → resolving → complete),
     * which is the first half of the async KB-ingest pipeline. Pairs with
     * getEnrichmentStatus() (the LLM enrichment half) to give users full visibility.
     */
    async getIndexProgress(token?: string): Promise<{ ok: boolean; body: string }> {
        const url = `${this.backendUrl}/api/index/progress`;
        return this.httpGet(url, token);
    }

    /**
     * Get the full list of FAILED enrichment tasks (GET /api/v1/enrichment/failures).
     * Unlike the status endpoint's recentFailures (capped at 10), this returns every
     * failure up to `limit` so the user can inspect which rules/symbols failed and why.
     * @param limit Max failures to fetch (server clamps to [1, 1000])
     */
    async getEnrichmentFailures(limit = 200, token?: string): Promise<{ ok: boolean; body: string }> {
        const url = `${this.backendUrl}/api/v1/enrichment/failures?limit=${encodeURIComponent(String(limit))}`;
        return this.httpGet(url, token);
    }

    /**
     * GET request returning raw body + ok status. Uses fetch() (proxy-patched globally).
     * On 401, refreshes the token once (if a refresher is set) and retries — the
     * extension is responsible for keeping its JWT fresh against the remote backend.
     */
	private async httpGet(url: string, token: string | undefined): Promise<{ ok: boolean; body: string }> {
		const first = await this.httpGetOnce(url, token);
		// SA4E-215: Auto-register project if not registered
		if (first.status === 404 && first.body) {
			try {
				const body = JSON.parse(first.body);
				if (body?.__error?.error?.code === 'PROJECT_NOT_REGISTERED') {
					const registered = await this.maybeAutoRegister(token);
					if (registered) {
						const retry = await this.httpGetOnce(url, token);
						return { ok: retry.status === 200, body: retry.body };
					}
				}
			} catch { /* not JSON, proceed normally */ }
		}
		if (first.status !== 401 || !this.tokenRefresher) {
			return { ok: first.status === 200, body: first.body };
		}
		// Token likely expired — refresh once and retry with the fresh token.
		const freshToken = await this.tokenRefresher();
		if (!freshToken) { return { ok: false, body: first.body }; }
		// SA4E-300 GAP 3: propagate refreshed token outward
		this.notifyTokenRefreshed(freshToken);
		const retry = await this.httpGetOnce(url, freshToken);
		return { ok: retry.status === 200, body: retry.body };
	}

    private static lastTimeoutLog = 0;
    /** Single GET attempt returning HTTP status + raw body (status 0 on network error). */
    private async httpGetOnce(url: string, token: string | undefined): Promise<{ status: number; body: string }> {
        const headers = await this.buildHeaders(token);
        try {
            const response = await fetch(url, {
                method: "GET",
                headers,
                signal: AbortSignal.timeout(30000),
            });
            const body = await response.text();
            return { status: response.status, body };
        } catch (err) {
            const now = Date.now();
            if (now - IndexerHttpClient.lastTimeoutLog > 30000) {
                IndexerHttpClient.lastTimeoutLog = now;
                IndexerHttpClient.getIndexerOutput().appendLine(`[IndexerHttpClient] httpGet failed (non-fatal): ${(err as Error).message}`);
            }
            return { status: 0, body: "" };
        }
    }
}

/**
 * Parse structured JSON response from server (Task 8).
 * Server returns: { status: "ingested"|"unconvertible", entries?: number, reason?: string }
 * Falls back to legacy regex marker parsing for backward compatibility.
 */
export function parseIngestResponse(responseBody: string, fallbackFile: string): { ingested: boolean; entry?: UnconvertibleEntry } {
    if (!responseBody) { return { ingested: false }; }
    try {
        const parsed = JSON.parse(responseBody);
        // New structured format from server
        if (parsed?.status === 'unconvertible') {
            return { ingested: false, entry: { file: parsed.file || fallbackFile, reason: parsed.reason || 'unknown' } };
        }
        if (parsed?.status === 'ingested') { return { ingested: true }; }
        // Legacy MCP-style wrapper
        const inner = parsed?.data?.content?.[0]?.text;
        if (typeof inner === 'string') {
            const legacy = parseLegacyMarker(inner, fallbackFile);
            if (legacy) { return { ingested: false, entry: legacy }; }
            return { ingested: true };
        }
    } catch (err) {
      IndexerHttpClient.getIndexerOutput().appendLine(`[IndexerHttpClient] response parse failed, trying legacy (non-fatal): ${(err as Error).message}`);
    }

    const legacy = parseLegacyMarker(responseBody, fallbackFile);
    if (legacy) { return { ingested: false, entry: legacy }; }
    return { ingested: true };
}

/** Legacy: detect UNCONVERTIBLE marker in plain text response. */
function parseLegacyMarker(text: string, fallbackFile: string): UnconvertibleEntry | null {
    const m = text.match(/UNCONVERTIBLE:\s*(.+?)\s*\(reason=([^)]+)\)/);
    if (m) { return { file: m[1] || fallbackFile, reason: m[2] }; }
    return null;
}

/**
 * @deprecated Use parseIngestResponse instead. Kept for backward compatibility.
 */
export function parseUnconvertible(responseBody: string, fallbackFile: string): UnconvertibleEntry | null {
    const result = parseIngestResponse(responseBody, fallbackFile);
    return result.entry ?? null;
}

