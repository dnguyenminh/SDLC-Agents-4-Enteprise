import type { MemoryEngine } from '../engine/core.js';
import type { QueryLayer } from '../../../engine/query/query-layer.js';
import { resolvePath } from './helpers.js';

type Args = Record<string, unknown>;

export function handleSyncCode(engine: MemoryEngine, queryLayer: QueryLayer | undefined, workspace: string, a: Args): string {
  if (!queryLayer) {
    return JSON.stringify({ error: 'mem_sync_code requires queryLayer (code indexer not available)' });
  }

  const limit = (a.limit as number) ?? 10000;
  const kind = a.kind as string | undefined;

  let symbols: any[] = [];
  if (kind) {
    symbols = queryLayer.findSymbols('', kind, limit);
  } else {
    const classes = queryLayer.findSymbols('', 'class', Math.floor(limit / 2));
    const interfaces = queryLayer.findSymbols('', 'interface', Math.floor(limit / 2));
    symbols = [...classes, ...interfaces];
  }

  if (symbols.length === 0) {
    return 'No code symbols found to sync.';
  }

  const db = engine.getDb();
  const checkStmt = db.prepare(`
    SELECT id FROM knowledge_entries 
    WHERE type = 'CODE_ENTITY' AND source = ? AND summary = ?
  `);

  const created: Array<[number, any]> = [];
  for (const sym of symbols) {
    const summary = `${sym.kind}: ${sym.name} (${sym.filePath})`;
    const exists = checkStmt.get(sym.filePath, summary);
    if (exists) continue;

    const parts = [`${sym.kind} ${sym.name}`];
    if (sym.signature) parts.push(`Signature: ${sym.signature}`);
    parts.push(`File: ${sym.filePath} (lines ${sym.startLine}-${sym.endLine})`);
    if (sym.parentSymbol) parts.push(`Parent: ${sym.parentSymbol}`);
    if (sym.docComment) parts.push(`Doc: ${sym.docComment}`);
    const content = parts.join('\n');

    const id = engine.insert({
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
  const edgeCheckStmt = db.prepare(`
    SELECT id FROM knowledge_graph_edges 
    WHERE source_id = ? AND target_id = ? AND relation = ?
  `);

  for (const [codeId, sym] of created) {
    const results = engine.search(sym.name, 5);
    const relatedIds = results
      .filter(r => r.entry.type !== 'CODE_ENTITY')
      .map(r => r.entry.id)
      .slice(0, 3);

    for (const docId of relatedIds) {
      const exists = edgeCheckStmt.get(codeId, docId, 'IMPLEMENTED_BY');
      if (!exists) {
        engine.addEdge(codeId, docId, 'IMPLEMENTED_BY');
        linked++;
      }
    }
  }

  return `Synced: ${created.length} code symbols, ${linked} cross-reference edges`;
}
