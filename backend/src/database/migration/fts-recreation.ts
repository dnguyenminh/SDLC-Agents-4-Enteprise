/**
 * FTS Recreation — Rebuilds full-text search infrastructure after migration.
 * SA4E-45: SQLite uses FTS5, PostgreSQL uses tsvector + GIN index.
 */

import type { DatabaseAdapter } from '../adapters/DatabaseAdapter.js';
import pino from 'pino';

const logger = pino({ name: 'fts-recreation' });

/** Recreate FTS infrastructure on the target adapter after data migration. */
export function recreateFtsInfrastructure(adapter: DatabaseAdapter): void {
  const engine = adapter.getEngine();
  if (engine === 'sqlite') {
    recreateSqliteFts(adapter);
  } else if (engine === 'postgresql') {
    recreatePostgresFts(adapter);
  } else {
    logger.warn(`[fts] FTS not supported for engine: ${engine}`);
  }
}

/** Recreate SQLite FTS5 virtual table and populate from base table. */
function recreateSqliteFts(adapter: DatabaseAdapter): void {
  try {
    adapter.exec('DROP TABLE IF EXISTS knowledge_fts');
    adapter.exec(`
      CREATE VIRTUAL TABLE knowledge_fts USING fts5(
        content, summary, tags, source, source_ref,
        content_rowid=''id'', tokenize=''porter''
      )
    `);
    adapter.exec(`
      INSERT INTO knowledge_fts(rowid, content, summary, tags, source, source_ref)
      SELECT id, content, summary, tags, source, source_ref
      FROM knowledge_entries WHERE archived = 0
    `);
    const count = adapter.get<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM knowledge_fts',
    );
    logger.info(`[fts] SQLite FTS5 recreated with ${count?.cnt ?? 0} entries`);
  } catch (err) {
    logger.error({ err }, '[fts] Failed to recreate SQLite FTS5');
    throw err;
  }
}

/** Create PostgreSQL tsvector column + GIN index + update trigger. */
function recreatePostgresFts(adapter: DatabaseAdapter): void {
  try {
    addTsvectorColumn(adapter);
    createGinIndex(adapter);
    createUpdateTrigger(adapter);
    populateTsvector(adapter);
    logger.info('[fts] PostgreSQL tsvector infrastructure created');
  } catch (err) {
    logger.error({ err }, '[fts] Failed to create PostgreSQL FTS');
    throw err;
  }
}

function addTsvectorColumn(adapter: DatabaseAdapter): void {
  adapter.exec(`
    ALTER TABLE knowledge_entries
    ADD COLUMN IF NOT EXISTS tsvector_content tsvector
  `);
}

function createGinIndex(adapter: DatabaseAdapter): void {
  adapter.exec(`
    CREATE INDEX IF NOT EXISTS idx_ke_tsvector
    ON knowledge_entries USING GIN (tsvector_content)
  `);
}

function createUpdateTrigger(adapter: DatabaseAdapter): void {
  adapter.exec(`
    CREATE OR REPLACE FUNCTION ke_tsvector_update() RETURNS trigger AS $$
    BEGIN
      NEW.tsvector_content :=
        setweight(to_tsvector(''english'', COALESCE(NEW.summary, '''')), ''A'') ||
        setweight(to_tsvector(''english'', COALESCE(NEW.tags, '''')), ''B'') ||
        setweight(to_tsvector(''english'', COALESCE(NEW.content, '''')), ''C'');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  adapter.exec(`
    DROP TRIGGER IF EXISTS trg_ke_tsvector ON knowledge_entries
  `);
  adapter.exec(`
    CREATE TRIGGER trg_ke_tsvector
    BEFORE INSERT OR UPDATE ON knowledge_entries
    FOR EACH ROW EXECUTE FUNCTION ke_tsvector_update()
  `);
}

function populateTsvector(adapter: DatabaseAdapter): void {
  adapter.exec(`
    UPDATE knowledge_entries SET tsvector_content =
      setweight(to_tsvector(''english'', COALESCE(summary, '''')), ''A'') ||
      setweight(to_tsvector(''english'', COALESCE(tags, '''')), ''B'') ||
      setweight(to_tsvector(''english'', COALESCE(content, '''')), ''C'')
    WHERE archived = 0
  `);
}
