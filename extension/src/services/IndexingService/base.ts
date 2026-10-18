/**
 * IndexingServiceBase — shared state, auth plumbing, progress bar and small
 * workspace checks for the IndexingService inheritance chain.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { IndexerHttpClient } from "../IndexerHttpClient";
import type { IngestAuthProvider } from "../../utils/backend-auth-headers";
import type { IndexOptions } from "./types";

export class IndexingServiceBase {
    protected statusBarItem: vscode.StatusBarItem | null = null;
    /** Concurrency guard — prevents overlapping indexing operations. */
    protected isProcessing = false;
    /** Current auth token — captured from indexWorkspace args (AuthManager/SecretStorage). */
    protected token?: string;
    protected refreshTokenFn?: () => Promise<string | undefined>;

    constructor(
        protected readonly httpClient: IndexerHttpClient,
        protected readonly outputChannel?: vscode.OutputChannel
    ) {
        // SA4E-300 GAP 3+4: keep this.token in sync when the HTTP client
        // refreshes the JWT internally (401 → tokenRefresher → fresh token).
        try {
            this.httpClient.setOnTokenRefreshed((fresh: string) => {
                this.token = fresh;
            });
        } catch { /* non-fatal — older clients without the setter */ }
    }

    setRefreshTokenFn(fn: () => Promise<string | undefined>) {
        this.refreshTokenFn = fn;
    }

    /**
     * Live auth token — prefers AuthManager's current token over the copy
     * captured when indexing started, so a rotated token is never replayed.
     */
    protected currentToken(): string {
        const live = (globalThis as { __authTokenProvider?: () => string }).__authTokenProvider?.();
        return live || this.token || "";
    }

    /**
     * SA4E-362 FR-5 — Provider auth đầy đủ cho ingest path: token cache (live qua
     * currentToken()) + refresh theo nhu cầu khi 401. Dựng closure MỚI mỗi lần gọi
     * (không state) — an toàn vì isProcessing chặn 2 run song song.
     * GAP 4 (SA4E-300): refresh thành công phải cập nhật this.token để getTokenSync()
     * ở các request sau trả token mới (nếu không, mọi request đầu lại dùng token cũ → 401 mỗi lần).
     * Precedence của currentToken(): globalThis.__authTokenProvider?.() → this.token → "".
     */
    protected ingestAuthProvider(): IngestAuthProvider {
        return {
            getTokenSync: () => this.currentToken(),
            refreshToken: async () => {
                if (!this.refreshTokenFn) { return undefined; } // AF-1 — chưa wired
                try {
                    const fresh = await this.refreshTokenFn();   // adapter AuthManager (CommandRegistrar)
                    if (fresh) { this.token = fresh; }           // ← GAP 4: đồng bộ token nội bộ
                    return fresh;
                } catch { return undefined; }                    // EF-1 — refresh throw = refresh thất bại
            },
        };
    }

    protected log(msg: string): void {
        if (this.outputChannel) { this.outputChannel.appendLine(msg); }
    }

    /** Show indexing progress on status bar with file info and percentage. */
    protected showProgress(message: string): void {
        if (!this.statusBarItem) {
            this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
            this.statusBarItem.show();
        }
        this.statusBarItem.text = `$(sync~spin) ${message}`;
        this.statusBarItem.tooltip = `Indexing in progress: ${message}`;
    }

    /** Hide indexing status bar item when done. */
    protected hideProgress(): void {
        if (this.statusBarItem) {
            this.statusBarItem.dispose();
            this.statusBarItem = null;
        }
    }

    /** Build a human-readable label describing which tasks are selected. */
    protected describeTasks(options: IndexOptions): string {
        const tasks: string[] = [];
        if (options.schemas) { tasks.push("Pega Rule Schema Generation"); }
        if (options.code) { tasks.push("Source Code Indexing"); }
        if (options.documents) { tasks.push("Document Indexing"); }
        if (options.sync) { tasks.push("Code Symbol Sync"); }
        if (options.jira) { tasks.push("Jira Project Indexing"); }
        if (tasks.length === 0) { return "Workspace Indexing"; }
        if (tasks.length === 1) { return tasks[0]; }
        return "Workspace Indexing";
    }

    /** SA4E-101: Poll backend TaskWorker progress and show on status bar until done. */
    protected pollTaskWorkerProgress(): void {
        const backendUrl = this.httpClient.getBaseUrl();
        if (!backendUrl) return;
        const headersOf = (current: string | undefined): Record<string, string> =>
            current ? { "Authorization": `Bearer ${current}` } : {};
        const poll = async () => {
            try {
                let token = this.currentToken();
                let res = await fetch(`${backendUrl}/api/admin/taskworker/progress`, { headers: headersOf(token) });
                if (res.status === 401 && this.refreshTokenFn) {
                    const fresh = await this.refreshTokenFn();
                    // SA4E-300 GAP 4: persist the refreshed token (was local-only before)
                    if (fresh) { this.token = fresh; token = fresh; res = await fetch(`${backendUrl}/api/admin/taskworker/progress`, { headers: headersOf(token) }); }
                }
                if (!res.ok) { this.hideProgress(); return; }
                const data = await res.json() as { active: boolean; file?: string; current?: number; total?: number; percent?: number };
                if (!data.active) { this.hideProgress(); return; }
                const fileName = data.file ? data.file.split('/').pop() || data.file : '';
                const detail = (typeof data.current === 'number' && typeof data.total === 'number')
                    ? ` (${data.current}/${data.total} — ${data.percent ?? 0}%)`
                    : '';
                this.showProgress(`Analyzing ${fileName}${detail}`);
                setTimeout(poll, 3000);
            } catch { this.hideProgress(); }
        };
        setTimeout(poll, 2000);
    }

    /** Check KB for existing Pega rule schemas (via backend mem_search). */
    protected hasExistingSchemas(root: string): boolean {
        // Synchronous check: look for schema files on disk as quick proxy.
        // KB is the authoritative source, but sync check via HTTP is not possible here.
        // Schema gen will also ingest into KB, so next run will find them.
        const schemaDir = path.join(root, "schemas", "auto");
        try {
            const files = fs.readdirSync(schemaDir);
            return files.some((f: string) => f.endsWith(".json"));
        } catch { return false; }
    }

    /** Detect if workspace is a Pega project (has pega-project.json). */
    protected isPegaProject(root: string): boolean {
        try { return fs.existsSync(path.join(root, "pega-project.json")); }
        catch { return false; }
    }
}
