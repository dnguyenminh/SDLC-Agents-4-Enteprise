import type { ExtractedSymbol, ExtractedRelationship } from '../../types.js';
import { extractXmlValues, extractXmlBlocks, nameFromPath } from '../helpers.js';

export function parseFlow(
  source: string, filePath: string,
  symbols: ExtractedSymbol[], relationships: ExtractedRelationship[],
): void {
  const flowName = nameFromPath(filePath);
  const processType = extractXmlValues(source, 'processType')[0] ?? 'Flow';
  const lineCount = source.split('\n').length;
  symbols.push({ name: flowName, kind: 'flow', filePath, startLine: 1, endLine: lineCount, signature: `Flow: ${flowName} (${processType})`, modifiers: [processType.toLowerCase()], isExported: true });
  const variables = extractXmlBlocks(source, 'variables');
  for (const varBlock of variables) {
    const varName = extractXmlValues(varBlock, 'name')[0];
    const dataType = extractXmlValues(varBlock, 'dataType')[0] ?? 'String';
    if (varName) symbols.push({ name: varName, kind: 'property', filePath, startLine: 1, endLine: 1, signature: `${varName}: ${dataType}`, parentName: flowName, returnType: dataType, isExported: false });
  }
  const decisions = extractXmlBlocks(source, 'decisions');
  for (const block of decisions) {
    const name = extractXmlValues(block, 'name')[0];
    if (name) symbols.push({ name, kind: 'method', filePath, startLine: 1, endLine: 1, signature: `Decision: ${name}`, parentName: flowName, isExported: false });
  }
  const actions = extractXmlBlocks(source, 'actionCalls');
  for (const block of actions) {
    const actionName = extractXmlValues(block, 'name')[0];
    const actionType = extractXmlValues(block, 'actionType')[0];
    if (actionName) {
      symbols.push({ name: actionName, kind: 'method', filePath, startLine: 1, endLine: 1, signature: `Action: ${actionName} (${actionType ?? 'unknown'})`, parentName: flowName, isExported: false });
      if (actionType === 'apex') {
        const className = extractXmlValues(block, 'actionName')[0];
        if (className) relationships.push({ sourceSymbol: flowName, targetSymbol: className, kind: 'calls', filePath, line: 1, metadata: { actionType: 'apex' } });
      }
    }
  }
  for (const tag of ['recordLookups', 'recordCreates', 'recordUpdates', 'recordDeletes']) {
    const blocks = extractXmlBlocks(source, tag);
    for (const block of blocks) {
      const objectName = extractXmlValues(block, 'object')[0];
      if (objectName) relationships.push({ sourceSymbol: flowName, targetSymbol: objectName, kind: 'uses', filePath, line: 1, metadata: { operation: tag.replace('record', '').toLowerCase() } });
    }
  }
}
