/**
 * IndexerHttpClientKbIngest — KB ingest trigger segment: single backend call
 * that ingests the staged Temp documents into the knowledge base
 * (SA4E-99 / SA4E-337 F5).
 * (Extracted from IndexerHttpClient.ts for BR-18; behavior unchanged.)
 */
import { getIndexerOutput } from "./state";
import { parseErrorBody, parseIngestCounts } from "./parsing";
import { IndexerHttpClientProgress } from "./progress";

export class IndexerHttpClientKbIngest extends IndexerHttpClientProgress {
    /**
     * SA4E-99: Trigger backend to ingest documents from Temp folder into KB.
     * SA4E-337 F5: on non-OK responses the body is parsed for {error, details, action}
     * so the user sees the same detail lines as httpPostWithDetail produced before
     * the rewrite (60s timeout and return shape unchanged).
     */
    protected async triggerDocumentIngest(token?: string): Promise<{ ingested: number; errors: number; total: number }> {
        const url = `${this.backendUrl}/api/index/ingest-docs`;
        const headers = await this.buildHeaders(token);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...headers },
                body: JSON.stringify({}),
                signal: AbortSignal.timeout(60000),
            });
            const bodyText = await response.text();
            if (!response.ok) {
                // F5: restore error/details/action surfacing (was dropped with httpPostWithDetail)
                this.logDocumentIngestFailure(bodyText, response.status);
                return { ingested: 0, errors: 0, total: 0 };
            }
            const counts = parseIngestCounts(bodyText);
            if (!counts) { return { ingested: 0, errors: 0, total: 0 }; }
            getIndexerOutput().appendLine(`   KB ingest: ${counts.ingested}/${counts.total} files ingested, ${counts.errors} errors`);
            return counts;
        } catch (err: any) {
            const channel = getIndexerOutput();
            channel.appendLine(`⚠️ Document ingest error: ${err?.message || String(err)}`);
            return { ingested: 0, errors: 0, total: 0 };
        }
    }

    /** F5: log a non-OK document-ingest response with its error envelope. */
    private logDocumentIngestFailure(bodyText: string, status: number): void {
        const detail = parseErrorBody(bodyText);
        const channel = getIndexerOutput();
        channel.appendLine(`⚠️ Document ingest failed: status ${status}${detail.error ? ` — ${detail.error}` : ''}`);
        if (detail.details) channel.appendLine(`   Details: ${detail.details}`);
        if (detail.action) channel.appendLine(`   Action: ${detail.action}`);
    }
}
