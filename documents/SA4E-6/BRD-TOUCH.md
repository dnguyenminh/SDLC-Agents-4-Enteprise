# Business Requirements Document (BRD) - Sub-Feature

## SA4E-6 Enhancement: KB Graph Touch & Map-like Navigation

---

## Document Information

| Field | Value |
|-------|-------|
| Parent Ticket | SA4E-6 |
| Title | KB Graph Touch & Map-like Navigation |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-07-04 |
| Status | Draft |
| Type | Enhancement (UI/UX) |
| Parent BRD | BRD-v1-SA4E-6.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-04 | BA Agent | Initial document - KB Graph navigation enhancement |

---

## 1. Introduction

### 1.1 Purpose

This sub-BRD documents the requirements for enhancing the KB Graph visualization (Admin Portal > KB Graph tab) with touch-friendly, map-like navigation behavior. The current OrbitControls-based interaction model uses 3D orbital rotation as the primary mouse-drag action, which is unintuitive for users accustomed to 2D map interfaces (Google Maps, Figma canvas).

### 1.2 Scope

Transform the KB Graph camera controls from a 3D orbit model to a 2D pan-first model with:
- Touch device support (pinch-to-zoom, 2-finger pan, tap gestures)
- Pan as default drag action (instead of rotate)
- Inertial scrolling with momentum/deceleration
- Double-tap/click zoom-to-cluster
- Drag-and-drop node repositioning in CLOSE mode
- Smooth animated zoom transitions

### 1.3 Out of Scope

- 3D rotation (orbital rotation is fully removed - the graph is viewed top-down only)
- Multi-finger rotation gestures (3-finger rotate)
- Mobile-specific UI layout changes (responsive breakpoints)
- Node content editing via touch
- New LOD levels or clustering algorithm changes
- Backend API changes

### 1.4 Current State

| Aspect | Current Behavior |
|--------|-----------------|
| Camera Control | Three.js OrbitControls - left-drag rotates, scroll zooms |
| Touch Support | None (OrbitControls has basic touch but not optimized) |
| Pan | Middle-mouse or Ctrl+drag only |
| Zoom Animation | Instant (no transition) |
| Inertia | OrbitControls damping only (dampingFactor=0.05) |
| Node Drag | Not supported |
| Double-click | Not handled |
| Graph Size | ~2,006 nodes (271 KB + ~63,129 Code entities) |
| Rendering | Three.js WebGL - Points (FAR), InstancedMesh (MID), Spheres (CLOSE) |
| File | backend/src/viewer/admin/kb-graph-renderer.js |

### 1.5 Affected Files

| File | Role |
|------|------|
| backend/src/viewer/admin/kb-graph-renderer.js | Main renderer - controls, raycasting, animation loop |
| backend/src/viewer/admin/lod-manager.js | LOD distance thresholds & mode switching |
| backend/src/viewer/admin/lod-clustering.js | Cluster grouping logic |
| backend/src/viewer/admin/lod-animation.js | Transition animations between LOD modes |

---

## 2. Business Requirements

### 2.1 User Stories

#### US-1: Touch Pinch-to-Zoom

**As a** user viewing the KB Graph on a touch device (tablet, touch laptop),
**I want** to pinch with two fingers to zoom in/out,
**so that** I can explore the graph naturally without needing a mouse scroll wheel.

**Acceptance Criteria:**

| # | Criterion |
|---|-----------|
| AC-1.1 | Two-finger pinch gesture zooms camera in/out |
| AC-1.2 | Zoom center point is the midpoint between the two touch points (not screen center) |
| AC-1.3 | Zoom speed feels proportional to pinch distance delta |
| AC-1.4 | Zoom respects existing min/max distance constraints (1 to 50,000) |
| AC-1.5 | LOD mode transitions (FAR>MID>CLOSE) trigger correctly during pinch zoom |

---

#### US-2: Pan as Default Drag

**As a** user navigating the KB Graph,
**I want** left-click drag (or single-finger touch drag) to pan the view,
**so that** navigation feels like a map (Google Maps) rather than a 3D model viewer.

**Acceptance Criteria:**

| # | Criterion |
|---|-----------|
| AC-2.1 | Left-click + drag translates the camera (pan), NOT rotate |
| AC-2.2 | Single-finger touch drag translates the camera (pan) |
| AC-2.3 | Two-finger touch drag also pans (consistent with pinch gesture starting position) |
| AC-2.4 | Pan movement direction matches finger/mouse direction (drag right = view moves right) |
| AC-2.5 | Pan speed is proportional to current zoom level (closer zoom = slower pan per pixel) |
| AC-2.6 | Orbital rotation is completely removed - graph is viewed from top-down perspective only |
| AC-2.7 | Camera up vector is locked (no tilt/roll) |

---

#### US-3: Inertial Scrolling (Momentum)

**As a** user panning or zooming the graph,
**I want** the view to continue moving with decreasing velocity after I release,
**so that** navigation feels smooth and fluid (like iOS scroll physics).

**Acceptance Criteria:**

| # | Criterion |
|---|-----------|
| AC-3.1 | After releasing a pan gesture, camera continues moving in the same direction with decelerating velocity |
| AC-3.2 | Deceleration follows exponential decay (velocity *= friction each frame, friction ~ 0.92-0.95) |
| AC-3.3 | Inertia stops when velocity drops below threshold (< 0.1 units/frame) |
| AC-3.4 | Starting a new pan gesture immediately cancels any active inertia |
| AC-3.5 | Inertia also applies to pinch-zoom (zoom continues with momentum after release) |
| AC-3.6 | Inertia respects camera bounds (min/max distance for zoom) |

---

#### US-4: Double-tap/Click Zoom-to-Cluster

**As a** user exploring the KB Graph,
**I want** to double-click (or double-tap) on a cluster to smoothly zoom into it,
**so that** I can quickly drill into areas of interest without manual pinch/scroll.

**Acceptance Criteria:**

| # | Criterion |
|---|-----------|
| AC-4.1 | Double-click on a cluster zooms camera to frame the cluster (all cluster nodes visible) |
| AC-4.2 | Double-tap on touch devices triggers the same behavior |
| AC-4.3 | Zoom transition is animated (smooth ease-out over 500-800ms) |
| AC-4.4 | If already zoomed into the cluster, double-click zooms back out to previous level |
| AC-4.5 | Double-click on empty space zooms out one level (2x current distance) |
| AC-4.6 | Double-click detection uses 300ms threshold between taps |
| AC-4.7 | Single-click/tap still selects nodes (no conflict with double-click) |

---

#### US-5: Drag-and-Drop Nodes (CLOSE Mode)

**As a** user viewing the graph in CLOSE mode (individual spheres visible),
**I want** to drag nodes to reposition them,
**so that** I can manually organize the layout for better readability.

**Acceptance Criteria:**

| # | Criterion |
|---|-----------|
| AC-5.1 | In CLOSE mode, clicking and holding a node for 200ms+ initiates drag mode |
| AC-5.2 | While dragging, the node follows the cursor/finger on the XY plane |
| AC-5.3 | Dragging a node does NOT trigger camera pan (gesture disambiguation) |
| AC-5.4 | Connected edges update in real-time during drag |
| AC-5.5 | On release, the node stays at the new position |
| AC-5.6 | Node positions are NOT persisted to backend (session-only repositioning) |
| AC-5.7 | Drag is only available in CLOSE mode (FAR/MID modes: nodes are too small to target) |
| AC-5.8 | Touch: long-press (300ms) initiates drag on touch devices |
| AC-5.9 | Visual feedback: dragged node has a subtle glow/scale-up effect |

---

#### US-6: Smooth Zoom Animation

**As a** user zooming via scroll wheel, pinch, or programmatic zoom (focusNode, zoomToFit),
**I want** zoom transitions to be smoothly animated,
**so that** I maintain spatial orientation during zoom level changes.

**Acceptance Criteria:**

| # | Criterion |
|---|-----------|
| AC-6.1 | Scroll wheel zoom uses animated interpolation (lerp to target distance) instead of instant jump |
| AC-6.2 | Animation duration is 200-400ms per scroll step |
| AC-6.3 | Multiple rapid scroll events queue/blend smoothly (no stutter) |
| AC-6.4 | focusNode(id) animates camera to the target node position (not instant teleport) |
| AC-6.5 | zoomToFit() animates camera to fit all nodes (not instant) |
| AC-6.6 | Animation uses ease-out curve (fast start, gentle deceleration) |
| AC-6.7 | LOD mode transitions triggered during animation are deferred until animation completes |

---

### 2.2 Gesture Disambiguation Matrix

| Input | Action | Priority |
|-------|--------|----------|
| Single-finger drag | Pan camera | Default |
| Two-finger drag | Pan camera | Default |
| Two-finger pinch | Zoom in/out | Overrides pan if distance changes > 5px |
| Single tap | Select node (if hit) | - |
| Double tap | Zoom-to-cluster / zoom out | 300ms delay after first tap |
| Long press (300ms) + drag | Drag node (CLOSE mode only) | Overrides pan |
| Scroll wheel | Animated zoom | - |
| Double-click | Zoom-to-cluster / zoom out | - |
| Left-click + drag | Pan camera | Default |
| Left-click on node | Select node | - |

---

## 3. Non-Functional Requirements

| # | Category | Requirement |
|---|----------|-------------|
| NFR-1 | Performance | Pan/zoom must maintain 60fps with 2,006 nodes rendered |
| NFR-2 | Performance | Touch event handling latency < 16ms (one frame budget) |
| NFR-3 | Performance | Inertia animation must not cause GC pauses (no allocations in animation loop) |
| NFR-4 | Compatibility | Must work on Chrome, Firefox, Edge (latest 2 versions) |
| NFR-5 | Compatibility | Touch support must work on Windows touch laptops, iPads (Safari), Android tablets (Chrome) |
| NFR-6 | Accessibility | Keyboard navigation must still work (arrow keys for pan, +/- for zoom) |
| NFR-7 | UX | Gesture transitions must feel responsive (< 50ms from input to visual feedback) |
| NFR-8 | UX | Inertia deceleration must feel natural - not too fast (jarring), not too slow (sluggish) |
| NFR-9 | Maintainability | New control system must be a separate class (not inline in kb-graph-renderer.js) |
| NFR-10 | Bundle Size | No new external dependencies - implement controls from scratch using native Pointer Events API |

---

## 4. Technical Constraints

| # | Constraint | Rationale |
|---|-----------|-----------|
| TC-1 | Must use Pointer Events API (not Touch Events) | Unified handling for mouse + touch + pen; better browser support |
| TC-2 | Must replace OrbitControls entirely | OrbitControls fights with custom gesture handling; clean replacement needed |
| TC-3 | Camera must stay on Z-axis (top-down view) | Map-like navigation is 2D; rotation would break the mental model |
| TC-4 | Must integrate with existing LOD system | LOD mode switching based on camera distance must continue working |
| TC-5 | Must integrate with existing raycaster | Node selection via raycasting must continue working |
| TC-6 | Must not break minimap rendering | Minimap captures renderer output post-frame |
| TC-7 | Vanilla JavaScript only | No TypeScript, no framework - matches existing codebase |
| TC-8 | File size < 200 lines per module | Per project code standards |

---

## 5. Dependencies

| # | Dependency | Type | Impact |
|---|-----------|------|--------|
| DEP-1 | Three.js (existing) | Library | Camera, Vector3, Raycaster APIs used for pan/zoom math |
| DEP-2 | LOD Manager (existing) | Module | Must call _updateMode() after zoom animations complete |
| DEP-3 | LOD Animation (existing) | Module | Smooth LOD transitions must not conflict with zoom animations |
| DEP-4 | Raycaster (existing) | Feature | Node hit-testing for tap-select, double-tap target, drag initiation |
| DEP-5 | Pointer Events API | Browser | Required for unified touch/mouse handling |

---

## 6. Risks & Assumptions

### Risks

| # | Risk | Probability | Impact | Mitigation |
|---|------|-------------|--------|------------|
| R-1 | Gesture disambiguation (tap vs pan vs drag) causes input lag | Medium | High | Use 200ms hold threshold; cancel tap if movement > 5px |
| R-2 | Inertia animation conflicts with LOD mode switching | Low | Medium | Defer LOD check until inertia velocity < threshold |
| R-3 | Node drag in CLOSE mode creates unexpected UX with edge updates | Low | Low | Update edges in requestAnimationFrame, not per pointer event |
| R-4 | Double-tap detection delay (300ms) makes single-tap feel slow | Medium | Medium | Implement tap-highlight immediately, delay select action |
| R-5 | Performance degradation on low-end touch devices | Low | Medium | Use passive event listeners; debounce position updates |

### Assumptions

| # | Assumption |
|---|-----------|
| A-1 | The graph is best viewed top-down (2D pan) - users do not need orbital rotation |
| A-2 | Pointer Events API is available in all target browsers |
| A-3 | Node drag positions are session-only (no persistence needed for MVP) |
| A-4 | Existing LOD thresholds remain unchanged (only the interaction model changes) |
| A-5 | The fallback controls code in kb-graph-renderer.js will be removed entirely |

---

## 7. Proposed Architecture (High-Level)

### New Module: map-controls.js

A custom camera controller replacing OrbitControls + fallback controls:

| Responsibility | Description |
|---------------|-------------|
| Pointer tracking | Track active pointers (Map of pointerId to x, y, timestamp) |
| Pan | Translate camera.position and controls.target on XY plane |
| Zoom | Adjust camera Z position toward/away from pointer midpoint |
| Inertia | Maintain velocity vector; apply friction per frame |
| Zoom animation | Lerp camera.position.z toward target distance |
| Gesture state machine | States: IDLE, PAN, PINCH, DRAG_NODE |

### Integration Points

In kb-graph-renderer.js init() method:
- REMOVE: OrbitControls / fallback controls setup
- ADD: new MapControls(camera, renderer.domElement, options)
- Hook events: zoom-end triggers _updateMode(), node-drag triggers _moveNode()
- Call .update() in _animate() loop

---

## 8. Success Metrics

| # | Metric | Target |
|---|--------|--------|
| SM-1 | Frame rate during pan on 2,006 node graph | >= 55 fps (avg) |
| SM-2 | Touch gesture recognition accuracy | > 95% correct gesture classification |
| SM-3 | Time from touch to visual feedback | < 50ms |
| SM-4 | Zoom animation smoothness | No visible frame drops during transition |
| SM-5 | User satisfaction (qualitative) | Feels like Google Maps |

---

## 9. Acceptance Test Scenarios

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| ATS-1 | Pan with mouse | Left-click + drag right | View pans right, no rotation |
| ATS-2 | Pan with touch | Single-finger drag | View pans matching finger direction |
| ATS-3 | Pinch zoom | Two fingers pinch inward | View zooms out, centered on pinch midpoint |
| ATS-4 | Zoom inertia | Pinch quickly and release | Zoom continues with momentum, then stops |
| ATS-5 | Pan inertia | Flick pan and release | View continues panning with deceleration |
| ATS-6 | Double-click cluster | Double-click on a cluster group | Camera animates to frame the cluster |
| ATS-7 | Double-click empty | Double-click on empty space | Camera zooms out one level smoothly |
| ATS-8 | Node drag | In CLOSE mode, long-press node + drag | Node moves, edges follow, camera doesn't pan |
| ATS-9 | Select node | Single tap on node | Node selected, detail panel updates |
| ATS-10 | Smooth scroll zoom | Scroll wheel 3 notches rapidly | Camera zooms smoothly without stutter |
| ATS-11 | focusNode animation | Call focusNode('some-id') | Camera animates to node position |
| ATS-12 | LOD during zoom | Zoom from FAR to CLOSE | LOD transitions trigger at correct distances |

---

## Appendix

### Glossary

| Term | Definition |
|------|-----------|
| OrbitControls | Three.js camera controller that orbits around a target point (rotate, pan, zoom) |
| Pointer Events | W3C API unifying mouse, touch, and pen input into single event stream |
| Inertia | Physics-based momentum after gesture release: velocity decays over time |
| LOD (Level of Detail) | Rendering optimization: show less detail for distant objects, more for close objects |
| Pinch-to-zoom | Two-finger gesture where spreading fingers apart zooms in, bringing together zooms out |
| MapControls | Proposed custom controller implementing map-like 2D navigation |
| Gesture State Machine | Logic that classifies pointer inputs into discrete gesture types (pan, pinch, drag, tap) |

### Reference Documents

| Document | Description |
|----------|-------------|
| BRD-v1-SA4E-6.docx | Parent BRD for SA4E-6 |
| Pointer Events API (MDN) | https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events |
| Google Maps gesture model | https://developers.google.com/maps/documentation/javascript/interaction |
| kb-graph-renderer.js | Current implementation at backend/src/viewer/admin/ |
