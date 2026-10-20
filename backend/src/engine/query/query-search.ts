/** Query layer search backends — FTS5 / tsvector / ILIKE (BR-18 extraction). */
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { buildCodeScopeFilter, type CodeScopeFilter } from './code-intel-isolation.js';
import type { SearchResult } from './query-utils.js';
import { sanitizeFtsQuery, sanitizeLikeQuery } from './query-utils.js';

/** Dual-dialect entry point: SQLite FTS5, PostgreSQL tsvector, ILIKE fallback. */
export async function searchCode(
  adapter: DatabaseAdapter,
  projectId: string | undefined,
  query: string,
  limit = 20,
): Promise<SearchResult[]> {
  const scope = buildCodeScopeFilter(projectId, 's');
  if (adapter.getEngine() === 'sqlite') {
    try {
      return await searchCodeSqlite(adapter, scope, sanitizeFtsQuery(query), limit);
    } catch {
      return [];
    }
  }
  return searchCodePortable(adapter, scope, query, limit);
}

/** SQLite FTS5 search against the symbols_fts virtual table. */
async function searchCodeSqlite(
  adapter: DatabaseAdapter,
  scope: CodeScopeFilter,
  ftsQuery: string,
  limit: number,
): Promise<SearchResult[]> {
  return adapter.allAsync<SearchResult>(
    `SELECT s.name, s.kind, s.signature, f.relative_path as filePath,
            s.start_line as startLine, s.end_line as endLine,
            s.doc_comment as docComment, rank
     FROM symbols_fts
     JOIN symbols s ON symbols_fts.rowid = s.id
     JOIN files f ON s.file_id = f.id
     WHERE symbols_fts MATCH ? AND ${scope.clause}
     ORDER BY rank LIMIT ?`,
    [ftsQuery, ...scope.params, limit],
  );
}

/**
 * Full-text search for PostgreSQL using the `search_tsv` tsvector column
 * (created by the graph migrator). Ranks by ts_rank and falls back to an
 * ILIKE substring search when the query has no usable full-text terms.
 */
async function searchCodePortable(
  adapter: DatabaseAdapter,
  scope: CodeScopeFilter,
  query: string,
  limit: number,
): Promise<SearchResult[]> {
  const tsTerms = sanitizeLikeQuery(query);
  if (adapter.getEngine() === 'postgresql' && tsTerms) {
    const rows = await searchCodePostgresFts(adapter, scope, tsTerms, limit);
    if (rows.length > 0) return rows;
  }
  return searchCodeLike(adapter, scope, tsTerms, limit);
}

/** PostgreSQL tsvector full-text search ranked by ts_rank. */
async function searchCodePostgresFts(
  adapter: DatabaseAdapter,
  scope: CodeScopeFilter,
  terms: string,
  limit: number,
): Promise<SearchResult[]> {
  const tsQuery = terms.split(/\s+/).filter(Boolean).join(' | ');
  return adapter.allAsync<SearchResult>(
    `SELECT s.name, s.kind, s.signature, f.relative_path as filePath,
            s.start_line as startLine, s.end_line as endLine,
            s.doc_comment as docComment,
            ts_rank(s.search_tsv, to_tsquery('english', ?)) as rank
     FROM symbols s
     JOIN files f ON s.file_id = f.id
     WHERE s.search_tsv @@ to_tsquery('english', ?) AND ${scope.clause}
     ORDER BY rank DESC LIMIT ?`,
    [tsQuery, tsQuery, ...scope.params, limit],
  );
}

/**
 * Portable ILIKE substring search — used as the PostgreSQL fallback and for
 * any other non-SQLite engine. Matches name, signature and doc comment.
 */
async function searchCodeLike(
  adapter: DatabaseAdapter,
  scope: CodeScopeFilter,
  terms: string,
  limit: number,
): Promise<SearchResult[]> {
  const pattern = `%${terms}%`;
  return adapter.allAsync<SearchResult>(
    `SELECT s.name, s.kind, s.signature, f.relative_path as filePath,
            s.start_line as startLine, s.end_line as endLine,
            s.doc_comment as docComment, 0 as rank
     FROM symbols s
     JOIN files f ON s.file_id = f.id
     WHERE (s.name ILIKE ? OR s.signature ILIKE ? OR s.doc_comment ILIKE ?)
       AND ${scope.clause}
     ORDER BY s.name LIMIT ?`,
    [pattern, pattern, pattern, ...scope.params, limit],
  );
}
