/**
 * Indexer HTTP Operations — extracted from indexer.ts
 * Handles document ingestion and source file uploading via HTTP.
 */

import * as vscode from "vscode";
import * as path from "path";
import { httpPostJson } from "./utils/http-client-utils";

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
  const authHeaders: Record<string, string> = token ? { "Authorization": `Bearer ${token}` } : {};

  try {
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
        } catch (fileErr) {
          console.debug("[indexer-http] Failed to read file content for " + d.path + ": " + (fileErr as Error).message);
        }
      }
      if (fileContent) await uploadDocumentFile(d.path, fileContent, token);
      const payload = {
        tool_name: "mem_ingest_file",
        arguments: { file_path: d.path, type: d.type, format: "markdown", ...(fileContent ? { content: fileContent } : {}) },
      };
      const success = await httpPostJson<unknown>(url, payload, { headers: authHeaders, timeoutMs: 30000 })
        .then(() => true)
        .catch(() => false);
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
  const authHeaders: Record<string, string> = token ? { "Authorization": `Bearer ${token}` } : {};
  return httpPostJson<unknown>(`${backendUrl}/api/index/document`, { path: relPath, content }, { headers: authHeaders })
    .then(() => true)
    .catch(() => false);
}

export async function uploadSourceFiles(report: vscode.Progress<{ message?: string }>, token?: string): Promise<string> {
  const backendUrl = getBackendUrl();
  if (!backendUrl) return "❌ Backend URL not configured.";
  const libraryExcludes = "{node_modules,dist,.git,build,out,backend,.opencode,vendor,packages,bower_components}/**";
  const files = await vscode.workspace.findFiles(
    "**/*.{ts,js,kt,java,py,go,rs,tsx,jsx}", libraryExcludes
  );
  if (files.length === 0) return "❌ No source files found";
  const url = `${backendUrl}/api/index/source`;
  let uploaded = 0;
  let errors = 0;
  const authHeaders: Record<string, string> = token ? { "Authorization": `Bearer ${token}` } : {};

  for (let i = 0; i < files.length; i += 50) {
    report.report({ message: `Indexing project code ${i + 1}/${files.length}...` });
    const batch = files.slice(i, i + 50);
    const entries = await Promise.all(
      batch.map(async (file) => {
        const content = await vscode.workspace.fs.readFile(file);
        return { path: vscode.workspace.asRelativePath(file), content: Buffer.from(content).toString("utf-8") };
      })
    );
    const success = await httpPostJson<unknown>(url, { files: entries }, { headers: authHeaders })
      .then(() => true)
      .catch(() => false);
    if (success) uploaded += batch.length; else errors += batch.length;
  }
  return `✅ Indexed ${uploaded} project files` + (errors > 0 ? `, ⚠️ Failed: ${errors}` : "");
}
