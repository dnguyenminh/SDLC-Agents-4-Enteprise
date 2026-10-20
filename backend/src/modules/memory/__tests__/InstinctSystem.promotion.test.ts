/**
 * SA4E-121: Instincts and Confidence Scoring System — unit tests.
 * This file: InstinctPromotionService.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { InstinctConfigService } from '../evolution/InstinctConfigService.js';
import { InstinctPromotionService } from '../evolution/InstinctPromotionService.js';
import pino from 'pino';
import { createInstinctTestDb } from './fixtures.js';

const logger = pino({ level: 'silent' });

describe('InstinctPromotionService', () => {
  let adapter: SqliteAdapter;
  let configSvc: InstinctConfigService;
  let svc: InstinctPromotionService;

  beforeEach(async () => {
    adapter = await createInstinctTestDb();
    configSvc = new InstinctConfigService(adapter);
    await configSvc.seedDefaults();
    svc = new InstinctPromotionService(adapter, configSvc, logger);
  });

  it('should not promote if criteria not met (low confidence)', async () => {
    await adapter.runAsync(
      `INSERT INTO knowledge_entries (content, summary, type, confidence, tags) VALUES (?, ?, ?, ?, ?)`,
      ['My instinct', 'instinct', 'INSTINCT', 0.5, 'instinct'],
    );
    const result = await svc.checkAndPromote(1);
    expect(result.promoted).toBe(false);
    expect(result.reason).toBe('CRITERIA_NOT_MET');
  });

  it('should not promote if not enough successful outcomes', async () => {
    await adapter.runAsync(
      `INSERT INTO knowledge_entries (content, summary, type, confidence, tags) VALUES (?, ?, ?, ?, ?)`,
      ['My instinct', 'instinct', 'INSTINCT', 0.9, 'instinct'],
    );
    // Only 2 successes, threshold is 3
    await adapter.runAsync(`INSERT INTO entry_outcomes (entry_id, outcome) VALUES (1, 'success')`);
    await adapter.runAsync(`INSERT INTO entry_outcomes (entry_id, outcome) VALUES (1, 'success')`);
    const result = await svc.checkAndPromote(1);
    expect(result.promoted).toBe(false);
  });

  it('should promote when all criteria met', async () => {
    await adapter.runAsync(
      `INSERT INTO knowledge_entries (content, summary, type, confidence, tags) VALUES (?, ?, ?, ?, ?)`,
      ['My instinct', 'instinct', 'INSTINCT', 0.9, 'instinct,dev'],
    );
    // 3 successes = meets threshold
    await adapter.runAsync(`INSERT INTO entry_outcomes (entry_id, outcome) VALUES (1, 'success')`);
    await adapter.runAsync(`INSERT INTO entry_outcomes (entry_id, outcome) VALUES (1, 'success')`);
    await adapter.runAsync(`INSERT INTO entry_outcomes (entry_id, outcome) VALUES (1, 'success')`);

    const result = await svc.checkAndPromote(1);
    expect(result.promoted).toBe(true);
    expect(result.new_confidence).toBe(1.0);

    // Verify entry type changed
    const entry = await adapter.getAsync<{ type: string; tags: string; confidence: number }>(
      'SELECT type, tags, confidence FROM knowledge_entries WHERE id = 1',
    );
    expect(entry?.type).toBe('KNOWLEDGE');
    expect(entry?.confidence).toBe(1.0);
    expect(entry?.tags).not.toContain('instinct');
    expect(entry?.tags).toContain('dev');
  });

  it('should manually promote without criteria check', async () => {
    await adapter.runAsync(
      `INSERT INTO knowledge_entries (content, summary, type, confidence, tags) VALUES (?, ?, ?, ?, ?)`,
      ['Low confidence instinct', 'instinct', 'INSTINCT', 0.3, 'instinct'],
    );
    const result = await svc.manualPromote(1);
    expect(result.promoted).toBe(true);
  });

  it('should return ENTRY_NOT_FOUND for nonexistent entry', async () => {
    const result = await svc.manualPromote(999);
    expect(result.promoted).toBe(false);
    expect(result.reason).toBe('ENTRY_NOT_FOUND');
  });
});
