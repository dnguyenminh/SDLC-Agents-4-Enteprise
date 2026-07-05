# Technical Design Document (TDD) — Touch & Map-like Navigation

## SA4E-6 Enhancement: KB Graph Touch & Map-like Navigation

---

## Document Information

| Field | Value |
|-------|-------|
| Parent Ticket | SA4E-6 |
| Title | KB Graph Touch & Map-like Navigation |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2026-07-04 |
| Status | Draft |
| Related BRD | BRD-TOUCH.md |
| Technology | Vanilla JavaScript, Pointer Events API, Three.js |

---

## 1. Introduction

### 1.1 Purpose

This TDD provides the technical design for replacing the existing OrbitControls-based camera system in kb-graph-renderer.js with a custom MapControls system implementing 2D map-like navigation (pan, pinch-to-zoom, inertia, gestures).

### 1.2 Design Principles

| # | Principle | Rationale |
|---|-----------|-----------|
| 1 | Zero dependencies | Native Pointer Events API only; no new libs |
| 2 | < 200 lines per file | Project code standard (SRP) |
| 3 | 60fps budget | All input processing < 16ms per frame |
| 4 | Zero allocations in hot path | Prevent GC pauses during animation |
| 5 | Unified input model | Single Pointer Events API for mouse + touch + pen |
| 6 | Composition over inheritance | MapControls composed of small focused modules |

### 1.3 Scope

- **IN**: Camera pan, zoom, inertia, gesture detection, node drag, double-tap zoom, animated transitions
- **OUT**: LOD algorithm changes, backend changes, mobile-specific layouts

---

## 2. System Architecture

### 2.1 High-Level Component Architecture

`
+------------------------------------------------------------------+
|                    kb-graph-renderer.js                           |
|   _animate() loop  |  init()  |  raycaster  |  LOD integration  |
+--------+-----------------------------------------------------------+
         |
         | .update() per frame
         v
+------------------------------------------------------------------+
|                    map-controls.js  (<200 lines)                  |
|   MapControls class — orchestrator                                |
|   - Pointer tracking (Map<pointerId, PointerState>)              |
|   - Delegates to GestureStateMachine                             |
|   - Owns camera reference + target Vector3                       |
|   - Exposes: update(), dispose(), zoomTo(), panTo()              |
+------------------------------------------------------------------+
         |  delegates             |  delegates           |  delegates
         v                        v                      v
+-----------------+    +-------------------+    +------------------+
| gesture-fsm.js |    | camera-physics.js |    | zoom-animator.js |
| (<200 lines)   |    | (<200 lines)      |    | (<200 lines)     |
|                 |    |                   |    |                  |
| GestureState    |    | Inertia engine    |    | Animated zoom    |
| Machine:        |    | - Pan velocity    |    | - lerp to target |
| IDLE->PAN->     |    | - Zoom velocity   |    | - ease-out curve |
| PINCH->DRAG    |    | - Friction decay  |    | - queue/blend    |
+-----------------+    +-------------------+    +------------------+
`

### 2.2 Module Dependency Graph

`mermaid
graph TB
    KBR[kb-graph-renderer.js] --> MC[map-controls.js]
    MC --> GFSM[gesture-fsm.js]
    MC --> CP[camera-physics.js]
    MC --> ZA[zoom-animator.js]
    KBR --> LOD[lod-manager.js]
    KBR --> RC[Raycaster - Three.js]
    MC -.->|event: zoom-end| KBR
    MC -.->|event: node-drag| KBR
    ZA -.->|callback: onComplete| MC
`

### 2.3 Integration with Existing Code

`mermaid
sequenceDiagram
    participant User
    participant DOM as renderer.domElement
    participant MC as MapControls
    participant FSM as GestureStateMachine
    participant CP as CameraPhysics
    participant KBR as KBGraphRenderer
    participant LOD as LODManager

    User->>DOM: pointerdown
    DOM->>MC: _onPointerDown(e)
    MC->>FSM: handlePointerDown(pointer)
    FSM-->>MC: state = PAN

    User->>DOM: pointermove
    DOM->>MC: _onPointerMove(e)
    MC->>FSM: handlePointerMove(pointer)
    FSM-->>MC: panDelta(dx, dy)
    MC->>CP: applyPan(dx, dy, zoomLevel)
    CP-->>MC: new camera position

    User->>DOM: pointerup
    DOM->>MC: _onPointerUp(e)
    MC->>FSM: handlePointerUp(pointer)
    FSM-->>MC: startInertia(velocity)
    MC->>CP: setInertiaVelocity(vx, vy)

    loop Animation Frame (via KBR._animate)
        KBR->>MC: update(deltaTime)
        MC->>CP: tick(dt)
        CP-->>MC: positionDelta
        MC->>KBR: camera.position updated
        KBR->>LOD: _updateMode()
    end

`

---

## 3. File Structure

### 3.1 New Files to Create

| # | File | Lines (est.) | Responsibility |
|---|------|-------------|----------------|
| 1 | ackend/src/viewer/admin/map-controls.js | ~180 | Main orchestrator — pointer events, camera updates, public API |
| 2 | ackend/src/viewer/admin/gesture-fsm.js | ~150 | Gesture state machine — classify inputs into PAN/PINCH/DRAG/TAP |
| 3 | ackend/src/viewer/admin/camera-physics.js | ~130 | Inertia engine — velocity tracking, friction decay, bounds clamping |
| 4 | ackend/src/viewer/admin/zoom-animator.js | ~120 | Animated zoom transitions — lerp, ease-out, queue blending |

### 3.2 Modified Files

| # | File | Changes |
|---|------|---------|
| 1 | kb-graph-renderer.js | Remove OrbitControls/fallback setup; instantiate MapControls; hook events |
| 2 | (none) | LOD files remain unchanged — MapControls triggers same _updateMode() |

### 3.3 Directory Layout

`
backend/src/viewer/admin/
├── kb-graph-renderer.js    (modified: ~10 lines changed)
├── map-controls.js         (NEW)
├── gesture-fsm.js          (NEW)
├── camera-physics.js       (NEW)
├── zoom-animator.js        (NEW)
├── lod-manager.js          (unchanged)
├── lod-clustering.js       (unchanged)
└── lod-animation.js        (unchanged)
`

---

## 4. Class Design

### 4.1 MapControls (map-controls.js)

`mermaid
classDiagram
    class MapControls {
        -camera: THREE.PerspectiveCamera
        -domElement: HTMLElement
        -target: THREE.Vector3
        -gestureState: GestureStateMachine
        -physics: CameraPhysics
        -zoomAnimator: ZoomAnimator
        -pointers: Map~number, PointerData~
        -enabled: boolean
        -minDistance: number
        -maxDistance: number
        +constructor(camera, domElement, options)
        +update(deltaTime): void
        +zoomTo(targetZ, duration): void
        +panTo(x, y, duration): void
        +dispose(): void
        -_onPointerDown(e): void
        -_onPointerMove(e): void
        -_onPointerUp(e): void
        -_onWheel(e): void
        -_applyPan(dx, dy): void
        -_applyZoom(delta, centerX, centerY): void
    }

    class GestureStateMachine {
        -state: GestureState
        -pointers: Map~number, PointerInfo~
        -tapTimer: number
        -lastTapTime: number
        -dragHoldTimer: number
        -panStartThreshold: number
        +handlePointerDown(id, x, y, time): GestureEvent
        +handlePointerMove(id, x, y, time): GestureEvent
        +handlePointerUp(id, x, y, time): GestureEvent
        +reset(): void
        +getState(): GestureState
    }

    class CameraPhysics {
        -velocityX: number
        -velocityY: number
        -velocityZ: number
        -friction: number
        -minVelocity: number
        +applyPanDelta(dx, dy, zoomFactor): {x, y}
        +setInertia(vx, vy): void
        +setZoomInertia(vz): void
        +tick(dt): {dx, dy, dz}
        +isMoving(): boolean
        +stop(): void
    }

    class ZoomAnimator {
        -animations: Array~ZoomAnim~
        -currentZ: number
        +animateTo(targetZ, duration, easing): void
        +tick(dt): number|null
        +isAnimating(): boolean
        +cancel(): void
    }

    MapControls --> GestureStateMachine
    MapControls --> CameraPhysics
    MapControls --> ZoomAnimator
`

### 4.2 PointerData Structure (no allocation — reuse object)

`javascript
// Pre-allocated pointer slot (avoid GC in hot path)
// { id, x, y, startX, startY, startTime, lastX, lastY, lastTime }
`

### 4.3 GestureEvent Union Type

`javascript
// Return from GestureStateMachine.handle*():
// { type: 'none' }
// { type: 'pan_start' }
// { type: 'pan_move', dx, dy }
// { type: 'pan_end', velocityX, velocityY }
// { type: 'pinch_start', centerX, centerY, distance }
// { type: 'pinch_move', centerX, centerY, scale }
// { type: 'pinch_end', velocityScale }
// { type: 'tap', x, y }
// { type: 'double_tap', x, y }
// { type: 'drag_start', x, y, nodeId }
// { type: 'drag_move', x, y }
// { type: 'drag_end', x, y }
`

---

## 5. Gesture State Machine Design

### 5.1 State Diagram

`mermaid
stateDiagram-v2
    [*] --> IDLE

    IDLE --> PENDING_TAP : pointerdown (1 finger)
    IDLE --> PINCH : pointerdown (2nd finger)

    PENDING_TAP --> PAN : move > 5px
    PENDING_TAP --> PENDING_DRAG : hold > 200ms (CLOSE mode + hit node)
    PENDING_TAP --> TAP_UP : pointerup (< 200ms, < 5px move)

    TAP_UP --> IDLE : 300ms timeout (emit 'tap')
    TAP_UP --> IDLE : 2nd tap within 300ms (emit 'double_tap')

    PAN --> PAN : pointermove
    PAN --> IDLE : pointerup (emit 'pan_end' + inertia)
    PAN --> PINCH : 2nd pointer added

    PINCH --> PINCH : pointermove (recalc scale)
    PINCH --> PAN : one pointer lifted (continue as pan)
    PINCH --> IDLE : all pointers lifted

    PENDING_DRAG --> DRAG_NODE : move after hold confirmed
    PENDING_DRAG --> PAN : pointer moved > 5px before hold timer
    DRAG_NODE --> DRAG_NODE : pointermove
    DRAG_NODE --> IDLE : pointerup (emit 'drag_end')
`

### 5.2 Transition Rules

| From | Event | Condition | To | Action |
|------|-------|-----------|-----|--------|
| IDLE | pointerdown | 1 pointer | PENDING_TAP | Record start pos, start hold timer |
| IDLE | pointerdown | 2+ pointers | PINCH | Record both positions, compute initial distance |
| PENDING_TAP | pointermove | distance > 5px | PAN | Emit pan_start |
| PENDING_TAP | hold timer (200ms) | CLOSE mode + node hit | PENDING_DRAG | Visual feedback on node |
| PENDING_TAP | pointerup | < 200ms | TAP_UP | Start 300ms double-tap timer |
| TAP_UP | pointerdown | within 300ms + < 20px from first | IDLE | Emit double_tap |
| TAP_UP | timeout | 300ms elapsed | IDLE | Emit tap |
| PAN | pointermove | — | PAN | Compute velocity, emit pan_move |
| PAN | pointerup | — | IDLE | Compute final velocity, emit pan_end |
| PINCH | pointermove | — | PINCH | Compute scale delta, emit pinch_move |
| PINCH | pointerup (1 left) | — | PAN | Continue as single-pointer pan |
| DRAG_NODE | pointermove | — | DRAG_NODE | Emit drag_move |
| DRAG_NODE | pointerup | — | IDLE | Emit drag_end |

### 5.3 Velocity Calculation

`
// Computed on pan_end / pinch_end for inertia:
velocityX = (currentX - prevX) / (currentTime - prevTime)
velocityY = (currentY - prevY) / (currentTime - prevTime)

// Only use last 3 frames for velocity (avoid stale data from paused fingers)
// Store ring buffer of last 3 positions with timestamps
`

---

## 6. Algorithm Details

### 6.1 Pan Algorithm

`javascript
// Pan moves camera + target together on XY plane
// Speed proportional to zoom level (closer = slower pan per pixel)
applyPan(dx, dy) {
    const zoomFactor = camera.position.z / 1000; // normalize to reference distance
    const panSpeed = zoomFactor * 2.0;
    camera.position.x -= dx * panSpeed;
    camera.position.y += dy * panSpeed;  // Y inverted (screen vs world)
    target.x -= dx * panSpeed;
    target.y += dy * panSpeed;
}
`

### 6.2 Zoom Algorithm (Pinch-to-Zoom centered on midpoint)

`javascript
// Zoom toward/away from pointer position (not screen center)
applyZoom(scaleDelta, screenCenterX, screenCenterY) {
    // Convert screen point to world XY at camera.z
    const worldPoint = screenToWorld(screenCenterX, screenCenterY);

    // Compute new Z
    const newZ = clamp(camera.position.z / scaleDelta, minDistance, maxDistance);
    const zoomRatio = newZ / camera.position.z;

    // Shift camera XY to keep worldPoint stationary on screen
    camera.position.x += (worldPoint.x - camera.position.x) * (1 - zoomRatio);
    camera.position.y += (worldPoint.y - camera.position.y) * (1 - zoomRatio);
    target.x += (worldPoint.x - target.x) * (1 - zoomRatio);
    target.y += (worldPoint.y - target.y) * (1 - zoomRatio);

    camera.position.z = newZ;
    target.z = 0;  // Target always on z=0 plane (top-down)
}
`

### 6.3 Inertia Algorithm (Exponential Decay)

`javascript
// Called every frame in update():
tick(dt) {
    if (Math.abs(velocityX) < MIN_VELOCITY && Math.abs(velocityY) < MIN_VELOCITY) {
        velocityX = 0; velocityY = 0;
        return { dx: 0, dy: 0, dz: 0 };
    }
    // Exponential decay: v *= friction^dt (frame-rate independent)
    const decay = Math.pow(FRICTION, dt * 60); // normalized to 60fps
    velocityX *= decay;
    velocityY *= decay;
    return { dx: velocityX * dt, dy: velocityY * dt, dz: 0 };
}
// FRICTION = 0.92 (tunable: 0.90 = fast stop, 0.96 = long glide)
// MIN_VELOCITY = 0.1
`

### 6.4 Scroll Wheel Animated Zoom

`javascript
// Each wheel event queues an animated zoom step (not instant)
onWheel(e) {
    const zoomFactor = e.deltaY > 0 ? 1.15 : 0.85;
    const targetZ = clamp(currentTargetZ * zoomFactor, minDistance, maxDistance);
    zoomAnimator.animateTo(targetZ, 250); // 250ms per step, blends with active
}

// ZoomAnimator.tick() returns interpolated Z each frame:
tick(dt) {
    if (!this.active) return null;
    this.elapsed += dt;
    const t = Math.min(this.elapsed / this.duration, 1.0);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    const z = this.startZ + (this.targetZ - this.startZ) * eased;
    if (t >= 1.0) this.active = false;
    return z;
}
`

### 6.5 Double-Tap Zoom-to-Cluster

`javascript
// On double_tap event:
handleDoubleTap(screenX, screenY) {
    const worldPos = screenToWorld(screenX, screenY);
    const cluster = findNearestCluster(worldPos);

    if (cluster) {
        // Zoom to frame cluster (all nodes visible)
        const targetZ = cluster.radius * 2.5;
        zoomAnimator.animateTo(targetZ, 600);
        panAnimator.panTo(cluster.center.x, cluster.center.y, 600);
    } else {
        // Empty space: zoom out 2x
        zoomAnimator.animateTo(camera.position.z * 2.0, 500);
    }
}
`

### 6.6 Node Drag (CLOSE Mode)

`javascript
// On drag_start: raycast hit confirms node, disable pan
// On drag_move: project pointer to XY plane, move node
handleNodeDrag(screenX, screenY, nodeIdx) {
    const worldPos = screenToWorldOnPlane(screenX, screenY, nodeZ);
    const node = nodes[nodeIdx];
    node.x = worldPos.x;
    node.y = worldPos.y;
    // Update connected edges in _animate() loop (not per-event)
    this._dirtyEdges = true;
}
`

---

## 7. Integration Points

### 7.1 Changes to kb-graph-renderer.js init()

`javascript
// REMOVE (lines ~91-104):
// - OrbitControls instantiation
// - Fallback controls creation
// - controls.enableDamping, dampingFactor, etc.

// ADD:
this.controls = new MapControls(this.camera, this.renderer.domElement, {
    minDistance: 1,
    maxDistance: 50000,
    friction: 0.92,
    zoomSpeed: 1.2,
    panSpeed: 2.0,
    onZoomEnd: () => this._updateMode(false),
    onNodeDragStart: (nodeId) => this._startNodeDrag(nodeId),
    onNodeDragMove: (x, y) => this._moveNodeDrag(x, y),
    onNodeDragEnd: () => this._endNodeDrag(),
    onDoubleTap: (x, y) => this._handleDoubleTap(x, y),
    onTap: (x, y) => this._handleTap(x, y),
    raycastNode: (sx, sy) => this._raycastAtScreen(sx, sy),
    getCurrentMode: () => this.currentMode
});
`

### 7.2 Changes to _animate() Loop

`javascript
// BEFORE:
this.controls.update();

// AFTER:
const dt = this._clock ? this._clock.getDelta() : 0.016;
this.controls.update(dt);

// LOD mode check triggered by MapControls.onZoomEnd callback
// (removes the 2-second throttle — now event-driven)
`

### 7.3 New Methods on KBGraphRendererImpl

`javascript
// Node drag support (CLOSE mode only)
_startNodeDrag(nodeId) { /* highlight node, set dragging flag */ }
_moveNodeDrag(worldX, worldY) { /* update node position, mark edges dirty */ }
_endNodeDrag() { /* remove highlight, rebuild edge geometry */ }

// Double-tap zoom
_handleDoubleTap(screenX, screenY) { /* find cluster, animate zoom */ }

// Unified tap (replaces _handleClick for node selection)
_handleTap(screenX, screenY) { /* raycast, select node, dispatch event */ }

// Raycast helper for gesture FSM
_raycastAtScreen(sx, sy) { /* returns nodeId or null */ }
`

### 7.4 Minimap Compatibility

**No changes needed.** The minimap reads enderer.domElement post-render via ctx.drawImage(src, ...). Camera position changes are transparent.

### 7.5 Camera Constraint (Top-Down Lock)

`javascript
// In MapControls.update():
// Lock camera to Z-axis (no tilt/roll)
camera.position.x = target.x;  // cam directly above target
camera.position.y = target.y;
camera.up.set(0, 1, 0);        // Y-up (screen up = world up)
camera.lookAt(target);          // always looking straight down
`

Wait — BRD says "pan moves camera + target together" and "camera on Z-axis". This means:
- camera.position = (targetX, targetY, zoomDistance)
- target = (targetX, targetY, 0)
- Camera always looks down at Z=0 plane

---

## 8. Performance Design

### 8.1 Zero-Allocation Hot Path

| Technique | Where |
|-----------|-------|
| Pre-allocated PointerData objects (pool of 10) | map-controls.js |
| Reuse Vector3 for calculations (no 
ew in tick) | camera-physics.js |
| Event object pooling for GestureEvents | gesture-fsm.js |
| No closures in animation loop | zoom-animator.js |
| { passive: true } on pointermove listener | map-controls.js |
| { passive: false } only on wheel (needs preventDefault) | map-controls.js |

### 8.2 Event Listener Configuration

`javascript
domElement.addEventListener('pointerdown', this._onPointerDown, { passive: true });
domElement.addEventListener('pointermove', this._onPointerMove, { passive: true });
domElement.addEventListener('pointerup', this._onPointerUp, { passive: true });
domElement.addEventListener('pointercancel', this._onPointerUp, { passive: true });
domElement.addEventListener('wheel', this._onWheel, { passive: false }); // need preventDefault
domElement.style.touchAction = 'none'; // disable browser gestures
`

### 8.3 Frame Budget Analysis

| Operation | Budget (ms) | Notes |
|-----------|-------------|-------|
| Pointer event handling | < 1ms | Simple Map lookup + state transition |
| Physics tick (inertia) | < 0.5ms | 3 multiplications + comparison |
| Zoom animator tick | < 0.5ms | 1 lerp calculation |
| Camera update | < 0.1ms | Position + lookAt |
| Total controls overhead | < 2ms | Well within 16ms frame budget |

---

## 9. Error Handling

| Scenario | Handling |
|----------|----------|
| Pointer events not supported | Feature-detect; fall back to mouse events (addEventListener check) |
| Camera z reaches bounds | Clamp to minDistance/maxDistance, zero velocity |
| NaN in velocity (rare touch hardware) | Check isNaN before applying; reset to 0 |
| pointercancel event | Treat same as pointerup; cleanup state |
| Multiple rapid wheel events | Queue blending in ZoomAnimator (latest target wins) |
| Node drag on non-CLOSE mode | GestureStateMachine checks getCurrentMode() before entering DRAG_NODE |

---

## 10. Keyboard Navigation (Accessibility)

Existing keyboard handling remains; MapControls adds:

| Key | Action |
|-----|--------|
| Arrow keys | Pan 50px in direction (via applyPan) |
| +/= | Zoom in one step (animated) |
| -/_ | Zoom out one step (animated) |
| Home | zoomToFit (animated) |
| Escape | Cancel drag / stop inertia |

---

## 11. Implementation Checklist for DEV Agent

### Phase 1: Core Controls (gesture-fsm.js + camera-physics.js)

- [ ] Create gesture-fsm.js with GestureStateMachine class
  - [ ] Implement IDLE → PAN transition (5px threshold)
  - [ ] Implement PAN → IDLE with velocity calculation
  - [ ] Implement IDLE → PINCH (2-pointer detection)
  - [ ] Implement PINCH scale calculation
  - [ ] Implement tap/double-tap detection (300ms timer)
  - [ ] Implement PENDING_DRAG → DRAG_NODE (200ms hold + node hit)
- [ ] Create camera-physics.js with CameraPhysics class
  - [ ] Implement applyPanDelta with zoom-proportional speed
  - [ ] Implement inertia tick with exponential decay
  - [ ] Implement velocity threshold cutoff
  - [ ] Implement bounds clamping

### Phase 2: Zoom Animation (zoom-animator.js)

- [ ] Create zoom-animator.js with ZoomAnimator class
  - [ ] Implement animateTo(targetZ, duration)
  - [ ] Implement tick() with ease-out cubic
  - [ ] Implement queue blending (rapid scroll events)
  - [ ] Implement cancel()

### Phase 3: Orchestrator (map-controls.js)

- [ ] Create map-controls.js with MapControls class
  - [ ] Wire pointer event listeners to domElement
  - [ ] Set 	ouch-action: none on domElement
  - [ ] Implement update(dt) method — tick physics + animator
  - [ ] Implement pan via gesture events
  - [ ] Implement zoom-centered-on-pointer
  - [ ] Implement scroll wheel → ZoomAnimator
  - [ ] Implement camera top-down lock
  - [ ] Implement dispose() — remove all listeners
  - [ ] Expose public API: zoomTo(), panTo(), target getter

### Phase 4: Integration (kb-graph-renderer.js modifications)

- [ ] Remove OrbitControls / fallback controls code
- [ ] Add script tags for new files in HTML
- [ ] Instantiate MapControls in init()
- [ ] Pass delta-time to controls.update() in _animate()
- [ ] Implement _startNodeDrag / _moveNodeDrag / _endNodeDrag
- [ ] Implement _handleDoubleTap (find cluster, animate)
- [ ] Replace _handleClick with tap callback
- [ ] Add _raycastAtScreen helper
- [ ] Update focusNode() to use MapControls.panTo() + zoomTo()
- [ ] Update zoomToFit() to use animated transition
- [ ] Verify minimap still works

### Phase 5: Polish & Testing

- [ ] Tune friction constant (0.92 default, test range 0.90-0.96)
- [ ] Tune pan speed factor
- [ ] Test on touch device (Chrome DevTools touch simulation)
- [ ] Test rapid scroll → smooth animation
- [ ] Test pinch-to-zoom → centered correctly
- [ ] Test node drag in CLOSE mode
- [ ] Test double-tap on cluster vs empty space
- [ ] Verify LOD transitions still trigger correctly
- [ ] Verify 60fps with 2,006 nodes during pan
- [ ] Test keyboard navigation still works

---

## 12. Security Considerations

- No new APIs exposed to outside
- All input is from DOM pointer events (trusted)
- Node repositioning is session-only (no persistence)
- No eval, no dynamic code execution
- No external network calls

---

## 13. Testing Strategy

### 13.1 Unit Tests (manual verification)

| Test | Expected |
|------|----------|
| GestureStateMachine: single tap | Emits 'tap' after 300ms |
| GestureStateMachine: double tap | Emits 'double_tap', no 'tap' |
| GestureStateMachine: pan detection | Emits 'pan_start' after 5px move |
| CameraPhysics: inertia decay | Velocity reaches 0 within ~60 frames at friction=0.92 |
| CameraPhysics: bounds | Camera z never exceeds min/max |
| ZoomAnimator: ease-out | Z reaches target within duration ±1 frame |

### 13.2 Integration Tests (browser console)

`javascript
// Test pan:
// 1. Drag with mouse → view pans, no rotation
// 2. Release mid-drag → inertia continues

// Test zoom:
// 3. Scroll wheel → smooth animation
// 4. Pinch on touch → centered on midpoint

// Test LOD:
// 5. Zoom from FAR to CLOSE → modes transition correctly
`

### 13.3 Performance Benchmark

`javascript
// In console after loading graph:
const start = performance.now();
for (let i = 0; i < 1000; i++) {
    renderer.controls.update(0.016);
}
console.log('1000 ticks:', performance.now() - start, 'ms');
// Target: < 500ms (= 0.5ms per tick)
`

---

## Appendix A: Pointer Events API Reference

| Event | When | Key Properties |
|-------|------|----------------|
| pointerdown | Finger/mouse press | pointerId, clientX, clientY, pointerType |
| pointermove | Finger/mouse move | pointerId, clientX, clientY |
| pointerup | Finger/mouse release | pointerId |
| pointercancel | System cancels (e.g., palm rejection) | pointerId |

domElement.setPointerCapture(pointerId) ensures pointermove/up events continue even if pointer leaves element.

---

## Appendix B: Constants & Tunables

| Constant | Value | Location | Description |
|----------|-------|----------|-------------|
| FRICTION | 0.92 | camera-physics.js | Inertia decay rate per frame |
| MIN_VELOCITY | 0.1 | camera-physics.js | Velocity cutoff threshold |
| PAN_THRESHOLD | 5 | gesture-fsm.js | Pixels before pan starts |
| TAP_MAX_DURATION | 200 | gesture-fsm.js | Max ms for tap (vs hold) |
| DOUBLE_TAP_WINDOW | 300 | gesture-fsm.js | Max ms between taps for double-tap |
| DOUBLE_TAP_RADIUS | 20 | gesture-fsm.js | Max px distance between two taps |
| DRAG_HOLD_TIME | 200 | gesture-fsm.js | Hold duration before drag starts |
| ZOOM_ANIM_DURATION | 250 | zoom-animator.js | Default zoom animation ms |
| DOUBLE_TAP_ZOOM_DURATION | 600 | zoom-animator.js | Double-tap zoom-to animation ms |
| WHEEL_ZOOM_FACTOR | 1.15 | map-controls.js | Zoom per wheel notch |
| PAN_SPEED | 2.0 | map-controls.js | Pan speed multiplier |
| MIN_DISTANCE | 1 | map-controls.js | Camera min Z |
| MAX_DISTANCE | 50000 | map-controls.js | Camera max Z |

---

## Appendix C: Requirements Traceability

| BRD Requirement | TDD Section |
|----------------|-------------|
| US-1: Pinch-to-zoom | §6.2 Zoom Algorithm, §5.1 PINCH state |
| US-2: Pan as default drag | §6.1 Pan Algorithm, §5.1 PAN state |
| US-3: Inertial scrolling | §6.3 Inertia Algorithm |
| US-4: Double-tap zoom | §6.5 Double-Tap Zoom-to-Cluster |
| US-5: Node drag (CLOSE mode) | §6.6 Node Drag, §5.1 DRAG_NODE state |
| US-6: Smooth zoom animation | §6.4 Scroll Wheel Animated Zoom |
| NFR-1: 60fps | §8 Performance Design |
| NFR-9: Separate class | §3 File Structure |
| NFR-10: No dependencies | §1.2 Design Principles |
| TC-1: Pointer Events API | §8.2 Event Listener Configuration |
| TC-2: Replace OrbitControls | §7.1 Changes to init() |
| TC-3: Camera Z-axis lock | §7.5 Camera Constraint |
| TC-4: LOD integration | §7.2 Changes to _animate() |
| TC-5: Raycaster integration | §7.3 New Methods (_raycastAtScreen) |
| TC-6: Minimap compatibility | §7.4 Minimap Compatibility |
| TC-7: Vanilla JavaScript | §1.2 Design Principles |
| TC-8: < 200 lines per file | §3.1 File Structure |
