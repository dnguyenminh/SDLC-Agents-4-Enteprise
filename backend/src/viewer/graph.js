/* Graph Tab — 3D Force-directed Knowledge Graph */
const COLORS = {
  CONTEXT: '#38bdf8', DECISION: '#f472b6', ERROR_PATTERN: '#fb923c',
  ARCHITECTURE: '#a78bfa', REQUIREMENT: '#34d399', PROCEDURE: '#facc15',
  LESSON_LEARNED: '#f87171', CODE_ENTITY: '#e2e8f0', API_DESIGN: '#2dd4bf',
};

function nodeColor(t) { return COLORS[t] || '#38bdf8'; }
function nodeSize(e) {
  if (e.type === 'CODE_ENTITY') return 3;
  if (e.tier === 'PROCEDURAL') return 6;
  if (e.tier === 'SEMANTIC') return 5;
  return 4;
}

// SA4E-30: Extract projectId from URL for data isolation
const _urlParams = new URLSearchParams(window.location.search);
const _projectId = _urlParams.get('projectId') || '';
const _basePath = window.__MCP_BASE || '';

let graph3d = null, allNodes = [], selectedId = null;

async function initGraph() {
  const el = document.getElementById('graph3d');
  if (!el) return;
  try {
    const pidParam = _projectId ? `&projectId=${encodeURIComponent(_projectId)}` : '';
    const _api = _basePath + '/api/kb';
    const r = await fetch(_api + '/graph/data?limit=5000' + pidParam);
    const d = await r.json();
    allNodes = d.nodes.map(n => ({
      id: n.id, name: n.summary, type: n.type, tier: n.tier, source: n.source || ''
    }));
    const links = d.edges.map(e => ({ source: e.source, target: e.target }));
    graph3d = ForceGraph3D()(el)
      .graphData({ nodes: allNodes, links })
      .nodeColor(n => nodeColor(n.type)).nodeVal(n => nodeSize(n))
      .nodeLabel(n => '[' + n.type + '] ' + n.name).nodeOpacity(0.9)
      .linkColor(() => 'rgba(100,150,200,0.35)').linkWidth(1.2)
      .linkDirectionalParticles(1).linkDirectionalParticleWidth(1.2)
      .backgroundColor('#0f172a')
      .width(el.clientWidth).height(el.clientHeight)
      .onNodeClick(n => selectGraphNode(n));
    // Resize graph when container changes
    const wrap = document.getElementById('graph-wrap');
    new ResizeObserver(() => {
      if (graph3d) graph3d.width(wrap.clientWidth).height(wrap.clientHeight);
    }).observe(wrap);
    populateClusters();
    // Start minimap (second 3D graph instance)
    setTimeout(() => { startMinimapLoop(); }, 3000);
  } catch (e) { console.error('[graph]', e); }
}

function selectGraphNode(n) {
  selectedId = n.id;
  graph3d.nodeColor(nd => nd.id === selectedId ? '#ffffff' : nodeColor(nd.type));
  graph3d.nodeVal(nd => nd.id === selectedId ? 10 : nodeSize(nd));
  graph3d.linkWidth(lk => {
    const s = lk.source.id || lk.source, t = lk.target.id || lk.target;
    return (s === selectedId || t === selectedId) ? 4 : 1.2;
  });
  graph3d.linkColor(lk => {
    const s = lk.source.id || lk.source, t = lk.target.id || lk.target;
    return (s === selectedId || t === selectedId) ? '#ffffff' : 'rgba(100,150,200,0.35)';
  });
  if (graph3d) graph3d.cameraPosition(
    { x: n.x + 100, y: n.y + 80, z: n.z + 100 },
    { x: n.x, y: n.y, z: n.z }, 800
  );
  loadNodeDetail(n.id);
}

async function loadNodeDetail(id) {
  try {
    const _api = _basePath + '/api/kb';
    const r = await fetch(_api + '/entries/' + id);
    const e = await r.json();
    const nb = await fetch(_api + '/graph/' + id + '/neighbors');
    const neighbors = await nb.json();
    const panel = document.getElementById('graph-node-detail');
    panel.innerHTML = renderEntryDetail(e) +
      (neighbors.length ? '<div style="font-size:.65rem;margin:.4rem 0;opacity:.7">Connected (' +
        neighbors.length + '):</div>' + neighbors.slice(0, 10).map(nb =>
          '<div class="entry-item" onclick="focusEntry(' + nb.id + ')"><span class="entry-type" style="color:' +
          nodeColor(nb.type) + '">' + nb.type + '</span><div class="entry-summary">' +
          esc(nb.summary) + '</div></div>'
        ).join('') : '');
  } catch (e) { console.error(e); }
}

function focusEntry(id) {
  if (!graph3d) return;
  const n = graph3d.graphData().nodes.find(x => x.id === id);
  if (n) selectGraphNode(n);
  else loadNodeDetail(id);
}

/* --- Minimap: Second 3D graph instance fully synced with main graph --- */
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

function populateClusters() {
  const s = new Set();
  allNodes.forEach(n => { if (n.source) { const p = n.source.split('/').slice(0, 2).join('/'); if (p) s.add(p); } });
  const sel = document.getElementById('cs');
  if (!sel) return;
  Array.from(s).sort().forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
}

function graphFit() { if (graph3d) graph3d.zoomToFit(400); }
function graphReset() { if (graph3d) graph3d.cameraPosition({ x: 0, y: 0, z: 500 }, { x: 0, y: 0, z: 0 }, 800); }
function graphJumpCluster(val) {
  if (!graph3d || !val) return;
  const ns = graph3d.graphData().nodes.filter(n => n.source && n.source.startsWith(val));
  if (!ns.length) return;
  const cx = ns.reduce((s, n) => s + n.x, 0) / ns.length;
  const cy = ns.reduce((s, n) => s + n.y, 0) / ns.length;
  const cz = ns.reduce((s, n) => s + n.z, 0) / ns.length;
  graph3d.cameraPosition({ x: cx + 120, y: cy + 80, z: cz + 120 }, { x: cx, y: cy, z: cz }, 800);
}
