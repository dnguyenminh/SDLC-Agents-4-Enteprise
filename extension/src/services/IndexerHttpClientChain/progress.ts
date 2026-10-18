/**
 * IndexerHttpClientProgress — index-progress polling segment: status-bar driven
 * poll of /api/index/progress plus the enrichment/progress GET endpoints.
 * (Extracted from IndexerHttpClient.ts for BR-18; behavior unchanged.)
 */
import * as vscode from "vscode";
import { IndexerHttpClientLogging } from "./progress-statics";

export class IndexerHttpClientProgress extends IndexerHttpClientLogging {
    /**
     * SA4E-99: Poll /api/index/progress until idle. Shows status bar progress.
     * Resolves when indexing completes or times out after maxWaitMs.
     */
    async pollIndexProgress(token?: string, maxWaitMs = 900000): Promise<void> {
        const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
        statusBar.show();
        try {
            const result = await this.pollLoop(statusBar, token, maxWaitMs);
            if (result.timedOut) { IndexerHttpClientProgress.showIndexTimeout(statusBar, result.lastProgress); }
        } catch { statusBar.dispose(); }
    }

    /** Poll loop: sleeps 2s between progress GETs; stops on terminal status or timeout. */
    private async pollLoop(
        statusBar: vscode.StatusBarItem,
        token: string | undefined,
        maxWaitMs: number,
    ): Promise<{ timedOut: boolean; lastProgress: any }> {
        const start = Date.now();
        let lastProgress: any = null;
        let lastPct: number | null = null;
        while (Date.now() - start < maxWaitMs) {
            await new Promise(r => setTimeout(r, 2000));
            // Shared GET path: 401 refresh + 10s timeout. A raw fetch here
            // loses auth mid-run (long index → expired JWT → 401) and the
            // bar collapses to a %‑less "Indexing..." for the rest of the run.
            const { ok, body } = await this.getIndexProgress(token);
            if (!ok) {
                IndexerHttpClientProgress.showReconnecting(statusBar, lastPct, "Code Intelligence: Indexing workspace... (progress poll retrying)");
                continue;
            }
            try {
                const progress = JSON.parse(body);
                lastProgress = progress;
                if (IndexerHttpClientProgress.applyTerminalStatus(statusBar, progress.status, progress)) { return { timedOut: false, lastProgress }; }
                lastPct = IndexerHttpClientProgress.updateActiveProgress(statusBar, progress, progress.status, lastPct);
            } catch {
                IndexerHttpClientProgress.showReconnecting(statusBar, lastPct, "Code Intelligence: Processing... (progress poll retrying)");
            }
        }
        return { timedOut: true, lastProgress };
    }

    /** Set the "reconnecting" status-bar text/tooltip after a failed poll. */
    private static showReconnecting(statusBar: vscode.StatusBarItem, lastPct: number | null, tooltip: string): void {
        statusBar.text = lastPct !== null
            ? `$(sync~spin) Indexing: ${lastPct}% (reconnecting…)`
            : "$(sync~spin) Indexing...";
        statusBar.tooltip = tooltip;
    }

    /** Apply a terminal progress status to the bar; returns true when polling stops. */
    private static applyTerminalStatus(statusBar: vscode.StatusBarItem, status: string, progress: any): boolean {
        if (status === 'idle' || progress.phase === 'idle') {
            IndexerHttpClientProgress.markIdleComplete(statusBar);
            return true;
        }
        if (status === 'interrupted') { IndexerHttpClientProgress.markInterrupted(statusBar, progress); return true; }
        if (status === 'superseded') { IndexerHttpClientProgress.markSuperseded(statusBar); return true; }
        if (status === 'completed' || progress.phase === 'complete') { IndexerHttpClientProgress.markCompleted(statusBar, progress); return true; }
        if (status === 'failed' || progress.phase === 'error') { IndexerHttpClientProgress.markFailed(statusBar, progress); return true; }
        if (status === 'cancelled' || progress.phase === 'cancelled') { IndexerHttpClientProgress.markCancelled(statusBar, progress); return true; }
        return false;
    }

    /** "$(check) Index complete" bar for an idle backend (auto-dispose after 5s). */
    private static markIdleComplete(statusBar: vscode.StatusBarItem): void {
        statusBar.text = "$(check) Index complete";
        statusBar.tooltip = "Code Intelligence: Indexing finished successfully";
        setTimeout(() => statusBar.dispose(), 5000);
    }

    /** "$(warning) Index interrupted" bar + persistent Output line (8s dispose). */
    private static markInterrupted(statusBar: vscode.StatusBarItem, progress: any): void {
        statusBar.text = "$(warning) Index interrupted";
        statusBar.tooltip = "Code Intelligence: Indexing was interrupted by backend restart";
        // Persist to Output — the transient status bar vanishes after 8s.
        IndexerHttpClientProgress.logTerminalIndexState('interrupted', progress, false);
        setTimeout(() => statusBar.dispose(), 8000);
    }

    /** "$(info) Index superseded" bar (previous run was replaced, 8s dispose). */
    private static markSuperseded(statusBar: vscode.StatusBarItem): void {
        statusBar.text = "$(info) Index superseded";
        statusBar.tooltip = "Code Intelligence: Previous index was superseded by a new run";
        setTimeout(() => statusBar.dispose(), 8000);
    }

    /** "$(check) Index complete" bar after a completed run + Output line (5s dispose). */
    private static markCompleted(statusBar: vscode.StatusBarItem, progress: any): void {
        statusBar.text = "$(check) Index complete";
        statusBar.tooltip = "Code Intelligence: Indexing finished successfully";
        IndexerHttpClientProgress.logTerminalIndexState('complete', progress, false);
        setTimeout(() => statusBar.dispose(), 5000);
    }

    /** "$(error) Index failed" bar + Output line + error dialog (8s dispose). */
    private static markFailed(statusBar: vscode.StatusBarItem, progress: any): void {
        const errDetail = IndexerHttpClientProgress.formatIndexError(progress);
        statusBar.text = "$(error) Index failed";
        statusBar.tooltip = `Code Intelligence: Indexing failed — ${errDetail}`;
        // Persist + surface: failure detail must outlive the 8s status bar so
        // the user can read why the index failed (see Output > Kiro Indexer).
        IndexerHttpClientProgress.logTerminalIndexState('failed', progress, true);
        vscode.window.showErrorMessage(`Indexing failed: ${errDetail}`, "Open Output")
            .then(action => { if (action === "Open Output") { IndexerHttpClientProgress.getIndexerOutput().show(); } });
        setTimeout(() => statusBar.dispose(), 8000);
    }

    /** "$(stop) Index cancelled" bar + Output line (5s dispose). */
    private static markCancelled(statusBar: vscode.StatusBarItem, progress: any): void {
        statusBar.text = "$(stop) Index cancelled";
        statusBar.tooltip = "Code Intelligence: Indexing was cancelled";
        IndexerHttpClientProgress.logTerminalIndexState('cancelled', progress, false);
        setTimeout(() => statusBar.dispose(), 5000);
    }

    /** Refresh the live progress tooltip; returns the % to remember for reconnects. */
    private static updateActiveProgress(
        statusBar: vscode.StatusBarItem, progress: any, status: string, lastPct: number | null,
    ): number | null {
        const elapsed = Math.round((progress.elapsedMs || 0) / 1000);
        const checksumStats = progress.checksumStats;
        let checksumInfo = '';
        if (checksumStats) {
            checksumInfo = `\nChecksum: skipped ${checksumStats.files_skipped}, processed ${checksumStats.files_processed}, pending ${checksumStats.files_pending}`;
        }
        const pct = IndexerHttpClientProgress.progressPct(progress);
        const shown = pct ?? lastPct;
        const pctText = shown !== null ? `${shown}%` : 'n/a';
        statusBar.text = shown !== null ? `$(sync~spin) Indexing: ${shown}%` : "$(sync~spin) Indexing...";
        statusBar.tooltip = `Code Intelligence — ${progress.phase}${status ? ' (' + status + ')' : ''}\n`
            + `Progress: ${progress.current}/${progress.total} files (${pctText})\n`
            + `Elapsed: ${elapsed}s${checksumInfo}\n`
            + (progress.currentFile ? `Current: ${progress.currentFile}` : '');
        return shown;
    }

    /** "$(warning) Index timeout" bar + persistent Output line (5s dispose). */
    private static showIndexTimeout(statusBar: vscode.StatusBarItem, lastProgress: any): void {
        statusBar.text = "$(warning) Index timeout";
        // Persist + reveal — a timeout is a failure the user needs to see.
        IndexerHttpClientProgress.logTerminalIndexState('timeout', lastProgress ?? {}, true);
        setTimeout(() => statusBar.dispose(), 5000);
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
}
