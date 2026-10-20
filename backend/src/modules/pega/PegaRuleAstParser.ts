import type { PegaRuleAst } from './PegaRuleAst.js';
import { extractAstName, extractReferences } from './ast-references.js';
import {
  buildActivity, buildDataTransform, buildFlow, buildFlowAction, buildClass,
  buildProperty, buildWhen, buildDeclare, buildDecision, buildConnector,
  buildService, buildUi, buildParse, buildAccess,
} from './ast-builders.js';
import {
  buildAsync, buildTest, buildFile, buildAdmin, buildUtility,
  buildEdit, buildCorrespondence, buildSurvey, buildGeneric,
} from './ast-builders-extra.js';
import { toPromptContext } from './ast-prompt.js';

type AstBuilder = (json: Record<string, unknown>) => { properties: Record<string, unknown>; children: import('./PegaRuleAst.js').AstNode[] };

/**
 * PegaRuleAstParser — facade (BR-18): parse() + builder selection live here;
 * builders, reference extraction and prompt rendering live in sibling modules.
 */
export class PegaRuleAstParser {
  public parse(json: Record<string, unknown>): PegaRuleAst {
    const pxObjClass = (json.pxObjClass as string) || 'Rule-Obj-Activity';
    const name = extractAstName(json);
    const className = (json.pyClassName as string) || '';
    // Read both export casings: pyRuleSet (actual export) and pyRuleset (fixtures).
    const ruleset = (json.pyRuleSet as string) || (json.pyRuleset as string) || undefined;
    const version = (json.pyRuleSetVersion as string) || (json.pyRulesetVersion as string) || undefined;
    const label = (json.pyLabel as string) || undefined;

    const builder = this.getBuilder(pxObjClass);
    const { properties, children } = builder(json);

    const references = extractReferences(json, className, pxObjClass);

    return {
      astVersion: '1.0',
      ruleType: pxObjClass,
      name,
      className,
      ruleset,
      rulesetVersion: version,
      label,
      properties,
      children,
      references,
    };
  }

  private getBuilder(
    pxObjClass: string,
  ): AstBuilder {
    if (pxObjClass === 'Rule-Obj-Activity') return buildActivity;
    if (pxObjClass === 'Rule-Obj-Model') return buildDataTransform;
    if (pxObjClass === 'Rule-Obj-Flow') return buildFlow;
    if (pxObjClass === 'Rule-Obj-FlowAction') return buildFlowAction;
    if (pxObjClass === 'Rule-Obj-Class') return buildClass;
    if (pxObjClass === 'Rule-Obj-Property') return buildProperty;
    if (pxObjClass === 'Rule-Obj-When') return buildWhen;
    if (pxObjClass === 'Rule-Declare-DecisionTable' || pxObjClass === 'Rule-Declare-DecisionTree') return buildDecision;
    if (pxObjClass.startsWith('Rule-Declare-')) return buildDeclare;
    if (pxObjClass.startsWith('Rule-Decision-')) return buildDecision;
    if (pxObjClass.startsWith('Rule-Connect-')) return buildConnector;
    if (pxObjClass.startsWith('Rule-Service-')) return buildService;
    if (pxObjClass.startsWith('Rule-HTML-') || pxObjClass.startsWith('Rule-UI-')) return buildUi;
    if (pxObjClass.startsWith('Rule-Parse-') || pxObjClass === 'Rule-Map-Structured') return buildParse;
    if (pxObjClass.startsWith('Rule-Access-')) return buildAccess;
    if (pxObjClass.startsWith('Rule-Async-') || pxObjClass.startsWith('Rule-Agent-')) return buildAsync;
    if (pxObjClass.startsWith('Rule-Test-')) return buildTest;
    if (pxObjClass.startsWith('Rule-File-')) return buildFile;
    if (pxObjClass.startsWith('Rule-Admin-') || pxObjClass.startsWith('Rule-Security')) return buildAdmin;
    if (pxObjClass.startsWith('Rule-Utility-') || pxObjClass.startsWith('Rule-Alias-')) return buildUtility;
    if (pxObjClass.startsWith('Rule-Edit-')) return buildEdit;
    if (pxObjClass.startsWith('Rule-Corr-')) return buildCorrespondence;
    if (pxObjClass.startsWith('Rule-PegaQ-')) return buildSurvey;
    return buildGeneric;
  }

  public toPromptContext(ast: PegaRuleAst, maxDepth?: number): string {
    return toPromptContext(ast, maxDepth);
  }
}
