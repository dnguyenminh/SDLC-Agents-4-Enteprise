/**
 * KBGraphRenderer — entry point / factory.
 *
 * Load order (classic <script> tags, see admin/index.html) — the modules below
 * attach the implementation to KBGraphRendererImpl.prototype at load time:
 *   1. kb-graph-renderer/renderer-palette.js      (shared namespace + palette)
 *   2. kb-graph-renderer/renderer-core.js         (class skeleton + public API)
 *   3. kb-graph-renderer/renderer-geometry.js     (points/edges geometry)
 *   4. kb-graph-renderer/renderer-lod.js          (detail LOD layer)
 *   5. kb-graph-renderer/renderer-view.js         (labels, render loop, teardown)
 *   6. kb-graph-renderer/renderer-interaction.js  (pointer/raycast)
 *   7. kb-graph-renderer/renderer-minimap.js      (minimap)
 *   8. kb-graph-renderer.js                       (this file — MUST load last)
 *
 * Global API (unchanged):
 *   const renderer = KBGraphRenderer.create(container, options);
 *   renderer.loadPositions(nodes); renderer.loadEdges(edges); renderer.destroy();
 */
(function(global) {
  'use strict';

  var NS = global.__kbGraphRendererNS;

  global.KBGraphRenderer = {
    create: function(container, options) {
      var instance = new NS.KBGraphRendererImpl(container, options);
      return instance.init().then(function() { return instance; });
    }
  };

})(typeof window !== 'undefined' ? window : this);
