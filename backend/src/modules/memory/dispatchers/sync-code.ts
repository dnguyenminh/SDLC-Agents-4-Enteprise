/**
 * sync-code.ts — Syncs code symbols from QueryLayer into KB knowledge_entries.
 * SA4E-53: converted to async for PostgreSQL compatibility.
 */

import type { MemoryEngine } from '../engine/core.js';
import type { QueryLayer } from '../../../engine/query/query-layer.js';

type Args = Record<string, unknown>;

export async function handleSyncCode(engine: MemoryEngine, queryLayer: QueryLayer | undefined, workspace: string, a: Args): Promise<string> {
  if (!queryLayer) {
    return JSON.stringify({ error: 'mem_sync_code requires queryLayer (code indexer not available)' });
  }

  const limit = (a.limit as number) ?? 10000;
  const kind = a.kind as string | undefined;
  // SA4E-41: scope symbol reads to the request tenant (fail-closed if absent).
  const projectId = a.__projectId as string | undefined;

  let symbols: any[] = [];
  if (kind) {
    symbols = await queryLayer.findSymbols(projectId, '', kind, limit);
  } else {
    const classes = await queryLayer.findSymbols(projectId, '', 'class', Math.floor(limit / 2));
    const interfaces = await queryLayer.findSymbols(projectId, '', 'interface', Math.floor(limit / 2));
    symbols = [...classes, ...interfaces];
  }

  if (symbols.length === 0) {
    return 'No code symbols found to sync.';
  }

  const adapter = engine.getAdapter();

  const created: Array<[number, any]> = [];
  for (const sym of symbols) {
    const summary = `${sym.kind}: ${sym.name} (${sym.filePath})`;
    const exists = await adapter.getAsync<{ id: number }>(
      `SELECT id FROM knowledge_entries WHERE type = 'CODE_ENTITY' AND source = ? AND summary = ?`,
      [sym.filePath, summary],
    );
    if (exists) continue;

    const parts = [`${sym.kind} ${sym.name}`];
    if (sym.signature) parts.push(`Signature: ${sym.signature}`);
    parts.push(`File: ${sym.filePath} (lines ${sym.startLine}-${sym.endLine})`);
    if (sym.parentSymbol) parts.push(`Parent: ${sym.parentSymbol}`);
    if (sym.docComment) parts.push(`Doc: ${sym.docComment}`);
    const content = parts.join('\n');

    const id = await engine.insert({
      content,
      summary,
      type: 'CODE_ENTITY',
      tier: 'SEMANTIC',
      source: sym.filePath,
      tags: `${sym.kind},${sym.name},code`,
    });
    created.push([id, sym]);
  }

  let linked = 0;
  for (const [codeId, sym] of created) {
    const results = await engine.search(sym.name, 5);
    const relatedIds = results
      .filter(r => r.entry.type !== 'CODE_ENTITY')
      .map(r => r.entry.id)
      .slice(0, 3);

    for (const docId of relatedIds) {
      const exists = await adapter.getAsync<{ id: number }>(
        `SELECT id FROM knowledge_graph_edges WHERE source_id = ? AND target_id = ? AND relation = ?`,
        [codeId, docId, 'IMPLEMENTED_BY'],
      );
      if (!exists) {
        await engine.addEdge(codeId, docId, 'IMPLEMENTED_BY');
        linked++;
      }
    }
  }

  return `Synced: ${created.length} code symbols, ${linked} cross-reference edges`;
}
