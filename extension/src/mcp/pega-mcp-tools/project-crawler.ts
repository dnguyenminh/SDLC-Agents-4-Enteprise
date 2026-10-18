/**
 * MCP handler body for pega_crawl_project — bounded BFS from entry keys.
 * Extracted from PegaMcpTools.ts (BR-18 file-size limit). Pure refactor —
 * identical loop semantics, client injected instead of `this.client`.
 */
import { CrawlClient } from "./crawlers";

export async function crawlProjectHandler(client: CrawlClient, args: Record<string, unknown>): Promise<any> {
  const projectId = (args.projectId as string) || "DEFAULT_PROJECT";
  const entryKeys = (args.entryKeys as string[]) || [];
  const maxBatches = (args.maxBatches as number) || 50;

  if (entryKeys.length === 0) {
    return { success: false, error: "entryKeys required — e.g. ['RULE-OBJ-CLASS MyApp-Class']" };
  }

  try {
    return await runProjectCrawl(client, projectId, entryKeys, maxBatches);
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function runProjectCrawl(
  client: CrawlClient,
  projectId: string,
  entryKeys: string[],
  maxBatches: number,
): Promise<any> {
  const visited = new Set<string>();
  let batchesProcessed = 0;
  let totalStored = 0;
  const queue: string[] = [...entryKeys];

  while (queue.length > 0 && batchesProcessed < maxBatches) {
    const result = await processProjectBatch(client, projectId, queue, visited);
    if (!result) continue;
    totalStored += result.stored;
    batchesProcessed++;
    enqueueProjectNext(result.nextBatch, visited, queue);
  }
  return summarizeCrawl(totalStored, batchesProcessed, visited, queue, maxBatches);
}

/** A crawl-batch result, or null when the batch was skipped (original `continue`). */
type ProjectBatchResult = Awaited<ReturnType<CrawlClient["crawlBatch"]>>;

/**
 * Process one 15-key batch. Returns null when skipped (all keys visited /
 * nothing missing / nothing fetched) — those paths do not count the batch.
 */
async function processProjectBatch(
  client: CrawlClient,
  projectId: string,
  queue: string[],
  visited: Set<string>,
): Promise<ProjectBatchResult | null> {
  const batchKeys = queue.splice(0, 15).filter(k => !visited.has(k));
  if (batchKeys.length === 0) return null;
  batchKeys.forEach(k => visited.add(k));

  const plan = await client.crawlPlan({ projectId, ruleKeys: batchKeys, visitedKeys: [...visited] });
  if (plan.missing.length === 0) return null;

  const fetched = await fetchProjectRules(client, plan.missing);
  if (fetched.length === 0) return null;

  return client.crawlBatch({ projectId, rules: fetched, visitedKeys: [...visited] });
}

async function fetchProjectRules(
  client: CrawlClient,
  missing: Awaited<ReturnType<CrawlClient["crawlPlan"]>>["missing"],
): Promise<Record<string, unknown>[]> {
  const fetched: Record<string, unknown>[] = [];
  for (const key of missing) {
    try {
      const ruleJson = await client.getObject(key.pyClassName, key.pyRuleName);
      fetched.push(ruleJson);
    } catch {
      // rule may not exist on this server
    }
  }
  return fetched;
}

function enqueueProjectNext(
  nextBatch: ProjectBatchResult["nextBatch"],
  visited: Set<string>,
  queue: string[],
): void {
  for (const next of nextBatch) {
    if (!visited.has(next.insKey)) {
      queue.push(next.insKey);
    }
  }
}

function summarizeCrawl(
  totalStored: number,
  batchesProcessed: number,
  visited: Set<string>,
  queue: string[],
  maxBatches: number,
): any {
  return {
    success: true,
    totalStored,
    batchesProcessed,
    visitedCount: visited.size,
    queueRemaining: queue.length,
    stoppedEarly: queue.length > 0 && batchesProcessed >= maxBatches,
  };
}
