# Business Requirements Document (BRD)

## SA4E — F6-drawio-engine: Draw.io Engine

---

## Document Information

| Field | Value |
|-------|-------|
| Ticket | F6-drawio-engine |
| Title | Draw.io Engine — XML Generation, Auto-Layout, PNG Export |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Architecture Pattern | AI Agent System |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | BA Agent | Initial document — generated from feature scope and source code analysis |

---

## 1. Introduction

### 1.1 Scope

The Draw.io Engine is a core infrastructure component of the SA4E (SDLC Agents 4 Enterprise) system that provides automated diagram generation capabilities for the multi-agent SDLC pipeline. It enables AI agents (BA, SA, QA, DevOps) to programmatically create, validate, layout, and export draw.io diagrams as part of document generation workflows.

Key capabilities:
- XML generation conforming to draw.io mxGraphModel format
- Auto-layout algorithms (layered, force-directed, radial, tree)
- PNG export via draw.io desktop CLI (with fallback to browser-based rendering)
- XML parsing and validation (no self-closing edges, no mxfile wrapper)
- Orthogonal edge routing to avoid node crossings
- Integration with SDLC document generation pipeline (BRD, FSD, TDD diagrams)

### 1.2 Out of Scope

- Interactive diagram editing UI (handled by draw.io desktop app)
- Real-time collaborative diagram editing
- Non-draw.io diagram formats (Mermaid, PlantUML conversion)
- Diagram version control (managed by git)
- Cloud-based draw.io rendering service

### 1.3 Preliminary Requirements

- draw.io desktop application installed on the host machine (for CLI PNG export)
- Node.js runtime (TypeScript execution environment)
- MCP (Model Context Protocol) server infrastructure for tool registration
- Workspace file system access for reading/writing .drawio and .png files

---

## 2. Business Requirements

### 2.1 High Level Process Map

The Draw.io Engine operates within the AI agent pipeline as follows:

1. AI agent (BA/SA/QA/DevOps) generates diagram content as draw.io XML
2. Engine validates XML structure (no malformed edges, correct root element)
3. Engine applies auto-layout algorithm to position nodes optimally
4. Engine routes edges orthogonally to avoid node crossings
5. Engine writes positioned XML back to .drawio file
6. Engine exports .drawio to PNG via CLI for embedding in markdown documents

![Business Flow](diagrams/business-flow.png)

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case | Priority | Source |
|---|-----------------|----------|--------|
| 1 | As an AI agent, I want to validate draw.io XML so that diagrams are well-formed before processing | MUST HAVE | F6 |
| 2 | As an AI agent, I want to auto-layout diagrams so that nodes don't overlap and the graph is readable | MUST HAVE | F6 |
| 3 | As an AI agent, I want to export .drawio files to PNG so that diagrams can be embedded in documents | MUST HAVE | F6 |
| 4 | As an AI agent, I want orthogonal edge routing so that connectors don't cross through nodes | SHOULD HAVE | F6 |
| 5 | As a pipeline orchestrator, I want multiple layout algorithms so that different diagram types get optimal layouts | SHOULD HAVE | F6 |
| 6 | As a pipeline orchestrator, I want PNG export fallback renderers so that export works even without draw.io desktop | COULD HAVE | F6 |
| 7 | As an AI agent, I want issue detection (overlaps, edge crossings) so that I can fix diagrams iteratively | MUST HAVE | F6 |

---

### 2.3 Details of User Stories

---

#### Business Flow

**Step 1:** AI agent generates draw.io XML content with mxGraphModel root element, defining cells (nodes) and edges

**Step 2:** Agent calls `drawio_auto_layout` MCP tool with the .drawio file path

**Step 3:** Engine parses XML, extracts graph structure (nodes, edges, containers)

**Step 4:** Engine detects layout issues (overlaps, edge crossings, diagonal edges)

**Step 5:** If issues found, engine reports them back to agent for fixing; if clean, reports "already_good"

**Step 6:** Agent fixes XML based on issue hints and calls tool again for verification

**Step 7:** Agent calls `drawio_export_png` to render final PNG

**Step 8:** PNG file is placed alongside .drawio file and referenced in markdown document

> **Note:** The auto-layout tool operates in REVIEW mode — it detects issues and provides fix hints rather than modifying files directly. This gives the AI agent control over the final diagram.

---

#### STORY 1: XML Parsing and Validation

> As an AI agent, I want to validate draw.io XML so that diagrams are well-formed before processing

**Requirement Details:**

1. Parse draw.io XML using regex-based extraction (no external XML dependency)
2. Extract nodes with geometry (position, size), edges with source/target, and container relationships
3. Identify container nodes by style (swimlane, dashed rectangles) or child presence
4. Reject XML with mxfile wrapper — must start with mxGraphModel
5. Detect self-closing edge cells (edge="1" followed by /> without mxGeometry)

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| file_path | string | Yes | Path to .drawio file | `documents/F6/diagrams/architecture.drawio` |

**Acceptance Criteria:**

1. Parser correctly extracts all mxCell elements with their attributes
2. Nodes have id, parentId, x, y, width, height, style, isContainer properties
3. Edges have id, sourceId, targetId, style properties
4. Files with mxfile wrapper are rejected with clear error message
5. Self-closing edge cells are detected and reported as validation errors
6. Parser handles both self-closing and child-element mxCell formats

---

#### STORY 2: Auto-Layout Algorithm

> As an AI agent, I want to auto-layout diagrams so that nodes don't overlap and the graph is readable

**Requirement Details:**

1. Support 4 layout algorithms: layered (default), force, mrtree, radial
2. Layered layout uses topological sort (BFS) to assign layers, then positions nodes per layer
3. Force-directed layout uses repulsion/attraction forces with 100 iterations and damping
4. Radial layout places root at center, other nodes in concentric rings (max 8 per ring)
5. All algorithms respect container boundaries and resize containers after layout
6. Layout direction configurable: DOWN (default), RIGHT, LEFT, UP

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| file_path | string | Yes | Path to .drawio file | `diagrams/arch.drawio` |
| algorithm | string | No | Layout algorithm | `layered` |
| spacing | number | No | Node spacing in pixels | `80` |
| direction | string | No | Layout direction | `DOWN` |
| export_png | boolean | No | Also export PNG after layout | `false` |
| force | boolean | No | Force re-layout even if no overlaps | `false` |

**Acceptance Criteria:**

1. Layered layout produces no node overlaps for DAG-structured diagrams
2. Force-directed layout converges within 100 iterations (damping factor applied)
3. Radial layout places maximum 8 nodes per ring
4. Container nodes resize to encompass all children with spacing margin
5. Child nodes are positioned relative to container after resize
6. Algorithm falls back to layered if invalid algorithm name provided

---

#### STORY 3: PNG Export

> As an AI agent, I want to export .drawio files to PNG so that diagrams can be embedded in documents

**Requirement Details:**

1. Priority renderer detection: draw.io CLI > chrome-devtools-mcp > puppeteer-mcp
2. draw.io CLI uses --export --format png --border 10 flags
3. Chrome fallback encodes XML to base64, loads in viewer.diagrams.net, screenshots
4. Puppeteer fallback uses same approach with puppeteer navigation
5. Renderer detection is cached for session performance
6. Tool is hidden from MCP tool list if no renderer available
7. Output PNG placed in same directory with same filename (.drawio to .png)

**Acceptance Criteria:**

1. PNG export succeeds when draw.io desktop is installed
2. Exported PNG file exists and has non-zero size
3. Tool returns JSON with success status, file_path, size_bytes, and renderer used
4. If draw.io CLI not available, falls back to browser-based rendering
5. If no renderer available, returns clear error message (not a crash)
6. Export timeout is 30 seconds for CLI
7. isExportPngAvailable() correctly reports availability before tool registration

---

#### STORY 4: Orthogonal Edge Routing

> As an AI agent, I want orthogonal edge routing so that connectors don't cross through nodes

**Requirement Details:**

1. Compute exit port from source node based on relative target position
2. Compute entry port to target node based on relative source position
3. Route edges orthogonally (L-shape or Z-shape) to avoid obstacle nodes
4. Set orthogonalEdgeStyle and rounded=1 style properties on routed edges
5. Add waypoints as Array as="points" inside mxGeometry
6. Apply exit/entry anchor styles (exitX, exitY, entryX, entryY) to edge cells

**Acceptance Criteria:**

1. Edges between horizontally-adjacent nodes use left/right ports
2. Edges between vertically-adjacent nodes use top/bottom ports
3. L-shape routing tried first (single waypoint)
4. Z-shape routing used when L-shape crosses an obstacle
5. Obstacle margin of 5px applied when checking line-rect intersection
6. Waypoint coordinates are written back to XML correctly

---

#### STORY 5: Issue Detection (Review Mode)

> As an AI agent, I want issue detection (overlaps, edge crossings) so that I can fix diagrams iteratively

**Requirement Details:**

1. Detect node overlaps with >50% overlap ratio (based on smaller node area)
2. Detect edge-node crossings (edge line passes through a non-endpoint node)
3. Detect diagonal edges (both dx > 20px and dy > 20px tolerance)
4. Report issues with severity levels: high (overlap), medium (crossing), low (diagonal)
5. Provide fix hints per issue for the AI agent to act on
6. Return already_good status when no issues detected

**Acceptance Criteria:**

1. Overlap detection correctly calculates intersection area ratio
2. Edge crossing detection uses Cohen-Sutherland outcodes for efficiency
3. Diagonal edge detection uses 20px tolerance before flagging
4. Each issue includes type, severity, affected node/edge IDs, and fix_hint
5. Fix hints provide actionable instructions (e.g., "Move node X to y=100")
6. Tool returns structured JSON for programmatic consumption
7. Same-parent constraint: only nodes sharing a parent are checked for overlap

---

#### STORY 6: XML Writer (Position Writeback)

> As a pipeline orchestrator, I want layout results written back to draw.io XML preserving all styles and labels

**Requirement Details:**

1. Update mxGeometry x, y, width, height attributes for repositioned nodes
2. Set edge style properties (exitX, exitY, entryX, entryY) for anchor points
3. Add orthogonal routing waypoints as Array as="points" children
4. Use regex-based XML manipulation (no DOM parser dependency)
5. Handle both inline geometry and self-closing patterns
6. Preserve all existing styles, labels, and custom properties

**Acceptance Criteria:**

1. After writeLayout, the .drawio file is valid and opens in draw.io desktop
2. Node positions match the computed layout coordinates
3. Edge anchors are correctly computed (exit from source side facing target)
4. Waypoints are embedded in correct mxGeometry structure
5. Original styles (colors, fonts, shapes) are preserved unchanged
6. Numeric values are formatted as integers when possible (no unnecessary decimals)

---

## 3. Dependencies

| Dependency | Type | Related | Description |
|------------|------|---------|-------------|
| draw.io Desktop | External | — | CLI for PNG export (draw.io.exe --export) |
| Node.js / TypeScript | Infrastructure | — | Runtime for engine execution |
| MCP Server | System | F3 (Orchestration) | Tool registration and execution framework |
| File System | Infrastructure | — | Read/write .drawio and .png files |
| chrome-devtools-mcp | External (optional) | — | Fallback renderer via Chrome screenshot |
| puppeteer-mcp | External (optional) | — | Fallback renderer via headless browser |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility |
|------|-------------|----------------|
| AI Agents (BA, SA, QA, DevOps) | SDLC Pipeline | Primary consumers — generate diagrams during document creation |
| Pipeline Orchestrator (SM) | SM Agent | Coordinates diagram generation as part of SDLC phases |
| Document Reviewers | PO / Tech Lead | Consume exported PNG diagrams in DOCX deliverables |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| draw.io CLI not installed on CI/CD | High | Medium | Fallback to browser-based rendering |
| Regex-based XML parsing fails on edge cases | Medium | Low | Comprehensive test suite for XML patterns |
| Layout algorithm produces suboptimal results for complex diagrams | Low | Medium | Multiple algorithms available; AI can iterate |
| Large diagrams (100+ nodes) slow down layout | Medium | Low | Force-directed caps at 100 iterations |

### 5.2 Assumptions

- draw.io desktop app is installed on developer/agent machines
- .drawio files follow standard mxGraph XML format (no custom extensions)
- AI agents generate syntactically valid XML (engine validates but does not create from scratch)
- PNG export quality from CLI is sufficient for document embedding
- Workspace file system is writable by the MCP server process

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Layout computation < 2s | For diagrams up to 50 nodes |
| Performance | PNG export < 30s | CLI timeout enforced |
| Reliability | Graceful degradation | If CLI unavailable, fall back to browser; if none, hide tool |
| Maintainability | No external XML deps | Regex-based parsing avoids dependency issues |
| Compatibility | Cross-platform | Windows, macOS, Linux path detection for draw.io CLI |
| Security | No network calls for layout | Layout is purely local computation |
| Testability | Deterministic layout | Same input always produces same output |

---

## 7. Related Features

| Feature | Relationship | Description |
|---------|-------------|-------------|
| F3 — Orchestration | Depends on | MCP tool registration framework |
| F4 — Context Assembly | Related | Diagrams embedded in agent context |
| All SDLC Phases | Consumer | BRD/FSD/TDD/STP/DPG require diagrams |

---

## 8. Appendix

### Glossary

| Term | Definition |
|------|------------|
| mxGraphModel | Root XML element of draw.io diagram format |
| mxCell | XML element representing a node or edge in draw.io |
| mxGeometry | XML element defining position and size of a cell |
| MCP | Model Context Protocol — AI tool communication standard |
| Auto-layout | Automatic positioning of diagram nodes using graph algorithms |
| Orthogonal routing | Edge paths using only horizontal/vertical segments |
| Cohen-Sutherland | Line clipping algorithm using region outcodes |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
