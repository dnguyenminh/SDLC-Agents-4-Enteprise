/**
 * Budget Manager — Enforces max visible node count
 * KSA-143
 */

import { ClusterState } from './types';

export class BudgetManager {
  private maxVisible: number;
  private currentVisible: number = 0;

  constructor(maxVisible: number) {
    this.maxVisible = maxVisible;
  }

  canExpand(cluster: ClusterState): boolean {
    return this.currentVisible + cluster.childCount <= this.maxVisible;
  }

  getFarthestExpanded(clusters: Map<string, ClusterState>): string | null {
    let farthestId: string | null = null;
    let farthestDistance = -1;

    for (const [id, state] of clusters) {
      if (state.state === 'EXPANDED' && state.distanceToCamera > farthestDistance) {
        farthestDistance = state.distanceToCamera;
        farthestId = id;
      }
    }

    return farthestId;
  }

  updateCount(delta: number): void {
    this.currentVisible += delta;
  }

  setCount(count: number): void {
    this.currentVisible = count;
  }

  getCount(): number {
    return this.currentVisible;
  }

  getMax(): number {
    return this.maxVisible;
  }

  setMax(max: number): void {
    this.maxVisible = max;
  }
}
