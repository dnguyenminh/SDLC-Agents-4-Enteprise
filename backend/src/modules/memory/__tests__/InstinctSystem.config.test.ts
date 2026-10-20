/**
 * SA4E-121: Instincts and Confidence Scoring System — unit tests.
 * This file: InstinctConfigService.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { InstinctConfigService } from '../evolution/InstinctConfigService.js';
import { createInstinctTestDb } from './fixtures.js';

describe('InstinctConfigService', () => {
  let adapter: SqliteAdapter;
  let svc: InstinctConfigService;

  beforeEach(async () => {
    adapter = await createInstinctTestDb();
    svc = new InstinctConfigService(adapter);
    await svc.seedDefaults();
  });

  it('should seed and read default config', async () => {
    const config = await svc.getInstinctConfig();
    expect(config.instinct_initial_confidence).toBe(0.5);
    expect(config.instinct_confidence_floor).toBe(0.3);
    expect(config.instinct_confidence_ceiling).toBe(0.9);
    expect(config.instinct_decay_rate).toBe(0.08);
    expect(config.instinct_boost_factor).toBe(1.1);
    expect(config.instinct_fail_factor).toBe(0.9);
    expect(config.instinct_access_threshold_days).toBe(14);
    expect(config.instinct_promotion_threshold).toBe(3);
    expect(config.contradiction_similarity_threshold).toBe(0.85);
  });

  it('should update config partially', async () => {
    const updated = await svc.setInstinctConfig({
      instinct_decay_rate: 0.12,
      instinct_boost_factor: 1.2,
    });
    expect(updated.instinct_decay_rate).toBe(0.12);
    expect(updated.instinct_boost_factor).toBe(1.2);
    // Others unchanged
    expect(updated.instinct_initial_confidence).toBe(0.5);
  });

  it('should not overwrite existing config on re-seed', async () => {
    await svc.setInstinctConfig({ instinct_decay_rate: 0.2 });
    await svc.seedDefaults();
    const config = await svc.getInstinctConfig();
    expect(config.instinct_decay_rate).toBe(0.2);
  });
});
