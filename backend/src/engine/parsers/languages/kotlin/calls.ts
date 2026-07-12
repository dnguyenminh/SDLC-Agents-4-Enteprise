import type { SyntaxNode, ExtractedRelationship } from '../../types.js';
import { getNodeText, findNodes } from '../../ast-utils.js';

interface CallTarget {
  name: string;
  metadata?: Record<string, unknown>;
}

export function extractKotlinCalls(
  node: SyntaxNode, source: string, sourceName: string,
  filePath: string, relationships: ExtractedRelationship[],
): void {
  const callExprs = findNodes(node, 'call_expression');
  const seen = new Set<string>();
  for (const call of callExprs) {
    const target = resolveKotlinCallTarget(call, source);
    if (!target) continue;
    if (target.name === 'println' || target.name === 'print') continue;
    const key = `${sourceName}->${target.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    relationships.push({
      sourceSymbol: sourceName, targetSymbol: target.name,
      kind: 'calls', filePath, line: call.startPosition.row + 1,
      metadata: target.metadata,
    });
  }
}

function resolveKotlinCallTarget(node: SyntaxNode, source: string): CallTarget | null {
  const firstChild = node.child(0);
  if (!firstChild) return null;
  if (firstChild.type === 'navigation_expression') {
    const text = getNodeText(firstChild, source);
    const parts = text.split('.');
    const method = parts[parts.length - 1];
    const receiver = parts.slice(0, -1).join('.');
    return { name: method, metadata: { receiver } };
  }
  if (firstChild.type === 'simple_identifier') {
    const name = getNodeText(firstChild, source);
    if (name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase()) {
      return { name, metadata: { isConstructor: true } };
    }
    return { name };
  }
  return null;
}
