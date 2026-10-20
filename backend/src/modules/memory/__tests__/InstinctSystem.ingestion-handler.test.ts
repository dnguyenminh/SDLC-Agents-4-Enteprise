/**
 * SA4E-121: Instincts and Confidence Scoring System — unit tests.
 * This file: InstinctIngestionHandler.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { InstinctConfigService } from '../evolution/InstinctConfigService.js';
import { ContradictionService } from '../evolution/ContradictionService.js';
import { InstinctIngestionHandler } from '../handlers/InstinctIngestionHandler.js';
import pino from 'pino';
import { createInstinctTestDb } from './fixtures.js';

const logger = pino({ level: 'silent' });

describe('InstinctIngestionHandler', () => {
  let adapter: SqliteAdapter;
  let configSvc: InstinctConfigService;
  let contradictionSvc: ContradictionService;
  let handler: InstinctIngestionHandler;

  beforeEach(async () => {
    adapter = await createInstinctTestDb();
    configSvc = new InstinctConfigService(adapter);
    await configSvc.seedDefaults();
    contradictionSvc = new ContradictionService(adapter, configSvc, logger);
    handler = new InstinctIngestionHandler(configSvc, contradictionSvc, logger);
  });

  it('should detect instinct from type=INSTINCT', () => {
    expect(handler.isInstinct({ content: 'test', type: 'INSTINCT' })).toBe(true);
  });

  it('should detect instinct from instinct=true flag', () => {
    expect(handler.isInstinct({ content: 'test', instinct: true })).toBe(true);
  });

  it('should not detect instinct for regular entry', () => {
    expect(handler.isInstinct({ content: 'test', type: 'CONTEXT' })).toBe(false);
  });

  it('should compute initial confidence within bounds', async () => {
    // No user confidence → use default (0.5)
    const conf1 = await handler.computeInitialConfidence({ content: 'x' });
    expect(conf1).toBe(0.5);

    // User confidence below floor → clamp to floor (0.3)
    const conf2 = await handler.computeInitialConfidence({ content: 'x', confidence: 0.1 });
    expect(conf2).toBe(0.3);

    // User confidence above ceiling → clamp to ceiling (0.9)
    const conf3 = await handler.computeInitialConfidence({ content: 'x', confidence: 1.0 });
    expect(conf3).toBe(0.9);

    // User confidence within bounds → use as-is
    const conf4 = await handler.computeInitialConfidence({ content: 'x', confidence: 0.7 });
    expect(conf4).toBe(0.7);
  });

  it('should apply instinct tag to empty tags', () => {
    expect(handler.applyInstinctTags('')).toBe('instinct');
  });

  it('should not duplicate instinct tag', () => {
    expect(handler.applyInstinctTags('instinct,dev')).toBe('instinct,dev');
  });

  it('should add instinct tag to existing tags', () => {
    expect(handler.applyInstinctTags('dev,coding')).toBe('dev,coding,instinct');
  });

  it('should handle contradiction detection gracefully on failure', async () => {
    // Entry doesn't exist → returns null (graceful degradation)
    const result = await handler.runContradictionDetection(999);
    // detectContradictions returns empty report for missing entry
    expect(result).not.toBeNull();
    expect(result!.contradictions.length).toBe(0);
  });
});
