import type { Parser as ParserType } from 'web-tree-sitter';
import type { ILanguageParser, ParseResult, ExtractedSymbol, ExtractedRelationship, ParseError, SyntaxNode } from '../../types.js';
import { findNodes } from '../../ast-utils.js';
import { extractDeclarations, extractGoCalls } from './members.js';

function isGeneratedFile(source: string, filePath: string): boolean {
  if (filePath.endsWith('_generated.go')) return true;
  const firstLines = source.split('\n').slice(0, 3).join('\n');
  return firstLines.includes('// Code generated');
}

function extractImports(root: SyntaxNode, source: string, filePath: string, relationships: ExtractedRelationship[]): void {
  const importDecls = findNodes(root, 'import_declaration');
  for (const decl of importDecls) {
    const importSpecs = findNodes(decl, 'import_spec');
    for (const spec of importSpecs) {
      const pathNode = spec.childForFieldName('path');
      if (!pathNode) continue;
      const importPath = getNodeText(pathNode, source).replace(/"/g, '');
      const aliasNode = spec.childForFieldName('name');
      const alias = aliasNode ? getNodeText(aliasNode, source) : null;
      relationships.push({ sourceSymbol: filePath, targetSymbol: importPath, kind: 'imports', filePath, line: spec.startPosition.row + 1, metadata: { alias, module: importPath } });
    }
  }
}

import { getNodeText } from '../../ast-utils.js';

function detectInterfaceImplementations(symbols: ExtractedSymbol[]): ExtractedRelationship[] {
  const interfaces = symbols.filter(s => s.kind === 'interface');
  const structs = symbols.filter(s => s.kind === 'struct');
  const implRelationships: ExtractedRelationship[] = [];
  if (interfaces.length === 0 || structs.length === 0) return implRelationships;
  return implRelationships;
}

export default class GoParser implements ILanguageParser {
  readonly languageId: string;
  private parser: any;

  constructor(parser: any, languageId: string) {
    this.parser = parser;
    this.languageId = languageId;
  }

  getSupportedExtensions(): string[] {
    return ['.go'];
  }

  parse(source: string, filePath: string): ParseResult {
    if (isGeneratedFile(source, filePath)) {
      return { symbols: [], relationships: [], errors: [] };
    }
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

    extractDeclarations(tree.rootNode, source, filePath, symbols, relationships);
    extractImports(tree.rootNode, source, filePath, relationships);
    const implRelationships = detectInterfaceImplementations(symbols);
    relationships.push(...implRelationships);

    return { symbols, relationships, errors };
  }
}
