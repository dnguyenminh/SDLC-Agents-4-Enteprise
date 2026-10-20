/** Skill capture + execute handlers (BR-18 extraction from procedure.ts). */
import type { MemoryEngine } from '../engine/core.js';
import type { ScopeContext } from '../models.js';
import { PROCEDURE_TYPE, type ProcedureStep } from './procedure-shared.js';

type Args = Record<string, unknown>;

export async function handleSkillCapture(
  engine: MemoryEngine,
  scopeCtx: ScopeContext | undefined,
  args: Args,
): Promise<string> {
  const name = (args.name as string) || '';
  if (!name) return JSON.stringify({ error: 'name is required' });
  const description = (args.description as string) || `Captured skill: ${name}`;
  const maxTurns = (args.max_turns as number) || 20;
  const sessionId = (args.session_id as string) || engine.getSessionId() || '';
  const filterTools = (args.filter_tools as string) || '';
  const filterList = filterTools ? filterTools.split(',').map(t => t.trim()).filter(Boolean) : [];

  if (!sessionId) return JSON.stringify({ error: 'No active session and no session_id provided' });

  const adapter = engine.getAdapter();

  const turns = await adapter.allAsync<any>(
    `SELECT role, tool_calls FROM conversation_turns
     WHERE session_id = ? AND tool_calls IS NOT NULL AND tool_calls != ''
     ORDER BY turn_number DESC LIMIT ?`,
    [sessionId, maxTurns],
  );

  if (turns.length === 0) return JSON.stringify({ error: 'No tool calls found in session' });

  const allSteps = collectStepsFromTurns(turns, filterList);
  if (allSteps.length === 0) return JSON.stringify({ error: 'No parseable tool calls found' });
  allSteps.reverse();

  const content = `Procedure: ${name}\n\n${description}\n\nSteps:\n${
    allSteps.map((s, i) => `${i + 1}. ${s.tool}(${JSON.stringify(s.args)})`).join('\n')
  }`;
  const structuredMap = JSON.stringify({ steps: allSteps, version: 1, captured_from: sessionId });
  const tagNames = `procedure,captured,${name},${allSteps.map(s => s.tool).join(',')}`;

  const id = await engine.insert({
    content,
    summary: `[Procedure] ${name}`,
    type: PROCEDURE_TYPE,
    tier: 'SEMANTIC',
    scope: 'PROJECT',
    user_id: scopeCtx?.userId ?? null,
    project_id: scopeCtx?.projectId ?? null,
    // Name-scoped source: distinct captured skills must not collapse into one row.
    source: `/procedure/capture/${name}`,
    tags: tagNames,
    agent_name: 'system',
  });

  const dialect = engine.getDialect();
  await adapter.runAsync(
    `UPDATE knowledge_entries SET structured_map = ?, updated_at = ${dialect.now()} WHERE id = ?`,
    [structuredMap, id],
  );

  return JSON.stringify({
    status: 'captured',
    id,
    name,
    stepCount: allSteps.length,
    steps: allSteps.map(s => s.tool),
  });
}

/** Extract deduplicated tool-call steps from conversation turns (chronological asc). */
function collectStepsFromTurns(turns: any[], filterList: string[]): ProcedureStep[] {
  const allSteps: ProcedureStep[] = [];
  const seen = new Set<string>();

  for (const turn of turns) {
    if (!turn.tool_calls) continue;
    try {
      const calls = JSON.parse(turn.tool_calls);
      const callsArr = Array.isArray(calls) ? calls : [calls];
      for (const call of callsArr) {
        const toolName = (call.name || call.toolName || call.tool_name || '') as string;
        if (!toolName) continue;
        if (filterList.length > 0 && !filterList.includes(toolName)) continue;
        const key = `${toolName}:${JSON.stringify(call.arguments || call.args || {})}`;
        if (seen.has(key)) continue;
        seen.add(key);
        allSteps.push({
          tool: toolName,
          args: (call.arguments || call.args || {}) as Record<string, unknown>,
        });
      }
    } catch (err) { console.debug('[procedure] skip unparseable :', (err as Error).message); }
  }
  return allSteps;
}
