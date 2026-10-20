/**
 * AST → prompt context rendering (BR-18 extraction from PegaRuleAstParser).
 * Expression-bearing fields (SA4E-236/GD4) are parsed by the ANTLR parser and
 * re-emitted canonically; everything else is stringified as before.
 */
import type { PegaRuleAst, AstNode, AstReference } from './PegaRuleAst.js';
import { isExpressionField, renderFieldExpression } from './PegaExprAnnotator.js';

/** Render a property value for pseudo-code. */
function renderPropertyValue(key: string, value: unknown): string {
  if (isExpressionField(key) && typeof value === 'string') {
    return renderFieldExpression(value);
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function toPromptContext(ast: PegaRuleAst, maxDepth?: number): string {
  const lines: string[] = [];
  lines.push(`Rule: ${ast.ruleType} — ${ast.name}`);
  lines.push(`Applies to: ${ast.className}`);
  if (ast.ruleset) lines.push(`Ruleset: ${ast.ruleset} ${ast.rulesetVersion || ''}`);
  if (ast.label) lines.push(`Label: ${ast.label}`);
  lines.push('');

  const semanticProps = getSemanticProperties(ast.properties, ast.ruleType);
  if (Object.keys(semanticProps).length > 0) {
    lines.push('Properties:');
    for (const [k, v] of Object.entries(semanticProps)) {
      lines.push(`  ${k}: ${renderPropertyValue(k, v)}`);
    }
    lines.push('');
  }

  if (ast.children.length > 0) {
    lines.push('Structure:');
    formatNodes(ast.children, lines, '  ', maxDepth ?? 10);
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

function getSemanticProperties(props: Record<string, unknown>, _ruleType: string): Record<string, unknown> {
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

function formatNodes(nodes: AstNode[], lines: string[], indent: string, depth: number): void {
  if (depth <= 0) { lines.push(`${indent}...`); return; }
  for (const node of nodes) {
    lines.push(`${indent}[${node.type}]`);
    for (const [k, v] of Object.entries(node.properties)) {
      if (k.startsWith('px') && k !== 'pxObjClass') continue;
      if (k.startsWith('pz')) continue;
      lines.push(`${indent}  ${k}: ${renderPropertyValue(k, v)}`);
    }
    if (node.children.length > 0) {
      formatNodes(node.children, lines, indent + '  ', depth - 1);
    }
  }
}
