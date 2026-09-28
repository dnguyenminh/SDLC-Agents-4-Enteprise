import { describe, it, expect } from 'vitest';
import { ModelRegistry, ModelRegistryEntry, DEFAULT_MODEL_REGISTRY } from '../model-registry';
import { ThinkingLevelMapper } from '../thinking-level-mapper';

// STC: TC-302 — ThinkingLevel mapping respects maxOutput (UC-04, BR-08)

const entries: ModelRegistryEntry[] = [
  {
    modelId: 'qwen2.5-coder',
    contextWindow: 32768,
    maxOutput: 1024,
    thinkingMap: { low: 256, medium: 512, high: 1024 },
  },
  {
    modelId: 'phi-3-mini',
    contextWindow: 2048,
    maxOutput: 512,
    thinkingMap: { low: 128, medium: 256, high: 512 },
  },
];

describe('ThinkingLevelMapper', () => {
  const mapper = new ThinkingLevelMapper(new ModelRegistry(entries));

  it('TC-302: high level maps to maxTokens capped at maxOutput', () => {
    expect(mapper.map('qwen2.5-coder', 'high')).toBe(1024);
  });

  it('TC-302: low level maps to a smaller maxTokens than high', () => {
    const low = mapper.map('qwen2.5-coder', 'low');
    const high = mapper.map('qwen2.5-coder', 'high');
    expect(low).toBe(256);
    expect(low).toBeLessThan(high);
  });

  it('maps medium level and defaults undefined level to medium', () => {
    expect(mapper.map('qwen2.5-coder', 'medium')).toBe(512);
    expect(mapper.map('qwen2.5-coder')).toBe(512);
  });

  it('maps all levels for phi-3-mini within maxOutput', () => {
    expect(mapper.map('phi-3-mini', 'low')).toBe(128);
    expect(mapper.map('phi-3-mini', 'medium')).toBe(256);
    expect(mapper.map('phi-3-mini', 'high')).toBe(512);
  });

  it('unknown model falls back to the default model mapping', () => {
    const defaultMapper = new ThinkingLevelMapper(DEFAULT_MODEL_REGISTRY);
    expect(defaultMapper.map('missing-model', 'medium')).toBe(8192);
  });

  it('invalid level string falls back to medium', () => {
    expect(mapper.map('phi-3-mini', 'ultra')).toBe(256);
  });

  it('throws when registry has no default model entry', () => {
    const empty = new ThinkingLevelMapper(new ModelRegistry([]));
    expect(() => empty.map('phi-3-mini', 'high')).toThrow('No model registry entry');
  });
});
