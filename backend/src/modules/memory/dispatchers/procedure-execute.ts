/** Skill execute handler + step substitution (BR-18 extraction from procedure.ts). */
import type { MemoryEngine } from '../engine/core.js';
import type { ScopeContext } from '../models.js';
import { PROCEDURE_TYPE, findProcedureEntry, type ProcedureStep } from './procedure-shared.js';

type Args = Record<string, unknown>;
type DispatchFn = (toolName: string, args: Args) => Promise<string | null>;

interface StepResult { step: number; tool: string; status: string; output?: string; error?: string }

export async function handleSkillExecute(
  engine: MemoryEngine,
  _scopeCtx: ScopeContext | undefined,
  args: Args,
  dispatch?: DispatchFn,
): Promise<string> {
  const procedureId = (args.procedure_id as number) || 0;
  const name = (args.name as string) || '';
  const variables = parseVariables(args.variables as string);

  const entry = await findProcedureEntry(engine, procedureId, name, true);
  if (!entry) return JSON.stringify({ error: 'Procedure not found' });

  const steps = loadSteps(entry);
  if (steps.length === 0) return JSON.stringify({ error: 'Procedure has no steps' });

  const substituted = substituteVariables(steps, variables);

  if (!dispatch) {
    return JSON.stringify({
      status: 'dry-run',
      procedureId: entry.id,
      name: entry.summary.replace('[Procedure] ', ''),
      totalSteps: substituted.length,
      steps: substituted,
    });
  }

  const results = await executeSteps(substituted, dispatch);
  const succeeded = results.filter(r => r.status === 'ok').length;
  const failed = results.filter(r => r.status === 'error').length;

  return JSON.stringify({
    status: 'completed',
    procedureId: entry.id,
    name: entry.summary.replace('[Procedure] ', ''),
    totalSteps: substituted.length,
    succeeded,
    failed,
    results,
  });
}

function parseVariables(variablesRaw: string | undefined): Record<string, unknown> {
  let variables: Record<string, unknown> = {};
  try { variables = JSON.parse(typeof variablesRaw === 'string' ? variablesRaw : '{}'); } catch (err) { console.debug('[procedure] ignore :', (err as Error).message); }
  return variables;
}

function loadSteps(entry: any): ProcedureStep[] {
  let steps: ProcedureStep[] = [];
  try {
    const parsed = JSON.parse(entry.structured_map || '{}');
    steps = parsed.steps || [];
  } catch (err) { console.debug('[procedure] ignore :', (err as Error).message); }
  return steps;
}

/** Replace {{var}} placeholders inside each step's args JSON. */
function substituteVariables(steps: ProcedureStep[], variables: Record<string, unknown>): Array<{ tool: string; args: Record<string, unknown> }> {
  return steps.map(step => {
    const argsStr = JSON.stringify(step.args);
    const substituted = argsStr.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const val = variables[key];
      return val !== undefined ? String(val) : `{{${key}}}`;
    });
    return { tool: step.tool, args: JSON.parse(substituted) as Record<string, unknown> };
  });
}

async function executeSteps(substituted: Array<{ tool: string; args: Record<string, unknown> }>, dispatch: DispatchFn): Promise<StepResult[]> {
  const results: StepResult[] = [];

  for (let i = 0; i < substituted.length; i++) {
    const step = substituted[i];
    try {
      const output = await dispatch(step.tool, step.args);
      results.push({
        step: i + 1,
        tool: step.tool,
        status: output !== null ? 'ok' : 'no_handler',
        output: output ?? undefined,
      });
    } catch (e: any) {
      results.push({
        step: i + 1,
        tool: step.tool,
        status: 'error',
        error: String(e?.message ?? e),
      });
    }
  }
  return results;
}
