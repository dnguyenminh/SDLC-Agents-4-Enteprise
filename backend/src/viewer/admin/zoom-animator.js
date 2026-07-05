/**
 * ZoomAnimator — Animated zoom transitions with ease-out cubic.
 * Supports queue blending: multiple rapid calls → latest target wins.
 * Zero allocations in tick (no closures, no object creation).
 */
(function(global) {
  'use strict';

  // Tunable constants
  const DEFAULT_DURATION = 250;

  function ZoomAnimator() {
    this._active = false;
    this._startZ = 0;
    this._targetZ = 0;
    this._duration = DEFAULT_DURATION / 1000;
    this._elapsed = 0;
  }

  /**
   * Animate to target zoom level over duration (ms).
   * Multiple rapid calls: latest target wins (blend from current interpolated Z).
   */
  ZoomAnimator.prototype.animateTo = function(targetZ, duration) {
    if (this._active) {
      // Blend: start from current interpolated position
      this._startZ = this._currentInterpolatedZ();
    }
    this._targetZ = targetZ;
    this._duration = (duration || DEFAULT_DURATION) / 1000; // convert to seconds
    this._elapsed = 0;
    this._active = true;
  };

  /**
   * Set the current Z value (used when starting fresh animation).
   */
  ZoomAnimator.prototype.setCurrentZ = function(z) {
    if (!this._active) {
      this._startZ = z;
    }
  };

  /**
   * Tick the animator. dt in seconds.
   * Returns interpolated Z value, or null if not animating.
   */
  ZoomAnimator.prototype.tick = function(dt) {
    if (!this._active) return null;

    this._elapsed += dt;
    var t = this._elapsed / this._duration;
    if (t >= 1.0) {
      this._active = false;
      return this._targetZ;
    }
    // Ease-out cubic: 1 - (1 - t)^3
    var inv = 1 - t;
    var eased = 1 - (inv * inv * inv);
    return this._startZ + (this._targetZ - this._startZ) * eased;
  };

  /**
   * Returns true if currently animating.
   */
  ZoomAnimator.prototype.isAnimating = function() {
    return this._active;
  };

  /**
   * Cancel current animation.
   */
  ZoomAnimator.prototype.cancel = function() {
    this._active = false;
    this._elapsed = 0;
  };

  /**
   * Get current interpolated Z (internal helper for blending).
   */
  ZoomAnimator.prototype._currentInterpolatedZ = function() {
    if (!this._active) return this._startZ;
    var t = Math.min(this._elapsed / this._duration, 1.0);
    var inv = 1 - t;
    var eased = 1 - (inv * inv * inv);
    return this._startZ + (this._targetZ - this._startZ) * eased;
  };

  global.ZoomAnimator = ZoomAnimator;
})(typeof window !== 'undefined' ? window : this);
