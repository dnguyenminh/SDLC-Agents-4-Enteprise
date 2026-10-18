/**
 * KB entry ingestion for the Jira project sync (SA4E-102).
 * POSTs entries to the backend memory ingest API with auth + project headers.
 */

import type * as vscode from "vscode";
import type { IndexerHttpClient } from "../IndexerHttpClient";
import type { KbEntry } from "../jira-sync";

type ProgressReporter = vscode.Progress<{ message?: string }>;

/** Ingest KB entries via backend API. */
export async function ingestEntries(
    httpClient: IndexerHttpClient,
    entries: KbEntry[],
    token?: string,
    report?: ProgressReporter,
): Promise<number> {
    const backendUrl = httpClient.getBaseUrl();
    const url = `${backendUrl}/api/v1/memory/ingest`;
    let ingested = 0;

    for (let i = 0; i < entries.length; i++) {
        if (i % 20 === 0 && report) {
            report.report({ message: `Ingesting ${i + 1}/${entries.length} entries...` });
        }
        try {
            const ok = await httpPost(url, entries[i], token);
            if (ok) { ingested++; }
        } catch {
            // Non-fatal: log and continue
        }
    }

    return ingested;
}

/** HTTP POST to backend. */
async function httpPost(url: string, payload: unknown, token?: string): Promise<boolean> {
    const http = await import("http");
    const body = JSON.stringify(payload);
    const parsedUrl = new URL(url);
    const { getProjectId } = await import("../../extension");

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body).toString(),
    };
    if (token) { headers["Authorization"] = `Bearer ${token}`; }
    const pid = getProjectId();
    if (pid) { headers["X-Project-Id"] = pid; }

    return new Promise((resolve) => {
        const req = http.default.request(
            { hostname: parsedUrl.hostname, port: parsedUrl.port || undefined, path: parsedUrl.pathname, method: "POST", headers },
            (res) => {
                let data = "";
                res.on("data", (chunk: any) => { data += chunk; });
                res.on("end", () => resolve(res.statusCode === 200 || res.statusCode === 201));
            },
        );
        req.on("error", () => resolve(false));
        req.setTimeout(15000, () => { req.destroy(); resolve(false); });
        req.write(body);
        req.end();
    });
}
