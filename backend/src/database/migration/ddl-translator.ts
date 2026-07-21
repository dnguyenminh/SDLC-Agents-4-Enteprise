/**
 * DDL Translator — Translates SQLite CREATE TABLE statements to other engines.
 * SA4E-45: Supports engine table migration (index.db schema → PG/MySQL).
 */

import type { DatabaseEngine } from '../adapters/DatabaseAdapter.js';

/** Translate SQLite DDL to the target engine dialect. */
export function translateCreateTable(ddl: string, target: DatabaseEngine): string {
  if (target === 'sqlite') return ddl;
  if (target === 'postgresql') return translateToPostgres(ddl);
  if (target === 'mysql') return translateToMySQL(ddl);
  return ddl;
}

function translateToPostgres(ddl: string): string {
  let result = ddl;
  result = result.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
  result = result.replace(/INTEGER PRIMARY KEY/gi, 'SERIAL PRIMARY KEY');
  result = result.replace(/DEFAULT\s*\(datetime\('now'\)\)/gi, 'DEFAULT NOW()');
  result = result.replace(/DEFAULT\s*datetime\('now'\)/gi, 'DEFAULT NOW()');
  result = result.replace(/\bBLOB\b/gi, 'BYTEA');
  result = result.replace(/\bTEXT\b/gi, 'TEXT');
  result = result.replace(/\bREAL\b/gi, 'DOUBLE PRECISION');
  return result;
}

function translateToMySQL(ddl: string): string {
  let result = ddl;
  result = result.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'INTEGER PRIMARY KEY AUTO_INCREMENT');
  result = result.replace(/DEFAULT\s*\(datetime\('now'\)\)/gi, 'DEFAULT CURRENT_TIMESTAMP');
  result = result.replace(/DEFAULT\s*datetime\('now'\)/gi, 'DEFAULT CURRENT_TIMESTAMP');
  result = result.replace(/\bBLOB\b/gi, 'LONGBLOB');
  return result;
}

/** Strip FTS virtual table statements (SQLite-only). */
export function isFtsTable(tableName: string): boolean {
  return tableName.includes('_fts') || tableName.endsWith('_content') ||
    tableName.endsWith('_segments') || tableName.endsWith('_segdir');
}

/** Remove FOREIGN KEY constraints from DDL to avoid ordering issues. */
export function removeForeignKeys(ddl: string): string {
  const lines = ddl.split('\n');
  const filtered = lines.filter(l => !l.trim().toUpperCase().startsWith('FOREIGN KEY'));
  let result = filtered.join('\n');
  result = result.replace(/,(\s*\))/g, '$1');
  return result;
}
