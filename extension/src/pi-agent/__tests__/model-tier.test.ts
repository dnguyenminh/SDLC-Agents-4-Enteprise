import { describe, it, expect } from 'vitest';
import { detectModelTier, preferredVariantForTier } from '../model-tier';

describe('model-tier', () => {
  describe('detectModelTier', () => {
    // STC: TC-703 — Model Tier Detection Integration (detect tier → correct variant selected)
    it('classifies small models', () => {
      expect(detectModelTier('phi-3-mini')).toBe('small');
      expect(detectModelTier('gpt-4o-mini')).toBe('small');
      expect(detectModelTier('claude-3-haiku')).toBe('small');
      expect(detectModelTier('gemma-2b')).toBe('small');
      expect(detectModelTier('qwen2.5-7b')).toBe('small');
    });

    it('classifies medium models', () => {
      expect(detectModelTier('claude-3-sonnet')).toBe('medium');
      expect(detectModelTier('llama-3-32b')).toBe('medium');
      expect(detectModelTier('mistral-medium')).toBe('medium');
    });

    it('classifies large models (param size wins over suffix)', () => {
      expect(detectModelTier('claude-3-opus')).toBe('large');
      expect(detectModelTier('llama-3.3-70b')).toBe('large');
      expect(detectModelTier('llama-3-70b-pro')).toBe('large');
      expect(detectModelTier('gpt-4-turbo-ultra')).toBe('large');
    });

    // STC: TC-403 — Model Tier Detection Failure (tier unknown → fallback to full variant)
    it('returns null for unknown models → full variant fallback', () => {
      expect(detectModelTier('gpt-4o')).toBeNull();
      expect(detectModelTier('claude-3')).toBeNull();
      expect(detectModelTier('')).toBeNull();
      expect(preferredVariantForTier(null)).toBe('full');
    });

    it('matches FSD example payload (phi-3-mini → small)', () => {
      const payload = { modelId: 'phi-3-mini', modelTier: 'small' };
      expect(detectModelTier(payload.modelId)).toBe(payload.modelTier);
    });
  });

  describe('preferredVariantForTier', () => {
    it('small tier prefers compressed variant', () => {
      expect(preferredVariantForTier('small')).toBe('compressed');
    });

    it('medium/large tiers prefer full variant', () => {
      expect(preferredVariantForTier('medium')).toBe('full');
      expect(preferredVariantForTier('large')).toBe('full');
    });
  });
});
