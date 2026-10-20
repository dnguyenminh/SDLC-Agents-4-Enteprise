/**
 * Graph Tab — minimap: second 3D graph instance fully synced with the main graph.
 * BR-18 split: extracted from graph.js (plain script — shares the top-level
 * bindings `graph3d`, `allNodes`, etc. via the global lexical scope).
 * Load order: AFTER graph.js (startMinimapLoop is called from initGraph()'s
 * setTimeout, so both files are guaranteed loaded before first invocation).
 */
let minimapGraph = null;

function startMinimapLoop() {
  const el = document.getElementById('minimap-graph');
  if (!el || !graph3d) return;

  const data = graph3d.graphData();

  // Create second 3D force-graph instance as minimap
  minimapGraph = ForceGraph3D()(el)
    .graphData({
      nodes: data.nodes.map(n => ({ ...n, fx: n.x, fy: n.y, fz: n.z })),
      links: data.links.map(l => ({
        source: typeof l.source === 'object' ? l.source.id : l.source,
        target: typeof l.target === 'object' ? l.target.id : l.target
      }))
    })
    .nodeColor(n => nodeColor(n.type))
    .nodeVal(n => nodeSize(n) * 0.5)
    .nodeOpacity(0.85)
    .nodeLabel(() => '')
    .linkColor(() => 'rgba(100,150,200,0.2)')
    .linkWidth(0.4)
    .linkDirectionalParticles(0)
    .backgroundColor('#0f172a')
    .width(200).height(160)
    .showNavInfo(false)
    .enableNodeDrag(false)
    .enableNavigationControls(true);

  // Disable physics in minimap — positions come from main graph
  minimapGraph.d3Force('charge', null);
  minimapGraph.d3Force('link', null);
  minimapGraph.d3Force('center', null);
  minimapGraph.cooldownTicks(0);
  minimapGraph.cooldownTime(0);
  minimapGraph.warmupTicks(0);

  // Bidirectional camera sync between main graph and minimap
  let syncSource = 'main'; // tracks which graph is being interacted with
  const mainContainer = document.getElementById('graph3d');

  // Detect user interaction on minimap
  el.addEventListener('mousedown', () => { syncSource = 'minimap'; });
  el.addEventListener('wheel', () => { syncSource = 'minimap'; });
  el.addEventListener('mouseup', () => { setTimeout(() => { syncSource = 'main'; }, 100); });
  el.addEventListener('mouseleave', () => { setTimeout(() => { syncSource = 'main'; }, 100); });

  // Detect user interaction on main graph
  if (mainContainer) {
    mainContainer.addEventListener('mousedown', () => { syncSource = 'main'; });
    mainContainer.addEventListener('wheel', () => { syncSource = 'main'; });
  }

  // Continuous bidirectional camera sync using Three.js camera matrix
  function syncCamera() {
    if (!graph3d || !minimapGraph) { requestAnimationFrame(syncCamera); return; }
    try {
      if (syncSource === 'main') {
        // Main → Minimap: copy Three.js camera matrix directly
        const srcCam = graph3d.camera();
        const dstCam = minimapGraph.camera();
        if (srcCam && dstCam) {
          dstCam.position.copy(srcCam.position);
          dstCam.quaternion.copy(srcCam.quaternion);
          dstCam.up.copy(srcCam.up);
          // Also sync orbit controls target
          const srcCtrl = graph3d.controls();
          const dstCtrl = minimapGraph.controls();
          if (srcCtrl && dstCtrl && srcCtrl.target && dstCtrl.target) {
            dstCtrl.target.copy(srcCtrl.target);
            dstCtrl.update();
          }
        }
      } else {
        // Minimap → Main: copy Three.js camera matrix directly
        const srcCam = minimapGraph.camera();
        const dstCam = graph3d.camera();
        if (srcCam && dstCam) {
          dstCam.position.copy(srcCam.position);
          dstCam.quaternion.copy(srcCam.quaternion);
          dstCam.up.copy(srcCam.up);
          const srcCtrl = minimapGraph.controls();
          const dstCtrl = graph3d.controls();
          if (srcCtrl && dstCtrl && srcCtrl.target && dstCtrl.target) {
            dstCtrl.target.copy(srcCtrl.target);
            dstCtrl.update();
          }
        }
      }
    } catch (e) { /* ignore */ }
    requestAnimationFrame(syncCamera);
  }
  requestAnimationFrame(syncCamera);

  // Sync node positions from main graph -> minimap every 2s
  setInterval(() => {
    if (!graph3d || !minimapGraph) return;
    const mainNodes = graph3d.graphData().nodes;
    const mmData = minimapGraph.graphData();
    const posMap = {};
    mainNodes.forEach(n => { posMap[n.id] = { x: n.x, y: n.y, z: n.z }; });
    let changed = false;
    mmData.nodes.forEach(n => {
      const p = posMap[n.id];
      if (p && (n.x !== p.x || n.y !== p.y || n.z !== p.z)) {
        n.x = p.x; n.y = p.y; n.z = p.z;
        n.fx = p.x; n.fy = p.y; n.fz = p.z;
        changed = true;
      }
    });
    if (changed) minimapGraph.graphData(mmData);
  }, 2000);

  // Detect data changes (new nodes added/removed)
  setInterval(() => {
    if (!graph3d || !minimapGraph) return;
    const mainNodes = graph3d.graphData().nodes;
    const mmNodes = minimapGraph.graphData().nodes;
    if (mainNodes.length !== mmNodes.length) {
      const mainData = graph3d.graphData();
      minimapGraph.graphData({
        nodes: mainData.nodes.map(n => ({ ...n, fx: n.x, fy: n.y, fz: n.z })),
        links: mainData.links.map(l => ({
          source: typeof l.source === 'object' ? l.source.id : l.source,
          target: typeof l.target === 'object' ? l.target.id : l.target
        }))
      });
    }
  }, 5000);

  // Click on minimap node -> navigate main graph to that node
  minimapGraph.onNodeClick(n => {
    if (!graph3d) return;
    const mainNode = graph3d.graphData().nodes.find(x => x.id === n.id);
    if (mainNode) selectGraphNode(mainNode);
  });
}
