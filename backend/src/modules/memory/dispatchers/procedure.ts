/**
 * Procedure/skill dispatchers — mem_procedure, skill capture/execute.
 * Facade (BR-18): shared helpers in procedure-shared.ts, actions in
 * procedure-actions.ts / procedure-actions2.ts, capture in procedure-capture.ts,
 * execute in procedure-execute.ts.
 */
import type { MemoryEngine } from '../engine/core.js';
import type { ScopeContext } from '../models.js';
import type { ProcedureStep } from './procedure-shared.js';
import {
  procedureCreate, procedureList, procedureGet, procedureDelete,
} from './procedure-actions.js';
import {
  procedureSearch, procedureShare, procedureListShared,
} from './procedure-actions2.js';
import { handleSkillCapture } from './procedure-capture.js';
import { handleSkillExecute } from './procedure-execute.js';

type Args = Record<string, unknown>;

export { handleSkillCapture, handleSkillExecute };

export async function handleProcedure(
  engine: MemoryEngine,
  scopeCtx: ScopeContext | undefined,
  args: Args,
): Promise<string> {
  const action = (args.action as string) || 'list';

  switch (action) {
    case 'create':
      return procedureCreate(engine, scopeCtx, args);
    case 'list':
      return procedureList(engine, scopeCtx, args);
    case 'get':
      return procedureGet(engine, scopeCtx, args);
    case 'delete':
      return procedureDelete(engine, scopeCtx, args);
    case 'search':
      return procedureSearch(engine, scopeCtx, args);
    case 'share':
      return procedureShare(engine, scopeCtx, args);
    case 'list_shared':
      return procedureListShared(engine, scopeCtx, args);
    default:
      return JSON.stringify({ error: `Unknown action: ${action}` });
  }
}

// Re-export the shared step type for existing deep importers
export type { ProcedureStep };
