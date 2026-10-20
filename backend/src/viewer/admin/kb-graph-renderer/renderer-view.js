/**
 * KBGraphRenderer — module 5/7: labels, resize/render loop and teardown.
 * Load order: after renderer-core.js (attaches methods to the shared class
 * prototype exposed as window.__kbGraphRendererNS.KBGraphRendererImpl).
 */
(function(global) {
  'use strict';

  var NS = global.__kbGraphRendererNS;
  var KBGraphRendererImpl = NS.KBGraphRendererImpl;

  Object.assign(KBGraphRendererImpl.prototype, {

    // ===== Teardown =====

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
    },

    _disposeSceneObjects() {
      if (!this.scene) return;
      this.scene.traverse(function(obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(function(m) { m.dispose(); });
          else obj.material.dispose();
        }
      });
    },

    // ===== Labels =====

    _clearLabels() {
      if (this.labelContainer) this.labelContainer.innerHTML = '';
      this.activeLabels = [];
    },

    _showLabels(indices) {
      this._clearLabels();
      for (var i = 0; i < indices.length; i++) {
        var node = this.nodes[indices[i]];
        var label = document.createElement('div');
        label.style.cssText = 'position:absolute;color:#f1f5f9;font-size:10px;font-family:sans-serif;white-space:nowrap;background:rgba(15,23,42,0.75);padding:1px 4px;border-radius:3px;pointer-events:none;';
        label.textContent = node.label || node.id;
        this.labelContainer.appendChild(label);
        this.activeLabels.push({ el: label, idx: indices[i] });
      }
    },

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
    },

    // ===== Resize & Render Loop =====

    _handleResize() {
      if (this._destroyed) return;
      var w = this.container.clientWidth;
      var h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this._updatePointSizeUniforms(); // viewport height changed -> recompute px factor
    },

    _animate() {
      if (this._destroyed) return;
      var self = this;
      this.animFrameId = requestAnimationFrame(function() { self._animate(); });
      var dt = this._clock ? this._clock.getDelta() : 0.016;
      this.controls.update();
      // Throttled LOD update
      this._lodAccum += dt * 1000;
      if (this._lodAccum >= this.refreshMs) { this._lodAccum = 0; this._updateDetailLOD(false); }
      this._updateLabels();
      this.renderer.render(this.scene, this.camera);
      this._renderMinimap();
    }
  });
})(typeof window !== 'undefined' ? window : this);
