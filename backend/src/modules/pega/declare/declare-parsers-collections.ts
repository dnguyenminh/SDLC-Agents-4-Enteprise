/** Declare parser impls — Pages + Decision tables/trees (BR-18 extraction). */
import type {
  PegaDeclarePages, PegaDeclareDecisionTable, PegaDeclareDecisionTree,
  DeclarePageDefinition, DeclareDecisionRow,
} from './PegaDeclareTypes.js';

/** Parse a Declare Pages rule. */
export function parseDeclarePagesImpl(json: Record<string, unknown>): PegaDeclarePages {
  const pages: DeclarePageDefinition[] = [];
  const rawPages = Array.isArray(json.pyPages) ? json.pyPages : [];

  for (const raw of rawPages) {
    if (typeof raw !== 'object' || !raw) continue;
    const pg = raw as Record<string, unknown>;
    const name = (pg.pyPageName as string) || '';
    const sourceStr = (pg.pySource as string) || (pg.pyPageSource as string) || 'clipboard';
    const sourceRef = (pg.pySourceClass as string) || (pg.pyRuleName as string) || '';

    let source: DeclarePageDefinition['source'];
    if (sourceStr.includes('DataPage') || sourceStr.includes('dataPage')) source = 'dataPage';
    else if (sourceStr.includes('Transform') || sourceStr.includes('DataTransform')) source = 'dataTransform';
    else if (sourceStr.includes('class') || sourceStr.includes('Class')) source = 'class';
    else source = 'clipboard';

    const scopeStr = (pg.pyScope as string) || '';
    let scope: DeclarePageDefinition['scope'] | undefined;
    if (scopeStr === 'requestor' || scopeStr === 'thread' || scopeStr === 'node') {
      scope = scopeStr;
    }

    const parameters: Record<string, string> = {};
    if (pg.pyParameters && typeof pg.pyParameters === 'object') {
      for (const [k, v] of Object.entries(pg.pyParameters as Record<string, unknown>)) {
        parameters[k] = String(v);
      }
    }

    pages.push({
      name,
      source,
      sourceRef,
      parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
      scope,
    });
  }

  return {
    pxObjClass: 'Rule-Declare-Pages',
    pyName: (json.pyRuleName as string) || '',
    pyLabel: (json.pyLabel as string) || undefined,
    declareType: 'Declare-Pages',
    pages,
  };
}

/** Parse a Declare DecisionTable rule. */
export function parseDeclareDecisionTableImpl(json: Record<string, unknown>): PegaDeclareDecisionTable {
  const propertyEvaluated = (json.pyPropertyEvaluated as string) || undefined;
  const rows: DeclareDecisionRow[] = [];
  const rawRows = Array.isArray(json.pyDecisionTableRows) ? json.pyDecisionTableRows : [];

  for (const raw of rawRows) {
    if (typeof raw !== 'object' || !raw) continue;
    const row = raw as Record<string, unknown>;
    rows.push({
      condition: (row.pyCondition as string) || '',
      result: (row.pyResult as string) || '',
    });
  }

  return {
    pxObjClass: 'Rule-Declare-DecisionTable',
    pyName: (json.pyRuleName as string) || '',
    pyLabel: (json.pyLabel as string) || undefined,
    declareType: 'Declare-DecisionTable',
    propertyEvaluated,
    rows,
  };
}

/** Parse a Declare DecisionTree rule. */
export function parseDeclareDecisionTreeImpl(json: Record<string, unknown>): PegaDeclareDecisionTree {
  const propertyEvaluated = (json.pyPropertyEvaluated as string) || undefined;
  const rows: DeclareDecisionRow[] = [];
  const rawRows = Array.isArray(json.pyDecisionTableRows) ? json.pyDecisionTableRows : [];

  for (const raw of rawRows) {
    if (typeof raw !== 'object' || !raw) continue;
    const row = raw as Record<string, unknown>;
    rows.push({
      condition: (row.pyCondition as string) || '',
      result: (row.pyResult as string) || '',
    });
  }

  return {
    pxObjClass: 'Rule-Declare-DecisionTree',
    pyName: (json.pyRuleName as string) || '',
    pyLabel: (json.pyLabel as string) || undefined,
    declareType: 'Declare-DecisionTree',
    propertyEvaluated,
    rows,
  };
}
