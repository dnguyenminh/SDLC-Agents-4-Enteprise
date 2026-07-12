import type { Parser as ParserType } from 'web-tree-sitter';
import type {
  ILanguageParser, ParseResult, ExtractedSymbol,
  ExtractedRelationship, ParseError,
} from '../../types.js';
import { findNodes } from '../../ast-utils.js';
import { extractPackage, extractDeclarations } from './extractor.js';
import { extractJavaImports } from './relationships.js';

export default class JavaParser implements ILanguageParser {
  readonly languageId: string;
  private parser: any;

  constructor(parser: any, languageId: string) {
    this.parser = parser;
    this.languageId = languageId;
  }

  getSupportedExtensions(): string[] {
    return ['.java'];
  }

  parse(source: string, filePath: string): ParseResult {
    const tree = this.parser.parse(source);
    const symbols: ExtractedSymbol[] = [];
    const relationships: ExtractedRelationship[] = [];
    const errors: ParseError[] = [];

    if (tree.rootNode.hasError) {
      const errorNodes = findNodes(tree.rootNode, 'ERROR');
      for (const node of errorNodes.slice(0, 10)) {
        errors.push({
          message: 'Parse error',
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
        });
      }
    }

    extractPackage(tree.rootNode, source, filePath, symbols);
    extractJavaImports(tree.rootNode, source, filePath, relationships);
    extractDeclarations(tree.rootNode, source, filePath, null, symbols, relationships);

    return { symbols, relationships, errors };
  }
}
