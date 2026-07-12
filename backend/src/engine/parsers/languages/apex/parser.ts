import type { Parser as ParserType } from 'web-tree-sitter';
import type { ILanguageParser, ParseResult, ExtractedSymbol, ExtractedRelationship, ParseError, SyntaxNode } from '../../types.js';
import { findNodes } from '../../ast-utils.js';
import { extractDeclarations } from './declarations.js';
import { extractTrigger } from './triggers.js';

export default class ApexParser implements ILanguageParser {
  readonly languageId: string;
  private parser: any;

  constructor(parser: any, languageId: string) {
    this.parser = parser;
    this.languageId = languageId;
  }

  getSupportedExtensions(): string[] {
    return ['.cls', '.trigger'];
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

    if (filePath.endsWith('.trigger')) {
      extractTrigger(tree.rootNode, source, filePath, symbols, relationships);
    } else {
      extractDeclarations(tree.rootNode, source, filePath, null, symbols, relationships);
    }

    return { symbols, relationships, errors };
  }
}
