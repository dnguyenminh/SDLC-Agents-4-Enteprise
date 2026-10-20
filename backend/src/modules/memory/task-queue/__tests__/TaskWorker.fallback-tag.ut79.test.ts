/**
 * STC UT-79 / UT-80 / UT-82 — fallbackTagExtraction (SA4E-337 Fix #5, Bug #5).
 * (Split from TaskWorker.fallback-tag.test.ts — BR-18 ≤200 lines/file.)
 *
 * Testdata reference: documents/SA4E-337/testdata/fallback-tag-testdata.csv and
 * documents/SA4E-337/STC.md §5.
 *
 * Spec reconciliation (documented deviation, see report to SM):
 * - FSD TC-11 + STC UT-82 say a ROOT-LEVEL file (no folder) falls back to
 *   `documents`; fallback-tag-testdata row `root.md → [unknown]` says BR-24.
 *   Resolution: root-level file → `documents`; `unknown` is used when NOTHING is
 *   derivable (BR-24 "fallback fails" = empty/missing source + no content tags).
 * - FSD TC-13 "collect-all deep folders" vs BR-20 "MUST use immediate parent":
 *   BR-20 (business rule) wins — only the nearest non-denylisted folder is added.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { extractFallbackTags } from '../TaskWorker.js';
import { extractTagsFromPath } from '../../../../server/routes/api-index-ingest.js';
import { runFallback, setupFallbackDb } from './TaskWorker.fallback-tag.fixtures.js';
import type { SqliteAdapter } from '../../../../database/adapters/SqliteAdapter.js';
import type { SqliteDbAdapter } from '../SqliteDbAdapter.js';
import type { MemoryEngine } from '../../engine/index.js';

describe('fallbackTagExtraction (STC UT-79..82 — LLM unavailable)', () => {
  let db: SqliteAdapter;
  let adapter: SqliteDbAdapter;
  let engine: MemoryEngine;

  beforeEach(async () => {
    ({ db, adapter, engine } = await setupFallbackDb('fallback-tag-test'));
  });

  afterEach(async () => { await db.disconnect(); });

  // ── STC UT-79: parent path + content tags, task COMPLETED ──────────────
  describe('UT-79: fallback applies parent-path + content tags', () => {
    it('payload source …/SA4E-337/BRD.md + #### STORY → sa4e, sa4e-337, brd, user-story', () => {
      const tags = extractFallbackTags({
        source: 'documents/SA4E-337/BRD.md',
        content: '#### STORY 1\nAs a user I want to ingest documents',
        existing_tags: '',
      });
      expect(tags).toEqual(expect.arrayContaining(['sa4e', 'sa4e-337', 'brd', 'user-story']));
      expect(tags).toHaveLength(new Set(tags).size); // no duplicates
    });

    it('CSV rows: immediate parent folder name is the fallback tag (BR-20)', () => {
      expect(extractFallbackTags({ source: 'dev/notes.md' })).toEqual(expect.arrayContaining(['dev']));
      expect(extractFallbackTags({ source: 'docs-old/report.md' })).toEqual(expect.arrayContaining(['docs-old']));
      expect(extractFallbackTags({ source: 'projects/x/y/file.md' })).toEqual(expect.arrayContaining(['y']));
      expect(extractFallbackTags({ source: 'archive/2024/report.md' })).toEqual(expect.arrayContaining(['2024']));
    });

    it('end-to-end: DB row is tagged, task COMPLETED, enrichment closed (F4)', async () => {
      const id = await engine.insert({
        content: '#### STORY 1\nDocument ingest requirement', summary: 'BRD', type: 'REQUIREMENT',
        tier: 'SHARED', source: 'documents/SA4E-337/BRD.md', tags: '',
      });
      const result = await runFallback(db, engine, id, {
        entry_id: id,
        content: '#### STORY 1\nDocument ingest requirement',
        existing_tags: '',
        source: 'documents/SA4E-337/BRD.md',
      });

      expect(result.tags.split(',')).toEqual(expect.arrayContaining(['sa4e', 'sa4e-337', 'brd', 'user-story']));
      expect(result.taskStatus).toBe('COMPLETED');
      // F4: entry must NOT stay 'pending' when the LLM is down
      expect(result.enrichment_status).toBe('done');
      expect(result.enriched_by).toBe('fallback');
    });
  });

  // ── STC UT-80: dedup + denylist ────────────────────────────────────────
  describe('UT-80: deduplication + denylist skip (BR-22/BR-23)', () => {
    it('existing sa4e-337 + path SA4E-337 → single tag; denylisted diagrams folder unused', async () => {
      const id = await engine.insert({
        content: 'diagrams and tags', summary: 'Diagrams', type: 'CONTEXT',
        tier: 'WORKING', source: 'documents/SA4E-337/diagrams/arch.png', tags: '',
      });
      const result = await runFallback(db, engine, id, {
        entry_id: id,
        content: 'diagrams and tags',
        existing_tags: 'sa4e-337',
        source: 'documents/SA4E-337/diagrams/arch.png',
      });

      const tags = result.tags.split(',').map((t) => t.trim()).filter(Boolean);
      expect(tags.filter((t) => t.toLowerCase() === 'sa4e-337')).toHaveLength(1); // BR-22
      expect(tags).not.toContain('diagrams'); // BR-23 — denylisted parent skipped (TC-16)
      expect(tags).toEqual(expect.arrayContaining(['sa4e']));
      expect(result.taskStatus).toBe('COMPLETED');
    });

    it('denylisted parent falls through to the nearest non-denylisted ancestor (FSD EF-2)', () => {
      const tags = extractFallbackTags({ source: 'documents/SA4E-337/templates/tpl.md' });
      expect(tags).not.toContain('templates');
      expect(tags).toEqual(expect.arrayContaining(['sa4e-337']));
    });

    it('parent folder equal to the file name stem is added once (CSV backup/backup.md)', () => {
      const tags = extractFallbackTags({ source: 'backup/backup.md' });
      expect(tags).toEqual(['backup']);
    });
  });

  // ── STC UT-82: nested secondary tag + root fallback + never empty ──────
  describe('UT-82: nested secondary tag + root-level fallback + never empty', () => {
    it('nested ticket folder: primary ticket tag + secondary attachments tag', () => {
      // Primary half comes from the ingest route (extractTagsFromPath)…
      const primary = extractTagsFromPath('SA4E-337/attachments/spec.pdf');
      expect(primary).toEqual(expect.arrayContaining(['sa4e-337']));
      // …secondary half from the fallback (FSD §5 Fix #5) — Story 5 AC-2
      const tags = extractFallbackTags({ source: 'documents/SA4E-337/attachments/scan.pdf' });
      expect(tags).toEqual(expect.arrayContaining(['sa4e-337', 'attachments']));
    });

    it('root-level file falls back to `documents` (FSD TC-11 / Story 5 AC-3)', () => {
      expect(extractFallbackTags({ source: 'overview.md' })).toEqual(['documents']);
      expect(extractFallbackTags({ source: 'documents/overview.md' })).toEqual(['documents']);
      expect(extractFallbackTags({ source: 'documents/x.md' })).toEqual(['documents']);
    });

    it('non-ticket path falls back to the parent folder tag (BR-20)', () => {
      expect(extractFallbackTags({ source: 'attachments/spec.pdf' })).toEqual(['attachments']);
    });

    it('never empty — empty source/content degrades to `unknown` (BR-08/BR-11/BR-24)', () => {
      expect(extractFallbackTags({ source: '', content: '' })).toEqual(['unknown']);
      expect(extractFallbackTags({})).toEqual(['unknown']);
      expect(extractFallbackTags({ source: 'diagrams/x.md', content: '' })).toEqual(['unknown']);
      // Content heuristics alone still produce a non-empty result
      expect(extractFallbackTags({ source: '', content: '## Architecture' }))
        .toEqual(expect.arrayContaining(['architecture']));
    });
  });
});
