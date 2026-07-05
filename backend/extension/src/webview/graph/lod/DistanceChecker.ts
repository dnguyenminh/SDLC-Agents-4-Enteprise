/**
 * Distance Checker — Per-frame camera distance evaluation
 * KSA-143
 */

import { ClusterState, LODEvent, Vector3 } from './types';

export class DistanceChecker {
  private expandThreshold: number;
  private collapseThreshold: number;

  constructor(expandThreshold: number, collapseThreshold: number) {
    this.expandThreshold = expandThreshold;
    this.collapseThreshold = collapseThreshold;
  }

  evaluate(cameraPosition: Vector3, clusters: Map<string, ClusterState>): LODEvent[] {
    const events: LODEvent[] = [];

    for (const [id, state] of clusters) {
      const distance = this.distanceTo(cameraPosition, state.cluster.center);
      state.distanceToCamera = distance;

      if (state.state === 'COLLAPSED' && distance < this.expandThreshold) {
        events.push({ type: 'EXPAND', clusterId: id });
      } else if (state.state === 'EXPANDED' && distance > this.collapseThreshold) {
        events.push({ type: 'COLLAPSE', clusterId: id });
      }
    }

    events.sort((a, b) => {
      const distA = clusters.get(a.clusterId)?.distanceToCamera ?? Infinity;
      const distB = clusters.get(b.clusterId)?.distanceToCamera ?? Infinity;
      return distA - distB;
    });

    return events;
  }

  setThresholds(expand: number, collapse: number): void {
    this.expandThreshold = expand;
    this.collapseThreshold = collapse;
  }

  private distanceTo(a: Vector3, b: Vector3): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}
