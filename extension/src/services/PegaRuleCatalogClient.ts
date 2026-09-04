/**
 * PegaRuleCatalogClient — Client for the Pega Rule Catalog Export API.
 * Four-step flow (same server + Basic auth as PegaHttpClient):
 *   1. startExport()        → jobId
 *   2. pollStatus(jobId)    → wait until DONE
 *   3. getResultFileName()  → catalog ZIP file name
 *   4. downloadCatalog()    → decode base64 + extract rulecatalog.csv
 */
import type { PegaHttpClient } from "./PegaHttpClient";
import type { ExportStatus } from "../models";
import { downloadCatalogCsv } from "./PegaCatalogDownloader";

type LogFn = (msg: string) => void;

/** Poll interval between /status checks (server job runs ~1–3 min). */
const POLL_INTERVAL_MS = 12_000;

/** Max poll attempts before giving up (12s × 50 = 10 min ceiling). */
const MAX_POLL_ATTEMPTS = 50;

/** Facade over the CodeIntelligence rule-catalog export endpoints. */
export class PegaRuleCatalogClient {
  constructor(
    private readonly pegaClient: PegaHttpClient,
    private readonly log: LogFn,
  ) {}

  /** Base URL for the CodeIntelligence v1 API on the configured Pega server. */
  private baseUrl(): string {
    return `${this.pegaClient.getPegaEndpoint()}/api/CodeIntelligence/v1`;
  }

  /** Step 1: enqueue an export job. Returns the jobId (UUID). Enqueue returns HTTP 200. */
  async startExport(): Promise<string> {
    const auth = await this.pegaClient.getAuthHeader();
    const url = `${this.baseUrl()}/file/rulecatalog/export`;
    const res = await fetch(url, { method: "GET", headers: { Authorization: auth, Accept: "text/plain" } });
    if (!res.ok) { throw new Error(`Catalog export enqueue failed: HTTP ${res.status}`); }
    const jobId = (await res.text()).trim();
    if (!jobId) { throw new Error("Catalog export returned an empty jobId"); }
    this.log(`[Catalog] 🚀 Export job started: ${jobId}`);
    return jobId;
  }

  /**
   * Step 2: poll /status until terminal (DONE/FAILED) or timeout.
   * @throws Error if the job FAILED or the poll ceiling is reached.
   */
  async pollStatus(jobId: string): Promise<void> {
    const auth = await this.pegaClient.getAuthHeader();
    const url = `${this.baseUrl()}/file/rulecatalog/export/${encodeURIComponent(jobId)}/status`;
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const status = await this.readStatus(url, auth);
      this.log(`[Catalog] ⏳ status[${attempt}]=${status}`);
      if (status === "DONE") { return; }
      if (status === "FAILED") { throw new Error(`Catalog export job ${jobId} FAILED (see rulecatalog_log.zip for diagnostics)`); }
      await this.sleep(POLL_INTERVAL_MS);
    }
    throw new Error(`Catalog export job ${jobId} did not finish within ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s`);
  }

  /** Read a single /status response and normalize it to an ExportStatus. */
  private async readStatus(url: string, auth: string): Promise<ExportStatus> {
    const res = await fetch(url, { method: "GET", headers: { Authorization: auth, Accept: "text/plain" } });
    if (!res.ok) { throw new Error(`Catalog status poll failed: HTTP ${res.status}`); }
    const body = (await res.text()).trim().toUpperCase();
    if (body === "QUEUED" || body === "RUNNING" || body === "DONE" || body === "FAILED") { return body; }
    return "UNKNOWN";
  }

  /** Step 3: fetch the result file name for a completed job. */
  async getResultFileName(jobId: string): Promise<string> {
    const auth = await this.pegaClient.getAuthHeader();
    const url = `${this.baseUrl()}/file/rulecatalog/export/${encodeURIComponent(jobId)}/result`;
    const res = await fetch(url, { method: "GET", headers: { Authorization: auth, Accept: "text/plain" } });
    if (!res.ok) { throw new Error(`Catalog result fetch failed: HTTP ${res.status}`); }
    const fileName = (await res.text()).trim();
    if (!fileName || fileName.toLowerCase().includes("not completed")) {
      throw new Error(`Catalog result not ready for job ${jobId}: "${fileName}"`);
    }
    this.log(`[Catalog] 📦 Result file: ${fileName}`);
    return fileName;
  }

  /**
   * Step 4: download + decode + extract the catalog CSV.
   * @param fileName - Result file name from getResultFileName()
   * @param destDir - Directory to write the ZIP/CSV
   * @returns Absolute path to the extracted rulecatalog.csv
   */
  async downloadCatalog(fileName: string, destDir: string): Promise<string> {
    const auth = await this.pegaClient.getAuthHeader();
    const url = `${this.baseUrl()}/file/resumableDownload/${encodeURIComponent(fileName)}`;
    const { csvPath, zipBytes } = await downloadCatalogCsv(url, auth, destDir, this.log);
    this.log(`[Catalog] ✅ Catalog ZIP ${zipBytes} bytes → ${csvPath}`);
    return csvPath;
  }

  /** Promise-based sleep. */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
