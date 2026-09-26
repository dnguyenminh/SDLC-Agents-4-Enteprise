export type ModelTier = 'small' | 'medium' | 'large';

export type PromptVariant = 'full' | 'compressed';

const TIER_PATTERNS: Array<{ tier: ModelTier; patterns: RegExp[] }> = [
  {
    tier: 'small',
    patterns: [
      /mini/i,
      /nano/i,
      /small/i,
      /tiny/i,
      /phi-/i,
      /gemma/i,
      /haiku/i,
      /(^|[^a-z0-9])[1-8]b([^a-z0-9]|$)/i,
    ],
  },
  {
    tier: 'large',
    patterns: [/opus/i, /ultra/i, /large/i, /-xl/i, /(^|[^a-z0-9])(70|175|405)b([^a-z0-9]|$)/i],
  },
  {
    tier: 'medium',
    patterns: [/sonnet/i, /pro/i, /medium/i, /(^|[^a-z0-9])(13|14|32|34)b([^a-z0-9]|$)/i],
  },
];

export function detectModelTier(modelId: string): ModelTier | null {
  if (typeof modelId !== 'string' || !modelId.trim()) return null;
  for (const { tier, patterns } of TIER_PATTERNS) {
    if (patterns.some((p) => p.test(modelId))) return tier;
  }
  return null;
}

export function preferredVariantForTier(tier: ModelTier | null): PromptVariant {
  return tier === 'small' ? 'compressed' : 'full';
}
