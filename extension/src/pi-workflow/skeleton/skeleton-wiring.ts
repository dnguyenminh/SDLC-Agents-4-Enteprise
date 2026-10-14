/**
 * SA4E-360 — createHost wiring runtime (TDD §6.4 deltas ①-②, §4.6 DI).
 *
 * Builds the skeleton runtime (locator + freshness checker + provider +
 * injector + map provider) from the OPTIONAL McpBridge. Absent bridge ⇒
 * fail-safe degradation (EF-2/EF-3): DEGRADED_NO_SKELETON sections, layout-only
 * map, read_method INDEX_UNAVAILABLE steering — the session NEVER crashes.
 */
import { logger } from '../../logger.js';
import type { McpBridge } from '../../mcp/mcp-bridge.js';
import { McpBridgeCaller } from '../../mcp/mcp-bridge-caller.js';
import type { McpCaller } from '../../pi-agent/context-retrieval/search-provider.js';
import type { SearchCandidate } from '../../pi-agent/context-retrieval/types.js';
import { IndexFreshnessChecker } from './index-freshness-checker.js';
import { SkeletonProvider } from './skeleton-provider.js';
import { SkeletonInjector } from './skeleton-injector.js';
import { FunctionalMapProvider } from './functional-map-provider.js';
import { getWorkspaceSections } from '../workspace-info-tool.js';
import { McpSymbolLocator, type SymbolLocator } from './symbol-locator.js';
import type { SkeletonSections } from './skeleton-types.js';

/** What createHost needs to supply skeleton/map content + read_method. */
export interface SkeletonRuntime {
  locator: SymbolLocator;
  checker: IndexFreshnessChecker;
  provider: SkeletonProvider;
  injector: SkeletonInjector;
  mapProvider?: FunctionalMapProvider;
}

/**
 * Delta ① — construct the runtime from `opts.mcpBridge` (TDD §6.4).
 * `bridge === undefined` ⇒ every consumer degrades (never crash).
 */
export function createSkeletonRuntime(mcpBridge?: unknown): SkeletonRuntime {
  if (!mcpBridge) {
    logger.info('PI_SKELETON_BRIDGE_ABSENT', { mode: 'degraded' }); // EF-2 observability
    const locator = new DegradedSymbolLocator();
    const checker = new IndexFreshnessChecker({ reindex: async () => false });
    return { locator, checker, provider: new SkeletonProvider({ locator, freshness: checker }), injector: new SkeletonInjector() };
  }
  const caller = new McpBridgeCaller(mcpBridge as McpBridge);
  const locator = new McpSymbolLocator(caller);
  const checker = new IndexFreshnessChecker({ reindex: () => locator.reindex() });
  const provider = new SkeletonProvider({ locator, freshness: checker });
  const mapProvider = new FunctionalMapProvider({
    keySymbolsFor: (module) => topKeySymbols(cachedCorpus(locator)(), module),
  });
  return { locator, checker, provider, injector: new SkeletonInjector(), mapProvider };
}

/**
 * Deltas ②+③ helper — build the sections between budget resolution and gate #2.
 * The functional map rides the SHARED sections function (C-360-M2 AF-3: one
 * SummaryTreeBuilder build per 60s TTL window serves assembly AND tool results).
 * Never throws: any failure degrades to an empty (zero-token) artifact.
 */
export async function buildSkeletonSections(
  runtime: SkeletonRuntime,
  workspaceRoot: string,
  staticBudget: number,
  modulePriorityOrder: readonly string[]
): Promise<SkeletonSections> {
  try {
    const sections = await runtime.provider.getSections(workspaceRoot, staticBudget, [...modulePriorityOrder]);
    if (runtime.mapProvider) {
      const { map } = getWorkspaceSections(workspaceRoot, runtime.mapProvider);
      if (map) sections.map = map; // layout-only (EF-2) leaves sections.map unset
    }
    return sections;
  } catch (err) {
    logger.warn('PI_SKELETON_SECTIONS_FAILED', { error: (err as Error).message });
    return {
      skeleton: {
        skeletonContent: '', skeletonTokens: 0, truncationApplied: false,
        fallbackFiles: 0, skippedFiles: 0, gateDecision: 'DEGRADED_NO_SKELETON',
      },
    };
  }
}

/** Locator that always fails-soft — bridge-absent degradation shape (§4.6). */
export class DegradedSymbolLocator implements SymbolLocator {
  async locate(): Promise<never> {
    throw new Error('INDEX_UNAVAILABLE: code-intel backend bridge is not connected');
  }
  async extractSignatures(): Promise<SearchCandidate[]> {
    return [];
  }
  async fetchSymbolCorpus(): Promise<SearchCandidate[]> {
    throw new Error('INDEX_UNAVAILABLE: code-intel backend bridge is not connected');
  }
  async reindex(): Promise<boolean> {
    return false;
  }
}

/** keySymbols source: ONE memoized corpus fetch per runtime (60s TTL window). */
function cachedCorpus(locator: SymbolLocator): () => SearchCandidate[] {
  let corpus: SearchCandidate[] | undefined;
  return () => {
    if (corpus) return corpus;
    try {
      // fire-and-forget: keySymbols enrich the map; failures omit entries (EF-1)
      void locator.fetchSymbolCorpus().then((rows) => { corpus = rows; }).catch(() => { corpus = []; });
    } catch {
      corpus = [];
    }
    return corpus ?? [];
  };
}

/** Top keySymbols of one module (first path segment match), corpus-derived. */
function topKeySymbols(corpus: readonly SearchCandidate[], module: string, limit = 5): string[] {
  const names: string[] = [];
  for (const row of corpus) {
    if ((row.filePath ?? '').split('/')[0] !== module) continue;
    if (!names.includes(row.name)) names.push(row.name);
    if (names.length >= limit) break;
  }
  return names;
}
