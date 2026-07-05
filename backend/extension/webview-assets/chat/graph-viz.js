/**
 * Graph Visualization — KSA-224
 * SVG-based pipeline graph showing nodes with color-coded states.
 * Real-time updates via postMessage from extension.
 */

(function () {
  "use strict";

  var NODE_WIDTH = 70;
  var NODE_HEIGHT = 32;
  var NODE_GAP_X = 10;
  var NODE_GAP_Y = 40;
  var PADDING = 10;

  var PIPELINE_NODES = [
    { id: "sm", label: "SM", phase: "all", row: 0, col: 2 },
    { id: "ba_brd", label: "BA\u2192BRD", phase: "requirements", row: 1, col: 0 },
    { id: "ba_fsd", label: "BA\u2192FSD", phase: "specification", row: 1, col: 1 },
    { id: "ta_enrich", label: "TA", phase: "specification", row: 1, col: 2 },
    { id: "sa_tdd", label: "SA\u2192TDD", phase: "design", row: 1, col: 3 },
    { id: "qa_plan", label: "QA Plan", phase: "test_planning", row: 2, col: 0 },
    { id: "dev_code", label: "DEV", phase: "implementation", row: 2, col: 1 },
    { id: "dev_ug", label: "DEV UG", phase: "user_guide", row: 2, col: 2 },
    { id: "qa_test", label: "QA Test", phase: "testing", row: 2, col: 3 },
    { id: "devops", label: "DevOps", phase: "deployment", row: 2, col: 4 },
  ];

  var EDGES = [
    ["sm", "ba_brd"], ["sm", "ba_fsd"], ["sm", "sa_tdd"],
    ["sm", "qa_plan"], ["sm", "dev_code"], ["sm", "qa_test"], ["sm", "devops"],
    ["ba_brd", "ba_fsd"], ["ba_fsd", "ta_enrich"], ["ta_enrich", "sa_tdd"],
    ["sa_tdd", "qa_plan"], ["qa_plan", "dev_code"],
    ["dev_code", "dev_ug"], ["dev_ug", "qa_test"], ["qa_test", "devops"],
  ];

  var STATE_COLORS = {
    idle: { fill: "#2d2d2d", stroke: "#555", text: "#999" },
    active: { fill: "#1a3a5c", stroke: "#3b82f6", text: "#93c5fd" },
    completed: { fill: "#1a3d2e", stroke: "#10b981", text: "#6ee7b7" },
    failed: { fill: "#3d1a1a", stroke: "#ef4444", text: "#fca5a5" },
    skipped: { fill: "#2d2d2d", stroke: "#444", text: "#666" },
  };

  var nodeStates = {};

  var graphContainer = document.createElement("div");
  graphContainer.id = "pipeline-graph";
  graphContainer.className = "graph-container collapsed";
  graphContainer.innerHTML = '<button class="graph-toggle" title="Toggle pipeline graph">&#9650; Pipeline</button><button class="graph-popout" title="Open in full panel">&#x2197;</button><div class="graph-svg-wrap"></div>';

  var header = document.getElementById("chat-header");
  if (header && header.parentNode) {
    header.parentNode.insertBefore(graphContainer, header.nextSibling);
  }

  var toggleBtn = graphContainer.querySelector(".graph-toggle");
  toggleBtn.addEventListener("click", function () {
    graphContainer.classList.toggle("collapsed");
    toggleBtn.innerHTML = graphContainer.classList.contains("collapsed")
      ? "&#9650; Pipeline" : "&#9660; Pipeline";
  });

  var popoutBtn = graphContainer.querySelector(".graph-popout");
  popoutBtn.addEventListener("click", function () {
    var vs = window.__vscode;
    if (vs) vs.postMessage({ type: "executeCommand", command: "kiroSdlc.openWorkflowGraph" });
  });

  function renderGraph() {
    var maxCol = 0, maxRow = 0;
    for (var i = 0; i < PIPELINE_NODES.length; i++) {
      if (PIPELINE_NODES[i].col > maxCol) maxCol = PIPELINE_NODES[i].col;
      if (PIPELINE_NODES[i].row > maxRow) maxRow = PIPELINE_NODES[i].row;
    }
    var svgWidth = (maxCol + 1) * (NODE_WIDTH + NODE_GAP_X) + PADDING * 2;
    var svgHeight = (maxRow + 1) * (NODE_HEIGHT + NODE_GAP_Y) + PADDING * 2;

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + svgWidth + '" height="' + svgHeight + '" viewBox="0 0 ' + svgWidth + ' ' + svgHeight + '">';

    for (var e = 0; e < EDGES.length; e++) {
      var fromNode = findNode(EDGES[e][0]);
      var toNode = findNode(EDGES[e][1]);
      if (fromNode && toNode) {
        var x1 = PADDING + fromNode.col * (NODE_WIDTH + NODE_GAP_X) + NODE_WIDTH / 2;
        var y1 = PADDING + fromNode.row * (NODE_HEIGHT + NODE_GAP_Y) + NODE_HEIGHT;
        var x2 = PADDING + toNode.col * (NODE_WIDTH + NODE_GAP_X) + NODE_WIDTH / 2;
        var y2 = PADDING + toNode.row * (NODE_HEIGHT + NODE_GAP_Y);
        svg += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#444" stroke-width="1.5" stroke-dasharray="4,3"/>';
      }
    }

    for (var n = 0; n < PIPELINE_NODES.length; n++) {
      var node = PIPELINE_NODES[n];
      var state = nodeStates[node.id] || "idle";
      var colors = STATE_COLORS[state] || STATE_COLORS.idle;
      var x = PADDING + node.col * (NODE_WIDTH + NODE_GAP_X);
      var y = PADDING + node.row * (NODE_HEIGHT + NODE_GAP_Y);

      svg += '<rect x="' + x + '" y="' + y + '" width="' + NODE_WIDTH + '" height="' + NODE_HEIGHT + '" rx="4" ry="4" fill="' + colors.fill + '" stroke="' + colors.stroke + '" stroke-width="1.5"/>';
      svg += '<text x="' + (x + NODE_WIDTH / 2) + '" y="' + (y + NODE_HEIGHT / 2 + 4) + '" text-anchor="middle" font-size="9" font-family="system-ui, sans-serif" font-weight="500" fill="' + colors.text + '">' + node.label + '</text>';

      if (state === "active") {
        svg += '<rect x="' + x + '" y="' + y + '" width="' + NODE_WIDTH + '" height="' + NODE_HEIGHT + '" rx="4" ry="4" fill="none" stroke="' + colors.stroke + '" stroke-width="2" opacity="0.5"><animate attributeName="opacity" values="0.5;0;0.5" dur="1.5s" repeatCount="indefinite"/></rect>';
      }
    }

    svg += '</svg>';
    var wrap = graphContainer.querySelector(".graph-svg-wrap");
    wrap.innerHTML = svg;
  }

  function findNode(id) {
    for (var i = 0; i < PIPELINE_NODES.length; i++) {
      if (PIPELINE_NODES[i].id === id) return PIPELINE_NODES[i];
    }
    return null;
  }

  function handleGraphUpdate(nodes) {
    if (!nodes || !nodes.length) return;
    for (var i = 0; i < nodes.length; i++) {
      nodeStates[nodes[i].id] = nodes[i].status;
    }
    renderGraph();
    if (graphContainer.classList.contains("collapsed")) {
      var hasActive = nodes.some(function (n) { return n.status === "active"; });
      if (hasActive) {
        graphContainer.classList.remove("collapsed");
        toggleBtn.innerHTML = "&#9660; Pipeline";
      }
    }
  }

  window.addEventListener("message", function (event) {
    var msg = event.data;
    if (msg && msg.type === "chat:graphUpdate") {
      handleGraphUpdate(msg.nodes);
    }
  });

  renderGraph();
  window.PipelineGraphViz = { handleGraphUpdate: handleGraphUpdate, renderGraph: renderGraph };
})();
