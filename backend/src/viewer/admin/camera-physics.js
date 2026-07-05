/**
 * CameraPhysics — Inertia engine with exponential decay.
 * Provides pan delta calculation and velocity-based inertia for smooth scrolling.
 * Zero allocations in hot path (pre-allocated result object).
 */
(function(global) {
  'use strict';

  // Tunable constants
  const FRICTION = 0.92;
  const MIN_VELOCITY = 0.1;
  const PAN_SPEED = 2.0;
  const REFERENCE_DISTANCE = 1000;

  // Pre-allocated result object (zero GC in tick)
  const _result = { dx: 0, dy: 0, dz: 0 };
  const _panResult = { x: 0, y: 0 };

  function CameraPhysics(options) {
    var opts = options || {};
    this._friction = opts.friction || FRICTION;
    this._minVelocity = opts.minVelocity || MIN_VELOCITY;
    this._panSpeed = opts.panSpeed || PAN_SPEED;
    this._velocityX = 0;
    this._velocityY = 0;
    this._velocityZ = 0;
  }

  /**
   * Calculate pan delta adjusted for zoom level.
   * Returns pre-allocated object {x, y} — world-space delta.
   */
  CameraPhysics.prototype.applyPanDelta = function(dx, dy, zoomFactor) {
    var speed = (zoomFactor / REFERENCE_DISTANCE) * this._panSpeed;
    _panResult.x = -dx * speed;
    _panResult.y = dy * speed; // Y inverted (screen vs world)
    return _panResult;
  };

  /**
   * Set inertia velocity from gesture end (pixels/ms).
   */
  CameraPhysics.prototype.setInertia = function(vx, vy) {
    this._velocityX = vx;
    this._velocityY = vy;
  };

  /**
   * Set zoom inertia velocity.
   */
  CameraPhysics.prototype.setZoomInertia = function(vz) {
    this._velocityZ = vz;
  };

  /**
   * Tick the physics engine. dt in seconds.
   * Returns pre-allocated {dx, dy, dz} — position delta to apply.
   * Exponential decay: v *= friction^(dt*60) for frame-rate independence.
   */
  CameraPhysics.prototype.tick = function(dt) {
    var absX = Math.abs(this._velocityX);
    var absY = Math.abs(this._velocityY);
    var absZ = Math.abs(this._velocityZ);

    if (absX < this._minVelocity && absY < this._minVelocity && absZ < this._minVelocity) {
      this._velocityX = 0; this._velocityY = 0; this._velocityZ = 0;
      _result.dx = 0; _result.dy = 0; _result.dz = 0;
      return _result;
    }

    // Frame-rate independent decay
    var decay = Math.pow(this._friction, dt * 60);
    this._velocityX *= decay;
    this._velocityY *= decay;
    this._velocityZ *= decay;

    _result.dx = this._velocityX * dt;
    _result.dy = this._velocityY * dt;
    _result.dz = this._velocityZ * dt;
    return _result;
  };

  /**
   * Returns true if any velocity component is above threshold.
   */
  CameraPhysics.prototype.isMoving = function() {
    return Math.abs(this._velocityX) >= this._minVelocity ||
           Math.abs(this._velocityY) >= this._minVelocity ||
           Math.abs(this._velocityZ) >= this._minVelocity;
  };

  /**
   * Immediately stop all motion.
   */
  CameraPhysics.prototype.stop = function() {
    this._velocityX = 0;
    this._velocityY = 0;
    this._velocityZ = 0;
  };

  global.CameraPhysics = CameraPhysics;
})(typeof window !== 'undefined' ? window : this);
