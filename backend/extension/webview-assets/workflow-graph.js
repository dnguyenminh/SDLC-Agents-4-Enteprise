/**
 * Workflow Graph — 3D Force-Graph with canvas sprite labels
 * Key fix: uses THREE.Texture(canvas) NOT THREE.CanvasTexture for VS Code webview compat.
 */
/* global vscode, ForceGraph3D, THREE */

let graphState = { nodes: [], edges: [], selectedPhase: null, graph3d: null };
const NODE_COLORS = { agent: "#3b82f6", quality_gate: "#10b981", verify: "#f59e0b", security: "#ef4444", control: "#8b5cf6" };
const PHASES = [
  { id: "all", label: "ALL", nodes: null },
  { id: "phase1", label: "P1:BRD", nodes: ["ba_brd", "verify_ba_brd", "quality_gate_requirements"] },
  { id: "phase2", label: "P2:FSD", nodes: ["ba_fsd", "verify_ba_fsd", "ta_enrich", "security_review_fsd", "quality_gate_specification"] },
  { id: "phase3", label: "P3:TDD", nodes: ["sa_tdd", "verify_sa_tdd", "feedback_check", "ba_fix_fsd", "sa_review", "security_review_tdd", "quality_gate_design"] },
  { id: "phase4", label: "P4:QA", nodes: ["qa_plan", "verify_qa_plan", "quality_gate_test_planning"] },
  { id: "phase5", label: "P5:Code", nodes: ["dev_code", "verify_dev_code", "security_review_code", "quality_gate_implementation"] },
  { id: "phase55", label: "P5.5:UG", nodes: ["dev_ug", "verify_dev_ug", "ba_review_ug", "qa_verify_ug", "ug_join", "quality_gate_user_guide"] },
  { id: "phase6", label: "P6:Test", nodes: ["qa_test", "quality_gate_testing"] },
  { id: "phase7", label: "P7:Deploy", nodes: ["devops_deploy", "quality_gate_deployment"] },
];

function handlePanelMessage(msg) {
  if (msg.type === "workflowData") {
    graphState.nodes = msg.nodes || [];
    graphState.edges = msg.edges || [];
    renderPhaseBar();
    render3DGraph(null);
  }
}

function renderPhaseBar() {
  const bar = document.getElementById("phase-bar");
  if (!bar) return;
  bar.innerHTML = "";
  PHASES.forEach(phase => {
    const btn = document.createElement("button");
    btn.className = "phase-btn" + ((graphState.selectedPhase || "all") === phase.id ? " active" : "");
    btn.textContent = phase.label;
    btn.addEventListener("click", () => { graphState.selectedPhase = phase.id; renderPhaseBar(); render3DGraph(phase.nodes ? phase : null); });
    bar.appendChild(btn);
  });
}

function render3DGraph(filterPhase) {
  const container = document.getElementById("graph-3d");
  if (!container) return;
  container.innerHTML = "";

  let visibleNodeIds;
  if (filterPhase && filterPhase.nodes) { visibleNodeIds = new Set(filterPhase.nodes); }
  else { visibleNodeIds = new Set(graphState.nodes.map(n => n.id)); }

  const nodes = graphState.nodes.filter(n => visibleNodeIds.has(n.id)).map(n => ({
    id: n.id, label: n.label, type: n.type, color: NODE_COLORS[n.type] || "#888",
    val: n.type === "agent" ? 4 : n.type === "quality_gate" ? 3 : 2
  }));
  const nodeIdSet = new Set(nodes.map(n => n.id));
  const links = graphState.edges.filter(e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target)).map(e => ({ source: e.source, target: e.target, label: e.label || "", type: e.type }));

  const Graph = ForceGraph3D()(container)
    .width(container.clientWidth || 800)
    .height(container.clientHeight || 500)
    .graphData({ nodes, links })
    .backgroundColor("rgba(0,0,0,0)")
    .nodeLabel(n => n.label + " [" + n.type + "]")
    .nodeColor(n => n.color)
    .nodeVal(n => n.val)
    .nodeOpacity(0.9)
    .linkColor(l => l.type === "conditional" ? "rgba(180,180,180,0.2)" : "rgba(220,220,220,0.35)")
    .linkWidth(l => l.type === "conditional" ? 0.3 : 0.7)
    .linkDirectionalArrowLength(3.5)
    .linkDirectionalArrowRelPos(1)
    .linkDirectionalArrowColor(() => "rgba(220,220,220,0.5)")
    .linkLabel(l => l.label)
    .onNodeClick(node => {
      const dist = 100, ratio = 1 + dist / Math.hypot(node.x, node.y, node.z);
      Graph.cameraPosition({ x: node.x * ratio, y: node.y * ratio, z: node.z * ratio }, node, 800);
      showNodeInfo(node);
    })
    .onNodeHover(node => { container.style.cursor = node ? "pointer" : "default"; });

  // No custom objects - just use default spheres. Labels show on hover (native tooltip).
  graphState.graph3d = Graph;
  new ResizeObserver(() => { const w = container.clientWidth, h = container.clientHeight; if (w > 0 && h > 0) Graph.width(w).height(h); }).observe(container);
  renderLegend();
}

function renderLegend() {
  let el = document.getElementById("legend-3d");
  if (!el) { el = document.createElement("div"); el.id = "legend-3d"; document.body.appendChild(el); }
  el.innerHTML = [
    { c: "#3b82f6", l: "Agent" }, { c: "#10b981", l: "Quality Gate" }, { c: "#f59e0b", l: "Verify" }, { c: "#ef4444", l: "Security" }, { c: "#8b5cf6", l: "Control" }
  ].map(i => '<div class="legend-item"><span class="legend-dot" style="background:' + i.c + '"></span>' + i.l + '</div>').join("");
}

function showNodeInfo(node) {
  const info = document.getElementById("node-info");
  if (!info) return;
  const up = graphState.edges.filter(e => e.target === node.id).map(e => { const n = graphState.nodes.find(x => x.id === e.source); return n ? n.label : e.source; });
  const down = graphState.edges.filter(e => e.source === node.id).map(e => { const n = graphState.nodes.find(x => x.id === e.target); return (n ? n.label : e.target) + (e.label ? " (" + e.label + ")" : ""); });
  info.innerHTML = "<strong>" + node.label + "</strong> <span class='info-type'>" + node.type + "</span>" +
    (up.length ? "<div class='info-section'><span class='info-dir'>&#x2191;</span> " + up.join(", ") + "</div>" : "") +
    (down.length ? "<div class='info-section'><span class='info-dir'>&#x2193;</span> " + down.join(", ") + "</div>" : "");
  info.classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("refresh-btn")?.addEventListener("click", () => vscode.postMessage({ type: "refresh" }));
});
