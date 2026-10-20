/** Procedure action handlers: search/share/list_shared (BR-18 extraction). */
import type { MemoryEngine } from '../engine/core.js';
import type { ScopeContext } from '../models.js';
import { PROCEDURE_TYPE, procedureSummary, findProcedureEntry } from './procedure-shared.js';

type Args = Record<string, unknown>;

export async function procedureSearch(engine: MemoryEngine, scopeCtx: ScopeContext | undefined, args: Args): Promise<string> {
  const query = (args.query as string) || '';
  const limit = (args.limit as number) || 20;
  const results = await engine.search(query, limit, 'SEMANTIC', PROCEDURE_TYPE, scopeCtx);
  const procedures = results.map(r => ({
    id: r.entry.id,
    name: r.entry.summary.replace('[Procedure] ', ''),
    description: procedureSummary(r.entry.content),
    score: r.score,
    matchType: r.matchType,
  }));
  return JSON.stringify({ procedures, count: procedures.length });
}

export async function procedureShare(engine: MemoryEngine, _scopeCtx: ScopeContext | undefined, args: Args): Promise<string> {
  const id = (args.id as number) || 0;
  const name = (args.name as string) || '';
  if (!id && !name) return JSON.stringify({ error: 'id or name required' });
  const entry = await findProcedureEntry(engine, id, name, true);
  if (!entry) return JSON.stringify({ error: 'Procedure not found' });
  if (entry.scope === 'SHARED') return JSON.stringify({ status: 'already_shared', id: entry.id });
  const dialect = engine.getDialect();
  await engine.getAdapter().runAsync(
    `UPDATE knowledge_entries SET scope = 'SHARED', updated_at = ${dialect.now()} WHERE id = ?`,
    [entry.id],
  );
  return JSON.stringify({ status: 'shared', id: entry.id, name: entry.summary.replace('[Procedure] ', '') });
}

export async function procedureListShared(engine: MemoryEngine, _scopeCtx: ScopeContext | undefined, args: Args): Promise<string> {
  const limit = (args.limit as number) || 20;
  const rows = await engine.getAdapter().allAsync<any>(
    `SELECT id, summary, content, tags, created_at FROM knowledge_entries
     WHERE type = ? AND scope = 'SHARED' AND archived = 0 ORDER BY created_at DESC, id DESC LIMIT ?`,
    [PROCEDURE_TYPE, limit],
  );
  const procedures = rows.map((r: any) => ({
    id: r.id,
    name: r.summary.replace('[Procedure] ', ''),
    description: procedureSummary(r.content),
    tags: r.tags,
    created_at: r.created_at,
  }));
  return JSON.stringify({ procedures, count: procedures.length });
}
