/**
 * CodeIntelUploader — Batch upload code intelligence data
 * to the backend via RemoteBackendClient (MCP tool: code_intel_upload).
 */

import { ICodeIntelUploader, FileUploadPayload, UploadResult } from "./models";
import { RemoteBackendClient } from "../remote-backend-client";

/** Max files per upload batch */
const MAX_BATCH_SIZE = 100;

export class CodeIntelUploader implements ICodeIntelUploader {
  constructor(
    private readonly client: RemoteBackendClient,
    private readonly projectId: string
  ) {}

  /** Upload a batch of file payloads to the backend */
  async uploadBatch(files: FileUploadPayload[]): Promise<UploadResult> {
    if (files.length === 0) {
      return { accepted: 0, skipped: 0, errors: [] };
    }
    const results = await this.uploadInChunks(files);
    return this.mergeResults(results);
  }

  /** Split into chunks of MAX_BATCH_SIZE and upload each */
  private async uploadInChunks(files: FileUploadPayload[]): Promise<UploadResult[]> {
    const results: UploadResult[] = [];
    for (let i = 0; i < files.length; i += MAX_BATCH_SIZE) {
      const chunk = files.slice(i, i + MAX_BATCH_SIZE);
      const result = await this.sendChunk(chunk);
      results.push(result);
    }
    return results;
  }

  /** Send a single chunk via the MCP tool */
  private async sendChunk(files: FileUploadPayload[]): Promise<UploadResult> {
    try {
      const response = await this.client.invokeTool("code_intel_upload", {
        projectId: this.projectId,
        files,
      });
      return this.parseResponse(response);
    } catch (err: any) {
      return { accepted: 0, skipped: 0, errors: [err.message || "Upload failed"] };
    }
  }

  /** Parse JSON response from backend tool */
  private parseResponse(raw: string): UploadResult {
    try {
      const data = JSON.parse(raw);
      const content = data?.content?.[0]?.text;
      if (content) {
        const parsed = JSON.parse(content);
        return {
          accepted: parsed.accepted ?? 0,
          skipped: parsed.skipped ?? 0,
          errors: parsed.errors ?? [],
        };
      }
      return { accepted: data.accepted ?? 0, skipped: data.skipped ?? 0, errors: data.errors ?? [] };
    } catch (err) {
      console.debug(`[CodeIntelUploader] parseResponse failed (non-fatal): ${(err as Error).message}`);
      return { accepted: 0, skipped: 0, errors: ["Invalid response format"] };
    }
  }

  /** Merge multiple chunk results into one */
  private mergeResults(results: UploadResult[]): UploadResult {
    let accepted = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const r of results) {
      accepted += r.accepted;
      skipped += r.skipped;
      errors.push(...r.errors);
    }
    return { accepted, skipped, errors };
  }
}

