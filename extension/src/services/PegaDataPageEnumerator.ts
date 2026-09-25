/**
 * PegaDataPageEnumerator — Calls Pega DataPage to enumerate all rules for an Application.
 * SA4E-156: Replaces enumerateAllRuleSets() with a single DataPage call for complete rule discovery.
 */

import type { PegaHttpClient } from "./PegaHttpClient";
import type { CrawlPlanItem } from "../models";
import { DependencyMapper } from "./DependencyMapper";

/** Result of DataPage enumeration — seeds the BFS queue */
export interface DataPageEnumerationResult {
  /** Mutable FIFO queue of rules to fetch */
  fetchQueue: CrawlPlanItem[];
  /** Mutable set of dedup keys to prevent re-enqueueing */
  dedupSet: Set<string>;
  /** Total rules returned by DataPage */
  ruleCount: number;
}

/** Raw item shape from DataPage pxResults */
interface DataPageResultItem {
  pzInsKey?: string;
  pxObjClass?: string;
  pyClassName?: string;
  pyRuleName?: string;
  pyRuleSet?: string;
  pyRuleSetVersion?: string;
}

type LogFn = (msg: string) => void;

/**
 * Enumerates all rules via Pega DataPage D_LatestRules4ExactedApps.
 * Seeds fetchQueue + dedupSet for BFS consumption by PegaBfsIndexer.
 */
export class PegaDataPageEnumerator {
  constructor(
    private readonly pegaClient: PegaHttpClient,
    private readonly log: LogFn,
  ) {}

  /**
   * Call D_LatestRules4ExactedApps and seed queue + dedup set.
   * @param appName - Application name from pega-project.json (e.g. "TGB:08-01")
   * @returns Seeded queue and dedup set ready for BFS
   * @throws Error if DataPage unreachable or returns invalid format
   */
  async enumerate(appName: string): Promise<DataPageEnumerationResult> {
    this.log(`[DataPageEnumerator] 📋 Calling DataPage for app: "${appName}"`);

    const response = await this.pegaClient.callDataPage(appName);
    const results = this.extractResults(response);

    this.log(`[DataPageEnumerator] ✅ DataPage returned ${results.length} rules`);

    const fetchQueue: CrawlPlanItem[] = [];
    const dedupSet = new Set<string>();

    for (const item of results) {
      const crawlItem = this.toCrawlItem(item);
      if (!crawlItem) continue;

      const key = DependencyMapper.dedupKeyFromItem(crawlItem);
      if (!dedupSet.has(key)) {
        dedupSet.add(key);
        fetchQueue.push(crawlItem);
      }
    }

    this.log(`[DataPageEnumerator] 📋 Seeded ${fetchQueue.length} unique rules into BFS queue`);
    return { fetchQueue, dedupSet, ruleCount: results.length };
  }

  /** Extract pxResults array from DataPage response */
  private extractResults(response: Record<string, unknown>): DataPageResultItem[] {
    const pxResults = response.pxResults || response.results || [];
    if (!Array.isArray(pxResults)) {
      this.log(`[DataPageEnumerator] ⚠️ DataPage returned non-array pxResults`);
      return [];
    }
    return pxResults as DataPageResultItem[];
  }

  /** Convert DataPage result item to CrawlPlanItem */
  private toCrawlItem(item: DataPageResultItem): CrawlPlanItem | null {
    const insKey = item.pzInsKey || '';
    const pxObjClass = item.pxObjClass || '';
    const pyClassName = item.pyClassName || '@baseclass';
    const pyRuleName = item.pyRuleName || '';

    // Skip items missing essential identifiers
    if (!pxObjClass || (!insKey && !pyRuleName)) return null;

    return {
      insKey: insKey || `${pxObjClass} ${pyClassName} ${pyRuleName.toUpperCase()}`,
      pxObjClass,
      pyClassName,
      pyRuleName,
    };
  }

}
