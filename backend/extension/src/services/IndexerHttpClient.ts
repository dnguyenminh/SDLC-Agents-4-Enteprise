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

export interface IngestResult {
    ingested: number;
    errors: number;
    summary: string;
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
        const url = `${this.backendUrl}/mcp/tools/call`;
        let ingested = 0;
        let errors = 0;

        const http = await import("http");
        for (let i = 0; i < docs.length; i++) {
            const d = docs[i];
            if (i % 10 === 0) { report.report({ message: `Ingesting ${i + 1}/${docs.length} files...` }); }

            let fileContent = d.content;
            if (!fileContent) { fileContent = await this.readFileContent(d.path); }
            if (fileContent) { await this.uploadDocumentFile(d.path, fileContent, token); }

            const payload = {
                tool_name: "mem_ingest_file",
                arguments: { file_path: d.path, type: d.type, format: "markdown", ...(fileContent ? { content: fileContent } : {}) },
            };
            const success = await this.httpPost(url, payload, token, http);
            if (success) { ingested++; } else { errors++; }
        }

        const summary = `✅ Indexed: ${ingested} files` + (errors > 0 ? `, ⚠️ Failed: ${errors}` : ``);
        return { ingested, errors, summary };
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

    private async httpPost(url: string, payload: unknown, token: string | undefined, http: any): Promise<boolean> {
        const body = JSON.stringify(payload);
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body).toString(),
        };
        if (token) { headers["Authorization"] = `Bearer ${token}`; }
        return new Promise<boolean>((resolve) => {
            const req = http.request(url, { method: "POST", headers }, (res: any) => {
                res.on("data", () => {});
                res.on("end", () => resolve(res.statusCode === 200));
            });
            req.on("error", () => resolve(false));
            req.write(body);
            req.end();
        });
    }
}
