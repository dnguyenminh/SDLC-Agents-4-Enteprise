/**
 * SA4E-337 F4 — race guard on the fallback UPDATE + enrichment_status close.
 * (Split from TaskWorker.fallback-tag.test.ts — BR-18 ≤200 lines/file.)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runFallback, setupFallbackDb } from './TaskWorker.fallback-tag.fixtures.js';
import type { SqliteAdapter } from '../../../../database/adapters/SqliteAdapter.js';
import type { SqliteDbAdapter } from '../SqliteDbAdapter.js';
import type { MemoryEngine } from '../../engine/index.js';

describe('fallbackTagExtraction F4: race guard + enrichment_status close', () => {
  let db: SqliteAdapter;
  let adapter: SqliteDbAdapter;
  let engine: MemoryEngine;

  beforeEach(async () => {
    ({ db, adapter, engine } = await setupFallbackDb('fallback-f4-test'));
  });

  afterEach(async () => { await db.disconnect(); });

  it('does NOT overwrite tags of an entry already enriched by the client (status=done)', async () => {
    const id = await engine.insert({
      content: 'client enriched content', summary: 'Client', type: 'CONTEXT',
      tier: 'WORKING', source: 'documents/SA4E-337/FSD.md', tags: 'client-tag',
    });
    // Simulate the client winning the race (enrich.ts sets status=done, enriched_by=client_llm)
    await db.run('UPDATE knowledge_entries SET enrichment_status = ? WHERE id = ?', ['done', id]);

    const result = await runFallback(db, engine, id, {
      entry_id: id,
      content: 'client enriched content',
      existing_tags: 'client-tag',
      source: 'documents/SA4E-337/FSD.md',
    });

    expect(result.tags).toBe('client-tag'); // untouched — race guard held
    expect(result.enriched_by).toBeNull();
    expect(result.taskStatus).toBe('COMPLETED'); // task still completes
  });

  it('pending entry gets tags written AND is closed to done/fallback (no stuck pending)', async () => {
    const id = await engine.insert({
      content: '## Architecture\nsystem design', summary: 'TDD', type: 'ARCHITECTURE',
      tier: 'SHARED', source: 'documents/SA4E-337/TDD.md', tags: '',
    });
    await db.run('UPDATE knowledge_entries SET enrichment_status = ? WHERE id = ?', ['pending', id]);

    const result = await runFallback(db, engine, id, {
      entry_id: id,
      content: '## Architecture\nsystem design',
      existing_tags: '',
      source: 'documents/SA4E-337/TDD.md',
    });

    expect(result.tags.split(',')).toEqual(expect.arrayContaining(['sa4e-337', 'tdd', 'architecture']));
    expect(result.enrichment_status).toBe('done');
    expect(result.enriched_by).toBe('fallback');
    expect(result.taskStatus).toBe('COMPLETED');
  });
});
