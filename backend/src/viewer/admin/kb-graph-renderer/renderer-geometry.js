/**
 * KBGraphRenderer — module 3/7: points & edges geometry construction.
 * Load order: after renderer-core.js (attaches methods to the shared class
 * prototype exposed as window.__kbGraphRendererNS.KBGraphRendererImpl).
 */
(function(global) {
  'use strict';

  var NS = global.__kbGraphRendererNS;
  var KBGraphRendererImpl = NS.KBGraphRendererImpl;
  var colorForType = NS.colorForType;
  var NODE_SIZES = NS.NODE_SIZES;

  Object.assign(KBGraphRendererImpl.prototype, {

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
      var sizes = new Float32Array(n); // per-node base world size (from NODE_SIZES)
      var tmpColor = new THREE.Color();
      for (var i = 0; i < n; i++) {
        var node = this.nodes[i];
        positions[i * 3] = node.x;
        positions[i * 3 + 1] = node.y;
        positions[i * 3 + 2] = node.z;
        tmpColor.setHex(colorForType(node.type));
        colors[i * 3] = tmpColor.r;
        colors[i * 3 + 1] = tmpColor.g;
        colors[i * 3 + 2] = tmpColor.b;
        // Base size per type (default 2.5). Scaled up so world radius is meaningful.
        var baseSize = (NODE_SIZES[node.type] || 2.5);
        sizes[i] = baseSize;
      }
      var geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
      // Create glowing circle texture for better-looking nodes
      var canvas2d = document.createElement('canvas');
      canvas2d.width = 64; canvas2d.height = 64;
      var ctx2d = canvas2d.getContext('2d');
      var gradient = ctx2d.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.35, 'rgba(255,255,255,0.85)');
      gradient.addColorStop(0.75, 'rgba(255,255,255,0.35)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx2d.fillStyle = gradient;
      ctx2d.fillRect(0, 0, 64, 64);
      var spriteTexture = new THREE.CanvasTexture(canvas2d);

      // Custom shader: distance attenuation for natural depth, but the on-screen
      // pixel size is CLAMPED to [MIN_PIXELS, MAX_PIXELS] so nodes never shrink
      // below what the human eye can comfortably see (min) nor bloat when close (max).
      // uWorldScale converts the base world size into a pixel projection factor.
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var material = new THREE.ShaderMaterial({
        uniforms: {
          uTex: { value: spriteTexture },
          uMinPx: { value: 7.0 * dpr },   // MIN visible size: ~7 CSS px (eye-friendly floor)
          uMaxPx: { value: 46.0 * dpr },  // MAX size when zoomed in close
          uPxPerWorld: { value: 0.0 },    // recomputed each resize (viewport height factor)
          uOpacity: { value: 0.95 }
        },
        transparent: true,
        depthWrite: false,
        vertexShader: [
          'attribute float aSize;',
          'attribute vec3 color;',
          'varying vec3 vColor;',
          'uniform float uMinPx;',
          'uniform float uMaxPx;',
          'uniform float uPxPerWorld;',
          'void main() {',
          '  vColor = color;',
          '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
          '  float dist = -mv.z;',                       // camera-space depth (positive in front)
          '  if (dist < 1.0) dist = 1.0;',
          // Perspective attenuation: world size -> pixels = size * uPxPerWorld / dist
          '  float px = aSize * uPxPerWorld / dist;',
          '  px = clamp(px, uMinPx, uMaxPx);',            // enforce min/max on-screen size
          '  gl_PointSize = px;',
          '  gl_Position = projectionMatrix * mv;',
          '}'
        ].join('\n'),
        fragmentShader: [
          'uniform sampler2D uTex;',
          'uniform float uOpacity;',
          'varying vec3 vColor;',
          'void main() {',
          '  vec4 tex = texture2D(uTex, gl_PointCoord);',
          '  if (tex.a < 0.02) discard;',
          '  gl_FragColor = vec4(vColor, tex.a * uOpacity);',
          '}'
        ].join('\n')
      });
      this.pointsMaterial = material;
      this._updatePointSizeUniforms();
      this.pointsObject = new THREE.Points(geometry, material);
      this.pointsObject.renderOrder = 1;
      this.scene.add(this.pointsObject);
    },

    /**
     * Recompute the world->pixel projection factor used by the point shader.
     * For a perspective camera, an object of world size S at camera distance D
     * projects to (S * viewportHeightPx / (2 * D * tan(fov/2))) pixels.
     * We fold everything except D into uPxPerWorld so the shader only divides by dist.
     */
    _updatePointSizeUniforms() {
      if (!this.pointsMaterial || !this.camera || !this.renderer) return;
      var THREE = this.THREE;
      var size = new THREE.Vector2();
      this.renderer.getSize(size);
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var vpHeightPx = size.y * dpr;
      var fovRad = this.camera.fov * Math.PI / 180;
      var pxPerWorld = vpHeightPx / (2.0 * Math.tan(fovRad / 2.0));
      // Multiply by an aesthetic gain so type sizes (1.5..6) map to a good pixel range.
      this.pointsMaterial.uniforms.uPxPerWorld.value = pxPerWorld * 2.2;
    },

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
  });
})(typeof window !== 'undefined' ? window : this);
