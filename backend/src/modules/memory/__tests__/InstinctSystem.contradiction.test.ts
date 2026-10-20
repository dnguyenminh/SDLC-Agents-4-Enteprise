/**
 * SA4E-121: Instincts and Confidence Scoring System — unit tests.
 * This file: ContradictionService.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { InstinctConfigService } from '../evolution/InstinctConfigService.js';
import { ContradictionService } from '../evolution/ContradictionService.js';
import pino from 'pino';
import { createInstinctTestDb } from './fixtures.js';

const logger = pino({ level: 'silent' });

describe('ContradictionService', () => {
  let adapter: SqliteAdapter;
  let configSvc: InstinctConfigService;
  let svc: ContradictionService;

  beforeEach(async () => {
    adapter = await createInstinctTestDb();
    configSvc = new InstinctConfigService(adapter);
    await configSvc.seedDefaults();
    // Lower threshold to make detection easier in tests
    await configSvc.setInstinctConfig({ contradiction_similarity_threshold: 0.5 });
    svc = new ContradictionService(adapter, configSvc, logger);
  });

  it('should detect no contradictions for unique content', async () => {
    await adapter.runAsync(
      `INSERT INTO knowledge_entries (content, summary) VALUES (?, ?)`,
      ['The sky is blue', 'sky color'],
    );
    await adapter.runAsync(
      `INSERT INTO knowledge_entries (content, summary) VALUES (?, ?)`,
      ['Dogs are loyal animals', 'dogs'],
    );
    const report = await svc.detectContradictions(2);
    expect(report.contradictions.length).toBe(0);
  });

  it('should detect contradiction for very similar content', async () => {
    const text = 'The recommended approach for error handling is to use try-catch blocks with specific error types';
    await adapter.runAsync(
      `INSERT INTO knowledge_entries (content, summary) VALUES (?, ?)`,
      [text, 'error handling v1'],
    );
    // Nearly identical content
    await adapter.runAsync(
      `INSERT INTO knowledge_entries (content, summary) VALUES (?, ?)`,
      [text + ' and log them', 'error handling v2'],
    );
    const report = await svc.detectContradictions(2);
    expect(report.contradictions.length + report.superseded).toBeGreaterThan(0);
  });

  it('should resolve contradiction', async () => {
    // Insert a contradiction manually
    await adapter.runAsync(
      `INSERT INTO knowledge_entries (content, summary) VALUES ('A', 'a')`,
    );
    await adapter.runAsync(
      `INSERT INTO knowledge_entries (content, summary) VALUES ('B', 'b')`,
    );
    await adapter.runAsync(
      `INSERT INTO contradiction_log (entry_id_a, entry_id_b, similarity, classification) VALUES (1, 2, 0.9, 'CONTRADICTION')`,
    );

    const result = await svc.resolveContradiction(1, 'resolve_keep_new');
    expect(result.resolved).toBe(true);
    expect(result.strategy).toBe('resolve_keep_new');
  });

  it('should throw ALREADY_RESOLVED on double-resolve', async () => {
    await adapter.runAsync(`INSERT INTO knowledge_entries (content, summary) VALUES ('A', 'a')`);
    await adapter.runAsync(`INSERT INTO knowledge_entries (content, summary) VALUES ('B', 'b')`);
    await adapter.runAsync(
      `INSERT INTO contradiction_log (entry_id_a, entry_id_b, similarity, classification, status) VALUES (1, 2, 0.9, 'CONTRADICTION', 'resolved')`,
    );
    await expect(svc.resolveContradiction(1, 'resolve_both')).rejects.toThrow('ALREADY_RESOLVED');
  });

  it('should throw INVALID_RESOLUTION for unknown strategy', async () => {
    await adapter.runAsync(`INSERT INTO knowledge_entries (content, summary) VALUES ('A', 'a')`);
    await adapter.runAsync(`INSERT INTO knowledge_entries (content, summary) VALUES ('B', 'b')`);
    await adapter.runAsync(
      `INSERT INTO contradiction_log (entry_id_a, entry_id_b, similarity, classification) VALUES (1, 2, 0.9, 'CONTRADICTION')`,
    );
    await expect(svc.resolveContradiction(1, 'invalid_strategy')).rejects.toThrow('INVALID_RESOLUTION');
  });

  it('should return warnings for entries with unresolved contradictions', async () => {
    await adapter.runAsync(`INSERT INTO knowledge_entries (content, summary) VALUES ('A', 'a')`);
    await adapter.runAsync(`INSERT INTO knowledge_entries (content, summary) VALUES ('B', 'b')`);
    await adapter.runAsync(
      `INSERT INTO contradiction_log (entry_id_a, entry_id_b, similarity, classification) VALUES (1, 2, 0.9, 'CONTRADICTION')`,
    );
    const warnings = await svc.getWarnings([1, 2, 999]);
    expect(warnings.has(1)).toBe(true);
    expect(warnings.has(2)).toBe(true);
    expect(warnings.has(999)).toBe(false);
  });
});
