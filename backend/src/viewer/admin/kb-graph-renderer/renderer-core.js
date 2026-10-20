/**
 * KBGraphRenderer — module 2/7: class skeleton, lifecycle and public API.
 * Load order: after renderer-palette.js (needs window.__kbGraphRendererNS).
 * The remaining methods (_buildPointsGeometry, _updateDetailLOD, _animate,
 * pointer input, minimap, destroy/teardown) are attached to the prototype by
 * the other kb-graph-renderer/ modules at load time and resolved via `this`
 * at runtime, before any instance is created.
 */
(function(global) {
  'use strict';

  var NS = global.__kbGraphRendererNS;

  class KBGraphRendererImpl {
    constructor(container, options) {
      this.container = container;
      this.options = options || {};
      this.nodes = [];
      this.edges = [];
      this.nodeMap = new Map();
      this._destroyed = false;
      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.controls = null;
      this.animFrameId = null;
      this.pointsObject = null;
      this.instancedMesh = null;
      this.edgeLines = null;
      this.selectedNodeId = null;
      this.hoveredNodeId = null;
      this.labelContainer = null;
      this.activeLabels = [];
      this.minimapCanvas = options ? options.minimapCanvas : null;
      this.minimapSpanMode = false;
      this.minimapBBox = null;
      this.minimapDrag = null;
      // LOD budget-driven options
      this.detailBudget = this.options.detailBudget != null ? this.options.detailBudget : NS.DETAIL_BUDGET_DEFAULT;
      this.labelBudget = this.options.labelBudget != null ? this.options.labelBudget : NS.LABEL_BUDGET_DEFAULT;
      this.sphereMinPx = this.options.sphereMinPx != null ? this.options.sphereMinPx : NS.SPHERE_MIN_PX_DEFAULT;
      this.sphereMaxPx = this.options.sphereMaxPx != null ? this.options.sphereMaxPx : NS.SPHERE_MAX_PX_DEFAULT;
      this.labelMinPx = this.options.labelMinPx != null ? this.options.labelMinPx : NS.LABEL_MIN_PX_DEFAULT;
      this.refreshMs = this.options.refreshMs != null ? this.options.refreshMs : NS.REFRESH_MS_DEFAULT;
      this._lodAccum = 0;
      this._detailIndices = [];
      this._meshCapacity = 0;
    }

    init() {
      var self = this;
      var THREE = this._getThree();
      this.THREE = THREE;
      var w = this.container.clientWidth || 800;
      var h = this.container.clientHeight || 600;

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x334155);

      this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100000);
      this.camera.position.set(0, 0, 3500);

      this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
      this.renderer.setSize(w, h);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.container.appendChild(this.renderer.domElement);

      // SA4E-31: full 3D OrbitControls (left=orbit 360°, right=pan, wheel=zoom).
      if (!THREE.OrbitControls) throw new Error('THREE.OrbitControls not loaded');
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.12;
      this.controls.rotateSpeed = 0.9;
      this.controls.zoomSpeed = 1.2;
      this.controls.panSpeed = 0.9;
      this.controls.screenSpacePanning = true;
      this.controls.minDistance = 1;
      this.controls.maxDistance = 50000;
      this.controls.target.set(0, 0, 0);
      this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
      this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
      this.controls.addEventListener('end', function() { self._updateDetailLOD(true); });
      // Prevent page scroll from hijacking wheel zoom on the canvas
      this.renderer.domElement.addEventListener('wheel', function(e) { e.preventDefault(); }, { passive: false });
      // Minimap: unified canvas interactions (drag=pan, wheel=zoom, right-drag=rotate, dblclick=span)
      if (this.minimapCanvas) this._setupMinimapInput();
      this._clock = new THREE.Clock();

      // Custom input: node selection (click), focus (dblclick), node drag.
      this._setupPointerInput();

      this.labelContainer = document.createElement('div');
      this.labelContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;';
      this.container.style.position = 'relative';
      this.container.appendChild(this.labelContainer);

      this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
      var dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
      dirLight.position.set(500, 500, 500);
      this.scene.add(dirLight);

      this.raycaster = new THREE.Raycaster();
      this.raycaster.params.Points.threshold = 8;
      this.mouse = new THREE.Vector2();

      this._onResize = this._handleResize.bind(this);
      this._onMouseMove = this._handleMouseMove.bind(this);
      window.addEventListener('resize', this._onResize);
      this.renderer.domElement.addEventListener('mousemove', this._onMouseMove);

      this._animate();
      return Promise.resolve();
    }

    _getThree() {
      if (typeof window.THREE !== 'undefined') return window.THREE;
      throw new Error('THREE.js not found');
    }

    // ===== Public API =====

    loadPositions(nodes) {
      this.nodes = nodes; this.nodeMap.clear();
      for (var i = 0; i < nodes.length; i++) { this.nodeMap.set(nodes[i].id, i); }
      this._computeMinimapBBox();
      this._buildPointsGeometry(); this._updateDetailLOD(true);
    }

    loadEdges(edges) { this.edges = edges; this._buildEdgeGeometry(); }

    zoomToFit() {
      if (!this.nodes.length || !this.camera) return;
      // SA4E-31: 3D fit — center OrbitControls target on the cluster centroid and
      // dolly the camera along its current orbit direction to frame the 3D bounds.
      var THREE = this.THREE;
      var cx = 0, cy = 0, cz = 0, n = this.nodes.length;
      for (var i = 0; i < n; i++) { cx += this.nodes[i].x; cy += this.nodes[i].y; cz += (this.nodes[i].z || 0); }
      cx /= n; cy /= n; cz /= n;
      var maxR = 0;
      for (var i = 0; i < n; i++) {
        var dx = this.nodes[i].x - cx, dy = this.nodes[i].y - cy, dz = (this.nodes[i].z || 0) - cz;
        maxR = Math.max(maxR, Math.sqrt(dx * dx + dy * dy + dz * dz));
      }
      if (maxR < 1) maxR = 200;
      var dist = maxR / Math.tan((this.camera.fov / 2) * Math.PI / 180) * 1.3;
      var center = new THREE.Vector3(cx, cy, cz);
      var dir = this.camera.position.clone().sub(this.controls.target);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize();
      this.controls.target.copy(center);
      this.camera.position.copy(center.clone().add(dir.multiplyScalar(dist)));
      this.camera.updateProjectionMatrix();
      this.controls.update();
      this._updateDetailLOD(true);
    }

    focusNode(id) {
      var idx = this.nodeMap.get(id);
      if (idx === undefined) return;
      var THREE = this.THREE;
      var node = this.nodes[idx];
      // Move the orbit target ONTO the node so subsequent wheel-zoom dollies into it,
      // then place the camera a short distance away along the current view direction.
      var center = new THREE.Vector3(node.x, node.y, node.z || 0);
      var dir = this.camera.position.clone().sub(this.controls.target);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize();
      this.controls.target.copy(center);
      this.camera.position.copy(center.clone().add(dir.multiplyScalar(200)));
      this.controls.update();
      this._updateDetailLOD(true);
      this.selectedNodeId = id; this._dispatchNodeClick(node);
    }
  }

  NS.KBGraphRendererImpl = KBGraphRendererImpl;
})(typeof window !== 'undefined' ? window : this);
