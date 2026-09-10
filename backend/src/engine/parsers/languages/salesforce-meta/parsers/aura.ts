import type { ExtractedSymbol } from '../../types.js';
import { nameFromPath } from '../helpers.js';

export function parseAuraMeta(
  source: string, filePath: string, symbols: ExtractedSymbol[],
): void {
  const componentName = nameFromPath(filePath);
  const lineCount = source.split('\n').length;
  symbols.push({ name: componentName, kind: 'aura_component', filePath, startLine: 1, endLine: lineCount, signature: `AuraComponent: ${componentName}`, modifiers: ['aura'], isExported: true });
}
