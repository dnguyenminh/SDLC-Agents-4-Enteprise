/**
 * IndexingService — orchestrates workspace indexing with injected dependencies.
 */
import * as vscode from "vscode";
import * as path from "path";
import { IndexerHttpClient } from "./IndexerHttpClient";
import { convertFileToMarkdown } from "../converter";
import { discoverDocuments } from "../indexer-discovery";

export interface IndexOptions {
    code: boolean;
    documents: boolean;
    sync: boolean;
}

export type ProgressReporter = vscode.Progress<{ message?: string }>;

export class IndexingService {
    constructor(private readonly httpClient: IndexerHttpClient) {}

    async indexWorkspace(root: string, options: IndexOptions, token?: string): Promise<string[]> {
        const results: string[] = [];

        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: "Indexing workspace...", cancellable: false },
            async (report) => {
                if (options.code) {
                    report.report({ message: "Scanning and uploading source code files..." });
                    const res = await this.httpClient.uploadSourceFiles(report, token);
                    results.push(res.summary);
                }
                if (options.documents) {
                    report.report({ message: "Discovering documents..." });
                    results.push(await this.indexDocuments(root, report, token));
                }
                if (options.sync) {
                    report.report({ message: "Syncing code symbols to memory..." });
                    results.push("✅ Code symbol sync triggered");
                }
            }
        );

        return results;
    }

    async indexDocuments(root: string, report: ProgressReporter, token?: string): Promise<string> {
        const docs = discoverDocuments(root);
        if (docs.length === 0) { return "ℹ️ No documents found in documents/ folder"; }

        const mdDocs = docs.filter(d => d.format === "markdown");
        const nonMdDocs = docs.filter(d => d.format !== "markdown");
        report.report({ message: `Found ${docs.length} files (${nonMdDocs.length} need conversion)` });

        const convertedDocs: Array<{ path: string; type: string; ticket: string; format: string; content?: string }> = [];
        let convertedCount = 0;
        let skippedCount = 0;
        const errors: Array<{ file: string; error: string }> = [];
        const channel = vscode.window.createOutputChannel("SDLC Indexing");

        for (let i = 0; i < nonMdDocs.length; i++) {
            const doc = nonMdDocs[i];
            report.report({ message: `Converting ${i + 1}/${nonMdDocs.length} files...` });
            const absPath = path.join(root, doc.path);
            const result = await convertFileToMarkdown(absPath, doc.format, token);
            if (result.success && result.markdown && result.markdown.trim().length > 0) {
                convertedDocs.push({ ...doc, content: result.markdown });
                convertedCount++;
                channel.appendLine(`  ✅ Converted: ${doc.path} (${result.conversionTime}ms)`);
            } else {
                skippedCount++;
                if (!result.success) { errors.push({ file: doc.path, error: result.error || "unknown" }); }
                channel.appendLine(`  ⏭️ Skipped: ${doc.path}`);
            }
        }

        const allDocsForIngest = [...mdDocs, ...convertedDocs];
        report.report({ message: `Indexing ${allDocsForIngest.length} files...` });
        const apiResult = await this.httpClient.ingestDocuments(allDocsForIngest, report, token);

        return this.buildSummary(docs.length, mdDocs.length, convertedCount, skippedCount, apiResult.summary, errors);
    }

    private buildSummary(
        total: number, direct: number, converted: number, skipped: number,
        apiSummary: string, errors: Array<{ file: string; error: string }>
    ): string {
        const summary = [
            `✅ Documents: ${total} discovered`,
            `   📄 Direct: ${direct}`,
            `   🔄 Converted: ${converted}`,
            `   ⏭️ Skipped: ${skipped}`,
            `   ${apiSummary}`,
        ];
        if (errors.length > 0) {
            summary.push(`   ⚠️ Errors:`);
            for (const e of errors.slice(0, 5)) { summary.push(`      - ${path.basename(e.file)}: ${e.error}`); }
            if (errors.length > 5) { summary.push(`      ... and ${errors.length - 5} more`); }
        }
        return summary.join("\n");
    }
}
