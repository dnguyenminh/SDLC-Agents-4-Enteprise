import { logger } from '../logger';

export type ModelSpeed = 'slow' | 'medium' | 'fast';
export type ThinkingLevel = 'low' | 'medium' | 'high';

export interface ThinkingMap {
  low: number;
  medium: number;
  high: number;
}

export interface ModelRegistryEntry {
  modelId: string;
  contextWindow: number;
  maxOutput: number;
  costPer1k?: number;
  speed?: ModelSpeed;
  thinkingMap: ThinkingMap;
}

export const DEFAULT_MODEL_ID = 'gpt-4o-mini';

export const DEFAULT_MODEL_REGISTRY_ENTRIES: ModelRegistryEntry[] = [
  { modelId: 'gpt-4o-mini', contextWindow: 128000, maxOutput: 16384, costPer1k: 0.00015, speed: 'fast', thinkingMap: { low: 4096, medium: 8192, high: 16384 } },
  { modelId: 'gpt-4o', contextWindow: 128000, maxOutput: 16384, costPer1k: 0.0025, speed: 'medium', thinkingMap: { low: 4096, medium: 8192, high: 16384 } },
  { modelId: 'claude-3', contextWindow: 200000, maxOutput: 4096, costPer1k: 0.003, speed: 'medium', thinkingMap: { low: 1024, medium: 2048, high: 4096 } },
  { modelId: 'claude-3-opus', contextWindow: 200000, maxOutput: 4096, costPer1k: 0.015, speed: 'slow', thinkingMap: { low: 1024, medium: 2048, high: 4096 } },
  { modelId: 'phi-3-mini', contextWindow: 2048, maxOutput: 512, costPer1k: 0.0002, speed: 'fast', thinkingMap: { low: 128, medium: 256, high: 512 } },
  { modelId: 'smollm2-360m', contextWindow: 1024, maxOutput: 256, costPer1k: 0, speed: 'fast', thinkingMap: { low: 64, medium: 128, high: 256 } },
  { modelId: 'llama3.1', contextWindow: 8192, maxOutput: 2048, costPer1k: 0, speed: 'medium', thinkingMap: { low: 512, medium: 1024, high: 2048 } },
  { modelId: 'qwen2.5-coder', contextWindow: 32768, maxOutput: 1024, costPer1k: 0, speed: 'medium', thinkingMap: { low: 256, medium: 512, high: 1024 } },
  { modelId: 'local-model', contextWindow: 4096, maxOutput: 1024, costPer1k: 0, speed: 'medium', thinkingMap: { low: 256, medium: 512, high: 1024 } },
];

export class ModelRegistry {
  private readonly entries = new Map<string, ModelRegistryEntry>();

  constructor(entries: ModelRegistryEntry[]) {
    for (const entry of entries) {
      this.add(entry);
    }
  }

  get(modelId: string): ModelRegistryEntry | undefined {
    return this.entries.get(modelId);
  }

  listModels(): string[] {
    return Array.from(this.entries.keys());
  }

  private add(entry: ModelRegistryEntry): void {
    if (!ModelRegistry.validate(entry)) {
      logger.warn('Invalid model registry entry rejected', { modelId: entry.modelId });
      return;
    }
    if (this.entries.has(entry.modelId)) {
      logger.warn('Duplicate modelId rejected', { modelId: entry.modelId });
      return;
    }
    this.entries.set(entry.modelId, entry);
  }

  static validate(entry: ModelRegistryEntry): boolean {
    const idOk = typeof entry.modelId === 'string' && entry.modelId.length > 0;
    const windowOk = Number.isInteger(entry.contextWindow) && entry.contextWindow > 0;
    const outputOk = Number.isInteger(entry.maxOutput) && entry.maxOutput > 0 && entry.maxOutput <= entry.contextWindow;
    return idOk && windowOk && outputOk && ModelRegistry.validateThinkingMap(entry);
  }

  private static validateThinkingMap(entry: ModelRegistryEntry): boolean {
    const map = entry.thinkingMap;
    if (!map) {
      return false;
    }
    const levels: ThinkingLevel[] = ['low', 'medium', 'high'];
    return levels.every(
      (level) => Number.isInteger(map[level]) && map[level] > 0 && map[level] <= entry.maxOutput
    );
  }
}

export const DEFAULT_MODEL_REGISTRY = new ModelRegistry(DEFAULT_MODEL_REGISTRY_ENTRIES);
