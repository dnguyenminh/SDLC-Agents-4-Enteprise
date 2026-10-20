/** Procedure action handlers: create/list/get/delete (BR-18 extraction). */
import type { MemoryEngine } from '../engine/core.js';
import type { ScopeContext } from '../models.js';
import { PROCEDURE_TYPE, parseSteps, procedureSummary, findProcedureEntry } from './procedure-shared.js';

type Args = Record<string, unknown>;

export async function procedureCreate(engine: MemoryEngine, scopeCtx: ScopeContext | undefined, args: Args): Promise<string> {
  const name = (args.name as string) || '';
  if (!name) return JSON.stringify({ error: 'name is required' });
  const description = (args.description as string) || name;
  const rawSteps = args.steps;
  const steps = parseSteps(rawSteps);
  if (rawSteps !== undefined && typeof rawSteps === 'string') {
    try { JSON.parse(rawSteps); } catch {
      return JSON.stringify({ error: 'steps must be a valid JSON array of {tool, args} objects' });
    }
  }

  const content = `Procedure: ${name}\n\n${description}\n\nSteps:\n${
    steps.map((s, i) => `${i + 1}. ${s.tool}(${JSON.stringify(s.args)})`).join('\n')
  }`;
  const structuredMap = JSON.stringify({ steps, version: 1 });

  const id = await engine.insert({
    content,
    summary: `[Procedure] ${name}`,
    type: PROCEDURE_TYPE,
    tier: 'SEMANTIC',
    scope: 'PROJECT',
    user_id: scopeCtx?.userId ?? null,
    project_id: scopeCtx?.projectId ?? null,
    // Name-scoped source: distinct procedures must not collapse into one row
    // via the (source, project_id) upsert key in MemoryEngineCrud.insert.
    source: `/procedure/${name}`,
    tags: `procedure,${name},${steps.map(s => s.tool).join(',')}`,
    agent_name: 'system',
  });

  const dialect = engine.getDialect();
  await engine.getAdapter().runAsync(
    `UPDATE knowledge_entries SET structured_map = ?, updated_at = ${dialect.now()} WHERE id = ?`,
    [structuredMap, id],
  );

  return JSON.stringify({ status: 'created', id, name, stepCount: steps.length });
}

export async function procedureList(engine: MemoryEngine, _scopeCtx: ScopeContext | undefined, args: Args): Promise<string> {
  const limit = (args.limit as number) || 20;
  const rows = await engine.getAdapter().allAsync<any>(
    `SELECT id, summary, content, tags, created_at FROM knowledge_entries
     WHERE type = ? AND archived = 0 ORDER BY created_at DESC, id DESC LIMIT ?`,
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

export async function procedureGet(engine: MemoryEngine, _scopeCtx: ScopeContext | undefined, args: Args): Promise<string> {
  const id = (args.id as number) || 0;
  const name = (args.name as string) || '';
  const entry = await findProcedureEntry(engine, id, name, true);
  if (!entry) return JSON.stringify({ error: 'Procedure not found' });

  let steps = [];
  try {
    const parsed = JSON.parse(entry.structured_map || '{}');
    steps = parsed.steps || [];
  } catch (err) { console.debug('[procedure] ignore :', (err as Error).message); }

  return JSON.stringify({
    id: entry.id,
    name: entry.summary.replace('[Procedure] ', ''),
    content: entry.content,
    steps,
    tags: entry.tags,
    created_at: entry.created_at,
  });
}

export async function procedureDelete(engine: MemoryEngine, _scopeCtx: ScopeContext | undefined, args: Args): Promise<string> {
  const id = (args.id as number) || 0;
  if (!id) {
    const name = (args.name as string) || '';
    if (!name) return JSON.stringify({ error: 'id or name required' });
    const entry = await findProcedureEntry(engine, 0, name, false);
    if (!entry) return JSON.stringify({ error: 'Procedure not found' });
    await engine.deleteEntry(entry.id);
    return JSON.stringify({ status: 'deleted', id: entry.id });
  }
  await engine.deleteEntry(id);
  return JSON.stringify({ status: 'deleted', id });
}
