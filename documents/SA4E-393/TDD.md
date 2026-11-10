# Technical Design Document (TDD)

## SDLC Agents 4 Enterprise — SA4E-393: Integrate Impeccable design detection into SDLC Agents 4 Enterprise extension

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-393 |
| Title | Integrate Impeccable design detection into SDLC Agents 4 Enterprise extension |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2026-10-31 |
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

