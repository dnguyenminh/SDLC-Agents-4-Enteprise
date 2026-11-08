/**
 * SA4E-418 — RepositoryMapService: snapshot-scoped repo map generation.
 * Pipeline (16K Doc §6): AST graph → personalization → PageRank → chunk score
 * → binary-search pack → DSL output. Every query is pinned to a READY snapshot.
 */

import type { QueryDatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import pino from 'pino';
import { SnapshotRetrievalService } from '../retrieval/snapshot-retrieval.js';
import {
  buildFileGraph,
  estimateTokens,
  packWithinBudget,
  personalizedPageRank,
  type FileGraphInput,
} from './repo-map-rank.js';

const logger = pino({ name: 'repo-map' });

export const DEFAULT_TOKEN_BUDGET = 1500;

export interface RepoMapOptions {
  query?: string;
  tokenBudget?: number;
  /** max symbols rendered per file in the DSL (top by rank). */
  symbolsPerFile?: number;
}

export interface RepoMapResult {
  dsl: string;
  tokenEstimate: number;
  filesRanked: Array<{ path: string; score: number }>;
  truncated: boolean;
}

interface SymbolRow {
  id: string;
  name: string;
  kind: string;
  start_line: number;
  end_line: number;
  sfr_id: string;
  relative_path: string;
}

/** Compose the DSL signature line: kind + name (decorator style per spec). */
function signatureOf(kind: string, name: string): string {
  const kw: Record<string, string> = {
    class: 'class',
    method: 'method',
    function: 'function',
    interface: 'interface',
    struct: 'struct',
    enum: 'enum',
    trait: 'trait',
  };
  const k = kw[kind] ?? kind;
  return `${k} ${name}`;
}

export class RepositoryMapService {
  private readonly retrieval: SnapshotRetrievalService;

  constructor(private readonly db: QueryDatabaseAdapter) {
    this.retrieval = new SnapshotRetrievalService(db);
  }

  async generate(snapshotId: string, opts: RepoMapOptions = {}): Promise<RepoMapResult> {
    const info = await this.retrieval.pinOrThrow(snapshotId); // READY-only
    const tokenBudget = opts.tokenBudget ?? DEFAULT_TOKEN_BUDGET;

    const symbols = await this.db.allAsync<SymbolRow>(
      `SELECT cs.id, cs.name, cs.kind, cs.start_line, cs.end_line, cs.sfr_id, f.relative_path
       FROM code_symbol cs
       JOIN source_file_revision f ON f.id = cs.sfr_id
       WHERE cs.snapshot_id = ?
       ORDER BY f.relative_path, cs.start_line`,
      [snapshotId],
    );
    const rels = await this.db.allAsync<{ from_symbol_id: string; to_symbol_id: string; kind: string }>(
      `SELECT from_symbol_id, to_symbol_id, kind FROM symbol_relationship WHERE snapshot_id = ?`,
      [snapshotId],
    );

    const fileBySymbol = new Map<string, SymbolRow>();
    const symbolNamesByFile = new Map<string, string[]>();
    for (const s of symbols) {
      fileBySymbol.set(s.id, s);
      const list = symbolNamesByFile.get(s.relative_path) ?? [];
      list.push(s.name);
      symbolNamesByFile.set(s.relative_path, list);
    }

    const edges: FileGraphInput['edges'] = [];
    for (const r of rels) {
      const from = fileBySymbol.get(r.from_symbol_id);
      const to = fileBySymbol.get(r.to_symbol_id);
      if (!from || !to) continue;
      edges.push({ fromFile: from.relative_path, toFile: to.relative_path, symbolName: from.name });
    }

    const graph = buildFileGraph({ symbolNamesByFile, edges, query: opts.query });

    // Personalization: query-matched files get 100/len_matched, others 1/N.
    const personal = new Map<string, number>();
    const qTerms = new Set((opts.query ?? '').toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
    const matched = opts.query
      ? graph.nodes.filter((f) => {
          const hay = `${f} ${(symbolNamesByFile.get(f) ?? []).join(' ')}`.toLowerCase();
          return [...qTerms].some((t) => hay.includes(t));
        })
      : [];
    const others = graph.nodes.filter((f) => !matched.includes(f));
    for (const f of matched) personal.set(f, 100 / Math.max(1, matched.length));
    for (const f of others) personal.set(f, 1 / Math.max(1, graph.nodes.length));

    const rank = personalizedPageRank(graph, personal);

    // Score chunks/symbols per file: rank × multiplier already inside the graph;
    // render top symbols of top files in rank order.
    const filesRanked = [...rank.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([path, score]) => ({ path, score }));

    const perFile = opts.symbolsPerFile ?? 3;
    const lines: string[] = ['[REPOSITORY_MAP (Ranked by PageRank relevance)]'];
    for (const { path: file } of filesRanked) {
      lines.push(`${file}:`);
      const fileSymbols = symbols
        .filter((s) => s.relative_path === file)
        .sort((a, b) => a.start_line - b.start_line)
        .slice(0, perFile);
      for (const s of fileSymbols) {
        lines.push(`  ${s.start_line}-${s.end_line}: ${signatureOf(s.kind, s.name)}`);
      }
    }

    const packed = packWithinBudget(lines, tokenBudget);
    const dsl = packed.join('\n');
    const truncated = packed.length < lines.length;
    logger.debug({ snapshotId, files: filesRanked.length, lines: packed.length, truncated }, '[repo-map] generated');
    return { dsl, tokenEstimate: estimateTokens(dsl), filesRanked, truncated };
  }
}
