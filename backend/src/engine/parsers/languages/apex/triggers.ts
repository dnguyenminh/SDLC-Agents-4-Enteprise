import type { SyntaxNode, ExtractedSymbol, ExtractedRelationship } from '../../types.js';
import { getNodeText, getNodeRange, getNamedChild, findNodes } from '../../ast-utils.js';
import { extractTriggerEvents } from './helpers.js';
import { extractApexCalls, extractApexDML, extractApexSOQL } from './relationships.js';
import { extractDeclarations } from './declarations.js';

export function extractTrigger(
  root: SyntaxNode, source: string, filePath: string,
  symbols: ExtractedSymbol[], relationships: ExtractedRelationship[],
): void {
  const triggerNodes = findNodes(root, 'trigger_declaration');
  if (triggerNodes.length === 0) {
    extractDeclarations(root, source, filePath, null, symbols, relationships);
    return;
  }
  const triggerNode = triggerNodes[0];
  const nameNode = getNamedChild(triggerNode, 'identifier');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const range = getNodeRange(triggerNode);
  const objectNode = triggerNode.namedChild(1);
  const sobject = objectNode ? getNodeText(objectNode, source) : 'Unknown';
  const events = extractTriggerEvents(triggerNode, source);
  symbols.push({
    name, kind: 'class', filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: `trigger ${name} on ${sobject} (${events.join(', ')})`,
    modifiers: ['trigger'], isExported: true,
  });
  relationships.push({
    sourceSymbol: name, targetSymbol: sobject,
    kind: 'trigger-on' as any, filePath, line: range.startLine,
    metadata: { events },
  });
  const body = getNamedChild(triggerNode, 'trigger_body') ?? getNamedChild(triggerNode, 'block');
  if (body) {
    extractApexCalls(body, source, filePath, name, relationships);
    extractApexDML(body, source, filePath, name, relationships);
    extractApexSOQL(body, source, filePath, name, relationships);
  }
}
