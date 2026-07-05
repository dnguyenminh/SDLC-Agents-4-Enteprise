/**
 * GestureStateMachine — Classifies pointer input into PAN/PINCH/DRAG/TAP gestures.
 * States: IDLE, PENDING_TAP, PAN, PINCH, PENDING_DRAG, TAP_UP, DRAG_NODE
 * Returns GestureEvent objects from handle* methods.
 */
(function(global) {
  'use strict';

  // Tunable constants
  const PAN_THRESHOLD = 5;
  const TAP_MAX_DURATION = 200;
  const DOUBLE_TAP_WINDOW = 300;
  const DOUBLE_TAP_RADIUS = 20;
  const DRAG_HOLD_TIME = 200;
  const VELOCITY_BUFFER_SIZE = 3;

  // Pre-allocated event object (zero-alloc hot path)
  const _evt = { type: 'none', dx: 0, dy: 0, x: 0, y: 0, velocityX: 0, velocityY: 0, scale: 0, centerX: 0, centerY: 0, nodeId: null };

  function _emitNone() { _evt.type = 'none'; return _evt; }

  function _dist(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function GestureStateMachine(options) {
    this._state = 'IDLE';
    this._options = options || {};
    this._startX = 0; this._startY = 0; this._startTime = 0;
    this._lastX = 0; this._lastY = 0; this._lastTime = 0;
    this._prevTapX = 0; this._prevTapY = 0; this._prevTapTime = 0;
    this._holdTimer = null;
    this._doubleTapTimer = null;
    this._pointerCount = 0;
    this._pinchStartDist = 0;
    this._pinchCenterX = 0; this._pinchCenterY = 0;
    this._secondX = 0; this._secondY = 0;
    // Ring buffer for velocity (last 3 frames)
    this._velBuf = [{ x: 0, y: 0, t: 0 }, { x: 0, y: 0, t: 0 }, { x: 0, y: 0, t: 0 }];
    this._velIdx = 0;
  }

  GestureStateMachine.prototype.getState = function() { return this._state; };
  GestureStateMachine.prototype.reset = function() {
    this._state = 'IDLE';
    this._pointerCount = 0;
    if (this._holdTimer) { clearTimeout(this._holdTimer); this._holdTimer = null; }
    if (this._doubleTapTimer) { clearTimeout(this._doubleTapTimer); this._doubleTapTimer = null; }
  };

  GestureStateMachine.prototype._pushVelocity = function(x, y, t) {
    this._velBuf[this._velIdx] = { x: x, y: y, t: t };
    this._velIdx = (this._velIdx + 1) % VELOCITY_BUFFER_SIZE;
  };

  GestureStateMachine.prototype._calcVelocity = function() {
    var oldest = this._velBuf[(this._velIdx) % VELOCITY_BUFFER_SIZE];
    var newest = this._velBuf[(this._velIdx + VELOCITY_BUFFER_SIZE - 1) % VELOCITY_BUFFER_SIZE];
    var dt = newest.t - oldest.t;
    if (dt <= 0) return { vx: 0, vy: 0 };
    return { vx: (newest.x - oldest.x) / dt, vy: (newest.y - oldest.y) / dt };
  };

  GestureStateMachine.prototype.handlePointerDown = function(id, x, y, time) {
    this._pointerCount++;
    if (this._pointerCount >= 2) {
      if (this._holdTimer) { clearTimeout(this._holdTimer); this._holdTimer = null; }
      this._state = 'PINCH';
      this._secondX = x; this._secondY = y;
      this._pinchStartDist = _dist(this._startX, this._startY, x, y);
      this._pinchCenterX = (this._startX + x) / 2;
      this._pinchCenterY = (this._startY + y) / 2;
      _evt.type = 'pinch_start'; _evt.centerX = this._pinchCenterX;
      _evt.centerY = this._pinchCenterY; _evt.scale = 1;
      return _evt;
    }
    this._startX = x; this._startY = y; this._startTime = time;
    this._lastX = x; this._lastY = y; this._lastTime = time;
    this._pushVelocity(x, y, time);

    if (this._state === 'TAP_UP') {
      // Check double-tap
      if (this._doubleTapTimer) { clearTimeout(this._doubleTapTimer); this._doubleTapTimer = null; }
      if (_dist(x, y, this._prevTapX, this._prevTapY) < DOUBLE_TAP_RADIUS) {
        this._state = 'IDLE';
        _evt.type = 'double_tap'; _evt.x = x; _evt.y = y;
        return _evt;
      }
    }
    this._state = 'PENDING_TAP';
    // Start hold timer for drag detection
    var self = this;
    this._holdTimer = setTimeout(function() {
      self._holdTimer = null;
      if (self._state !== 'PENDING_TAP') return;
      var getCurrentMode = self._options.getCurrentMode;
      var raycastNode = self._options.raycastNode;
      if (getCurrentMode && getCurrentMode() === 'CLOSE' && raycastNode) {
        var nodeId = raycastNode(self._startX, self._startY);
        if (nodeId != null) {
          self._state = 'PENDING_DRAG';
          _evt.type = 'drag_start'; _evt.x = self._startX; _evt.y = self._startY; _evt.nodeId = nodeId;
          if (self._options.onGestureEvent) self._options.onGestureEvent(_evt);
        }
      }
    }, DRAG_HOLD_TIME);
    return _emitNone();
  };

  GestureStateMachine.prototype.handlePointerMove = function(id, x, y, time) {
    if (this._state === 'PINCH') {
      this._secondX = x; this._secondY = y;
      var newDist = _dist(this._startX, this._startY, x, y);
      var scale = this._pinchStartDist > 0 ? newDist / this._pinchStartDist : 1;
      this._pinchCenterX = (this._startX + x) / 2;
      this._pinchCenterY = (this._startY + y) / 2;
      _evt.type = 'pinch_move'; _evt.scale = scale;
      _evt.centerX = this._pinchCenterX; _evt.centerY = this._pinchCenterY;
      return _evt;
    }
    if (this._state === 'PENDING_TAP') {
      if (_dist(x, y, this._startX, this._startY) > PAN_THRESHOLD) {
        if (this._holdTimer) { clearTimeout(this._holdTimer); this._holdTimer = null; }
        this._state = 'PAN';
        _evt.type = 'pan_start'; _evt.x = x; _evt.y = y;
        return _evt;
      }
      return _emitNone();
    }
    if (this._state === 'PENDING_DRAG' || this._state === 'DRAG_NODE') {
      this._state = 'DRAG_NODE';
      _evt.type = 'drag_move'; _evt.x = x; _evt.y = y;
      return _evt;
    }
    if (this._state === 'PAN') {
      var dx = x - this._lastX, dy = y - this._lastY;
      this._lastX = x; this._lastY = y; this._lastTime = time;
      this._pushVelocity(x, y, time);
      _evt.type = 'pan_move'; _evt.dx = dx; _evt.dy = dy;
      return _evt;
    }
    return _emitNone();
  };

  GestureStateMachine.prototype.handlePointerUp = function(id, x, y, time) {
    this._pointerCount = Math.max(0, this._pointerCount - 1);
    if (this._state === 'PINCH') {
      if (this._pointerCount > 0) { this._state = 'PAN'; this._lastX = x; this._lastY = y; this._lastTime = time; }
      else { this._state = 'IDLE'; }
      _evt.type = 'pinch_end'; _evt.scale = 1;
      return _evt;
    }
    if (this._state === 'DRAG_NODE') {
      this._state = 'IDLE';
      _evt.type = 'drag_end'; _evt.x = x; _evt.y = y;
      return _evt;
    }
    if (this._state === 'PENDING_DRAG') {
      this._state = 'IDLE';
      _evt.type = 'tap'; _evt.x = x; _evt.y = y;
      return _evt;
    }
    if (this._state === 'PAN') {
      var vel = this._calcVelocity();
      this._state = 'IDLE';
      _evt.type = 'pan_end'; _evt.velocityX = vel.vx; _evt.velocityY = vel.vy;
      return _evt;
    }
    if (this._state === 'PENDING_TAP') {
      if (this._holdTimer) { clearTimeout(this._holdTimer); this._holdTimer = null; }
      var elapsed = time - this._startTime;
      if (elapsed < TAP_MAX_DURATION && _dist(x, y, this._startX, this._startY) < PAN_THRESHOLD) {
        this._prevTapX = x; this._prevTapY = y; this._prevTapTime = time;
        this._state = 'TAP_UP';
        var self = this;
        this._doubleTapTimer = setTimeout(function() {
          self._doubleTapTimer = null;
          if (self._state === 'TAP_UP') {
            self._state = 'IDLE';
            _evt.type = 'tap'; _evt.x = x; _evt.y = y;
            if (self._options.onGestureEvent) self._options.onGestureEvent(_evt);
          }
        }, DOUBLE_TAP_WINDOW);
        return _emitNone();
      }
      this._state = 'IDLE';
      return _emitNone();
    }
    this._state = 'IDLE';
    return _emitNone();
  };

  global.GestureStateMachine = GestureStateMachine;
})(typeof window !== 'undefined' ? window : this);
