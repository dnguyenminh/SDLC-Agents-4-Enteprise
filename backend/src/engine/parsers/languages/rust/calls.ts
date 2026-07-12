import type { SyntaxNode, ExtractedRelationship } from '../../types.js';
import { getNodeText, findNodes } from '../../ast-utils.js';

export function extractRustCalls(
  body: SyntaxNode, source: string, filePath: string,
  callerName: string, relationships: ExtractedRelationship[],
): void {
  const seen = new Set<string>();
  const callExprs = findNodes(body, 'call_expression');
  for (const call of callExprs) {
    const funcNode = call.childForFieldName('function');
    if (!funcNode) continue;
    const target = getNodeText(funcNode, source).trim();
    const key = `${callerName}->${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    relationships.push({
      sourceSymbol: callerName, targetSymbol: target,
      kind: 'calls', filePath, line: call.startPosition.row + 1,
    });
  }
  const macroInvocations = findNodes(body, 'macro_invocation');
  for (const macroInv of macroInvocations) {
    const macroNode = macroInv.childForFieldName('macro');
    if (!macroNode) continue;
    const macroName = getNodeText(macroNode, source).replace(/!$/, '');
    const key = `${callerName}->${macroName}!`;
    if (seen.has(key)) continue;
    seen.add(key);
    relationships.push({
      sourceSymbol: callerName, targetSymbol: macroName,
      kind: 'calls', filePath, line: macroInv.startPosition.row + 1,
      metadata: { macro: true },
    });
  }
  const awaitExprs = findNodes(body, 'await_expression');
  for (const awaitExpr of awaitExprs) {
    const key = `${callerName}->[async].await@${awaitExpr.startPosition.row}`;
    if (seen.has(key)) continue;
    seen.add(key);
    relationships.push({
      sourceSymbol: callerName, targetSymbol: '[async].poll',
      kind: 'calls', filePath, line: awaitExpr.startPosition.row + 1,
      metadata: { async: true },
    });
  }
}
