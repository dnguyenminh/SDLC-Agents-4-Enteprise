/**
 * LOD Configuration — Default values and validation
 * KSA-143
 */

import { LODConfig } from './types';

export const DEFAULT_CONFIG: LODConfig = {
  expandThreshold: 50,
  collapseThreshold: 70,
  animationDuration: 400,
  maxVisibleNodes: 100,
  checkInterval: 16,
  minClusterSize: 5,
  maxClusterSize: 50,
};

export function validateConfig(config: Partial<LODConfig>): LODConfig {
  const merged = { ...DEFAULT_CONFIG, ...config };

  // Ensure collapseThreshold > expandThreshold (hysteresis)
  if (merged.collapseThreshold <= merged.expandThreshold) {
    merged.collapseThreshold = merged.expandThreshold * 1.4;
  }

  // Clamp values to valid ranges
  merged.expandThreshold = Math.max(20, Math.min(200, merged.expandThreshold));
  merged.collapseThreshold = Math.max(28, Math.min(280, merged.collapseThreshold));
  merged.animationDuration = Math.max(200, Math.min(1000, merged.animationDuration));
  merged.maxVisibleNodes = Math.max(50, Math.min(500, merged.maxVisibleNodes));
  merged.checkInterval = Math.max(16, Math.min(100, merged.checkInterval));
  merged.minClusterSize = Math.max(2, Math.min(20, merged.minClusterSize));
  merged.maxClusterSize = Math.max(10, Math.min(100, merged.maxClusterSize));

  return merged;
}
