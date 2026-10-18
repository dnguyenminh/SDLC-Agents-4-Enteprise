/**
 * Rule-crawl algorithms for PegaMcpTools (dependency crawling).
 * Extracted from PegaMcpTools.ts (BR-18 file-size limit). Pure refactor —
 * identical loop semantics, client injected instead of `this.client`.
 */
import { PegaHttpClient } from "../../services/PegaHttpClient";

/** Client interface subset used by the crawlers (keeps signatures honest). */
export type CrawlClient = Pick<
  PegaHttpClient,
  "crawlPlan" | "crawlBatch" | "getObject" | "fetchClassHierarchy"
>;

interface RuleDep {
  ruleType: string;
  className: string;
  ruleName: string;
}

/** A missing-rule entry from the backend crawl plan. */
type MissingKey = Awaited<ReturnType<CrawlClient["crawlPlan"]>>["missing"][number];

/**
 * BFS crawl of unresolved rule dependencies. Batched (10 keys/plan call) and
 * de-duplicated via `visited`. When a Rule-Obj-Class is fetched, its full
 * hierarchy is resolved via the Pega API and queued as well.
 */
export async function crawlRules(
  client: CrawlClient,
  projectId: string,
  initialDeps: RuleDep[],
  visited: Set<string>,
): Promise<void> {
  const queue: RuleDep[] = [...initialDeps];
  // Track classes whose hierarchy has already been resolved to avoid duplicate API calls
  const hierarchyResolved = new Set<string>();

  while (queue.length > 0) {
    await processCrawlBatch(client, projectId, queue, visited, hierarchyResolved);
  }
}

/** Process one 10-key batch; skipped batches return early (original `continue`). */
async function processCrawlBatch(
  client: CrawlClient,
  projectId: string,
  queue: RuleDep[],
  visited: Set<string>,
  hierarchyResolved: Set<string>,
): Promise<void> {
  const batch = queue.splice(0, 10);
  const ruleKeys = collectUnvisitedKeys(batch, visited);
  if (ruleKeys.length === 0) return;

  const plan = await client.crawlPlan({ projectId, ruleKeys, visitedKeys: [...visited] });
  if (plan.missing.length === 0) return;

  const fetched = await fetchMissingRules(client, plan.missing, visited, queue, hierarchyResolved);
  if (fetched.length === 0) return;

  await enqueueNextBatch(client, projectId, fetched, visited, queue);
}

function collectUnvisitedKeys(batch: RuleDep[], visited: Set<string>): string[] {
  const ruleKeys: string[] = [];
  for (const dep of batch) {
    const key = `${dep.ruleType} ${dep.ruleName}`;
    if (visited.has(key)) continue;
    visited.add(key);
    ruleKeys.push(key);
  }
  return ruleKeys;
}

async function fetchMissingRules(
  client: CrawlClient,
  missing: MissingKey[],
  visited: Set<string>,
  queue: RuleDep[],
  hierarchyResolved: Set<string>,
): Promise<Record<string, unknown>[]> {
  const fetched: Record<string, unknown>[] = [];
  for (const key of missing) {
    try {
      const ruleJson = await client.getObject(key.pyClassName, key.pyRuleName);
      fetched.push(ruleJson);
      visited.add(key.insKey);
      await queueClassHierarchy(client, ruleJson, key, visited, queue, hierarchyResolved);
    } catch {
      visited.add(key.insKey);
    }
  }
  return fetched;
}

async function queueClassHierarchy(
  client: CrawlClient,
  ruleJson: Record<string, unknown>,
  key: MissingKey,
  visited: Set<string>,
  queue: RuleDep[],
  hierarchyResolved: Set<string>,
): Promise<void> {
  // When a class is fetched, resolve its full hierarchy via Pega API
  const className = (ruleJson.pyClassName as string) || key.pyRuleName;
  if (key.pxObjClass === 'Rule-Obj-Class' && className && !hierarchyResolved.has(className)) {
    hierarchyResolved.add(className);
    const parents = await client.fetchClassHierarchy(className);
    for (const parent of parents) {
      const parentKey = `Rule-Obj-Class ${parent}`;
      if (!visited.has(parentKey)) {
        queue.push({ ruleType: 'Rule-Obj-Class', className: '@baseclass', ruleName: parent });
      }
    }
  }
}

async function enqueueNextBatch(
  client: CrawlClient,
  projectId: string,
  fetched: Record<string, unknown>[],
  visited: Set<string>,
  queue: RuleDep[],
): Promise<void> {
  const result = await client.crawlBatch({ projectId, rules: fetched, visitedKeys: [...visited] });
  for (const next of result.nextBatch) {
    if (!visited.has(next.insKey)) {
      queue.push({ ruleType: next.pxObjClass, className: next.pyClassName, ruleName: next.pyRuleName });
    }
  }
}
