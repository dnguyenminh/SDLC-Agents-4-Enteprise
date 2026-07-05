/**
 * ClusteringAlgorithm distance/geometry helpers — KSA-143
 */

import { GraphNode, Vector3 } from './types';

export function computeCentroid(nodes: GraphNode[]): Vector3 {
  if (nodes.length === 0) return { x: 0, y: 0, z: 0 };
  let x = 0, y = 0, z = 0;
  let count = 0;
  for (const node of nodes) {
    if (node.position) {
      x += node.position.x;
      y += node.position.y;
      z += node.position.z;
      count++;
    }
  }
  if (count === 0) {
    return { x: Math.random() * 100, y: Math.random() * 100, z: Math.random() * 100 };
  }
  return { x: x / count, y: y / count, z: z / count };
}

export function computeRadius(nodes: GraphNode[], center: Vector3): number {
  let maxDist = 0;
  for (const node of nodes) {
    if (node.position) {
      const dx = node.position.x - center.x;
      const dy = node.position.y - center.y;
      const dz = node.position.z - center.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      maxDist = Math.max(maxDist, dist);
    }
  }
  return maxDist;
}

export function getDominantType(nodes: GraphNode[]): string {
  const typeCounts = new Map<string, number>();
  for (const node of nodes) {
    typeCounts.set(node.type, (typeCounts.get(node.type) ?? 0) + 1);
  }
  let dominant = 'unknown';
  let maxCount = 0;
  for (const [type, count] of typeCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominant = type;
    }
  }
  return dominant;
}

export function findIsolatedNodes(nodes: GraphNode[], edges: Array<{ source: string; target: string }>): string[] {
  const connectedNodes = new Set<string>();
  for (const edge of edges) {
    connectedNodes.add(edge.source);
    connectedNodes.add(edge.target);
  }
  return nodes.filter(n => !connectedNodes.has(n.id)).map(n => n.id);
}
