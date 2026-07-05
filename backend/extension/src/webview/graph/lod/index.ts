/**
 * LOD Module — Public API exports
 * KSA-143
 */

export { LODManager } from './LODManager';
export { ClusteringAlgorithm } from './ClusteringAlgorithm';
export { DistanceChecker } from './DistanceChecker';
export { BudgetManager } from './BudgetManager';
export { OrbitalLayout } from './OrbitalLayout';
export { DEFAULT_CONFIG, validateConfig } from './config';
export type {
  GraphData,
  GraphNode,
  GraphEdge,
  Cluster,
  ClusterHierarchy,
  ClusterMetadata,
  ClusterState,
  LODConfig,
  LODEvent,
  BudgetExceededEvent,
  ClusterOptions,
  Vector3,
} from './types';
