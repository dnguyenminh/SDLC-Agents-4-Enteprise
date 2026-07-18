/**
 * CodeIntelScanner — Uses TypeScript Compiler API to extract
 * symbols, imports, and exports from source files.
 */

import * as ts from "typescript";
import * as path from "path";
import {
  ICodeIntelScanner, FileUploadPayload,
  SymbolInfo, ImportInfo, ExportInfo, LANGUAGE_EXTENSIONS,
} from "./models";
import { HashCache } from "./HashCache";

export class CodeIntelScanner implements ICodeIntelScanner {
  /**
   * Parse a file and extract code intelligence data.
   * Returns null if parsing fails or language unsupported.
   */
  scanFile(filePath: string, content: string): FileUploadPayload | null {
    const language = this.detectLanguage(filePath);
    if (!language) { return null; }
    try {
      const hash = HashCache.computeHash(content);
      const sourceFile = this.createSourceFile(filePath, content);
      const symbols = this.extractSymbols(sourceFile);
      const imports = this.extractImports(sourceFile);
      const exports = this.extractExports(sourceFile);
      return { filePath, language, hash, timestamp: "", symbols, imports, exports };
    } catch {
      return null;
    }
  }

  /** Detect language from file extension */
  private detectLanguage(filePath: string): string | null {
    const ext = path.extname(filePath).toLowerCase();
    for (const [lang, exts] of Object.entries(LANGUAGE_EXTENSIONS)) {
      if (exts.includes(ext)) { return lang; }
    }
    return null;
  }

  /** Create TS source file for parsing */
  private createSourceFile(filePath: string, content: string): ts.SourceFile {
    return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  }

  /** Extract top-level symbols from AST */
  extractSymbols(sourceFile: ts.SourceFile): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];
    const visit = (node: ts.Node): void => {
      const sym = this.nodeToSymbol(node, sourceFile);
      if (sym) { symbols.push(sym); }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
    return symbols;
  }

  /** Convert an AST node to SymbolInfo if applicable */
  private nodeToSymbol(node: ts.Node, sf: ts.SourceFile): SymbolInfo | null {
    if (ts.isFunctionDeclaration(node) && node.name) {
      return this.buildSymbol(node, sf, node.name.text, "function");
    }
    if (ts.isClassDeclaration(node) && node.name) {
      return this.buildSymbol(node, sf, node.name.text, "class");
    }
    if (ts.isInterfaceDeclaration(node) && node.name) {
      return this.buildSymbol(node, sf, node.name.text, "interface");
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      return this.buildSymbol(node, sf, node.name.text, "variable");
    }
    if (ts.isMethodDeclaration(node) && node.name) {
      const name = node.name.getText(sf);
      return this.buildSymbol(node, sf, name, "method");
    }
    return null;
  }

  /** Build SymbolInfo from node position */
  private buildSymbol(
    node: ts.Node, sf: ts.SourceFile, name: string,
    kind: SymbolInfo["kind"]
  ): SymbolInfo {
    const start = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    const end = sf.getLineAndCharacterOfPosition(node.getEnd());
    return {
      name, kind,
      startLine: start.line + 1,
      endLine: end.line + 1,
      signature: node.getText(sf).split("\n")[0].trim(),
    };
  }

  /** Extract import declarations */
  extractImports(sourceFile: ts.SourceFile): ImportInfo[] {
    const imports: ImportInfo[] = [];
    for (const stmt of sourceFile.statements) {
      if (!ts.isImportDeclaration(stmt)) { continue; }
      const info = this.parseImport(stmt);
      if (info) { imports.push(info); }
    }
    return imports;
  }

  /** Parse a single import declaration */
  private parseImport(node: ts.ImportDeclaration): ImportInfo | null {
    const source = (node.moduleSpecifier as ts.StringLiteral).text;
    const clause = node.importClause;
    if (!clause) { return { source, names: [], importType: "namespace" }; }
    if (clause.name) {
      return { source, names: [clause.name.text], importType: "default" };
    }
    if (clause.namedBindings) {
      if (ts.isNamespaceImport(clause.namedBindings)) {
        return { source, names: [clause.namedBindings.name.text], importType: "namespace" };
      }
      const names = clause.namedBindings.elements.map((e) => e.name.text);
      return { source, names, importType: "named" };
    }
    return null;
  }

  /** Extract export declarations */
  extractExports(sourceFile: ts.SourceFile): ExportInfo[] {
    const exports: ExportInfo[] = [];
    for (const stmt of sourceFile.statements) {
      const exp = this.parseExportFromStatement(stmt);
      if (exp) { exports.push(...exp); }
    }
    return exports;
  }

  /** Parse export information from statement */
  private parseExportFromStatement(node: ts.Statement): ExportInfo[] | null {
    const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const hasExport = mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    const isDefault = mods?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    if (!hasExport) { return null; }
    if (ts.isFunctionDeclaration(node) && node.name) {
      return [{ name: node.name.text, kind: "function", isDefault: !!isDefault }];
    }
    if (ts.isClassDeclaration(node) && node.name) {
      return [{ name: node.name.text, kind: "class", isDefault: !!isDefault }];
    }
    if (ts.isInterfaceDeclaration(node)) {
      return [{ name: node.name.text, kind: "interface", isDefault: false }];
    }
    if (ts.isVariableStatement(node)) {
      return node.declarationList.declarations
        .filter((d) => ts.isIdentifier(d.name))
        .map((d) => ({ name: (d.name as ts.Identifier).text, kind: "variable", isDefault: !!isDefault }));
    }
    return null;
  }
}
