/**
 * PegaCatalogIndexer — Fast-path Pega indexing via the Rule Catalog Export API.
 * Replaces slow RuleSet enumeration / BFS discovery with a single authoritative
 * catalog (CSV) of every rule, then reuses the existing fetch + ingest pipeline
 * (PegaBfsIndexer → PegaCrawlHelper → PegaStreamIngester).
 *
 * Flow: export → poll → result → download CSV → parse → BFS fetch+ingest.
 */
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import type { IndexerHttpClient } from "./IndexerHttpClient";
import { PegaRuleCatalogClient } from "./PegaRuleCatalogClient";
import { parseCatalogCsv } from "./PegaCatalogCsvParser";
import { PegaBfsIndexer } from "./PegaBfsIndexer";
import { createPegaDedupSet } from "./DiskBackedSet";
import { setProjectId } from "../extension";
import type { CrawlPlanItem } from "../models";
import { StateComparer } from "../code-intel/delta/StateComparer";
import { BulkCheckClient } from "../code-intel/delta/BulkCheckClient";
import { BackendHttpPoster } from "../code-intel/delta/BackendHttpPoster";
import type { IndexCandidate } from "../code-intel/delta/models/DeltaModels";

type ProgressReporter = vscode.Progress<{ message?: string }>;
type LogFn = (msg: string) => void;

/** Result summary for the catalog-based index run. */
export interface CatalogIndexResult {
  appName: string;
  catalogRules: number;
  totalIngested: number;
}

/**
 * Orchestrates catalog-export-driven indexing.
 * Pattern: Facade — hides the export/download/parse/ingest sequence.
 */
export class PegaCatalogIndexer {
  constructor(
    private readonly httpClient: IndexerHttpClient,
    private readonly outputChannel: vscode.OutputChannel | undefined,
    private readonly log: LogFn,
  ) {}

  /**
   * Run the full catalog export + index flow.
   * @param root - Workspace root
   * @param report - VS Code progress reporter
   * @param secrets - Secret storage (for Pega credentials)
   * @returns Summary string, or null if not runnable (caller falls back to BFS crawl)
   */
  async run(root: string, report: ProgressReporter, secrets?: vscode.SecretStorage): Promise<CatalogIndexResult | null> {
    if (!secrets) { return null; }

    const { PegaHttpClient } = await import("./PegaHttpClient");
    const pegaClient = new PegaHttpClient(secrets, this.outputChannel);
    const catalogClient = new PegaRuleCatalogClient(pegaClient, this.log);

    // 1–4: export → poll → result → download CSV
    report.report({ message: "Rule Catalog: requesting export..." });
    const jobId = await catalogClient.startExport();
    report.report({ message: "Rule Catalog: export running (this can take a few minutes)..." });
    await catalogClient.pollStatus(jobId);
    const fileName = await catalogClient.getResultFileName(jobId);
    report.report({ message: `Rule Catalog: downloading ${fileName}...` });
    const destDir = path.join(root, ".pega-cache", "rulecatalog");
    const csvPath = await catalogClient.downloadCatalog(fileName, destDir);

    // 5: parse CSV → crawl items
    report.report({ message: "Rule Catalog: parsing rule list..." });
    const parsed = await parseCatalogCsv(csvPath, this.log);
    if (parsed.items.length === 0) {
      this.log("[Catalog] ⚠️ Catalog produced 0 rules — falling back to crawl.");
      return null;
    }

    // Resolve app name + projectId (same derivation as fetchAndSavePegaContext)
    const appName = this.resolveAppName(root);
    const projectId = crypto.createHash("sha256").update("pega:" + appName).digest("hex").slice(0, 12);
    setProjectId(projectId);
    this.log(`[Catalog] 📌 Project "${appName}" → projectId=${projectId}, ${parsed.items.length} rules to fetch`);

    // 5b (SA4E-241): incremental delta — ask the backend which checksums it already
    // has and skip them BEFORE fetching (NT-3/NT-4). Fail-safe: on bulk-check error
    // the comparer returns a full run (no false-negative, BR-15).
    const backendUrl = pegaClient.getBackendUrlPublic();
    report.report({ message: "Rule Catalog: checking which rules changed (incremental)..." });
    const toFetch = await this.applyIncrementalSkip(backendUrl, projectId, parsed.items);
    const skipped = parsed.items.length - toFetch.length;
    this.log(`[Catalog] ⚡ Incremental: ${skipped} unchanged skipped, ${toFetch.length} to fetch`);

    if (toFetch.length === 0) {
      this.log("[Catalog] ✅ Nothing changed — index is up to date.");
      return { appName, catalogRules: parsed.items.length, totalIngested: 0 };
    }

    // 6: reuse BFS indexer to fetch content + ingest (+ discover relatives)
    // resilient=true: a lone 5xx on one rule must not discard the full catalog list.
    const bfs = new PegaBfsIndexer(pegaClient, backendUrl, this.outputChannel, this.log, undefined, true);
    const dedupSet = createPegaDedupSet(root, "catalog-indexer");
    try {
      const bfsResult = await bfs.run(projectId, toFetch, dedupSet, report, root);
      return { appName, catalogRules: parsed.items.length, totalIngested: bfsResult.totalIngested };
    } finally {
      dedupSet.dispose();
    }
  }

  /**
   * Partition catalog items into skip/fetch via the backend bulk-check (NT-3/NT-4).
   * Items without a checksum are always fetched (cannot prove unchanged).
   * @returns the subset of items that must be fetched (new/changed + no-checksum)
   */
  private async applyIncrementalSkip(backendUrl: string, projectId: string, items: CrawlPlanItem[]): Promise<CrawlPlanItem[]> {
    const withChecksum = items.filter((it) => Boolean(it.checksum));
    const withoutChecksum = items.filter((it) => !it.checksum);
    if (withChecksum.length === 0) { return items; }

    const comparer = new StateComparer(new BulkCheckClient(new BackendHttpPoster(backendUrl)));
    const candidates: IndexCandidate[] = withChecksum.map((it) => ({ checksum: it.checksum as string, ref: it }));
    const { result, warning } = await comparer.compare(projectId, candidates);
    if (warning) { this.log(`[Catalog] ⚠️ ${warning}`); }

    // fetch = changed/new (from delta) + any item that had no checksum to compare.
    const changed = result.fetch.map((c) => c.ref as CrawlPlanItem);
    return [...changed, ...withoutChecksum];
  }

  /** Resolve application name from pega-project.json, falling back to folder name. */
  private resolveAppName(root: string): string {
    try {
      const raw = fs.readFileSync(path.join(root, "pega-project.json"), "utf-8");
      const json = JSON.parse(raw);
      if (json.applicationName) { return String(json.applicationName); }
    } catch (err) {
      this.log(`[Catalog] pega-project.json not read (${(err as Error).message}) — using folder name`);
    }
    return path.basename(root);
  }
}
