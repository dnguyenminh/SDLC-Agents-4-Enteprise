import Database from 'better-sqlite3';
import type { ParseResult } from '../types.js';

export function storeResults(
  db: Database.Database, filePath: string, result: ParseResult,
): Map<string, number> {
  const symbolIds = new Map<string, number>();
  const transaction = db.transaction(() => {
    const fileRow = db.prepare('SELECT id FROM files WHERE relative_path = ?').get(filePath) as { id: number } | undefined;
    if (!fileRow) return;
    const fileId = fileRow.id;
    db.prepare('DELETE FROM symbols WHERE file_id = ?').run(fileId);
    try { db.prepare('DELETE FROM relationships WHERE file_path = ?').run(filePath); } catch { }
    const insertSym = db.prepare('INSERT INTO symbols (file_id, name, kind, signature, start_line, end_line, parent_symbol, visibility, doc_comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const sym of result.symbols) {
      const info = insertSym.run(fileId, sym.name, sym.kind, sym.signature, sym.startLine, sym.endLine, sym.parentName ?? null, sym.isExported ? 'export' : null, sym.docComment ?? null);
      symbolIds.set(sym.name, info.lastInsertRowid as number);
    }
    try {
      const insertRel = db.prepare('INSERT INTO relationships (source_symbol_id, target_symbol, target_symbol_id, kind, file_path, line, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const rel of result.relationships) {
        const sourceId = symbolIds.get(rel.sourceSymbol);
        if (!sourceId) continue;
        const targetId = symbolIds.get(rel.targetSymbol) ?? null;
        insertRel.run(sourceId, rel.targetSymbol, targetId, rel.kind, filePath, rel.line, rel.metadata ? JSON.stringify(rel.metadata) : null);
      }
    } catch { }
  });
  transaction();
  return symbolIds;
}

export function storeRegexResults(
  db: Database.Database, filePath: string,
  symbols: ReadonlyArray<{ name: string; kind: string; signature: string; startLine: number; endLine: number; parentSymbol: string | null; visibility: string | null; docComment: string | null }>,
): void {
  const transaction = db.transaction(() => {
    const fileRow = db.prepare('SELECT id FROM files WHERE relative_path = ?').get(filePath) as { id: number } | undefined;
    if (!fileRow) return;
    const fileId = fileRow.id;
    db.prepare('DELETE FROM symbols WHERE file_id = ?').run(fileId);
    const insertSym = db.prepare('INSERT INTO symbols (file_id, name, kind, signature, start_line, end_line, parent_symbol, visibility, doc_comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const sym of symbols) {
      insertSym.run(fileId, sym.name, sym.kind, sym.signature, sym.startLine, sym.endLine, sym.parentSymbol, sym.visibility, sym.docComment);
    }
  });
  transaction();
}

export function extractAndStoreBodies(
  db: Database.Database, filePath: string, source: string,
  result: ParseResult, symbolIds: Map<string, number>,
): void {
  try {
    const lines = source.split('\n');
    const functionKinds = new Set(['function', 'method', 'arrow_function', 'generator', 'function_declaration']);
    const minBodyLines = 3;
    const insertBody = db.prepare('INSERT OR REPLACE INTO body_embeddings (symbol_id, chunk_index, embedding, token_count) VALUES (?, ?, ?, ?)');
    for (const sym of result.symbols) {
      if (!functionKinds.has(sym.kind)) continue;
      const symbolId = symbolIds.get(sym.name);
      if (!symbolId) continue;
      const bodyLines = lines.slice(sym.startLine - 1, sym.endLine);
      if (bodyLines.length < minBodyLines) continue;
      const bodyText = bodyLines.join('\n');
      const tokenCount = bodyText.split(/\s+/).filter(Boolean).length;
      const textBuffer = Buffer.from(bodyText, 'utf-8');
      insertBody.run(symbolId, 0, textBuffer, tokenCount);
    }
  } catch { }
}
