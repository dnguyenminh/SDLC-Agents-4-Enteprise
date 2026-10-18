/**
 * IndexerHttpClientIngest — document-ingest segment: batched document staging to
 * the backend Temp dir, transient-failure retry queueing, and the single KB
 * ingest trigger (SA4E-99 / SA4E-300 / SA4E-337).
 * (Extracted from IndexerHttpClient.ts for BR-18; behavior unchanged.)
 */
import * as vscode from "vscode";
import { DocEntry, FileEntry, IngestResult, UnconvertibleEntry } from "./types";
import { getIndexerOutput } from "./state";
import { IndexerHttpClientRetry } from "./retry";
import { IndexerHttpClientKbIngest } from "./kb-ingest";

export class IndexerHttpClientIngest extends IndexerHttpClientKbIngest {
    async ingestDocuments(
        docs: DocEntry[],
        report: vscode.Progress<{ message?: string }>,
        token?: string
    ): Promise<IngestResult> {
        // SA4E-99: Unified approach — write docs to Temp (same as source), then batch ingest
        const unconvertible: UnconvertibleEntry[] = [];
        const retryQueue: FileEntry[] = [];
        // SA4E-300: file-level retry for doc writes (same policy as source uploads).
        const retryRounds = this.readIndexRetryRounds();
        // SA4E-300 GAP 3: reuse singleton channel (was a fresh "Kiro Doc Indexer" per call)
        const channel = getIndexerOutput();
        const staged = await this.ingestAllBatches(docs, report, token, retryQueue);
        let ingested = staged.ingested;
        let errors = staged.noContent;
        const drained = await this.drainDocRetryQueue(retryQueue, token, retryRounds);
        ingested += drained.uploaded;
        errors += drained.errors;
        errors += staged.permanent;
        if (errors > 0) { channel.show(true); }
        const kb = await this.runDocumentKbIngestIfStaged(ingested, report, token);
        const summary = IndexerHttpClientIngest.buildIngestSummary(ingested, errors, unconvertible, kb.ingested, kb.errors);
        return { ingested, errors, summary, unconvertible };
    }

    /** Stage + write every document batch; returns accumulated counters (SA4E-99). */
    private async ingestAllBatches(
        docs: DocEntry[],
        report: vscode.Progress<{ message?: string }>,
        token: string | undefined,
        retryQueue: FileEntry[],
    ): Promise<{ ingested: number; noContent: number; permanent: number }> {
        let ingested = 0;
        let noContent = 0;
        let permanent = 0;
        const batchSize = 20;
        for (let i = 0; i < docs.length; i += batchSize) {
            const batch = docs.slice(i, i + batchSize);
            const outcome = await this.ingestDocBatch(batch, i, docs.length, batchSize, report, token, retryQueue);
            ingested += outcome.written;
            noContent += outcome.noContent;
            permanent += outcome.permanent;
        }
        return { ingested, noContent, permanent };
    }

    /** Stage + write one document batch to the backend Temp dir (SA4E-300 retry-aware). */
    private async ingestDocBatch(
        batch: DocEntry[],
        batchIndex: number,
        totalDocs: number,
        batchSize: number,
        report: vscode.Progress<{ message?: string }>,
        token: string | undefined,
        retryQueue: FileEntry[],
    ): Promise<{ written: number; noContent: number; permanent: number }> {
        const channel = getIndexerOutput();
        const batchNum = Math.floor(batchIndex / batchSize) + 1;
        const totalBatches = Math.ceil(totalDocs / batchSize);
        const pct = Math.round((batchIndex / totalDocs) * 100);
        report.report({ message: `Ingesting documents: ${pct}% (${batchIndex + 1}/${totalDocs} files, batch ${batchNum}/${totalBatches})` });
        if (batchIndex > 0) { await new Promise(r => setTimeout(r, 200)); }
        const { entries, noContent } = await this.stageDocEntries(batch);
        if (entries.length === 0) { return { written: 0, noContent, permanent: 0 }; }
        // Write to Temp via /api/index/documents (batch write to disk)
        const writeResult = await this.sendBatchWithRetry(
            `${this.backendUrl}/api/index/documents`,
            { files: entries }, token, 3,
        );
        if (!writeResult.ok) {
            // SA4E-300: server never accepted these files — queue, don't drop.
            retryQueue.push(...entries);
            channel.appendLine(`⚠️ Doc batch ${batchNum}: ${writeResult.error} — ${entries.length} file(s) queued for retry`);
            return { written: 0, noContent, permanent: 0 };
        }
        const applied = this.applyDocWriteOutcome(writeResult.body, entries, batchNum, retryQueue);
        return { written: applied.written, noContent, permanent: applied.permanent };
    }

    /** Apply a 200 doc-write outcome: count writes, classify + log rejections (SA4E-300). */
    private applyDocWriteOutcome(
        body: any, entries: FileEntry[], batchNum: number, retryQueue: FileEntry[],
    ): { written: number; permanent: number } {
        const channel = getIndexerOutput();
        // SA4E-300: per-file disk-write failures arrive INSIDE the 200 body —
        // count real writes; retryable rejections are re-queued with backoff.
        const outcome = IndexerHttpClientRetry.batchWriteOutcome(body, entries.length);
        const classified = IndexerHttpClientRetry.classifyRejections(body, entries, retryQueue);
        if (classified.queued > 0) {
            channel.appendLine(`⚠️ Doc batch ${batchNum}: ${classified.queued}/${entries.length} file(s) failed to save (transient) — queued for retry`);
        }
        for (const r of classified.permanent) {
            channel.appendLine(`   ✗ Permanent: ${r.file} — ${r.code}: ${r.message}`);
        }
        return { written: outcome.written, permanent: classified.permanent.length };
    }

    /** Stage batch docs into entries, reading missing content from the workspace. */
    private async stageDocEntries(batch: DocEntry[]): Promise<{ entries: FileEntry[]; noContent: number }> {
        const entries: FileEntry[] = [];
        let noContent = 0;
        for (const d of batch) {
            let fileContent = d.content;
            if (!fileContent) { fileContent = await this.readFileContent(d.path); }
            if (!fileContent) { noContent++; getIndexerOutput().appendLine(`⚠️ ${d.path}: no content`); continue; }
            entries.push({ path: d.path, content: fileContent });
        }
        return { entries, noContent };
    }

    /** SA4E-300: drain unsaved doc files, then count/report any leftovers. */
    private async drainDocRetryQueue(
        retryQueue: FileEntry[], token: string | undefined, retryRounds: number,
    ): Promise<{ uploaded: number; errors: number }> {
        let uploaded = 0;
        let errors = 0;
        const channel = getIndexerOutput();
        if (retryQueue.length > 0 && retryRounds > 0) {
            const drain = await this.drainRetryQueue(retryQueue, `${this.backendUrl}/api/index/documents`, token, retryRounds);
            uploaded += drain.uploaded;
            errors += drain.errors;
        }
        if (retryQueue.length > 0) {
            errors += retryQueue.length;
            channel.appendLine(`❌ ${retryQueue.length} doc file(s) still not saved after ${retryRounds} retry round(s).`);
        }
        return { uploaded, errors };
    }

    /** Trigger KB ingest from Temp files (single call) when anything was staged. */
    private async runDocumentKbIngestIfStaged(
        staged: number,
        report: vscode.Progress<{ message?: string }>,
        token: string | undefined,
    ): Promise<{ ingested: number; errors: number }> {
        let kbIngested = 0;
        let kbErrors = 0;
        if (staged > 0) {
            report.report({ message: "Running document KB ingest..." });
            const kbResult = await this.triggerDocumentIngest(token);
            kbIngested = kbResult.ingested;
            kbErrors = kbResult.errors;
        }
        return { ingested: kbIngested, errors: kbErrors };
    }

    /** Build the user-facing ingest summary (SA4E-337 F7). */
    private static buildIngestSummary(
        ingested: number, errors: number, unconvertible: UnconvertibleEntry[], kbIngested: number, kbErrors: number,
    ): string {
        const parts = [`✅ Indexed: ${ingested} files`];
        if (errors > 0) { parts.push(`⚠️ Failed: ${errors}`); }
        if (unconvertible.length > 0) { parts.push(`⏭️ Un-convertible: ${unconvertible.length}`); }
        // SA4E-337 F7: only surface the KB line when a KB ingest actually ran/report something.
        if (kbIngested + kbErrors > 0) { parts.push(`📚 KB: ${kbIngested} ingested`); }
        return parts.join(", ");
    }
}
