/**
 * KSA-145: Tree-sitter Core Integration — Type definitions.
 * Shared interfaces for language parsers, parse results, and extracted symbols.
 */

// web-tree-sitter exports Node class directly from the module
// We re-export it as SyntaxNode for clarity
export type { Node as SyntaxNode } from 'web-tree-sitter';

export type SymbolKind =
  | 'function' | 'class' | 'method' | 'interface'
  | 'type' | 'enum' | 'variable' | 'namespace'
  | 'constructor' | 'property' | 'module'
  | 'trait' | 'struct' | 'constant'
  | 'pega-rule'
  // Salesforce-specific kinds emitted by the apex/aura/visualforce/salesforce-meta parsers.
  | 'apex_class' | 'trigger' | 'aura_component' | 'visualforce_page'
  | 'lwc_component' | 'flow' | 'sf_object' | 'sf_field';

export type RelationshipKind =
  | 'calls' | 'imports' | 'inherits'
  | 'implements' | 'uses' | 'decorates'
  | 'dml' | 'soql' | 'trigger-on' | 'wire' | 'apex-import'
  | 'references';


export interface ExtractedSymbol {
  name: string;
  kind: SymbolKind;
  filePath: string;
  startLine: number;
  endLine: number;
  signature: string;
  parameters?: string | null;
  returnType?: string | null;
  modifiers?: string[];
  decorators?: string[];
  parentName?: string | null;
  isAsync?: boolean;
  isExported?: boolean;
  docComment?: string | null;
  complexity?: number;
}

export interface ExtractedRelationship {
  sourceSymbol: string;
  targetSymbol: string;
  kind: RelationshipKind;
  filePath?: string;
  line: number;
  metadata?: Record<string, unknown>;
}

export type DependencySourceType = 'local' | 'remote';

export interface FileDependency {
  path: string;
  expectedHash: string;
  sourceType: DependencySourceType;
  sourceUrl?: string;
}

export interface ParseResult {
  symbols: ExtractedSymbol[];
  relationships: ExtractedRelationship[];
  errors: ParseError[];
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
}

export interface ILanguageParser {
  readonly languageId: string;
  parse(source: string, filePath: string): ParseResult;
  getSupportedExtensions(): string[];
}

export interface IndexResult {
  filePath: string;
  symbolCount: number;
  relationshipCount: number;
  parseErrors: number;
  duration: number;
  method: 'tree-sitter' | 'regex-fallback' | 'timeout-degraded';
  dependencies: FileDependency[];
}

export interface NodeVisitor {
  enter?(node: import('web-tree-sitter').Node): boolean | void;
  leave?(node: import('web-tree-sitter').Node): void;
}
