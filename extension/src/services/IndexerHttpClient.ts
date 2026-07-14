/**
 * HTTP client for indexer operations — document ingestion and source file upload.
 */
import * as vscode from "vscode";
import * as path from "path";

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
        const http = await import("http");
        for (let i = 0; i < docs.length; i++) {
            const d = docs[i];
            if (i % 10 === 0) { report.report({ message: `Ingesting ${i + 1}/${docs.length} files...` }); }

            let fileContent = d.content;
            if (!fileContent) { fileContent = await this.readFileContent(d.path); }
            if (fileContent) { await this.uploadDocumentFile(d.path, fileContent, token); }

            const payload = { file_path: d.path, type: d.type, format: "markdown", ...(fileContent ? { content: fileContent } : {}) };
            const { ok, body } = await this.httpPostJson(url, payload, token, http);
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
        const files = await vscode.workspace.findFiles(
            "**/*.{ts,js,kt,java,py,go,rs,tsx,jsx}", "{node_modules,dist,.git,build,out,backend}/**"
        );
        if (files.length === 0) { return { uploaded: 0, errors: 0, summary: "ℹ️ No source files found" }; }

        const url = `${this.backendUrl}/api/index/source`;
        let uploaded = 0;
        let errors = 0;

        for (let i = 0; i < files.length; i += 50) {
            report.report({ message: `Uploading source files ${i + 1}/${files.length}...` });
            const batch = files.slice(i, i + 50);
            const entries = await Promise.all(
                batch.map(async (file) => {
                    const content = await vscode.workspace.fs.readFile(file);
                    return { path: vscode.workspace.asRelativePath(file), content: Buffer.from(content).toString("utf-8") };
                })
            );
            const http = await import("http");
            const success = await this.httpPost(url, { files: entries }, token, http);
            if (success) { uploaded += batch.length; } else { errors += batch.length; }
        }

        const summary = `✅ Uploaded ${uploaded} source files` + (errors > 0 ? `, ⚠️ Failed: ${errors}` : "");
        return { uploaded, errors, summary };
    }

    private async uploadDocumentFile(relPath: string, content: string, token?: string): Promise<boolean> {
        const http = require("http");
        return this.httpPost(`${this.backendUrl}/api/index/document`, { path: relPath, content }, token, http);
    }

    private async readFileContent(relPath: string): Promise<string | undefined> {
        try {
            const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (root) {
                const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(path.join(root, relPath)));
                return Buffer.from(raw).toString("utf-8");
            }
        } catch { /* skip */ }
        return undefined;
    }

    private async httpPostJson(url: string, payload: unknown, token: string | undefined, http: any): Promise<{ ok: boolean; body: string }> {
        const body = JSON.stringify(payload);
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body).toString(),
        };
        if (token) { headers["Authorization"] = `Bearer ${token}`; }
        const { getProjectId } = await import("../extension");
        const pid = getProjectId();
        if (pid && pid !== "default") { headers["X-Project-Id"] = pid; }
        return new Promise((resolve) => {
            const req = http.request(url, { method: "POST", headers }, (res: any) => {
                let data = "";
                res.on("data", (chunk: any) => { data += chunk; });
                res.on("end", () => resolve({ ok: res.statusCode === 200 || res.statusCode === 201, body: data }));
            });
            req.on("error", () => resolve({ ok: false, body: "" }));
            req.write(body);
            req.end();
        });
    }

    private async httpPost(url: string, payload: unknown, token: string | undefined, http: any): Promise<boolean> {
        const body = JSON.stringify(payload);
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body).toString(),
        };
        // Mandatory headers: JWT Bearer token + X-Project-Id (SA4E-30)
        if (token) { headers["Authorization"] = `Bearer ${token}`; }
        const { getProjectId } = await import("../extension");
        const pid = getProjectId();
        if (pid && pid !== "default") { headers["X-Project-Id"] = pid; }
        return new Promise<boolean>((resolve) => {
            const req = http.request(url, { method: "POST", headers }, (res: any) => {
                res.on("data", () => {});
                res.on("end", () => resolve(res.statusCode === 200 || res.statusCode === 201));
            });
            req.on("error", () => resolve(false));
            req.write(body);
            req.end();
        });
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
    } catch { /* not JSON — try legacy */ }

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
