/** Misc rule parser impls — data/process/agent rules (BR-18 extraction). */
import type {
  MapValue, FieldValue, CaseType, StageRef, Stage, ServiceLevel,
  Circumstance, Agent, QueueProcessor,
} from './PegaMiscTypes.js';
import { extractMiscName } from './misc-utils.js';

export function parseMapValue(json: Record<string, unknown>): MapValue {
  return {
    pxObjClass: (json.pxObjClass as string) || 'Rule-Obj-MapValue',
    pyName: extractMiscName(json),
    pySourceProperty: (json.pySourceProperty as string) || undefined,
    pyTargetProperty: (json.pyTargetProperty as string) || undefined,
    pyMapRuleSet: (json.pyMapRuleSet as string) || undefined,
  };
}

export function parseFieldValue(json: Record<string, unknown>): FieldValue {
  return {
    pxObjClass: (json.pxObjClass as string) || 'Rule-Obj-FieldValue',
    pyName: extractMiscName(json),
    pyFieldValue: (json.pyFieldValue as string) || undefined,
    pyClass: (json.pyClass as string) || undefined,
    pyValue: (json.pyValue as string) || undefined,
  };
}

export function parseCaseType(json: Record<string, unknown>): CaseType {
  const rawStages = json.pyStages as unknown[];
  const stages: StageRef[] = [];
  if (Array.isArray(rawStages)) {
    for (const raw of rawStages) {
      if (!raw || typeof raw !== 'object') continue;
      const s = raw as Record<string, unknown>;
      stages.push({
        pyName: (s.pyName as string) || '',
        pyLabel: (s.pyLabel as string) || undefined,
      });
    }
  }

  return {
    pxObjClass: (json.pxObjClass as string) || 'Rule-Obj-CaseType',
    pyName: extractMiscName(json),
    pyLabel: (json.pyLabel as string) || undefined,
    stages: stages.length > 0 ? stages : undefined,
    pyDefaultStage: (json.pyDefaultStage as string) || undefined,
    pyStartProcess: (json.pyStartProcess as string) || undefined,
  };
}

export function parseStage(json: Record<string, unknown>): Stage {
  const rawProcesses = json.pyProcesses as unknown[];
  const processes: string[] = [];
  if (Array.isArray(rawProcesses)) {
    for (const raw of rawProcesses) {
      if (typeof raw === 'string') processes.push(raw);
    }
  }

  return {
    pxObjClass: (json.pxObjClass as string) || 'Rule-Obj-Stage',
    pyName: extractMiscName(json),
    pyLabel: (json.pyLabel as string) || undefined,
    pyStageType: (json.pyStageType as 'Subprocess' | 'Assignment' | 'Approval') || undefined,
    pyProcesses: processes.length > 0 ? processes : undefined,
  };
}

export function parseServiceLevel(json: Record<string, unknown>): ServiceLevel {
  return {
    pxObjClass: (json.pxObjClass as string) || 'Rule-Obj-ServiceLevel',
    pyName: extractMiscName(json),
    pyUrgency: json.pyUrgency !== undefined ? Number(json.pyUrgency) : undefined,
    pyGoal: (json.pyGoal as string) || undefined,
    pyDeadline: (json.pyDeadline as string) || undefined,
    pyLimit: (json.pyLimit as string) || undefined,
    pyAction: (json.pyAction as string) || undefined,
    pyEscalation: (json.pyEscalation as string) || undefined,
  };
}

export function parseCircumstance(json: Record<string, unknown>): Circumstance {
  return {
    pxObjClass: (json.pxObjClass as string) || 'Rule-Circumstance-',
    pyName: extractMiscName(json),
    pyCircumstanceType: (json.pyCircumstanceType as 'Date' | 'Time' | 'Number' | 'Property') || undefined,
    pyValue: (json.pyValue as string) || undefined,
    pyTargetProperty: (json.pyTargetProperty as string) || undefined,
    pyPriority: json.pyPriority !== undefined ? Number(json.pyPriority) : undefined,
  };
}

export function parseAgent(json: Record<string, unknown>): Agent {
  return {
    pxObjClass: (json.pxObjClass as string) || 'Rule-Agent-',
    pyName: extractMiscName(json),
    pyType: (json.pyType as 'Queue' | 'JobScheduler') || undefined,
    pyQueueType: (json.pyQueueType as string) || undefined,
    pyInterval: json.pyInterval !== undefined ? Number(json.pyInterval) : undefined,
    pyMaxThreads: json.pyMaxThreads !== undefined ? Number(json.pyMaxThreads) : undefined,
  };
}

export function parseQueueProcessor(json: Record<string, unknown>): QueueProcessor {
  return {
    pxObjClass: (json.pxObjClass as string) || 'Rule-Agent-Queue',
    pyName: extractMiscName(json),
    pyClassName: (json.pyClassName as string) || undefined,
    pyMaxItems: json.pyMaxItems !== undefined ? Number(json.pyMaxItems) : undefined,
  };
}
