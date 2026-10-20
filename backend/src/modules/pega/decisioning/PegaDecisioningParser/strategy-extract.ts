/**
 * Strategy component/config/dependency extraction for PegaDecisioningParser.
 * Extracted (BR-18) — pure functions; no behavior change.
 */

import type { UnresolvedDependency } from '../../models.js';
import type { Strategy, StrategyComponent, ComponentType } from '../PegaDecisioningTypes.js';

export function parseComponents(json: Record<string, unknown>): StrategyComponent[] {
  const components: StrategyComponent[] = [];
  const rawComponents = Array.isArray(json.pyComponents) ? json.pyComponents : [];

  for (const raw of rawComponents) {
    if (!raw || typeof raw !== 'object') continue;
    const comp = raw as Record<string, unknown>;
    components.push({
      pyName: (comp.pyName as string) || 'UnnamedComponent',
      pyComponentType: normalizeComponentType(comp.pyComponentType as string | undefined),
      config: extractConfig(comp),
    });
  }

  const rawSegments = Array.isArray(json.pySegments) ? json.pySegments : [];
  for (const raw of rawSegments) {
    if (!raw || typeof raw !== 'object') continue;
    const seg = raw as Record<string, unknown>;
    components.push({
      pyName: (seg.pyName as string) || 'UnnamedSegment',
      pyComponentType: 'Segment',
      config: extractConfig(seg),
    });
  }

  return components;
}

export function normalizeComponentType(raw: string | undefined): ComponentType {
  if (!raw) return 'Segment';
  const upper = raw.charAt(0).toUpperCase() + raw.slice(1);
  const validTypes: ComponentType[] = ['Segment', 'Filter', 'Rank', 'SetPriority', 'NBA', 'Offer', 'Proposition', 'Treatment'];
  if (validTypes.includes(upper as ComponentType)) {
    return upper as ComponentType;
  }
  return 'Segment';
}

export function extractConfig(comp: Record<string, unknown>): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(comp)) {
    if (key === 'pyName' || key === 'pyComponentType') continue;
    if (key.startsWith('px') || key.startsWith('pz')) continue;
    config[key] = value;
  }
  return config;
}

export function buildLogicSummary(strategy: Strategy): string | undefined {
  if (strategy.components.length === 0) return undefined;
  const summary = strategy.components.map((c) => `${c.pyComponentType}:${c.pyName}`).join(' -> ');
  return `Strategy[${strategy.pyName}] ${summary}`;
}

export function extractDependencies(strategy: Strategy, json: Record<string, unknown>): UnresolvedDependency[] {
  const deps: UnresolvedDependency[] = [];

  for (const comp of strategy.components) {
    const ref = comp.config.pyRef || comp.config.pyWhenRef || comp.config.pyTreatment;
    if (typeof ref === 'string' && ref.trim()) {
      deps.push({
        ruleType: 'Rule-Decision-Strategy',
        className: (json.pyClassName as string) || '@baseclass',
        ruleName: ref.trim(),
      });
    }
  }

  const refs = Array.isArray(json.pyRuleReferences) ? json.pyRuleReferences : [];
  for (const ref of refs) {
    if (!ref || typeof ref !== 'object') continue;
    const r = ref as Record<string, unknown>;
    const refName = r.pyRuleName as string | undefined;
    const refClass = r.pxRuleClassName as string | undefined;
    if (refName && typeof refName === 'string' && refName.trim()) {
      deps.push({
        ruleType: refClass || 'Rule-Decision-',
        className: (json.pyClassName as string) || '@baseclass',
        ruleName: refName.trim(),
      });
    }
  }

  return deps;
}
