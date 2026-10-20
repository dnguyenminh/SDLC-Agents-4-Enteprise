/**
 * LOD Manager — entry (ES module).
 * Implementation split (BR-18 ≤200 lines/file):
 *   - ./lod-manager/lod-manager-core.js    (class core)
 *   - ./lod-manager/lod-manager-runtime.js (private runtime methods)
 * The side-effect import applies the prototype patch so the exported class is
 * complete for consumers (ES imports are hoisted: core is evaluated first).
 */
export { LODManager } from './lod-manager/lod-manager-core.js';
import './lod-manager/lod-manager-runtime.js';
