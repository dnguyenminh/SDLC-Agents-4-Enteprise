# Software Test Cases (STC)

## SDLC-Agents-4-Enterprise — SA4E-247: Cải thiện UI KB Graph: Legend window, Minimap và Filter với tách component

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-247 |
| Title | Cải thiện UI KB Graph: Legend window, Minimap và Filter với tách component |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-06 |
| Status | Draft |
| Related STP | STP-v1.0-SA4E-247.md |
| Related FSD | FSD-v1.1-SA4E-247.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-06 | QA Agent | Initiate document from FSD use cases and security findings |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | TC-001 to TC-099 | 6 | High |
| Functional — Alternative Flows | TC-100 to TC-199 | 3 | High |
| Functional — Exception/Error Flows | TC-200 to TC-299 | 4 | High |
| Business Rule Validation | TC-300 to TC-399 | 6 | High |
| Boundary & Negative Testing | TC-400 to TC-499 | 6 | Medium |
| UI/UX Testing | TC-500 to TC-599 | 6 | Medium |
| Non-Functional — Performance/Security | TC-600 to TC-699 | 8 | High |
| Integration Testing | TC-700 to TC-799 | 4 | High |
| Regression Testing | TC-800 to TC-899 | 2 | Medium |

---

## 1. Functional Test Cases — Happy Path

### TC-001: Legend Window renders as independent window

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-001, Story 1 AC-1 |
| **Preconditions** | KB Graph viewer loaded with nodes data |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open KB Graph | LegendWindow component visible |
| 2 | Verify title bar | Contains minimize/maximize/close buttons |
| 3 | Check position | Window appears at default position |

**Test Data:** nodes/summary with 10 types
**Postconditions:** Legend window visible

### TC-002: Legend Window draggable and resizable

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-001, BR-01 |
| **Preconditions** | Legend window open |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Drag window by title bar | Window moves to new position |
| 2 | Resize by corner handle | Size changes |
| 3 | Reload page | Position/size restored from localStorage |

**Test Data:** N/A
**Postconditions:** State persisted

### TC-003: Legend Window maximize/minimize

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-001 AC-1 |
| **Preconditions** | Legend window open |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click MaximizeButton | Window fills screen |
| 2 | Click MaximizeButton again | Restores previous size |

**Test Data:** N/A

### TC-004: Legend list scrollable

| Field | Value |
|-------|-------|
| **ID** | TC-004 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | BR-02 |
| **Preconditions** | Legend data >100 types |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open legend | Scrollbar visible |
| 2 | Scroll down | Items load smoothly <50ms frame |

**Test Data:** 500 node types

### TC-005: Minimap renders thumbnail and rotate

| Field | Value |
|-------|-------|
| **ID** | TC-005 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-002, BR-03 |
| **Preconditions** | Graph rendered |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open MinimapController | Thumbnail visible |
| 2 | Click RotateButton | Minimap rotates 90° |
| 3 | Click 4 times | Returns to original orientation |

**Test Data:** N/A

### TC-006: Minimap click to zoom main graph

| Field | Value |
|-------|-------|
| **ID** | TC-006 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-002 AC-4 |
| **Preconditions** | Minimap visible |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on minimap at position X | Main graph zooms to that position |
| 2 | Enable SpanToggle | Viewport rect visible |

**Test Data:** N/A

---

## 2. Functional Test Cases — Alternative Flows

### TC-101: Legend window maximized then minimized restores size

| Field | Value |
|-------|-------|
| **ID** | TC-101 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-001 AF-1 |
| **Preconditions** | Legend window resized |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Maximize window | Fullscreen |
| 2 | Minimize | Window collapsed |
| 3 | Restore | Returns to size before maximize |

---

### TC-102: Filter search with empty query shows all checkboxes

| Field | Value |
|-------|-------|
| **ID** | TC-102 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-003 |
| **Preconditions** | Filter panel open |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Clear search input | All checkboxes visible |
| 2 | Type '*' | All items match |

---

### TC-103: Minimap span mode toggle

| Field | Value |
|-------|-------|
| **ID** | TC-103 |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-002 |
| **Preconditions** | Minimap visible |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Toggle SpanToggle on/off | Viewport rect appears/disappears |

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-201: Legend data empty shows No types

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | FSD 3.1.6 Error Scenario |
| **Preconditions** | API returns empty types |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load KB Graph with empty data | Message "No types available" displayed |

### TC-202: localStorage unavailable fallback

| Field | Value |
|-------|-------|
| **ID** | TC-202 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-001 EF-1 |
| **Preconditions** | localStorage disabled |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Move legend window | Warning logged, fallback to memory store |
| 2 | Reload | Default position used |

### TC-203: Graph data empty shows empty state

| Field | Value |
|-------|-------|
| **ID** | TC-203 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow |
| **Requirement** | FSD 9.1 |
| **Preconditions** | No nodes |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load graph | "No nodes to display" shown |

### TC-204: Minimap init fail hides UI

| Field | Value |
|-------|-------|
| **ID** | TC-204 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow |
| **Requirement** | FSD 9.1 |
| **Preconditions** | Canvas error |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger minimap error | Minimap UI hidden, warning logged |

---

## 4. Business Rule Validation

### TC-301: Legend position persisted after reload

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-01 |
| **Preconditions** | Legend window moved |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Move legend to x=200,y=150 | Position saved |
| 2 | Reload | Position restored |

### TC-302: Legend list scrollable for >100 types

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-02 |
| **Preconditions** | 150 types |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open legend | Scrollbar present, virtualized |

### TC-303: Minimap reflects current viewport

| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-03 |
| **Preconditions** | Graph panned |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Pan main graph | Minimap viewport rect updates |

### TC-304: Rotate preserves coordinate mapping

| Field | Value |
|-------|-------|
| **ID** | TC-304 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-04 |
| **Preconditions** | Minimap rotated |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click minimap after rotate | Main graph zooms to correct rotated position |

### TC-305: Filter search supports wildcard * and ?

| Field | Value |
|-------|-------|
| **ID** | TC-305 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-05 |
| **Preconditions** | Filter panel open |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Search "ACT*" | Matches ACTIVITY, ACTION |
| 2 | Search "CLAS?" | Matches CLASSX, CLASSY |

### TC-306: Filtering realtime <200ms

| Field | Value |
|-------|-------|
| **ID** | TC-306 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-06 |
| **Preconditions** | 10k types |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Type in search | Filtering completes <200ms p95 |

---

## 5. Boundary & Negative Testing

### TC-401: Filter search empty string

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | FilterSearchInput |
| **Preconditions** | Filter open |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter empty string | All checkboxes shown, no error |

### TC-402: Filter search pattern length >128 rejected

| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | Security Finding #1 |
| **Preconditions** | Filter open |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter 200 chars | Pattern ignored, no ReDoS |

### TC-403: Legend window size clamped

| Field | Value |
|-------|-------|
| **ID** | TC-403 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | Security Finding #2 |
| **Preconditions** | localStorage poisoned |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set localStorage w=100000 | Window clamped to max window.innerWidth-50 |

### TC-404: Wildcard search with special regex chars

| Field | Value |
|-------|-------|
| **ID** | TC-404 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | Safe regex |
| **Preconditions** | Filter open |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Search "ACT(.+)" | Special chars escaped, no error |

### TC-405: localStorage quota exceeded

| Field | Value |
|-------|-------|
| **ID** | TC-405 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | FSD 9.1 |
| **Preconditions** | localStorage full |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Save window state | Warning shown, fallback to memory |

### TC-406: Color validation

| Field | Value |
|-------|-------|
| **ID** | TC-406 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | Security Finding #4 |
| **Preconditions** | API returns invalid color |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | API returns color "javascript:alert(1)" | Color rejected, default used |

---

## 6. UI/UX Testing

### TC-501: Legend window UI elements present

| Field | Value |
|-------|-------|
| **ID** | TC-501 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FSD 3.1.5 UI Spec |
| **Preconditions** | KB Graph open |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Inspect LegendWindow | Minimize, Maximize, Close buttons visible |

### TC-502: Minimap controls visible

| Field | Value |
|-------|-------|
| **ID** | TC-502 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FSD 3.2.5 |
| **Preconditions** | Minimap open |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check UI | RotateButton, SpanToggle, ZoomViewport present |

### TC-503: Filter search input debounce

| Field | Value |
|-------|-------|
| **ID** | TC-503 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FSD 3.3.5 |
| **Preconditions** | Filter open |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Type fast | Filtering triggered after 150ms debounce |

### TC-504: Component separation import

| Field | Value |
|-------|-------|
| **ID** | TC-504 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | BRD AC |
| **Preconditions** | Build |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Import LegendWindow.svelte | Component loads without errors |

---

## 7. Non-Functional Testing — Performance/Security

### TC-601: Filter realtime performance <200ms

| Field | Value |
|-------|-------|
| **ID** | TC-601 |
| **Priority** | High |
| **Type** | Non-Functional — Performance |
| **Requirement** | NFR Performance |
| **Preconditions** | 10k node types |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure search filter time | p95 <200ms |

### TC-602: ReDoS protection wildcard

| Field | Value |
|-------|-------|
| **ID** | TC-602 |
| **Priority** | High |
| **Type** | Non-Functional — Security |
| **Requirement** | SECURITY-REVIEW Finding #1 |
| **Preconditions** | Filter open |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Input pattern "(.*)*" | UI not freeze, pattern rejected or safe |

### TC-603: localStorage sanitization

| Field | Value |
|-------|-------|
| **ID** | TC-603 |
| **Priority** | High |
| **Type** | Non-Functional — Security |
| **Requirement** | SECURITY-REVIEW Finding #2 |
| **Preconditions** | Manipulated localStorage |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set x=-9999,w=0 | Values clamped to safe range |

### TC-604: postMessage validation

| Field | Value |
|-------|-------|
| **ID** | TC-604 |
| **Priority** | High |
| **Type** | Non-Functional — Security |
| **Requirement** | SECURITY-REVIEW Finding #3 |
| **Preconditions** | Webview open |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send invalid message type | Message rejected, no host action |

### TC-605: XSS prevention node type

| Field | Value |
|-------|-------|
| **ID** | TC-605 |
| **Priority** | High |
| **Type** | Non-Functional — Security |
| **Requirement** | SECURITY-REVIEW Finding #4 |
| **Preconditions** | API returns <script> |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Render node type with HTML | Content escaped, no script execution |

### TC-606: Token not logged

| Field | Value |
|-------|-------|
| **ID** | TC-606 |
| **Priority** | Medium |
| **Type** | Non-Functional — Security |
| **Requirement** | SECURITY-REVIEW Finding #5 |
| **Preconditions** | API error |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger API 500 | Console does not contain Authorization token |

### TC-607: Minimap 60fps rendering

| Field | Value |
|-------|-------|
| **ID** | TC-607 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | NFR |
| **Preconditions** | Large graph |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Pan graph | Minimap renders at 60fps via RAF |

### TC-608: Legend virtualized scroll performance

| Field | Value |
|-------|-------|
| **ID** | TC-608 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | NFR |
| **Preconditions** | 5000 types |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Scroll legend | Frame time <50ms |

---

## 8. Integration Testing

### TC-701: API nodes summary returns correct data

| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 3.1.6 API |
| **Preconditions** | Backend up |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | GET /api/v1/admin/kb-graph/nodes/summary | 200 with types array |

### TC-702: Svelte store updates graph renderer

| Field | Value |
|-------|-------|
| **ID** | TC-702 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | TDD 2.2 |
| **Preconditions** | Filter changed |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Change filterStore.selectedTypes | GraphRenderer updates visibility |

### TC-703: localStorage sync store

| Field | Value |
|-------|-------|
| **ID** | TC-703 |
| **Priority** | Medium |
| **Type** | Integration |
| **Requirement** | TDD 5.1 |
| **Preconditions** | Legend moved |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Move window | localStorageSync persists, store rehydrates |

### TC-704: vscode.postMessage roundtrip

| Field | Value |
|-------|-------|
| **ID** | TC-704 |
| **Priority** | Medium |
| **Type** | Integration |
| **Requirement** | FSD 2.2 |
| **Preconditions** | Webview open |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Component sends message | Host receives validated message |

---

## 9. Regression Testing

### TC-801: Existing graph viewer still works

| Field | Value |
|-------|-------|
| **ID** | TC-801 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | BRD 1.2 |
| **Preconditions** | KB Graph open |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Use existing pan/zoom | Still works as before |

### TC-802: API contract unchanged

| Field | Value |
|-------|-------|
| **ID** | TC-802 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | TDD 3.1 |
| **Preconditions** | Backend |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call GET nodes/summary | Response schema unchanged |

---

## 10. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-001 Legend Window Independent | FSD 3.1 | TC-001, TC-002, TC-003, TC-004, TC-101, TC-201, TC-202, TC-301, TC-302, TC-501 | ✅ |
| UC-002 Minimap Enhanced | FSD 3.2 | TC-005, TC-006, TC-103, TC-303, TC-304, TC-502, TC-607 | ✅ |
| UC-003 Filter Panel Wildcard | FSD 3.3 | TC-102, TC-305, TC-306, TC-401, TC-402, TC-404, TC-503, TC-601, TC-602 | ✅ |
| BR-01 Legend position persisted | FSD 3.1.3 | TC-301 | ✅ |
| BR-02 Legend scrollable | FSD 3.1.3 | TC-302, TC-004 | ✅ |
| BR-05 Wildcard support | FSD 3.3.3 | TC-305 | ✅ |
| BR-06 Realtime <200ms | FSD 3.3.3 | TC-306, TC-601 | ✅ |
| Security Finding #1 ReDoS | SECURITY-REVIEW | TC-602, TC-402 | ✅ |
| Security Finding #2 localStorage poisoning | SECURITY-REVIEW | TC-603, TC-403, TC-405 | ✅ |
| Security Finding #3 postMessage | SECURITY-REVIEW | TC-604, TC-704 | ✅ |
| Security Finding #4 XSS | SECURITY-REVIEW | TC-605, TC-406 | ✅ |
| Security Finding #5 Token exposure | SECURITY-REVIEW | TC-606 | ✅ |

**Coverage Summary:**
| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 3 | 3 | 100% |
| Business Rules | 6 | 6 | 100% |
| Acceptance Criteria | 9 | 9 | 100% |
| Security Findings | 5 | 5 | 100% |
| **Overall** | **23** | **23** | **100%** |

---

## 11. Appendix

Test data setup via API seed script. Environment VS Code webview.

