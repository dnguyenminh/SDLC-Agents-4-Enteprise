/**
 * LOD (Level of Detail) / Semantic Zoom — Type Definitions
 * KSA-143
 */

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  position?: Vector3;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  weight?: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Cluster {
  id: string;
  label: string;
  childNodeIds: string[];
  center: Vector3;
  radius: number;
  dominantType: string;
}

export interface ClusterHierarchy {
  clusters: Cluster[];
  isolatedNodes: string[];
  metadata: ClusterMetadata;
}

export interface ClusterMetadata {
  totalNodes: number;
  totalClusters: number;
  avgClusterSize: number;
  clusteringTimeMs: number;
}

export interface ClusterState {
  id: string;
  state: 'COLLAPSED' | 'EXPANDING' | 'EXPANDED' | 'COLLAPSING';
  cluster: Cluster;
  childCount: number;
  distanceToCamera: number;
  lastStateChange: number;
}

export interface LODConfig {
  expandThreshold: number;
  collapseThreshold: number;
  animationDuration: number;
  maxVisibleNodes: number;
  checkInterval: number;
  minClusterSize: number;
  maxClusterSize: number;
}

export interface LODEvent {
  type: 'EXPAND' | 'COLLAPSE';
  clusterId: string;
}

export interface BudgetExceededEvent {
  requestedClusterId: string;
  currentVisible: number;
  requestedAdditional: number;
  collapsedClusterId: string;
}

export interface ClusterOptions {
  minClusterSize: number;
  maxClusterSize: number;
  connectivityWeight: number;
  typeWeight: number;
}
