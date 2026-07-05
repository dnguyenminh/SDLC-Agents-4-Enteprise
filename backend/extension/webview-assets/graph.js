/**
 * graph.js — 3D force-directed knowledge graph using Three.js + 3d-force-graph.
 * Wired with toolbar controls: search, type/tier filters, layout toggle, legend, detail sidebar.
 */

/* global ForceGraph3D, vscode, showNodeDetail, showTooltip, hideTooltip */

let graph = null;
let allNodes = [];
let allEdges = [];
let currentLayout = '3d';
let activeTypeFilters = null;
let activeTierFilters = null;
let searchQuery = '';
let selectedNodeId = null;

// --- Message handler from extension ---
function handlePanelMessage(msg) {
  if (msg.type === 'graphData') {
    allNodes = msg.nodes || [];
    allEdges = msg.edges || [];
    renderGraph(allNodes, allEdges);
  }
  if (msg.type === 'entryDetail') {
    // Show node detail section
    var placeholder = document.getElementById('sidebar-placeholder');
    var detailSection = document.getElementById('node-detail-section');
    if (placeholder) placeholder.style.display = 'none';
    if (detailSection) detailSection.style.display = 'block';

    var entry = msg.entry || {};

    // Focus camera on the node in the graph
    if (graph && entry.id) {
      selectedNodeId = entry.id;
      graph.nodeColor(graph.nodeColor());
      graph.nodeVal(graph.nodeVal());
      var graphData = graph.graphData();
      var targetNode = graphData.nodes.find(function(n) { return n.id === entry.id; });
      if (targetNode && targetNode.x !== undefined) {
        var distance = 200;
        var distRatio = 1 + distance / (Math.hypot(targetNode.x, targetNode.y, targetNode.z || 0) || 1);
        graph.cameraPosition(
          { x: targetNode.x * distRatio, y: targetNode.y * distRatio, z: (targetNode.z || 0) * distRatio },
          targetNode,
          1000
        );
      }
    }

    var titleEl = document.getElementById('detail-title');
    var typeEl = document.getElementById('detail-type');
    var tierEl = document.getElementById('detail-tier');
    var contentEl = document.getElementById('detail-content');
    if (titleEl) titleEl.textContent = entry.title || entry.summary || 'Entry #' + (entry.id || '');
    if (typeEl) {
      typeEl.textContent = entry.type || '';
      var typeColors = { DECISION:'#3b82f6', ERROR_PATTERN:'#ef4444', ARCHITECTURE:'#8b5cf6', PROCEDURE:'#10b981', CONTEXT:'#f59e0b', LESSON_LEARNED:'#06b6d4', CODE_ENTITY:'#6366f1', REQUIREMENT:'#ec4899', API_DESIGN:'#14b8a6' };
      typeEl.style.background = (typeColors[entry.type] || '#607D8B') + '33';
      typeEl.style.color = typeColors[entry.type] || '#607D8B';
    }
    if (tierEl) tierEl.textContent = entry.tier || '';
    if (contentEl) contentEl.textContent = entry.content || '';
    // Tags
    var tagsSection = document.getElementById('detail-tags-section');
    var tagsEl = document.getElementById('detail-tags');
    if (tagsSection && tagsEl) {
      if (entry.tags && entry.tags.length > 0) {
        tagsSection.style.display = 'block';
        tagsEl.innerHTML = entry.tags.map(function(t) { return '<span style="padding:2px 6px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);border-radius:8px;font-size:10px;">' + t + '</span>'; }).join('');
      } else {
        tagsSection.style.display = 'none';
      }
    }
  }
  if (msg.type === 'sidebarStats') {
    var s = msg.stats || {};
    var el;
    el = document.getElementById('stat-entries'); if (el) el.textContent = s.totalEntries || '0';
    el = document.getElementById('stat-edges'); if (el) el.textContent = s.totalEdges || '0';
    el = document.getElementById('stat-pinned'); if (el) el.textContent = s.totalPinned || '0';
    el = document.getElementById('stat-tiers'); if (el) el.textContent = s.totalTiers || '0';
  }
  if (msg.type === 'recentEntries') {
    var recentEl = document.getElementById('recent-entries');
    var entries = msg.entries || [];
    if (recentEl) {
      if (entries.length === 0) {
        recentEl.innerHTML = '<div style="opacity:0.5">No entries yet</div>';
      } else {
        var typeColors2 = { DECISION:'#3b82f6', ERROR_PATTERN:'#ef4444', ARCHITECTURE:'#8b5cf6', PROCEDURE:'#10b981', CONTEXT:'#f59e0b', LESSON_LEARNED:'#06b6d4', CODE_ENTITY:'#6366f1', REQUIREMENT:'#ec4899', API_DESIGN:'#14b8a6' };
        recentEl.innerHTML = entries.map(function(e) {
          var color = typeColors2[e.type] || '#607D8B';
          return '<div class="recent-entry-item" data-entry-id="' + e.id + '" style="padding:4px 0;border-bottom:1px solid var(--vscode-editorWidget-border, rgba(255,255,255,0.06));cursor:pointer;">' +
            '<span style="color:' + color + ';font-size:10px;font-weight:600;">' + (e.type || 'CONTEXT') + '</span>' +
            '<div style="font-size:11px;opacity:0.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (e.summary || 'Entry #' + e.id) + '</div></div>';
        }).join('');
      }
    }
  }
  if (msg.type === 'error') {
    var loading = document.getElementById('loading');
    if (loading) { loading.textContent = msg.message; loading.style.display = 'block'; }
  }
}

// --- Render / Update Graph ---
function renderGraph(nodes, edges) {
  var container = document.getElementById('graph-container');
  var loading = document.getElementById('loading');
  var nodeCountEl = document.getElementById('node-count');

  // Apply filters
  var filtered = nodes.slice();
  if (activeTypeFilters !== null) {
    filtered = filtered.filter(function(n) { return activeTypeFilters.indexOf(n.type) !== -1; });
  }
  if (activeTierFilters !== null) {
    filtered = filtered.filter(function(n) { return activeTierFilters.indexOf(n.tier) !== -1; });
  }

  // Search highlight (don't filter out, just mark)
  var q = (searchQuery || '').toLowerCase();
  if (q.length >= 2) {
    filtered = filtered.map(function(n) {
      var matchTitle = (n.title || '').toLowerCase().indexOf(q) !== -1;
      var matchType = (n.type || '').toLowerCase().indexOf(q) !== -1;
      return Object.assign({}, n, { _highlighted: matchTitle || matchType });
    });
  }

  if (!filtered || filtered.length === 0) {
    if (loading) { loading.textContent = 'No matching entries.'; loading.style.display = 'block'; }
    if (nodeCountEl) nodeCountEl.textContent = '0 entries, 0 edges';
    if (graph) { graph.graphData({ nodes: [], links: [] }); }
    return;
  }
  if (loading) loading.style.display = 'none';

  // Filter edges to visible nodes
  var nodeIds = {};
  filtered.forEach(function(n) { nodeIds[n.id] = true; });
  var filteredEdges = edges.filter(function(e) { return nodeIds[e.source] && nodeIds[e.target]; });

  if (nodeCountEl) nodeCountEl.textContent = filtered.length + ' entries, ' + filteredEdges.length + ' edges';

  // Show search match count
  if (q.length >= 2) {
    var matchCount = filtered.filter(function(n) { return n._highlighted; }).length;
    if (nodeCountEl) nodeCountEl.textContent = matchCount + ' matches / ' + filtered.length + ' entries';
  }

  var links = filteredEdges.map(function(e) { return { source: e.source, target: e.target, relation: e.relation }; });
  var graphData = { nodes: filtered, links: links };

  if (graph) {
    graph.graphData(graphData);
    // Update node colors for search + selection
    graph.nodeColor(function(n) {
      if (n.id === selectedNodeId) return '#ffffff';
      if (n._highlighted) return '#00ff88';
      if (q.length >= 2 && !n._highlighted) return (n.color || '#666') + '44';
      return n.color;
    });
    graph.nodeVal(function(n) {
      if (n.id === selectedNodeId) return 25;
      return n.size || 10;
    });
    return;
  }

  // Create new graph
  graph = ForceGraph3D()(container)
    .graphData(graphData)
    .nodeLabel('')
    .nodeColor(function(n) {
      if (n.id === selectedNodeId) return '#ffffff';
      if (n._highlighted) return '#00ff88';
      if (q.length >= 2 && !n._highlighted) return (n.color || '#666') + '44';
      return n.color;
    })
    .nodeVal(function(n) {
      if (n.id === selectedNodeId) return 25;
      return n.size || 10;
    })
    .nodeOpacity(0.9)
    .linkDirectionalArrowLength(4)
    .linkDirectionalArrowRelPos(1)
    .linkLabel(function(l) { return l.relation; })
    .linkColor(function() { return 'rgba(255,255,255,0.4)'; })
    .linkWidth(2)
    .backgroundColor('rgba(0,0,0,0)')
    .width(container.clientWidth)
    .height(container.clientHeight)
    .onNodeClick(function(node) {
      // Mark as selected + highlight
      selectedNodeId = node.id;
      graph.nodeColor(graph.nodeColor());
      graph.nodeVal(graph.nodeVal());

      // Focus camera on clicked node
      var distance = 200;
      var distRatio = 1 + distance / Math.hypot(node.x || 0, node.y || 0, node.z || 0);
      graph.cameraPosition(
        { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
        node,
        1000
      );

      // Show entry details in sidebar
      var sidebar = document.getElementById('detail-sidebar');
      if (sidebar) {
        var titleEl = document.getElementById('detail-title');
        var typeEl = document.getElementById('detail-type');
        var tierEl = document.getElementById('detail-tier');
        var contentEl = document.getElementById('detail-content');
        if (titleEl) titleEl.textContent = node.title || 'Node #' + node.id;
        if (typeEl) { typeEl.textContent = node.type || ''; typeEl.style.color = node.color || '#fff'; typeEl.style.background = (node.color || '#666') + '22'; }
        if (tierEl) tierEl.textContent = node.tier || '';
        if (contentEl) contentEl.textContent = 'ID: ' + node.id + '\nType: ' + (node.type || '') + '\nTier: ' + (node.tier || '');
        document.getElementById('sidebar-placeholder').style.display = 'none';
        document.getElementById('node-detail-section').style.display = 'block';
      }
      // Also request full details from extension
      vscode.postMessage({ type: 'nodeClick', entryId: node.id });
    })
    .onNodeHover(function(node) {
      if (node && typeof showTooltip === 'function') {
        var screen = graph.graph2ScreenCoords(node.x, node.y, node.z || 0);
        showTooltip(screen.x + 80, screen.y + 80, node.title || '', node.type || '');
      } else if (typeof hideTooltip === 'function') {
        hideTooltip();
      }
      container.style.cursor = node ? 'pointer' : 'default';
    });

  window.addEventListener('resize', function() {
    if (graph) graph.width(container.clientWidth).height(container.clientHeight);
  });
}

// --- Layout switch ---
function setGraphLayout(mode) {
  if (mode === currentLayout) return;
  currentLayout = mode;
  if (graph) {
    var container = document.getElementById('graph-container');
    graph._destructor && graph._destructor();
    graph = null;
    var children = container.children;
    for (var i = children.length - 1; i >= 0; i--) {
      if (children[i].id !== 'loading') container.removeChild(children[i]);
    }
  }
  renderGraph(allNodes, allEdges);
}

// --- Wire message listener (base-panel already calls handlePanelMessage) ---
// No need for separate addEventListener — base HTML handles it

// --- Wire controls after DOM ready ---
(function wireControls() {
  function wire() {
    // Search input
    var searchInput = document.getElementById('search-input');
    if (searchInput) {
      var debounce = null;
      searchInput.addEventListener('input', function() {
        clearTimeout(debounce);
        var val = this.value;
        debounce = setTimeout(function() {
          searchQuery = val;
          renderGraph(allNodes, allEdges);
          // Show search results in sidebar
          showSearchResults(val);
        }, 200);
      });
    }

    // Type filter button
    var typeBtn = document.getElementById('type-filter-btn');
    if (typeBtn) {
      typeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var dd = document.getElementById('type-dropdown');
        var isVis = dd.style.display !== 'none';
        document.querySelectorAll('.dropdown-panel').forEach(function(d) { d.style.display = 'none'; });
        if (!isVis) dd.style.display = 'block';
      });
    }

    // Tier filter button
    var tierBtn = document.getElementById('tier-filter-btn');
    if (tierBtn) {
      tierBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var dd = document.getElementById('tier-dropdown');
        var isVis = dd.style.display !== 'none';
        document.querySelectorAll('.dropdown-panel').forEach(function(d) { d.style.display = 'none'; });
        if (!isVis) dd.style.display = 'block';
      });
    }

    // Close dropdowns on outside click
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.filter-dropdown')) {
        document.querySelectorAll('.dropdown-panel').forEach(function(d) { d.style.display = 'none'; });
      }
    });

    // Type checkboxes
    document.querySelectorAll('#type-dropdown input[type=checkbox]').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var checked = [];
        document.querySelectorAll('#type-dropdown input:checked').forEach(function(c) { checked.push(c.value); });
        activeTypeFilters = checked;
        renderGraph(allNodes, allEdges);
      });
    });

    // Tier checkboxes
    document.querySelectorAll('#tier-dropdown input[type=checkbox]').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var checked = [];
        document.querySelectorAll('#tier-dropdown input:checked').forEach(function(c) { checked.push(c.value); });
        activeTierFilters = checked;
        renderGraph(allNodes, allEdges);
      });
    });

    // Layout toggle
    var btn2d = document.getElementById('btn-2d');
    var btn3d = document.getElementById('btn-3d');
    if (btn2d) btn2d.addEventListener('click', function() { setGraphLayout('2d'); btn2d.style.background='var(--vscode-button-background)'; btn2d.style.color='var(--vscode-button-foreground)'; if(btn3d){btn3d.style.background='var(--vscode-input-background)'; btn3d.style.color='var(--vscode-foreground)';} });
    if (btn3d) btn3d.addEventListener('click', function() { setGraphLayout('3d'); btn3d.style.background='var(--vscode-button-background)'; btn3d.style.color='var(--vscode-button-foreground)'; if(btn2d){btn2d.style.background='var(--vscode-input-background)'; btn2d.style.color='var(--vscode-foreground)';} });

    // Refresh button
    var refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function() {
        refreshBtn.disabled = true; refreshBtn.style.opacity = '0.5';
        vscode.postMessage({ type: 'refresh' });
        setTimeout(function() { refreshBtn.disabled = false; refreshBtn.style.opacity = '1'; }, 2000);
      });
    }

    // Legend toggle
    var legendToggle = document.getElementById('legend-toggle');
    if (legendToggle) {
      var legendOpen = false;
      legendToggle.addEventListener('click', function() {
        legendOpen = !legendOpen;
        var items = document.getElementById('legend-items');
        if (items) items.style.display = legendOpen ? 'flex' : 'none';
        legendToggle.innerHTML = legendOpen ? 'Legend &#9662;' : 'Legend &#9656;';
      });
    }

    // Sidebar close
    var closeBtn = document.getElementById('sidebar-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        var detailSection = document.getElementById('node-detail-section');
        var placeholder = document.getElementById('sidebar-placeholder');
        if (detailSection) detailSection.style.display = 'none';
        if (placeholder) placeholder.style.display = 'block';
      });
    }

    // Recent entries click (event delegation)
    var recentContainer = document.getElementById('recent-entries');
    if (recentContainer) {
      recentContainer.addEventListener('click', function(e) {
        var item = e.target.closest('.recent-entry-item');
        if (item) {
          var entryId = parseInt(item.getAttribute('data-entry-id'), 10);
          if (entryId) {
            vscode.postMessage({ type: 'nodeClick', entryId: entryId });
          }
        }
      });
    }

    // Jump-to select (event delegation)
    var jumpTo = document.getElementById('jump-to');
    if (jumpTo) {
      jumpTo.addEventListener('change', function() {
        var type = jumpTo.value;
        if (type && typeof jumpToCluster === 'function') {
          jumpToCluster(type);
        }
        // Keep selected value visible (don't reset)
      });
    }
  }

  if (document.getElementById('search-input')) { wire(); }
  else { setTimeout(wire, 100); setTimeout(wire, 500); }
})();


// --- Minimap with real viewport sync ---
var minimapCanvas = null;
var minimapCtx = null;
var minimapBounds = { minX: 0, maxX: 1, minY: 0, maxY: 1, scale: 1, offX: 0, offY: 0 };
var minimapDragging = false;
var minimapRAF = null;

function initMinimap() {
  minimapCanvas = document.getElementById('minimap');
  if (!minimapCanvas) return;
  minimapCtx = minimapCanvas.getContext('2d');

  // Drag-to-navigate on minimap
  minimapCanvas.addEventListener('mousedown', function(e) {
    minimapDragging = true;
    minimapNavigateTo(e);
  });
  minimapCanvas.addEventListener('mousemove', function(e) {
    if (minimapDragging) minimapNavigateTo(e);
  });
  minimapCanvas.addEventListener('mouseup', function() { minimapDragging = false; });
  minimapCanvas.addEventListener('mouseleave', function() { minimapDragging = false; });

  // Start rAF loop instead of setInterval
  requestAnimationFrame(renderMinimapFrame);
}

function minimapNavigateTo(e) {
  if (!graph) return;
  var rect = minimapCanvas.getBoundingClientRect();
  var clickX = e.clientX - rect.left;
  var clickY = e.clientY - rect.top;
  var b = minimapBounds;
  if (b.scale === 0) return;

  // Convert minimap coords back to graph coords
  var graphX = (clickX - b.offX) / b.scale + b.minX;
  var graphY = (clickY - b.offY) / b.scale + b.minY;

  // Navigate camera to that position
  var dist = 500;
  try { dist = graph.cameraPosition().z || 500; } catch(ex) {}
  graph.cameraPosition({ x: graphX, y: graphY, z: dist }, { x: graphX, y: graphY, z: 0 }, 600);
}

function renderMinimapFrame() {
  renderMinimap();
  minimapRAF = requestAnimationFrame(renderMinimapFrame);
}

function renderMinimap() {
  if (!minimapCtx || !allNodes || allNodes.length === 0 || !graph) return;

  var w = minimapCanvas.width;
  var h = minimapCanvas.height;
  minimapCtx.clearRect(0, 0, w, h);

  var graphData = graph.graphData();
  var nodes = graphData.nodes;
  if (!nodes || nodes.length === 0) return;

  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  nodes.forEach(function(n) {
    if (n.x !== undefined) { if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x; }
    if (n.y !== undefined) { if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y; }
  });
  if (minX === Infinity) return;

  var rangeX = maxX - minX || 1;
  var rangeY = maxY - minY || 1;
  var pad = 10;
  var scale = Math.min((w - pad * 2) / rangeX, (h - pad * 2) / rangeY);
  var offX = (w - rangeX * scale) / 2;
  var offY = (h - rangeY * scale) / 2;

  // Store bounds for click/drag navigation
  minimapBounds = { minX: minX, maxX: maxX, minY: minY, maxY: maxY, scale: scale, offX: offX, offY: offY };

  // Edges
  minimapCtx.strokeStyle = 'rgba(255,255,255,0.08)';
  minimapCtx.lineWidth = 0.5;
  (graphData.links || []).forEach(function(link) {
    var src = typeof link.source === 'object' ? link.source : null;
    var tgt = typeof link.target === 'object' ? link.target : null;
    if (src && tgt && src.x !== undefined && tgt.x !== undefined) {
      minimapCtx.beginPath();
      minimapCtx.moveTo((src.x - minX) * scale + offX, (src.y - minY) * scale + offY);
      minimapCtx.lineTo((tgt.x - minX) * scale + offX, (tgt.y - minY) * scale + offY);
      minimapCtx.stroke();
    }
  });

  // Nodes
  nodes.forEach(function(n) {
    if (n.x === undefined) return;
    minimapCtx.beginPath();
    minimapCtx.arc((n.x - minX) * scale + offX, (n.y - minY) * scale + offY, 1.5, 0, Math.PI * 2);
    minimapCtx.fillStyle = n.color || '#888';
    minimapCtx.fill();
  });

  // --- Real viewport rect from camera ---
  var container = document.getElementById('graph-container');
  if (!container) return;

  var cam;
  try { cam = graph.cameraPosition(); } catch(ex) { return; }
  if (!cam || cam.z === undefined) return;

  // Approximate visible world-space extent based on camera distance (perspective FOV ~75deg)
  var fovRad = 75 * Math.PI / 180;
  var halfFov = fovRad / 2;
  var camDist = Math.abs(cam.z) || 500;
  var aspect = container.clientWidth / (container.clientHeight || 1);

  // Visible half-extents in world space
  var visHalfH = Math.tan(halfFov) * camDist;
  var visHalfW = visHalfH * aspect;

  // Camera look-at center in world space
  var lookX = cam.x || 0;
  var lookY = cam.y || 0;

  // Convert viewport world bounds to minimap coords
  var vpLeft = (lookX - visHalfW - minX) * scale + offX;
  var vpTop = (lookY - visHalfH - minY) * scale + offY;
  var vpWidth = visHalfW * 2 * scale;
  var vpHeight = visHalfH * 2 * scale;

  // Clamp to minimap bounds
  vpLeft = Math.max(0, Math.min(w - 4, vpLeft));
  vpTop = Math.max(0, Math.min(h - 4, vpTop));
  vpWidth = Math.max(8, Math.min(w - vpLeft, vpWidth));
  vpHeight = Math.max(6, Math.min(h - vpTop, vpHeight));

  // Draw viewport rect with semi-transparent fill + border
  minimapCtx.fillStyle = 'rgba(56, 189, 248, 0.08)';
  minimapCtx.fillRect(vpLeft, vpTop, vpWidth, vpHeight);
  minimapCtx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
  minimapCtx.lineWidth = 1.5;
  minimapCtx.strokeRect(vpLeft, vpTop, vpWidth, vpHeight);

  // Draw center crosshair
  var cx = vpLeft + vpWidth / 2;
  var cy = vpTop + vpHeight / 2;
  minimapCtx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
  minimapCtx.lineWidth = 1;
  minimapCtx.beginPath();
  minimapCtx.moveTo(cx - 4, cy); minimapCtx.lineTo(cx + 4, cy);
  minimapCtx.moveTo(cx, cy - 4); minimapCtx.lineTo(cx, cy + 4);
  minimapCtx.stroke();
}

setTimeout(initMinimap, 1000);

// --- Show search results in sidebar ---
function showSearchResults(query) {
  var recentEl = document.getElementById('recent-entries');
  var sectionLabel = document.querySelector('#recent-section > div');
  if (!recentEl) return;

  if (!query || query.length < 2) {
    // Restore "RECENT ENTRIES" label
    if (sectionLabel) sectionLabel.textContent = 'RECENT ENTRIES';
    // Re-render recent entries from allNodes
    var typeColors = { DECISION:'#3b82f6', ERROR_PATTERN:'#ef4444', ARCHITECTURE:'#8b5cf6', PROCEDURE:'#10b981', CONTEXT:'#f59e0b', LESSON_LEARNED:'#06b6d4', CODE_ENTITY:'#6366f1', REQUIREMENT:'#ec4899', API_DESIGN:'#14b8a6' };
    var recent = allNodes.slice(0, 10);
    recentEl.innerHTML = recent.map(function(e) {
      var color = typeColors[e.type] || '#607D8B';
      return '<div class="recent-entry-item" data-entry-id="' + e.id + '" style="padding:4px 0;border-bottom:1px solid var(--vscode-editorWidget-border, rgba(255,255,255,0.06));cursor:pointer;">' +
        '<span style="color:' + color + ';font-size:10px;font-weight:600;">' + (e.type || 'CONTEXT') + '</span>' +
        '<div style="font-size:11px;opacity:0.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (e.title || 'Entry #' + e.id) + '</div></div>';
    }).join('');
    return;
  }

  var q = query.toLowerCase();
  var matches = allNodes.filter(function(n) {
    return (n.title || '').toLowerCase().indexOf(q) !== -1 || (n.type || '').toLowerCase().indexOf(q) !== -1;
  }).slice(0, 20);

  if (sectionLabel) sectionLabel.textContent = 'SEARCH RESULTS (' + matches.length + ')';

  if (matches.length === 0) {
    recentEl.innerHTML = '<div style="opacity:0.5;font-size:11px;">No matches found</div>';
    return;
  }

  var typeColors = { DECISION:'#3b82f6', ERROR_PATTERN:'#ef4444', ARCHITECTURE:'#8b5cf6', PROCEDURE:'#10b981', CONTEXT:'#f59e0b', LESSON_LEARNED:'#06b6d4', CODE_ENTITY:'#6366f1', REQUIREMENT:'#ec4899', API_DESIGN:'#14b8a6' };
  recentEl.innerHTML = matches.map(function(e) {
    var color = typeColors[e.type] || '#607D8B';
    return '<div class="recent-entry-item" data-entry-id="' + e.id + '" style="padding:4px 0;border-bottom:1px solid var(--vscode-editorWidget-border, rgba(255,255,255,0.06));cursor:pointer;">' +
      '<span style="color:' + color + ';font-size:10px;font-weight:600;">' + (e.type || 'CONTEXT') + '</span>' +
      '<div style="font-size:11px;opacity:0.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (e.title || 'Entry #' + e.id) + '</div></div>';
  }).join('');
}

// --- Jump to cluster by type ---
function jumpToCluster(type) {
  if (!graph || !allNodes || allNodes.length === 0) return;
  var graphData = graph.graphData();
  var nodes = graphData.nodes;
  var matching = nodes.filter(function(n) { return n.type === type && n.x !== undefined; });
  if (matching.length === 0) return;

  // Highlight matching nodes by setting search-like state
  searchQuery = '';
  selectedNodeId = null;
  // Use nodeColor to highlight the cluster
  graph.nodeColor(function(n) {
    if (n.type === type) return '#00ff88';
    return (n.color || '#666') + '44';
  });
  graph.nodeVal(function(n) {
    if (n.type === type) return 18;
    return 6;
  });

  // Calculate centroid of matching nodes
  var sumX = 0, sumY = 0, sumZ = 0;
  matching.forEach(function(n) { sumX += n.x; sumY += n.y; sumZ += (n.z || 0); });
  var cx = sumX / matching.length;
  var cy = sumY / matching.length;
  var cz = sumZ / matching.length;

  // Move camera to centroid
  var dist = Math.max(200, matching.length * 5);
  graph.cameraPosition({ x: cx, y: cy, z: cz + dist }, { x: cx, y: cy, z: cz }, 1000);

  // Update footer with match count
  var nodeCountEl = document.getElementById('node-count');
  if (nodeCountEl) nodeCountEl.textContent = matching.length + ' ' + type + ' entries highlighted';
}

// --- Minimap navigation handled by initMinimap drag-to-navigate ---
