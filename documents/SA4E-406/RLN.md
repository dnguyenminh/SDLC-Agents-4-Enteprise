# Release Notes (RLN) — SA4E-406: drawio_auto_layout: Detector Precision + Verify Loop + ELK Compound + Extension Migration

---

## Release Information

| Field | Value |
|-------|-------|
| Version | v1.0.1 |
| Release Date | 2026-11-12 |
| Jira Ticket | SA4E-406 |
| Author | DevOps Agent |
| Status | Released |

---

## Header

### v1.0.1 — 2026-11-12

**Release Notes for:** SDLC Agents 4 Enterprise — Backend MCP Server  
**Ticket:** SA4E-406 — drawio_auto_layout: Detector Precision + Verify Loop + ELK Compound + Extension Migration

---

## What's New

### Core Improvements

- **Detector Precision** — Calibrated thresholds for layout issue detection:
  - Node overlaps: `OVERLAP_EPS = 0.05` (5% area threshold — ignores minor overlaps)
  - Node proximity: `MIN_GAP = 40px` (minimum breathing room between siblings)
  - Child outside container: `CONTAINMENT_TOL = 5px` (tolerance for containment checks)
  - Diagonal edges: 20px tolerance (cosmetic, LOW severity)
  - Edge crossings: node/edge-edge/container (HIGH severity)

- **Verify Loop** — Complete fix → re-parse → re-detect cycle:
  - Automatic re-detection after fix application
  - `remaining_issues` count returned in response
  - XML validity verified before write (re-parse validation)

- **ELK Compound Layout** — Hierarchical container support:
  - Nested containers laid out recursively
  - Children constrained within parent bounds
  - 4 algorithms: `layered` (default), `force`, `mrtree`, `radial`
  - Direction: `DOWN`, `RIGHT`, `LEFT`, `UP`

- **Strategy Selection** — Minimal fix first:
  - `ports` scope: spread edge anchors only (no node movement)
  - Local repair: push-apart + edge rerouting for small violations
  - ELK relayout: full hierarchical layout for complex violations (>40% cells involved)

### Extension Migration

- **MCP Bridge Integration** — Tools available via extension proxy:
  - `drawio_auto_layout` — Auto-fix diagram layout
  - `drawio_export_png` — Export .drawio to PNG
  - Called via `execute_dynamic_tool` with proper arguments

### Multi-worktree Path Resolution (SA4E-394)

- `base_dir` parameter for worktree-relative paths
- `workspace_root` legacy alias (base_dir wins)
- Allowlist-based workspace registration
- Path traversal prevention (CWE-22)

### Security & Robustness

- Path traversal blocked: `../../../etc/passwd` → "Path rejected"
- Configurable limits via ENV:
  - `SA4E_ELK_MAX_NODES=500` (diagram size limit)
  - `SA4E_ELK_TIMEOUT_MS=10000` (ELK timeout)
  - `SA4E_ELK_SPACING_MAX=500` (max spacing)
- XML re-parse validation before file write
- Case-folded path comparison on Windows

---

## Technical Changes

### New/Modified Components

| Component | Type | Description |
|-----------|------|-------------|
| `drawio-detect.ts` | Enhanced | All detectors with calibrated thresholds |
| `drawio-apply.ts` | Enhanced | Strategy selection, verify loop, remaining_issues |
| `drawio-repair.ts` | Enhanced | Local repair planner (push-apart, containment, rerouting) |
| `drawio-tool.ts` | Enhanced | Multi-worktree path resolution, always-fix mode |
| `drawio-export-png.ts` | Existing | PNG export via draw.io CLI |
| `elk-layout.ts` | Existing | ELK.js integration for compound layout |
| `drawio-geometry.ts` | Existing | Absolute rect calculations |
| `drawio-detect-edges.ts` | Existing | Edge crossing detectors |

### New Test Suite

- **UAT Automation** — `drawio-uat.test.ts` (34 tests):
  - 5 detector precision tests
  - 3 verify loop tests
  - 5 ELK compound layout tests
  - 2 extension migration tests
  - 4 path resolution/remaining_issues tests
  - 3 security/performance tests
  - 12 edge cases + performance benchmarks

### Configuration (ENV vars)

| Variable | Default | Description |
|----------|---------|-------------|
| `SA4E_ELK_MAX_NODES` | `500` | Max diagram nodes for ELK |
| `SA4E_ELK_TIMEOUT_MS` | `10000` | ELK layout timeout (ms) |
| `SA4E_ELK_SPACING_MAX` | `500` | Max node spacing (px) |

---

## Test Results

| Test Level | Tests | Passed | Failed |
|------------|-------|--------|--------|
| Unit Tests (detect, repair, geometry, parser, writer, apply, tool) | 80 | 80 | 0 |
| Golden Tests (documents/SA4E-406/diagrams/deployment.drawio + sequence-verify-loop.drawio) | 4 | 4 | 0 |
| Integration Tests (apply, export-png) | 3 | 3 | 0 |
| E2E Tests (extension MCP bridge) | 2 | 2 | 0 |
| **UAT Automation Tests** | **34** | **34** | **0** |
| **Total drawio tests** | **123** | **123** | **0** |

**CI Pipeline**: 7/7 jobs ✅ PASS (GitHub Actions Run #42337119710)

---

## Known Issues

- **PNG Export dependency**: Requires draw.io CLI installed on system (`@drawio/cli` or `draw.io` desktop)
- **Rendered detection**: Not applicable (backend-only tool, no UI rendering)
- **Large diagrams**: >500 nodes rejected (configurable via `SA4E_ELK_MAX_NODES`)
- **Windows path casing**: Handled via case-folded comparison

---

## Dependencies

- **elkjs** — ELK layout engine (bundled)
- **draw.io CLI** — Optional, for `drawio_export_png` only
- **Node.js** — 22.23.4 (MCP server runtime)
- **Extension host** — VSCode/Kiro with MCP proxy for bridge access

---

## Migration Notes

- **Breaking changes**: None — tool signature unchanged, always-fix mode retained
- **Behavior changes**:
  - Detector thresholds now calibrated (previously default/hardcoded)
  - `remaining_issues` now returned in all fix responses
  - Path resolution uses multi-worktree allowlist when `base_dir` provided
- **Backward compatibility**: Full — existing callers work without changes
- **Data migration**: No database migration. Diagram files modified in-place.
- **Rollback**: Revert to previous backend commit; restore diagram backups if needed

---

## Delivery Summary

| Item | Status |
|------|--------|
| Detector precision (5 thresholds calibrated) | ✅ Implemented |
| Verify loop (fix → re-detect → remaining_issues) | ✅ Implemented |
| ELK compound layout (hierarchical containers) | ✅ Implemented |
| 4 ELK algorithms (layered/force/mrtree/radial) | ✅ Implemented |
| Extension migration (MCP bridge) | ✅ Verified |
| Multi-worktree path resolution | ✅ Implemented |
| Path traversal prevention (CWE-22) | ✅ Implemented |
| Configurable limits (ENV vars) | ✅ Implemented |
| UAT automation test suite (34 tests) | ✅ Created |
| UAT documentation (3 files) | ✅ Created |
| DPG.md (Deployment Guide) | ✅ Created |
| RLN.md (Release Notes) | ✅ Created |

---

## UAT Evidence

- **UAT-READINESS.md** — 12 scenarios, environment setup, sign-off
- **UAT-CHECKLIST.md** — 20 test cases, quick reference
- **TEST-REPORT.md** — 123 tests report, CI evidence
- **Automation**: `drawio-uat.test.ts` — 34 automated tests covering all checklist items
- **Status**: ✅ UAT PASS confirmed (2026-11-08)

---

## Related Tickets

| Ticket | Summary | Relationship |
|--------|---------|--------------|
| SA4E-406 | drawio_auto_layout: Detector Precision + Verify Loop + ELK Compound + Extension Migration | Main ticket |
| SA4E-84 | Original drawio_auto_layout implementation | Predecessor |
| SA4E-394 | Multi-worktree path resolution (base_dir) | Dependency |
| SA4E-356 | Path traversal security hardening | Security fix |
| SA4E-393 | Impeccable design detection integration | Related (extension) |

---