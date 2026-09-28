import { DEFAULT_MODEL_ID, ModelRegistry, ModelRegistryEntry, ThinkingLevel } from './model-registry';

export const DEFAULT_THINKING_LEVEL: ThinkingLevel = 'medium';

export class ThinkingLevelMapper {
  constructor(private readonly registry: ModelRegistry) {}

  map(modelId: string, level?: string): number {
    const entry = this.resolveEntry(modelId);
    const resolved = ThinkingLevelMapper.resolveLevel(level);
    return Math.min(entry.thinkingMap[resolved], entry.maxOutput);
  }

  private resolveEntry(modelId: string): ModelRegistryEntry {
    const entry = this.registry.get(modelId) ?? this.registry.get(DEFAULT_MODEL_ID);
    if (!entry) {
      throw new Error(`No model registry entry for '${modelId}'`);
    }
    return entry;
  }

  private static resolveLevel(level?: string): ThinkingLevel {
    if (level === 'low' || level === 'medium' || level === 'high') {
      return level;
    }
    return DEFAULT_THINKING_LEVEL;
  }
}
