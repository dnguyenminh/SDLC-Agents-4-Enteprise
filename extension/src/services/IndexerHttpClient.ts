/**
 * HTTP client for indexer operations — document ingestion and source file upload.
 * Delegates raw HTTP to http-client-utils for DRY compliance.
 */
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { httpPostJson as utilHttpPostJson } from "../utils/http-client-utils";
import { detectSfdxProject } from "../sf-indexer";
import { UNIFIED_EXTENSIONS } from "./unified-extensions.js";

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

    /** Command id used by the index status bar item to reveal the indexer output channel. */
    private static readonly SHOW_OUTPUT_COMMAND = "kiroSdlc.showIndexerOutput";
    /** Shared "Kiro Indexer" output channel — created once to avoid duplicate channels. */
    private static indexerOutputChannel: vscode.OutputChannel | undefined;
    /** Guard so the reveal command is registered exactly once. */
    private static showOutputCommandRegistered = false;

    /**
     * Lazily create the shared indexer output channel and register a command that
     * reveals it. status bar `command` only accepts a command id (it cannot call a
     * method), so we register a small command that focuses the correct channel —
     * more reliable than the generic (and mis-typed) output-toggle command.
     */
    private static getIndexerOutput(): vscode.OutputChannel {
        if (!IndexerHttpClient.indexerOutputChannel) {
            IndexerHttpClient.indexerOutputChannel = vscode.window.createOutputChannel("Kiro Indexer");
        }
        const channel = IndexerHttpClient.indexerOutputChannel;
        if (!IndexerHttpClient.showOutputCommandRegistered) {
            try {
                vscode.commands.registerCommand(
                    IndexerHttpClient.SHOW_OUTPUT_COMMAND,
                    () => channel.show(true),
                );
                IndexerHttpClient.showOutputCommandRegistered = true;
            } catch {
                // Already registered (e.g. hot reload) — safe to ignore.
                IndexerHttpClient.showOutputCommandRegistered = true;
            }
        }
        return channel;
    }

    constructor(private readonly backendUrl: string) {}

    /** SA4E-99: Set token refresher callback — called on 401 to get a fresh token. */
    setTokenRefresher(refresher: () => Promise<string | undefined>): void {
        this.tokenRefresher = refresher;
    }
    /** Expose backend base URL for other callers. */
    getBaseUrl(): string { return this.backendUrl; }

    /**
     * SA4E-99: Poll /api/index/progress until idle. Shows status bar progress.
     * Resolves when indexing completes or times out after maxWaitMs.
     */
    async pollIndexProgress(token?: string, maxWaitMs = 300000): Promise<void> {
        const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
        const outputChannel = IndexerHttpClient.getIndexerOutput();
        statusBar.command = IndexerHttpClient.SHOW_OUTPUT_COMMAND;
        statusBar.show();
        const start = Date.now();
        let consecutiveFails = 0;
        try {
            while (Date.now() - start < maxWaitMs) {
                await new Promise(r => setTimeout(r, 2000));
                const headers = await this.buildHeaders(token);
                const url = `${this.backendUrl}/api/index/progress`;
                let resp: { ok: boolean; body: string; error?: string };
                try {
                    const response = await fetch(url, {
                        method: "GET",
                        headers,
                        signal: AbortSignal.timeout(5000),
                    });
                    resp = { ok: response.status === 200, body: await response.text() };
                } catch (err) {
                    resp = { ok: false, body: "", error: (err as Error).message };
                    outputChannel.appendLine(`[Index Poll] Fetch failed: ${(err as Error).message} — URL: ${url}`);
                }
                const { ok, body, error } = resp;
                if (!ok) {
                    consecutiveFails++;
                    statusBar.text = "$(sync~spin) Indexing...";
                    statusBar.tooltip = "Code Intelligence: Indexing workspace...";
                    if (consecutiveFails >= 3) {
                        statusBar.text = "$(error) Index: backend unreachable";
                        const md = new vscode.MarkdownString(`Code Intelligence: Backend unreachable\nURL: ${url}\nReason: ${error || 'No response / non-200'}\n\nClick to open Output > Kiro Indexer for details.`);
                        md.isTrusted = true;
                        statusBar.tooltip = md;
                        outputChannel.appendLine(`[Index Poll] Backend unreachable after ${consecutiveFails} consecutive failures. URL: ${url}, reason: ${error || 'non-200'}`);
                        outputChannel.show(true);
                        setTimeout(() => statusBar.dispose(), 30000);
                        return;
                    }
                    continue;
                }
                consecutiveFails = 0;
                try {
                    const progress = JSON.parse(body);
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
                        setTimeout(() => statusBar.dispose(), 8000);
                        return;
                    }
                    if (status === 'superseded') {
                        statusBar.text = "$(info) Index superseded";
                        statusBar.tooltip = "Code Intelligence: Previous index was superseded by a new run";
                        setTimeout(() => statusBar.dispose(), 8000);
                        return;
                    }
                    if (status === 'failed' || progress.phase === 'error') {
                        statusBar.text = "$(error) Index failed";
                        const errObj = progress.error;
                        let tooltipMsg = 'Code Intelligence: Indexing FAILED\n';
                        if (errObj) {
                            tooltipMsg += `Phase: ${errObj.phase || progress.phase}\n`;
                            tooltipMsg += `Error: ${errObj.message}\n`;
                            if (errObj.file) tooltipMsg += `File: ${errObj.file}\n`;
                            if (errObj.stack) tooltipMsg += `\n${errObj.stack}`;
                        } else {
                            tooltipMsg += `Error: ${progress.message || 'unknown error'}`;
                        }
                        const md = new vscode.MarkdownString(tooltipMsg);
                        md.isTrusted = true;
                        statusBar.tooltip = md;
                        // Keep longer for user to read
                        setTimeout(() => statusBar.dispose(), 30000);
                        return;
                    }
                    if (status === 'cancelled' || progress.phase === 'cancelled') {
                        statusBar.text = "$(stop) Index cancelled";
                        statusBar.tooltip = "Code Intelligence: Indexing was cancelled";
                        setTimeout(() => statusBar.dispose(), 5000);
                        return;
                    }
                    const elapsed = Math.round((progress.elapsedMs || 0) / 1000);
                    const checksumStats = progress.checksumStats;
                    let checksumInfo = '';
                    if (checksumStats) {
                        checksumInfo = `\nChecksum: skipped ${checksumStats.files_skipped}, processed ${checksumStats.files_processed}, pending ${checksumStats.files_pending}`;
                    }
                    statusBar.text = `$(sync~spin) Indexing: ${progress.percentage}%`;
                    statusBar.tooltip = `Code Intelligence — ${progress.phase}${status ? ' (' + status + ')' : ''}\n`
                        + `Progress: ${progress.current}/${progress.total} files (${progress.percentage}%)\n`
                        + `Elapsed: ${elapsed}s${checksumInfo}\n`
                        + (progress.currentFile ? `Current: ${progress.currentFile}` : '');
                } catch { statusBar.text = "$(sync~spin) Indexing..."; statusBar.tooltip = "Code Intelligence: Processing..."; }
            }
            statusBar.text = "$(warning) Index timeout";
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
        const channel = vscode.window.createOutputChannel("Kiro Doc Indexer");
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
                ingested += entries.length;
            } else {
                errors += entries.length;
                channel.appendLine(`⚠️ Doc batch ${Math.floor(i / batchSize) + 1}: ${writeResult.error}`);
            }
        }

        if (errors > 0) { channel.show(true); }

        // Trigger KB ingest from Temp files (single call)
        if (ingested > 0) {
            report.report({ message: "Running document KB ingest..." });
            await this.triggerDocumentIngest(token);
        }

        const parts = [`✅ Indexed: ${ingested} files`];
        if (errors > 0) { parts.push(`⚠️ Failed: ${errors}`); }
        if (unconvertible.length > 0) { parts.push(`⏭️ Un-convertible: ${unconvertible.length}`); }
        return { ingested, errors, summary: parts.join(", "), unconvertible };
    }

    /** SA4E-99: Trigger backend to ingest documents from Temp folder into KB. */
    private async triggerDocumentIngest(token?: string): Promise<void> {
        try {
            await this.httpPostWithDetail(`${this.backendUrl}/api/index/ingest-docs`, {}, token);
        } catch { /* non-fatal */ }
    }

    async uploadSourceFiles(
        report: vscode.Progress<{ message?: string; increment?: number }>,
        token?: string,
        log?: (msg: string) => void
    ): Promise<UploadResult> {
        // Priority 1: Project source code (exclude all library/vendor directories at ANY depth)
        const libraryExcludes = "**/{node_modules,dist,.git,build,out,.opencode,vendor,packages,bower_components,.kilo,scratch,.code-intel,.analysis,SDLC-Agents-4-Enterprise}/**";
        
        // Detect SFDX project to adjust glob patterns
        const workspaceFolders = vscode.workspace.workspaceFolders;
        let isSfdx = false;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const root = workspaceFolders[0].uri.fsPath;
            const sfdxRoot = detectSfdxProject(root);
            if (sfdxRoot) {
                isSfdx = true;
            }
        }

        let projectFiles: vscode.Uri[] = [];
        if (isSfdx) {
            // Salesforce DX project: include Apex, metadata, LWC
            const [clsFiles, triggerFiles, metaFiles, lwcJsFiles, lwcHtmlFiles] = await Promise.all([
                vscode.workspace.findFiles("**/*.cls", libraryExcludes),
                vscode.workspace.findFiles("**/*.trigger", libraryExcludes),
                vscode.workspace.findFiles("**/*-meta.xml", libraryExcludes),
                vscode.workspace.findFiles("**/lwc/**/*.js", libraryExcludes),
                vscode.workspace.findFiles("**/lwc/**/*.html", libraryExcludes),
            ]);
            projectFiles = [...clsFiles, ...triggerFiles, ...metaFiles, ...lwcJsFiles, ...lwcHtmlFiles];
        } else {
            const globPattern = `**/*.{${UNIFIED_EXTENSIONS.join(',')}}`;
            projectFiles = await vscode.workspace.findFiles(globPattern, libraryExcludes);
        }

        if (projectFiles.length === 0) { return { uploaded: 0, errors: 0, summary: "ℹ️ No source files found" }; }

        const url = `${this.backendUrl}/api/index/source`;
        let uploaded = 0;
        let errors = 0;
        const totalFiles = projectFiles.length;
        const batchSize = 20; // SA4E-99: reduced from 50 to avoid timeout on large files
        const totalBatches = Math.ceil(totalFiles / batchSize);
        const incrementPerBatch = 100 / totalBatches;

        // Reuse the shared "Kiro Indexer" channel for detailed error reporting
        const channel = IndexerHttpClient.getIndexerOutput();

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
                uploaded += batch.length;
            } else if (result.status === 401 && this.tokenRefresher) {
                const freshToken = await this.tokenRefresher();
                if (freshToken) {
                    token = freshToken;
                    const retry = await this.sendBatchWithRetry(url, { files: entries }, token, 2);
                    if (retry.ok) { uploaded += batch.length; }
                    else {
                        errors += batch.length;
                        channel.appendLine(`\n⚠️ Batch ${batchNum}/${totalBatches} FAILED after token refresh`);
                        channel.appendLine(`   Error: ${retry.error}`);
                        channel.show(true);
                    }
                } else {
                    errors += batch.length;
                    channel.appendLine(`\n⚠️ Batch ${batchNum}/${totalBatches} FAILED — no token`);
                    channel.show(true);
                }
            } else {
                errors += batch.length;
                channel.appendLine(`\n⚠️ Batch ${batchNum}/${totalBatches} FAILED (${batch.length} files)`);
                channel.appendLine(`   Error: ${result.error} | Status: ${result.status}`);
                channel.show(true);
            }
        }
        report.report({ message: `Indexing source code: 100% complete`, increment: 0 });

        // SA4E-99: Trigger full re-index ONCE after all files written (not per-batch)
        if (uploaded > 0) {
            report.report({ message: "Running full index on uploaded files..." });
            await this.triggerFullIndex(token);
            // SA4E-99: Poll backend progress until index + LLM enrichment complete
            // Do not swallow errors — surface if poll fails
            this.pollIndexProgress(token).catch(err => {
                const ch = IndexerHttpClient.getIndexerOutput();
                ch.appendLine(`[pollIndexProgress] Unhandled error: ${(err as Error).message}`);
                ch.show(true);
                vscode.window.showErrorMessage(`Index: poll failed — backend unreachable. See Output > Kiro Indexer.`);
            });
        }

        if (uploaded === 0 && errors > 0) {
            const ch = IndexerHttpClient.getIndexerOutput();
            ch.appendLine(`[uploadSourceFiles] Upload failed for all batches — uploaded=0, errors=${errors}. Backend may be unreachable.`);
            ch.show(true);
            vscode.window.showErrorMessage(`Index: upload failed for all files — backend unreachable or error. See Output > Kiro Indexer.`);
        }

        const summary = `✅ Indexed ${uploaded} project files` + (errors > 0 ? `, ⚠️ Failed: ${errors} (see Output > Kiro Indexer for details)` : "");
        return { uploaded, errors, summary };
    }

    /** SA4E-99: Trigger a full re-index on backend after all source files are written. */
    private async triggerFullIndex(token?: string): Promise<void> {
        const url = `${this.backendUrl}/api/index/full`;
        try {
            const { ok, body } = await this.httpPostJson(url, {}, token);
            if (!ok) {
                const ch = IndexerHttpClient.getIndexerOutput();
                ch.appendLine(`[triggerFullIndex] FAILED — URL: ${url}, response: ${body}`);
                ch.show(true);
                vscode.window.showErrorMessage(`Index: backend unreachable — triggerFullIndex failed. See Output > Kiro Indexer.`);
                return;
            }
            if (body) {
                try {
                    const data = JSON.parse(body);
                    if (data.cancelledPrevious && data.message) {
                        vscode.window.showInformationMessage(`Indexing: ${data.message}`);
                    }
                } catch { /* ignore parse errors */ }
            }
        } catch (err) {
            const ch = IndexerHttpClient.getIndexerOutput();
            ch.appendLine(`[triggerFullIndex] EXCEPTION — URL: ${url}, error: ${(err as Error).message}`);
            ch.show(true);
            vscode.window.showErrorMessage(`Index: backend unreachable — triggerFullIndex exception. See Output > Kiro Indexer.`);
        }
    }

    /**
     * SA4E-99: Send batch with exponential backoff retry.
     * Retries on: 429 (server busy), 5xx, network errors (ECONNRESET, ECONNREFUSED, timeout).
     * Does NOT retry on 401 (handled by caller with token refresh).
     */
    private async sendBatchWithRetry(
        url: string, payload: unknown, token: string | undefined, maxRetries: number,
    ): Promise<{ ok: boolean; error: string; status: number }> {
        let lastResult = { ok: false, error: 'no attempt', status: 0 };
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
            if (!response.ok) { return null; }
            const result = await response.json() as any;
            const text = result?.result?.content?.[0]?.text;
            return typeof text === "string" ? text : null;
        } catch {
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
          console.warn(`[IndexerHttpClient] readFileContent failed for '${relPath}': ${(err as Error).message}`);
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
        if (first.status !== 401 || !this.tokenRefresher) {
            return { ok: first.status >= 200 && first.status < 300, body: first.body };
        }
        // Token likely expired mid-operation — refresh once and retry.
        const freshToken = await this.tokenRefresher();
        if (!freshToken) { return { ok: false, body: first.body }; }
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
            console.debug(`[IndexerHttpClient] httpPostJson failed (non-fatal): ${(err as Error).message}`);
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

    /** POST with detailed error info for user-facing error reporting. */
    private async httpPostWithDetail(url: string, payload: unknown, token: string | undefined): Promise<{ ok: boolean; error: string; status: number }> {
        const headers = await this.buildHeaders(token);
        try {
            const result = await utilHttpPostJson<any>(url, payload, { headers, timeoutMs: 60000 });
            return { ok: true, error: "", status: 200 };
        } catch (err: any) {
            const status = err?.statusCode || err?.status || 0;
            const msg = err?.message || String(err);
            if (status === 401) return { ok: false, error: "Unauthorized", status: 401 };
            return { ok: false, error: msg.slice(0, 200), status };
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
        const rpm = vscode.workspace.getConfiguration("kiroSdlc").get<number>("backend.rateLimitRpm");
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
     * GET request returning raw body + ok status. Uses fetch() (proxy-patched globally).
     * On 401, refreshes the token once (if a refresher is set) and retries — the
     * extension is responsible for keeping its JWT fresh against the remote backend.
     */
    private async httpGet(url: string, token: string | undefined): Promise<{ ok: boolean; body: string }> {
        const first = await this.httpGetOnce(url, token);
        if (first.status !== 401 || !this.tokenRefresher) {
            return { ok: first.status === 200, body: first.body };
        }
        // Token likely expired — refresh once and retry with the fresh token.
        const freshToken = await this.tokenRefresher();
        if (!freshToken) { return { ok: false, body: first.body }; }
        const retry = await this.httpGetOnce(url, freshToken);
        return { ok: retry.status === 200, body: retry.body };
    }

    /** Single GET attempt returning HTTP status + raw body (status 0 on network error). */
    private async httpGetOnce(url: string, token: string | undefined): Promise<{ status: number; body: string }> {
        const headers = await this.buildHeaders(token);
        try {
            const response = await fetch(url, {
                method: "GET",
                headers,
                signal: AbortSignal.timeout(10000),
            });
            const body = await response.text();
            return { status: response.status, body };
        } catch (err) {
            console.debug(`[IndexerHttpClient] httpGet failed (non-fatal): ${(err as Error).message}`);
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
      console.debug(`[IndexerHttpClient] response parse failed, trying legacy (non-fatal): ${(err as Error).message}`);
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

