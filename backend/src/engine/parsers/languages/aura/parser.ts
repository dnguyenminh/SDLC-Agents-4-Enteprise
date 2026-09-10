import type { ILanguageParser, ParseResult, ExtractedSymbol, ExtractedRelationship } from '../../types.js';
import { extractMarkupTopLevel } from '../salesforce-markup/shared.js';

const AURA_TYPES: Record<string, { prefix: string; modifier: string; rootTag: string }> = {
  '.cmp': { prefix: 'AuraComponent', modifier: 'component', rootTag: 'aura:component' },
  '.app': { prefix: 'AuraApplication', modifier: 'application', rootTag: 'aura:application' },
  '.evt': { prefix: 'AuraEvent', modifier: 'event', rootTag: 'aura:event' },
  '.intf': { prefix: 'AuraInterface', modifier: 'interface', rootTag: 'aura:interface' },
  '.tokens': { prefix: 'AuraTokens', modifier: 'tokens', rootTag: 'aura:tokens' },
};

export default class AuraParser implements ILanguageParser {
  readonly languageId = 'aura';

  constructor(_parser: any, _languageId: string) {}

  getSupportedExtensions(): string[] {
    return ['.cmp', '.app', '.evt', '.intf', '.tokens'];
  }

  parse(source: string, filePath: string): ParseResult {
    const ext = '.' + filePath.toLowerCase().split('.').pop();
    const cfg = AURA_TYPES[ext] ?? AURA_TYPES['.cmp'];
    const { symbols, relationships } = extractMarkupTopLevel(source, filePath, {
      rootTags: [cfg.rootTag],
      signaturePrefix: cfg.prefix,
      modifiers: ['aura', cfg.modifier],
      relationshipAttrs: [
        { attr: 'implements', kind: 'implements' },
        { attr: 'extends', kind: 'inherits' },
      ],
    });
    if (ext === '.cmp' && symbols.length > 0) {
      symbols.forEach(s => { s.kind = 'aura_component'; });
    }
    return { symbols, relationships, errors: [] };
  }
}
