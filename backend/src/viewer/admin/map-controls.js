/**
 * MapControls — Orchestrator for 2D map-like navigation.
 * Composes GestureStateMachine, CameraPhysics, ZoomAnimator.
 * Pointer Events API for unified mouse/touch/pen input.
 * Camera locked to top-down view (Z-axis only).
 */
(function(global) {
  'use strict';

  const WHEEL_ZOOM_FACTOR = 1.15;
  const MIN_DISTANCE = 1;
  const MAX_DISTANCE = 50000;

  function MapControls(camera, domElement, options) {
    var opts = options || {};
    this.camera = camera;
    this.domElement = domElement;
    this.enabled = true;
    this._minDistance = opts.minDistance || MIN_DISTANCE;
    this._maxDistance = opts.maxDistance || MAX_DISTANCE;
    this._onZoomEnd = opts.onZoomEnd || null;
    this._onTap = opts.onTap || null;
    this._onDoubleTap = opts.onDoubleTap || null;
    this._onNodeDragStart = opts.onNodeDragStart || null;
    this._onNodeDragMove = opts.onNodeDragMove || null;
    this._onNodeDragEnd = opts.onNodeDragEnd || null;

    var THREE = this._getThree();
    this.target = new THREE.Vector3(camera.position.x, camera.position.y, 0);
    this._physics = new global.CameraPhysics({ friction: opts.friction || 0.92, panSpeed: opts.panSpeed || 2.0 });
    this._zoomAnimator = new global.ZoomAnimator();
    this._gesture = new global.GestureStateMachine({
      getCurrentMode: opts.getCurrentMode || null,
      raycastNode: opts.raycastNode || null,
      onGestureEvent: this._handleAsyncGesture.bind(this)
    });
    this._panAnimActive = false;
    this._panAnimStartX = 0; this._panAnimStartY = 0;
    this._panAnimTargetX = 0; this._panAnimTargetY = 0;
    this._panAnimDuration = 0; this._panAnimElapsed = 0;
    this._pointers = new Map();
    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
    this._onWheel = this._handleWheel.bind(this);
    domElement.style.touchAction = 'none';
    // Prevent browser default gestures (pinch-zoom page) on the graph container
    domElement.addEventListener('touchstart', function(e) { if (e.touches.length >= 2) e.preventDefault(); }, { passive: false });
    domElement.addEventListener('touchmove', function(e) { e.preventDefault(); }, { passive: false });
    domElement.addEventListener('gesturestart', function(e) { e.preventDefault(); }, { passive: false });
    domElement.addEventListener('gesturechange', function(e) { e.preventDefault(); }, { passive: false });
    domElement.addEventListener('pointerdown', this._onPointerDown, { passive: true });
    domElement.addEventListener('pointermove', this._onPointerMove, { passive: true });
    domElement.addEventListener('pointerup', this._onPointerUp, { passive: true });
    domElement.addEventListener('pointercancel', this._onPointerUp, { passive: true });
    domElement.addEventListener('wheel', this._onWheel, { passive: false });
  }

  MapControls.prototype._getThree = function() {
    if (typeof window.THREE !== 'undefined') return window.THREE;
    throw new Error('THREE.js not found');
  };

  MapControls.prototype._handlePointerDown = function(e) {
    if (!this.enabled) return;
    this.domElement.setPointerCapture(e.pointerId);
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this._processGesture(this._gesture.handlePointerDown(e.pointerId, e.clientX, e.clientY, e.timeStamp));
  };

  MapControls.prototype._handlePointerMove = function(e) {
    if (!this.enabled) return;
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this._processGesture(this._gesture.handlePointerMove(e.pointerId, e.clientX, e.clientY, e.timeStamp));
  };

  MapControls.prototype._handlePointerUp = function(e) {
    if (!this.enabled) return;
    this.domElement.releasePointerCapture(e.pointerId);
    this._pointers.delete(e.pointerId);
    this._processGesture(this._gesture.handlePointerUp(e.pointerId, e.clientX, e.clientY, e.timeStamp));
  };

  MapControls.prototype._handleWheel = function(e) {
    if (!this.enabled) return;
    e.preventDefault();
    var factor = e.deltaY > 0 ? WHEEL_ZOOM_FACTOR : (1 / WHEEL_ZOOM_FACTOR);
    var currentZ = this.camera.position.z;
    var targetZ = this._clamp(currentZ * factor);
    this._applyZoomToward(targetZ, e.clientX, e.clientY);
    this._zoomAnimator.setCurrentZ(currentZ);
    this._zoomAnimator.animateTo(targetZ, 250);
  };

  MapControls.prototype._processGesture = function(evt) {
    if (!evt || evt.type === 'none') return;
    switch (evt.type) {
      case 'pan_move':
        this._physics.stop();
        var delta = this._physics.applyPanDelta(evt.dx, evt.dy, this.camera.position.z);
        this.target.x += delta.x; this.target.y += delta.y;
        break;
      case 'pan_end': this._physics.setInertia(evt.velocityX, evt.velocityY); break;
      case 'pinch_move': this._applyPinchZoom(evt.scale, evt.centerX, evt.centerY); break;
      case 'pinch_end': if (this._onZoomEnd) this._onZoomEnd(); break;
      case 'tap': if (this._onTap) this._onTap(evt.x, evt.y); break;
      case 'double_tap': if (this._onDoubleTap) this._onDoubleTap(evt.x, evt.y); break;
      case 'drag_start': if (this._onNodeDragStart) this._onNodeDragStart(evt.nodeId); break;
      case 'drag_move': if (this._onNodeDragMove) this._onNodeDragMove(evt.x, evt.y); break;
      case 'drag_end': if (this._onNodeDragEnd) this._onNodeDragEnd(); break;
    }
  };

  MapControls.prototype._handleAsyncGesture = function(evt) { this._processGesture(evt); };

  MapControls.prototype._applyZoomToward = function(newZ, screenX, screenY) {
    var world = this._screenToWorld(screenX, screenY);
    var zoomRatio = newZ / this.camera.position.z;
    this.target.x += (world.x - this.target.x) * (1 - zoomRatio);
    this.target.y += (world.y - this.target.y) * (1 - zoomRatio);
  };

  MapControls.prototype._applyPinchZoom = function(scale, centerX, centerY) {
    var newZ = this._clamp(this.camera.position.z / scale);
    this._applyZoomToward(newZ, centerX, centerY);
    this.camera.position.z = newZ;
    if (this._onZoomEnd) this._onZoomEnd();
  };

  MapControls.prototype._screenToWorld = function(sx, sy) {
    var rect = this.domElement.getBoundingClientRect();
    var ndcX = ((sx - rect.left) / rect.width) * 2 - 1;
    var ndcY = -((sy - rect.top) / rect.height) * 2 + 1;
    var fovRad = (this.camera.fov * Math.PI) / 180;
    var halfH = Math.tan(fovRad / 2) * this.camera.position.z;
    return { x: this.target.x + ndcX * halfH * this.camera.aspect, y: this.target.y + ndcY * halfH };
  };

  MapControls.prototype._clamp = function(z) {
    return Math.max(this._minDistance, Math.min(this._maxDistance, z));
  };

  MapControls.prototype.update = function(dt) {
    if (this._physics.isMoving()) {
      var d = this._physics.tick(dt);
      var panDelta = this._physics.applyPanDelta(-d.dx * 1000, -d.dy * 1000, this.camera.position.z);
      this.target.x += panDelta.x; this.target.y += panDelta.y;
      if (!this._physics.isMoving() && this._onZoomEnd) this._onZoomEnd();
    }
    this._zoomAnimator.setCurrentZ(this.camera.position.z);
    var newZ = this._zoomAnimator.tick(dt);
    if (newZ !== null) {
      this.camera.position.z = newZ;
      if (!this._zoomAnimator.isAnimating() && this._onZoomEnd) this._onZoomEnd();
    }
    if (this._panAnimActive) {
      this._panAnimElapsed += dt;
      var t = Math.min(this._panAnimElapsed / this._panAnimDuration, 1.0);
      var inv = 1 - t; var eased = 1 - (inv * inv * inv);
      this.target.x = this._panAnimStartX + (this._panAnimTargetX - this._panAnimStartX) * eased;
      this.target.y = this._panAnimStartY + (this._panAnimTargetY - this._panAnimStartY) * eased;
      if (t >= 1.0) this._panAnimActive = false;
    }
    this.camera.position.x = this.target.x;
    this.camera.position.y = this.target.y;
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);
  };

  MapControls.prototype.zoomTo = function(targetZ, duration) {
    this._zoomAnimator.setCurrentZ(this.camera.position.z);
    this._zoomAnimator.animateTo(this._clamp(targetZ), duration || 600);
  };

  MapControls.prototype.panTo = function(x, y, duration) {
    this._panAnimStartX = this.target.x; this._panAnimStartY = this.target.y;
    this._panAnimTargetX = x; this._panAnimTargetY = y;
    this._panAnimDuration = (duration || 600) / 1000;
    this._panAnimElapsed = 0;
    this._panAnimActive = true;
    this._physics.stop();
  };

  MapControls.prototype.dispose = function() {
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('pointercancel', this._onPointerUp);
    this.domElement.removeEventListener('wheel', this._onWheel);
    this._gesture.reset(); this._physics.stop(); this._zoomAnimator.cancel();
    this._pointers.clear();
  };

  global.MapControls = MapControls;
})(typeof window !== 'undefined' ? window : this);
