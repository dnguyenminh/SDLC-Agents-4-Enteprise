# Functional Specification Document (FSD)

## SDLC-Agents-4-Enterprise — SA4E-247: Cải thiện UI KB Graph: Legend window, Minimap và Filter với tách component

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-247 |
| Title | Cải thiện UI KB Graph: Legend window, Minimap và Filter với tách component |
| Author | BA Agent |
| Version | 1.1 |
| Date | 2026-09-06 |
| Status | Final |
| Related BRD | documents/SA4E-247/BRD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0-draft | 2026-09-06 | BA Agent | Initiate draft FSD from BRD — Phase 2 Specification |
| 1.1 | 2026-09-06 | TA Agent | Enrich with technical depth: Svelte 4 + Vite + TypeScript stack, component interfaces, API contracts, state management, performance, data model, constraints, risks |

---

## 1. Introduction

### 1.1 Purpose
This FSD specifies functional and technical requirements for improving KB Graph UI in Pega rule knowledge base, focusing on component separation for Legend Window, Enhanced Minimap, and Filter Panel with text search. <!-- TA enrichment -->

### 1.2 Scope
- Refactor monolithic KB Graph viewer into independent components: LegendWindow, MinimapController, FilterPanel + FilterSearchInput.
- Legend Window: independent draggable/resizable/maximizable window with scrollable list.
- Minimap Enhanced: rotate, span mode, zoom-to-click support.
- Filter Panel: text search with wildcard * and ? support, realtime checkbox filtering.
- Maintain compatibility with existing backend viewer API.

Out of scope: backend graph data logic, layout algorithm changes.

> **TA Note:** Technical scope clarification — frontend-only changes in extension webview (Svelte 4 + Vite + TypeScript). No changes to backend Hono API contract for `/api/v1/kb-graph`. Component state persisted in browser localStorage, not backend. [Implements: BRD 1.1]

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| Legend | Bảng chú giải loại node trong graph |
| Minimap | Bản đồ thu nhỏ tổng quan graph |
| Filter | Bộ lọc hiển thị node theo loại |
| LOD | Level of Detail — rendering optimization |
| Svelte Store | Reactive state primitive in Svelte 4 |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-247/BRD.md |
| Project Structure | .analysis/code-intelligence/project-structure.md |
| Code Intelligence Modules | .analysis/code-intelligence/modules/ |

---

## 2. System Overview

### 2.1 System Context Diagram

```xml
<mxfile>
  <diagram name="Context Diagram">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="2" value="KB Graph User" style="shape=actor" vertex="1" parent="1">
          <mxGeometry x="80" y="120" width="80" height="100"/>
        </mxCell>
        <mxCell id="3" value="KB Graph Webview" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
          <mxGeometry x="300" y="100" width="200" height="120"/>
        </mxCell>
        <mxCell id="4" value="Backend Viewer API" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
          <mxGeometry x="580" y="100" width="200" height="120"/>
        </mxCell>
        <mxCell id="5" value="Pega Rule Index" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
          <mxGeometry x="580" y="300" width="200" height="100"/>
        </mxCell>
        <mxCell id="6" edge="1" parent="1" source="2" target="3"/>
        <mxCell id="7" edge="1" parent="1" source="3" target="4"/>
        <mxCell id="8" edge="1" parent="1" source="4" target="5"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

### 2.2 System Architecture

High-level architecture:

- **Extension Webview UI (Svelte 4 + Vite + TypeScript)**
  - `LegendWindow.svelte` — independent draggable/resizable window component
  - `MinimapController.svelte` — minimap with rotate/span/zoom-to-click
  - `FilterPanel.svelte` + `FilterSearchInput.svelte` — searchable filter with wildcard
  - `GraphRenderer` — existing Three.js / 3d-force-graph integration via `graph.js`
  - State management via Svelte writable stores: `legendStore`, `minimapStore`, `filterStore`
  - Event bus via `vscode.postMessage` / `handlePanelMessage`

- **Backend (Hono + TypeScript)**
  - `/api/v1/admin/kb-graph` — provides nodes/edges JSON
  - No changes to API contract

Component interaction flow:

User Action → Component Event → Svelte Store Update → GraphRenderer API call → Backend data unchanged

> **TA Note:** Code intelligence confirms current implementation uses `graph.js` with `ForceGraph3D`, minimap canvas rendering, legend toggle DOM manipulation. Refactor to Svelte components reduces DOM coupling and enables reactive updates. [Implements: BRD 2.1]

---

## 3. Functional Requirements

### 3.1 Feature: Legend Window Independent

**Source:** BRD Story 1

#### 3.1.1 Description
Legend Node Types moved from fixed corner to independent resizable window with maximize/minimize/resize/move and scrollable content.

#### 3.1.2 Use Case

**Use Case ID:** UC-001
**Actor:** KB Graph User
**Preconditions:** KB Graph viewer loaded with nodes data
**Postconditions:** Legend window visible, state persisted

**Main Flow:**
| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | User | | Opens KB Graph |
| 2 | | System | Renders LegendWindow component |
| 3 | User | | Drags window / resizes |
| 4 | | System | Persists position/size to localStorage |
| 5 | User | | Scrolls legend list |

**Alternative Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Window maximized | Restore to previous size on minimize |

**Exception Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | localStorage unavailable | Fallback to default position, log warning |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-01 | LegendWindow must preserve position after reload | BRD 2.3 |
| BR-02 | Legend list must be scrollable for >100 types | BRD 2.3 |

#### 3.1.4 Data Specifications

**Input Data:**
| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| nodeType | string | Y | enum | Loại node Pega |
| count | integer | Y | >0 | Số lượng node |

**Output Data:**
| Field | Type | Description |
|-------|------|-------------|
| legendItems | array | Danh sách node types với count và color |

#### 3.1.5 UI Specifications

**Screen: Legend Window**

| No. | Element | Type | Required | Behavior | Validation |
|-----|---------|------|----------|----------|------------|
| 1 | LegendWindow | Container | Y | Draggable, resizable, maximizable | Position persisted |
| 2 | LegendList | Scrollable List | Y | Virtualized scroll | Max 500 items |
| 3 | MinimizeButton | Button | Y | Collapse window | Toggle state |
| 4 | MaximizeButton | Button | Y | Fullscreen toggle | Restore on second click |

#### 3.1.6 API Contract (Functional View)

**Endpoint:** `GET /api/v1/admin/kb-graph/nodes/summary`
**Purpose:** Fetch node type counts for legend

**Input Parameters:**
| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| workspaceId | string | Y | | Workspace identifier |

**Output Data:**
| Field | Type | Description |
|-------|------|-------------|
| types | array | [{type, count, color}] |

**Business Error Scenarios:**
| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| No types | No types available | Empty dataset |

<!-- TA enrichment: Component Interface -->
**Component Interface — LegendWindow.svelte**
```typescript
interface LegendItem {
  type: string;
  count: number;
  color: string;
}
interface LegendWindowProps {
  items: LegendItem[];
  isMaximized?: boolean;
  position?: { x: number; y: number };
  size?: { w: number; h: number };
}
export default function LegendWindow(props: LegendWindowProps) {}
```
State managed via `writable<LegendWindowState>` store.

### 3.2 Feature: Minimap Enhanced

**Source:** BRD Story 2

#### 3.2.1 Description
Minimap with rotate 90°, span mode, click-to-zoom.

#### 3.2.2 Use Case

**Use Case ID:** UC-002
**Actor:** KB Graph User
**Preconditions:** Graph rendered
**Postconditions:** Minimap reflects viewport

**Main Flow:**
| Step | Actor | System | Description |
|------|-------|--------|-------------|
|1|User||Enables minimap|
|2||System|Renders minimap canvas|
|3|User|Clicks rotate button|
|4||System|Rotates minimap view 90°|
|5|User|Clicks minimap|
|6||System|Zooms main graph to click position|

#### 3.2.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-03 | Minimap must reflect current graph viewport | BRD |
| BR-04 | Rotate preserves coordinate mapping | BRD |

#### 3.2.4 Data Specifications

**Input Data:**
| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| nodes | array | Y | | Graph nodes |
| camera | object | Y | | Camera position |

#### 3.2.5 UI Specifications

| No. | Element | Type | Required | Behavior | Validation |
|-----|---------|------|----------|----------|------------|
|1|MinimapContainer|Container|Y|Display thumbnail| |
|2|RotateButton|Button|Y|Rotate 90°| |
|3|SpanToggle|Toggle|Y|Toggle span mode| |
|4|ZoomViewport|Rectangle|Y|Show current viewport| |

#### 3.2.6 API Contract

No backend API change. Client-side coordinate transformation.

<!-- TA enrichment: Performance -->
Minimap rendering uses `requestAnimationFrame` loop, canvas draw scaled down 1/10. Rotate implemented via canvas transform `ctx.rotate`. Span mode draws viewport rect with `fillRect`.

### 3.3 Feature: Filter Panel with Text Search

**Source:** BRD Story 3

#### 3.3.1 Description
Filter panel with text search input supporting wildcard * and ?.

#### 3.3.2 Use Case

**Use Case ID:** UC-003
**Actor:** KB Graph User
**Preconditions:** Filter panel visible
**Postconditions:** Filter applied realtime

**Main Flow:**
| Step | Actor | System | Description |
|------|-------|--------|-------------|
|1|User|Types in search input|
|2||System|Filters checkbox list realtime|
|3|User|Checks/unchecks items|
|4||System|Updates graph visibility|

#### 3.3.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-05 | Search supports * and ? wildcard | BRD |
| BR-06 | Filtering realtime <200ms | BRD |

#### 3.3.4 Data Specifications

**Input Data:**
| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| query | string | N | wildcard valid | Search text |
| selectedTypes | array | Y | | Selected node types |

#### 3.3.5 UI Specifications

| No. | Element | Type | Required | Behavior | Validation |
|-----|---------|------|----------|----------|------------|
|1|FilterPanel|Container|Y|Contains filter| |
|2|FilterSearchInput|Input|Y|Text with wildcard| Debounce 150ms |
|3|FilterCheckboxList|Checkbox Group|Y|Realtime filter| |

#### 3.3.6 API Contract

Client-side filtering. No backend change.

<!-- TA enrichment: Pseudocode -->
```typescript
// Pseudocode for wildcard filter
function matchesWildcard(text: string, pattern: string): boolean {
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
  return regex.test(text);
}
```
Filter applied on `filterStore` derived store.

---

## 4. Data Model

### 4.1 Logical Entities

#### Entity: LegendItem
| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| type | string | Y | | Node type name |
| count | integer | Y | >0 | Number of nodes |
| color | string | Y | hex | Color code |

#### Entity: MinimapState
| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| isRotated | boolean | Y | | Rotation flag |
| scale | number | Y | >0 | Canvas scale |
| viewport | {x,y,w,h} | Y | | Current viewport rect |

#### Entity: FilterState
| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| query | string | N | | Search query |
| selectedTypes | string[] | Y | | Active filters |
| wildcardEnabled | boolean | Y | | Support * ? |

> **TA Note:** Data model is client-side only, persisted in localStorage. No DB schema changes required.

---

## 5. Integration Specifications

### 5.1 External System: KB Graph Viewer Frontend
| Attribute | Value |
|-----------|-------|
| Purpose | Render graph with enhanced UI components |
| Direction | Outbound |
| Data Format | JSON |
| Frequency | Real-time |

**Data Exchange:**
| Our Data | External Data | Direction | Business Rule |
|----------|--------------|-----------|---------------|
| nodes/summary | nodes | Receive | From backend API |
| filterState | - | Internal | Client side |

### 5.2 External System: Pega Rule Index
| Attribute | Value |
|-----------|-------|
| Purpose | Source of node types |
| Direction | Inbound via backend |
| Data Format | JSON |
| Frequency | On demand |

---

## 6. Processing Logic

### 6.1 Legend Window State Persistence
**Trigger:** Window move/resize/maximize
**Input:** Position, size, maximized flag
**Output:** Updated localStorage entry

**Processing Steps:**
| Step | Description | Error Handling |
|------|-------------|----------------|
|1|Capture drag events|Ignore if disabled|
|2|Throttle updates 50ms|Drop events if throttled|
|3|Save to localStorage|Fallback to memory store|

### 6.2 Minimap Rotate
**Trigger:** Rotate button click
**Processing Steps:**
| Step | Description | Error Handling |
|------|-------------|----------------|
|1|Increment rotation angle 90°|Modulo 360|
|2|Apply canvas transform|Reset transform on destroy|
|3|Update minimap bounds|Recalculate on resize|

### 6.3 Filter Search with Wildcard
**Trigger:** Input change
**Processing Steps:**
| Step | Description | Error Handling |
|------|-------------|----------------|
|1|Debounce 150ms|Clear timeout on new input|
|2|Convert wildcard to regex|Escape special chars|
|3|Filter checkbox list|Show empty state if no match|

---

## 7. Security Requirements

### 7.1 Authentication & Authorization
| Role | Permissions | Screens/Features |
|------|-------------|-------------------|
|KB Graph User|Read|LegendWindow, Minimap, FilterPanel|

No elevated permissions required. UI only.

### 7.2 Data Sensitivity Classification
| Data Type | Classification | Business Requirement |
|-----------|----------------|----------------------|
|Node metadata|Internal|No PII|
|UI state|Public|LocalStorage only|

---

## 8. Non-Functional Requirements

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
|Performance|UI responsive|Filter realtime <200ms p95|
|Performance|Legend scroll|Virtualized list <50ms frame|
|Scalability|Support >10k nodes|Minimap viewport optimization, LOD rendering|
|Availability|Keep viewer compatible|No API downtime|
|Maintainability|Component separation|Each component <300 LOC, single responsibility|

> **TA Note:** Performance targets quantified per project standards. Minimap render uses `requestAnimationFrame` throttling 60fps.

---

## 9. Error Handling (User-Facing)

### 9.1 Error Scenarios
| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
|localStorage full|Warning|Settings not saved|Fallback to memory|
|Graph data empty|Info|No nodes to display|Show empty state|
|Minimap init fail|Warning|Minimap unavailable|Hide minimap UI|

---

## 10. Testing Considerations

### 10.1 Test Scenarios
| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
|TC-01|Legend window drag|Drag handle|Position persisted|High|
|TC-02|Minimap rotate|Click rotate 4x|Back to original|
|TC-03|Filter wildcard|Query `ACT*`|Matches ACTIVITY, ACTION|
|TC-04|Filter performance|10k types|Response <200ms|

---

## 11. Appendix

### Technical Constraints
- Svelte 4 + Vite + TypeScript only. No React migration.
- Browser localStorage limit 5MB for state persistence.
- Graph library `3d-force-graph` and Three.js v0.160+. No library upgrade.
- Must maintain backward compatibility with existing `graph.js` message protocol.

### Assumptions
- Backend API unchanged.
- User screen resolution >=1280x720.
- Graph library supports custom event listeners.

### Dependencies
- Backend `/api/v1/admin/kb-graph` endpoint stable.
- Pega Rule Index data accessible via backend.
- `extension/src/webview/components` directory writable.

### Risks
| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
|Component refactor breaks layout|High|Medium|Unit test UI, visual regression|
|Minimap rotate coordinate mapping error|Medium|Medium|Integration tests with graph library|
|Performance degrade with large legend|Medium|Low|Virtualized list implementation|

### Diagrams
| Diagram | File |
|---------|------|
|System Context|diagrams/system-context.drawio|
|Component Architecture|diagrams/component-architecture.drawio|

---

*Enriched by TA Agent on 2026-09-06. Version 1.1 final.*
