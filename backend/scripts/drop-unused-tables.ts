#!/usr/bin/env npx tsx
/**
 * One-off script: Drop confirmed-unused tables from the running KB SQLite database.
 *
 * Usage:
 *   npx tsx scripts/drop-unused-tables.ts [path/to/sa4e.db]
 *
 * Default DB path: data/sa4e.db (same default as MemoryModuleBuilder)
 * Tables are only dropped if they exist AND are empty.
 */
import Database from 'better-sqlite3';
import path from 'path';

const UNUSED_TABLES = [
  'entry_tags',
  'tags',
  'attachments',
  'templates',
  'feedback',
  'reminders',
  'popular_queries',
  'entity_index',
  'agent_scope_config',
];

const dbPath = process.argv[2] ?? path.join(process.cwd(), 'data', 'sa4e.db');
console.log(`Connecting to: ${dbPath}\n`);

const db = new Database(dbPath);

for (const table of UNUSED_TABLES) {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
  if (!exists) {
    console.log(`  SKIP  ${table} — does not exist`);
    continue;
  }

  const { cnt } = db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as { cnt: number };
  if (cnt > 0) {
    console.warn(`  SKIP  ${table} — has ${cnt} rows, not dropping`);
    continue;
  }

  db.exec(`DROP TABLE ${table}`);
  console.log(`  DROP  ${table}`);
}

db.close();
console.log('\nDone.');
