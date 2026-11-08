/** SA4E-420 — The 4 core agent tools over the pinned snapshot (16K Doc §7).
 *  search_symbols (hybrid) / get_file_skeleton / read_code_block (≤120 lines) /
 *  query_call_graph (CALLERS|CALLEES|IMPLEMENTATIONS). Compact DSL output,
 *  session pinning mandatory, args validated against the 417 schemas. */

import type { QueryDatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { validateToolArgs } from '../security/tool-schemas.js';
import { SnapshotRetrievalService } from '../retrieval/snapshot-retrieval.js';
import { fuseRankedList, type EvidenceKind } from '../retrieval/retrieval-types.js';
import {
  assertSessionPin,
  dslHeader,
  estimateTokens,
  newResultId,
  type SessionPin,
  type ToolResult,
} from './tool-context.js';

export const MAX_READ_LINES = 120;

export type { SearchSymbolsArgs, SymbolEntry } from './tool-context.js';

export class CoreAgentTools {
  constructor(
    private readonly db: QueryDatabaseAdapter,
    private readonly retrieval: SnapshotRetrievalService,
    private readonly embedFn: (text: string) => Buffer,
    private readonly sourceLoader: (relativePath: string) => Promise<string>,
  ) {}

  private async resolveChunkSymbols(snapshotId: string, chunkIds: string[], args: SearchSymbolsArgs) {
    if (chunkIds.length === 0) return [];
    const placeholders = chunkIds.map(() => '?').join(',');
    const rows = await this.db.allAsync<any>(
      `SELECT c.id AS chunk_id, c.symbol_id, s.name, s.kind, s.signature, s.start_line, s.end_line,
              f.relative_path, c.token_count
       FROM code_chunk c
       LEFT JOIN code_symbol s ON s.id = c.symbol_id
       LEFT JOIN source_file_revision f ON f.id = c.sfr_id
       WHERE c.snapshot_id = ? AND c.id IN (${placeholders})
       ORDER BY c.id`,
      [snapshotId, ...chunkIds],
    );
    let out = rows.map((r) => ({
      symbolId: r.symbol_id ?? r.chunk_id,
      chunkId: r.chunk_id,
      name: r.name ?? r.chunk_id,
      kind: r.kind ?? 'CHUNK',
      signature: r.signature ?? '',
      filePath: r.relative_path ?? '<external>',
      startLine: r.start_line ?? 0,
      endLine: r.end_line ?? 0,
      bodyTokens: r.token_count ?? 0,
    }));
    if (args.kind) out = out.filter((e) => e.kind.toLowerCase() === args.kind!.toLowerCase());
    if (args.path_filter) out = out.filter((e) => e.filePath.includes(args.path_filter!));
    return out;
  }

  /** Hybrid BM25 + vector search, RRF-fused, snapshot-pinned, DSL output. */
  async searchSymbols(pin: SessionPin, args: SearchSymbolsArgs, offset = 0): Promise<ToolResult<SymbolEntry[]>> {
    const v = validateToolArgs('search_symbols', args as Record<string, unknown>);
    if (!v.valid) throw new Error(`INVALID_ARGS: ${v.errors.join('; ')}`);
    await assertSessionPin(this.retrieval, pin);
    const limit = (args.limit ?? 10) + offset;

    const lexical = await this.retrieval.lexicalSearch(pin.index_snapshot_id, args.query, limit);
    const fused = new Map<string, number>();
    fuseRankedList(fused, 'lexical', lexical.map((h) => h.chunkId));
    try {
      const vector = await this.retrieval.vectorSearch(pin.index_snapshot_id, 'local-minilm', '1.0', this.embedFn(args.query), limit);
      fuseRankedList(fused, 'vector', vector.map((h) => h.chunkId));
    } catch { /* vector path optional — lexical results still returned (graceful) */ }

    const rankedIds = [...fused.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    const all = await this.resolveChunkSymbols(pin.index_snapshot_id, rankedIds, args);
    const page = all.slice(offset, offset + (args.limit ?? 10));
    const truncated = offset + page.length < all.length;
    const dslLines = [
      dslHeader('SYMBOLS', page.length, 0),
      ...page.map((e) =>
        `# [${e.kind.toUpperCase()}] ${e.name} | ${e.filePath}:${e.startLine}-${e.endLine} (body: ${e.bodyTokens} tok)\n   Sig: ${e.signature}`),
    ];
    const dsl = dslLines.join('\n');
    return {
      resultId: newResultId(),
      summary: `${page.length} symbols for "${args.query}"`,
      dsl,
      data: page,
      evidenceIds: page.map((e) => e.chunkId),
      truncated,
      nextPageCursor: truncated ? `offset:${offset + page.length}` : undefined,
      budgetUsedTokens: estimateTokens(dsl),
    };
  }

  /** Skeleton-only: containers + member signatures, NO bodies. */
  async getFileSkeleton(pin: SessionPin, fp: string): Promise<ToolResult<Array<{ kind: string; name: string; signature: string; startLine: number; endLine: number }>>> {
    const v = validateToolArgs('get_file_skeleton', { file_path: fp });
    if (!v.valid) throw new Error(`INVALID_ARGS: ${v.errors.join('; ')}`);
    await assertSessionPin(this.retrieval, pin);
    const rows = await this.db.allAsync<any>(
      `SELECT s.id, s.name, s.kind, s.signature, s.start_line, s.end_line
       FROM code_symbol s
       JOIN source_file_revision f ON f.id = s.sfr_id
       JOIN code_index_snapshot snap ON snap.commit_id = f.commit_id AND snap.repository_id = f.repository_id
       WHERE snap.id = ? AND f.relative_path = ?
       ORDER BY s.start_line`,
      [pin.index_snapshot_id, fp],
    );
    const dslLines = [dslHeader('SKELETON LINES', rows.length, 0)];
    for (const r of rows) {
      dslLines.push(`# [${r.kind.toUpperCase()}] ${r.name} | ${fp}:${r.start_line}-${r.end_line}`);
      if (r.signature) dslLines.push(`   Sig: ${r.signature}`);
    }
    const dsl = dslLines.join('\n');
    return {
      resultId: newResultId(),
      summary: `${rows.length} skeleton entries for ${fp}`,
      dsl,
      data: rows.map((r) => ({ kind: r.kind, name: r.name, signature: r.signature ?? '', startLine: r.start_line, endLine: r.end_line })),
      evidenceIds: rows.map((r) => r.id),
      truncated: false,
      budgetUsedTokens: estimateTokens(dsl),
    };
  }

  /** Read specific lines — max 120 lines/turn (16K Doc §7). */
  async readCodeBlock(pin: SessionPin, fp: string, start: number, end: number): Promise<ToolResult<{ content: string }>> {
    const v = validateToolArgs('read_code_block', { file_path: fp, start_line: start, end_line: end });
    if (!v.valid) throw new Error(`INVALID_ARGS: ${v.errors.join('; ')}`);
    if (end - start + 1 > MAX_READ_LINES) {
      throw new Error(`LINE_RANGE_EXCEEDED: ${end - start + 1} > ${MAX_READ_LINES} lines/turn — narrow the range`);
    }
    await assertSessionPin(this.retrieval, pin);
    const source = await this.sourceLoader(fp);
    const lines = source.split('\n');
    const slice = lines.slice(start - 1, end).filter((l) => l !== undefined);
    const dsl = `[CODE BLOCK ${fp}:${start}-${end} | LINES: ${slice.length}]\n${slice.join('\n')}`;
    const truncated = end - start + 1 === MAX_READ_LINES;
    return {
      resultId: newResultId(),
      summary: `${slice.length} lines of ${fp}`,
      dsl,
      data: { content: slice.join('\n') },
      evidenceIds: [],
      truncated,
      nextPageCursor: truncated ? `lines:${end + 1}-${Math.min(end + MAX_READ_LINES, lines.length)}` : undefined,
      budgetUsedTokens: estimateTokens(dsl),
    };
  }

  /** direction: CALLERS (incoming) | CALLEES (outgoing) | IMPLEMENTATIONS (inheritors). */
  async queryCallGraph(
    pin: SessionPin,
    symbolId: string,
    direction: 'CALLERS' | 'CALLEES' | 'IMPLEMENTATIONS',
  ): Promise<ToolResult<Array<{ id: string; name: string; kind: string; evidence: EvidenceKind }>>> {
    const v = validateToolArgs('query_call_graph', { symbol_id: symbolId });
    if (!v.valid) throw new Error(`INVALID_ARGS: ${v.errors.join('; ')}`);
    await assertSessionPin(this.retrieval, pin);
    const joinCol = direction === 'CALLERS' ? 'r.from_symbol_id' : 'r.to_symbol_id';
    const filter = direction === 'CALLERS'
      ? 'r.to_symbol_id = ?'
      : direction === 'CALLEES'
        ? 'r.from_symbol_id = ?'
        : `r.to_symbol_id = ? AND r.kind = 'INHERITS'`;
    const rows = await this.db.allAsync<any>(
      `SELECT r.id, r.from_symbol_id, r.to_symbol_id, r.kind,
              CASE WHEN ev.id IS NOT NULL THEN 'direct' ELSE 'inferred' END AS evidence,
              s.name, s.kind AS sym_kind
       FROM symbol_relationship r
       LEFT JOIN relationship_evidence ev ON ev.relationship_id = r.id AND ev.evidence_kind = 'PROVEN'
       LEFT JOIN code_symbol s ON s.id = ${joinCol}
       WHERE r.snapshot_id = ? AND ${filter} ORDER BY r.kind, r.id`,
      [pin.index_snapshot_id, symbolId],
    );
    const nodes = rows.map((r) => ({
      id: direction === 'CALLERS' ? r.from_symbol_id : (r.to_symbol_id ?? r.from_symbol_id),
      name: r.name ?? r.from_symbol_id,
      kind: r.sym_kind ?? r.kind,
      evidence: r.evidence as EvidenceKind,
    }));
    const dslLines = [dslHeader(`${direction} NODES`, nodes.length, 0)];
    for (const n of nodes) {
      dslLines.push(`# [${n.kind.toUpperCase()}] ${n.name} (${n.evidence}) | ${n.id}`);
    }
    const dsl = dslLines.join('\n');
    return {
      resultId: newResultId(),
      summary: `${nodes.length} ${direction.toLowerCase()} of ${symbolId}`,
      dsl,
      data: nodes,
      evidenceIds: rows.map((r) => r.id),
      truncated: false,
      budgetUsedTokens: estimateTokens(dsl),
    };
  }
}
