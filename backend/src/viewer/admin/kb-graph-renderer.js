/**
 * KBGraphRenderer — Hybrid Three.js renderer for KB Graph visualization.
 * Supports millions of nodes via 3 LOD rendering modes:
 *   FAR  (dist > 800): THREE.Points — all nodes as colored dots (1 draw call)
 *   MID  (dist 300-800): InstancedMesh for nearby + Points for distant
 *   CLOSE (dist < 300): Individual spheres for nearest ~500 nodes + Points for rest
 *
 * Usage:
 *   const renderer = KBGraphRenderer.create(container, options);
 *   renderer.loadPositions(nodes);
 *   renderer.loadEdges(edges);
 *   renderer.destroy();
 */
(function(global) {
  'use strict';

  const COLORS = {
    // Document types
    REQUIREMENT: 0x3b82f6,    // blue
    ARCHITECTURE: 0x10b981,   // emerald
    PROCEDURE: 0xf59e0b,      // amber
    CONTEXT: 0xec4899,        // pink
    CODE_ENTITY: 0xef4444,    // red
    DECISION: 0x06b6d4,       // cyan
    LESSON_LEARNED: 0xf97316, // orange
    ERROR_PATTERN: 0xdc2626,  // dark red
    DOCUMENT: 0xa855f7,       // purple
    // Code entity types
    FUNCTION: 0x818cf8,       // indigo-400
    METHOD: 0x6366f1,         // indigo-500
    CLASS: 0xe879f9,          // fuchsia-400
    INTERFACE: 0xc084fc,      // purple-400
    TYPE: 0xfb7185,           // rose-400
    CONSTRUCTOR: 0xf472b6,    // pink-400
    ENUM: 0x34d399,           // emerald-400
    CONSTANT: 0xfbbf24,       // amber-400
    VARIABLE: 0x94a3b8,       // slate-400
  };

  const NODE_SIZES = {
    // Document types (larger = more important)
    ARCHITECTURE: 6, DECISION: 5, REQUIREMENT: 4, PROCEDURE: 3,
    CONTEXT: 3, CODE_ENTITY: 3, LESSON_LEARNED: 2.5, ERROR_PATTERN: 2.5, DOCUMENT: 2.5,
    // Code entity types
    CLASS: 4, INTERFACE: 3.5,
    FUNCTION: 2, METHOD: 2, TYPE: 2, CONSTRUCTOR: 2.5, ENUM: 3, CONSTANT: 1.5, VARIABLE: 1.5,
  };

  const FAR_THRESHOLD = 800;
  const MID_THRESHOLD = 300;
  const INSTANCED_RADIUS = 400;
  const CLOSE_NODE_COUNT = 500;

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
      this.closeGroup = null;
      this.edgeLines = null;
      this.closeMeshes = [];
      this.currentMode = 'FAR';
      this.selectedNodeId = null;
      this.hoveredNodeId = null;
      this.labelContainer = null;
      this.activeLabels = [];
      this.minimapCanvas = options ? options.minimapCanvas : null;
    }

    init() {
      var self = this;
      var THREE = this._getThree();
      this.THREE = THREE;
      var w = this.container.clientWidth || 800;
      var h = this.container.clientHeight || 600;

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x0f172a);

      this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100000);
      this.camera.position.set(0, 0, 3500);

      this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
      this.renderer.setSize(w, h);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.container.appendChild(this.renderer.domElement);

      var self = this;
      this.controls = new MapControls(this.camera, this.renderer.domElement, {
        minDistance: 1,
        maxDistance: 50000,
        friction: 0.92,
        zoomSpeed: 1.2,
        panSpeed: 2.0,
        onZoomEnd: function() { self._updateMode(false); },
        onNodeDragStart: function(nodeId) { self._startNodeDrag(nodeId); },
        onNodeDragMove: function(x, y) { self._moveNodeDrag(x, y); },
        onNodeDragEnd: function() { self._endNodeDrag(); },
        onDoubleTap: function(x, y) { self._handleDoubleTap(x, y); },
        onTap: function(x, y) { self._handleTap(x, y); },
        raycastNode: function(sx, sy) { return self._raycastAtScreen(sx, sy); },
        getCurrentMode: function() { return self.currentMode; }
      });
      this._clock = new THREE.Clock();

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
      this._buildPointsGeometry(); this._updateMode(true);
    }

    loadEdges(edges) { this.edges = edges; this._buildEdgeGeometry(); }

    zoomToFit() {
      if (!this.nodes.length || !this.camera) return;
      var cx = 0, cy = 0, n = this.nodes.length;
      for (var i = 0; i < n; i++) { cx += this.nodes[i].x; cy += this.nodes[i].y; }
      cx /= n; cy /= n;
      var maxR = 0;
      for (var i = 0; i < n; i++) {
        var dx = this.nodes[i].x - cx, dy = this.nodes[i].y - cy;
        maxR = Math.max(maxR, Math.sqrt(dx * dx + dy * dy));
      }
      var dist = maxR / Math.tan((this.camera.fov / 2) * Math.PI / 180) * 1.2;
      this.controls.panTo(cx, cy, 600);
      this.controls.zoomTo(dist, 600);
    }

    focusNode(id) {
      var idx = this.nodeMap.get(id);
      if (idx === undefined) return;
      var node = this.nodes[idx];
      this.controls.panTo(node.x, node.y, 600);
      this.controls.zoomTo(200, 600);
      this.selectedNodeId = id; this._dispatchNodeClick(node);
    }

    destroy() {
      this._destroyed = true;
      if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
      window.removeEventListener('resize', this._onResize);
      if (this.renderer) {
        this.renderer.domElement.removeEventListener('mousemove', this._onMouseMove);
        this.renderer.dispose();
        if (this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
      if (this.labelContainer && this.labelContainer.parentNode) this.labelContainer.parentNode.removeChild(this.labelContainer);
      if (this.controls && this.controls.dispose) this.controls.dispose();
      this._disposeSceneObjects();
      this.scene = null; this.camera = null; this.renderer = null;
    }

    // ===== Internal: Geometry =====

    _buildPointsGeometry() {
      var THREE = this.THREE;
      var n = this.nodes.length;
      if (this.pointsObject) {
        this.scene.remove(this.pointsObject);
        this.pointsObject.geometry.dispose();
        this.pointsObject.material.dispose();
      }
      var positions = new Float32Array(n * 3);
      var colors = new Float32Array(n * 3);
      var tmpColor = new THREE.Color();
      for (var i = 0; i < n; i++) {
        var node = this.nodes[i];
        positions[i * 3] = node.x;
        positions[i * 3 + 1] = node.y;
        positions[i * 3 + 2] = node.z;
        tmpColor.setHex(COLORS[node.type] || 0x64748b);
        colors[i * 3] = tmpColor.r;
        colors[i * 3 + 1] = tmpColor.g;
        colors[i * 3 + 2] = tmpColor.b;
      }
      var geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      // Create glowing circle texture for better-looking nodes
      var canvas2d = document.createElement('canvas');
      canvas2d.width = 64; canvas2d.height = 64;
      var ctx2d = canvas2d.getContext('2d');
      var gradient = ctx2d.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.3, 'rgba(255,255,255,0.8)');
      gradient.addColorStop(0.7, 'rgba(255,255,255,0.3)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx2d.fillStyle = gradient;
      ctx2d.fillRect(0, 0, 64, 64);
      var spriteTexture = new THREE.CanvasTexture(canvas2d);
      var material = new THREE.PointsMaterial({
        size: 10, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.95,
        map: spriteTexture, alphaMap: spriteTexture, depthWrite: false
      });
      this.pointsObject = new THREE.Points(geometry, material);
      this.pointsObject.renderOrder = 1;
      this.scene.add(this.pointsObject);
    }

    _buildEdgeGeometry() {
      var THREE = this.THREE;
      if (this.edgeLines) {
        this.scene.remove(this.edgeLines);
        this.edgeLines.geometry.dispose();
        this.edgeLines.material.dispose();
        this.edgeLines = null;
      }
      if (!this.edges.length) return;
      var validEdges = [];
      for (var i = 0; i < this.edges.length; i++) {
        var e = this.edges[i];
        var si = this.nodeMap.get(e.source);
        var ti = this.nodeMap.get(e.target);
        if (si !== undefined && ti !== undefined) validEdges.push({ si: si, ti: ti });
      }
      if (!validEdges.length) return;
      var positions = new Float32Array(validEdges.length * 6);
      for (var i = 0; i < validEdges.length; i++) {
        var sn = this.nodes[validEdges[i].si];
        var tn = this.nodes[validEdges[i].ti];
        positions[i * 6] = sn.x; positions[i * 6 + 1] = sn.y; positions[i * 6 + 2] = sn.z;
        positions[i * 6 + 3] = tn.x; positions[i * 6 + 4] = tn.y; positions[i * 6 + 5] = tn.z;
      }
      var geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      var material = new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.25, linewidth: 1 });
      this.edgeLines = new THREE.LineSegments(geometry, material);
      this.edgeLines.visible = false;
      this.edgeLines.renderOrder = -1;
      this.scene.add(this.edgeLines);
    }

    // ===== LOD Mode Switching =====

    _getCameraDistance() {
      if (!this.camera || !this.controls) return 1000;
      return this.camera.position.z;
    }

    _updateMode(force) {
      var dist = this._getCameraDistance();
      var newMode;
      if (dist > FAR_THRESHOLD) newMode = 'FAR';
      else if (dist > MID_THRESHOLD) newMode = 'MID';
      else newMode = 'CLOSE';
      if (newMode === this.currentMode && !force) return;
      this.currentMode = newMode;
      this._cleanupModeObjects();
      if (newMode === 'FAR') this._setupFarMode();
      else if (newMode === 'MID') this._setupMidMode();
      else this._setupCloseMode();
    }

    _cleanupModeObjects() {
      if (this.instancedMesh) {
        this.scene.remove(this.instancedMesh);
        this.instancedMesh.geometry.dispose();
        this.instancedMesh.material.dispose();
        this.instancedMesh = null;
      }
      if (this.closeGroup) {
        this.scene.remove(this.closeGroup);
        this.closeGroup.traverse(function(obj) {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) obj.material.dispose();
        });
        this.closeGroup = null;
        this.closeMeshes = [];
      }
      this._clearLabels();
      if (this.pointsObject) this.pointsObject.visible = true;
      // Edges visibility controlled per-mode (FAR=hidden, MID/CLOSE=visible)
    }

    _setupFarMode() {
      if (this.pointsObject) {
        this.pointsObject.material.size = 10;
        this.pointsObject.material.opacity = 0.95;
        this.pointsObject.visible = true;
      }
      // Hide edges at far distance — they create wireframe sphere that hides nodes
      if (this.edgeLines) this.edgeLines.visible = false;
    }

    _setupMidMode() {
      var THREE = this.THREE;
      if (!this.nodes.length) return;
      var target = this.controls.target;
      var nearby = [];
      var maxInstanced = 2000;
      for (var i = 0; i < this.nodes.length; i++) {
        var node = this.nodes[i];
        var dx = node.x - target.x, dy = node.y - target.y, dz = node.z - target.z;
        var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < INSTANCED_RADIUS) nearby.push({ idx: i, dist: d });
      }
      nearby.sort(function(a, b) { return a.dist - b.dist; });
      var selected = nearby.slice(0, maxInstanced);
      if (!selected.length) return;

      var sphereGeo = new THREE.SphereGeometry(1, 8, 6);
      var mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      this.instancedMesh = new THREE.InstancedMesh(sphereGeo, mat, selected.length);
      this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

      var dummy = new THREE.Object3D();
      var colorArr = new Float32Array(selected.length * 3);
      var tmpColor = new THREE.Color();
      for (var i = 0; i < selected.length; i++) {
        var node = this.nodes[selected[i].idx];
        var size = (NODE_SIZES[node.type] || 3) * 1.5;
        dummy.position.set(node.x, node.y, node.z);
        dummy.scale.set(size, size, size);
        dummy.updateMatrix();
        this.instancedMesh.setMatrixAt(i, dummy.matrix);
        tmpColor.setHex(COLORS[node.type] || 0x64748b);
        colorArr[i * 3] = tmpColor.r; colorArr[i * 3 + 1] = tmpColor.g; colorArr[i * 3 + 2] = tmpColor.b;
      }
      this.instancedMesh.instanceMatrix.needsUpdate = true;
      this.instancedMesh.geometry.setAttribute('color', new THREE.InstancedBufferAttribute(colorArr, 3));
      this.instancedMesh.userData.nodeIndices = selected.map(function(s) { return s.idx; });
      this.scene.add(this.instancedMesh);

      if (this.pointsObject) { this.pointsObject.material.size = 2.5; this.pointsObject.material.opacity = 0.5; }
      if (this.edgeLines) this.edgeLines.visible = true;
    }

    _setupCloseMode() {
      var THREE = this.THREE;
      if (!this.nodes.length) return;
      var target = this.controls.target;
      var scored = [];
      for (var i = 0; i < this.nodes.length; i++) {
        var node = this.nodes[i];
        var dx = node.x - target.x, dy = node.y - target.y, dz = node.z - target.z;
        scored.push({ idx: i, dist: Math.sqrt(dx * dx + dy * dy + dz * dz) });
      }
      scored.sort(function(a, b) { return a.dist - b.dist; });
      var selected = scored.slice(0, CLOSE_NODE_COUNT);
      this.closeGroup = new THREE.Group();
      this.closeMeshes = [];
      var sphereGeo = new THREE.SphereGeometry(1, 16, 12);
      for (var i = 0; i < selected.length; i++) {
        var node = this.nodes[selected[i].idx];
        var hex = COLORS[node.type] || 0x64748b;
        var material = new THREE.MeshPhongMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.2 });
        var mesh = new THREE.Mesh(sphereGeo, material);
        var size = (NODE_SIZES[node.type] || 3) * 2;
        mesh.position.set(node.x, node.y, node.z);
        mesh.scale.set(size, size, size);
        mesh.userData.nodeIdx = selected[i].idx;
        mesh.userData.nodeId = node.id;
        this.closeGroup.add(mesh);
        this.closeMeshes.push(mesh);
      }
      this.scene.add(this.closeGroup);
      if (this.edgeLines) this.edgeLines.visible = true;
      if (this.pointsObject) { this.pointsObject.material.size = 2; this.pointsObject.material.opacity = 0.35; }
      this._showLabels(selected.slice(0, 20).map(function(s) { return s.idx; }));
    }

    // ===== Labels =====

    _clearLabels() {
      if (this.labelContainer) this.labelContainer.innerHTML = '';
      this.activeLabels = [];
    }

    _showLabels(indices) {
      this._clearLabels();
      for (var i = 0; i < indices.length; i++) {
        var node = this.nodes[indices[i]];
        var label = document.createElement('div');
        label.style.cssText = 'position:absolute;color:#e2e8f0;font-size:10px;font-family:sans-serif;white-space:nowrap;background:rgba(30,41,59,0.8);padding:1px 4px;border-radius:3px;pointer-events:none;';
        label.textContent = node.label || node.id;
        this.labelContainer.appendChild(label);
        this.activeLabels.push({ el: label, idx: indices[i] });
      }
    }

    _updateLabels() {
      if (!this.activeLabels.length || !this.camera || !this.renderer) return;
      var THREE = this.THREE;
      var w = this.renderer.domElement.clientWidth;
      var h = this.renderer.domElement.clientHeight;
      var vec = new THREE.Vector3();
      for (var i = 0; i < this.activeLabels.length; i++) {
        var item = this.activeLabels[i];
        var node = this.nodes[item.idx];
        vec.set(node.x, node.y, node.z);
        vec.project(this.camera);
        var x = (vec.x * 0.5 + 0.5) * w;
        var y = (-vec.y * 0.5 + 0.5) * h;
        if (vec.z > 1) { item.el.style.display = 'none'; }
        else { item.el.style.display = ''; item.el.style.left = x + 'px'; item.el.style.top = y + 'px'; }
      }
    }

    // ===== Raycasting =====

    _handleMouseMove(event) {
      var node = this._raycastNode(event);
      this.renderer.domElement.style.cursor = node ? 'pointer' : 'default';
      this.hoveredNodeId = node ? node.id : null;
    }

    _raycastNode(event) {
      var rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      if (this.closeMeshes.length > 0) {
        var intersects = this.raycaster.intersectObjects(this.closeMeshes);
        if (intersects.length > 0) return this.nodes[intersects[0].object.userData.nodeIdx];
      }
      if (this.instancedMesh) {
        var intersects = this.raycaster.intersectObject(this.instancedMesh);
        if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
          var idx = this.instancedMesh.userData.nodeIndices[intersects[0].instanceId];
          return this.nodes[idx];
        }
      }
      // Click on Points (dots) — find nearest node to click position
      if (this.pointsObject) {
        var intersects = this.raycaster.intersectObject(this.pointsObject);
        if (intersects.length > 0) {
          return this.nodes[intersects[0].index];
        }
      }
      return null;
    }

    _handleTap(screenX, screenY) {
      var node = this._raycastNodeAtScreen(screenX, screenY);
      if (node) { this.selectedNodeId = node.id; this._dispatchNodeClick(node); }
    }

    _handleDoubleTap(screenX, screenY) {
      var worldPos = this._screenToWorldXY(screenX, screenY);
      // Zoom in toward the double-tapped position
      var targetZ = this.camera.position.z * 0.5;
      if (targetZ < 1) targetZ = 1;
      this.controls.panTo(worldPos.x, worldPos.y, 600);
      this.controls.zoomTo(targetZ, 600);
    }

    _startNodeDrag(nodeId) {
      this._draggingNodeId = nodeId;
      this._draggingNodeIdx = this.nodeMap.get(nodeId);
    }

    _moveNodeDrag(screenX, screenY) {
      if (this._draggingNodeIdx === undefined) return;
      var worldPos = this._screenToWorldXY(screenX, screenY);
      var node = this.nodes[this._draggingNodeIdx];
      node.x = worldPos.x; node.y = worldPos.y;
      // Update close mode mesh position if exists
      if (this.closeMeshes) {
        for (var i = 0; i < this.closeMeshes.length; i++) {
          if (this.closeMeshes[i].userData.nodeIdx === this._draggingNodeIdx) {
            this.closeMeshes[i].position.set(node.x, node.y, node.z);
            break;
          }
        }
      }
    }

    _endNodeDrag() {
      this._draggingNodeId = null;
      this._draggingNodeIdx = undefined;
      this._buildEdgeGeometry();
    }

    _raycastAtScreen(screenX, screenY) {
      var node = this._raycastNodeAtScreen(screenX, screenY);
      return node ? node.id : null;
    }

    _raycastNodeAtScreen(screenX, screenY) {
      var rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((screenX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((screenY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      if (this.closeMeshes.length > 0) {
        var hits = this.raycaster.intersectObjects(this.closeMeshes);
        if (hits.length > 0) return this.nodes[hits[0].object.userData.nodeIdx];
      }
      if (this.pointsObject) {
        var hits = this.raycaster.intersectObject(this.pointsObject);
        if (hits.length > 0) return this.nodes[hits[0].index];
      }
      return null;
    }

    _screenToWorldXY(screenX, screenY) {
      var rect = this.renderer.domElement.getBoundingClientRect();
      var ndcX = ((screenX - rect.left) / rect.width) * 2 - 1;
      var ndcY = -((screenY - rect.top) / rect.height) * 2 + 1;
      var fovRad = (this.camera.fov * Math.PI) / 180;
      var halfH = Math.tan(fovRad / 2) * this.camera.position.z;
      var halfW = halfH * this.camera.aspect;
      var target = this.controls.target;
      return { x: target.x + ndcX * halfW, y: target.y + ndcY * halfH };
    }

    _dispatchNodeClick(node) {
      this.container.dispatchEvent(new CustomEvent('graph-node-click', { detail: node, bubbles: true }));
    }

    // ===== Resize & Render Loop =====

    _handleResize() {
      if (this._destroyed) return;
      var w = this.container.clientWidth;
      var h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    }

    _animate() {
      if (this._destroyed) return;
      var self = this;
      this.animFrameId = requestAnimationFrame(function() { self._animate(); });
      var dt = this._clock ? this._clock.getDelta() : 0.016;
      this.controls.update(dt);
      // LOD mode check triggered by MapControls.onZoomEnd callback (event-driven)
      if (this.currentMode === 'CLOSE') this._updateLabels();
      this.renderer.render(this.scene, this.camera);
      this._renderMinimap();
    }

    _renderMinimap() {
      if (!this.minimapCanvas || !this.renderer) return;
      var ctx = this.minimapCanvas.getContext('2d');
      var cw = this.minimapCanvas.width, ch = this.minimapCanvas.height;
      var src = this.renderer.domElement;
      ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, cw, ch);
    }

    _disposeSceneObjects() {
      if (!this.scene) return;
      this.scene.traverse(function(obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(function(m) { m.dispose(); });
          else obj.material.dispose();
        }
      });
    }
  }

  // ===== Factory =====
  global.KBGraphRenderer = {
    create: function(container, options) {
      var instance = new KBGraphRendererImpl(container, options);
      return instance.init().then(function() { return instance; });
    }
  };

})(typeof window !== 'undefined' ? window : this);
