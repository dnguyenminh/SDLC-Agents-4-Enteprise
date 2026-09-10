import type { ExtractedSymbol, ExtractedRelationship } from '../../types.js';
import { extractXmlValues, nameFromPath, inferObjectFromFieldPath } from '../helpers.js';

export function parseField(
  source: string, filePath: string,
  symbols: ExtractedSymbol[], relationships: ExtractedRelationship[],
): void {
  const fieldName = nameFromPath(filePath);
  const fieldType = extractXmlValues(source, 'type')[0] ?? 'Text';
  const parentObject = inferObjectFromFieldPath(filePath);
  const lineCount = source.split('\n').length;
  symbols.push({ name: fieldName, kind: 'sf_field', filePath, startLine: 1, endLine: lineCount, signature: `${fieldName}: ${fieldType}`, parentName: parentObject, returnType: fieldType, isExported: true });
  if ((fieldType === 'Lookup' || fieldType === 'MasterDetail') && parentObject) {
    const referenceTo = extractXmlValues(source, 'referenceTo')[0];
    if (referenceTo) relationships.push({ sourceSymbol: parentObject, targetSymbol: referenceTo, kind: 'uses', filePath, line: 1, metadata: { relationType: fieldType, field: fieldName } });
  }
}
