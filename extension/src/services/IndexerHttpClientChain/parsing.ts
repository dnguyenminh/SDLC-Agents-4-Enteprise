/**
 * IndexerHttpClient response parsing helpers (BR-18 split).
 * parseIngestResponse/parseUnconvertible keep their original public contract
 * (re-exported from the facade); parseErrorBody/parseIngestCounts are internal
 * extractors shared by the ingest flow.
 * (Extracted from IndexerHttpClient.ts; behavior unchanged.)
 */
import { UnconvertibleEntry } from "./types";
import { getIndexerOutput } from "./state";

/** SA4E-337 F5: best-effort parse of an error response body ({error, details, action}). */
export function parseErrorBody(bodyText: string): { error?: string; details?: string; action?: string } {
    if (!bodyText) return {};
    try {
        const body = JSON.parse(bodyText);
        if (body && typeof body === 'object') {
            return {
                error: typeof body.error === 'string' ? body.error : undefined,
                details: typeof body.details === 'string' ? body.details : undefined,
                action: typeof body.action === 'string' ? body.action : undefined,
            };
        }
    } catch { /* non-JSON error body (HTML proxy page, plain text) — no detail lines */ }
    return {};
}

/** UT-81(a): parse the ingest-docs counts; null when the body is not valid JSON. */
export function parseIngestCounts(bodyText: string): { ingested: number; errors: number; total: number } | null {
    let parsed: any;
    try {
        parsed = JSON.parse(bodyText || '{}');
    } catch {
        // FSD TC-20 / STC UT-81(a): invalid body → notify, keep the run going
        getIndexerOutput().appendLine('⚠️ Could not parse ingest response');
        return null;
    }
    return { ingested: parsed?.ingested ?? 0, errors: parsed?.errors ?? 0, total: parsed?.total ?? 0 };
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
      getIndexerOutput().appendLine(`[IndexerHttpClient] response parse failed, trying legacy (non-fatal): ${(err as Error).message}`);
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
