/**
 * Relative enqueueing for the BFS pipeline (SA4E-92).
 * Serial-only — mutates the shared fetch queue and dedup set.
 */

import type { CrawlPlanItem } from "../../models";
import { DependencyMapper, type UnresolvedDependency } from "../DependencyMapper";
import type { MembershipSet } from "../DiskBackedSet";
import type { LogFn } from "./types";

/** Enqueue not-yet-seen relatives — returns count newly added. Serial-only. */
export function enqueueRelatives(
  relatives: UnresolvedDependency[],
  fetchQueue: CrawlPlanItem[],
  dedupSet: MembershipSet,
  opts: { maxQueueSize: number; log: LogFn },
): number {
  let count = 0;
  for (const dep of relatives) {
    if (fetchQueue.length >= opts.maxQueueSize) {
      opts.log(`[BfsPipeline] ⚠️ Queue full (${opts.maxQueueSize}). Skipping remaining relatives.`);
      break;
    }
    const key = DependencyMapper.dedupKey(dep);
    if (!dedupSet.has(key)) {
      const item = DependencyMapper.toCrawlPlanItem(dep);
      if (!item) continue;
      dedupSet.add(key);
      fetchQueue.push(item);
      count++;
    }
  }
  return count;
}
