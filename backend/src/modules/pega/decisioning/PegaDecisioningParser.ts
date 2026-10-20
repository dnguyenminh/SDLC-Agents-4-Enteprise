import type { IPegaRuleParserStrategy, ParseResult } from '../strategies/IPegaRuleParserStrategy.js';
import type { UnresolvedDependency } from '../models.js';
import type {
  Strategy,
  Condition,
  NBA,
  Offer,
  Proposition,
  Treatment,
} from './PegaDecisioningTypes.js';
import type { DecisionOperator } from '../decision/PegaEvaluationResult.js';
import {
  buildLogicSummary,
  extractDependencies,
  parseComponents,
} from './PegaDecisioningParser/strategy-extract.js';

const DECISION_PREFIXES = [
  'Rule-Decision-',
  'Rule-Strategy-',
];

export class PegaDecisioningParser implements IPegaRuleParserStrategy {
  public supports(pxObjClass: string): boolean {
    if (pxObjClass === 'Rule-Decision-') return false;
    return DECISION_PREFIXES.some((p) => pxObjClass.startsWith(p));
  }

  public parse(json: Record<string, unknown>): ParseResult {
    const pxObjClass = (json.pxObjClass as string) || '';
    const className = (json.pyClassName as string) || (json.className as string) || '@baseclass';

    const strategy = this.parseStrategy(json);

    const symbol = {
      fqn: `${pxObjClass}:${className}:${strategy.pyName}`,
      name: strategy.pyName,
      className,
      ruleType: pxObjClass,
      isRule: pxObjClass.startsWith('Rule-'),
      ruleset: (json.pyRuleset as string) || undefined,
      version: (json.pyRulesetVersion as string) || undefined,
      logicSummary: buildLogicSummary(strategy),
    };

    const dependencies: UnresolvedDependency[] = extractDependencies(strategy, json);

    return { symbol, dependencies };
  }

  public parseStrategy(json: Record<string, unknown>): Strategy {
    const name = (json.pyName as string) || (json.pyPurpose as string) || (json.pyLabel as string) || 'UnnamedStrategy';

    return {
      pyName: name,
      components: parseComponents(json),
      pyDescription: (json.pyDescription as string) || undefined,
      pyType: (json.pxObjClass as string) || 'Strategy',
    };
  }

  public parseCondition(raw: Record<string, unknown>): Condition {
    const expr = (raw.pyExpression as string) || (raw.pyWhen as string);
    const opRaw = (raw.operator as string) || '';
    const op = this.normalizeOperator(opRaw);

    return {
      pyName: (raw.pyName as string) || 'UnnamedCondition',
      pyType: (raw.pyType as 'Segment' | 'Filter' | 'Eligibility') || 'Filter',
      pyExpression: expr || undefined,
      pyWhen: (raw.pyWhen as string) || undefined,
      operator: op || undefined,
      field: (raw.field as string) || (raw.pyField as string) || undefined,
      value: raw.value ?? raw.pyValue ?? undefined,
    };
  }

  public parseNBA(raw: Record<string, unknown>): NBA {
    const nba: NBA = {
      pyName: (raw.pyName as string) || 'UnnamedNBA',
      pyIssue: (raw.pyIssue as string) || undefined,
      pyGroup: (raw.pyGroup as string) || undefined,
      pyActive: raw.pyActive !== undefined ? Boolean(raw.pyActive) : undefined,
      pyStartDate: (raw.pyStartDate as string) || (raw.pyStartDate as string) || undefined,
      pyEndDate: (raw.pyEndDate as string) || (raw.pyEndDate as string) || undefined,
    };

    if (raw.proposition || raw.pyProposition) {
      const propRaw = (raw.proposition || raw.pyProposition) as Record<string, unknown>;
      nba.proposition = this.parseProposition(propRaw);
    }

    if (raw.offer || raw.pyOffer) {
      const offerRaw = (raw.offer || raw.pyOffer) as Record<string, unknown>;
      nba.offer = this.parseOffer(offerRaw);
    }

    return nba;
  }

  public parseOffer(raw: Record<string, unknown>): Offer {
    return {
      pyName: (raw.pyName as string) || 'UnnamedOffer',
      pyLabel: (raw.pyLabel as string) || undefined,
      pyIcon: (raw.pyIcon as string) || undefined,
      pyDescription: (raw.pyDescription as string) || undefined,
      pyTreatment: (raw.pyTreatment as string) || undefined,
      pyDisplayOrder: raw.pyDisplayOrder !== undefined ? Number(raw.pyDisplayOrder) : undefined,
      treatment: raw.treatment ? this.parseTreatment(raw.treatment as Record<string, unknown>) : undefined,
    };
  }

  public parseProposition(raw: Record<string, unknown>): Proposition {
    return {
      pyName: (raw.pyName as string) || 'UnnamedProposition',
      pyGroup: (raw.pyGroup as string) || undefined,
      pyTreatment: (raw.pyTreatment as string) || undefined,
      pyWeight: raw.pyWeight !== undefined ? Number(raw.pyWeight) : undefined,
      pyStartDate: (raw.pyStartDate as string) || undefined,
      pyEndDate: (raw.pyEndDate as string) || undefined,
      offer: raw.offer ? this.parseOffer(raw.offer as Record<string, unknown>) : undefined,
    };
  }

  public parseTreatment(raw: Record<string, unknown>): Treatment {
    return {
      pyName: (raw.pyName as string) || 'UnnamedTreatment',
      pyContent: (raw.pyContent as string) || undefined,
      pyChannel: (raw.pyChannel as string) || undefined,
      pyDisplayFormat: (raw.pyDisplayFormat as string) || undefined,
    };
  }

  private normalizeOperator(raw: string): DecisionOperator | undefined {
    const trimmed = raw.trim().toLowerCase();
    const map: Record<string, DecisionOperator> = {
      equals: 'EQUALS',
      equal: 'EQUALS',
      '=': 'EQUALS',
      notequals: 'NOT_EQUALS',
      '!=': 'NOT_EQUALS',
      '<>': 'NOT_EQUALS',
      greater: 'GREATER',
      '>': 'GREATER',
      greaterequals: 'GREATER_EQUALS',
      '>=': 'GREATER_EQUALS',
      less: 'LESS',
      '<': 'LESS',
      lessequals: 'LESS_EQUALS',
      '<=': 'LESS_EQUALS',
      in: 'IN',
      notin: 'NOT_IN',
      isnull: 'IS_NULL',
      isblank: 'IS_BLANK',
      custom: 'CUSTOM',
    };
    if (map[trimmed]) return map[trimmed];
    if (trimmed.startsWith('custom') || trimmed.startsWith('@')) return 'CUSTOM';
    return undefined;
  }
}
