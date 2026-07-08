---
name: drawio
description: Always use when user asks to create, generate, draw, or design a diagram, flowchart, architecture diagram, ER diagram, sequence diagram, class diagram, network diagram, mockup, wireframe, or UI sketch, or mentions draw.io, drawio, drawoi, .drawio files, or diagram export to PNG/SVG/PDF.
inclusion: manual
---

# Draw.io Diagram Skill

Generate `.drawio` files (native mxGraphModel XML). Export to PNG/SVG/PDF with embedded diagram XML.

## ⛔ CRITICAL: Edge Routing Rules

**BEFORE generating, search KB:** `mem_search("drawio layout pattern proven", detail=true)`

**MANDATORY on FIRST attempt:**
1. NEVER `edgeStyle=orthogonalEdgeStyle` when edge crosses other nodes
2. ALWAYS explicit waypoints (`<Array as="points">`) for fan-out (1→3+) and fan-in (3+→1)
3. Fan-out pattern: left/right branches get waypoints `{x: target.centerX, y: source.bottom+50}`, center = no waypoints
4. Fan-in pattern: left/right sources get waypoints `[{x: src.centerX, y: target.top-50}, {x: target.centerX, y: target.top-50}]`
5. ONLY use orthogonalEdgeStyle for: self-loops, simple 1:1 adjacent edges, short swimlane connections
6. Simple 2-way (Yes/No) branches: orthogonalEdgeStyle is fine

## Workflow

### Standard Flow (Quality-First)

1. **Plan** — Identify diagram type, shapes, relationships, layout direction (TB/LR)
2. **Generate XML** → write `.drawio` file
3. **Validate** — Check structural integrity:
   - No self-closing edges (MUST have `<mxGeometry>` child)
   - No dangling edges (source/target IDs must exist)
   - No duplicate IDs
   - No overlapping shapes (min 80px gap)
   - Correct wrapper (`<mxGraphModel>` or `<mxfile><diagram>` for Use Case)
4. **Auto-layout** — Call `drawio_auto_layout(file_path="<path>")` → fix issues until 0
5. **Export PNG** — Call `drawio_export_png(file_path="<absolute_path>")` 
6. **Vision Self-Check** (MANDATORY for quality):
   - Read the exported PNG using vision capability
   - Check for: overlapping shapes, clipped labels, missing connections, off-canvas shapes, edge-shape overlap, stacked edges, edge-label overlap
   - If issues found → auto-fix XML → re-export → re-check
   - Max **2 self-check rounds** — if issues remain after 2 fixes, proceed
7. **Done** — Report file paths

### Self-Check Criteria

| Check | What to look for | Auto-fix |
|-------|-----------------|----------|
| Overlapping shapes | Two+ shapes stacked | Shift apart by ≥200px |
| Clipped labels | Text cut off at boundaries | Increase shape width/height |
| Missing connections | Arrows not connecting to shapes | Verify source/target IDs |
| Off-canvas shapes | Negative coords or far from main group | Move to positive coords |
| Edge-shape overlap | Edge crosses through unrelated shape | Add waypoints to route around |
| Stacked edges | Multiple edges on same path | Distribute exit/entry points |
| Edge-label overlap | Label overlaps another element | Add `labelBackgroundColor=#ffffff` + offset |

### Quality Standards

- **Node spacing:** minimum 80px between nodes, 120px preferred
- **Edge labels:** always `labelBackgroundColor=#ffffff;fontSize=10` for readability
- **Consistent sizing:** same-type nodes should have same dimensions
- **Color meaning:** use color to convey semantic grouping, not decoration
- **Title:** every diagram MUST have a title cell (fontSize=14, fontStyle=1)
- **Legend:** if >3 colors used, add a legend section

## Output Format

- No format specified → `name.drawio`
- Format requested → `name.drawio.png` / `.drawio.svg` / `.drawio.pdf` (double extension = embedded XML)
- Delete `.drawio` after successful export
- Filename: lowercase, hyphens, descriptive (`login-flow`, `database-schema`)

## XML Structure

```xml
<mxGraphModel adaptiveColors="auto">
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
  </root>
</mxGraphModel>
```

- `id="0"` = root, `id="1"` = default parent (both mandatory)
- All elements: `parent="1"` unless using layers/containers
- Use bare `<mxGraphModel>` for all diagrams EXCEPT Use Case (which uses `<mxfile><diagram>` wrapper)

## Reasoning Budget

**Do:** Identify diagram type + grouping (1-2 sentences) → emit XML directly.

**Do NOT:**
- Self-closing edges (MUST have `<mxGeometry relative="1" as="geometry"/>` child)
- Wrap in `<mxfile>` (except Use Case diagrams)
- Debate layout choices, compute coordinates in prose, narrate progress
- Add waypoints for non-use-case diagrams (ELK handles routing)
- Set exitX/exitY/entryX/entryY unless specific intent
- Include XML comments (`<!-- -->`)

## Grid Placement

| Diagram Type | Column X | Row Y | Node Sizes |
|---|---|---|---|
| Default | col*220+60 | row*160+60 | rect 160×70, diamond 140×80, circle 60×60, doc 140×80, cylinder 120×70 |
| Class | col*300+40 | row*160+60 | wider boxes |
| State | col*250+60 | row*160+60 | medium |

Min gap: 80px between nodes.

## Color Palette

| Category | fill | stroke |
|---|---|---|
| Primary/Info | #e1f5fe / #dae8fc | #0288d1 / #6c8ebf |
| Success/Service | #e8f5e9 / #d5e8d4 | #388e3c / #82b366 |
| Warning | #fff3e0 / #fff2cc | #f57c00 / #d6b656 |
| Error | #fce4ec | #c62828 |
| Purple (UI/Data) | #f3e5f5 / #e1d5e7 | #7b1fa2 / #9673a6 |
| Neutral | #f5f5f5 | #666666 |

Font: nodes=11, edges=10, titles=13+bold.

## Shape Styles

| Shape | Style |
|---|---|
| Rounded rect | `rounded=1;whiteSpace=wrap;html=1;` |
| Diamond | `rhombus;whiteSpace=wrap;html=1;` |
| Ellipse | `ellipse;whiteSpace=wrap;html=1;` |
| Cylinder (DB) | `shape=cylinder3;whiteSpace=wrap;html=1;` |
| Document | `shape=mxgraph.flowchart.document;whiteSpace=wrap;html=1;` |
| Actor | `shape=actor;whiteSpace=wrap;html=1;` |
| Lifeline | `shape=umlLifeline;perimeter=lifelinePerimeter;size=16;` |
| System boundary | `shape=rectangle;dashed=1;fillColor=none;strokeColor=#666666;verticalAlign=top;fontStyle=1;fontSize=14;spacingTop=10;html=1;` |

## Edge Styles

| Type | Syntax | Use |
|---|---|---|
| Orthogonal | `edgeStyle=orthogonalEdgeStyle` | Flowcharts, architecture, BPMN |
| Straight | (no edgeStyle) | UML class/sequence |
| Entity Relation | `edgeStyle=entityRelationEdgeStyle` | ER diagrams |
| Curved | `curved=1` | Mind maps |

Standard edge: `edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=classic;endSize=6;`
Attributes: `rounded=1`, `endArrow=classic/none`, `dashed=1`, `strokeWidth=2`, `value="label"`

**CRITICAL:** Every edge MUST have child `<mxGeometry relative="1" as="geometry"/>`. Self-closing = invisible arrows.

State/Class diagrams: ALWAYS use `source="id" target="id"` (not sourcePoint/targetPoint).

## Self-Call (Sequence Diagram)

```xml
<mxCell id="self1" value="validate()" style="html=1;endSize=6;startSize=6;" edge="1" parent="1">
  <mxGeometry relative="1" as="geometry">
    <mxPoint x="350" y="200" as="sourcePoint"/>
    <mxPoint x="350" y="230" as="targetPoint"/>
    <Array as="points">
      <mxPoint x="400" y="200"/>
      <mxPoint x="400" y="230"/>
    </Array>
  </mxGeometry>
</mxCell>
```

Rules: same X for source/target (on lifeline), Y increases (arrow DOWN), 2 waypoints at lifeline_x+50.

## Self-Loop (State Diagram)

Use `source="nodeId" target="nodeId"` with orthogonalEdgeStyle — draw.io auto-renders loop. Or manual: sourcePoint/targetPoint on same side, 2 waypoints at node.x-60.

## HTML Labels

- Always include `html=1` in style
- XML-escape: `&lt;` `&gt;` `&amp;` `&quot;`
- Newline: `&#10;` (universal) or `&lt;br&gt;` (needs html=1). NEVER `\n`
- fontStyle: 1=bold, 2=italic, 4=underline, 3=bold+italic
- Partial formatting: `&lt;b&gt;Title&lt;/b&gt;&lt;br&gt;desc`

## Containers

| Type | Style | Use |
|---|---|---|
| Group (invisible) | `group;` | No border, no connections |
| Swimlane (titled) | `swimlane;startSize=30;` | Visible header, connectable |
| Custom | `container=1;pointerEvents=0;` on any shape | Any shape as container |

Children: `parent="containerId"`, relative coordinates. Cross-container edges: `parent="1"`.

### BPMN Swimlanes

- Lane: `x=0, y=lane_index*150, width=CANVAS_W, height=150`
- Style: `swimlane;horizontal=0;startSize=110;fillColor=<pastel>;html=1;`
- Children: `x=120+col*180, y=45`, size 140×60
- Colors: #f5f5f5, #e8f4f8, #fff0e6, #e8f5e9, #fff9e6, #fce4ec
- Cross-lane edges: `parent="1"`. No nested pools. No varying heights.

### Nested Architecture (Cloud/Infra)

- Each level = `swimlane;startSize=24;`
- Children: `parent="<container_id>"`, relative coords
- Cross-container edges: `parent="1"`

### Cross-Functional Table

- Outer: `shape=table;childLayout=tableLayout;startSize=0;collapsible=0;fillColor=none;`
- Rows: `shape=tableRow;horizontal=0;startSize=0;collapsible=0;`
- Cells: regular vertices per intersection
- Process nodes inside cells, cross-cell edges at `parent="1"`

## Use Case Diagrams

**MUST use `<mxfile><diagram>` wrapper.** Page: 1169×827 (A3 landscape).

Rules:
1. FREE-FORM placement (no grid)
2. System boundary: dashed rectangle (NOT swimlane). UCs flat at `parent="1"`
3. Actor: `shape=actor;whiteSpace=wrap;html=1;` (NOT umlActor)
4. Actor→UC edges: NO edgeStyle, WITH waypoints through corridors
5. Corridor: left actors x=160-200, right actors x=actor_x+40
6. Waypoint Y ≈ UC's center Y
7. Merge point: same waypoint coord when 2+ actors → same UC
8. Direct line only when aligned ±20px with no obstacles
9. `<<include>>`/`<<extend>>`: `dashed=1;endArrow=open;fontSize=9;fontStyle=2;` (orthogonal OK for UC→UC)
10. UML compliance: actor→UC = solid (no dashed), no arrowhead. Dashed only on UC border for automated UCs
11. UC size: 200×70 or 220×80
12. Color-code by group: blue=#dae8fc, green=#d5e8d4, yellow=#fff2cc, purple=#e1d5e7
13. Legend: colored ellipses (16×12), NOT emoji
14. After creation, call `drawio_auto_layout` — accept result (tool doesn't understand waypoints)

## Layers

Layer = `mxCell` with `parent="0"` (no vertex/edge). Assign shapes via `parent="layerId"`. Later = higher z-order. `visible="0"` to hide by default.

## Tags & Metadata

Require `<object>` wrapper. Tags: `tags="critical v2"` (space-separated). Metadata: custom attributes. Placeholders: `placeholders="1"` enables `%key%` substitution. Predefined: `%id%`, `%date%`, `%filename%`, etc.

## Dark Mode

`adaptiveColors="auto"` on mxGraphModel. Explicit colors auto-invert. Override: `light-dark(lightColor,darkColor)`.

## ELK Auto-Routing

Vertices pinned, ELK recomputes bend points. Reverts if worse. No manual waypoints needed (except Use Case + fan-out/fan-in).

## Post-Layout (optional)

| Value | Algorithm | Use |
|---|---|---|
| verticalFlow | layered DOWN | Flowcharts |
| horizontalFlow | layered RIGHT | Pipelines |
| tree | mrtree | Org charts |
| force | force | Networks |
| stress | stress | General graphs |
| radial | radial | Concentric |

Usually omit. Only when user wants canonical layout.

## PNG Export via MCP Tool (PREFERRED)

**ALWAYS use MCP tool `export_drawio` first** — it uses headless Chromium, no CLI install needed:

```
execute_dynamic_tool(
  tool_name = "export_drawio",
  arguments = {
    "file_path": "<ABSOLUTE path to .drawio file>",
    "format": "png"   // or "svg", "pdf"
  }
)
```

**Rules:**
1. MUST use **absolute path** (e.g., `c:/projects/kiro/FEC_CR_Builder/documents/KSA-120/diagrams/use-case.drawio`)
2. Relative paths resolve to orchestrator workspace (may be WRONG workspace)
3. Output: same directory, same name with `.png` extension
4. Verify: `bytes_written` > 1000 in response
5. Supports: png, svg, pdf formats

**Example:**
```json
{
  "tool_name": "export_drawio",
  "arguments": {
    "file_path": "c:/projects/kiro/FEC_CR_Builder/documents/KSA-120/diagrams/architecture.drawio",
    "format": "png"
  }
}
```

## CLI Export (FALLBACK — only if MCP tool unavailable)

**Discover dynamically (NEVER hardcode):**

Windows: `where.exe draw.io 2>$null` then search `C:\Program Files`
macOS: `/Applications/draw.io.app/Contents/MacOS/draw.io`
Linux: `which drawio` or `/snap/bin/drawio`

**Command:**
```
drawio -x -f <format> -e -b 10 --no-sandbox --timeout 30000 -o <output> <input.drawio>
```

Flags: `-x`=export, `-f`=format, `-e`=embed XML, `-b`=border, `--no-sandbox`=ALWAYS on Windows, `--timeout`=ms.

**Not found:** Keep `.drawio`, inform user to install from https://www.drawio.com/

**Open:** Windows=`start`, macOS=`open`, Linux=`xdg-open`

## Post-Generation Verification (MANDATORY)

1. Export PNG via MCP tool `export_drawio` (preferred) or CLI (fallback)
2. Validate: no self-closing edges, correct wrapper, no comments, no wrong self-call direction
3. Fix immediately if issues found
4. Re-export, verify PNG > 1KB
5. Max 3 retries. Report remaining issues to user.

**Timeout:** increase to 60000ms or simplify diagram. Split complex diagrams.

## Component Diagram Patterns

- Inheritance arrow: `endArrow=block;endSize=12;endFill=0` (hollow triangle, NOT classic)
- Abstract class: add `fontStyle=2` (italic) to style
- Singleton: note `(Singleton)` in label
- Method signatures in labels: `spawn() / kill() / restart()`
- Existing/unchanged components: `fillColor=#f5f5f5;strokeColor=#666666`
- Fan-out extends: use straight lines (no edgeStyle), NOT orthogonal

## Architecture Diagram Patterns

- System boundary: `rounded=1;dashed=1;dashPattern=5 5;fillColor=none;strokeColor=#0288d1;verticalAlign=top;fontSize=12;arcSize=8`
- Actor outside boundary (x=40), components inside (x=160+)
- Layered layout: top=managers, middle=UI components, bottom=external systems
- Bidirectional: `startArrow=classic;startSize=6;endArrow=classic;endSize=6`
- Events/callbacks: `dashed=1` edges
- Storage: `shape=cylinder3;boundedLbl=1;backgroundOutline=1;size=10`
- UML Actor: `shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top`

## Deployment Diagram Patterns

- Package boundary: large rect with `fillColor=none;strokeColor=#6c8ebf;verticalAlign=top;spacingTop=5`
- Size annotations in labels: `~30MB`, `~500KB`
- Platform variants: same style, side-by-side, connected with `dashed=1` "one of" edges
- CI/CD and Marketplace: `fillColor=#e1f5fe;strokeColor=#0288d1`

## Edge Semantics

| Style | Meaning |
|-------|---------|
| Solid + classic arrow | Creation, invocation, data flow |
| Dashed + classic arrow | Dependency, event, callback |
| Solid + block hollow arrow | Inheritance (extends) |
| Solid + diamond arrow | Composition |
| Bidirectional (start+end arrows) | Two-way communication |

## Troubleshooting

| Problem | Fix |
|---|---|
| CLI not found | Keep .drawio, inform user |
| Blank diagram | Check id="0" and id="1" exist |
| Invisible edges | Add mxGeometry child to every edge |
| Self-call wrong dir | Waypoint Y must increase |
| PNG < 1KB | Export failed, re-check XML |
| Timeout | --timeout 60000 or simplify |

## XML Well-formedness

- NO XML comments ever
- Escape: `&amp;` `&lt;` `&gt;` `&quot;`
- Unique IDs for all cells

## Project Patterns (KSA-120)

### Business Flow
- `<mxfile>` wrapper. Ellipse→rounded rect→diamond→branches→end
- Title: fontSize=14;fontStyle=1. Start: ellipse blue. Process: rounded green. Decision: diamond orange. Error: red. UI: purple
- Normal=solid arrows, error=dashed, decision labels=fontSize=10, newline=`&#10;`

### Use Case
- `<mxfile><diagram>` wrapper, A3 landscape
- Actors: shape=actor (w=40,h=60). UCs: ellipse with color coding
- Actor→UC: plain style + waypoints. Include/extend: dashed+open arrow
- IDs: actor_prefix, uc+num+_node, e_description

### ER Diagram (Entity Relationship)
- Wrapper: `<mxfile><diagram>` with pageWidth=850, pageHeight=1100
- Entity style: `rounded=0;whiteSpace=wrap;html=1;align=left;spacingLeft=10;verticalAlign=top;spacingTop=5;fillColor=<color>;strokeColor=<color>;fontSize=11`
- Entity content format: `<b>EntityName</b>&#10;─────────────&#10;field1: type&#10;field2: type`
- Relationships: orthogonalEdgeStyle with label = `1:N description` or `1:1 description`
- Color per domain: Orange=server/state, Purple=UI/webview, Green=config, Blue=tree/sidebar
- Node size: 180×100-140px

### State Machine Diagram
- Wrapper: `<mxfile><diagram>`
- Initial state: `ellipse;shape=doubleCircle;fillColor=#000000;strokeColor=#000000` (30×30)
- States: `rounded=1;whiteSpace=wrap;html=1;fillColor=<color>;strokeColor=<color>;fontSize=11`
- State content: `<b>STATE_NAME</b>&#10;Description...`
- Transitions: orthogonalEdgeStyle, label = `condition / trigger`
- Color by state type: Green=healthy/running, Orange=starting/transitional, Red=error/crashed, Gray=stopped/inactive
- Use `<Array as="points">` for complex routing (fan-out from crashed state)
- Node size: 160×60

### System Context (C4-style)
- Wrapper: `<mxfile><diagram>`
- Boundary: `rounded=1;dashed=1;dashPattern=5 5;fillColor=none;strokeColor=#0288d1;verticalAlign=top;fontSize=12;arcSize=8`
- Internal components: rounded rects with bold title + 2-3 line description
- External systems: rounded rects outside boundary
- Actors: `shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;fillColor=#e1f5fe;strokeColor=#0288d1`
- Storage: `shape=cylinder3;boundedLbl=1;backgroundOutline=1;size=10;fillColor=#f5f5f5;strokeColor=#666666`
- Edge labels: protocol/method (e.g., "stdio (JSON-RPC)", "postMessage", "Commands")
- Bidirectional: `startArrow=classic;startSize=6;endArrow=classic;endSize=6`
- Optional/inject: `dashed=1`

### Webview/Data Flow Diagram
- Wrapper: `<mxfile><diagram>`
- Numbered steps on edges: `"1. command"`, `"2. create/reveal"`, etc.
- Async messages: `dashed=1` (e.g., postMessage, ready signal)
- Bidirectional communication: `startArrow=classic;startSize=6`
- Component description in node: `<b>Name</b>&#10;method()&#10;pattern note`
- Flow direction: left-to-right primary, top-to-bottom secondary
- Actor on far left, DB/storage on bottom-left or bottom-center

### ID Convention
- Nodes: snake_case (`start`, `check_bundle`, `actor_dev`, `uc5_node`, `server_state`, `mcp_config`)
- Edges: `e`+num (`e1`, `e2`) or `r`+num for relationships (`r1`, `r2`)
- Descriptive IDs for key entities: `ext_core`, `mcp_mgr`, `webview_mgr`, `panel_mgr`

### Anchors (exitX/exitY, entryX/entryY)
Top=0.5,0 | Bottom=0.5,1 | Left=0,0.5 | Right=1,0.5 | Corners=0/1 combos

### Title Pattern
- Always first mxCell after root cells (id="0", id="1")
- Style: `text;html=1;align=center;verticalAlign=middle;resizable=0;points=[];autosize=1;strokeColor=none;fillColor=none;fontSize=14;`
- Content: `<b>Diagram Title — Context</b>`
- Position: y=10, centered horizontally (x≈200-300)

## References

- Style ref: https://github.com/jgraph/drawio-mcp/blob/main/shared/style-reference.md
- XSD: https://github.com/jgraph/drawio-mcp/blob/main/shared/mxfile.xsd

## Post-Export Validation (MANDATORY)

### Structural Validation Checklist

Before considering any diagram "done", verify:

| # | Check | How | Fix |
|---|-------|-----|-----|
| 1 | Every edge has `<mxGeometry>` child | Grep for `edge="1"` → verify child exists | Add `<mxGeometry relative="1" as="geometry"/>` |
| 2 | No dangling edges | All `source` and `target` IDs exist as vertices | Remove edge or add missing vertex |
| 3 | No duplicate IDs | All `id` attributes unique | Rename duplicates |
| 4 | Root cells exist | `id="0"` and `id="1"` present | Add them |
| 5 | No negative coordinates | All x,y >= 0 | Shift entire diagram |
| 6 | PNG file > 1KB | Check file size after export | Re-export or fix XML |
| 7 | Title cell exists | First content cell is text with fontSize=14 | Add title |

### PNG Export Quality

- **Preferred:** MCP tool `drawio_export_png(file_path="<absolute_path>")`
- **Verify:** exported PNG > 1KB (< 1KB = blank/failed)
- **If export fails:** re-check XML validity, simplify diagram, retry max 3 times
- **Scale:** default MCP export is sufficient for documents. For presentations, use CLI with `-s 2`

### Vision Self-Check Protocol

When vision is available (image can be read by the AI):

```
Round 1:
  1. Read exported PNG
  2. Score each criterion (OK / ISSUE)
  3. For each ISSUE → apply targeted XML fix
  4. Re-export PNG
  
Round 2 (if issues remain):
  1. Re-read PNG
  2. Fix remaining issues
  3. Re-export final PNG
  
After Round 2 → accept result regardless
```

**Targeted fix rules:**

| Issue | XML Fix |
|-------|---------|
| Shapes overlap | Increase x/y gap by 200px |
| Label clipped | Increase width/height of mxGeometry |
| Edge crosses node | Add waypoints `<Array as="points">` to route around |
| Edges stacked | Change exitX/entryX to spread connection points |
| Label on edge overlaps | Add `labelBackgroundColor=#ffffff` + adjust offset |
| Node off-screen | Move to positive coords near main cluster |

## Diagram Quality Rubric (for SM/QA review)

| Score | Criteria |
|-------|----------|
| ⭐⭐⭐⭐⭐ | No overlaps, clear labels, consistent colors, proper spacing, legend if needed |
| ⭐⭐⭐⭐ | Minor spacing issues, all connections correct |
| ⭐⭐⭐ | Readable but has 1-2 overlaps or clipped labels |
| ⭐⭐ | Multiple overlaps, hard to follow connections |
| ⭐ | Unusable — major structural issues |

**Minimum acceptable: ⭐⭐⭐⭐** — SM should request re-generation if below this.
