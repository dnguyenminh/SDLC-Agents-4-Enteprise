# Draw.io Advanced Diagram Steering Guide

This document defines the strict engineering rules, architecture patterns, and XML specifications required to generate high-quality, professional, and cross-free `.drawio` (mxGraphModel) diagrams.

## ⛔ CRITICAL: Edge Routing & Anti-Crossing Rules

To eliminate crossed lines, overlapping connectors, and edges slicing through unrelated nodes, enforce these routing mechanics on the first generation attempt:

1. **BANNED: Blind Orthogonal Routing**
   - NEVER use `edgeStyle=orthogonalEdgeStyle` globally if the edge must traverse across areas with other nodes.
   - Only use blind `orthogonalEdgeStyle` for: 1:1 immediate adjacent nodes (no obstacles in between), short swimlane links, self-loops, and basic binary branches (Yes/No).

2. **MANDATORY: Explicit Corridor Waypoints**
   - For all complex routing, multi-row movements, or potential obstacle fields, you must explicitly define waypoints using `<Array as="points">` inside `<mxGeometry>`.
   - Maintain a minimum **80px to 120px gap (Corridor)** between nodes to allow safe passage for connector paths.

3. **MANDATORY: Fan-Out Pattern (1 → Many)**
   - When a single source node splits into 3 or more destination nodes:
     - The center branch goes perfectly straight (no waypoints needed).
     - The left and right peripheral branches MUST use explicit waypoints to form clean, sharp bends.
     - **Formula:** Set the first waypoint at `{ x: target.centerX, y: source.bottom + 50 }` to force a clear, uniform horizontal drop alignment before entering the target.

4. **MANDATORY: Fan-In Pattern (Many → 1)**
   - When 3 or more source nodes converge into a single target node:
     - The left and right peripheral sources MUST be forced to route outward and align beautifully into a common entry trunk.
     - **Formula:** Assign waypoints at `[{ x: source.centerX, y: target.top - 50 }, { x: target.centerX, y: target.top - 50 }]`.

5. **MANDATORY: Connection Spread via Anchors**
   - To prevent stacked lines (multiple edges overlapping along the same visual path), distribute the connection points across the source/target boundaries using exact boundary anchors:
     - Top Anchors: `exitX=0.25;exitY=0;`, `exitX=0.5;exitY=0;`, `exitX=0.75;exitY=0;`
     - Bottom Anchors: `exitX=0.25;exitY=1;`, `exitX=0.5;exitY=1;`, `exitX=0.75;exitY=1;`
     - Left Anchors: `exitX=0;exitY=0.25;`, `exitX=0;exitY=0.5;`, `exitX=0;exitY=0.75;`
     - Right Anchors: `exitX=1;exitY=0.25;`, `exitX=1;exitY=0.5;`, `exitX=1;exitY=0.75;`

---

## 📐 Grid Placement Matrix & Standard Node Sizes

Enforce perfect mathematical alignment using a strict row/column matrix to guarantee that nodes never overlap and structural corridors remain open.

| Diagram Type | Column X Coordinate | Row Y Coordinate | Dimensions (W × H) |
| :--- | :--- | :--- | :--- |
| **Standard Flow / BPMN** | `col * 240 + 80` | `row * 180 + 100` | Rect: 160×70 <br> Diamond: 140×80 <br> Circle: 60×60 |
| **UML Class Diagram** | `col * 320 + 60` | `row * 200 + 100` | Class Box: 220×140 |
| **Architecture / Infra** | `col * 360 + 60` | `row * 240 + 100` | Component: 240×120 <br> DB Cylinder: 120×80 |

---

## 🎨 Enterprise Color Palette & Semantic Rules

Use professional, desaturated pastel tones to convey functional meaning. Never mix random primary or neon colors.

*   **Primary / Core Info:** Fill: `#dae8fc` | Stroke: `#6c8ebf` (Muted Blue)
*   **Success / Active Service:** Fill: `#d5e8d4` | Stroke: `#82b366` (Muted Green)
*   **Warning / Transition:** Fill: `#fff2cc` | Stroke: `#d6b656` (Muted Yellow)
*   **Error / Critical Path:** Fill: `#fce4ec` | Stroke: `#c62828` (Soft Red/Pink)
*   **Data Layout / UI Extension:** Fill: `#e1d5e7` | Stroke: `#9673a6` (Soft Purple)
*   **Neutral / External System:** Fill: `#f5f5f5` | Stroke: `#666666` (Light Grey)

---

## 🛠️ Canonical XML Structures

### 1. Robust Edge Format (With Waypoints & Anti-Overlap Label)
Every single edge must have a fully declared `<mxGeometry>` child node. **Self-closing edge tags are banned.**

```xml
<mxCell id="edge_flow_01" value="Process Request" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=classic;endSize=6;labelBackgroundColor=#ffffff;fontSize=10;" edge="1" parent="1" source="node_auth_service" target="node_db_cluster">
  <mxGeometry relative="1" as="geometry">
    <Array as="points">
      <mxPoint x="380" y="240"/>
      <mxPoint x="540" y="240"/>
    </Array>
  </mxGeometry>
</mxCell>
```

### 2. Diagram Title Block
Always declare a visible, prominent title section inside the diagram root (immediately after `id="0"` and `id="1"`).
```xml
<mxCell id="diagram_title" value="&lt;b&gt;ENTERPRISE DATA PIPELINE ARCHITECTURE&lt;/b&gt;&lt;br&gt;&lt;i&gt;Context: AWS Cloud Migration Suite&lt;/i&gt;" style="text;html=1;align=left;verticalAlign=middle;resizable=0;points=[];autosize=1;strokeColor=none;fillColor=none;fontSize=14;fontColor=#333333;" vertex="1" parent="1">
  <mxGeometry x="60" y="30" width="400" height="50" as="geometry"/>
</mxCell>
```

---

## 🔄 Quality Validation & Automated Workflow

If generating using an AI Agent runtime or automated script, strictly execute this multi-round compilation sequence:

1. **Structural Assembly:** Emit XML. Validate that there are NO duplicate IDs, NO negative coordinates, and that every edge contains its required `<mxGeometry>` child block.
2. **Compile Verification:** Export the diagram to `.png` using the local headless chromium module (`export_drawio` or equivalent).
3. **Vision Check Protocol:**
   - Verify that the generated image file size is greater than `1KB` (blank files indicate schema collapse).
   - If a line slices through an unrelated component, extract the bounding coordinates of that component and automatically push a calculated offset pair into the edge's `<Array as="points">` array.
   - If a label overlaps an edge, ensure `labelBackgroundColor=#ffffff` is appended to the style string.