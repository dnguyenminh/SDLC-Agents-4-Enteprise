/**
 * FTS Recreation — Rebuilds full-text search infrastructure after migration.
 * SA4E-45: SQLite uses FTS5, PostgreSQL uses tsvector + GIN index.
 * SA4E-53: converted to async DatabaseAdapter for PostgreSQL compatibility.
 */

import type { DatabaseAdapter } from '../adapters/DatabaseAdapter.js';
import pino from 'pino';

const logger = pino({ name: 'fts-recreation' });

/** Recreate FTS infrastructure on the target adapter after data migration. */
export async function recreateFtsInfrastructure(adapter: DatabaseAdapter): Promise<void> {
  const engine = adapter.getEngine();
  if (engine === 'sqlite') {
    await recreateSqliteFts(adapter);
  } else if (engine === 'postgresql') {
    await recreatePostgresFts(adapter);
  } else {
    logger.warn(`[fts] FTS not supported for engine: ${engine}`);
  }
}

/** Recreate SQLite FTS5 virtual table and populate from base table. */
async function recreateSqliteFts(adapter: DatabaseAdapter): Promise<void> {
  try {
    await adapter.runAsync('DROP TABLE IF EXISTS knowledge_fts');
    await adapter.runAsync(`
      CREATE VIRTUAL TABLE knowledge_fts USING fts5(
        content, summary, tags, source, source_ref,
        content_rowid='id', tokenize='porter'
      )
    `);
    await adapter.runAsync(`
      INSERT INTO knowledge_fts(rowid, content, summary, tags, source, source_ref)
      SELECT id, content, summary, tags, source, source_ref
      FROM knowledge_entries WHERE archived = 0
    `);
    const count = await adapter.getAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM knowledge_fts',
    );
    logger.info(`[fts] SQLite FTS5 recreated with ${count?.cnt ?? 0} entries`);
  } catch (err) {
    logger.error({ err }, '[fts] Failed to recreate SQLite FTS5');
    throw err;
  }
}

/** Create PostgreSQL tsvector column + GIN index + update trigger. */
async function recreatePostgresFts(adapter: DatabaseAdapter): Promise<void> {
  try {
    await adapter.runAsync(`
      ALTER TABLE knowledge_entries
      ADD COLUMN IF NOT EXISTS tsvector_content tsvector
    `);
    await adapter.runAsync(`
      CREATE INDEX IF NOT EXISTS idx_ke_tsvector
      ON knowledge_entries USING GIN (tsvector_content)
    `);
    await adapter.runAsync(`
      CREATE OR REPLACE FUNCTION ke_tsvector_update() RETURNS trigger AS $$
      BEGIN
        NEW.tsvector_content :=
          setweight(to_tsvector('english', COALESCE(NEW.summary, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(NEW.tags, '')), 'B') ||
          setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'C');
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await adapter.runAsync(`
      DROP TRIGGER IF EXISTS trg_ke_tsvector ON knowledge_entries
    `);
    await adapter.runAsync(`
      CREATE TRIGGER trg_ke_tsvector
      BEFORE INSERT OR UPDATE ON knowledge_entries
      FOR EACH ROW EXECUTE FUNCTION ke_tsvector_update()
    `);
    await adapter.runAsync(`
      UPDATE knowledge_entries SET tsvector_content =
        setweight(to_tsvector('english', COALESCE(summary, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(tags, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(content, '')), 'C')
      WHERE archived = 0
    `);
    logger.info('[fts] PostgreSQL tsvector infrastructure created');
  } catch (err) {
    logger.error({ err }, '[fts] Failed to create PostgreSQL FTS');
    throw err;
  }
}
