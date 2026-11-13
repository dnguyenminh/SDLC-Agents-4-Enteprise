/**
 * Edge-related layout detectors — edge through node, edge vs edge.
 * Uses reconstructed absolute polylines (exit/entry anchors, stored terminal
 * points and waypoints) and covers both anchored and loose (point-only) edges.
 */

import type { DiagramGraph } from './drawio-parser';
import { absoluteRects, ancestorsOf, cellIndex, firstCrossPoint, fullyContains } from './drawio-geometry';
import type { Rect } from './drawio-geometry';
import type { LayoutIssue } from './drawio-detect';
import {
  allEdges, insideAnyRect, polylineCache, polylineHitsRect, regionIds, regionRects, segmentsCross, sharesEndpoint, union,
} from './drawio-detect-edge-utils';

/** Edges whose polyline passes through an unrelated content node. */
export function edgeNodeCrossings(graph: DiagramGraph, abs?: Map<string, Rect>): LayoutIssue[] {
  const rects = abs ?? absoluteRects(graph);
  const lines = polylineCache(graph, rects);
  const regions = regionIds(graph, rects);
  const issues: LayoutIssue[] = [];
  for (const edge of allEdges(graph)) {
    const line = lines.get(edge.id);
    if (!line || line.length < 2) continue;
    for (const node of graph.nodes) {
      if (node.id === edge.sourceId || node.id === edge.targetId) continue;
      // Bands/regions and nodes fully containing an endpoint are backgrounds —
      // an edge leaving/entering or passing over them is visually legitimate
      if (regions.has(node.id)) continue;
      const srcRect = edge.sourceId ? rects.get(edge.sourceId) : undefined;
      const tgtRect = edge.targetId ? rects.get(edge.targetId) : undefined;
      const victimRect = rects.get(node.id)!;
      if ((srcRect && fullyContains(victimRect, srcRect))
        || (tgtRect && fullyContains(victimRect, tgtRect))) continue;
      if (polylineHitsRect(line, victimRect)) {
        issues.push({
          type: 'edge_crossing', severity: 'high',
          edge_id: edge.id, edge_source: edge.sourceId, edge_target: edge.targetId,
          crosses_node: node.id,
          fix_hint: `Edge '${edge.id}' (${edge.sourceId}→${edge.targetId}) cuts through '${node.id}'.`,
        });
      }
    }
  }
  return issues;
}

/** Crossing edges (no shared endpoint) and stacked parallel edges. */
export function edgeEdgeCrossings(graph: DiagramGraph, abs?: Map<string, Rect>): LayoutIssue[] {
  const rects = abs ?? absoluteRects(graph);
  const lines = polylineCache(graph, rects);
  const edges = allEdges(graph);
  const regions = regionRects(graph, rects);
  const issues: LayoutIssue[] = [];
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i], b = edges[j];
      // Shared endpoint: fan-out is normal — only flag if the routes coincide
      // (e.g. duplicate request/response edges rendered on the same line)
      if (sharesEndpoint(a, b)) {
        if (segmentsCross(lines.get(a.id), lines.get(b.id))) pushStacked(issues, a, b);
        continue;
      }
      const at = firstCrossPoint(lines.get(a.id) ?? [], lines.get(b.id) ?? []);
      // Crossings over lifelines/bands (e.g. a self-message tick on a lifeline)
      // are normal sequence-diagram rendering — only flag mid-air crossings
      if (at && !insideAnyRect(at, regions)) {
        issues.push({
          type: 'edge_edge_crossing', severity: 'medium',
          edge_a: a.id, edge_b: b.id,
          fix_hint: `Edges '${a.id}' and '${b.id}' intersect — add waypoints to one.`,
        });
      }
    }
  }
  return issues;
}

/**
 * Edges passing over a container that is unrelated to both endpoints.
 * Severity LOW: containers/bands render as backgrounds in draw.io — edges
 * over them are normal; defects on the contained content are caught separately.
 */
export function edgeContainerCrossings(graph: DiagramGraph, abs?: Map<string, Rect>): LayoutIssue[] {
  const rects = abs ?? absoluteRects(graph);
  const byId = cellIndex(graph);
  const lines = polylineCache(graph, rects);
  const issues: LayoutIssue[] = [];
  for (const edge of allEdges(graph)) {
    const line = lines.get(edge.id);
    if (!line || line.length < 2) continue;
    // Containers owning either endpoint are legitimately entered by the edge
    const related = union(ancestorsOf(edge.sourceId, byId), ancestorsOf(edge.targetId, byId));
    for (const container of graph.containers) {
      if (container.id === edge.sourceId || container.id === edge.targetId) continue;
      if (related.has(container.id)) continue;
      if (polylineHitsRect(line, rects.get(container.id)!)) {
        issues.push({
          type: 'edge_container_crossing', severity: 'low',
          edge_id: edge.id, edge_source: edge.sourceId, edge_target: edge.targetId,
          crosses_container: container.id,
          fix_hint: `Edge '${edge.id}' passes over container '${container.id}'.`,
        });
      }
    }
  }
  return issues;
}

function pushStacked(issues: LayoutIssue[], a: { id: string; sourceId: string; targetId: string }, b: { id: string }): void {
  issues.push({
    type: 'stacked_edges', severity: 'medium',
    edge_a: a.id, edge_b: b.id,
    fix_hint: `Edges '${a.id}' and '${b.id}' (${a.sourceId}→${a.targetId}) overlap; spread their ports.`,
  });
}
