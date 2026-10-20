/** Misc rule dependency extraction + logic summary builder (BR-18 extraction). */
import type { UnresolvedDependency } from '../models.js';
import { extractMiscName } from './misc-utils.js';

export function extractMiscDependencies(json: Record<string, unknown>): UnresolvedDependency[] {
  const deps: UnresolvedDependency[] = [];
  const className = (json.pyClassName as string) || '@baseclass';

  const startProcess = json.pyStartProcess as string;
  if (startProcess) {
    deps.push({ ruleType: 'Rule-Obj-Activity', className, ruleName: startProcess });
  }

  const processes = json.pyProcesses as unknown[];
  if (Array.isArray(processes)) {
    for (const raw of processes) {
      if (typeof raw === 'string' && raw.trim()) {
        deps.push({ ruleType: 'Rule-Obj-Activity', className, ruleName: raw.trim() });
      }
    }
  }

  const mapRuleSet = json.pyMapRuleSet as string;
  if (mapRuleSet) {
    deps.push({ ruleType: 'Rule-Obj-MapValue', className, ruleName: mapRuleSet });
  }

  const targetProperty = json.pyTargetProperty as string;
  if (targetProperty) {
    deps.push({ ruleType: 'Rule-Obj-FieldValue', className, ruleName: targetProperty });
  }

  const datasource = json.pyDatasource as string;
  if (datasource) {
    deps.push({ ruleType: 'Rule-Obj-Report-', className, ruleName: datasource });
  }

  return deps;
}

export function buildLogicSummary(pxObjClass: string, json: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`${pxObjClass}: ${extractMiscName(json)}`);
  appendSummaryBody(pxObjClass, json, lines);
  return lines.join('\n');
}

function appendSummaryBody(pxObjClass: string, json: Record<string, unknown>, lines: string[]): void {
  if (pxObjClass === 'Rule-Obj-MapValue' || pxObjClass.startsWith('Rule-Obj-MapValue')) {
    const src = (json.pySourceProperty as string) || '(not set)';
    const tgt = (json.pyTargetProperty as string) || '(not set)';
    lines.push(`  Source: ${src} -> Target: ${tgt}`);
  } else if (pxObjClass === 'Rule-Obj-FieldValue' || pxObjClass.startsWith('Rule-Obj-FieldValue')) {
    const val = (json.pyFieldValue as string) || (json.pyValue as string) || '(not set)';
    lines.push(`  Field Value: ${val}`);
  } else if (pxObjClass === 'Rule-Obj-CaseType' || pxObjClass.startsWith('Rule-Obj-CaseType')) {
    const stages = json.pyStages as unknown[];
    lines.push(`  Stages: ${Array.isArray(stages) ? stages.length : 0}`);
    const startProc = (json.pyStartProcess as string);
    if (startProc) lines.push(`  Start Process: ${startProc}`);
  } else if (pxObjClass === 'Rule-Obj-Stage' || pxObjClass.startsWith('Rule-Obj-Stage')) {
    const stType = (json.pyStageType as string) || '(not set)';
    lines.push(`  Stage Type: ${stType}`);
  } else if (pxObjClass === 'Rule-Obj-ServiceLevel' || pxObjClass.startsWith('Rule-Obj-ServiceLevel')) {
    const urgency = json.pyUrgency;
    lines.push(`  Urgency: ${urgency !== undefined ? urgency : '(not set)'}`);
    const goal = (json.pyGoal as string);
    if (goal) lines.push(`  Goal: ${goal}`);
    const deadline = (json.pyDeadline as string);
    if (deadline) lines.push(`  Deadline: ${deadline}`);
  } else {
    appendSummaryBodyPart2(pxObjClass, json, lines);
  }
}

function appendSummaryBodyPart2(pxObjClass: string, json: Record<string, unknown>, lines: string[]): void {
  if (pxObjClass.startsWith('Rule-Circumstance-')) {
    const ct = (json.pyCircumstanceType as string) || '(not set)';
    lines.push(`  Type: ${ct}`);
    const val = (json.pyValue as string);
    if (val) lines.push(`  Value: ${val}`);
  } else if (pxObjClass.startsWith('Rule-Agent-')) {
    const agentType = (json.pyType as string) || '(not set)';
    lines.push(`  Agent Type: ${agentType}`);
    const interval = json.pyInterval;
    if (interval !== undefined) lines.push(`  Interval: ${interval}s`);
  } else if (pxObjClass.startsWith('Rule-Obj-Report-')) {
    const ds = (json.pyDatasource as string) || '(not set)';
    lines.push(`  Datasource: ${ds}`);
  } else if (pxObjClass.startsWith('Rule-Corr-')) {
    const subj = (json.pySubject as string);
    if (subj) lines.push(`  Subject: ${subj}`);
  } else if (pxObjClass.startsWith('Rule-File-')) {
    const fp = (json.pyFilePath as string);
    if (fp) lines.push(`  File Path: ${fp}`);
  } else if (pxObjClass.startsWith('Rule-Edit-')) {
    const vt = (json.pyValidateType as string) || '(not set)';
    lines.push(`  Validate Type: ${vt}`);
  } else if (pxObjClass.startsWith('Rule-Test-')) {
    const script = json.pyTestScript as unknown[];
    lines.push(`  Test Steps: ${Array.isArray(script) ? script.length : 0}`);
  } else if (pxObjClass.startsWith('Rule-Utility-')) {
    const lang = (json.pyLanguage as string) || '(not set)';
    lines.push(`  Language: ${lang}`);
  } else if (pxObjClass === 'Rule-Message') {
    const text = (json.pyText as string) || '';
    lines.push(`  Text: ${text.substring(0, 60)}${text.length > 60 ? '...' : ''}`);
  } else if (pxObjClass === 'Rule-Stream') {
    const ds = (json.pyDataSource as string) || '(not set)';
    lines.push(`  Source: ${ds}`);
  } else if (pxObjClass === 'Rule-Shortcut') {
    const target = (json.pyTarget as string) || '(not set)';
    lines.push(`  Target: ${target}`);
  }
}
