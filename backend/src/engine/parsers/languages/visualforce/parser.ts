import type { ILanguageParser, ParseResult, ExtractedSymbol, ExtractedRelationship } from '../../types.js';
import { extractMarkupTopLevel } from '../salesforce-markup/shared.js';

export default class VisualforceParser implements ILanguageParser {
  readonly languageId = 'visualforce';

  constructor(_parser: any, _languageId: string) {}

  getSupportedExtensions(): string[] {
    return ['.page', '.component'];
  }

  parse(source: string, filePath: string): ParseResult {
    const isPage = filePath.toLowerCase().endsWith('.page');
    const { symbols, relationships } = extractMarkupTopLevel(source, filePath, {
      rootTags: ['apex:page', 'apex:component'],
      signaturePrefix: isPage ? 'VisualforcePage' : 'VisualforceComponent',
      modifiers: isPage ? ['visualforce', 'page'] : ['visualforce', 'component'],
      relationshipAttrs: [
        { attr: 'controller', kind: 'uses' },
        { attr: 'extensions', kind: 'apex-import' },
      ],
    });
    if (isPage && symbols.length > 0) {
      symbols.forEach(s => { s.kind = 'visualforce_page'; });
    }
    return { symbols, relationships, errors: [] };
  }
}
