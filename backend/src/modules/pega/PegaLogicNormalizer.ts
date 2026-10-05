/**
 * PegaLogicNormalizer — Chuyển đổi cấu hình Pega Activity & Data Transform 
 * thành Mã Giả Cấu Trúc kèm RowID phục vụ Browser Agent Tự Động Hóa UI.
 */

export interface NormalizedStep {
  rowId: string;
  stepNum: string;
  context: string;
  condition?: string;
  action: string;
  jumpCondition?: string;
}

export interface NormalizedDataAction {
  rowId: string;
  actionType: string;
  target?: string;
  source?: string;
  condition?: string;
}

export class PegaLogicNormalizer {
  public static normalizeActivity(json: Record<string, unknown>): string {
    const steps = Array.isArray(json.pySteps) ? json.pySteps : Array.isArray(json.steps) ? json.steps : [];
    const lines: string[] = [];
    lines.push(`ACTIVITY: ${json.pyClassName}.${json.pyActivityName || json.pyLabel}`);

    let idx = 1;
    for (const step of steps) {
      if (typeof step !== 'object' || !step) continue;
      const norm = PegaLogicNormalizer.parseActivityStep(step as Record<string, unknown>, idx++);
      lines.push(PegaLogicNormalizer.formatStep(norm));
    }
    return lines.join('\n');
  }

  private static parseActivityStep(step: Record<string, unknown>, index: number): NormalizedStep {
    const rowId = (step.pyStepId as string) || `ROW-${index}`;
    const stepNum = (step.pyStepNum as string) || `${index}`;
    const context = (step.pyStepContext as string) || 'Primary';
    const method = (step.pyMethod as string) || 'Property-Set';
    const params = (step.pyMethodParameters as string) || '';

    const preWhen = (step.pyPreCondition as any)?.pyWhenName;
    const condition = preWhen ? `IF NOT When(${preWhen}) THEN SKIP` : undefined;

    const action = `${method}(${params})`;
    const postWhen = (step.pyPostCondition as any)?.pyWhenName;
    const jumpCondition = postWhen ? `IF When(${postWhen}) THEN JUMP` : undefined;

    return { rowId, stepNum, context, condition, action, jumpCondition };
  }

  private static formatStep(s: NormalizedStep): string {
    let out = `[RowID: ${s.rowId} | Step ${s.stepNum}] Context: ${s.context}`;
    if (s.condition) out += ` | Pre: ${s.condition}`;
    out += ` | Action: ${s.action}`;
    if (s.jumpCondition) out += ` | Post: ${s.jumpCondition}`;
    return out;
  }

  public static normalizeDataTransform(json: Record<string, unknown>): string {
    const actions = Array.isArray(json.pyActions) ? json.pyActions : [];
    const lines: string[] = [];
    lines.push(`DATA TRANSFORM: ${json.pyClassName}.${json.pyModelName || json.pyTransformName}`);

    let idx = 1;
    for (const act of actions) {
      if (typeof act !== 'object' || !act) continue;
      const norm = PegaLogicNormalizer.parseDataAction(act as Record<string, unknown>, idx++);
      lines.push(PegaLogicNormalizer.formatDataAction(norm));
    }
    return lines.join('\n');
  }

  private static parseDataAction(act: Record<string, unknown>, index: number): NormalizedDataAction {
    const rowId = (act.pyActionId as string) || `ACTION-${index}`;
    const actionType = (act.pyActionType as string) || 'Set';
    const target = (act.pyTarget as string) || '';
    const source = (act.pySource as string) || (act.pyTransformName as string) || '';
    const condition = (act.pyWhenCondition as string) || undefined;
    return { rowId, actionType, target, source, condition };
  }

  private static formatDataAction(a: NormalizedDataAction): string {
    let out = `  [RowID: ${a.rowId}] -> ${a.actionType}`;
    if (a.target) out += ` Target: ${a.target}`;
    if (a.source) out += ` Source: ${a.source}`;
    if (a.condition) out += ` (WHEN ${a.condition})`;
    return out;
  }
}
