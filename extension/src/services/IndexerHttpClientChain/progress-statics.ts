/**
 * IndexerHttpClientLogging — diagnostics segment: shared output-channel access,
 * progress formatting helpers, and terminal index-state logging.
 * (Extracted from IndexerHttpClient.ts for BR-18; behavior unchanged.)
 */
import * as vscode from "vscode";
import { getIndexerOutput } from "./state";
import { IndexerHttpClientUploadHelpers } from "./upload-helpers";

export class IndexerHttpClientLogging extends IndexerHttpClientUploadHelpers {
    /** Shared singleton output channel (backs state.getIndexerOutput). */
    static getIndexerOutput(): vscode.OutputChannel {
        return getIndexerOutput();
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

    /**
     * Persist a terminal (non-success) index outcome to the Output channel so it
     * outlives the transient status bar item (which auto-disposes after 5–8s).
     * Logs phase/status/percentage/file so the user can diagnose after the fact.
     * @param outcome Terminal state label (failed/interrupted/cancelled/timeout)
     * @param progress Last parsed progress payload from /api/index/progress
     * @param reveal When true, bring the Output channel to front (used for failures)
     */
    static logTerminalIndexState(outcome: string, progress: any, reveal: boolean): void {
        const channel = IndexerHttpClientLogging.getIndexerOutput();
        const when = new Date().toLocaleTimeString();
        const pct = typeof progress?.percentage === 'number' ? `${progress.percentage}%` : 'n/a';
        const counts = (typeof progress?.current === 'number' && typeof progress?.total === 'number')
            ? ` (${progress.current}/${progress.total} files)` : '';
        const elapsed = typeof progress?.elapsedMs === 'number' ? ` after ${Math.round(progress.elapsedMs / 1000)}s` : '';
        const file = progress?.currentFile ? ` — last file: ${progress.currentFile}` : '';
        const errMsg = progress?.error?.message || progress?.message;
        const detail = errMsg ? ` — ${IndexerHttpClientLogging.formatIndexError(progress)}` : '';
        const icon = outcome === 'complete' ? '✅' : '❌';
        channel.appendLine(
            `[Indexer] ${icon} Index ${outcome} @ ${when} — phase ${progress?.phase ?? 'unknown'}, ${pct}${counts}${elapsed}${file}${detail}`,
        );
        if (progress?.error?.stack) { channel.appendLine(`   Stack: ${progress.error.stack}`); }
        if (reveal) { channel.show(true); }
    }
}
