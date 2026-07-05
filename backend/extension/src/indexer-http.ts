/**
 * Indexer HTTP Operations — extracted from indexer.ts
 * Handles document ingestion and source file uploading via HTTP.
 */

import * as vscode from "vscode";
import * as path from "path";

function getBackendUrl(): string | undefined {
  return vscode.workspace.getConfiguration("kiroSdlc").get<string>("backend.url");
}

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export async function ingestDocumentsViaHttp(
  docs: Array<{ path: string; type: string; ticket: string; content?: string }>,
  report: vscode.Progress<{ message?: string }>,
  token?: string
): Promise<string> {
  const backendUrl = getBackendUrl();
  if (!backendUrl) return "❌ Backend URL not configured.";
  const url = `${backendUrl}/mcp/tools/call`;
  let ingested = 0;
  let errors = 0;

  try {
    const http = await import("http");
    for (let i = 0; i < docs.length; i++) {
      const d = docs[i];
      if (i % 10 === 0) report.report({ message: `Ingesting ${i + 1}/${docs.length} files...` });
      let fileContent = d.content;
      if (!fileContent) {
        try {
          const root = getWorkspaceRoot();
          if (root) {
            const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(path.join(root, d.path)));
            fileContent = Buffer.from(raw).toString("utf-8");
          }
        } catch { /* skip */ }
      }
      if (fileContent) await uploadDocumentFile(d.path, fileContent, token);
      const payload = {
        tool_name: "mem_ingest_file",
        arguments: { file_path: d.path, type: d.type, format: "markdown", ...(fileContent ? { content: fileContent } : {}) },
      };
      const success = await httpPost(url, payload, token, http);
      if (success) ingested++; else errors++;
    }
    return `✅ Indexed: ${ingested} files` + (errors > 0 ? `, ⚠️ Failed: ${errors}` : ``);
  } catch (err: any) {
    return `❌ HTTP request failed: ${err.message}`;
  }
}

export async function uploadDocumentFile(relPath: string, content: string, token?: string): Promise<boolean> {
  const backendUrl = getBackendUrl();
  if (!backendUrl) return false;
  const http = require("http");
  return httpPost(`${backendUrl}/api/index/document`, { path: relPath, content }, token, http);
}

export async function uploadSourceFiles(report: vscode.Progress<{ message?: string }>, token?: string): Promise<string> {
  const backendUrl = getBackendUrl();
  if (!backendUrl) return "❌ Backend URL not configured.";
  const files = await vscode.workspace.findFiles(
    "**/*.{ts,js,kt,java,py,go,rs,tsx,jsx}", "{node_modules,dist,.git,build,out,backend}/**"
  );
  if (files.length === 0) return "ℹ️ No source files found";
  const url = `${backendUrl}/api/index/source`;
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
    const http = require("http");
    const success = await httpPost(url, { files: entries }, token, http);
    if (success) uploaded += batch.length; else errors += batch.length;
  }
  return `✅ Uploaded ${uploaded} source files` + (errors > 0 ? `, ⚠️ Failed: ${errors}` : "");
}

async function httpPost(url: string, payload: unknown, token: string | undefined, http: any): Promise<boolean> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body).toString(),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
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
