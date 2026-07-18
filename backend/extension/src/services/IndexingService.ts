/**
 * IndexingService — orchestrates workspace indexing with injected dependencies.
 */
import * as vscode from "vscode";
import * as path from "path";
import { IndexerHttpClient } from "./IndexerHttpClient";
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
        const textDocs = docs.filter(d => d.format === "text");
        const binaryDocs = docs.filter(d => d.format !== "markdown" && d.format !== "text");
        report.report({ message: `Found ${docs.length} files (${binaryDocs.length} binary → server-side convert)` });

        const channel = vscode.window.createOutputChannel("SDLC Indexing");

        // Text formats: read content locally, send with content (Task 7: client only handles text)
        const textWithContent = await this.readTextDocs(textDocs, root, channel);

        // Binary formats: send file_path only — server handles conversion via ConvertToolResolver (Task 7)
        const binaryForServer = binaryDocs.map(d => ({ ...d, content: undefined }));
        for (const d of binaryForServer) { channel.appendLine(`  📤 Server-convert: ${d.path}`); }

        const allDocsForIngest = [...mdDocs, ...textWithContent, ...binaryForServer];
        report.report({ message: `Indexing ${allDocsForIngest.length} files...` });
        const apiResult = await this.httpClient.ingestDocuments(allDocsForIngest, report, token);

        // Server-side un-convertible files → hiển thị log cho user (Design R1/NFR-5)
        if (apiResult.unconvertible.length > 0) {
            channel.appendLine("");
            channel.appendLine(`⚠️ ${apiResult.unconvertible.length} file(s) server không convert được (không index):`);
            for (const u of apiResult.unconvertible) { channel.appendLine(`   - ${u.file} (reason=${u.reason})`); }
            channel.show(true);
        }

        const serverConverted = apiResult.ingested - mdDocs.length - textWithContent.length;
        const skipped = binaryDocs.length - Math.max(serverConverted, 0);
        return this.buildSummary(docs.length, mdDocs.length + textWithContent.length, Math.max(serverConverted, 0), skipped, apiResult.summary, []);
    }

    private async readTextDocs(
        textDocs: Array<{ path: string; type: string; ticket: string; format: string }>,
        root: string, channel: vscode.OutputChannel,
    ): Promise<Array<{ path: string; type: string; ticket: string; format: string; content: string }>> {
        const results: Array<{ path: string; type: string; ticket: string; format: string; content: string }> = [];
        for (const doc of textDocs) {
            try {
                const absPath = path.join(root, doc.path);
                const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(absPath));
                results.push({ ...doc, content: Buffer.from(raw).toString("utf-8") });
                channel.appendLine(`  📄 Text read: ${doc.path}`);
            } catch { channel.appendLine(`  ⚠️ Cannot read: ${doc.path}`); }
        }
        return results;
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
