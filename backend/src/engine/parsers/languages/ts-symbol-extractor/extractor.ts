import type { SyntaxNode, ExtractedSymbol, ExtractedRelationship } from '../../types.js';
import { extractFunction, extractClass, extractInterface, extractTypeAlias, extractEnum, extractVariableDeclaration } from './members.js';

export class TSSymbolExtractor {
  extract(
    rootNode: SyntaxNode, source: string, filePath: string,
    relationships: ExtractedRelationship[],
  ): ExtractedSymbol[] {
    const symbols: ExtractedSymbol[] = [];
    extractFromNode(rootNode, source, filePath, null, symbols, relationships);
    return symbols;
  }
}

function extractFromNode(
  node: SyntaxNode, source: string, filePath: string,
  parentName: string | null, symbols: ExtractedSymbol[],
  relationships: ExtractedRelationship[],
): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child) continue;
    switch (child.type) {
      case 'function_declaration':
      case 'generator_function_declaration':
        extractFunction(child, source, filePath, parentName, symbols); break;
      case 'class_declaration':
        extractClass(child, source, filePath, parentName, symbols, relationships); break;
      case 'interface_declaration':
        extractInterface(child, source, filePath, parentName, symbols); break;
      case 'type_alias_declaration':
        extractTypeAlias(child, source, filePath, parentName, symbols); break;
      case 'enum_declaration':
        extractEnum(child, source, filePath, parentName, symbols); break;
      case 'lexical_declaration':
      case 'variable_declaration':
        extractVariableDeclaration(child, source, filePath, parentName, symbols); break;
      case 'export_statement':
        extractFromNode(child, source, filePath, parentName, symbols, relationships); break;
    }
  }
}
