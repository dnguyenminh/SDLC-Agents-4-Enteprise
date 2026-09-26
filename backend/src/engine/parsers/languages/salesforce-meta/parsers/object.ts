import type { ExtractedSymbol, ExtractedRelationship } from '../../types.js';
import { extractXmlValues, extractXmlBlocks, nameFromPath } from '../helpers.js';

export function parseObject(
  source: string, filePath: string,
  symbols: ExtractedSymbol[], relationships: ExtractedRelationship[],
): void {
  const objectName = nameFromPath(filePath);
  const lineCount = source.split('\n').length;
  symbols.push({ name: objectName, kind: 'sf_object', filePath, startLine: 1, endLine: lineCount, signature: `CustomObject: ${objectName}`, modifiers: ['custom-object'], isExported: true });
  const fields = extractXmlBlocks(source, 'fields');
  for (const block of fields) {
    const fieldName = extractXmlValues(block, 'fullName')[0];
    const fieldType = extractXmlValues(block, 'type')[0] ?? 'Text';
    if (fieldName) {
      symbols.push({ name: fieldName, kind: 'sf_field', filePath, startLine: 1, endLine: 1, signature: `${fieldName}: ${fieldType}`, parentName: objectName, returnType: fieldType, isExported: true });
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
