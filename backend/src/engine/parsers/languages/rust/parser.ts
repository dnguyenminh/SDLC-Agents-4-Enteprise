import type { Parser as ParserType } from 'web-tree-sitter';
import type { ILanguageParser, ParseResult, ExtractedSymbol, ExtractedRelationship, ParseError, SyntaxNode } from '../../types.js';
import { findNodes } from '../../ast-utils.js';
import {
  extractFunction, extractStruct, extractEnum,
  extractTypeAlias, extractConstStatic, extractMacroDefinition,
} from './members.js';
import { extractTrait, extractImpl, extractModule } from './dispatchable.js';
import { extractUseDeclarations } from './uses.js';

export type DispatchFn = (
  node: SyntaxNode, source: string, filePath: string,
  parentName: string | null, symbols: ExtractedSymbol[],
  relationships: ExtractedRelationship[],
) => void;

function extractFromNode(
  node: SyntaxNode, source: string, filePath: string,
  parentName: string | null, symbols: ExtractedSymbol[],
  relationships: ExtractedRelationship[],
): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child) continue;
    switch (child.type) {
      case 'function_item':
        extractFunction(child, source, filePath, parentName, symbols, relationships); break;
      case 'struct_item':
        extractStruct(child, source, filePath, parentName, symbols, relationships); break;
      case 'enum_item':
        extractEnum(child, source, filePath, parentName, symbols, relationships); break;
      case 'trait_item':
        extractTrait(child, source, filePath, parentName, symbols, relationships, extractFromNode); break;
      case 'impl_item':
        extractImpl(child, source, filePath, symbols, relationships, extractFromNode); break;
      case 'mod_item':
        extractModule(child, source, filePath, parentName, symbols, relationships, extractFromNode); break;
      case 'type_item':
        extractTypeAlias(child, source, filePath, parentName, symbols); break;
      case 'const_item':
      case 'static_item':
        extractConstStatic(child, source, filePath, parentName, symbols); break;
      case 'macro_definition':
        extractMacroDefinition(child, source, filePath, symbols); break;
    }
  }
}

export default class RustParser implements ILanguageParser {
  readonly languageId: string;
  private parser: any;

  constructor(parser: any, languageId: string) {
    this.parser = parser;
    this.languageId = languageId;
  }

  getSupportedExtensions(): string[] {
    return ['.rs'];
  }

  parse(source: string, filePath: string): ParseResult {
    const tree = this.parser.parse(source);
    const symbols: ExtractedSymbol[] = [];
    const relationships: ExtractedRelationship[] = [];
    const errors: ParseError[] = [];

    if (tree.rootNode.hasError) {
      const errorNodes = findNodes(tree.rootNode, 'ERROR');
      for (const node of errorNodes.slice(0, 10)) {
        errors.push({ message: 'Parse error', line: node.startPosition.row + 1, column: node.startPosition.column });
      }
    }

    extractFromNode(tree.rootNode, source, filePath, null, symbols, relationships);
    extractUseDeclarations(tree.rootNode, source, filePath, relationships);

    return { symbols, relationships, errors };
  }
}
