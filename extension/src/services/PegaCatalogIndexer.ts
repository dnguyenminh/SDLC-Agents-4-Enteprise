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

    // 6: reuse BFS indexer to fetch content + ingest (+ discover relatives)
    const backendUrl = pegaClient.getBackendUrlPublic();
    const bfs = new PegaBfsIndexer(pegaClient, backendUrl, this.outputChannel, this.log);
    const dedupSet = createPegaDedupSet(root, "catalog-indexer");
    try {
      const bfsResult = await bfs.run(projectId, parsed.items, dedupSet, report, root);
      return { appName, catalogRules: parsed.items.length, totalIngested: bfsResult.totalIngested };
    } finally {
      dedupSet.dispose();
    }
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
