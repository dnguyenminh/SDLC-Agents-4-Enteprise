/**
 * Index Helper — Standalone file indexing and DB operations.
 */

import type Database from 'better-sqlite3';
import * as fs from 'fs';
import type { Logger } from 'pino';
import type { ScannedFile } from '../scanner/file-scanner.js';
import { extractSymbols } from '../scanner/signature-extractor.js';
import { detectModule } from './module-helper.js';

/** Check if file content hash matches the database (unchanged). */
export function isFileUnchanged(db: Database.Database, file: ScannedFile): boolean {
  const row = db.prepare(
    'SELECT content_hash FROM files WHERE relative_path = ?'
  ).get(file.relativePath) as { content_hash: string } | undefined;
  return row?.content_hash === file.contentHash;
}

/** Legacy regex-based symbol extraction (used when tree-sitter unavailable). */
export function indexFileSymbolsRegex(
  file: ScannedFile, fileId: number, insertStmt: Database.Statement, logger: Logger
): void {
  try {
    const content = fs.readFileSync(file.absolutePath, 'utf-8');
    const symbols = extractSymbols(content, file.language);
    for (const sym of symbols) {
      insertStmt.run(
        fileId, sym.name, sym.kind, sym.signature,
        sym.startLine, sym.endLine, sym.parentSymbol,
        sym.visibility, sym.docComment
      );
    }
  } catch (err) {
    logger.error({ err }, `[indexer] Error indexing ${file.relativePath}:`);
  }
}

/** Upsert a file record in the database. */
export function upsertFileInDb(db: Database.Database, file: ScannedFile): void {
  const module = detectModule(file.relativePath);
  db.prepare(`
    INSERT OR REPLACE INTO files (path, relative_path, language, module, content_hash, size_bytes, line_count, last_indexed)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(file.absolutePath, file.relativePath, file.language, module, file.contentHash, file.sizeBytes, file.lineCount);
}

/** Regex fallback for file upsert (delete + re-insert symbols). */
export function upsertFileRegexFallback(db: Database.Database, file: ScannedFile, logger: Logger): void {
  const fileRow = db.prepare(
    'SELECT id FROM files WHERE relative_path = ?'
  ).get(file.relativePath) as { id: number } | undefined;
  if (!fileRow) return;

  db.prepare('DELETE FROM symbols WHERE file_id = ?').run(fileRow.id);
  const insertSymbol = db.prepare(`
    INSERT INTO symbols (file_id, name, kind, signature, start_line, end_line, parent_symbol, visibility, doc_comment)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  indexFileSymbolsRegex(file, fileRow.id, insertSymbol, logger);
}
