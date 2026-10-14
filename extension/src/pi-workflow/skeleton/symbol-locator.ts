/**
 * SA4E-360 — SymbolLocator port + McpSymbolLocator adapter (TDD §4.6, §6.2).
 *
 * Port/Adapter seam: extension logic stays transport-agnostic (tests inject
 * fakes); the MCP adapter wraps the loopback chain with the shipped timeout +
 * one-retry semantics (searchTimeoutMs 2,000, retryBackoffMs 200 — FSD §5.4).
 */
import { extractText, withSearchTimeout, sleep } from '../../pi-agent/context-retrieval/search-provider.js';
import { parseSearchText, dedupeCandidates } from '../../pi-agent/context-retrieval/search-provider.js';
import type { McpCaller } from '../../pi-agent/context-retrieval/search-provider.js';
import type { RetrievalConfig, SearchCandidate } from '../../pi-agent/context-retrieval/types.js';
import { DEFAULT_RETRIEVAL_CONFIG } from '../../pi-agent/context-retrieval/types.js';
import { logger } from '../../logger.js';
import type { FallbackFile, LocateResponse } from './skeleton-types.js';

/** DI port (TDD §4.6) — consumed by ReadMethodTool and SkeletonProvider. */
export interface SymbolLocator {
  /** code_symbol_locate — exact symbol + slice bounds. */
  locate(cls: string, method: string): Promise<LocateResponse>;
  /** code_extract_signatures — regex fallback batch (parseSearchText output). */
  extractSignatures(files: FallbackFile[]): Promise<SearchCandidate[]>;
  /** Batched code_symbols corpus for the skeleton build (ONE batched pass). */
  fetchSymbolCorpus(): Promise<SearchCandidate[]>;
  /** code_index_status {reindex:true} delegate — true on success. */
  reindex(): Promise<boolean>;
}

/** Name-prefix buckets for the batched corpus query (TDD Q1). */
const CORPUS_BUCKETS = ['_', ...letters('a', 'z'), ...letters('A', 'Z')] as const;
const CORPUS_LIMIT_PER_CALL = 200;
const CORPUS_CONCURRENCY = 8;

function letters(from: string, to: string): string[] {
  const out: string[] = [];
  for (let c = from.charCodeAt(0); c <= to.charCodeAt(0); c++) out.push(String.fromCharCode(c));
  return out;
}

/** Parses the code_symbols text format ("[kind] name — path:line" + indented Sig). */
export function parseSymbolListText(text: string): SearchCandidate[] {
  const out: SearchCandidate[] = [];
  for (const rawLine of (text ?? '').split('\n')) {
    const line = rawLine.trim();
    const row = /^\[([\w-]+)\]\s+(.+?)\s+—\s+(.+?):(\d+)$/.exec(line);
    if (row) {
      out.push({ kind: row[1], name: row[2], filePath: row[3], startLine: Number(row[4]), source: 'code_search' });
      continue;
    }
    // Indented continuation line under a row = its signature (code-symbols.ts
    // formatSymbolList emits "  sig" with NO prefix — both surfaces aligned).
    const last = out[out.length - 1];
    if (last && !last.signature && rawLine.startsWith('  ') && line.length > 0 && !/^(File|Sig|Doc|Found|Symbols|No symbols|Provide)/.test(line)) {
      last.signature = line.slice(0, 200);
    }
  }
  return out;
}

export class McpSymbolLocator implements SymbolLocator {
  private readonly caller: McpCaller;
  private readonly config: RetrievalConfig;

  constructor(caller: McpCaller, config?: Partial<RetrievalConfig>) {
    this.caller = caller;
    this.config = { ...DEFAULT_RETRIEVAL_CONFIG, ...config };
  }

  async locate(cls: string, method: string): Promise<LocateResponse> {
    const text = await this.callWithRetry('code_symbol_locate', { class: cls, method });
    const parsed = JSON.parse(text) as LocateResponse;
    return { rows: Array.isArray(parsed.rows) ? parsed.rows : [], classMethods: parsed.classMethods };
  }

  async extractSignatures(files: FallbackFile[]): Promise<SearchCandidate[]> {
    const text = await this.callWithRetry('code_extract_signatures', { files });
    return parseSearchText(text, 'code_search');
  }

  async fetchSymbolCorpus(): Promise<SearchCandidate[]> {
    const batches = await runWithConcurrency(CORPUS_BUCKETS, CORPUS_CONCURRENCY, async (bucket) => {
      try {
        const text = await this.callWithRetry('code_symbols', { name: bucket, limit: CORPUS_LIMIT_PER_CALL });
        return parseSymbolListText(text);
      } catch (err) {
        logger.warn('PI_SKELETON_CORPUS_BUCKET_FAILED', { bucket, error: (err as Error).message });
        return [];
      }
    });
    return dedupeCandidates(batches.flat());
  }

  async reindex(): Promise<boolean> {
    try {
      await withSearchTimeout(this.caller.callMcpWrapper('code_index_status', { reindex: true }), this.config.searchTimeoutMs * 3, 'code_index_status');
      return true;
    } catch (err) {
      logger.warn('PI_SKELETON_REINDEX_DELEGATE_FAILED', { error: (err as Error).message });
      return false;
    }
  }

  /** 2s timeout + 1 retry after backoff (mirror of McpSearchProvider.withRetry). */
  private async callWithRetry(tool: string, params: Record<string, unknown>): Promise<string> {
    try {
      return extractText(await withSearchTimeout(this.caller.callMcpWrapper(tool, params), this.config.searchTimeoutMs, tool));
    } catch (err) {
      logger.warn(`Search tool ${tool} failed, retrying once`, { error: (err as Error).message });
      await sleep(this.config.retryBackoffMs);
      return extractText(await withSearchTimeout(this.caller.callMcpWrapper(tool, params), this.config.searchTimeoutMs, tool));
    }
  }
}

/** Bounded-concurrency map preserving input order (corpus batching). */
async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}
