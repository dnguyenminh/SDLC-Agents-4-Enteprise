/**
 * KBGraphRenderer — module 7/7: minimap (canvas overview + viewport indicator).
 * Load order: after renderer-core.js (attaches methods to the shared class
 * prototype exposed as window.__kbGraphRendererNS.KBGraphRendererImpl).
 */
(function(global) {
  'use strict';

  var NS = global.__kbGraphRendererNS;
  var KBGraphRendererImpl = NS.KBGraphRendererImpl;

  Object.assign(KBGraphRendererImpl.prototype, {

    _setupMinimapInput() {
      var self = this;
      var canvas = this.minimapCanvas;
      var dragging = false, rightDrag = false;
      var lastX = 0, lastY = 0;
      canvas.addEventListener('mousedown', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.button === 2) { rightDrag = true; } else { dragging = true; }
        lastX = e.clientX; lastY = e.clientY;
      });
      canvas.addEventListener('contextmenu', function(e) { e.preventDefault(); });
      canvas.addEventListener('mousemove', function(e) {
        if (!dragging && !rightDrag) return;
        var dx = e.clientX - lastX, dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        if (dragging) {
          // Left-drag = rotate (matches main graph LEFT=ROTATE)
          self._minimapRotateToGraph(dx);
        } else if (rightDrag) {
          // Right-drag = pan (matches main graph RIGHT=PAN)
          self._minimapPanToGraph(dx, dy);
        }
      });
      var endDrag = function() { dragging = false; rightDrag = false; };
      canvas.addEventListener('mouseup', endDrag);
      canvas.addEventListener('mouseleave', endDrag);
      canvas.addEventListener('wheel', function(e) {
        e.preventDefault();
        e.stopPropagation();
        self._minimapZoomToGraph(e.deltaY > 0 ? 1 : -1);
      }, { passive: false });
      canvas.addEventListener('dblclick', function(e) {
        e.preventDefault();
        e.stopPropagation();
        self.minimapSpanMode = !self.minimapSpanMode;
      });
    },

    _minimapPanToGraph(dx, dy) {
      if (!this.camera || !this.controls) return;
      var cw = this.minimapCanvas.width, ch = this.minimapCanvas.height;
      var factor = this._minimapWorldSize() / Math.min(cw, ch);
      var panX = -dx * factor;
      var panY = dy * factor;
      this.camera.position.x += panX;
      this.camera.position.y += panY;
      this.controls.target.x += panX;
      this.controls.target.y += panY;
      this.controls.update();
      this._needRender = true;
    },

    _minimapRotateToGraph(dx) {
      if (!this.camera || !this.controls) return;
      var angle = dx * 0.005;
      var pos = this.camera.position;
      var tgt = this.controls.target;
      var rx = pos.x - tgt.x, ry = pos.y - tgt.y;
      var cos = Math.cos(angle), sin = Math.sin(angle);
      this.camera.position.x = tgt.x + rx * cos - ry * sin;
      this.camera.position.y = tgt.y + rx * sin + ry * cos;
      this.camera.lookAt(tgt);
      this.controls.update();
      this._needRender = true;
    },

    _minimapZoomToGraph(direction) {
      if (!this.camera || !this.controls) return;
      // Zoom = move camera closer/further from target along view direction
      var pos = this.camera.position;
      var tgt = this.controls.target;
      var dx = pos.x - tgt.x, dy = pos.y - tgt.y, dz = pos.z - tgt.z;
      var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      var factor = direction > 0 ? 0.85 : 1.18;
      var newDist = Math.max(10, Math.min(50000, dist * factor));
      var scale = newDist / dist;
      this.camera.position.x = tgt.x + dx * scale;
      this.camera.position.y = tgt.y + dy * scale;
      this.camera.position.z = tgt.z + dz * scale;
      this.controls.update();
      this._needRender = true;
    },

    _minimapWorldSize() {
      if (!this.camera || !this.controls) return 5000;
      return this.camera.position.distanceTo(this.controls.target) * 2;
    },

    _minimapScreenToWorld(mx, my) {
      if (!this.nodes.length || !this.minimapBBox) return null;
      var cw = this.minimapCanvas.width, ch = this.minimapCanvas.height;
      var bb = this.minimapBBox;
      var bw = bb.maxX - bb.minX, bh = bb.maxY - bb.minY;
      if (bw < 1) bw = 1; if (bh < 1) bh = 1;
      var scale = Math.min((cw - 8) / bw, (ch - 8) / bh);
      var ox = (cw - bw * scale) / 2, oy = (ch - bh * scale) / 2;
      return { x: bb.minX + (mx - ox) / scale, y: bb.minY + (my - oy) / scale };
    },

    _renderMinimap() {
      if (!this.minimapCanvas || !this.renderer) return;
      var ctx = this.minimapCanvas.getContext('2d');
      var cw = this.minimapCanvas.width, ch = this.minimapCanvas.height;
      ctx.save();
      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, cw, ch);
      if (this.minimapSpanMode && this.minimapBBox && this.nodes.length) {
        // Span mode: overview of all nodes + viewport indicator
        this._renderMinimapSpan(ctx, cw, ch);
      } else {
        // Normal mode: mirror main viewport
        var src = this.renderer.domElement;
        ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, cw, ch);
      }
      ctx.restore();
    },

    _computeMinimapBBox() {
      if (!this.nodes.length) { this.minimapBBox = null; return; }
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (var i = 0; i < this.nodes.length; i++) {
        var n = this.nodes[i];
        if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
      }
      var pad = 50;
      this.minimapBBox = { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
    },

    _renderMinimapSpan(ctx, cw, ch) {
      var bb = this.minimapBBox;
      if (!bb) return;
      var bw = bb.maxX - bb.minX, bh = bb.maxY - bb.minY;
      if (bw < 1) bw = 1; if (bh < 1) bh = 1;
      var scale = Math.min((cw - 8) / bw, (ch - 8) / bh);
      var ox = (cw - bw * scale) / 2, oy = (ch - bh * scale) / 2;
      // Draw nodes as colored dots
      for (var i = 0; i < this.nodes.length; i++) {
        var n = this.nodes[i];
        var nx = ox + (n.x - bb.minX) * scale;
        var ny = oy + (n.y - bb.minY) * scale;
        ctx.fillStyle = this._getNodeTypeColor(n.type);
        ctx.globalAlpha = 0.7;
        ctx.fillRect(nx - 1, ny - 1, 2, 2);
      }
      ctx.globalAlpha = 1;
      // Draw viewport indicator (blue rectangle)
      this._drawViewportIndicator(ctx, cw, ch, ox, oy, scale, bb);
    },

    _getNodeTypeColor(type) {
      var KNOWN = { FIELD_VALUE:'#22d3ee', REPORT:'#6366f1', DATA:'#2dd4bf', CLASS:'#e879f9', PROPERTY:'#a78bfa', ACTIVITY:'#fb923c', FLOW:'#60a5fa', MODEL:'#4ade80', RULE:'#f87171', PROCESS:'#3b82f6', DATA_MODEL:'#10b981', UI:'#f59e0b', TECHNICAL:'#ec4899', INT_CONNECTOR:'#ef4444', DECISION:'#06b6d4', INT_MAPPING:'#f97316', INT_SERVICE:'#dc2626', INT_RESOURCE:'#a855f7', SECURITY:'#818cf8', ORG:'#e879f9', APP_DEF:'#c084fc', GEN_AI:'#fb7185', SURVEY:'#f472b6', SYSADMIN:'#34d399', PEGA_SCHEMA:'#fbbf24', OTHER:'#94a3b8' };
      if (KNOWN[type]) return KNOWN[type];
      if (!type) return '#94a3b8';
      var h = 0; for (var i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) >>> 0;
      return 'hsl(' + (h % 360) + ',70%,65%)';
    },

    _drawViewportIndicator(ctx, cw, ch, ox, oy, scale, bb) {
      if (!this.camera || !this.controls) return;
      var dist = this.camera.position.distanceTo(this.controls.target);
      var fovRad = (this.camera.fov * Math.PI) / 180;
      var halfH = Math.tan(fovRad / 2) * dist;
      var halfW = halfH * this.camera.aspect;
      var cx = this.controls.target.x, cy = this.controls.target.y;
      var vw = halfW * 2, vh = halfH * 2;
      var rx = ox + (cx - halfW - bb.minX) * scale;
      var ry = oy + (cy - halfH - bb.minY) * scale;
      var rw = vw * scale, rh = vh * scale;
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.8;
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.fillStyle = 'rgba(59,130,246,0.08)';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.globalAlpha = 1;
    }
  });
})(typeof window !== 'undefined' ? window : this);
