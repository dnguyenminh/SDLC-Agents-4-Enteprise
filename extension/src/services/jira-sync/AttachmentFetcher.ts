/**
 * SA4E-102 — AttachmentFetcher: Downloads text-based Jira attachments and
 * delegates binary conversion to backend's ingest-file endpoint (ConvertToolResolver).
 * Only processes attachments from primary project tickets (depth=0).
 * Supports checksum dedup: skips attachments already indexed (same id+size).
 */
import { AtlassianHttpClient } from "../../mcp/atlassian/atlassian-http-client";
import type { AttachmentMeta } from "./LinkCrawler";
import * as vscode from "vscode";
import { getEffectiveScope } from "../../utils/scope-detector";

/** Result of fetching an attachment */
export interface FetchedAttachment {
    filename: string;
    issueKey: string;
    content: string;
    converted: boolean;
}

/** Stored checksum for dedup: Jira attachment id + file size */
interface AttachmentChecksum {
    id: string;
    size: number;
}

/** Extensions we can read directly as text */
const TEXT_EXTENSIONS = new Set([".md", ".txt", ".json", ".csv", ".yml", ".yaml", ".xml", ".html", ".htm"]);

/** Extensions we send to backend for conversion */
const CONVERTIBLE_EXTENSIONS = new Set([".docx", ".xlsx", ".pdf", ".pptx", ".rtf"]);

const CHECKSUM_CONFIG_KEY = "kiroSdlc.jiraAttachmentChecksums";

export class AttachmentFetcher {
    private checksums: Record<string, AttachmentChecksum> = {};
    private skippedCount = 0;

    constructor(
        private readonly client: AtlassianHttpClient,
        private readonly backendUrl: string,
        private readonly log: (msg: string) => void,
    ) {
        this.loadChecksums();
    }

    /** Number of attachments skipped due to dedup */
    get skipped(): number { return this.skippedCount; }

    /**
     * Process attachments for an issue with checksum dedup.
     * Skips attachments already indexed with same id+size.
     */
    async processAttachments(
        issueKey: string,
        attachments: AttachmentMeta[],
        token?: string,
    ): Promise<FetchedAttachment[]> {
        const results: FetchedAttachment[] = [];

        for (const att of attachments) {
            if (this.isAlreadyIndexed(issueKey, att)) {
                this.skippedCount++;
                continue;
            }
            const ext = this.getExtension(att.filename);
            let content: string | null = null;
            let converted = false;

            if (TEXT_EXTENSIONS.has(ext)) {
                content = await this.downloadText(att);
            } else if (CONVERTIBLE_EXTENSIONS.has(ext)) {
                content = await this.convertViaBackend(att, token);
                converted = true;
            }

            if (content) {
                results.push({ filename: att.filename, issueKey, content, converted });
                this.saveChecksum(issueKey, att);
            }
        }

        await this.persistChecksums();
        return results;
    }

    /** Download text-based attachment content directly from Jira. */
    private async downloadText(att: AttachmentMeta): Promise<string | null> {
        if (!att.contentUrl) { return null; }
        try {
            const res = await this.client.request("GET", this.extractPath(att.contentUrl));
            if (typeof res.data === "string") { return res.data; }
            if (res.data && typeof res.data === "object") { return JSON.stringify(res.data, null, 2); }
            return null;
        } catch (err: any) {
            this.log(`[AttachmentFetcher] ⚠️ Failed to download ${att.filename}: ${err.message}`);
            return null;
        }
    }

    /**
     * Download binary attachment from Jira, save to temp, and convert via
     * mem_ingest_file MCP tool (which auto-detects and converts docx/pdf/etc).
     */
    private async convertViaBackend(att: AttachmentMeta, token?: string): Promise<string | null> {
        if (!att.contentUrl) { return null; }
        try {
            // Download binary from Jira to temp file
            const tempPath = await this.downloadToTemp(att);
            if (!tempPath) { return null; }

            // Use mem_ingest_file via MCP wrapper — it handles conversion
            const url = `${this.backendUrl}/mcp`;
            const body = JSON.stringify({
                jsonrpc: "2.0", id: Date.now(),
                method: "tools/call",
                params: { name: "mem_ingest_file", arguments: { file_path: tempPath, type: "CONTEXT", scope: getEffectiveScope() } },
            });
            const res = await this.postJson(url, body, token);
            // Cleanup temp file
            try { (await import("fs")).unlinkSync(tempPath); } catch { /* ignore */ }
            return res ? `[Converted from ${att.filename}] Content ingested via mem_ingest_file` : null;
        } catch (err: any) {
            this.log(`[AttachmentFetcher] ⚠️ Failed to convert ${att.filename}: ${err.message}`);
            return null;
        }
    }

    /** Download binary content from Jira and save to temp file. */
    private async downloadToTemp(att: AttachmentMeta): Promise<string | null> {
        try {
            const path = this.extractPath(att.contentUrl);
            const config = await this.client.requestRaw("GET", path);
            if (!config) { return null; }
            const os = await import("os");
            const fs = await import("fs");
            const p = await import("path");
            const tmpDir = os.tmpdir();
            const tmpFile = p.join(tmpDir, `jira-att-${att.id}-${att.filename}`);
            fs.writeFileSync(tmpFile, Buffer.from(config));
            return tmpFile;
        } catch (err: any) {
            this.log(`[AttachmentFetcher] ⚠️ Failed to download binary ${att.filename}: ${err.message}`);
            return null;
        }
    }

    /** Simple POST JSON and return response text. */
    private async postJson(url: string, body: string, token?: string): Promise<string | null> {
        try {
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (token) { headers["Authorization"] = `Bearer ${token}`; }
            const res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(60000) });
            if (!res.ok) { return null; }
            return await res.text();
        } catch { return null; }
    }

    /** Extract URL path from full Jira attachment URL. */
    private extractPath(url: string): string {
        try {
            const parsed = new URL(url);
            return parsed.pathname;
        } catch {
            return url;
        }
    }

    /** Get lowercase file extension including dot. */
    private getExtension(filename: string): string {
        const dot = filename.lastIndexOf(".");
        return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
    }

    // ── Checksum Dedup ────────────────────────────────────────────────────

    /** Check if attachment was already indexed (same Jira attachment id + size). */
    private isAlreadyIndexed(issueKey: string, att: AttachmentMeta): boolean {
        const key = `${issueKey}/${att.filename}`;
        const stored = this.checksums[key];
        if (!stored) { return false; }
        return stored.id === att.id && stored.size === att.size;
    }

    /** Save checksum after successful fetch. */
    private saveChecksum(issueKey: string, att: AttachmentMeta): void {
        const key = `${issueKey}/${att.filename}`;
        this.checksums[key] = { id: att.id, size: att.size };
    }

    /** Load checksums from workspace config. */
    private loadChecksums(): void {
        const config = vscode.workspace.getConfiguration();
        this.checksums = config.get<Record<string, AttachmentChecksum>>(CHECKSUM_CONFIG_KEY, {});
    }

    /** Persist checksums to workspace config after processing. */
    private async persistChecksums(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration();
            await config.update(CHECKSUM_CONFIG_KEY, this.checksums, vscode.ConfigurationTarget.Workspace);
        } catch (err: any) {
            this.log(`[AttachmentFetcher] ⚠️ Failed to save checksums: ${err.message}`);
        }
    }
}
