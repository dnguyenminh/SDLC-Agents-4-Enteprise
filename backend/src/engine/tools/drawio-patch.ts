/**
 * Apply a local-repair plan (and port distributions) to raw draw.io XML.
 * Pure string transforms — caller is responsible for re-parse validation.
 */

import type { RepairPlan } from './drawio-repair.js';
import { distributePorts } from './drawio-ports.js';
import type { DiagramGraph } from './drawio-parser.js';
import { replaceCellGeometryXy, replaceCellSize, setEdgePointsXml, upsertEdgeStyleKeys } from './drawio-xml-utils.js';

/** Write moved positions, resized containers and rerouted edges into the XML. */
export function applyRepairPlan(xml: string, plan: RepairPlan): string {
  let out = xml;
  for (const [id, p] of plan.moves) out = replaceCellGeometryXy(out, id, p.x, p.y);
  for (const [id, s] of plan.resizes) out = replaceCellSize(out, id, s.w, s.h);
  for (const [edgeId, points] of plan.routes) out = setEdgePointsXml(out, edgeId, points);
  return out;
}

/** Write distributed exit/entry anchors for edges whose ports are missing. */
export function applyPortDistribution(xml: string, graph: DiagramGraph): string {
  const ports = distributePorts(graph);
  let out = xml;
  for (const [edgeId, edgePorts] of ports) {
    const keys: Record<string, string | number> = {};
    if (edgePorts.exit) {
      keys.exitX = edgePorts.exit.x; keys.exitY = edgePorts.exit.y;
      keys.exitDx = 0; keys.exitDy = 0;
    }
    if (edgePorts.entry) {
      keys.entryX = edgePorts.entry.x; keys.entryY = edgePorts.entry.y;
      keys.entryDx = 0; keys.entryDy = 0;
    }
    if (Object.keys(keys).length > 0) out = upsertEdgeStyleKeys(out, edgeId, keys);
  }
  return out;
}
