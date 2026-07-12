import type { ExtractedSymbol, ExtractedRelationship, RelationshipKind } from '../../types.js';
import { extractXmlValues, extractXmlBlocks, nameFromPath, inferObjectFromFieldPath } from './helpers.js';

export function parseFlow(
  source: string, filePath: string,
  symbols: ExtractedSymbol[], relationships: ExtractedRelationship[],
): void {
  const flowName = nameFromPath(filePath);
  const processType = extractXmlValues(source, 'processType')[0] ?? 'Flow';
  const lineCount = source.split('\n').length;
  symbols.push({ name: flowName, kind: 'class', filePath, startLine: 1, endLine: lineCount, signature: `Flow: ${flowName} (${processType})`, modifiers: [processType.toLowerCase()], isExported: true });
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

export function parseObject(
  source: string, filePath: string,
  symbols: ExtractedSymbol[], relationships: ExtractedRelationship[],
): void {
  const objectName = nameFromPath(filePath);
  const lineCount = source.split('\n').length;
  symbols.push({ name: objectName, kind: 'class', filePath, startLine: 1, endLine: lineCount, signature: `CustomObject: ${objectName}`, modifiers: ['custom-object'], isExported: true });
  const fields = extractXmlBlocks(source, 'fields');
  for (const block of fields) {
    const fieldName = extractXmlValues(block, 'fullName')[0];
    const fieldType = extractXmlValues(block, 'type')[0] ?? 'Text';
    if (fieldName) {
      symbols.push({ name: fieldName, kind: 'property', filePath, startLine: 1, endLine: 1, signature: `${fieldName}: ${fieldType}`, parentName: objectName, returnType: fieldType, isExported: true });
      if (fieldType === 'Lookup' || fieldType === 'MasterDetail') {
        const referenceTo = extractXmlValues(block, 'referenceTo')[0];
        if (referenceTo) relationships.push({ sourceSymbol: objectName, targetSymbol: referenceTo, kind: 'uses', filePath, line: 1, metadata: { relationType: fieldType } });
      }
    }
  }
  const validations = extractXmlBlocks(source, 'validationRules');
  for (const block of validations) {
    const ruleName = extractXmlValues(block, 'fullName')[0];
    if (ruleName) symbols.push({ name: ruleName, kind: 'method', filePath, startLine: 1, endLine: 1, signature: `ValidationRule: ${ruleName}`, parentName: objectName, isExported: false });
  }
}

export function parseField(
  source: string, filePath: string,
  symbols: ExtractedSymbol[], relationships: ExtractedRelationship[],
): void {
  const fieldName = nameFromPath(filePath);
  const fieldType = extractXmlValues(source, 'type')[0] ?? 'Text';
  const parentObject = inferObjectFromFieldPath(filePath);
  const lineCount = source.split('\n').length;
  symbols.push({ name: fieldName, kind: 'property', filePath, startLine: 1, endLine: lineCount, signature: `${fieldName}: ${fieldType}`, parentName: parentObject, returnType: fieldType, isExported: true });
  if ((fieldType === 'Lookup' || fieldType === 'MasterDetail') && parentObject) {
    const referenceTo = extractXmlValues(source, 'referenceTo')[0];
    if (referenceTo) relationships.push({ sourceSymbol: parentObject, targetSymbol: referenceTo, kind: 'uses', filePath, line: 1, metadata: { relationType: fieldType, field: fieldName } });
  }
}

export function parseLWCMeta(
  source: string, filePath: string,
  symbols: ExtractedSymbol[], relationships: ExtractedRelationship[],
): void {
  const componentName = nameFromPath(filePath);
  const lineCount = source.split('\n').length;
  const isExposed = extractXmlValues(source, 'isExposed')[0] === 'true';
  symbols.push({ name: componentName, kind: 'class', filePath, startLine: 1, endLine: lineCount, signature: `LWC: ${componentName}`, modifiers: isExposed ? ['exposed'] : [], isExported: isExposed });
  const datasources = extractXmlValues(source, 'datasource');
  for (const ds of datasources) {
    if (ds) relationships.push({ sourceSymbol: componentName, targetSymbol: ds, kind: 'wire' as RelationshipKind, filePath, line: 1, metadata: { type: 'datasource' } });
  }
}

export function parseAuraMeta(
  source: string, filePath: string, symbols: ExtractedSymbol[],
): void {
  const componentName = nameFromPath(filePath);
  const lineCount = source.split('\n').length;
  symbols.push({ name: componentName, kind: 'class', filePath, startLine: 1, endLine: lineCount, signature: `AuraComponent: ${componentName}`, modifiers: ['aura'], isExported: true });
}
