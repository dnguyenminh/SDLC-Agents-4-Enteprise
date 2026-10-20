/**
 * KBGraphRenderer — module 4/7: budget-driven detail LOD layer.
 * Load order: after renderer-core.js (attaches methods to the shared class
 * prototype exposed as window.__kbGraphRendererNS.KBGraphRendererImpl).
 */
(function(global) {
  'use strict';

  var NS = global.__kbGraphRendererNS;
  var KBGraphRendererImpl = NS.KBGraphRendererImpl;
  var NODE_SIZES = NS.NODE_SIZES;
  var colorForType = NS.colorForType;

  Object.assign(KBGraphRendererImpl.prototype, {

    // ===== LOD Detail Layer (budget-driven continuous) =====

    _updateDetailLOD(force) {
      if (this._destroyed || !this.nodes.length || !this.camera || !this.controls) return;
      this._refreshDetailLayer();
      this._updateLabelsForDetail();
      this._updatePointsOpacity();
      if (this.edgeLines) {
        this.edgeLines.visible = !!(this._detailIndices && this._detailIndices.length > 0);
      }
    },

    _createDetailInstancedMesh(budget) {
      var THREE = this.THREE;
      if (this.instancedMesh) {
        this.scene.remove(this.instancedMesh);
        this.instancedMesh.geometry.dispose();
        this.instancedMesh.material.dispose();
      }
      var sphereGeo = new THREE.SphereGeometry(1, 12, 10);
      // Per-instance color comes from InstancedMesh.instanceColor (set via setColorAt),
      // NOT vertexColors — SphereGeometry has no per-vertex `color` attribute, so
      // vertexColors:true would render every instance black. Base color is white so
      // Three multiplies it by the per-instance color. Slight emissive keeps nodes
      // visible even when a light does not face them.
      var mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x000000 });
      this.instancedMesh = new THREE.InstancedMesh(sphereGeo, mat, budget);
      this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Pre-allocate the per-instance color buffer so instanceColor exists before render.
      var colorArr = new Float32Array(budget * 3);
      for (var ci = 0; ci < colorArr.length; ci++) { colorArr[ci] = 1; }
      this.instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(colorArr, 3);
      this.instancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.instancedMesh.count = 0;
      this.instancedMesh.userData.nodeIndices = [];
      this.scene.add(this.instancedMesh);
    },

    _refreshDetailLayer() {
      var THREE = this.THREE;
      if (!this.nodes.length) { this._clearDetailMesh(); return; }
      var target = this.controls.target;
      var nodes = this.nodes;
      var n = nodes.length;
      var budget = this.detailBudget;
      var candidates = new Array(n);
      for (var i = 0; i < n; i++) {
        var node = nodes[i];
        var dx = node.x - target.x, dy = node.y - target.y, dz = (node.z || 0) - target.z;
        var d2 = dx * dx + dy * dy + dz * dz;
        candidates[i] = { idx: i, d2: d2 };
      }
      candidates.sort(function(a, b) { return a.d2 - b.d2; });
      var count = Math.min(budget, n);
      var selected = candidates.slice(0, count);
      this._detailIndices = selected.map(function(s) { return s.idx; });

      if (!this.instancedMesh || this._meshCapacity !== budget) {
        this._createDetailInstancedMesh(budget);
        this._meshCapacity = budget;
      }
      var mesh = this.instancedMesh;
      var dummy = new THREE.Object3D();
      // projection factor for pixel size
      var size = new THREE.Vector2();
      this.renderer.getSize(size);
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var vpHeightPx = size.y * dpr;
      var fovRad = this.camera.fov * Math.PI / 180;
      var tanHalf = Math.tan(fovRad / 2);
      // WORLD_SCALE turns a type's base size (1.5..6) into a fixed world radius, so
      // spheres grow/shrink naturally as the camera zooms (real-object behaviour).
      var WORLD_SCALE = 4.0;
      var tmpColor = new THREE.Color();
      var camPos = this.camera.position;
      for (var i = 0; i < count; i++) {
        var nodeIdx = this._detailIndices[i];
        var node = nodes[nodeIdx];
        var baseSize = NODE_SIZES[node.type] || 2.5;
        // Fixed world radius for this node — scales with zoom like a real object.
        var worldSize = baseSize * WORLD_SCALE;
        // Distance camera -> node, used only to enforce the pixel floor/cap.
        var dxc = node.x - camPos.x, dyc = node.y - camPos.y, dzc = (node.z || 0) - camPos.z;
        var distCam = Math.sqrt(dxc * dxc + dyc * dyc + dzc * dzc);
        if (distCam < 1) distCam = 1;
        // Projected on-screen diameter (px) of the fixed world size at this distance.
        // Viewport full height spans (2 * dist * tan(fov/2)) world units, so
        // pixels = worldDiameter * vpHeightPx / (2 * dist * tan(fov/2)).
        var denom = 2 * distCam * tanHalf;
        var projPx = worldSize * vpHeightPx / denom;
        // Floor: never smaller than sphereMinPx (stays visible when zoomed far out).
        // Cap: never larger than sphereMaxPx (avoids a giant blob when zoomed in close).
        if (projPx < this.sphereMinPx) {
          worldSize = this.sphereMinPx * denom / vpHeightPx;
        } else if (projPx > this.sphereMaxPx) {
          worldSize = this.sphereMaxPx * denom / vpHeightPx;
        }
        if (worldSize < 0.01) worldSize = 0.01;
        dummy.position.set(node.x, node.y, node.z || 0);
        dummy.scale.set(worldSize, worldSize, worldSize);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        tmpColor.setHex(colorForType(node.type));
        if (mesh.setColorAt) { mesh.setColorAt(i, tmpColor); }
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.userData.nodeIndices = this._detailIndices.slice();
    },

    _clearDetailMesh() {
      if (this.instancedMesh) {
        this.instancedMesh.count = 0;
        this.instancedMesh.instanceMatrix.needsUpdate = true;
        this._detailIndices = [];
      }
    },

    _updatePointsOpacity() {
      if (!this.pointsObject || !this.pointsObject.material.uniforms) return;
      var visible = this._detailIndices ? this._detailIndices.length : 0;
      var budget = this.detailBudget || 1;
      var ratio = Math.min(1, visible / budget);
      // opacity 0.95 -> 0.35
      var opacity = 0.95 - 0.6 * ratio;
      if (opacity < 0.35) opacity = 0.35;
      this.pointsObject.material.uniforms.uOpacity.value = opacity;
    },

    _updateLabelsForDetail() {
      var indices = [];
      if (!this._detailIndices || !this._detailIndices.length) { this._clearLabels(); return; }
      var nodes = this.nodes;
      var minBase = 1.5, maxBase = 6;
      var pxRange = this.sphereMaxPx - this.sphereMinPx;
      // compute targetPx for first labelBudget candidates
      var limit = Math.min(this.labelBudget, this._detailIndices.length);
      for (var i = 0; i < limit; i++) {
        var nodeIdx = this._detailIndices[i];
        var node = nodes[nodeIdx];
        var baseSize = NODE_SIZES[node.type] || 2.5;
        var t = (baseSize - minBase) / (maxBase - minBase);
        if (t < 0) t = 0; if (t > 1) t = 1;
        var targetPx = this.sphereMinPx + t * pxRange;
        if (targetPx >= this.labelMinPx) indices.push(nodeIdx);
      }
      this._showLabels(indices);
    }
  });
})(typeof window !== 'undefined' ? window : this);
