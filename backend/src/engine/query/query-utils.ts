/** Query layer shared types, column projections and sanitizers (BR-18 extraction). */

export interface SearchResult {
  name: string;
  kind: string;
  signature: string;
  filePath: string;
  startLine: number;
  endLine: number;
  docComment: string | null;
  rank: number;
}

export interface SymbolInfo {
  name: string;
  kind: string;
  signature: string;
  filePath: string;
  startLine: number;
  endLine: number;
  visibility: string | null;
  docComment: string | null;
  parentSymbol: string | null;
}

export interface ModuleInfo {
  name: string;
  rootPath: string;
  language: string | null;
  description: string | null;
  fileCount: number;
  symbolCount: number;
  diStyle: string | null;
  errorHandling: string | null;
  namingConvention: string | null;
  loggingFramework: string | null;
  testingFramework: string | null;
  purpose: string | null;
}

export interface IndexStatus {
  totalFiles: number;
  totalSymbols: number;
  totalModules: number;
  languages: Record<string, number>;
  lastIndexed: string | null;
}

/** SA4E-360 — one located symbol row with slice bounds (TDD §4.2 output). */
export interface LocateRow {
  name: string;
  kind: string;
  signature: string | null;
  filePath: string;
  startLine: number;
  endLine: number;
  lineCount: number;
  parentSymbol: string | null;
}

export const MODULE_COLUMNS = `name, root_path as rootPath, language, description,
  file_count as fileCount, symbol_count as symbolCount,
  di_style as diStyle, error_handling as errorHandling,
  naming_convention as namingConvention,
  logging_framework as loggingFramework,
  testing_framework as testingFramework, purpose`;

export const SYMBOL_COLUMNS = `s.name, s.kind, s.signature, f.relative_path as filePath,
  s.start_line as startLine, s.end_line as endLine,
  s.visibility, s.doc_comment as docComment, s.parent_symbol as parentSymbol`;

export function sanitizeFtsQuery(query: string): string {
  return query.replace(/[^\w\s*"]/g, ' ').trim() || '*';
}

/**
 * Sanitize a query for use inside a LIKE/ILIKE pattern.
 * Strips FTS operators and escapes LIKE wildcards (% and _) so user input is
 * matched literally rather than as a wildcard pattern.
 */
export function sanitizeLikeQuery(query: string): string {
  return query
    .replace(/[*"]/g, ' ')
    .replace(/[%_\\]/g, '\\$&')
    .replace(/\s+/g, ' ')
    .trim();
}
