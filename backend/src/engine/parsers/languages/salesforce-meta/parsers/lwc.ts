import type { ExtractedSymbol, ExtractedRelationship, RelationshipKind } from '../../types.js';
import { extractXmlValues, nameFromPath } from '../helpers.js';

export function parseLWCMeta(
  source: string, filePath: string,
  symbols: ExtractedSymbol[], relationships: ExtractedRelationship[],
): void {
  const componentName = nameFromPath(filePath);
  const lineCount = source.split('\n').length;
  const isExposed = extractXmlValues(source, 'isExposed')[0] === 'true';
  symbols.push({ name: componentName, kind: 'lwc_component', filePath, startLine: 1, endLine: lineCount, signature: `LWC: ${componentName}`, modifiers: isExposed ? ['exposed'] : [], isExported: isExposed });
  const datasources = extractXmlValues(source, 'datasource');
  for (const ds of datasources) {
    if (ds) relationships.push({ sourceSymbol: componentName, targetSymbol: ds, kind: 'wire' as RelationshipKind, filePath, line: 1, metadata: { type: 'datasource' } });
  }
}
