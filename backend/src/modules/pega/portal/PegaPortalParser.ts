/**
 * PegaPortalParser — Parses Pega UI/Portal Rules into domain types compatible with PegaSectionRenderer.
 * BR-18 facade — layout/field converters live in ./PegaPortalParser/converters.ts,
 * dependency extraction in ./PegaPortalParser/dependencies.ts.
 */

import type { IPegaRuleParserStrategy, ParseResult } from '../strategies/IPegaRuleParserStrategy.js';
import type { PegaSection } from '../ui/PegaUITypes.js';
import {
  type Section,
  type Harness,
  type FlowAction,
  type Portal,
  type Skin,
  type Navigation,
  type NavMenuItem,
  type SectionType,
  PORTAL_RULE_CLASSES,
} from './PegaPortalTypes.js';
import {
  asStringArray,
  convertLayout,
  inferSectionType,
  parseFields,
  portalFieldToPegaField,
  portalLayoutToPegaLayout,
} from './PegaPortalParser/converters.js';
import { extractDependencies } from './PegaPortalParser/dependencies.js';

export class PegaPortalParser implements IPegaRuleParserStrategy {
  public supports(pxObjClass: string): boolean {
    return PORTAL_RULE_CLASSES.includes(pxObjClass);
  }

  public parse(json: Record<string, unknown>): ParseResult {
    const pxObjClass = (json.pxObjClass as string) || '';
    const className = (json.pyClassName as string) || (json.className as string) || '@baseclass';
    const name = (json.pyRuleName as string) || (json.pyLabel as string) || (json.pyName as string) || 'UnnamedPortal';
    const fqn = `${pxObjClass}:${className}:${name}`;

    const symbol = {
      fqn,
      name,
      className,
      ruleType: pxObjClass,
      isRule: pxObjClass.startsWith('Rule-'),
      ruleset: (json.pyRuleset as string) || undefined,
      version: (json.pyRulesetVersion as string) || undefined,
    };

    const dependencies = extractDependencies(json, pxObjClass);
    return { symbol, dependencies };
  }

  public parseSection(json: Record<string, unknown>): Section {
    const raw = json.pyLayouts as unknown[];
    return {
      pyName: (json.pyName as string) || (json.pyRuleName as string) || 'Unnamed',
      pyType: (json.pyType as SectionType) || inferSectionType(json),
      pyLayouts: Array.isArray(raw) ? raw.map((l) => convertLayout(l as Record<string, unknown>)) : [],
      pyFields: parseFields(json.pyFields as unknown[]),
      pyWhen: (json.pyWhen as string) || undefined,
    };
  }

  public sectionToPegaFormat(section: Section): PegaSection {
    return {
      name: section.pyName,
      layouts: section.pyLayouts.map((l) => portalLayoutToPegaLayout(l)),
      fields: section.pyFields.map((f) => portalFieldToPegaField(f)),
    };
  }

  public parseHarness(json: Record<string, unknown>): Harness {
    const parseSubSection = (key: string): Section | undefined => {
      const raw = json[key];
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return this.parseSection(raw as Record<string, unknown>);
      }
      return undefined;
    };

    return {
      pyName: (json.pyName as string) || (json.pyRuleName as string) || 'UnnamedHarness',
      pyType: 'Harness',
      pyHeader: parseSubSection('pyHeader'),
      pyContent: parseSubSection('pyContent'),
      pyFooter: parseSubSection('pyFooter'),
      pyPortal: (json.pyPortal as string) || undefined,
      pySkin: (json.pySkin as string) || undefined,
    };
  }

  public parseFlowAction(json: Record<string, unknown>): FlowAction {
    const raw = json.pyLayouts as unknown[];
    return {
      pyName: (json.pyName as string) || (json.pyRuleName as string) || 'UnnamedFlowAction',
      pyType: 'FlowAction',
      pyLayouts: Array.isArray(raw) ? raw.map((l) => convertLayout(l as Record<string, unknown>)) : [],
      pyFields: parseFields(json.pyFields as unknown[]),
    };
  }

  public parsePortal(json: Record<string, unknown>): Portal {
    return {
      pyName: (json.pyName as string) || (json.pyRuleName as string) || 'UnnamedPortal',
      pyLabel: (json.pyLabel as string) || undefined,
      pyPortals: asStringArray(json.pyPortals),
      pySkins: asStringArray(json.pySkins),
    };
  }

  public parseSkin(json: Record<string, unknown>): Skin {
    return {
      pyName: (json.pyName as string) || (json.pyRuleName as string) || 'UnnamedSkin',
      pyColors: json.pyColors ? { ...json.pyColors as Record<string, string> } : undefined,
      pyBackground: (json.pyBackground as string) || undefined,
      pyFonts: json.pyFonts ? { ...json.pyFonts as Record<string, string> } : undefined,
    };
  }

  public parseNavigation(json: Record<string, unknown>): Navigation {
    const raw = json.pyMenuItems as unknown[];
    return {
      pyName: (json.pyName as string) || (json.pyRuleName as string) || 'UnnamedNavigation',
      pyMenuItems: Array.isArray(raw) ? raw.map((m) => parseNavMenuItem(m as Record<string, unknown>)) : [],
    };
  }
}

function parseNavMenuItem(raw: Record<string, unknown>): NavMenuItem {
  const childrenRaw = raw.children as unknown[];
  return {
    label: (raw.label as string) || (raw.pyLabel as string) || '',
    url: (raw.url as string) || undefined,
    icon: (raw.icon as string) || undefined,
    children: Array.isArray(childrenRaw)
      ? childrenRaw.map((c) => parseNavMenuItem(c as Record<string, unknown>))
      : undefined,
    when: (raw.when as string) || undefined,
  };
}
