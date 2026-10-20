/**
 * LOD Clustering — entry (ES module).
 * Implementation split (BR-18 ≤200 lines/file):
 *   - ./lod-clustering/lod-clustering-core.js     (class core)
 *   - ./lod-clustering/lod-clustering-clusters.js (cluster assembly helpers)
 * The side-effect import applies the prototype patch so the exported class is
 * complete for consumers (ES imports are hoisted: core is evaluated first).
 */
export { LODClustering } from './lod-clustering/lod-clustering-core.js';
import './lod-clustering/lod-clustering-clusters.js';
