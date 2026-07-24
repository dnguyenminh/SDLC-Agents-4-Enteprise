/**
 * HTTP client for indexer operations — document ingestion and source file upload.
 * Delegates raw HTTP to http-client-utils for DRY compliance.
 */
import * as vscode from "vscode";
import * as path from "path";
import { httpPostJson as utilHttpPostJson, HttpPostOptions } from "../utils/http-client-utils";

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
    constructor(private readonly backendUrl: string) {}

    async ingestDocuments(
        docs: DocEntry[],
        report: vscode.Progress<{ message?: string }>,
        token?: string
    ): Promise<IngestResult> {
        // SA4E-30: Use REST API endpoint instead of /mcp/tools/call
        const url = `${this.backendUrl}/api/v1/memory/ingest-file`;
        let ingested = 0;
        let errors = 0;

        const unconvertible: UnconvertibleEntry[] = [];
        for (let i = 0; i < docs.length; i++) {
            const d = docs[i];
            if (i % 10 === 0) { report.report({ message: `Ingesting ${i + 1}/${docs.length} files...` }); }

            let fileContent = d.content;
            if (!fileContent) { fileContent = await this.readFileContent(d.path); }
            if (fileContent) { await this.uploadDocumentFile(d.path, fileContent, token); }

            const payload = { file_path: d.path, type: d.type, format: "markdown", ...(fileContent ? { content: fileContent } : {}) };
            const { ok, body } = await this.httpPostJson(url, payload, token);
            if (!ok) { errors++; continue; }

            const result = parseIngestResponse(body, d.path);
            if (result.entry) { unconvertible.push(result.entry); } else { ingested++; }
        }

        const parts = [`✅ Indexed: ${ingested} files`];
        if (errors > 0) { parts.push(`⚠️ Failed: ${errors}`); }
        if (unconvertible.length > 0) { parts.push(`⏭️ Un-convertible: ${unconvertible.length}`); }
        return { ingested, errors, summary: parts.join(", "), unconvertible };
    }

    async uploadSourceFiles(
        report: vscode.Progress<{ message?: string }>,
        token?: string
    ): Promise<UploadResult> {
        // Priority 1: Project source code (exclude all library/vendor directories)
        const libraryExcludes = "{node_modules,dist,.git,build,out,backend,.opencode,vendor,packages,bower_components}/**";
        const projectFiles = await vscode.workspace.findFiles(
            "**/*.{ts,js,kt,java,py,go,rs,tsx,jsx}", libraryExcludes
        );

        if (projectFiles.length === 0) { return { uploaded: 0, errors: 0, summary: "ℹ️ No source files found" }; }

        const url = `${this.backendUrl}/api/index/source`;
        let uploaded = 0;
        let errors = 0;

        // Create output channel for detailed error reporting
        const channel = vscode.window.createOutputChannel("Kiro Indexer");

        // Upload project code first (high priority)
        for (let i = 0; i < projectFiles.length; i += 50) {
            const batchNum = Math.floor(i / 50) + 1;
            const totalBatches = Math.ceil(projectFiles.length / 50);
            report.report({ message: `Indexing project code ${i + 1}/${projectFiles.length} (batch ${batchNum}/${totalBatches})...` });
            const batch = projectFiles.slice(i, i + 50);
            const entries = await Promise.all(
                batch.map(async (file) => {
                    const content = await vscode.workspace.fs.readFile(file);
                    return { path: vscode.workspace.asRelativePath(file), content: Buffer.from(content).toString("utf-8") };
                })
            );
            const result = await this.httpPostWithDetail(url, { files: entries }, token);
            if (result.ok) {
                uploaded += batch.length;
            } else {
                errors += batch.length;
                const batchFiles = batch.map(f => vscode.workspace.asRelativePath(f)).join(", ");
                channel.appendLine(`\n⚠️ Batch ${batchNum}/${totalBatches} FAILED (${batch.length} files)`);
                channel.appendLine(`   Error: ${result.error}`);
                channel.appendLine(`   HTTP status: ${result.status}`);
                channel.appendLine(`   Files in batch: ${batchFiles.length > 200 ? batchFiles.slice(0, 200) + "..." : batchFiles}`);
                channel.show(true);
            }
        }

        const summary = `✅ Indexed ${uploaded} project files` + (errors > 0 ? `, ⚠️ Failed: ${errors} (see Output > Kiro Indexer for details)` : "");
        return { uploaded, errors, summary };
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

    /** POST JSON and return raw body + ok status. Delegates to http-client-utils. */
    private async httpPostJson(url: string, payload: unknown, token: string | undefined): Promise<{ ok: boolean; body: string }> {
        const headers = await this.buildHeaders(token);
        try {
            // Use the utility but we need the raw response body, so wrap with a raw request
            const body = JSON.stringify(payload);
            const parsedUrl = new URL(url);
            const http = await import("http");
            return new Promise((resolve) => {
                const reqBody = body;
                const reqHeaders: Record<string, string> = {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(reqBody).toString(),
                    ...headers,
                };
                const req = http.default.request(
                    { hostname: parsedUrl.hostname, port: parsedUrl.port || undefined, path: parsedUrl.pathname + parsedUrl.search, method: "POST", headers: reqHeaders },
                    (res) => {
                        let data = "";
                        res.on("data", (chunk: any) => { data += chunk; });
                        res.on("end", () => resolve({ ok: res.statusCode === 200 || res.statusCode === 201, body: data }));
                    }
                );
                req.on("error", () => resolve({ ok: false, body: "" }));
                req.setTimeout(30000, () => { req.destroy(); resolve({ ok: false, body: '{"error":"timeout"}' }); });
                req.write(reqBody);
                req.end();
            });
        } catch (err) {
            console.debug(`[IndexerHttpClient] httpPostJson failed (non-fatal): ${(err as Error).message}`);
            return { ok: false, body: "" };
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
        const body = JSON.stringify(payload);
        const parsedUrl = new URL(url);
        const http = await import("http");
        return new Promise((resolve) => {
            const reqHeaders: Record<string, string> = {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body).toString(),
                ...headers,
            };
            const req = http.default.request(
                { hostname: parsedUrl.hostname, port: parsedUrl.port || undefined, path: parsedUrl.pathname + parsedUrl.search, method: "POST", headers: reqHeaders },
                (res) => {
                    let data = "";
                    res.on("data", (chunk: any) => { data += chunk; });
                    res.on("end", () => {
                        const status = res.statusCode || 0;
                        const ok = status === 200 || status === 201;
                        let error = ok ? "" : `HTTP ${status}`;
                        if (!ok && data) {
                            try { error = JSON.parse(data).error || JSON.parse(data).message || error; } catch { error = data.slice(0, 200); }
                        }
                        resolve({ ok, error, status });
                    });
                }
            );
            req.on("error", (err: Error) => resolve({ ok: false, error: `Network error: ${err.message}`, status: 0 }));
            req.setTimeout(30000, () => { req.destroy(); resolve({ ok: false, error: "Request timeout (30s) — batch may be too large", status: 0 }); });
            req.write(body);
            req.end();
        });
    }

    /** Build standard auth + project-id headers. */
    private async buildHeaders(token: string | undefined): Promise<Record<string, string>> {
        const headers: Record<string, string> = {};
        if (token) { headers["Authorization"] = `Bearer ${token}`; }
        const { getProjectId } = await import("../extension");
        const pid = getProjectId();
        if (pid && pid !== "default") { headers["X-Project-Id"] = pid; }
        // Send workspace root so server registers correct display_name
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            headers["X-Workspace-Root"] = workspaceFolders[0].uri.fsPath;
        }
        return headers;
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

