/**
 * SA4E-51 — Spatial query and edge-building functions for KB Graph (facade).
 * Uses DatabaseAdapter async methods so queries run on whichever engine is active.
 * TEMP TABLE removed: replaced with IN clause for PostgreSQL compatibility.
 *
 * Implementation submodules (same directory):
 * - spatial-view.ts      — camera-view LOD query + count cache
 * - spatial-positions.ts — 3D viewport position list (SA4E-97/99)
 * - spatial-edges.ts     — voxel SPATIAL + cluster hub edges
 */

export { spatialQuery } from './spatial-view.js';
export { getAllPositions } from './spatial-positions.js';
export { buildSpatialEdges, buildCrossClusterEdges } from './spatial-edges.js';
