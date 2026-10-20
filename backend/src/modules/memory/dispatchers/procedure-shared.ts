/** Procedure dispatcher shared helpers (BR-18 extraction from procedure.ts). */
export interface ProcedureStep {
  tool: string;
  args: Record<string, unknown>;
}

export const PROCEDURE_TYPE = 'PROCEDURE';

export function parseSteps(raw: unknown): ProcedureStep[] {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as ProcedureStep[]; } catch (err) { console.debug('[procedure] Failed to parse steps JSON:', (err as Error).message); return []; }
  }
  if (Array.isArray(raw)) return raw as ProcedureStep[];
  return [];
}

export function procedureSummary(content: string): string {
  return content.length <= 120 ? content : content.slice(0, 117) + '...';
}

/** Look a procedure entry up by id or by name (summary LIKE). */
export async function findProcedureEntry(
  engine: { findById(id: number): Promise<any>; getAdapter(): { getAsync<T>(sql: string, params?: unknown[]): Promise<T | undefined> } },
  id: number,
  name: string,
  requireArchivedFilter: boolean,
): Promise<any> {
  if (id) {
    return engine.findById(id);
  } else if (name) {
    const where = requireArchivedFilter
      ? `SELECT * FROM knowledge_entries WHERE type = ? AND summary LIKE ? AND archived = 0 LIMIT 1`
      : `SELECT * FROM knowledge_entries WHERE type = ? AND summary LIKE ? LIMIT 1`;
    return engine.getAdapter().getAsync<any>(where, [PROCEDURE_TYPE, `%${name}%`]);
  }
  return undefined;
}
