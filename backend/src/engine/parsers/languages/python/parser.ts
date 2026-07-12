import type { Parser as ParserType } from 'web-tree-sitter';
import type { ILanguageParser, ParseResult, ExtractedSymbol, ExtractedRelationship, ParseError, SyntaxNode } from '../../types.js';
import { getNodeText, getNodeRange, findNodes, getNamedChild } from '../../ast-utils.js';
import { extractDeclarationsNode } from './members.js';
import { extractModuleName, getImportedIdentifiers } from './helpers.js';

function extractImports(root: SyntaxNode, source: string, filePath: string, relationships: ExtractedRelationship[]): void {
  const importStmts = findNodes(root, 'import_statement');
  for (const stmt of importStmts) {
    const names = findNodes(stmt, 'dotted_name');
    for (const name of names) {
      relationships.push({ sourceSymbol: '__file__', targetSymbol: getNodeText(name, source), kind: 'imports', filePath, line: stmt.startPosition.row + 1 });
    }
  }
  const fromStmts = findNodes(root, 'import_from_statement');
  for (const stmt of fromStmts) {
    const moduleName = extractModuleName(stmt, source);
    const isRelative = moduleName.startsWith('.');
    if (findNodes(stmt, 'wildcard_import').length > 0) {
      relationships.push({ sourceSymbol: '__file__', targetSymbol: `${moduleName}.*`, kind: 'imports', filePath, line: stmt.startPosition.row + 1, metadata: { wildcard: true, ...(isRelative && { relative: true }) } });
      continue;
    }
    const importedNames = findNodes(stmt, 'aliased_import');
    if (importedNames.length > 0) {
      for (const imported of importedNames) {
        const nameNode = imported.child(0);
        if (!nameNode) continue;
        const name = getNodeText(nameNode, source);
        const aliasNode = imported.childCount > 2 ? imported.child(2) : null;
        const alias = aliasNode ? getNodeText(aliasNode, source) : undefined;
        relationships.push({ sourceSymbol: '__file__', targetSymbol: moduleName ? `${moduleName}.${name}` : name, kind: 'imports', filePath, line: stmt.startPosition.row + 1, metadata: { from: moduleName, name, ...(alias && { alias }), ...(isRelative && { relative: true }) } });
      }
    } else {
      const identifiers = getImportedIdentifiers(stmt, source);
      for (const name of identifiers) {
        relationships.push({ sourceSymbol: '__file__', targetSymbol: moduleName ? `${moduleName}.${name}` : name, kind: 'imports', filePath, line: stmt.startPosition.row + 1, metadata: { from: moduleName, name } });
      }
    }
  }
}

export default class PythonParser implements ILanguageParser {
  readonly languageId: string;
  private parser: any;

  constructor(parser: any, languageId: string) {
    this.parser = parser;
    this.languageId = languageId;
  }

  getSupportedExtensions(): string[] {
    return ['.py', '.pyi'];
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

    extractImports(tree.rootNode, source, filePath, relationships);
    extractDeclarationsNode(tree.rootNode, source, filePath, null, symbols, relationships);

    return { symbols, relationships, errors };
  }
}
