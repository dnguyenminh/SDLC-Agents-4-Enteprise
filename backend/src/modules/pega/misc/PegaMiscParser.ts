import type { IPegaRuleParserStrategy, ParseResult } from '../strategies/IPegaRuleParserStrategy.js';
import type {
  MapValue, FieldValue, CaseType, Stage, ServiceLevel,
  Circumstance, Agent, QueueProcessor, ReportDef, Correspondence,
  FileBinary, FileText, EditValidate, AutoTest, Utility, Message,
  Stream, Shortcut,
} from './PegaMiscTypes.js';
import { extractMiscName } from './misc-utils.js';
import {
  parseMapValue, parseFieldValue, parseCaseType, parseStage,
  parseServiceLevel, parseCircumstance, parseAgent, parseQueueProcessor,
} from './misc-parsers-data.js';
import {
  parseReportDef, parseCorrespondence, parseFileBinary, parseFileText,
  parseEditValidate, parseAutoTest, parseUtility, parseMessage,
  parseStream, parseShortcut,
} from './misc-parsers-other.js';
import { extractMiscDependencies, buildLogicSummary } from './misc-summary.js';

const MISC_CLASS_PREFIXES = [
  'Rule-Obj-MapValue',
  'Rule-Obj-FieldValue',
  'Rule-Obj-CaseType',
  'Rule-Obj-Stage',
  'Rule-Obj-ServiceLevel',
  'Rule-Obj-Report-',
  'Rule-Circumstance-',
  'Rule-Agent-',
  'Rule-Corr-',
  'Rule-File-',
  'Rule-Edit-',
  'Rule-Test-',
  'Rule-Utility-',
  'Rule-Message',
  'Rule-Stream',
  'Rule-Shortcut',
];

/**
 * PegaMiscParser — facade (BR-18): parse* impls live in misc-parsers-data.ts /
 * misc-parsers-other.ts; dependencies + logic summary in misc-summary.ts.
 */
export class PegaMiscParser implements IPegaRuleParserStrategy {
  public supports(pxObjClass: string): boolean {
    for (const prefix of MISC_CLASS_PREFIXES) {
      if (pxObjClass === prefix) return true;
      if (pxObjClass.startsWith(prefix)) return true;
    }
    return false;
  }

  public parse(json: Record<string, unknown>): ParseResult {
    const pxObjClass = (json.pxObjClass as string) || '';
    const className = (json.pyClassName as string) || '@baseclass';
    const name = extractMiscName(json);
    const fqn = `${pxObjClass}:${className}:${name}`;
    const dependencies = extractMiscDependencies(json);
    const logicSummary = buildLogicSummary(pxObjClass, json);

    const symbol = {
      fqn,
      name,
      className,
      ruleType: pxObjClass,
      isRule: true,
      ruleset: (json.pyRuleset as string) || undefined,
      version: (json.pyRulesetVersion as string) || undefined,
      logicSummary,
    };

    return { symbol, dependencies };
  }

  // ─── Data Rules ───────────────────────────────────────────────────────

  public parseMapValue(json: Record<string, unknown>): MapValue {
    return parseMapValue(json);
  }

  public parseFieldValue(json: Record<string, unknown>): FieldValue {
    return parseFieldValue(json);
  }

  // ─── Process Rules ────────────────────────────────────────────────────

  public parseCaseType(json: Record<string, unknown>): CaseType {
    return parseCaseType(json);
  }

  public parseStage(json: Record<string, unknown>): Stage {
    return parseStage(json);
  }

  public parseServiceLevel(json: Record<string, unknown>): ServiceLevel {
    return parseServiceLevel(json);
  }

  // ─── Circumstance / Agent Rules ───────────────────────────────────────

  public parseCircumstance(json: Record<string, unknown>): Circumstance {
    return parseCircumstance(json);
  }

  public parseAgent(json: Record<string, unknown>): Agent {
    return parseAgent(json);
  }

  public parseQueueProcessor(json: Record<string, unknown>): QueueProcessor {
    return parseQueueProcessor(json);
  }

  // ─── Report / Correspondence / File / Edit / Test / Utility / Other ───

  public parseReportDef(json: Record<string, unknown>): ReportDef {
    return parseReportDef(json);
  }

  public parseCorrespondence(json: Record<string, unknown>): Correspondence {
    return parseCorrespondence(json);
  }

  public parseFileBinary(json: Record<string, unknown>): FileBinary {
    return parseFileBinary(json);
  }

  public parseFileText(json: Record<string, unknown>): FileText {
    return parseFileText(json);
  }

  public parseEditValidate(json: Record<string, unknown>): EditValidate {
    return parseEditValidate(json);
  }

  public parseAutoTest(json: Record<string, unknown>): AutoTest {
    return parseAutoTest(json);
  }

  public parseUtility(json: Record<string, unknown>): Utility {
    return parseUtility(json);
  }

  public parseMessage(json: Record<string, unknown>): Message {
    return parseMessage(json);
  }

  public parseStream(json: Record<string, unknown>): Stream {
    return parseStream(json);
  }

  public parseShortcut(json: Record<string, unknown>): Shortcut {
    return parseShortcut(json);
  }
}
