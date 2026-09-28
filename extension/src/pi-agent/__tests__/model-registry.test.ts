import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MODEL_ID,
  DEFAULT_MODEL_REGISTRY,
  DEFAULT_MODEL_REGISTRY_ENTRIES,
  ModelRegistry,
  ModelRegistryEntry,
} from '../model-registry';

// STC: TC-001 — Register and query small-context model in Model Registry
// STC: TC-301 — Validate contextWindow >0 and maxOutput <= contextWindow (BR-01, BR-02, BR-03)

const validEntry = (overrides: Partial<ModelRegistryEntry> = {}): ModelRegistryEntry => ({
  modelId: 'test-model',
  contextWindow: 2048,
  maxOutput: 512,
  thinkingMap: { low: 128, medium: 256, high: 512 },
  ...overrides,
});

describe('ModelRegistry', () => {
  it('TC-001: seeds small-context models and queries phi-3-mini metadata', () => {
    const entry = DEFAULT_MODEL_REGISTRY.get('phi-3-mini');
    expect(entry).toBeDefined();
    expect(entry?.contextWindow).toBe(2048);
    expect(entry?.maxOutput).toBe(512);
    expect(entry?.costPer1k).toBe(0.0002);
    expect(entry?.speed).toBe('fast');
  });

  it('TC-001: registry loads on start with all seeded models', () => {
    const models = DEFAULT_MODEL_REGISTRY.listModels();
    for (const e of DEFAULT_MODEL_REGISTRY_ENTRIES) {
      expect(models).toContain(e.modelId);
    }
    expect(models).toContain(DEFAULT_MODEL_ID);
  });

  it('TC-301: rejects contextWindow=0 (BR-01)', () => {
    expect(ModelRegistry.validate(validEntry({ contextWindow: 0 }))).toBe(false);
    expect(ModelRegistry.validate(validEntry({ contextWindow: -10 }))).toBe(false);
  });

  it('TC-301: rejects maxOutput > contextWindow (BR-02)', () => {
    expect(ModelRegistry.validate(validEntry({ maxOutput: 3000, contextWindow: 2048 }))).toBe(false);
  });

  it('TC-301: accepts a valid model entry', () => {
    const registry = new ModelRegistry([validEntry()]);
    expect(registry.get('test-model')).toBeDefined();
  });

  it('TC-301 (EF-1): invalid metadata entry is rejected and not queryable', () => {
    const registry = new ModelRegistry([validEntry({ modelId: 'broken', contextWindow: 0 })]);
    expect(registry.get('broken')).toBeUndefined();
  });

  it('BR-03: duplicate modelId is rejected', () => {
    const registry = new ModelRegistry([
      validEntry(),
      validEntry({ maxOutput: 256, thinkingMap: { low: 64, medium: 128, high: 256 } }),
    ]);
    expect(registry.listModels()).toEqual(['test-model']);
  });

  it('BR-08: thinkingMap values must be positive and <= maxOutput', () => {
    expect(ModelRegistry.validate(validEntry({ thinkingMap: { low: 128, medium: 9999, high: 512 } }))).toBe(false);
    expect(ModelRegistry.validate(validEntry({ thinkingMap: { low: 0, medium: 256, high: 512 } }))).toBe(false);
    expect(ModelRegistry.validate(validEntry({ thinkingMap: undefined as unknown as ModelRegistryEntry['thinkingMap'] }))).toBe(false);
  });
});
