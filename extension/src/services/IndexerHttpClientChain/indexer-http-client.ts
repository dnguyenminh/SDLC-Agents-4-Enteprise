/**
 * IndexerHttpClient — public entry class of the BR-18 module chain.
 * Carries the MCP code-symbol sync and Pega KB sync endpoints; all other
 * members are inherited from the segment modules in ./IndexerHttpClientChain/.
 * (Extracted from IndexerHttpClient.ts; behavior unchanged.)
 */
import { getIndexerOutput } from "./state";
import { IndexerHttpClientUpload } from "./upload-api";

export class IndexerHttpClient extends IndexerHttpClientUpload {
    /**
     * Trigger code symbol sync on backend — syncs indexed code symbols into KB knowledge_entries.
     * Calls mem_sync_code via backend MCP endpoint. Auto-triggered after source upload.
     */
    async syncCodeSymbols(): Promise<string | null> {
        const url = `${this.backendUrl}/mcp`;
        const payload = {
            jsonrpc: "2.0",
            id: Date.now(),
            method: "tools/call",
            params: { name: "mem_sync_code", arguments: {} },
        };
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(60000),
            });
            if (!response.ok) {
                getIndexerOutput().appendLine(`[IndexerHttpClient] syncCodeSymbols failed with status ${response.status}`);
                return null;
            }
            const text = await response.text();
            try {
                const result = JSON.parse(text) as any;
                const content = result?.result?.content?.[0]?.text;
                return typeof content === "string" ? content : text;
            } catch {
                return text;
            }
        } catch (err) {
            getIndexerOutput().appendLine(`[IndexerHttpClient] syncCodeSymbols failed: ${(err as Error).message}`);
            return null;
        }
    }

    /** SA4E-209: Trigger async Pega sync (POST returns 202, actual sync runs in background). */
    async syncPegaRulesToKb(projectId: string, token?: string): Promise<{ message: string }> {
        const url = `${this.backendUrl}/api/index/sync-pega-rules`;
        const { ok, body } = await this.httpPostJson(url, { projectId }, token);
        if (!ok) return { message: `Pega sync failed: ${body}` };
        try {
            const data = JSON.parse(body);
            return { message: data.message || "Pega sync started" };
        } catch { return { message: body || "Pega sync started" }; }
    }
}
