/**
 * KBGraphRenderer — module 6/7: pointer input (click/dblclick/wheel) & raycasting.
 * OrbitControls owns orbit/pan/zoom; this module adds discrete click semantics.
 * Load order: after renderer-core.js (attaches methods to the shared class
 * prototype exposed as window.__kbGraphRendererNS.KBGraphRendererImpl).
 */
(function(global) {
  'use strict';

  var NS = global.__kbGraphRendererNS;
  var KBGraphRendererImpl = NS.KBGraphRendererImpl;

  Object.assign(KBGraphRendererImpl.prototype, {

    // ===== Raycasting =====

    _handleMouseMove(event) {
      var node = this._raycastNode(event);
      this.renderer.domElement.style.cursor = node ? 'pointer' : 'default';
      this.hoveredNodeId = node ? node.id : null;
    },

    _raycastNode(event) {
      var rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
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
    },

    // ===== Pointer input (click = select, dblclick = focus) =====

    _setupPointerInput() {
      var self = this;
      var el = this.renderer.domElement;
      this._pd = null;
      this._onPointerDown = function(e) {
        self._pd = { x: e.clientX, y: e.clientY, t: Date.now() };
      };
      this._onPointerUp = function(e) {
        if (!self._pd) return;
        var dx = e.clientX - self._pd.x, dy = e.clientY - self._pd.y;
        var moved = Math.sqrt(dx * dx + dy * dy);
        var dur = Date.now() - self._pd.t;
        self._pd = null;
        // Treat as a click only if the pointer barely moved (not an orbit/pan drag).
        if (moved <= 5 && dur < 400 && e.button === 0) {
          var node = self._raycastNodeAtScreen(e.clientX, e.clientY);
          if (node) { self.selectedNodeId = node.id; self._dispatchNodeClick(node); }
        }
      };
      this._onDblClick = function(e) {
        var node = self._raycastNodeAtScreen(e.clientX, e.clientY);
        if (node) self.focusNode(node.id);
      };
      // Wheel-zoom homing: OrbitControls dollies toward `target`, which starts at the
      // sphere center (empty). Without moving the target, zooming just approaches the
      // hollow middle and stops at minDistance — far clusters on the shell are never
      // reached. On each wheel-in, ease the target toward the node under the cursor
      // (or nearest to the cursor ray) so zoom naturally homes into the pointed cluster.
      this._onWheelHoming = function(e) {
        if (e.deltaY >= 0) return; // only when zooming IN
        var node = self._nodeUnderCursorOrRay(e.clientX, e.clientY);
        if (!node) return;
        // Ease target a fraction toward the node; OrbitControls.update() then dollies in.
        var tgt = self.controls.target;
        tgt.x += ((node.x) - tgt.x) * 0.25;
        tgt.y += ((node.y) - tgt.y) * 0.25;
        tgt.z += ((node.z || 0) - tgt.z) * 0.25;
      };
      el.addEventListener('pointerdown', this._onPointerDown);
      el.addEventListener('pointerup', this._onPointerUp);
      el.addEventListener('dblclick', this._onDblClick);
      // Capture phase so we adjust target BEFORE OrbitControls' own wheel dolly runs.
      el.addEventListener('wheel', this._onWheelHoming, { capture: true, passive: true });
    },

    _removePointerInput() {
      if (!this.renderer) return;
      var el = this.renderer.domElement;
      if (this._onPointerDown) el.removeEventListener('pointerdown', this._onPointerDown);
      if (this._onPointerUp) el.removeEventListener('pointerup', this._onPointerUp);
      if (this._onDblClick) el.removeEventListener('dblclick', this._onDblClick);
      if (this._onWheelHoming) el.removeEventListener('wheel', this._onWheelHoming, { capture: true });
    },

    /**
     * Find the node under the cursor (direct hit) or, failing that, the node whose
     * center is closest to the cursor pick ray. Lets zoom home into a cluster even
     * when nodes render as tiny points far away.
     */
    _nodeUnderCursorOrRay(screenX, screenY) {
      var direct = this._raycastNodeAtScreen(screenX, screenY);
      if (direct) return direct;
      var rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((screenX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((screenY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      var ray = this.raycaster.ray;
      var best = null, bestD2 = Infinity;
      var THREE = this.THREE;
      var p = new THREE.Vector3(), closest = new THREE.Vector3();
      for (var i = 0; i < this.nodes.length; i++) {
        var nd = this.nodes[i];
        p.set(nd.x, nd.y, nd.z || 0);
        ray.closestPointToPoint(p, closest);
        var d2 = closest.distanceToSquared(p);
        if (d2 < bestD2) { bestD2 = d2; best = nd; }
      }
      return best;
    },

    _raycastNodeAtScreen(screenX, screenY) {
      var rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((screenX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((screenY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      if (this.instancedMesh) {
        var hits = this.raycaster.intersectObject(this.instancedMesh);
        if (hits.length > 0 && hits[0].instanceId !== undefined) {
          var idx = this.instancedMesh.userData.nodeIndices[hits[0].instanceId];
          return this.nodes[idx];
        }
      }
      if (this.pointsObject) {
        var hits = this.raycaster.intersectObject(this.pointsObject);
        if (hits.length > 0) return this.nodes[hits[0].index];
      }
      return null;
    },

    _screenToWorldXY(screenX, screenY) {
      var rect = this.renderer.domElement.getBoundingClientRect();
      var ndcX = ((screenX - rect.left) / rect.width) * 2 - 1;
      var ndcY = -((screenY - rect.top) / rect.height) * 2 + 1;
      var fovRad = (this.camera.fov * Math.PI) / 180;
      var halfH = Math.tan(fovRad / 2) * this.camera.position.z;
      var halfW = halfH * this.camera.aspect;
      var target = this.controls.target;
      return { x: target.x + ndcX * halfW, y: target.y + ndcY * halfH };
    },

    _dispatchNodeClick(node) {
      this.container.dispatchEvent(new CustomEvent('graph-node-click', { detail: node, bubbles: true }));
    }
  });
})(typeof window !== 'undefined' ? window : this);
