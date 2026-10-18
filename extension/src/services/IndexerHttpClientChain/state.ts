/**
 * Module-level mutable state for the IndexerHttpClient family (BR-18 split).
 * Single home for the mutable module state that used to live as private
 * statics on the IndexerHttpClient class: the output-channel singleton and
 * the GET-failure log throttle.
 */
import * as vscode from "vscode";

// SA4E-300: reused singleton channel (was IndexerHttpClient.outputChannel)
let outputChannel: vscode.OutputChannel | undefined;

/** Shared singleton output channel (was static IndexerHttpClient.getIndexerOutput). */
export function getIndexerOutput(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel("Kiro Indexer");
    }
    return outputChannel;
}

// Throttle timestamp for repeated GET network-failure logs (was IndexerHttpClient.lastTimeoutLog)
let lastTimeoutLog = 0;

/** Log a failed GET attempt, throttled to one line per 30s window. */
export function logHttpGetFailure(err: unknown): void {
    const now = Date.now();
    if (now - lastTimeoutLog > 30000) {
        lastTimeoutLog = now;
        getIndexerOutput().appendLine(`[IndexerHttpClient] httpGet failed (non-fatal): ${(err as Error).message}`);
    }
}
