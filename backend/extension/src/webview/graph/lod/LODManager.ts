/**
 * LOD Manager — Main orchestrator for Level of Detail system
 * KSA-143
 */

import { GraphData, ClusterHierarchy, ClusterState, LODConfig, LODEvent, Vector3, BudgetExceededEvent } from './types';
import { ClusteringAlgorithm } from './ClusteringAlgorithm';
import { DistanceChecker } from './DistanceChecker';
import { BudgetManager } from './BudgetManager';
import { OrbitalLayout } from './OrbitalLayout';
import { DEFAULT_CONFIG, validateConfig } from './config';

type EventHandler = (...args: any[]) => void;

export class LODManager {
  private clustering: ClusteringAlgorithm;
  private distanceChecker: DistanceChecker;
  private budgetManager: BudgetManager;
  private clusters: Map<string, ClusterState> = new Map();
  private config: LODConfig;
  private eventHandlers: Map<string, EventHandler[]> = new Map();
  private hierarchy: ClusterHierarchy | null = null;

  constructor(config?: Partial<LODConfig>) {
    this.config = validateConfig(config ?? {});
    this.clustering = new ClusteringAlgorithm();
    this.distanceChecker = new DistanceChecker(this.config.expandThreshold, this.config.collapseThreshold);
    this.budgetManager = new BudgetManager(this.config.maxVisibleNodes);
  }

  async initialize(graphData: GraphData): Promise<ClusterHierarchy> {
    // Run clustering
    this.hierarchy = this.clustering.cluster(graphData, {
      minClusterSize: this.config.minClusterSize,
      maxClusterSize: this.config.maxClusterSize,
      connectivityWeight: 2.0,
      typeWeight: 1.0,
    });

    // Initialize cluster states
    this.clusters.clear();
    for (const cluster of this.hierarchy.clusters) {
      this.clusters.set(cluster.id, {
        id: cluster.id,
        state: 'COLLAPSED',
        cluster,
        childCount: cluster.childNodeIds.length,
        distanceToCamera: Infinity,
        lastStateChange: Date.now(),
      });
    }

    // Initial visible count = number of super nodes + isolated nodes
    this.budgetManager.setCount(this.hierarchy.clusters.length + this.hierarchy.isolatedNodes.length);

    return this.hierarchy;
  }

  update(cameraPosition: Vector3): void {
    if (this.clusters.size === 0) return;

    // Evaluate distances and get events
    const events = this.distanceChecker.evaluate(cameraPosition, this.clusters);

    // Process events
    for (const event of events) {
      if (event.type === 'EXPAND') {
        this.handleExpand(event.clusterId);
      } else if (event.type === 'COLLAPSE') {
        this.handleCollapse(event.clusterId);
      }
    }
  }

  private handleExpand(clusterId: string): void {
    const state = this.clusters.get(clusterId);
    if (!state || state.state !== 'COLLAPSED') return;

    // Budget check
    if (!this.budgetManager.canExpand(state)) {
      // Auto-collapse farthest
      const farthestId = this.budgetManager.getFarthestExpanded(this.clusters);
      if (farthestId) {
        this.handleCollapse(farthestId);
        this.emit('budget-exceeded', {
          requestedClusterId: clusterId,
          currentVisible: this.budgetManager.getCount(),
          requestedAdditional: state.childCount,
          collapsedClusterId: farthestId,
        } as BudgetExceededEvent);
      } else {
        return; // Cannot expand, no cluster to collapse
      }
    }

    // Expand
    state.state = 'EXPANDED';
    state.lastStateChange = Date.now();
    // Budget: remove 1 super node, add N child nodes
    this.budgetManager.updateCount(state.childCount - 1);
    this.emit('cluster-expanded', clusterId);
  }

  private handleCollapse(clusterId: string): void {
    const state = this.clusters.get(clusterId);
    if (!state || state.state !== 'EXPANDED') return;

    state.state = 'COLLAPSED';
    state.lastStateChange = Date.now();
    // Budget: remove N child nodes, add 1 super node
    this.budgetManager.updateCount(-(state.childCount - 1));
    this.emit('cluster-collapsed', clusterId);
  }

  expandCluster(clusterId: string): void {
    this.handleExpand(clusterId);
  }

  collapseCluster(clusterId: string): void {
    this.handleCollapse(clusterId);
  }

  getVisibleNodeCount(): number {
    return this.budgetManager.getCount();
  }

  getExpandedClusters(): string[] {
    const expanded: string[] = [];
    for (const [id, state] of this.clusters) {
      if (state.state === 'EXPANDED') expanded.push(id);
    }
    return expanded;
  }

  getClusterState(clusterId: string): ClusterState | undefined {
    return this.clusters.get(clusterId);
  }

  getOrbitalPositions(clusterId: string): Vector3[] {
    const state = this.clusters.get(clusterId);
    if (!state) return [];
    return OrbitalLayout.compute(state.childCount, state.cluster.center, state.cluster.radius);
  }

  setConfig(config: Partial<LODConfig>): void {
    this.config = validateConfig({ ...this.config, ...config });
    this.distanceChecker.setThresholds(this.config.expandThreshold, this.config.collapseThreshold);
    this.budgetManager.setMax(this.config.maxVisibleNodes);
  }

  getConfig(): LODConfig {
    return { ...this.config };
  }

  on(event: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  private emit(event: string, ...args: any[]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(...args);
      }
    }
  }

  dispose(): void {
    this.clusters.clear();
    this.eventHandlers.clear();
    this.hierarchy = null;
    this.budgetManager.setCount(0);
  }
}
