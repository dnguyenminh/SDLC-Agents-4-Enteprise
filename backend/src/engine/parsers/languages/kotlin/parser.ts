import type { Parser as ParserType } from 'web-tree-sitter';
import type { ILanguageParser, ParseResult, ExtractedSymbol, ExtractedRelationship, ParseError, SyntaxNode } from '../../types.js';
import { findNodes, findFirst, getNodeText, getNodeRange } from '../../ast-utils.js';
import { extractDeclarationsInNode } from './dispatchable.js';

function extractPackage(root: SyntaxNode, source: string, filePath: string, symbols: ExtractedSymbol[]): void {
  const pkgNode = findFirst(root, 'package_header');
  if (!pkgNode) return;
  const identifier = findFirst(pkgNode, 'identifier');
  if (!identifier) return;
  symbols.push({
    name: getNodeText(identifier, source), kind: 'namespace', filePath,
    ...getNodeRange(pkgNode), signature: getNodeText(pkgNode, source).trim(),
  });
}

function extractImports(root: SyntaxNode, source: string, filePath: string, relationships: ExtractedRelationship[]): void {
  const imports = findNodes(root, 'import_header');
  for (const imp of imports) {
    const identifier = findFirst(imp, 'identifier');
    if (!identifier) continue;
    const target = getNodeText(identifier, source);
    const impText = getNodeText(imp, source);
    const isWildcard = impText.includes('.*') || impText.endsWith('*');
    let alias: string | undefined;
    const aliasNode = findFirst(imp, 'import_alias');
    if (aliasNode) {
      const aliasId = findFirst(aliasNode, 'simple_identifier');
      if (aliasId) alias = getNodeText(aliasId, source);
    }
    relationships.push({
      sourceSymbol: '__file__', targetSymbol: isWildcard ? target + '.*' : target,
      kind: 'imports', filePath, line: imp.startPosition.row + 1,
      metadata: { ...(isWildcard && { wildcard: true }), ...(alias && { alias }) },
    });
  }
}

export default class KotlinParser implements ILanguageParser {
  readonly languageId = 'kotlin';
  private parser: any;

  constructor(parser: any, _languageId?: string) {
    this.parser = parser;
  }

  getSupportedExtensions(): string[] {
    return ['.kt', '.kts'];
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

    extractPackage(tree.rootNode, source, filePath, symbols);
    extractImports(tree.rootNode, source, filePath, relationships);
    extractDeclarationsInNode(tree.rootNode, source, filePath, symbols, relationships, undefined);

    return { symbols, relationships, errors };
  }
}
