# Technical Design Document (TDD)

## SDLC Agents 4 Enterprise — SA4E-393: Integrate Impeccable design detection into SDLC Agents 4 Enterprise extension

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-393 |
| Title | Integrate Impeccable design detection into SDLC Agents 4 Enterprise extension |
| Author | SA Agent |
| Version | 1.1 |
| Date | 2026-11-12 |
| Status | Draft |
| Related BRD | documents/SA4E-393/BRD.md |
| Related FSD | documents/SA4E-393/FSD.md |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | SA Agent – Solution Architect | Create document |
| Peer Reviewer |  | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-31 | SA Agent | Initiate document — auto-generated from BRD and FSD |
| 1.1 | 2026-11-12 | SA Agent | Addendum 4: post-implementation as-built notes for D1, D3, D5, D6 (root causes from commits dd1c5e5d, 88892218) + Open Issues. No diagram changes. |
| 1.2 | 2026-11-13 | SA Agent | Addendum 4: Open Issues rewritten from FIX-EVIDENCE (batches 1-3), DESIGN-addendum4-openissues-fix, ANALYSIS-settings-worktree, SECURITY-ASSESSMENT-addendum4-fix (re-review PASS), TEST-REPORT-addendum4-fix. SEC-F04..F08, log redaction, size 200/20 → CLOSED; D1 as-built (explicit workspaceRoot, `{runId}.json` + `cache/{sha}.json`). Remaining items stated with residual risk; e2e D6 on this build PENDING. No diagram changes. |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm the technical design in this TDD |
| | ☐ I agree and confirm the technical design in this TDD |

---

## 1. Introduction

> **Scope Boundary:** This TDD specifies HOW to implement the requirements defined in the FSD. It does NOT repeat functional requirements, business rules, use cases, or UI specifications — refer to the FSD for those. This document focuses on: technology choices, architecture decisions, implementation patterns, and deployment concerns.

### 1.1 Purpose

Design integration of Impeccable design detection skill and WASM detector into SDLC Agents 4 Enterprise VS Code/Kiro extension to provide automated design quality gate within SDLC pipeline. The solution enables static source analysis and optional rendered analysis via localhost fetch, using Node runtime available in extension host with zero external app installation.

### 1.2 Scope

Technical scope covers:
- Impeccable skill loading and WASM detector runtime within extension host Node runtime
- Static source design detection adapter
- Localhost fetcher for rendered detection
- Quality gate report aggregation and persistence
- Integration points with SDLC pipeline command

Out of scope: development of Impeccable skill/WASM core.

### 1.3 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript | 5.x |
| Extension Framework | VS Code Extension API | 1.99+ |
| Runtime | Node.js | 20.x |
| WASM Runtime | Node WASM | built-in |
| Package Manager | npm | 10.x |
| Build Tool | Vite / esbuild | latest |
| Client HTTP | Node http/https | built-in |
| Storage | JSON file <workspace>/.code-intel/design-gate/ | N/A |

### 1.4 Design Principles

- Fail-open by default for quality gate
- Single Responsibility per component
- Adapter pattern for external systems
- In-process WASM for performance
- Cache static detection results <5 min
- Graceful degradation on localhost unavailable

### 1.5 Constraints

- Must use Node runtime in VS Code/Kiro extension host
- No external app installation
- WASM must load in extension host Node version
- Rendered detection optional, fail gracefully

### 1.6 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-393/BRD.md |
| FSD | documents/SA4E-393/FSD.md |

---

## 2. System Architecture

### 2.1 Architecture Overview

High-level architecture consists of Extension Host orchestrating detection flow via Node runtime, loading Impeccable skill and WASM detector, analyzing source files or fetched UI, and generating quality gate report.

![Architecture Diagram](diagrams/architecture.png)

*[Edit in draw.io](diagrams/architecture.drawio)*

### 2.2 Component Diagram

Components are isolated per responsibility with clear interfaces. ImpeccableIntegrationService coordinates loaders, adapters, and report generation.

![Component Diagram](diagrams/component.png)

*[Edit in draw.io](diagrams/component.drawio)*

| Component | Responsibility | Technology |
|-----------|---------------|------------|
| ImpeccableIntegrationService | Orchestrates detection modes and pipeline invocation | TypeScript |
| ImpeccableSkillLoader | Loads skill package via require() | Node.js |
| WasmDetectorRuntime | Loads WASM binary and runs analyze | Node WASM |
| FileSystemAdapter | Lists/reads source files | Node fs |
| LocalhostFetcher | Fetches localhost dev server with retry | Node http |
| ReportGenerator | Aggregates findings, score, pass/fail | TypeScript |
| DetectionCache | In-memory cache <5 min for static results | Map |

### 2.3 Deployment Architecture

Extension ships as VS Code/Kiro extension package. No server deployment required. Detector runs in-process in extension host. Optional localhost dev server must be running for rendered mode.

### 2.4 Communication Patterns

| From | To | Protocol | Pattern | Description |
|------|----|----------|---------|-------------|
| ImpeccableIntegrationService | ImpeccableSkillLoader | in-process | Sync | Load skill |
| ImpeccableIntegrationService | WasmDetectorRuntime | in-process | Sync | Load WASM |
| WasmDetectorRuntime | FileSystemAdapter | in-process | Sync | Read sources |
| LocalhostFetcher | Localhost Dev Server | HTTP GET | Sync | Fetch rendered pages |
| ReportGenerator | File System | FS write | Sync | Persist JSON report |

---

## 3. API Design

> **Prerequisite:** Functional API contracts are defined in FSD §3.x.6. This section specifies technical implementation.

### 3.1 API Overview

| # | Endpoint | Method | Description | Source |
|---|----------|--------|-------------|--------|
| 1 | /pipeline/design-gate/load | POST | Initialize Impeccable skill and WASM | UC-001 |
| 2 | /pipeline/design-gate/static-detect | POST | Run static detection | UC-002 |
| 3 | /pipeline/design-gate/rendered-detect | POST | Fetch and analyze rendered UI | UC-003 |
| 4 | /pipeline/design-gate/report/{runId} | GET | Retrieve quality gate report | UC-004 |

### 3.2 API: Load Detector

**Implements:** UC-001, BR-01, BR-02, BR-03

| Attribute | Value |
|-----------|-------|
| Method | POST |
| Path | /pipeline/design-gate/load |
| Auth | Extension host context, no external auth |
| Rate Limit | N/A |

**Request Body:**
```json
{
  "detectionMode": "static|rendered|both",
  "threshold": 0.8,
  "cacheReuse": true
}
```

**Response 200 OK:**
```json
{
  "loadStatus": "success",
  "message": "Impeccable detector loaded",
  "instanceId": "inst_123"
}
```

**Error Responses:**
| Status | Code | Message | Description |
|--------|------|---------|-------------|
| 500 | WASM_INCOMPATIBLE | Impeccable detector failed to load: Node WASM incompatible | EF-1 |
| 404 | PACKAGE_NOT_FOUND | Impeccable skill package not found | EF-2 |

### 3.3 API: Static Detect

**Implements:** UC-002, BR-04, BR-05, BR-06

| Attribute | Value |
|-----------|-------|
| Method | POST |
| Path | /pipeline/design-gate/static-detect |
| Auth | Extension host |

**Request Body:**
```json
{
  "sourcePath": "/workspace/src",
  "instanceId": "inst_123",
  "maxFiles": 10000
}
```

**Response 200 OK:**
```json
{
  "findings": [{"file":"...", "severity":"medium","message":"..."}],
  "fileCount": 123,
  "durationMs": 15420,
  "cacheHit": false
}
```

**Error Responses:**
| Status | Code | Message |
|--------|------|---------|
| 400 | INVALID_PATH | Source path does not exist |
| 504 | TIMEOUT | Static detection timed out after 30s per module |

### 3.4 API: Rendered Detect

**Implements:** UC-003, BR-07, BR-08, BR-09

**Request Body:**
```json
{
  "localhostUrl": "http://localhost:5173",
  "instanceId": "inst_123",
  "urls": ["http://localhost:5173/page1"]
}
```

**Response 200 OK:**
```json
{
  "renderedFindings": [{"file":"...","severity":"high","message":"..."}],
  "fetchStatus": "success",
  "pagesFetched": 1
}
```

**Error Responses:**
| Status | Code | Message |
|--------|------|---------|
| 503 | DEV_SERVER_UNREACHABLE | Dev server not reachable, skipping rendered detection |
| 502 | FETCH_FAILED | Failed to fetch localhost page |

### 3.5 API: Get Report

**Implements:** UC-004, BR-10, BR-11, BR-12

**Method:** GET /pipeline/design-gate/report/{runId}

**Response 200 OK:**
```json
{
  "runId": "run_abc",
  "totalIssues": 12,
  "severityBreakdown": {"low":5,"medium":5,"high":2},
  "score": 0.72,
  "pass": false,
  "timestamp": "2026-10-31T03:00:00Z",
  "findings": []
}
```

---

## 4. Database Design

> **Prerequisite:** Logical data model defined in FSD §4. Physical implementation uses JSON file store, no relational DB.

### 4.1 Data Model

Detection results persisted as JSON files under `<workspace>/.code-intel/design-gate/{runId}.json`. Entities map to in-memory objects.

![Database Schema](diagrams/class-diagram.png)

**Entity: DetectionRun**
- runId string PK
- detectionMode string
- threshold number?
- score number
- pass boolean
- createdAt datetime
- userId string

**Entity: Finding**
- findingId string PK
- runId FK
- mode string static|rendered
- file string?
- severity low|medium|high
- message string
- line number?

### 4.2 File Store Format

`/.code-intel/design-gate/{runId}.json`
```json
{
  "runId": "...",
  "detectionMode": "both",
  "threshold": 0.8,
  "score": 0.72,
  "pass": false,
  "createdAt": "...",
  "findings": [...]
}
```

### 4.3 Query Patterns

- Load latest report: read JSON by runId
- Audit query: list files sorted by createdAt DESC
- Performance target: read < 50ms

---

## 5. Class / Module Design

### 5.1 Package Structure

```
extension/src/impeccable/
├── ImpeccableIntegrationService.ts
├── loader/
│   ├── ImpeccableSkillLoader.ts
│   └── WasmDetectorRuntime.ts
├── adapter/
│   ├── FileSystemAdapter.ts
│   └── LocalhostFetcher.ts
├── report/
│   ├── ReportGenerator.ts
│   └── DetectionCache.ts
├── model/
│   ├── DetectionRun.ts
│   └── Finding.ts
└── pipeline/
    └── DesignGateCommand.ts
```

### 5.2 Key Interfaces

```typescript
export interface IImpeccableSkillLoader {
  loadSkill(): Promise<SkillAPI>;
  isLoaded(): boolean;
}

export interface IWasmDetectorRuntime {
  loadWasm(buffer: Buffer): Promise<Detector>;
  analyze(content: string|Uint8Array, mode: 'static'|'rendered'): Promise<FindingsResult>;
}
```

### 5.3 Design Patterns

| Pattern | Where Used | Rationale |
|---------|-----------|-----------|
| Adapter | FileSystemAdapter, LocalhostFetcher | Isolate external I/O |
| Strategy | detectionMode static/rendered/both | Switch analysis path |
| Factory | WasmDetectorRuntime | Encapsulate WASM load |

### 5.4 Error Handling

| Exception | When Thrown | Handling |
|-----------|-------------|----------|
| WasmLoadError | WASM incompatible | Abort gate, report error |
| FetchError | Localhost unreachable | Skip rendered, log warning |
| TimeoutError | Detection >30s | Return partial findings |

---

## 6. Integration Design

### 6.1 External System: Impeccable Skill Package

| Attribute | Value |
|-----------|-------|
| Protocol | Node require() |
| Endpoint | npm package impeccable-skill |
| Authentication | None |
| Timeout | N/A |
| Retry Policy | No retry, fail fast |

### 6.2 External System: WASM Detector Binary

| Attribute | Value |
|-----------|-------|
| Protocol | Node WASM API |
| Endpoint | local WASM buffer |
| Timeout | 30s per module |
| Retry Policy | No retry |

### 6.3 External System: Localhost Dev Server

| Attribute | Value |
|-----------|-------|
| Protocol | HTTP GET |
| Endpoint | http://localhost:{port} |
| Timeout | 10s |
| Retry Policy | 1 retry 500ms→1s |
| Circuit Breaker | Skip after 2 consecutive failures |

---

## 7. Security Design

### 7.1 Authentication

Extension host context; no external auth required. Commands invoked by authenticated VS Code user.

### 7.2 Authorization

| Role | Permissions |
|------|-------------|
| Developer | Execute quality gate |
| QA Engineer | View report |

### 7.3 Data Protection

| Data Type | At Rest | In Transit | In Logs |
|-----------|---------|------------|---------|
| Source code | Workspace local | N/A | Not logged |
| Detection results | JSON file workspace | N/A | RunId only |

### 7.4 Input Validation

- detectionMode enum validation
- threshold 0-1 range
- sourcePath exists check
- localhostUrl must start with http://localhost

---

## 8. Performance & Scalability

### 8.1 Caching Strategy

| Cache | What | TTL | Technology |
|-------|------|-----|------------|
| StaticResultsCache | Static findings per sourcePath hash | 5 min | In-memory Map |

### 8.2 Performance Targets

| Operation | Target |
|-----------|--------|
| WASM load cold start | < 2s |
| Static detection per module | < 30s p95 |
| Rendered detection per page | < 60s p95 |
| Memory footprint per instance | < 150MB |

### 8.3 Scalability

Isolated detector instances per project. Concurrent runs ≤3 per workspace.

---

## 9. Monitoring & Observability

### 9.1 Logging

| Event | Level | Fields |
|-------|-------|--------|
| Detector loaded | INFO | instanceId |
| Static detection completed | INFO | runId, fileCount, durationMs |
| Rendered fetch skipped | WARN | localhostUrl, reason |
| Quality gate pass/fail | INFO | runId, score, pass |

### 9.2 Metrics

- detection_duration_ms histogram
- findings_count counter
- pass_rate gauge

### 9.3 Testability

| Aspect | Approach |
|--------|----------|
| Unit Tests | Jest/Vitest for ImpeccableSkillLoader, WasmDetectorRuntime mocks, FileSystemAdapter fake FS |
| Integration Tests | Embedded HTTP server for LocalhostFetcher, real WASM load in test harness |
| E2E Tests | Pipeline command triggers design gate with fixture source path, verify report JSON output |
| Test Data | Mock source files under tests/fixtures/impeccable/, mock HTML for rendered detection |
| Coverage Target | >80% for service layer, 100% for ReportGenerator decision logic |

---

## 10. Deployment Considerations

### 10.1 Environment Configuration

| Property | DEV | PROD |
|----------|-----|------|
| impeccable.skill.path | node_modules/impeccable-skill | bundled |
| impeccable.wasm.path | ./wasm/detector.wasm | bundled |
| designGate.failOpen | true | false |

### 10.2 Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| designGate.enabled | true | Enable quality gate |
| designGate.rendered | false | Enable rendered detection |

### 10.3 Rollback Strategy

Extension version rollback via VS Code Marketplace. No DB migration required.

### Runtime Profile

- Start command: extension activates on VS Code startup
- Health endpoint: N/A
- Config file: package.json contributes.commands

### Screen Inventory

No UI screens; interaction via pipeline command output.

### Feature Verification

- Command `sdctl design-gate run` triggers load
- Report file created at `/.code-intel/design-gate/{runId}.json`

---

## 11. Appendix

### Glossary

| Term | Definition |
|------|------------|
| Impeccable | Design quality detection skill + WASM |
| Quality Gate | Automated check before pipeline continues |
| WASM | WebAssembly detector runtime |

### Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | WASM Node runtime compatibility validated? | Open |
| 2 | Audit persistence format JSON vs SQLite? | Open |

---

## ⛔ MANDATORY: Diagram Requirements

Every diagram referenced in this TDD MUST exist as draw.io file + PNG.

Required diagrams created:
- `diagrams/architecture.drawio` + `.png` — §2.1
- `diagrams/component.drawio` + `.png` — §2.2
- `diagrams/class-diagram.drawio` + `.png` — §5 / §4.1

---

## Addendum (SA4E-393, 2026-11-09) — Scan Scope & Normalized Scoring [USER-APPROVED]

> Approved by the human gate (ticket owner) during UAT disposition, after real-run
> evidence showed the original spec produced a vacuous FAIL on any real repository.
> Recorded in RUN-LOG #34. This addendum supersedes the conflicting formulas above.

### A1. Scan scope (static mode) — supersedes "scan all workspace text files"

The design quality gate scans **design artifacts only** — the web/UI surface:

- Extensions: `.html`, `.htm`, `.css`, `.scss`, `.sass`, `.less`, `.vue`, `.svelte`, `.tsx`, `.jsx`
- `SKIP_DIRS` still applies (node_modules, .git, out, dist, build, coverage, .code-intel, .kiro, .opencode, .vscode, resources, webview-assets)

Rationale: the detector's heuristics are design-oriented. Scanning markdown docs,
agent session logs, vendor bundles and patches produced hundreds of noise findings
(497 in the UAT evidence) and a meaningless verdict.

### A2. Normalized scoring — supersedes absolute per-finding deduction

Old (superseded): `score = 1 − (Σ severity weights)` — any repository with more than
6 medium findings clamped to 0 regardless of size.

New formula (scale-independent):

```
score = 1 − (unique files with findings / total files in scan scope)
```

- `totalFiles` = design files scanned (static) + 1 rendered page (when fetched)
- Clamp to [0, 1]; empty scope → score 1.0 with message
  "No design artifacts found in scan scope (0 files)" (vacuous pass, surfaced in report)
- `severityBreakdown` is kept in the report for triage but no longer drives the score
- Threshold semantics unchanged (BR-11: score ≥ 0.8 → pass; configurable via
  `QUALITY_GATE_THRESHOLD`)

### A3. Deferred (follow-up ticket)

Real Impeccable WASM detector binary (Option 2) — blocked on the external
`impeccable-skill` package; heuristics in `simulateWasmAnalysis` remain until then.

---

## Addendum 2 (SA4E-438, 2026-11-10) — Real Design-Quality Rules [USER-APPROVED]

Supersedes the placeholder heuristic (A3 kept for the real WASM binary only).
Follow-up ticket: SA4E-438.

### B1. Rule engine — `design-rules.ts`

13 rule ids applied to design artifacts (extension-aware: CSS rules don't run on TSX):

| Id | Rule | Severity |
|----|------|----------|
| A1 | `<img>` missing `alt` | HIGH |
| A2 | Empty `<button>`/`<a>` | HIGH |
| A3 | `onClick` on div/span without role/tabIndex | MEDIUM |
| B1 | Fixed pixel width ≥300px | MEDIUM |
| B2 | `position:absolute` >5 per file | MEDIUM |
| B3 | Stylesheet >200 lines without `@media` | MEDIUM |
| C1 | ≥3 distinct hardcoded colors | LOW |
| C2 | `!important` | LOW |
| C3 | Magic spacing (off 4/8 scale) | LOW |
| D1 | Inline `style={{…}}` | LOW |
| D2 | `.map()` JSX without key | MEDIUM |
| D3 | Component file >300 lines | LOW |
| D4 | Pending-work markers TODO/FIX | LOW |

### B2. Scoring amendment — significant findings only

```
score = 1 − (files with ≥1 HIGH or MEDIUM finding / total files in scope)
```

LOW findings (tokens, spacing, markers) are triage info and do not fail a file.
Threshold semantics unchanged (BR-11).

### B3. Rendered mode

Phase 2: fetch page → same rule engine over fetched HTML (Lighthouse-class DOM
analysis deferred).

---

## Addendum 3 (SA4E-438, 2026-11-11) — Impeccable-derived slop rules [USER-APPROVED: learn the ideas, implement natively]

User decision: port the IDEAS from github.com/pbakaus/impeccable (Apache-2.0,
107k stars — "the design vocabulary for your coding agent") into OUR extension
natively — **no external CLI/binary dependency at runtime**. Attribution:
rule ideas adapted from the Impeccable detector (62 deterministic rules).

### C1. New rules added to `design-rules.ts` (batch 1 — 17 rules)

| Id | Rule | Severity | Detection |
|----|------|----------|-----------|
| overused-font | Inter/Roboto/Fraunces/Geist/Plus Jakarta/Space Grotesk/Montserrat/Poppins | LOW | font-family + fonts.googleapis links |
| gradient-text | `bg-clip-text` / `background-clip: text` | LOW | regex |
| ai-color-palette | purple/violet Tailwind classes + violet hexes | LOW | regex |
| cream-palette | cream hexes + `bg-stone/amber-50/100` | LOW | regex |
| side-tab | one-side `border-{side}: Npx solid` + `border-[lrtb]-4..8` | LOW | regex |
| dark-glow | `box-shadow: 0 0 Npx` + colored text-shadow | LOW | regex |
| radial-halo | `radial-gradient(…transparent)` | LOW | regex |
| hard-offset-shadow | unblurred `Npx Npx 0` | LOW | regex (style files) |
| broken-image | empty/placeholder `src` | MEDIUM | regex |
| skipped-heading | h1→h3 level skip | MEDIUM | heading-sequence walk |
| tight-leading | line-height <1.3 / `leading-none|tighter|tight` | LOW | regex |
| tiny-text | font-size <12px / `text-[Npx]` <12 | MEDIUM | regex |
| justified-text | `text-align: justify` / `text-justify` | LOW | regex |
| extreme-negative-tracking | negative letter-spacing / `tracking-tighter` | LOW | regex |
| marketing-buzzword | streamline/empower/supercharge/world-class/… | LOW | regex (UI copy) |
| bounce-easing | `animate-bounce` / overshoot cubic-bezier | LOW | regex |
| marquee | marquee animation | LOW | regex |

Full 62-rule reference captured at `documents/SA4E-393/impeccable-rules-reference.txt`.
Rendered-only rules (low-contrast, text-occlusion, cramped-padding geometry,
content-hidden-at-rest, script-error…) = phase 2 — need a rendered page.

### C2. Verified real run (this workspace)

`FAIL - Score 0.79 - Findings 1839` in ~8s across ~447 design files: D1 776,
C1 320, tight-leading 209, overused-font 149, ai-color-palette 106, tiny-text 105,
D3 71, skipped-heading 33, A3 27, B1 14, cream-palette 11, side-tab 5,
buzzword 6, bounce 3, D4 4 — 0 absolute paths (C5). The FAIL is the gate
working: real, actionable design debt with file:line.

---

## Addendum 4 (SA4E-393, 2026-11-12) — Agent-Invocable Design Gate MCP Tools [FR-AG1, FR-AG2]

> User requirement (verbatim): "(1) Phải cung cấp thêm qua MCP tool của extension. (2) Phải cập nhật
> các UI agent... phải luôn tự kiểm tra/test code mới." Decision (user-approved): expand SA4E-393 —
> the design gate becomes (a) agent-invocable via MCP tools (FR-AG1) and (b) a MUST self-check step
> (FR-AG2): agents editing design artifacts run `design_gate_run` before completion; every FAIL must
> be fixed or explicitly justified; SM blocks Phase 5/6 without gate evidence (AGENTS.md Key Rule 8).
> Functional scope: FSD Addendum 4. This addendum specifies HOW. No new diagrams — the tools are
> additional entry points into the existing §2.2 detection flow (runDetection), nothing else changes.

### D1. Tool spec — `design_gate_run`

Executes the REAL gate pipeline — the same `runDetection` entry point the three Command Palette
commands use (extension/src/extension.ts, import at line 13, calls at lines 144–193) — in-process in
the extension host via `LOCAL_TOOL_REGISTRY` (extension/src/backend-local-tools/registry.ts). No new
MCP server; agents reach it through the existing MCP wrapper (`find_tools` → `execute_dynamic_tool`).

**Definition (injected into tools/list — visible, `hidden` unset, drawio precedent):**

```json
{
  "name": "design_gate_run",
  "description": "Run the design quality gate: 30 design-debt rules over design artifacts (.html .css .vue .svelte .tsx .jsx) in the workspace or a sub-path. Returns score, PASS/FAIL vs threshold, severity breakdown and findings with file:line. Agents editing design artifacts MUST call this before completing the task; fix or justify every FAIL.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "mode": {
        "type": "string",
        "enum": ["static", "rendered", "both"],
        "description": "Detection mode. Default: both (static files + localhost dev-server page when reachable)."
      },
      "source_path": {
        "type": "string",
        "description": "Optional workspace-relative path to scan (default: workspace root). Paths resolving outside the workspace are rejected (C3)."
      },
      "threshold": {
        "type": "number",
        "description": "Quality threshold 0-1. Default: DEFAULT_THRESHOLD (0.8; env QUALITY_GATE_THRESHOLD)."
      },
      "findings_limit": {
        "type": "number",
        "description": "Max findings echoed in the tool output (default 200). severityBreakdown/totalIssues always cover ALL findings; full report persisted to .code-intel/design-gate/{runId}.json (BR-12)."
      }
    },
    "required": []
  }
}
```

**Handler flow** (`handleDesignGateRun` — thin orchestrator ≤20 lines, delegates to helpers):

1. Workspace root from `defaultWorkspaceRootProvider()` (services/PathResolver — live
   `vscode.workspace` read per call, SA4E-356 pattern). None open →
   `toolError("No workspace folder open. Open a project folder first.")` (C6).
2. *(As-built: superseded)* `workspaceRoot` passed explicitly, no env/cwd fallback — pipeline fs.adapter
   validates C3 against the explicit root.
3. Detector env: `resolveWasmPath(extensionPath)` (shared helper, D3) sets
   `process.env[EnvConfig.IMPPECABLE_SKILL_PATH]`. Mandatory — integration.service `getWasmPath()`
   otherwise falls back to `./wasm/detector.wasm` relative to the IDE install cwd (load failure).
4. `source_path` given → `PathResolver.resolveWorkspacePath(source_path)` (C3 single validation
   point). `!ok` → forward `resolution.message` verbatim as toolError (messages are CODE:-prefixed
   and sanitized). Empty/absent → sourceRoot = workspace root.
5. Validate `mode` (enum) and `threshold` ∈ [0,1]; invalid → toolError with allowed values.
6. `await runDetection({ detectionMode: mode, sourceRoot, threshold, cacheReuse: true })`.
   loadDetector is handled INSIDE runDetection (idempotent — slash/index.ts:92); the tool never
   calls integration internals directly. Note: runDetection's config key is `detectionMode`
   (verified — slash/types.ts DetectionConfig); the tool's `mode` argument maps onto it.
7. Map `report` (+ `fetchStatus` when mode=rendered) → tool-result JSON, schema below.
8. Whole run in try/catch: DetectionErrorException → sanitized message; unknown error →
   `"Design gate run failed: <ErrorName>"` (C6 — no stack, no internals, workspace-root prefix
   stripped from any path fragment in the text).

**As-built (v1.2) — supersedes step 2 and the persistence wording above** (SEC-F04/F05/F08):

- *Step 2 (env write) is REMOVED.* Nothing writes `process.env.WORKSPACE_ROOT` any more. The root is
  passed explicitly: tool → `runDetection({ workspaceRoot })` → `DetectionConfig.workspaceRoot` →
  integration service, cache, report store and file lister. `workspaceRoot` is explicit, with no
  env/cwd fallback: `getWorkspaceRoot()` and the env read were removed; `requireWorkspaceRoot()`
  throws `DetectionError.WORKSPACE_ROOT_REQUIRED` (see Open Issues A9). Two workspaces running in parallel (`Promise.all`) no longer mix results.
- *Persistence contract kept: `{runId}.json` (BR-12).* SEC-F04 was resolved by changing the code, not
  the contract. `report.store.ts` writes `.code-intel/design-gate/{runId}.json` for every run
  (modes static/rendered/both; a cache hit gets a NEW runId plus `sourceRunId`). The result cache is
  separate: `.code-intel/design-gate/cache/{sha}.json` (`sha` = sha256 of `sourcePath:mode`), storing a
  workspace-relative `sourcePath`, the real `runId` and `fileCount`. An old `{sha}.json` entry directly
  under `design-gate/` is not read (counts as a miss).
- Writes are atomic (`wx` + mode `0o600` temp file in the same directory, then `rename`; temp removed
  on failure). A write failure is surfaced in `report.message` ("report not persisted"), not swallowed.
- `runId` allow-list `^run_\d+_[a-z0-9]+$`, max 64 chars, checked in `saveReport`/`loadReport`/
  `listRunIds`; every path built from it goes through `resolveInside`. Invalid and missing ids both
  return `undefined` (no oracle). `getReport`/`listReports` take an optional `workspaceRoot`.
  The error report now uses a valid runId (`run_<ms>_<id>`, was `run_error`) so failed runs also leave a record.
- Size (BR-18): `integration.service.ts` 751 → 154 lines (logic moved to `detector.runtime.ts`,
  `static.detection.ts`, `rendered.detection.ts`, `full.detection.ts`, `error-text.ts`,
  `detection.types.ts`; public API unchanged); `design-rules.ts` split into 4 rule-group files plus
  types and an assembler (30 rules, IDs and order unchanged); `mapReportToPayload` ≤20 lines; the
  oversized test split. Guarded by `design-gate-size-guard.test.ts` (convention: a `describe`
  callback is a group container, only `it` bodies count toward the 20-line limit).
- Logs: all `console.error` in `slash/` and the tool go through `redactPaths`/`logRedacted`
  (`path-redactor.ts`); `report.message` is redacted too.

**Success response** (isError: false, `content[0].text` = JSON). Example uses the real evidence
run from Addendum 3 C2 (447 design files, ~8s):

```json
{
  "ok": true,
  "runId": "run_1762924800000_ab12cd34",
  "detectionMode": "both",
  "score": 0.79,
  "pass": false,
  "threshold": 0.8,
  "totalIssues": 1839,
  "severityBreakdown": { "low": 1660, "medium": 179, "high": 0 },
  "findings": [
    {
      "findingId": "f1", "runId": "run_1762924800000_ab12cd34", "mode": "static",
      "file": "extension/webview/ui.css",
      "severity": "medium",
      "message": "position:absolute overuse (>5 per file)",
      "line": 42
    }
  ],
  "findingsReturned": 200,
  "findingsTruncated": true,
  "fileCount": 447,
  "durationMs": 8123,
  "message": "optional — QualityReport.message (e.g. vacuous-pass notice)"
}
```

- `fetchStatus` present ONLY when `mode=rendered` (from `RenderedDetectionResult.fetchStatus`,
  values "success" / "skipped" / "failed"). Verified: mode=both builds a fresh aggregate that drops
  fetchStatus (integration.service.ts runFullDetection), so it is not surfaced there; each finding
  already carries `mode` ("static"/"rendered") for attribution.
- `findings_limit` rationale: one full workspace run produced 1,839 findings (~300KB JSON). MCP
  wrapper body budget is 1MB–100MB (services/WrapperServer/constants.ts) so transport is safe, but
  agent context is not — cap the echo, keep `totalIssues`/`severityBreakdown` exact over ALL
  findings, keep the full report on disk.

**Error contract (C6):** `isError: true` + sanitized `content[0].text`. Never stack traces, never
internal paths. Cases:

| Case | Tool result |
|------|-------------|
| No workspace folder | "No workspace folder open. Open a project folder first." |
| source_path outside workspace | PathResolver message verbatim (PATH_EMPTY / PATH_INVALID / PATH_REJECTED_OUTSIDE_WORKSPACE / PATH_REJECTED_OUTSIDE_ALLOWLIST) |
| Bad mode / threshold ∉ [0,1] | Validation message listing allowed values |
| Detector load failure | "Detector load failed: <sanitized message>" |
| Any pipeline throw | "Design gate run failed: <ErrorName>" + console.warn log, no stack |

**Performance:** static full-workspace run ≈ 8s / ~447 design files (Addendum 3 C2 evidence).
In-process call — zero backend round-trip; §8.3 concurrency caps unchanged.

**As-built correction (v1.1) — bare `vscode` identifier (commit dd1c5e5d):**

- *Symptom:* first real `execute_dynamic_tool("design_gate_run")` returned `vscode is not defined`.
- *Root cause:* the handler path (wrapper server → `LOCAL_TOOL_REGISTRY`) touched a bare `vscode`
  identifier. In the esbuild CJS bundle `vscode` exists only via `require("vscode")`; there is no
  global, so a bare reference throws `ReferenceError`. The earlier workaround (tool-router writing
  `process.env.WORKSPACE_ROOT` / `IMPPECABLE_SKILL_PATH` from `deps.workspaceRoot` / `deps.wasmPath`,
  and `defaultWorkspaceRootProvider()` reading the `WORKSPACE_ROOT` env first) masked the real defect
  and could return a stale root.
- *Fix:* (1) no tool code references a bare `vscode`; PathResolver keeps its lazy `require` (SA4E-356).
  (2) New `design-gate-env.ts`: `initDesignGateEnv(context.extensionPath)` is called once in
  `activate()` (before the workspace check); `prepareDesignGateRunEnv()` runs per call → live root via
  `defaultWorkspaceRootProvider()`, passes it explicitly (workspaceRoot truyền tường minh, không có
  env/cwd fallback; no `EnvConfig.WORKSPACE_ROOT` write) and calls `resolveWasmPath(extensionPath)`. This is the "thread `context.extensionPath`" variant of D3, not
  `vscode.extensions.getExtension(...)`. (3) Workaround removed: `workspaceRoot`/`wasmPath` deps dropped
  from RemoteBackendClient/WrapperServer types, the env branch dropped from `defaultWorkspaceRootProvider`,
  and the `isLocalTool` branch in tool-router reduced to `executeLocalTool(name, args)`.
  (4) Guard test `design-gate-no-vscode.test.ts`. Same commit hardened SEC-F01 (generic reject with
  code only, no absolute path), SEC-F02 (realpath containment, junction `source_path` rejected) and
  SEC-F03 (`sanitizeErrorText`: escaped regex, both separators, case-insensitive on win32).

### D2. Tool spec — `design_gate_list_rules`

Purpose (FR-AG2): lets an agent learn the rules BEFORE writing design code — cheaper than
FAIL→fix loops. No input, no file access, no pipeline run.

```json
{
  "name": "design_gate_list_rules",
  "description": "List the 30 design-quality rules the gate enforces (id, severity, rule text, source, applicable extensions) plus the threshold and the scoring formula. Call before creating/editing design artifacts so code passes on the first run.",
  "inputSchema": { "type": "object", "properties": {}, "required": [] }
}
```

**Output** — derived from `DESIGN_RULES` (extension/src/slash/design-rules.ts:96 — exactly 30
entries, verified 2026-11-12):

```json
{
  "ok": true,
  "ruleCount": 30,
  "threshold": 0.8,
  "thresholdSource": "DEFAULT_THRESHOLD = parseFloat(env QUALITY_GATE_THRESHOLD || \"0.8\")",
  "scoringFormula": "score = 1 - (unique files with >=1 HIGH or MEDIUM finding) / (files in scan scope); clamped [0,1]; empty scope -> score 1.0 + vacuous-pass message 'No design artifacts found in scan scope (0 files)'. LOW findings are triage info and never fail a file. pass = score >= threshold (BR-11).",
  "scanScope": ".html .htm .css .scss .sass .less .vue .svelte .tsx .jsx; SKIP_DIRS excluded (node_modules, .git, out, dist, build, coverage, .code-intel, .kiro, .opencode, .vscode, resources, webview-assets)",
  "rules": [
    { "ruleId": "A1", "severity": "high", "message": "<img> missing alt attribute (accessibility)", "source": "base", "appliesTo": ["html", "htm", "tsx", "jsx", "svelte", "vue"] },
    { "ruleId": "overused-font", "severity": "low", "message": "Overused AI font (Inter/Roboto/…)", "source": "impeccable", "appliesTo": ["css", "scss", "sass", "less", "html", "htm", "tsx", "jsx", "svelte", "vue"] }
  ]
}
```

- `message` = `DesignRule.label` — the exact finding template the agent will see in reports.
- `source` classification: static `BASE_RULE_IDS` set in design-gate-tool.ts
  (A1–A3, B1–B3, C1–C3, D1–D4 = 13 base) → "base"; remaining 17 (overused-font … marquee) →
  "impeccable" (Addendum 2 B1, Addendum 3 C1). design-rules.ts untouched.
- `appliesTo` = `DesignRule.extensions` — extension-aware gating (e.g. stylesheet-only rules do
  not run on TSX), so agents know which files each rule hits.

### D3. Module layout + registration

```
extension/src/tools/design-gate/
└── design-gate-tool.ts            // DESIGN_GATE_RUN_DEFINITION + DESIGN_GATE_LIST_RULES_DEFINITION
                                  // + handleDesignGateRun + handleDesignGateListRules
                                  // + toolText/toolError (tools/drawio/drawio-tool.ts pattern)
extension/src/slash/detector-env.ts   // NEW: resolveWasmPath(extensionPath) — 3-tier logic EXTRACTED
                                  // from extension.ts resolveWasmPath (resources/wasm → out/wasm →
                                  // ../source/source-slash/wasm); sets IMPPECABLE_SKILL_PATH
```

- Structure mirrors `tools/drawio/drawio-tool.ts`: exported definitions + handlers; handlers
  delegate to small helpers (`parseRunArgs`, `resolveSourceRoot`, `mapReportToPayload`,
  `sanitizeErrorText`). Limits: file ≤200 lines (BR-18), function ≤20 lines.
- `slash/detector-env.ts` is a pure EXTRACTION (no new dependency): extension.ts's inline
  `resolveWasmPath` refactors to delegate so commands and tool share ONE implementation.
  The tool obtains `extensionPath` lazily via
  `vscode.extensions.getExtension("dnguyenminh.sdlc-agents-4-enterprise")?.extensionPath`
  (lazy-require pattern proven in PathResolver.ts:66–71). Fallback if getExtension proves
  unreliable in the target host: thread `context.extensionPath` from workspace-init (which holds
  `context` — workspace-init.ts:52) into the registration call; dev-agent documents which
  variant shipped.
- **Registration hook (verified call site — NOT extension.ts):** all local tool groups register in
  the `RemoteBackendClient` constructor (extension/src/remote-backend-client.ts lines 68–89:
  registerPegaLocalTools / registerAtlassianLocalTools / registerDevtoolsTools /
  registerIdeControlTools), which runs during activation via `initializeWorkspace` →
  `new McpServerManager(...)` (extension/registration/workspace-init.ts:52 — McpServerManager is
  the RemoteBackendClient alias, KSA-293). Add ONE call there:

```typescript
// remote-backend-client.ts constructor — AFTER the if (secrets) block:
try {
  registerDesignGateLocalTools();   // no credentials needed → outside the secrets gate
} catch (err) {
  console.warn(`[RemoteBackendClient] Design gate tools registration failed: ${(err as Error).message}`);
}
```

```typescript
// design-gate-tool.ts — registration init (mirrors mcp/atlassian/index.ts registerAtlassianLocalTools)
export function registerDesignGateLocalTools(): void {
  registerLocalTool("design_gate_run", handleDesignGateRun, DESIGN_GATE_RUN_DEFINITION);
  registerLocalTool("design_gate_list_rules", handleDesignGateListRules, DESIGN_GATE_LIST_RULES_DEFINITION);
}
```

OCP respected: registry.ts untouched (`registerLocalTool` is the extension point); no new MCP
server; `hidden` unset → tools appear in tools/list (getVisibleLocalToolDefinitions) AND stay
callable via execute_dynamic_tool.

**As-built correction (v1.1) — false PASS from fileCount=0 / cache (commit 88892218):**

- *Symptom:* `both` runs scored differently from `static` on the same tree and could PASS vacuously
  (fileCount 0) while `static` FAILed.
- *Root cause (`slash/integration.service.ts`, cache branch with `cacheReuse: true`):* on a cache hit
  `fileCount` was derived as `cached.findings.length`, and the report was built with
  `cached.fileCount ?? 0`. `fileCount` is the DENOMINATOR of
  `score = 1 − failing files / files in scope`: findings.length (or 0) is not the scan scope, so
  score/pass were wrong, and 0 → vacuous-pass 1.0. Legacy cache entries without `fileCount` triggered
  this. Cache key = sha256(`sourcePath:mode`) (`detection.cache.ts`), so static and both runs reuse
  per-mode entries.
- *Fix:* a cache entry is a HIT only if `typeof cached.fileCount === "number"`; otherwise it is a miss
  and the scan re-runs. Both `result.fileCount` and the report use `cached.fileCount` (no `?? 0`,
  no findings.length fallback). `QualityReport` gained optional `fileCount` (types.ts), set by
  `generateQualityReport` (`fileCount: totalFiles`), so the payload exposes the real denominator.
- *Limit:* the payload has no `cacheHit` field, so a cache hit can only be inferred (matching
  `fileCount`/score and shorter `durationMs`), not read directly.
- *Same commit, path text:* integration.service errors no longer embed absolute paths
  ("Source path escapes workspace root"; "does not exist: <relative>").
- *Tests:* `design-gate-addendum4-fix.test.ts`.

### D4. Security mapping — all four conditions preserved intact

| Condition | Where enforced in the tool flow |
|-----------|--------------------------------|
| C3 workspace-scoped paths | (1) `source_path` → `resolveWorkspacePath` (services/PathResolver — SA4E-356 single validation point: rejects outside-workspace + traversal); (2) pipeline double-check: fs.adapter `validateFilePath` inside listSourceFiles/readSourceFile against `WORKSPACE_ROOT` env; (3) design_gate_list_rules touches no files. |
| C4 SSRF localhost-only | Unchanged: rendered mode fetches via localhost-fetcher (`host === 127.0.0.1 || localhost` only, 10s timeout, 1 retry, response size cap). The tool accepts NO URL parameter — dev-server URL comes from `LOCALHOST_DEV_SERVER_URL` env / runDetection defaults only. |
| C5 no absolute paths in output | Unchanged: `generateQualityReport` sanitizes every `finding.file` to workspace-relative (verified: 0 absolute paths in the Addendum 3 C2 real run). Tool error path additionally strips the workspace-root prefix from any message fragment. |
| C6 error sanitize | Tool-level try/catch → `isError:true` + sanitized text (no stack, no internals). Pipeline's own C6 layer (integration.service getUserFriendlyError) stays untouched beneath it. |

### D5. Test plan (for qa-agent)

**Unit** — `extension/src/__tests__/design-gate-tools.test.ts` (vitest; mock `./slash` runDetection
and PathResolver per existing conventions — e.g. remote-backend-health.test.ts mocks
mcp/atlassian/index):

1. mode=both → handler returns report; JSON has runId, detectionMode, score, pass, threshold,
   totalIssues, severityBreakdown{low,medium,high}, findings[] (field shapes per D1).
2. source_path resolving outside workspace → isError:true, message carries the PathResolver code
   (C3); runDetection NOT called.
3. threshold: passed value lands in report.threshold; omitted → DEFAULT_THRESHOLD (0.8);
   1.5 / −0.1 → validation error.
4. invalid mode ("statics") → validation error listing allowed enum values.
5. findings_limit: findings trimmed to limit, findingsTruncated=true, findingsReturned=limit;
   severityBreakdown/totalIssues remain ALL-finding counts.
6. list_rules → ruleCount=30, ≥30 entries, source split 13 base + 17 impeccable, every entry has
   ruleId/severity/message/appliesTo.
7. C6: runDetection throws → isError:true, text "Design gate run failed: …", no stack, no
   workspace-root absolute path in text.
8. mode=rendered → fetchStatus surfaced from combinedResult; mode=static/both → no fetchStatus.
9. Handler/definition file ≤200 lines, functions ≤20 lines (size guard — repo convention).

**Integration (standalone, real session — no mocks):**

1. `find_tools("design gate")` discovers both tools; tools/list includes them (visible).
2. `execute_dynamic_tool("design_gate_run", {})` on this workspace → output parses as JSON with
   all schema fields; expect honest FAIL (score < 0.8 — 1,839 known findings in this repo).
3. Dirty-input honesty: `source_path` at a fixture dir containing one violating file
   (`<img>` without alt, `width: 500px`, `!important`) → FAIL with that exact file:line.
4. Clean-input honesty: fixture dir with a conforming file (alt attributes, responsive widths,
   spacing on the 4/8 scale) → PASS (score ≥ threshold), or vacuous pass with message when the
   scope has no design artifacts.
5. Rendered without dev server: mode=rendered → fetchStatus "failed"/"skipped", static fallback
   semantics preserved (AF-1 / TC-03).
6. `execute_dynamic_tool("design_gate_list_rules")` → 30 rules + formula string present.

**As-built additions (v1.1) — PATH_NOT_FOUND (commit 88892218, `design-gate-resolve.ts`):**

10. `source_path` that passes lexical resolution but does not exist → `isError: true`,
    `PATH_NOT_FOUND: source_path does not exist: <workspace-relative path>`. Before the fix the
    nonexistent target skipped the realpath check and surfaced later from the scan with an absolute
    path (`Source path does not exist: <abs>`). The message is built with
    `path.relative(workspaceRoot, resolvedPath)`; no absolute path or workspace root. `runDetection`
    is NOT called. Existing targets still go through `isRealPathInside` (SEC-F02), failure →
    generic reject.
11. Negative matrix (no absolute path in any error text): `../..`, absolute path outside workspace,
    junction `source_path`, `does-not-exist-xyz`, regex metacharacters in `source_path`.

Process note: the 88892218 tests were written AFTER the fix (deviation from `dev-bug-diagnosis.md`,
see Open Issues).

**Agent-loop demo (FR-AG2 evidence):** find_tools → design_gate_list_rules (read rules) → write a
small design file violating A1+A2 → design_gate_run → FAIL read → fix the file → design_gate_run →
PASS. Transcripts stored as test evidence for this ticket.

### D6. Acceptance criteria

| # | Criterion |
|---|-----------|
| i | Both tools invocable via `execute_dynamic_tool` in a real session; visible in tools/list. |
| ii | Report JSON matches the D1 schema exactly (field names, types, enums). |
| iii | Honest both ways: clean input → PASS; dirty input → FAIL with actionable file:line. |
| iv | 0 absolute paths in findings[] and in error text (C5/C6). |
| v | Lint + extension test suite pass; ≤200 lines/file, ≤20 lines/function. |
| vi | Rebuilt VSIX contains the tools (bundle includes design-gate-tool + registration call). |
| vii | FR-AG2 enforcement wired: AGENTS.md Key Rule 8 — agents editing design artifacts MUST run design_gate_run before completion; every FAIL fixed or justified; SM blocks Phase 5/6 without gate evidence. |

**As-built e2e result (v1.1)** — fresh instance, root `c:\projects\kiro\SDLC-Agents-4-Enterprise`,
MCP port 9183:

| Run | runId | score | pass | fileCount | totalIssues |
|-----|-------|-------|------|-----------|-------------|
| static | `run_1794496832524_lu5m1z95` | 0 | false | 3 | 9 |
| both #1 | `run_1794496981974_lab651sw` | 0 | false | 3 | 9 |
| both #2 | `run_1794496982501_mfd6u0lh` | 0 | false | 3 | 9 |

- static and both (x2) agree on score 0 and fileCount 3 → the D3 false-pass is gone. The payload has
  no `cacheHit`, so whether both #2 used the cache is inferred only.
- Negative cases `../..`, absolute path outside workspace, junction, `does-not-exist-xyz`, regex
  characters → all rejected (`isError: true`), none exposes an absolute path (criterion iv).
- Quality: vitest design-gate 26 tests pass, `tsc` OK, eslint 0 errors, 1 warning
  (`max-lines` 300/200 in `design-gate-tools.test.ts`, criterion v partially: warning accepted, see
  Open Issues).

### Open Issues (Addendum 4, v1.2)

Sources: FIX-EVIDENCE-addendum4-openissues.md (batches 1-3), DESIGN-addendum4-openissues-fix.md,
ANALYSIS-settings-worktree.md, SECURITY-ASSESSMENT-addendum4-fix.md (re-review: PASS, no
Critical/High/Medium), TEST-REPORT-addendum4-fix.md. State: working tree, NOT committed.

#### A. CLOSED in this round

| # | Item | Resolution (as-built) | Evidence |
|---|------|-----------------------|----------|
| 1 | SEC-F04 (Low) cache naming / absolute `runId` | Fixed in code; contract `{runId}.json` (BR-12) kept. Cache split to `cache/{sha}.json` with relative `sourcePath` and real `runId`; atomic write; write failure surfaced. As-built in D1. | persist-run (a)-(g), report-store; red on old code (ENOENT, cache `runId` = absolute path) |
| 2 | SEC-F05 (Low, latent) `getReport` runId | Allow-list regex + 64 chars + `resolveInside`; invalid = missing = `undefined`. | report-store; red: `../secret` read `.code-intel/secret.json` |
| 3 | SEC-F06 (Low) fetcher | Oversize → `req.destroy()` + reject `FETCH_FAILED` (no `throw` in callback); media type parsed before `;`. SSRF guard unchanged. | localhost-fetcher; red: charset rejected, oversize hung >60s |
| 4 | SEC-F07 (Info) `startsWith` | One implementation, `isPathWithinRoot` (`path-guard.ts`); `..dots/a.css` allowed, sibling `root-evil` blocked. | fs-adapter-containment, batch3 D2 |
| 5 | SEC-F08 (Info) global env | Nothing writes `process.env.WORKSPACE_ROOT`; `workspaceRoot` explicit through the pipeline. The env read fallback was later removed too (see A9). | explicit-root (a)(b); red: fileCount 0 |
| 6 | Absolute paths in logs (old b) | `redactPaths`/`logRedacted` in service, `wasm.loader`, cache failure, tool failure and `report.message`. | log-redaction #1, #2 red; #3 regression guard only (see B2) |
| 7 | Size 200/20 (old d) | `integration.service` split (751→154), `design-rules` split into 4 groups, `mapReportToPayload` ≤20, tests split; `size-guard` covers the folders. | size-guard red (3 files >200, 16 functions >20); tsc, eslint 0/0, full vitest 446 files / 3480 tests pass |
| 8 | Batch 3: D1, D2, D3, S-1, S-2 | D1 cache stores relative paths; D2 `isPathWithinRoot`; D3 `.gitignore` covers `.code-intel/design-gate` and `extension/.code-intel/`; S-1 error report has a valid runId; S-2 `sourceRoot` junction is rejected (realpath, fail-closed). | batch3 test, persist-run (c2) |
| 9 | Stray `extension/.code-intel/` directory (root cause) | Root cause: silent fallback `getWorkspaceRoot()` = env `WORKSPACE_ROOT` \|\| `process.cwd()` (vitest cwd = `extension/`), so tests without a root wrote into `extension/.code-intel/`. Fix: `workspaceRoot` is mandatory; `requireWorkspaceRoot()` throws `DetectionError.WORKSPACE_ROOT_REQUIRED`; `getWorkspaceRoot()` and the env read removed. Commit 66f8a3cf (gitignore `extension/.code-intel/`) was dropped because it only hid the symptom. | Root-cause fix; no fallback remains |

Follow-ups (small, non-blocking) from A9:
- `EnvConfig.WORKSPACE_ROOT` enum member is now dead; remove it.
- `ListOptions.workspaceRoot` is still optional in the type, and `file-lister.ts:27` has a stale comment; make it required and update the comment.
- New tests pass `{}` and are not type-checked (tsconfig excludes `__tests__`); fix the typing or include them in a type-check.

Test gap found by QA and closed: `TEST-REPORT-addendum4-fix.md` ended with verdict FAIL because mutant M2
(remove `isValidRunId` in `loadReport`) survived. Batch 3 added 6 tests (`RUN_1_X`, `run_1_A`,
`run_1_a-b`, `run_1_`, 86-char id); with the check removed, 5 failed (red), restored by hash. This
re-run is recorded in FIX-EVIDENCE; the QA report itself has not been re-issued after it.

#### B. Still OPEN / recorded (not pushed to backlog, except item 1)

| # | Sev | Issue | State / residual risk | Action |
|---|-----|-------|-----------------------|--------|
| 1 | Medium | `settings.json` worktree vs root (instance 9181 vs 9183; agent may resolve the wrong `mcpUrl`). | **Open. Doc-only in this ticket.** ANALYSIS: the fix touches `runtime-settings.ts`, `remote-backend-client.ts` and shared bootstrap steering used by every ticket/agent, with only a characterization baseline test (`runtime-settings.test.ts`, 6 tests, includes a recorded known gap: clear removes the file regardless of pid owner). No SA4E-393 AC depends on it. Code/steering not changed. | **Only this item references SA4E-438.** Mandatory evidence checklist before writing gate evidence: (1) `settings.workspace` equals cwd (normalized); (2) `pid` alive; (3) after `initialize`, the instance's workspace root matches; (4) record port + workspace root in the evidence; (5) mismatch → report to user, do not use the instance. |
| 2 | Process | Test-after-fix in commits 88892218 / dd1c5e5d and earlier fixes (deviates from `dev-bug-diagnosis.md`). | Not corrected retroactively; recorded. This round followed test-first. Honest exceptions: log failure test #3 (no code red, test premise was wrong), oversize/sibling guards (regression, not red), runtime-settings baseline (green from the start), D1 real flow (could not reproduce the leak). | None. |
| 3 | Low/Info | Security residuals: S-3 `redactPaths` is heuristic (POSIX paths with spaces/odd chars outside the root only partly masked); S-4 mode `0600` unverified on POSIX, tmp file not `fsync`ed, dir created with default mode; TOCTOU between `realpath`/`ensureDirInside` and use (needs write access to the workspace); direct `listSourceFiles`/`readSourceFile` callers do not `realpath` `sourceRoot` themselves (only the tool path does). | Risk accepted, low; Windows verified only, POSIX by code reading. | Optional later: `mkdir {mode: 0o700}`, `fsync`, realpath inside PathResolver. |
| 4 | Low | Retention of `run_*.json`: each run writes one file; no TTL, cap or cleanup is designed. Disk grows without bound. | Not designed. | Needs a design decision (age/count cap) before heavy use. |
| 5 | Process | `.code-intel/design-gate/20daf50f…json` is already tracked by git; `.gitignore` does not untrack it. | Open, **needs user decision** on `git rm --cached` (not done). | User decides. |
| 6 | Verification | e2e D6 on THIS fix build not re-run. The v1.1 e2e table above is from the previous build. | **PENDING** until the user installs the VSIX with `--force` and reloads the window. | Re-run D5 Integration 1-6 and the agent-loop demo; also confirm the VSIX was built after the last change. |

#### C. Acceptance status on this build

| Criterion | Status |
|-----------|--------|
| ii, iv, v (unit/integration level) | Evidenced: tsc 0 errors, eslint 0/0, full vitest pass, size-guard pass |
| i, iii, vi (real session / VSIX) | PENDING (item B6). Security re-review is code-and-test based; no dynamic pentest, POSIX not run |
| Security re-review | PASS (F01-F08 FIXED; S-1 fixed in batch 3; S-2 partly closed; S-3, S-4 remain, see B3) |

### Traceability

| Requirement (FSD Addendum 4) | Where designed |
|------------------------------|----------------|
| FR-AG1 — agents invoke the gate via MCP tools | D1, D2, D3 (LOCAL_TOOL_REGISTRY registration, no new MCP server) |
| FR-AG2 — mandatory self-check + blocker | D1 tool contract, D5 agent-loop demo, D6.vii (AGENTS.md Key Rule 8) |

