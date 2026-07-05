# Technical Design Document (TDD)

## SA4E — F6-drawio-engine: Draw.io Engine

---

## Document Information

| Field | Value |
|-------|-------|
| Ticket | F6-drawio-engine |
| Title | Draw.io Engine — XML Generation, Auto-Layout, PNG Export |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Related BRD | BRD-v1-F6-drawio-engine.docx |
| Related FSD | FSD-v1-F6-drawio-engine.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | SA Agent | Initial TDD from FSD and source code analysis |

---

## 1. Introduction

### 1.1 Purpose

This TDD specifies the technical design for the Draw.io Engine subsystem — how the XML parsing, issue detection, edge routing, position writeback, and PNG export modules are architected and interact within the SA4E backend.

### 1.2 Scope

Technical design of 5 TypeScript modules in `backend/src/engine/tools/`:
- drawio-parser.ts (XML parsing)
- drawio-tool.ts (issue detection, MCP tool handler)
- drawio-router.ts (orthogonal edge routing)
- drawio-writer.ts (position writeback)
- drawio-export-png.ts (PNG rendering)

### 1.3 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript | 5.x |
| Runtime | Node.js | >= 18.14 |
| Build | tsc + esbuild | Latest |
| Test | Vitest | Latest |
| External | draw.io Desktop CLI | Latest |
| Protocol | MCP (Model Context Protocol) | 1.0 |

### 1.4 Design Principles

- Zero external XML dependencies (regex-based parsing)
- Single Responsibility: each module has one concern
- Immutable data flow: Parser produces graph, Detector reads graph, Writer writes new XML
- Graceful degradation: missing renderers handled, tools hidden when unavailable
- Deterministic outputs: same input always produces same result

### 1.5 Constraints

- No external XML parser library (avoid npm dependency surface)
- CLI export timeout: 30 seconds hard limit
- Max 100 iterations for force-directed layout
- File system access limited to workspace directory
- MCP tool calls are synchronous (return JSON string)

### 1.6 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-F6-drawio-engine.docx |
| FSD | FSD-v1-F6-drawio-engine.docx |
| SA4E Architecture | .code-intel/SA4E-ARCHITECTURE.md |

---

## 2. System Architecture

### 2.1 Architecture Overview

The Draw.io Engine is a pure TypeScript module layer within the SA4E backend. It has no HTTP endpoints of its own — it is exposed exclusively through the MCP tool registry.

![Architecture Diagram](diagrams/architecture.png)

**Architecture pattern:** Pipeline (Parser -> Detector -> Router -> Writer -> Exporter)

**Key decisions:**
1. Regex-based parsing instead of DOM parser — eliminates xml2js/fast-xml-parser dependencies
2. Review mode (read-only detection) rather than auto-modify — gives AI agents control
3. Priority-based renderer detection with session caching — avoids repeated filesystem probes
4. Separate modules per concern — each file < 200 lines (SOLID/SRP compliant)

### 2.2 Component Diagram

![Component Diagram](diagrams/component.png)

| Component | Responsibility | File |
|-----------|---------------|------|
| DrawioParser | Extract DiagramGraph from XML | drawio-parser.ts |
| DrawioTool | MCP handler, issue detection orchestration | drawio-tool.ts |
| DrawioRouter | Compute orthogonal edge waypoints | drawio-router.ts |
| DrawioWriter | Write positions/anchors/waypoints back to XML | drawio-writer.ts |
| DrawioExportPng | Multi-renderer PNG export | drawio-export-png.ts |
| RegisterTools | Tool handler routing (switch case) | register-tools.ts |
| UtilityModule | Tool definitions for MCP discovery | UtilityModule.ts |

### 2.3 Communication Patterns

| From | To | Protocol | Pattern | Description |
|------|----|----------|---------|-------------|
| AI Agent | MCP Server | MCP (JSON-RPC) | Sync | Tool call with arguments |
| MCP Server | DrawioTool | Function call | Sync | handleDrawioLayout(args, workspace) |
| DrawioTool | DrawioParser | Function call | Sync | parseDrawio(filePath) |
| DrawioWriter | DrawioRouter | Function call | Sync | routeEdges(graph) |
| DrawioExportPng | draw.io CLI | Child process | Sync (execSync) | CLI with 30s timeout |
| DrawioExportPng | Orchestration Engine | Function call | Async | executeUpstreamTool |

---

## 3. API Design (MCP Tools)

### 3.1 Tool Overview

| # | Tool Name | Method | Description | Source |
|---|-----------|--------|-------------|--------|
| 1 | drawio_auto_layout | MCP tool call | Detect layout issues in .drawio file | UC-02 |
| 2 | drawio_export_png | MCP tool call | Export .drawio to PNG image | UC-05 |

### 3.2 Tool: drawio_auto_layout

**Implements:** UC-01, UC-02, UC-05 (BR-01 through BR-18)

| Attribute | Value |
|-----------|-------|
| Name | drawio_auto_layout |
| Category | utility |
| Handler | handleDrawioLayout in drawio-tool.ts |
| Return | JSON string (parsed by MCP SDK) |

**Input Schema (JSON Schema):**

```json
{
  "type": "object",
  "properties": {
    "file_path": {"type": "string", "description": "Path to .drawio file"},
    "algorithm": {"type": "string", "description": "layered|force|mrtree|radial"},
    "spacing": {"type": "number", "description": "Node spacing px (default 80)"},
    "direction": {"type": "string", "description": "DOWN|RIGHT|LEFT|UP"},
    "export_png": {"type": "boolean", "description": "Also export PNG"},
    "force": {"type": "boolean", "description": "Force re-layout"}
  },
  "required": ["file_path"]
}
```

**Response Variants:**

| Status | HTTP equiv | Structure |
|--------|-----------|-----------|
| already_good | 200 | `{status, message, nodes, edges, issues: []}` |
| needs_fix | 200 | `{status, message, nodes, edges, issues: [...]}` |
| error | 400/500 | `{error: "message"}` |

### 3.3 Tool: drawio_export_png

**Implements:** UC-05, UC-06 (BR-25 through BR-38)

| Attribute | Value |
|-----------|-------|
| Name | drawio_export_png |
| Category | utility |
| Handler | handleDrawioExportPng in drawio-export-png.ts |
| Conditional | Only registered if isExportPngAvailable() = true |

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "file_path": {"type": "string", "description": "Path to .drawio file"}
  },
  "required": ["file_path"]
}
```

**Response:**

| Status | Structure |
|--------|-----------|
| success | `{success: true, file_path, size_bytes, renderer}` |
| error | `{success: false, error: "message"}` |

---

## 4. Data Structures (No Database)

This module has no persistent storage. All data is in-memory during a single tool call, read from and written to .drawio files on the filesystem.

### 4.1 Core Interfaces (drawio-parser.ts)

```typescript
interface DiagramNode {
  id: string;
  parentId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style: string;
  isContainer: boolean;
}

interface DiagramEdge {
  id: string;
  sourceId: string;
  targetId: string;
  style: string;
}

interface DiagramGraph {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  containers: DiagramNode[];
}
```

### 4.2 Routing Interface (drawio-router.ts)

```typescript
interface Waypoint {
  x: number;
  y: number;
}

// Return type: Map<edgeId, Waypoint[]>
```

### 4.3 File I/O Patterns

| Operation | Method | Description |
|-----------|--------|-------------|
| Read .drawio | fs.readFileSync(path, 'utf-8') | Synchronous read |
| Write .drawio | fs.writeFileSync(path, xml, 'utf-8') | Synchronous write |
| Check existence | fs.existsSync(path) | Pre-validation |
| Get file stats | fs.statSync(path) | PNG size check |

---

## 5. Class / Module Design

### 5.1 Module Structure

```
backend/src/engine/tools/
├── drawio-parser.ts      # XML parsing (exports: parseDrawio, DiagramGraph, DiagramNode, DiagramEdge)
├── drawio-tool.ts        # MCP handler + detection (exports: DRAWIO_TOOL_DEFINITION, handleDrawioLayout)
├── drawio-router.ts      # Edge routing (exports: routeEdges, Waypoint)
├── drawio-writer.ts      # Position writeback (exports: writeLayout)
├── drawio-export-png.ts  # PNG export (exports: handleDrawioExportPng, isExportPngAvailable, ...)
└── register-tools.ts     # Tool routing (switch case dispatch)
```

### 5.2 Module Dependencies (Import Graph)

```
drawio-tool.ts
  └── imports drawio-parser.ts (parseDrawio, DiagramGraph, DiagramNode)

drawio-writer.ts
  ├── imports drawio-parser.ts (DiagramGraph, DiagramNode)
  └── imports drawio-router.ts (routeEdges, Waypoint)

drawio-router.ts
  └── imports drawio-parser.ts (DiagramGraph, DiagramNode)

drawio-export-png.ts
  └── imports: fs, path, child_process (Node.js built-ins only)

register-tools.ts
  ├── imports drawio-tool.ts (handleDrawioLayout)
  └── imports drawio-export-png.ts (handleDrawioExportPng)
```

### 5.3 Key Functions Per Module

**drawio-parser.ts:**

| Function | Signature | Complexity | Description |
|----------|-----------|------------|-------------|
| parseDrawio | (filePath: string) => {raw, graph} | O(n) | Entry point — read file + extract graph |
| extractGraph | (xml: string) => DiagramGraph | O(n) | Regex-based cell extraction |
| parseGeometry | (body, attrs) => {x,y,w,h} or null | O(1) | Extract position from mxGeometry |
| parseAttrs | (attrStr: string) => Record<string,string> | O(k) | Parse XML attributes |
| hasChildren | (nodeId, cells) => boolean | O(n) | Check if node has child cells |
| isContainerStyle | (style, w, h) => boolean | O(1) | Detect container from style |

**drawio-tool.ts:**

| Function | Signature | Complexity | Description |
|----------|-----------|------------|-------------|
| handleDrawioLayout | (args, workspace) => string | O(n^2) | MCP handler entry point |
| detectAllIssues | (graph) => object[] | O(n^2+e*n) | Aggregate all issue types |
| detectNodeOverlaps | (graph) => object[] | O(n^2) | Pairwise overlap check |
| detectEdgeCrossings | (graph) => object[] | O(e*n) | Edge vs node intersection |
| detectDiagonalEdges | (graph) => object[] | O(e) | dx/dy tolerance check |
| overlapRatio | (a, b) => number | O(1) | Intersection area / smaller area |
| lineCrossesRect | (x1,y1,x2,y2,node) => boolean | O(1) | Cohen-Sutherland outcode test |

**drawio-router.ts:**

| Function | Signature | Complexity | Description |
|----------|-----------|------------|-------------|
| routeEdges | (graph) => Map<string, Waypoint[]> | O(e*n) | Route all edges |
| computeRoute | (src, tgt, obstacles) => Waypoint[] | O(n) | Single edge routing |
| orthogonalRoute | (start, end, obstacles) => Waypoint[] | O(n) | L/Z-shape computation |
| lineIntersectsRect | (a, b, node) => boolean | O(1) | Line-rect intersection |
| exitPort / entryPort | (src, tgt) => Waypoint | O(1) | Compute port positions |

**drawio-writer.ts:**

| Function | Signature | Complexity | Description |
|----------|-----------|------------|-------------|
| writeLayout | (rawXml, graph, filePath) => void | O(n+e) | Orchestrate all writes |
| applyPositions | (xml, nodes) => string | O(n) | Update mxGeometry coords |
| applyEdgeAnchors | (xml, graph) => string | O(e) | Set exit/entry style props |
| applyEdgeRouting | (xml, graph) => string | O(e) | Insert waypoint arrays |
| computeExit/Entry | (src, tgt) => [number, number] | O(1) | Face selection |
| pickSide | (dx, dy) => [number, number] | O(1) | Dominant axis logic |

**drawio-export-png.ts:**

| Function | Signature | Complexity | Description |
|----------|-----------|------------|-------------|
| handleDrawioExportPng | (args, workspace, engine?) => string | O(1) | MCP handler |
| detectRenderer | (engine?) => RendererType | O(1) amortized | Cached detection |
| isExportPngAvailable | (engine?) => boolean | O(1) | Registration gate |
| exportWithCli | (input, output) => void | O(1) | CLI spawn |
| exportWithChrome | (input, output, workspace, engine) => void | O(1) | Browser screenshot |
| findDrawioCli | () => string or null | O(k) | Path scanning |

### 5.4 Design Patterns

| Pattern | Where Used | Rationale |
|---------|-----------|-----------|
| Strategy | Renderer selection (CLI/Chrome/Puppeteer) | Multiple implementations of same interface |
| Pipeline | Parser -> Detector -> Router -> Writer | Sequential data transformation |
| Facade | handleDrawioLayout, handleDrawioExportPng | Simple interface hiding complexity |
| Singleton (cached) | detectRenderer cached result | Avoid repeated filesystem probes |
| Null Object | Empty waypoint array for clean edges | Avoid null checks in downstream |

### 5.5 Error Handling

| Error Source | Detection | Recovery | User Message |
|-------------|-----------|----------|--------------|
| File not found | fs.existsSync check | Return error JSON immediately | "File not found: {path}" |
| Invalid extension | string.endsWith check | Return error JSON | "Not a .drawio file" |
| Parse failure | try-catch around parseDrawio | Return error JSON | "Analysis failed: {message}" |
| CLI timeout | execSync timeout option | Throw, caught in handler | "Export failed: timeout" |
| PNG not created | fs.existsSync after export | Return error JSON | "Export failed - PNG not created" |
| No renderer | detectRenderer returns "none" | Tool not registered | Tool hidden from MCP |

---

## 6. Integration Design

### 6.1 External System: draw.io Desktop CLI

| Attribute | Value |
|-----------|-------|
| Protocol | Child process (execSync) |
| Command | `"{cliPath}" --export --format png --border 10 --output "{out}" "{in}"` |
| Timeout | 30000ms |
| stdio | pipe (suppress output) |
| Error handling | execSync throws on non-zero exit |

**CLI Path Detection:**

| Platform | Paths Checked |
|----------|---------------|
| Windows | `C:\Program Files\draw.io\draw.io.exe`, `%LOCALAPPDATA%\Programs\draw.io\draw.io.exe` |
| macOS | `/Applications/draw.io.app/Contents/MacOS/draw.io`, `/usr/local/bin/drawio` |
| Linux | `/usr/bin/drawio`, `/snap/bin/drawio`, `~/.local/bin/drawio` |
| Fallback | `where drawio` (Win) / `which drawio` (Unix) — 5s timeout |

### 6.2 Internal System: MCP Tool Registry

**Registration flow:**

1. UtilityModule.getToolDefinitions() returns tool definition objects
2. ModuleRegistry collects all definitions from all modules
3. Tools are vectorized (ONNX embedding) and stored in mcp_tools table
4. find_tools returns matching tools to agents
5. execute_dynamic_tool routes to handler via register-tools.ts switch

**Conditional registration:**

```typescript
// drawio_export_png only registered if renderer available
if (isExportPngAvailable(orchestrationEngine)) {
  tools.push(DRAWIO_EXPORT_PNG_DEFINITION);
}
```

### 6.3 Internal System: Upstream MCP Servers (Chrome/Puppeteer)

| Attribute | Value |
|-----------|-------|
| Protocol | MCP tool call (via orchestrationEngine.executeUpstreamTool) |
| Discovery | hasUpstreamServer checks orchestrationEngine.getStatus().servers |
| Server state | Must be "ACTIVE" |
| Wait time | 3000ms sleep after navigation (diagram render time) |

---

## 7. Security Design

### 7.1 Path Validation

All file_path inputs are validated:
- Must end with `.drawio` extension
- Resolved relative to workspace root (prevents traversal)
- Checked for existence before processing

### 7.2 Process Isolation

- CLI spawned with `stdio: 'pipe'` — no terminal output leakage
- execSync with explicit timeout prevents infinite hangs
- No network calls in layout/detection code (purely local)

### 7.3 Input Validation

| Input | Validation | Sanitization |
|-------|-----------|--------------|
| file_path | .drawio extension, exists | path.resolve against workspace |
| algorithm | Enum check (layered/force/mrtree/radial) | Default to "layered" |
| spacing | typeof number check | Default to 80 |
| direction | Enum check (DOWN/RIGHT/LEFT/UP) | Default to "DOWN" |

### 7.4 Regex Safety

- Regex patterns use escapeRegex() for node IDs (prevents ReDoS)
- No eval() or dynamic code execution
- XML content treated as opaque string (no interpretation beyond mxCell extraction)

---

## 8. Performance & Scalability

### 8.1 Performance Characteristics

| Operation | Complexity | Target | Notes |
|-----------|-----------|--------|-------|
| XML Parsing | O(n) where n = cells | < 100ms for 50 nodes | Single regex pass |
| Overlap Detection | O(n^2) pairwise | < 500ms for 50 nodes | Same-parent filter reduces n |
| Edge Crossing Detection | O(e*n) | < 500ms for 50 nodes, 40 edges | Break on first crossing per edge |
| Edge Routing | O(e*n) | < 200ms | Most edges don't need routing |
| Position Writeback | O(n+e) regex replacements | < 100ms | String operations |
| PNG Export (CLI) | O(1) subprocess | < 30s (timeout) | External process |

### 8.2 Caching Strategy

| Cache | What | TTL | Eviction |
|-------|------|-----|----------|
| Renderer type | Detected RendererType | Session | resetRendererCache() |
| CLI path | Absolute path to drawio.exe | Session | Same as above |

No other caching needed — each tool call is independent and reads fresh file content.

### 8.3 Scalability Notes

- Engine processes one diagram at a time (no parallel processing needed)
- Memory: DiagramGraph held only during single tool call, then GC'd
- For very large diagrams (100+ nodes): O(n^2) overlap detection is acceptable because diagrams this large are rare and 10K comparisons is fast

---

## 9. Monitoring & Observability

### 9.1 Logging

| Log Event | Level | Fields | Destination |
|-----------|-------|--------|-------------|
| Renderer detected | INFO | renderer, path | stderr (console.error) |
| No renderer available | WARN | — | stderr |
| Export success | DEBUG | file_path, renderer, size | Tool response JSON |
| Export failure | ERROR | file_path, error message | Tool response JSON |
| Analysis failure | ERROR | file_path, exception | Tool response JSON |

### 9.2 Observability via Tool Response

Since tools return structured JSON, monitoring is implicit:
- `status: "already_good"` → clean diagram
- `status: "needs_fix"` + issue count → tracks diagram quality
- `success: false` → export failures tracked

---

## 10. Deployment Considerations

### 10.1 Prerequisites

| Dependency | Required | Impact if Missing |
|-----------|----------|-------------------|
| draw.io Desktop | Recommended | PNG export falls back to browser renderers |
| Node.js >= 18.14 | Required | Engine won't run |
| Workspace write access | Required | Cannot write .drawio/.png files |
| chrome-devtools-mcp server | Optional | Fallback renderer unavailable |

### 10.2 Configuration

No runtime configuration needed. All behavior is determined by:
- File system state (is draw.io CLI installed?)
- Orchestration state (are upstream MCP servers active?)
- Tool call arguments

### 10.3 Rollback Strategy

Engine is stateless — rollback is simply reverting the TypeScript source files. No database migrations, no persistent state to worry about.

---

## 11. Implementation Checklist

### Files to Create/Modify

| # | File | Action | Description |
|---|------|--------|-------------|
| 1 | backend/src/engine/tools/drawio-parser.ts | EXISTS | XML parsing module |
| 2 | backend/src/engine/tools/drawio-tool.ts | EXISTS | Issue detection + MCP handler |
| 3 | backend/src/engine/tools/drawio-router.ts | EXISTS | Orthogonal edge routing |
| 4 | backend/src/engine/tools/drawio-writer.ts | EXISTS | Position writeback |
| 5 | backend/src/engine/tools/drawio-export-png.ts | EXISTS | PNG export with renderers |
| 6 | backend/src/engine/tools/register-tools.ts | EXISTS | Tool routing (switch case) |
| 7 | backend/src/modules/utility/UtilityModule.ts | EXISTS | Tool definitions |
| 8 | backend/tests/unit/drawio-parser.test.ts | CREATE | Parser unit tests |
| 9 | backend/tests/unit/drawio-tool.test.ts | CREATE | Detection unit tests |
| 10 | backend/tests/unit/drawio-router.test.ts | CREATE | Routing unit tests |
| 11 | backend/tests/unit/drawio-writer.test.ts | CREATE | Writer unit tests |
| 12 | backend/tests/unit/drawio-export-png.test.ts | CREATE | Export unit tests |
| 13 | backend/tests/integration/drawio-e2e.test.ts | CREATE | End-to-end integration |
| 14 | backend/tests/fixtures/sample.drawio | CREATE | Test fixture diagram |

### Implementation Order

1. Unit tests for parser (validate regex extraction)
2. Unit tests for detector (validate overlap/crossing/diagonal)
3. Unit tests for router (validate L-shape/Z-shape)
4. Unit tests for writer (validate XML output)
5. Integration test: parse + detect + route + write full cycle
6. Export tests (mock CLI subprocess)

---

## 12. Appendix

### Glossary

| Term | Definition |
|------|------------|
| mxGraphModel | Root XML element of draw.io format |
| mxCell | Individual node or edge element |
| mxGeometry | Position/size sub-element |
| Cohen-Sutherland | Line clipping algorithm using 4-bit outcodes |
| Orthogonal routing | Edges with only horizontal/vertical segments |
| L-shape route | Single bend point connecting source to target |
| Z-shape route | Multiple bend points bypassing obstacles |
| MCP | Model Context Protocol for AI tool communication |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture Overview | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component Diagram | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
