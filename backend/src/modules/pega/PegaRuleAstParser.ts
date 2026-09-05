import type { PegaRuleAst, AstNode, AstReference } from './PegaRuleAst.js';
import { SYSTEM_FIELD_PREFIXES, SYSTEM_FIELDS } from './PegaRuleAst.js';
import { isExpressionField, renderFieldExpression } from './PegaExprAnnotator.js';

/**
 * Render a property value for pseudo-code. Expression-bearing fields (SA4E-236/GD4) are parsed
 * by the ANTLR parser and re-emitted canonically; everything else is stringified as before.
 * @param key Property name
 * @param value Property value
 */
function renderPropertyValue(key: string, value: unknown): string {
  if (isExpressionField(key) && typeof value === 'string') {
    return renderFieldExpression(value);
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

const REFERENCE_FIELDS = new Set([
  'pyClassName', 'pySuperClass', 'pyPatternParent', 'pyDerivesFrom',
  'pyRuleName', 'pyModelName', 'pyActivityName', 'pyTransformName',
  'pyWhenCondition', 'pyOnChangeTrigger',
]);

export class PegaRuleAstParser {
  public parse(json: Record<string, unknown>): PegaRuleAst {
    const pxObjClass = (json.pxObjClass as string) || 'Rule-Obj-Activity';
    const name = this.extractName(pxObjClass, json);
    const className = (json.pyClassName as string) || '';
    // Read both export casings: pyRuleSet (actual export) and pyRuleset (fixtures).
    const ruleset = (json.pyRuleSet as string) || (json.pyRuleset as string) || undefined;
    const version = (json.pyRuleSetVersion as string) || (json.pyRulesetVersion as string) || undefined;
    const label = (json.pyLabel as string) || undefined;

    const builder = this.getBuilder(pxObjClass);
    const { properties, children } = builder(json);

    const references = this.extractReferences(json, className, pxObjClass);

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

  private extractName(pxObjClass: string, json: Record<string, unknown>): string {
    return (json.pyRuleName as string)
      || (json.pyActivityName as string)
      || (json.pyModelName as string)
      || (json.pyFlowName as string)
      || (json.pyLabel as string)
      || (json.pyClassName as string)
      || '';
  }

  private extractReferences(
    json: Record<string, unknown>,
    defaultClass: string,
    ruleType: string,
  ): AstReference[] {
    const refs: AstReference[] = [];
    const visited = new Set<string>();

    const addRef = (rt: string, cls: string, name: string, role: string) => {
      const key = `${rt}:${cls}:${name}`;
      if (visited.has(key)) return;
      visited.add(key);
      refs.push({ ruleType: rt, className: cls, ruleName: name, role });
    };

    for (const [key, val] of Object.entries(json)) {
      if (!key.startsWith('py') && !key.startsWith('px')) continue;
      if (SYSTEM_FIELDS.has(key)) continue;
      if (typeof val !== 'string' || !val) continue;

      if (REFERENCE_FIELDS.has(key)) {
        const cls = key === 'pyClassName' ? '@baseclass' : (json.pyClassName as string) || defaultClass;
        const rt = key === 'pySuperClass' || key === 'pyPatternParent' || key === 'pyDerivesFrom' || key === 'pyClassName'
          ? 'Rule-Obj-Class' : ruleType;
        addRef(rt, cls, val, key);
        continue;
      }

      if (key === 'pyMethodParameters' && val.includes('.')) {
        const dot = val.lastIndexOf('.');
        addRef('Rule-Obj-Activity', val.substring(0, dot), val.substring(dot + 1), 'call');
        continue;
      }
      if (key === 'pyMethodParameters') {
        addRef('Rule-Obj-Activity', defaultClass, val, 'call');
      }
    }

    const steps = json.steps || json.pySteps;
    if (Array.isArray(steps)) {
      for (const s of steps) {
        if (typeof s !== 'object' || !s) continue;
        const step = s as Record<string, unknown>;
        const method = step.pyMethod as string || '';
        const params = step.pyMethodParameters as string || '';
        if ((method === 'Call' || method === 'Branch') && params) {
          const dot = params.lastIndexOf('.');
          addRef('Rule-Obj-Activity', dot >= 0 ? params.substring(0, dot) : defaultClass, dot >= 0 ? params.substring(dot + 1) : params, 'calls');
        }
        if (step.pyWhenCondition) {
          addRef('Rule-Obj-When', defaultClass, step.pyWhenCondition as string, 'guards');
        }
        if (step.pyFlowActionName) {
          addRef('Rule-Obj-FlowAction', defaultClass, step.pyFlowActionName as string, 'flow-action');
        }
      }
    }

    const actions = json.pyActions;
    if (Array.isArray(actions)) {
      for (const a of actions) {
        if (typeof a !== 'object' || !a) continue;
        const act = a as Record<string, unknown>;
        if (act.pyTransformName) addRef('Rule-Obj-Model', defaultClass, act.pyTransformName as string, 'applies-transform');
        if (act.pyWhenCondition) addRef('Rule-Obj-When', defaultClass, act.pyWhenCondition as string, 'guards');
        if (act.pyTarget && (act.pyActionType as string || '').includes('Transform')) {
          addRef('Rule-Obj-Model', defaultClass, act.pyTarget as string, 'applies-transform');
        }
      }
    }

    const pxRuleReferences = json.pxRuleReferences;
    if (Array.isArray(pxRuleReferences)) {
      for (const ref of pxRuleReferences) {
        if (typeof ref !== 'object' || !ref) continue;
        const r = ref as Record<string, unknown>;
        const refType = (r.pxRuleObjClass || r.pxRuleClassName) as string;
        const refName = r.pyRuleName as string;
        const refClass = r.pxRuleClassName as string || defaultClass;
        if (refType && refName) addRef(refType, refClass || defaultClass, refName, 'references');
      }
    }

    const shapes = json.pyShapes || json.shapes;
    if (Array.isArray(shapes)) {
      for (const sh of shapes) {
        if (typeof sh !== 'object' || !sh) continue;
        const shape = sh as Record<string, unknown>;
        if (shape.pyFlowActionName) {
          addRef('Rule-Obj-FlowAction', defaultClass, shape.pyFlowActionName as string, 'flow-action');
        }
        if (shape.pyWhenCondition) {
          addRef('Rule-Obj-When', defaultClass, shape.pyWhenCondition as string, 'guards');
        }
        if (shape.pyClassName && shape.pyClassName !== defaultClass) {
          addRef('Rule-Obj-Class', '@baseclass', shape.pyClassName as string, 'references');
        }
      }
    }

    return refs;
  }

  private getBuilder(
    pxObjClass: string,
  ): (json: Record<string, unknown>) => { properties: Record<string, unknown>; children: AstNode[] } {
    if (pxObjClass === 'Rule-Obj-Activity') return this.buildActivity.bind(this);
    if (pxObjClass === 'Rule-Obj-Model') return this.buildDataTransform.bind(this);
    if (pxObjClass === 'Rule-Obj-Flow') return this.buildFlow.bind(this);
    if (pxObjClass === 'Rule-Obj-FlowAction') return this.buildFlowAction.bind(this);
    if (pxObjClass === 'Rule-Obj-Class') return this.buildClass.bind(this);
    if (pxObjClass === 'Rule-Obj-Property') return this.buildProperty.bind(this);
    if (pxObjClass === 'Rule-Obj-When') return this.buildWhen.bind(this);
    if (pxObjClass === 'Rule-Declare-DecisionTable' || pxObjClass === 'Rule-Declare-DecisionTree') return this.buildDecision.bind(this);
    if (pxObjClass.startsWith('Rule-Declare-')) return this.buildDeclare.bind(this);
    if (pxObjClass.startsWith('Rule-Decision-')) return this.buildDecision.bind(this);
    if (pxObjClass.startsWith('Rule-Connect-')) return this.buildConnector.bind(this);
    if (pxObjClass.startsWith('Rule-Service-')) return this.buildService.bind(this);
    if (pxObjClass.startsWith('Rule-HTML-') || pxObjClass.startsWith('Rule-UI-')) return this.buildUi.bind(this);
    if (pxObjClass.startsWith('Rule-Parse-') || pxObjClass === 'Rule-Map-Structured') return this.buildParse.bind(this);
    if (pxObjClass.startsWith('Rule-Access-')) return this.buildAccess.bind(this);
    if (pxObjClass.startsWith('Rule-Async-') || pxObjClass.startsWith('Rule-Agent-')) return this.buildAsync.bind(this);
    if (pxObjClass.startsWith('Rule-Test-')) return this.buildTest.bind(this);
    if (pxObjClass.startsWith('Rule-File-')) return this.buildFile.bind(this);
    if (pxObjClass.startsWith('Rule-Admin-') || pxObjClass.startsWith('Rule-Security')) return this.buildAdmin.bind(this);
    if (pxObjClass.startsWith('Rule-Utility-') || pxObjClass.startsWith('Rule-Alias-')) return this.buildUtility.bind(this);
    if (pxObjClass.startsWith('Rule-Edit-')) return this.buildEdit.bind(this);
    if (pxObjClass.startsWith('Rule-Corr-')) return this.buildCorrespondence.bind(this);
    if (pxObjClass.startsWith('Rule-PegaQ-')) return this.buildSurvey.bind(this);
    return this.buildGeneric.bind(this);
  }

  private stripSystemFields(json: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(json)) {
      if (SYSTEM_FIELDS.has(key)) continue;
      if (SYSTEM_FIELD_PREFIXES.some(p => key.startsWith(p))) continue;
      if (key.startsWith('px') && key !== 'pxObjClass') continue;
      if (key.startsWith('pz')) continue;
      if (typeof val === 'function') continue;
      if (Array.isArray(val) && val.length === 0 && key.endsWith('List')) continue;
      if (val === '' || val === null || val === undefined) continue;
      if (key === 'pyLinks' || key === 'pyLockDefList' || key === 'pyOtherJavaGenerators') continue;
      if (key === 'pyValidRuleSets' || key === 'pxClassSQL' || key === 'pxInternalClassSQL') continue;
      result[key] = val;
    }
    return result;
  }

  private buildActivity(json: Record<string, unknown>): { properties: Record<string, unknown>; children: AstNode[] } {
    const props = this.stripSystemFields(json);
    delete props.steps;
    const steps = Array.isArray(json.steps) ? json.steps : [];
    const children: AstNode[] = steps.map((s: unknown, _i: number) => {
      const step = s as Record<string, unknown>;
      return {
        type: 'Step',
        properties: this.stripSystemFields(step),
        children: [],
      };
    });
    return { properties: props, children };
  }

  private buildDataTransform(json: Record<string, unknown>): { properties: Record<string, unknown>; children: AstNode[] } {
    const props = this.stripSystemFields(json);
    delete props.pyActions;
    const actions = Array.isArray(json.pyActions) ? json.pyActions : [];
    const children: AstNode[] = actions.map((a: unknown) => {
      const act = a as Record<string, unknown>;
      return {
        type: 'Action',
        properties: this.stripSystemFields(act),
        children: [],
      };
    });
    return { properties: props, children };
  }

  private buildFlow(json: Record<string, unknown>): { properties: Record<string, unknown>; children: AstNode[] } {
    const props = this.stripSystemFields(json);
    delete props.pyShapes; delete props.shapes;
    const shapes = Array.isArray(json.pyShapes) ? json.pyShapes : Array.isArray(json.shapes) ? json.shapes : [];
    const children: AstNode[] = shapes.map((s: unknown) => {
      const shape = s as Record<string, unknown>;
      return {
        type: (shape.pyShapeType as string) || 'Shape',
        properties: this.stripSystemFields(shape),
        children: [],
      };
    });
    return { properties: props, children };
  }

  private buildFlowAction(json: Record<string, unknown>): { properties: Record<string, unknown>; children: AstNode[] } {
    const props = this.stripSystemFields(json);
    return { properties: props, children: [] };
  }

  private buildClass(json: Record<string, unknown>): { properties: Record<string, unknown>; children: AstNode[] } {
    const props = this.stripSystemFields(json);
    delete props.pxRuleReferences;
    const refs = Array.isArray(json.pxRuleReferences) ? json.pxRuleReferences : [];
    const children: AstNode[] = refs.map((r: unknown) => ({
      type: 'RuleReference',
      properties: this.stripSystemFields(r as Record<string, unknown>),
      children: [],
    }));
    return { properties: props, children };
  }

  private buildProperty(json: Record<string, unknown>): { properties: Record<string, unknown>; children: AstNode[] } {
    return { properties: this.stripSystemFields(json), children: [] };
  }

  private buildWhen(json: Record<string, unknown>): { properties: Record<string, unknown>; children: AstNode[] } {
    return { properties: this.stripSystemFields(json), children: [] };
  }

  private buildDeclare(json: Record<string, unknown>): { properties: Record<string, unknown>; children: AstNode[] } {
    const props = this.stripSystemFields(json);
    const children: AstNode[] = [];

    if (json.pxResults) {
      const results = Array.isArray(json.pxResults) ? json.pxResults : [];
      for (const r of results) {
        children.push({ type: 'Result', properties: this.stripSystemFields(r as Record<string, unknown>), children: [] });
      }
    }
    if (json.pyPages) {
      const pages = Array.isArray(json.pyPages) ? json.pyPages : [];
      for (const p of pages) {
        children.push({ type: 'Page', properties: this.stripSystemFields(p as Record<string, unknown>), children: [] });
      }
    }
    return { properties: props, children };
  }

  private buildDecision(json: Record<string, unknown>): { properties: Record<string, unknown>; children: AstNode[] } {
    const props = this.stripSystemFields(json);
    const children: AstNode[] = [];

    const rows = json.pyDecisionTableRows || json.pyRows;
    if (Array.isArray(rows)) {
      for (const r of rows) {
        children.push({ type: 'DecisionRow', properties: this.stripSystemFields(r as Record<string, unknown>), children: [] });
      }
    }

    const strategies = json.pyStrategyComponents || json.pyComponents;
    if (Array.isArray(strategies)) {
      for (const s of strategies) {
        children.push({ type: 'StrategyComponent', properties: this.stripSystemFields(s as Record<string, unknown>), children: [] });
      }
    }
    return { properties: props, children };
  }

  private buildConnector(json: Record<string, unknown>): { properties: Record<string, unknown>; children: AstNode[] } {
    const props = this.stripSystemFields(json);
    delete props.pyHeaders;
    if (Array.isArray(json.pyHeaders)) {
      const hdrs: AstNode[] = (json.pyHeaders as any[]).map(h => ({
        type: 'Header', properties: this.stripSystemFields(h), children: [],
      }));
      return { properties: props, children: hdrs };
    }
    return { properties: props, children: [] };
  }

  private buildService(json: Record<string, unknown>): { properties: Record<string, unknown>; children: AstNode[] } {
    const props = this.stripSystemFields(json);
    return { properties: props, children: [] };
  }

  private buildUi(json: Record<string, unknown>): { properties: Record<string, unknown>; children: AstNode[] } {
    const props = this.stripSystemFields(json);
    const children: AstNode[] = [];
    const layouts = json.pyLayouts || json.pxLayouts;
    if (Array.isArray(layouts)) {
      for (const l of layouts) {
        children.push({ type: 'Layout', properties: this.stripSystemFields(l as Record<string, unknown>), children: [] });
      }
    }
    return { properties: props, children };
  }

  private buildParse(json: Record<string, unknown>): { properties: Record<string, unknown>; children: AstNode[] } {
    const props = this.stripSystemFields(json);
    const children: AstNode[] = [];
    const parts = json.pyParseRules || json.pyParts;
    if (Array.isArray(parts)) {
      for (const p of parts) {
        children.push({ type: 'ParsePart', properties: this.stripSystemFields(p as Record<string, unknown>), children: [] });
      }
    }
    return { properties: props, children };
  }

  private buildAccess(json: Record<string, unknown>): { properties: Record<string, unknown>; children: AstNode[] } {
    const props = this.stripSystemFields(json);
    const children: AstNode[] = [];
    const ops = json.pyOperations || json.pyAccessPrivileges;
    if (Array.isArray(ops)) {
      for (const o of ops) {
        children.push({ type: 'Permission', properties: this.stripSystemFields(o as Record<string, unknown>), children: [] });
      }
    }
    return { properties: props, children };
  }

  private buildAsync(json: Record<string, unknown>): { properties: Record<string, unknown>; children: AstNode[] } {
    const props = this.stripSystemFields(json);
    return { properties: props, children: [] };
  }

  private buildTest(json: Record<string, unknown>): { properties: Record<string, unknown>; children: AstNode[] } {
    const props = this.stripSystemFields(json);
    const children: AstNode[] = [];
    const cases = json.pyExpectations || json.pyAsserts || json.pyTestCases;
    if (Array.isArray(cases)) {
      for (const c of cases) {
        children.push({ type: 'Assertion', properties: this.stripSystemFields(c as Record<string, unknown>), children: [] });
      }
    }
    return { properties: props, children };
  }

  private buildFile(json: Record<string, unknown>): { properties: Record<string, unknown>; children: AstNode[] } {
    const props = this.stripSystemFields(json);
    return { properties: props, children: [] };
  }

  private buildAdmin(json: Record<string, unknown>): { properties: Record<string, unknown>; children: AstNode[] } {
    return { properties: this.stripSystemFields(json), children: [] };
  }

  private buildUtility(json: Record<string, unknown>): { properties: Record<string, unknown>; children: AstNode[] } {
    const props = this.stripSystemFields(json);
    const children: AstNode[] = [];
    const params = json.pyParameters || json.pyInputParams;
    if (Array.isArray(params)) {
      for (const p of params) {
        children.push({ type: 'Parameter', properties: this.stripSystemFields(p as Record<string, unknown>), children: [] });
      }
    }
    return { properties: props, children };
  }

  private buildEdit(json: Record<string, unknown>): { properties: Record<string, unknown>; children: AstNode[] } {
    return { properties: this.stripSystemFields(json), children: [] };
  }

  private buildCorrespondence(json: Record<string, unknown>): { properties: Record<string, unknown>; children: AstNode[] } {
    return { properties: this.stripSystemFields(json), children: [] };
  }

  private buildSurvey(json: Record<string, unknown>): { properties: Record<string, unknown>; children: AstNode[] } {
    const props = this.stripSystemFields(json);
    const children: AstNode[] = [];
    const questions = json.pyQuestions || json.pyQuestionItems;
    if (Array.isArray(questions)) {
      for (const q of questions) {
        children.push({ type: 'Question', properties: this.stripSystemFields(q as Record<string, unknown>), children: [] });
      }
    }
    return { properties: props, children };
  }

  private buildGeneric(json: Record<string, unknown>): { properties: Record<string, unknown>; children: AstNode[] } {
    const props = this.stripSystemFields(json);
    const children: AstNode[] = [];
    for (const [key, val] of Object.entries(json)) {
      if (SYSTEM_FIELDS.has(key)) continue;
      if (key.startsWith('px') || key.startsWith('pz')) continue;
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
        const items = val as Record<string, unknown>[];
        children.push({
          type: key,
          properties: {},
          children: items.map(v => ({ type: 'Item', properties: this.stripSystemFields(v), children: [] })),
        });
      }
    }
    return { properties: props, children };
  }

  public toPromptContext(ast: PegaRuleAst, maxDepth?: number): string {
    const lines: string[] = [];
    lines.push(`Rule: ${ast.ruleType} — ${ast.name}`);
    lines.push(`Applies to: ${ast.className}`);
    if (ast.ruleset) lines.push(`Ruleset: ${ast.ruleset} ${ast.rulesetVersion || ''}`);
    if (ast.label) lines.push(`Label: ${ast.label}`);
    lines.push('');

    const semanticProps = this.getSemanticProperties(ast.properties, ast.ruleType);
    if (Object.keys(semanticProps).length > 0) {
      lines.push('Properties:');
      for (const [k, v] of Object.entries(semanticProps)) {
        lines.push(`  ${k}: ${renderPropertyValue(k, v)}`);
      }
      lines.push('');
    }

    if (ast.children.length > 0) {
      lines.push('Structure:');
      this.formatNodes(ast.children, lines, '  ', maxDepth ?? 10);
      lines.push('');
    }

    if (ast.references.length > 0) {
      lines.push('References to other rules:');
      const grouped = new Map<string, AstReference[]>();
      for (const ref of ast.references) {
        const key = `${ref.role}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(ref);
      }
      for (const [role, refs] of grouped) {
        for (const ref of refs) {
          lines.push(`  [${role}] ${ref.ruleType}:${ref.className}:${ref.ruleName}`);
        }
      }
    }

    return lines.join('\n');
  }

  private getSemanticProperties(props: Record<string, unknown>, _ruleType: string): Record<string, unknown> {
    const skip = new Set([
      'pyFormType', 'pyApplet', 'pyAppletHarness', 'pyClassGroupIndicator',
      'pyClassType', 'pyClassAllowState', 'pyClassInheritance',
      'pyPatternInheritance',
    ]);
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      if (skip.has(k)) continue;
      if (k.startsWith('py') || k.startsWith('px')) {
        if (typeof v === 'object' || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          result[k] = v;
        }
      }
    }
    return result;
  }

  private formatNodes(nodes: AstNode[], lines: string[], indent: string, depth: number): void {
    if (depth <= 0) { lines.push(`${indent}...`); return; }
    for (const node of nodes) {
      lines.push(`${indent}[${node.type}]`);
      for (const [k, v] of Object.entries(node.properties)) {
        if (k.startsWith('px') && k !== 'pxObjClass') continue;
        if (k.startsWith('pz')) continue;
        lines.push(`${indent}  ${k}: ${renderPropertyValue(k, v)}`);
      }
      if (node.children.length > 0) {
        this.formatNodes(node.children, lines, indent + '  ', depth - 1);
      }
    }
  }
}
