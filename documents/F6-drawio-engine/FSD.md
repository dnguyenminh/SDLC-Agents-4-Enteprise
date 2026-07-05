# Functional Specification Document (FSD)

## SA4E — F6-drawio-engine: Draw.io Engine

---

## Document Information

| Field | Value |
|-------|-------|
| Ticket | F6-drawio-engine |
| Title | Draw.io Engine — XML Generation, Auto-Layout, PNG Export |
| Author | BA Agent + TA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Related BRD | BRD-v1-F6-drawio-engine.docx |
| Architecture Pattern | AI Agent System |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | BA Agent | Initial FSD from BRD and source code |
| 1.0 | 2025-07-03 | TA Agent | Technical enrichment — API contracts, pseudocode |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional behavior of the Draw.io Engine subsystem.

### 1.2 Scope

- XML parsing of mxGraphModel format (regex-based, zero external XML deps)
- Issue detection in REVIEW mode (overlaps, edge crossings, diagonal edges)
- Orthogonal edge routing with waypoint computation
- Position writeback to .drawio XML preserving all styles/labels
- PNG export via draw.io CLI with browser-based fallbacks
- MCP tool registration (`drawio_auto_layout`, `drawio_export_png`)

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| mxGraphModel | Root XML element of draw.io diagram format |
| mxCell | XML element representing a node or edge |
| mxGeometry | XML element defining position/size of a cell |
| MCP | Model Context Protocol — AI tool communication standard |
| Orthogonal routing | Edge paths using only horizontal/vertical segments |
| Cohen-Sutherland | Line clipping algorithm using region outcodes |
| DAG | Directed Acyclic Graph |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-F6-drawio-engine.docx |
| SA4E Architecture | .code-intel/SA4E-ARCHITECTURE.md |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

The Draw.io Engine operates as a tool layer within the SA4E backend. AI agents invoke it through MCP tool calls. The engine reads/writes .drawio files on the workspace filesystem and invokes the draw.io desktop CLI for PNG rendering.

**External Actors:**
- AI Agents (BA, SA, QA, DevOps) — invoke tools via MCP
- draw.io Desktop CLI — external process for PNG rendering
- Chrome DevTools MCP / Puppeteer MCP — fallback renderers
- Workspace Filesystem — source/target for .drawio and .png files

### 2.2 System Architecture

The engine consists of 5 modules with clear separation of concerns:

| Module | File | Responsibility |
|--------|------|----------------|
| Parser | `drawio-parser.ts` | XML → DiagramGraph extraction |
| Issue Detector | `drawio-tool.ts` | Overlap/crossing/diagonal detection |
| Router | `drawio-router.ts` | Orthogonal edge waypoint computation |
| Writer | `drawio-writer.ts` | DiagramGraph → XML position writeback |
| Exporter | `drawio-export-png.ts` | PNG rendering via CLI/browser |

Data flows: Parser → Detector → (Router → Writer) → Exporter

---

## 3. Functional Requirements

### 3.1 Feature: XML Parsing & Validation

**Source:** BRD Story 1

#### 3.1.1 Description

Parse draw.io XML into a structured DiagramGraph containing nodes (with geometry), edges (with source/target), and container relationships. Uses regex-based extraction to avoid external XML parser dependencies.

#### 3.1.2 Use Case

**Use Case ID:** UC-01
**Actor:** AI Agent
**Preconditions:** A .drawio file exists at the specified path
**Postconditions:** DiagramGraph object populated with nodes, edges, containers

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | AI Agent | | Provides file_path to drawio_auto_layout tool |
| 2 | | Parser | Reads file content as UTF-8 string |
| 3 | | Parser | Applies cellRegex to extract all mxCell elements |
| 4 | | Parser | Classifies cells: edge (edge="1") vs node |
| 5 | | Parser | Extracts mxGeometry (x, y, width, height) for nodes |
| 6 | | Parser | Identifies containers (swimlane style or has children) |
| 7 | | Parser | Returns DiagramGraph {nodes, edges, containers} |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | Self-closing mxCell without child mxGeometry | Geometry parsed from inline attributes |
| AF-02 | mxCell has parent not equal to 1 | Node assigned to container parentId |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | File not found | Return error JSON with message |
| EF-02 | File not .drawio extension | Return error JSON with message |
| EF-03 | No mxCell elements found | Return error JSON "No nodes found in diagram" |
| EF-04 | mxGeometry missing for node | Skip node silently, continue parsing |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-01 | XML must NOT have mxfile wrapper, must start with mxGraphModel | BRD Story 1.5 |
| BR-02 | Edge cells (edge="1") must have both source and target attributes | BRD Story 1.2 |
| BR-03 | Container detection: style includes "swimlane" OR "fillColor=none;dashed=1" OR has child cells | BRD Story 1.4 |
| BR-04 | Nodes with id="0" or id="1" are skipped (root/layer elements) | Draw.io format spec |
| BR-05 | Default parent is "1" when parent attribute is missing | Draw.io format spec |
| BR-06 | Self-closing edge cells without mxGeometry are validation errors | BRD Story 1.5 |

#### 3.1.4 Data Specifications

**Input Data:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| file_path | string | Yes | Must end with .drawio, file must exist | Path to .drawio file (absolute or workspace-relative) |

**Output Data (DiagramGraph):**

| Field | Type | Description |
|-------|------|-------------|
| nodes | DiagramNode[] | Non-container mxCells with geometry |
| edges | DiagramEdge[] | Cells with edge="1" and source/target |
| containers | DiagramNode[] | Nodes identified as containers |

**DiagramNode:**

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique cell identifier |
| parentId | string | Parent container ID (default "1") |
| x | number | X position in pixels |
| y | number | Y position in pixels |
| width | number | Node width in pixels |
| height | number | Node height in pixels |
| style | string | Full draw.io style string |
| isContainer | boolean | Whether node is a container |

**DiagramEdge:**

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique edge identifier |
| sourceId | string | Source node ID |
| targetId | string | Target node ID |
| style | string | Full draw.io edge style string |

#### 3.1.5 API Contract (Functional View)

> Parsing is internal — exposed through the `drawio_auto_layout` MCP tool (see UC-02).

---

### 3.2 Feature: Issue Detection (Review Mode)

**Source:** BRD Story 2, 5, 7

#### 3.2.1 Description

The `drawio_auto_layout` tool operates in REVIEW mode. It does NOT modify the file. Instead it detects layout issues (node overlaps, edge-node crossings, diagonal edges) and returns a structured issue report with fix hints for the AI agent.

#### 3.2.2 Use Case

**Use Case ID:** UC-02
**Actor:** AI Agent
**Preconditions:** .drawio file exists with at least one node
**Postconditions:** Issue report returned (or "already_good" if clean)

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | AI Agent | | Calls drawio_auto_layout with file_path |
| 2 | | Parser | Parses XML into DiagramGraph |
| 3 | | Detector | detectNodeOverlaps: pairwise overlap check (same-parent only) |
| 4 | | Detector | detectEdgeCrossings: line-rect intersection per edge vs non-endpoint nodes |
| 5 | | Detector | detectDiagonalEdges: dx > 20 AND dy > 20 tolerance check |
| 6 | | Tool | If 0 issues: return status="already_good" |
| 7 | | Tool | If N issues: return status="needs_fix" with issue array |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | force=true parameter | Still runs detection (does not skip) |
| AF-02 | Container nodes present | Container children checked for overlaps among themselves |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | Analysis throws error | Return error JSON with exception message |

#### 3.2.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-07 | Overlap threshold: intersection area / smaller node area > 50% | BRD Story 5.1 |
| BR-08 | Only nodes sharing same parentId are checked for overlaps | BRD Story 5.7 |
| BR-09 | Edge crossing uses 5px margin around obstacle nodes | BRD Story 5.5 |
| BR-10 | Diagonal edge tolerance: both dx > 20px AND dy > 20px | BRD Story 5.3 |
| BR-11 | Issue severity: overlap=high, crossing=medium, diagonal=low | BRD Story 5.4 |
| BR-12 | Fix hints must be actionable (include node IDs and suggested coordinates) | BRD Story 5.5 |

#### 3.2.4 Data Specifications

**Input Data:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| file_path | string | Yes | .drawio extension, file exists | Path to diagram file |
| algorithm | string | No | layered, force, mrtree, radial | Layout algorithm (currently unused in review mode) |
| spacing | number | No | > 0 | Node spacing in pixels (default 80) |
| direction | string | No | DOWN, RIGHT, LEFT, UP | Layout direction (default DOWN) |
| export_png | boolean | No | | Also export PNG after (default false) |
| force | boolean | No | | Force re-check even if no issues (default false) |

**Output Data (success, no issues):**

| Field | Type | Description |
|-------|------|-------------|
| status | "already_good" | No issues detected |
| message | string | Human-readable summary |
| nodes | number | Total node count |
| edges | number | Total edge count |
| issues | [] | Empty array |

**Output Data (success, issues found):**

| Field | Type | Description |
|-------|------|-------------|
| status | "needs_fix" | Issues detected |
| message | string | Summary with issue count |
| nodes | number | Total node count |
| edges | number | Total edge count |
| issues | Issue[] | Array of detected issues |

**Issue Object:**

| Field | Type | Description |
|-------|------|-------------|
| type | "node_overlap" or "edge_crossing" or "diagonal_edge" | Issue category |
| severity | "high" or "medium" or "low" | Severity level |
| node_a / edge_id | string | Affected element ID |
| node_b / crosses_node | string | Second affected element |
| overlap_pct | number (optional) | Overlap percentage (overlaps only) |
| fix_hint | string | Actionable fix instruction |

#### 3.2.5 API Contract (MCP Tool)

**Tool Name:** `drawio_auto_layout`
**Purpose:** Detect layout issues in draw.io diagrams for AI agent to fix iteratively.

**Request Schema:**

```json
{
  "file_path": "documents/F6-drawio-engine/diagrams/architecture.drawio",
  "algorithm": "layered",
  "spacing": 80,
  "direction": "DOWN",
  "export_png": false,
  "force": false
}
```

**Response (no issues):**

```json
{
  "status": "already_good",
  "message": "Diagram looks good - no overlapping nodes or edge crossings detected.",
  "nodes": 8,
  "edges": 7,
  "issues": []
}
```

**Response (issues found):**

```json
{
  "status": "needs_fix",
  "message": "Found 3 issues. Fix the drawio XML and call this tool again to verify.",
  "nodes": 8,
  "edges": 7,
  "issues": [
    {
      "type": "node_overlap",
      "severity": "high",
      "node_a": "cell-5",
      "node_b": "cell-7",
      "overlap_pct": 75,
      "fix_hint": "Move 'cell-7' away from 'cell-5'."
    },
    {
      "type": "edge_crossing",
      "severity": "medium",
      "edge_id": "edge-3",
      "edge_source": "cell-1",
      "edge_target": "cell-5",
      "crosses_node": "cell-3",
      "fix_hint": "Edge 'edge-3' (cell-1->cell-5) crosses 'cell-3'. Rearrange nodes."
    }
  ]
}
```

**Error Response:**

```json
{"error": "File not found: diagrams/missing.drawio"}
```

---

### 3.3 Feature: Orthogonal Edge Routing

**Source:** BRD Story 4

#### 3.3.1 Description

Compute orthogonal (right-angle) waypoints for edges that would otherwise cross through intermediate nodes. Routes are L-shape (preferred) or Z-shape (when L-shape intersects obstacles).

#### 3.3.2 Use Case

**Use Case ID:** UC-03
**Actor:** Writer Module (internal)
**Preconditions:** DiagramGraph populated with positioned nodes and edges
**Postconditions:** Edges that cross obstacles have waypoint arrays computed

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Writer | | Calls routeEdges(graph) |
| 2 | | Router | For each edge, compute exitPort from source and entryPort to target |
| 3 | | Router | Identify obstacle nodes (all except source/target) |
| 4 | | Router | Check if direct line (exitPort to entryPort) intersects any obstacle |
| 5 | | Router | If no intersection: no waypoints needed (empty) |
| 6 | | Router | If intersection: try L-shape (horizontal-first), then L-shape (vertical-first) |
| 7 | | Router | If both L-shapes intersect: compute Z-shape bypass around first obstacle |
| 8 | | Router | Return Map of edgeId to Waypoint[] |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | Source or target node not found in nodeMap | Skip edge (no waypoints) |
| AF-02 | No obstacles in diagram | All edges get empty waypoints |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | Edge with invalid source/target ID | Skip edge silently |

#### 3.3.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-13 | Exit port computed from relative position: horizontal dominant = left/right, vertical dominant = top/bottom | BRD Story 4.1-4.2 |
| BR-14 | L-shape routing tried first (single midpoint waypoint) | BRD Story 4.3 |
| BR-15 | Z-shape routing used when both L-shapes cross obstacles | BRD Story 4.4 |
| BR-16 | Obstacle margin: 5px expansion around node bounding box | BRD Story 4.5 |
| BR-17 | Z-shape bypass offset: 30px from obstacle boundary | Implementation spec |
| BR-18 | Edge routing only computed for edges with actual crossings | Performance optimization |

#### 3.3.4 Data Specifications

**Waypoint:**

| Field | Type | Description |
|-------|------|-------------|
| x | number | Waypoint X coordinate (pixels) |
| y | number | Waypoint Y coordinate (pixels) |

**Route Output:** `Map<string, Waypoint[]>` — edge ID to ordered waypoint list

#### 3.3.5 Pseudocode

```
function routeEdges(graph):
  routes = new Map()
  for each edge in graph.edges:
    src = nodeMap.get(edge.sourceId)
    tgt = nodeMap.get(edge.targetId)
    if (!src || !tgt) continue
    
    srcPort = exitPort(src, tgt)  // center of face closest to target
    tgtPort = entryPort(src, tgt) // center of face closest to source
    obstacles = allNodes.filter(n => n.id != src.id && n.id != tgt.id)
    
    if no obstacle intersects line(srcPort, tgtPort):
      continue  // direct path is clear
    
    // Try L-shape horizontal-first
    midL = {x: tgtPort.x, y: srcPort.y}
    if !anyIntersection(srcPort, midL, obstacles) && !anyIntersection(midL, tgtPort, obstacles):
      routes.set(edge.id, [midL])
      continue
    
    // Try L-shape vertical-first
    midL2 = {x: srcPort.x, y: tgtPort.y}
    if !anyIntersection(srcPort, midL2, obstacles) && !anyIntersection(midL2, tgtPort, obstacles):
      routes.set(edge.id, [midL2])
      continue
    
    // Z-shape bypass around first obstacle
    routes.set(edge.id, computeZShape(srcPort, tgtPort, obstacles[0]))
  
  return routes
```

---

### 3.4 Feature: XML Position Writeback

**Source:** BRD Story 6

#### 3.4.1 Description

Write computed layout positions back to the .drawio XML file. Updates mxGeometry x/y/width/height for nodes, sets edge anchor styles (exitX, exitY, entryX, entryY), and inserts orthogonal routing waypoints. All operations use regex-based string manipulation.

#### 3.4.2 Use Case

**Use Case ID:** UC-04
**Actor:** Auto-Layout Tool (internal writeback after layout computation)
**Preconditions:** DiagramGraph has updated node positions, edge routes computed
**Postconditions:** .drawio file updated with new positions, original styles preserved

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Tool | | Calls writeLayout(rawXml, graph, filePath) |
| 2 | | Writer | applyPositions: update x, y, width, height in mxGeometry for each node |
| 3 | | Writer | applyEdgeAnchors: compute and set exitX/Y, entryX/Y style props |
| 4 | | Writer | applyEdgeRouting: insert orthogonal waypoints as Array as="points" |
| 5 | | Writer | Write modified XML back to filePath |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | Node not found in XML (id mismatch) | Skip node, continue with others |
| AF-02 | Edge has no matching style attribute | Skip edge anchor update |
| AF-03 | Route map is empty | Skip applyEdgeRouting entirely |

#### 3.4.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-19 | Existing styles, labels, colors MUST be preserved unchanged | BRD Story 6.6 |
| BR-20 | Numeric values formatted as integers when possible (no unnecessary decimals) | BRD Story 6.6 |
| BR-21 | Edge style props (exitX/Y, entryX/Y) use 0-1 normalized coordinates | Draw.io format spec |
| BR-22 | Waypoints embedded as mxPoint children inside Array as="points" | Draw.io format spec |
| BR-23 | Self-closing mxGeometry converted to open tag when waypoints are added | Implementation constraint |
| BR-24 | Edge style gets orthogonalEdgeStyle and rounded=1 when routed | BRD Story 4.5 |

#### 3.4.4 Data Specifications

**Input:**

| Field | Type | Description |
|-------|------|-------------|
| rawXml | string | Original .drawio file content |
| graph | DiagramGraph | Graph with updated positions |
| filePath | string | Output file path |

**Output:** void (writes directly to filesystem)

#### 3.4.5 Pseudocode

```
function writeLayout(rawXml, graph, filePath):
  xml = rawXml
  allNodes = [...graph.nodes, ...graph.containers]
  
  // Step 1: Update node positions
  for each node in allNodes:
    find mxCell with id=node.id, update its mxGeometry x, y, width, height
  
  // Step 2: Set edge anchors
  for each edge in graph.edges:
    src = nodeMap.get(edge.sourceId)
    tgt = nodeMap.get(edge.targetId)
    [exitX, exitY] = computeExit(src, tgt)  // which face to exit from
    [entryX, entryY] = computeEntry(src, tgt)  // which face to enter
    update edge style string with exitX;exitY;entryX;entryY
  
  // Step 3: Insert routing waypoints
  routes = routeEdges(graph)
  for each [edgeId, waypoints] in routes:
    set edge style to orthogonalEdgeStyle;rounded=1
    insert Array as="points" with mxPoint children into mxGeometry
  
  writeFile(filePath, xml)
```

---

### 3.5 Feature: PNG Export

**Source:** BRD Story 3

#### 3.5.1 Description

Export a .drawio diagram file to PNG image using the best available renderer. Priority: draw.io desktop CLI > Chrome DevTools MCP > Puppeteer MCP. Renderer detection is cached for session. If no renderer available, the tool is hidden from the MCP tool list.

#### 3.5.2 Use Case

**Use Case ID:** UC-05
**Actor:** AI Agent
**Preconditions:** .drawio file exists; at least one renderer available
**Postconditions:** .png file created in same directory with same basename

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | AI Agent | | Calls drawio_export_png with file_path |
| 2 | | Exporter | Resolve absolute path (workspace-relative if needed) |
| 3 | | Exporter | Validate: file exists, has .drawio extension |
| 4 | | Exporter | Detect renderer (cached after first detection) |
| 5 | | Exporter | Execute export via detected renderer |
| 6 | | Exporter | Verify output PNG exists and has non-zero size |
| 7 | | Exporter | Return success JSON with file_path, size_bytes, renderer |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | draw.io CLI not found | Try chrome-devtools-mcp fallback |
| AF-02 | Chrome DevTools not available | Try puppeteer-mcp fallback |
| AF-03 | file_path is absolute | Use as-is (skip workspace resolve) |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | No renderer available | Return error: "No renderer available. Install draw.io desktop..." |
| EF-02 | CLI timeout (30s) | Return error: "Export failed: timeout" |
| EF-03 | PNG not created after export | Return error: "Export failed - PNG file was not created" |
| EF-04 | file_path missing | Return error: "file_path is required" |

#### 3.5.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-25 | Renderer priority: CLI > Chrome > Puppeteer | BRD Story 3.1 |
| BR-26 | CLI flags: --export --format png --border 10 --output {out} {in} | BRD Story 3.2 |
| BR-27 | CLI timeout: 30 seconds | BRD Story 3.6 |
| BR-28 | Browser fallback: encode XML as base64, load in viewer.diagrams.net | BRD Story 3.3 |
| BR-29 | Browser screenshot wait: 3 seconds for diagram render | Implementation spec |
| BR-30 | Output PNG path: same directory, same filename, .drawio to .png | BRD Story 3.7 |
| BR-31 | Renderer detection cached for session (reset via resetRendererCache) | BRD Story 3.5 |
| BR-32 | Tool hidden from MCP list if no renderer (isExportPngAvailable = false) | BRD Story 3.6 |

#### 3.5.4 Data Specifications

**Input Data:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| file_path | string | Yes | .drawio extension, file exists | Path to diagram file |

**Output Data (success):**

| Field | Type | Description |
|-------|------|-------------|
| success | true | Export completed |
| file_path | string | Relative path to exported PNG |
| size_bytes | number | PNG file size |
| renderer | string | Which renderer was used |

**Output Data (error):**

| Field | Type | Description |
|-------|------|-------------|
| success | false | Export failed |
| error | string | Error description |

#### 3.5.5 API Contract (MCP Tool)

**Tool Name:** `drawio_export_png`
**Purpose:** Render .drawio file to PNG image for embedding in documents.

**Request:**

```json
{
  "file_path": "documents/F6-drawio-engine/diagrams/architecture.drawio"
}
```

**Response (success):**

```json
{
  "success": true,
  "file_path": "documents/F6-drawio-engine/diagrams/architecture.png",
  "size_bytes": 45672,
  "renderer": "drawio-cli"
}
```

**Response (error):**

```json
{
  "success": false,
  "error": "No renderer available. Install draw.io desktop or configure chrome-devtools-mcp."
}
```

---

### 3.6 Feature: Renderer Detection & Availability

**Source:** BRD Story 3, 6

#### 3.6.1 Description

Detect available PNG renderers at runtime. Check file system for draw.io CLI installation on Windows/macOS/Linux. Check orchestration engine for upstream MCP servers. Cache result for session performance.

#### 3.6.2 Use Case

**Use Case ID:** UC-06
**Actor:** MCP Server (tool registration phase)
**Preconditions:** Backend server starting up
**Postconditions:** Renderer type determined and cached

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Server | | Calls isExportPngAvailable() during tool registration |
| 2 | | Exporter | Check Windows paths: Program Files, LOCALAPPDATA |
| 3 | | Exporter | Check macOS paths: /Applications, /usr/local/bin |
| 4 | | Exporter | Check Linux paths: /usr/bin, /snap/bin, ~/.local/bin |
| 5 | | Exporter | Try PATH lookup via `where`/`which` command |
| 6 | | Exporter | If CLI found: cache "drawio-cli", return true |
| 7 | | Exporter | If not: check orchestration for chrome-devtools-mcp server |
| 8 | | Exporter | If not: check orchestration for puppeteer server |
| 9 | | Exporter | If none: cache "none", return false (tool hidden) |

#### 3.6.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-33 | Windows CLI paths: "C:\Program Files\draw.io\draw.io.exe", LOCALAPPDATA variant | Implementation |
| BR-34 | macOS CLI paths: /Applications/draw.io.app/Contents/MacOS/draw.io | Implementation |
| BR-35 | Linux CLI paths: /usr/bin/drawio, /snap/bin/drawio, ~/.local/bin/drawio | Implementation |
| BR-36 | PATH lookup timeout: 5 seconds | Implementation |
| BR-37 | Upstream server check: server.state must equal "ACTIVE" | Implementation |
| BR-38 | Cache persists for entire session (no re-detection per call) | Performance req |

---

## 4. Data Model

### 4.1 Logical Entities

#### Entity: DiagramGraph

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| nodes | DiagramNode[] | Yes | BR-04 | All non-container, non-root nodes |
| edges | DiagramEdge[] | Yes | BR-02 | All edges with valid source/target |
| containers | DiagramNode[] | Yes | BR-03 | Nodes detected as containers |

#### Entity: DiagramNode

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| id | string | Yes | BR-04 | Unique mxCell ID |
| parentId | string | Yes | BR-05 | Parent container ID |
| x | number | Yes | | X position (pixels) |
| y | number | Yes | | Y position (pixels) |
| width | number | Yes | | Width (pixels, default 80) |
| height | number | Yes | | Height (pixels, default 40) |
| style | string | Yes | BR-19 | Full draw.io style string |
| isContainer | boolean | Yes | BR-03 | Container flag |

#### Entity: DiagramEdge

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| id | string | Yes | | Unique mxCell ID |
| sourceId | string | Yes | BR-02 | Source node ID |
| targetId | string | Yes | BR-02 | Target node ID |
| style | string | Yes | BR-19 | Full draw.io edge style |

#### Entity: Waypoint

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| x | number | Yes | X coordinate |
| y | number | Yes | Y coordinate |

#### Entity: Issue

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| type | enum | Yes | node_overlap, edge_crossing, diagonal_edge |
| severity | enum | Yes | high, medium, low |
| fix_hint | string | Yes | Actionable fix instruction |
| node_a | string | Conditional | First node (overlaps) |
| node_b | string | Conditional | Second node (overlaps) |
| edge_id | string | Conditional | Edge (crossings/diagonals) |
| edge_source | string | Conditional | Edge source node |
| edge_target | string | Conditional | Edge target node |
| crosses_node | string | Conditional | Node that edge crosses |
| overlap_pct | number | Conditional | Overlap percentage |

**Relationships:**

| From Entity | To Entity | Cardinality | Description |
|-------------|-----------|-------------|-------------|
| DiagramGraph | DiagramNode | 1:N | Graph contains nodes |
| DiagramGraph | DiagramEdge | 1:N | Graph contains edges |
| DiagramGraph | DiagramNode (containers) | 1:N | Graph contains containers |
| DiagramNode | DiagramNode (children) | 1:N | Container has child nodes (via parentId) |
| DiagramEdge | DiagramNode (source) | N:1 | Edge originates from node |
| DiagramEdge | DiagramNode (target) | N:1 | Edge terminates at node |

---

## 5. Integration Specifications

### 5.1 External System: draw.io Desktop CLI

| Attribute | Value |
|-----------|-------|
| Purpose | PNG rendering — highest quality and fastest export |
| Direction | Outbound (SA4E calls CLI) |
| Data Format | CLI arguments (file paths) |
| Frequency | On-demand (per export request) |

**Interface:**

| SA4E Action | CLI Command | Direction |
|-------------|-------------|-----------|
| Export PNG | `drawio.exe --export --format png --border 10 --output {out} {in}` | Outbound |

**Error Handling:**

| Error | Detection | Recovery |
|-------|-----------|----------|
| CLI not installed | findDrawioCli returns null | Fall back to browser renderer |
| CLI timeout | execSync throws after 30s | Return error to agent |
| CLI crash | execSync throws | Return error to agent |

### 5.2 External System: Chrome DevTools MCP (Upstream)

| Attribute | Value |
|-----------|-------|
| Purpose | Fallback PNG rendering via browser screenshot |
| Direction | Outbound (SA4E calls upstream MCP) |
| Data Format | MCP tool calls (JSON) |
| Frequency | On-demand (when CLI unavailable) |

**Interface:**

| SA4E Action | Upstream Tool | Arguments |
|-------------|--------------|-----------|
| Navigate to viewer | navigate_page | url: viewer.diagrams.net with base64 XML |
| Take screenshot | take_screenshot | format: png, fullPage: true, filePath |

### 5.3 External System: Puppeteer MCP (Upstream)

| Attribute | Value |
|-----------|-------|
| Purpose | Secondary fallback PNG rendering |
| Direction | Outbound |
| Data Format | MCP tool calls (JSON) |
| Frequency | On-demand (when CLI and Chrome unavailable) |

### 5.4 Internal System: MCP Tool Registry

| Attribute | Value |
|-----------|-------|
| Purpose | Tool registration and routing |
| Direction | Bidirectional |
| Data Format | Tool definition objects + handler functions |
| Frequency | Once at startup (registration), per-call (routing) |

**Registration:**

| Tool | Module | Handler |
|------|--------|---------|
| drawio_auto_layout | Utility / Engine | handleDrawioLayout |
| drawio_export_png | Utility / Engine | handleDrawioExportPng |

---

## 6. Processing Logic

### 6.1 Process: Issue Detection Pipeline

**Trigger:** AI Agent calls drawio_auto_layout tool
**Input:** file_path (string)
**Output:** JSON with status + issues array

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Validate file_path (exists, .drawio extension) | Return error JSON |
| 2 | Read file, parse XML into DiagramGraph | Return error JSON on parse failure |
| 3 | Count nodes; if 0, return error | Return "No nodes found" |
| 4 | detectNodeOverlaps: O(n^2) pairwise check, same-parent only | Continue on individual failures |
| 5 | detectEdgeCrossings: for each edge, check against all non-endpoint nodes | Continue on individual failures |
| 6 | detectDiagonalEdges: for each edge, check dx/dy > 20px tolerance | Continue on individual failures |
| 7 | Aggregate issues; return already_good or needs_fix | Always returns valid JSON |

### 6.2 Process: PNG Export Pipeline

**Trigger:** AI Agent calls drawio_export_png tool
**Input:** file_path (string)
**Output:** JSON with success + file_path + size_bytes + renderer

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Validate file_path (exists, .drawio extension) | Return error JSON |
| 2 | Resolve to absolute path (workspace-relative if needed) | N/A |
| 3 | Compute output path (replace .drawio with .png) | N/A |
| 4 | Detect renderer (cached) | Return error if none |
| 5 | Execute export via detected renderer | Return error on failure |
| 6 | Verify output PNG exists and non-zero size | Return error if missing |
| 7 | Return success JSON with metadata | N/A |

### 6.3 Process: Overlap Detection Algorithm

**Pseudocode:**

```
function detectNodeOverlaps(graph):
  issues = []
  nodes = graph.nodes  // excludes containers
  for i = 0 to nodes.length - 1:
    for j = i+1 to nodes.length - 1:
      if nodes[i].parentId != nodes[j].parentId:
        continue  // BR-08: same-parent only
      
      // Compute intersection rectangle
      ox = max(0, min(a.x+a.width, b.x+b.width) - max(a.x, b.x))
      oy = max(0, min(a.y+a.height, b.y+b.height) - max(a.y, b.y))
      area = ox * oy
      if area <= 0: continue
      
      smaller = min(a.width*a.height, b.width*b.height)
      ratio = area / smaller
      if ratio > 0.50:  // BR-07: 50% threshold
        issues.push({type: "node_overlap", severity: "high", ...})
  
  return issues
```

### 6.4 Process: Edge-Node Crossing Detection

**Pseudocode:**

```
function detectEdgeCrossings(graph):
  issues = []
  nodeMap = Map(allNodes by id)
  
  for each edge in graph.edges:
    src = nodeMap.get(edge.sourceId)
    tgt = nodeMap.get(edge.targetId)
    sx, sy = center of src
    tx, ty = center of tgt
    
    for each node in graph.nodes:
      if node.id == edge.sourceId || node.id == edge.targetId:
        continue  // skip endpoints
      
      if lineCrossesRect(sx, sy, tx, ty, node):  // with 5px margin
        issues.push({type: "edge_crossing", severity: "medium", ...})
        break  // one issue per edge is enough
  
  return issues

function lineCrossesRect(x1, y1, x2, y2, node):
  // Cohen-Sutherland outcode approach
  margin = 5  // BR-09
  l, r, t, b = node bounds expanded by margin
  
  // Quick reject: line bounding box doesn't overlap rect
  if max(x1,x2) < l || min(x1,x2) > r: return false
  if max(y1,y2) < t || min(y1,y2) > b: return false
  
  // Compute outcodes
  c1 = outCode(x1, y1, l, t, r, b)
  c2 = outCode(x2, y2, l, t, r, b)
  
  if c1 & c2: return false  // both same side = no crossing
  if c1 == 0 || c2 == 0: return false  // endpoint inside (not a crossing)
  return true  // line passes through
```

### 6.5 Process: Exit/Entry Port Computation

**Pseudocode:**

```
function pickSide(dx, dy) -> [normalizedX, normalizedY]:
  // Returns 0-1 coordinates on the face of the node
  if abs(dx) > abs(dy):
    // Horizontal dominant
    if dx > 0: return [1, 0.5]    // right face
    else: return [0, 0.5]          // left face
  else:
    // Vertical dominant
    if dy > 0: return [0.5, 1]    // bottom face
    else: return [0.5, 0]          // top face

function computeExit(src, tgt):
  dx = center(tgt).x - center(src).x
  dy = center(tgt).y - center(src).y
  return pickSide(dx, dy)

function computeEntry(src, tgt):
  dx = center(src).x - center(tgt).x
  dy = center(src).y - center(tgt).y
  return pickSide(dx, dy)
```

---

## 7. Security Requirements

### 7.1 Authentication & Authorization

| Role | Permissions | Access |
|------|-------------|--------|
| AI Agent | Execute tools | MCP tool calls only (no direct file access outside workspace) |
| Backend Server | File system read/write | Limited to workspace directory |
| draw.io CLI | Execute | Spawned as child process with pipe stdio |

### 7.2 Data Sensitivity Classification

| Data Type | Classification | Business Requirement |
|-----------|---------------|---------------------|
| .drawio XML | Internal | Contains diagram structure (no secrets) |
| .png exports | Internal | Visual representation of diagrams |
| File paths | Internal | May reveal workspace structure |

### 7.3 Security Constraints

| Constraint | Implementation | Rationale |
|-----------|----------------|-----------|
| No network calls for layout | Layout is purely local computation | BR from NFR |
| CLI stdio piped | execSync with stdio: 'pipe' | Prevent output leakage |
| Path validation | Must be within workspace | Prevent path traversal |
| No external XML parser | Regex-based parsing | Avoid XML injection vectors |

---

## 8. Non-Functional Requirements

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
| Performance | Layout analysis completes quickly | < 2 seconds for diagrams up to 50 nodes |
| Performance | PNG export within timeout | < 30 seconds (CLI timeout enforced) |
| Reliability | Graceful degradation | If CLI unavailable, falls back to browser; if none, hides tool |
| Maintainability | No external XML dependencies | Regex-based parsing avoids npm vulnerability surface |
| Compatibility | Cross-platform path detection | Windows, macOS, Linux CLI paths detected |
| Determinism | Same input produces same output | Layout analysis deterministic for given graph |
| Availability | Tool availability detection | isExportPngAvailable() reports before registration |

---

## 9. Error Handling (User-Facing)

### 9.1 Error Scenarios

| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
| File not found | Warning | "File not found: {path}" | Agent creates file first, retries |
| Invalid extension | Warning | "Not a .drawio file" | Agent corrects file path |
| No nodes in diagram | Warning | "No nodes found in diagram" | Agent adds nodes to XML |
| No renderer available | Critical | "No renderer available. Install draw.io desktop..." | Agent skips PNG export or reports to user |
| CLI timeout | Warning | "Export failed: timeout" | Agent retries or reports |
| Analysis failure | Warning | "Analysis failed: {message}" | Agent logs and reports |
| PNG not created | Warning | "Export failed - PNG file was not created" | Agent retries with different renderer |

### 9.2 Error Response Format

All errors follow consistent JSON format:

```json
{"error": "Human-readable error message"}
```

For export tool:

```json
{"success": false, "error": "Human-readable error message"}
```

---

## 10. Testing Considerations

### 10.1 Test Scenarios

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-01 | Parse valid diagram with 5 nodes, 4 edges | Valid .drawio file | DiagramGraph with 5 nodes, 4 edges | High |
| TC-02 | Parse diagram with containers | File with swimlane nodes | Containers separated from regular nodes | High |
| TC-03 | Detect overlapping nodes (75% overlap) | Two overlapping mxCells | Issue with type=node_overlap, severity=high | High |
| TC-04 | No overlaps in clean diagram | Well-positioned nodes | status=already_good, issues=[] | High |
| TC-05 | Detect edge crossing through node | Edge line passes through intermediate node | Issue with type=edge_crossing | High |
| TC-06 | Detect diagonal edge | Nodes offset both horizontally and vertically > 20px | Issue with type=diagonal_edge | Medium |
| TC-07 | Export PNG via CLI (happy path) | Valid .drawio file, CLI installed | PNG file created, success=true | High |
| TC-08 | Export fallback to Chrome | CLI not installed, Chrome MCP available | PNG via screenshot, renderer=chrome-devtools-mcp | Medium |
| TC-09 | No renderer available | Neither CLI nor browser MCP | success=false, descriptive error | High |
| TC-10 | Same-parent overlap check | Nodes in different containers | No overlap reported (BR-08) | Medium |
| TC-11 | L-shape routing avoids obstacle | Edge with one intermediate node | Single waypoint computed | Medium |
| TC-12 | Z-shape routing when L-shape blocked | Edge with blocking obstacle on L-path | Multiple waypoints computed | Medium |
| TC-13 | Position writeback preserves styles | Graph with colored/styled nodes | Styles unchanged after writeLayout | High |
| TC-14 | File path validation (non-drawio) | file.txt path | Error: "Not a .drawio file" | Medium |
| TC-15 | Empty diagram (0 nodes) | drawio file with only root mxCells | Error: "No nodes found" | Medium |

---

## 11. Appendix

### State Diagram: Tool Execution Lifecycle

![State Diagram](diagrams/state-tool-lifecycle.png)

States:
- IDLE: Tool registered, waiting for call
- VALIDATING: Checking file_path and extension
- PARSING: Reading XML, extracting graph
- DETECTING: Running issue detection algorithms
- REPORTING: Building JSON response
- EXPORTING: Rendering PNG via detected renderer
- ERROR: Returning error JSON

### Sequence Diagram: Auto-Layout Tool Flow

![Sequence Diagram](diagrams/sequence-auto-layout.png)

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Sequence - Auto Layout | [sequence-auto-layout.png](diagrams/sequence-auto-layout.png) | [sequence-auto-layout.drawio](diagrams/sequence-auto-layout.drawio) |
| 3 | State - Tool Lifecycle | [state-tool-lifecycle.png](diagrams/state-tool-lifecycle.png) | [state-tool-lifecycle.drawio](diagrams/state-tool-lifecycle.drawio) |
