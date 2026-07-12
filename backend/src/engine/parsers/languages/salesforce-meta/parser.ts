import type { ILanguageParser, ParseResult, ExtractedSymbol, ExtractedRelationship, ParseError } from '../../types.js';
import { parseFlow, parseObject, parseField, parseLWCMeta, parseAuraMeta } from './parsers.js';

function detectMetaType(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  if (normalized.endsWith('.flow-meta.xml')) return 'flow';
  if (normalized.endsWith('.object-meta.xml')) return 'object';
  if (normalized.endsWith('.field-meta.xml')) return 'field';
  if (normalized.endsWith('.js-meta.xml')) return 'lwc-meta';
  if (normalized.endsWith('.component-meta.xml')) return 'aura-meta';
  return null;
}

export default class SalesforceMetaParser implements ILanguageParser {
  readonly languageId: string;

  constructor(_parser: any, languageId: string) {
    this.languageId = languageId;
  }

  getSupportedExtensions(): string[] {
    return ['.flow-meta.xml', '.object-meta.xml', '.field-meta.xml', '.js-meta.xml', '.component-meta.xml'];
  }

  parse(source: string, filePath: string): ParseResult {
    const symbols: ExtractedSymbol[] = [];
    const relationships: ExtractedRelationship[] = [];
    const errors: ParseError[] = [];

    try {
      const metaType = detectMetaType(filePath);
      switch (metaType) {
        case 'flow': parseFlow(source, filePath, symbols, relationships); break;
        case 'object': parseObject(source, filePath, symbols, relationships); break;
        case 'field': parseField(source, filePath, symbols, relationships); break;
        case 'lwc-meta': parseLWCMeta(source, filePath, symbols, relationships); break;
        case 'aura-meta': parseAuraMeta(source, filePath, symbols); break;
      }
    } catch (err) {
      errors.push({ message: `XML parse error: ${err instanceof Error ? err.message : String(err)}`, line: 1, column: 0 });
    }

    return { symbols, relationships, errors };
  }
}
