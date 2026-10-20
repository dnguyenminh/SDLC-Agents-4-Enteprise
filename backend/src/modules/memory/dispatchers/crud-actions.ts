/** mem_crud action registry + dispatcher (BR-18 extraction from crud.ts). */
import type { MemoryEngine } from '../engine/core.js';
import type { ScopeContext } from '../models.js';
import type { ProjectContext } from '../ProjectContext.js';
import { validateReadAccess, validateMutationOwnership } from '../IsolationLayer.js';

type Args = Record<string, unknown>;

/** OCP: action handlers registered in a map — add new actions without modifying this function. */
type CrudActionFn = (engine: MemoryEngine, scopeCtx: ScopeContext | undefined, a: Args) => Promise<string>;

const CRUD_ACTIONS: Record<string, CrudActionFn> = {
  get: async (engine, scopeCtx, a) => {
    const id = a.id as number;
    if (!id) return 'Error: id required';
    const raw = await engine.findById(id);
    // SA4E-331: Fail closed if no scope context — prevents project isolation bypass
    if (!scopeCtx) return `Not found: ${id}`;
    const e = validateReadAccess(scopeCtx as ProjectContext, raw);
    if (!e) return `Not found: ${id}`;
    await engine.recordAccess(id);
    return `#${e.id} [${e.type}] ${e.summary}\nTier: ${e.tier} | Scope: ${e.scope ?? 'USER'} | Tags: ${e.tags}\n${e.content}`;
  },
  delete: async (engine, scopeCtx, a) => {
    const id = a.id as number;
    if (!id) return 'Error: id required';
    const e = await engine.findById(id);
    if (!e) return `Not found: ${id}`;
    if (scopeCtx) {
      const v = validateMutationOwnership(scopeCtx as ProjectContext, e);
      if (!v.allowed) return `Error: cannot delete — ${v.reason}`;
    }
    await engine.deleteEntry(id);
    try { await engine.auditLog('DELETE', id); } catch { /* audit is non-fatal */ }
    return `Deleted #${id}`;
  },
  list: async (engine, scopeCtx, a) => {
    const entries = await engine.findFiltered(a.tier as string, a.type as string, (a.limit as number) ?? 20, scopeCtx);
    return entries.length === 0 ? 'No entries' : entries.map(e => `#${e.id} [${e.type}] ${e.summary.slice(0, 80)} (${e.tier}|${e.scope ?? 'USER'})`).join('\n');
  },
};

export async function handleCrud(engine: MemoryEngine, scopeCtx: ScopeContext | undefined, a: Args): Promise<string> {
  const action = (a.action as string) || 'list';
  const handler = CRUD_ACTIONS[action];
  if (!handler) return `Unknown crud action: ${action}`;
  return handler(engine, scopeCtx, a);
}
