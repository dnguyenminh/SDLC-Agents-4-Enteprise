/**
 * KSA-169: Incremental Updater — Detect file changes using FNV-1a content hashing.
 * Compares disk state against stored file_index to determine what needs re-indexing.
 */

import * as fs from 'fs';
import Database from 'better-sqlite3';
import pino from 'pino';

const logger = pino({ name: 'incremental-updater' });

export interface ChangeSet {
  added: string[];
  modified: string[];
  deleted: string[];
  unchanged: number;
}

export class IncrementalUpdater {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /** Scan workspace and compare against stored file index. */
  scanChanges(files: { relativePath: string; absolutePath: string }[]): ChangeSet {
    const result: ChangeSet = { added: [], modified: [], deleted: [], unchanged: 0 };

    const indexedPaths = new Set<string>();
    const rows = this.db.prepare('SELECT path, content_hash, mtime FROM file_index').all() as {
      path: string; content_hash: string; mtime: number;
    }[];
    const indexMap = new Map(rows.map(r => [r.path, r]));
    for (const r of rows) indexedPaths.add(r.path);

    for (const file of files) {
      const indexed = indexMap.get(file.relativePath);

      if (!indexed) {
        result.added.push(file.relativePath);
        continue;
      }

      indexedPaths.delete(file.relativePath);

      try {
        const stat = fs.statSync(file.absolutePath);
        const mtime = Math.floor(stat.mtimeMs);

        if (mtime !== indexed.mtime) {
          const content = fs.readFileSync(file.absolutePath);
          const hash = fnv1aHash(content);

          if (hash !== indexed.content_hash) {
            result.modified.push(file.relativePath);
          } else {
            this.updateMtime(file.relativePath, mtime);
            result.unchanged++;
          }
        } else {
          result.unchanged++;
        }
      } catch {
        result.deleted.push(file.relativePath);
      }
    }

    for (const deletedPath of indexedPaths) {
      result.deleted.push(deletedPath);
    }

    return result;
  }

  /** Update file index entry after successful indexing. */
  updateFileIndex(relativePath: string, absolutePath: string, symbolCount: number): void {
    try {
      const stat = fs.statSync(absolutePath);
      const content = fs.readFileSync(absolutePath);
      const hash = fnv1aHash(content);

      this.db.prepare(`
        INSERT OR REPLACE INTO file_index (path, mtime, content_hash, size_bytes, last_indexed, symbol_count)
        VALUES (?, ?, ?, ?, datetime('now'), ?)
      `).run(relativePath, Math.floor(stat.mtimeMs), hash, stat.size, symbolCount);
    } catch (err) {
      logger.error({ err }, `[incremental-updater] Failed to update index for ${relativePath}:`);
    }
  }

  /** Remove a file from the index. */
  removeFromIndex(relativePath: string): void {
    this.db.prepare('DELETE FROM file_index WHERE path = ?').run(relativePath);
  }

  /** Get total indexed file count. */
  getIndexedCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM file_index').get() as { count: number };
    return row.count;
  }

  private updateMtime(relativePath: string, mtime: number): void {
    this.db.prepare('UPDATE file_index SET mtime = ? WHERE path = ?').run(mtime, relativePath);
  }
}

/** FNV-1a 32-bit hash for fast content comparison. */
export function fnv1aHash(data: Buffer): string {
  const FNV_OFFSET = 2166136261;
  const FNV_PRIME = 16777619;
  let hash = FNV_OFFSET;

  for (let i = 0; i < data.length; i++) {
    hash ^= data[i];
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
}
