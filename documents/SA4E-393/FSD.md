# Functional Specification Document (FSD)

## SDLC Agents 4 Enterprise Extension — SA4E-393: Integrate Impeccable design detection into SDLC Agents 4 Enterprise extension

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-393 |
| Title | Integrate Impeccable design detection into SDLC Agents 4 Enterprise extension |
| Author | BA Agent |
| Version | 1.1 |
| Date | 2026-11-12 |
| Status | Draft |
| Related BRD | documents/SA4E-393/BRD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-31 | BA Agent | Initiate document — auto-generated from BRD and Jira tickets |
| 1.1 | 2026-11-12 | BA Agent | Addendum 4 — Agent-Invocable Design Gate + Agent Self-Check (scope extension, USER-approved per RUN-LOG #43) |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional requirements for integrating Impeccable design detection skill and WASM detector into SDLC Agents 4 Enterprise extension. The feature enables automated design quality gate execution within the SDLC pipeline using Node runtime available in VSCode/Kiro extension host, supporting both static source and rendered localhost detection.

### 1.2 Scope

Reference BRD scope: integrate Impeccable design detection into SDLC pipeline without external app installation. Technical scope clarifications:
- Detection modes: static source analysis and optional rendered analysis via localhost fetch.
- Quality gate reporting integrated into pipeline output.
- No development of Impeccable skill/WASM core; assumed existing and accessible.

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| Impeccable | Design quality detection skill and WASM detector |
| Quality Gate | Automated check that must pass before pipeline continues |
| WASM | WebAssembly runtime for detector |
| SDLC Pipeline | Software lifecycle pipeline in SDLC Agents 4 Enterprise |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-393/BRD.md |
| FSD Template | documents/templates/FSD-TEMPLATE.md |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)
*[Edit in draw.io](diagrams/system-context.drawio)*

The system interacts with Developer and QA Engineer actors who trigger the design quality gate. The SDLC Agents 4 Enterprise Extension loads Impeccable Skill and WASM Detector using Node runtime, optionally fetches pages from Localhost Dev Server, and returns aggregated findings as quality gate report.

### 2.2 System Architecture

High-level components:
- **SDLC Agents Extension Host**: entry point for pipeline command, orchestrates detection modes.
- **Impeccable Skill Loader**: loads skill package via Node runtime.
- **WASM Detector Runtime**: executes static and rendered analysis.
- **File System Adapter**: provides source files for static detection.
- **Localhost Fetcher**: fetches rendered pages when rendered mode enabled.
- **Report Generator**: aggregates findings, score, pass/fail.

---

## 3. Functional Requirements

### 3.1 Feature: Integrate Impeccable design detection into extension

**Source:** BRD Story 1

#### 3.1.1 Description

Extension must load Impeccable skill and detector WASM using Node runtime in extension host. Integration must be invocable from SDLC pipeline without external app installation.

#### 3.1.2 Use Case

**Use Case ID:** UC-001
**Actor:** Developer
**Preconditions:** Extension installed; Impeccable skill package accessible; WASM binary available.
**Postconditions:** Impeccable skill and WASM detector loaded and ready for quality gate.

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Developer | | Triggers design quality gate via pipeline command |
| 2 | | SDLC Extension | Initializes Node runtime loader |
| 3 | | Impeccable Skill Loader | Loads skill package |
| 4 | | WASM Detector Runtime | Loads WASM binary |
| 5 | | SDLC Extension | Confirms load success |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Rendered mode enabled | Extension also prepares localhost fetcher |
| AF-2 | Skill already cached | Skip load, reuse cached instance |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | WASM incompatible with Node | Log error, report quality gate failure |
| EF-2 | Package not found | Report missing dependency error |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-01 | Extension must load Impeccable skill and WASM detector using Node runtime | BRD Story 1 |
| BR-02 | No external app installation required | BRD Story 1 |
| BR-03 | Quality gate must be invocable from SDLC pipeline | BRD Story 1 |

#### 3.1.4 Data Specifications

**Input Data:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| detectionMode | string | Yes | enum: static, rendered, both | Mode of detection |
| threshold | number | No | 0-1 | Quality score threshold |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| loadStatus | string | success / error |
| message | string | Load confirmation or error |

#### 3.1.5 UI Specifications

No direct UI screens for this feature. Interaction via pipeline command output.

<!-- TA enrichment -->
#### 3.1.6 API Contract (Functional View)
**[Implements: Story #1]**

**Endpoint:** `POST /pipeline/design-gate/load`
**Purpose:** Initialize Impeccable skill and WASM detector in extension host

**Input Parameters:**
| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| detectionMode | string | Yes | BR-01 | static / rendered / both |
| threshold | number | No | BR-01 | Quality score threshold 0-1 |
| cacheReuse | boolean | No | — | Reuse cached instance if available |

**Output Data:**
| Field | Type | Description |
|-------|------|-------------|
| loadStatus | string | success / error |
| message | string | Confirmation or error description |
| instanceId | string | Identifier for loaded detector instance |

**Business Error Scenarios:**
| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| WASM Incompatible | "Impeccable detector failed to load: Node WASM incompatible" | EF-1 |
| Package Not Found | "Impeccable skill package not found in workspace" | EF-2 |
| Runtime Unavailable | "Node runtime unavailable in extension host" | Node runtime missing |

### 3.2 Feature: Static source design detection

**Source:** BRD Story 2

#### 3.2.1 Description

Detector analyzes source files for design anti-patterns without running the app.

#### 3.2.2 Use Case

**Use Case ID:** UC-002
**Actor:** Developer
**Preconditions:** Extension loaded; source path specified.
**Postconditions:** Static findings returned in structured format.

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Developer | | Requests static detection on source path |
| 2 | | SDLC Extension | Retrieves source files |
| 3 | | WASM Detector | Analyzes files for anti-patterns |
| 4 | | SDLC Extension | Collects findings with file location and severity |
| 5 | | Developer | Receives findings |

**Alternative Flows:**
<!-- TA enrichment -->
| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Source path exceeds size threshold (> 10k files) | Extension switches to incremental batching with progress reporting |
| AF-2 | Static findings cached from previous run (< 5 min old) | Return cached findings with cache-hit flag |

**Exception Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Source path invalid | Return error, abort detection |
| EF-2 | Detector timeout (> 30s per module) | Return partial findings with warning, mark run as inconclusive |

#### 3.2.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-04 | Static detection must run on specified source path | BRD Story 2 |
| BR-05 | Findings must include file location and severity | BRD Story 2 |
| BR-06 | Detection completes within acceptable time | BRD NFR Performance |

#### 3.2.4 Data Specifications

**Input Data:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| sourcePath | string | Yes | Path exists | Root path for analysis |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| findings | array | List of issues |
| file | string | Source file path |
| severity | string | low/medium/high |
| message | string | Issue description |

#### 3.2.5 UI Specifications

No UI. Output via pipeline report.

<!-- TA enrichment -->
#### 3.2.6 API Contract (Functional View)
**[Implements: Story #2]**

**Endpoint:** `POST /pipeline/design-gate/static-detect`
**Purpose:** Run static design anti-pattern analysis on source files

**Input Parameters:**
| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| sourcePath | string | Yes | BR-04 | Root path for analysis |
| instanceId | string | Yes | BR-01 | Loaded detector instance ID |
| maxFiles | number | No | — | Upper limit for batching (default 10000) |

**Output Data:**
| Field | Type | Description |
|-------|------|-------------|
| findings | array | List of issues with file, severity, message |
| fileCount | number | Number of files analyzed |
| durationMs | number | Processing time |
| cacheHit | boolean | True if result from cache |

**Business Error Scenarios:**
| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| Invalid Path | "Source path does not exist" | EF-1 |
| Timeout | "Static detection timed out after 30s per module" | EF-2 |
| Empty Result | "No source files found in path" | sourcePath empty |

*Sequence diagram for static detection:*
![Sequence - Static Detection](diagrams/sequence-static.png)
*[Edit in draw.io](diagrams/sequence-static.drawio)*

### 3.3 Feature: Rendered design detection via localhost

**Source:** BRD Story 3

#### 3.3.1 Description

Extension fetches pages from configurable localhost dev server URL and passes rendered content to WASM detector.

#### 3.3.2 Use Case

**Use Case ID:** UC-003
**Actor:** Developer
**Preconditions:** Dev server running; localhost URL configured.
**Postconditions:** Rendered findings reported alongside static results.

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Developer | | Enables rendered detection |
| 2 | | SDLC Extension | Fetches localhost URL |
| 3 | | WASM Detector | Analyzes rendered content |
| 4 | | SDLC Extension | Aggregates rendered findings |
| 5 | | Developer | Receives combined report |

**Alternative Flows:**
<!-- TA enrichment -->
| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Dev server unavailable | Skip rendered detection, log warning, continue with static only |
| AF-2 | Multiple URLs provided (comma-separated) | Iterate URLs, aggregate findings per URL |

**Exception Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Fetch fails | Return clear error message |
| EF-2 | CORS / network error during fetch | Log warning, mark rendered findings as unavailable, continue with static only |

#### 3.3.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-07 | Extension must fetch pages from configurable localhost dev server URL | BRD Story 3 |
| BR-08 | Rendered detection results reported alongside static results | BRD Story 3 |
| BR-09 | Clear error message if localhost unreachable | BRD Story 3 |

#### 3.3.4 Data Specifications

**Input Data:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| localhostUrl | string | Yes if rendered enabled | Valid URL http://localhost | Target dev server URL |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| renderedFindings | array | Issues from rendered UI |
| fetchStatus | string | success / failed |

#### 3.3.5 UI Specifications

No UI. Status reported in pipeline output.

<!-- TA enrichment -->
#### 3.3.6 API Contract (Functional View)
**[Implements: Story #3]**

**Endpoint:** `POST /pipeline/design-gate/rendered-detect`
**Purpose:** Fetch localhost pages and analyze rendered UI

**Input Parameters:**
| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| localhostUrl | string | Yes | BR-07 | Configurable localhost URL |
| instanceId | string | Yes | BR-01 | Loaded detector instance |
| urls | array[string] | No | — | Additional pages to fetch |

**Output Data:**
| Field | Type | Description |
|-------|------|-------------|
| renderedFindings | array | Issues from rendered UI |
| fetchStatus | string | success / failed / partial |
| pagesFetched | number | Count of successful fetches |

**Business Error Scenarios:**
| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| Dev Server Unreachable | "Dev server not reachable, skipping rendered detection" | AF-1 |
| Fetch Failed | "Failed to fetch localhost page: reason" | EF-1 |
| CORS Error | "CORS block prevented fetch, rendered detection skipped" | EF-2 |

*Sequence diagram for rendered detection:*
![Sequence - Rendered Detection](diagrams/sequence-rendered.png)
*[Edit in draw.io](diagrams/sequence-rendered.drawio)*

### 3.4 Feature: Quality gate reporting

**Source:** BRD Story 4

#### 3.4.1 Description

Generate report summarizing findings, score, pass/fail for audit.

#### 3.4.2 Use Case

**Use Case ID:** UC-004
**Actor:** QA Engineer
**Preconditions:** Detection completed.
**Postconditions:** Report persisted and accessible.

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | QA Engineer | | Requests quality gate report |
| 2 | | Report Generator | Aggregates findings, calculates score |
| 3 | | Report Generator | Determines pass/fail based on threshold |
| 4 | | SDLC Extension | Persists report |
| 5 | | QA Engineer | Views report |

**Alternative Flows:**
<!-- TA enrichment -->
| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Fail-open mode enabled | Report generated with pass=true regardless of score, warning logged |
| AF-2 | Report requested before detection complete | Return pending status with partial data |

**Exception Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Score calculation fails | Report error, mark gate as inconclusive |
| EF-2 | Persistence fails | Report generated in memory, log warning, notify user to retry save |

#### 3.4.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-10 | Report includes total issues, severity breakdown, score | BRD Story 4 |
| BR-11 | Pass/fail determined by threshold | BRD Story 4 |
| BR-12 | Report persisted for audit | BRD Story 4 |

#### 3.4.4 Data Specifications

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| totalIssues | number | Count of findings |
| severityBreakdown | object | Count per severity |
| score | number | Quality score 0-1 |
| pass | boolean | Pass/fail result |
| timestamp | datetime | Generation time |

#### 3.4.5 UI Specifications

No UI. Report accessible via pipeline output artifact.

<!-- TA enrichment -->
#### 3.4.6 API Contract (Functional View)
**[Implements: Story #4]**

**Endpoint:** `GET /pipeline/design-gate/report/{runId}`
**Purpose:** Retrieve quality gate report for audit

**Input Parameters:**
| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| runId | string | Yes | — | Detection run identifier |

**Output Data:**
| Field | Type | Description |
|-------|------|-------------|
| runId | string | Identifier |
| totalIssues | number | Count of findings |
| severityBreakdown | object | Count per severity |
| score | number | Quality score 0-1 |
| pass | boolean | Pass/fail result |
| timestamp | datetime | Generation time |
| findings | array | Full finding details |

**Business Error Scenarios:**
| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| Report Not Found | "Quality gate report not found for runId" | runId invalid |
| Score Calculation Failed | "Report inconclusive due to scoring error" | EF-1 |
| Persistence Failed | "Report generated but persistence failed" | EF-2 |

---

## 4. Data Model

> Logical data model for detection results.

### 4.1 Entity Relationship Diagram

*ER Diagram not applicable — no persistent DB entities defined in BRD.*

### 4.2 Logical Entities

#### Entity: DetectionRun
<!-- TA enrichment -->
| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| runId | string | Yes | Unique | Identifier for run |
| detectionMode | string | Yes | BR-01 | static/rendered/both |
| threshold | number | No | BR-01 | Quality threshold |
| score | number | Yes | BR-10 | Calculated score |
| pass | boolean | Yes | BR-11 | Pass/fail |
| createdAt | datetime | Yes | Audit | Run timestamp |
| userId | string | Yes | Audit | Initiating user |

**Indexes:** `runId` PK, `createdAt` DESC for audit queries

#### Entity: Finding
| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| findingId | string | Yes | Unique | Identifier |
| runId | string | Yes | FK DetectionRun | Parent run |
| mode | string | Yes | — | static / rendered |
| file | string | No | BR-05 | Source file path |
| severity | string | Yes | — | low/medium/high |
| message | string | Yes | — | Issue description |
| line | number | No | — | Line number if applicable |

**Relationships:**
| From Entity | To Entity | Cardinality | Description |
|-------------|-----------|-------------|-------------|
| DetectionRun | Finding | 1:N | One run produces many findings |

**Constraints:** severity ∈ {low,medium,high}; mode ∈ {static,rendered}

*TA Note:* Codebase currently has no persistent DB for detection results. Entities defined here map to in-memory report objects and optional audit log files. If persistence required, implement as JSON file store under `<workspace>/.code-intel/design-gate/` with runId naming.

---

## 5. Integration Specifications

<!-- TA enrichment -->
### 5.1 External System: Impeccable Skill Package
| Attribute | Value |
|-----------|-------|
| Purpose | Load design detection skill logic |
| Direction | Inbound |
| Data Format | JavaScript/TypeScript modules |
| Frequency | On-demand per pipeline run |

**Data Exchange:**
| Our Data | External Data | Direction | Business Rule |
|----------|--------------|-----------|---------------|
| detectionMode | — | Send | BR-01 |
| skill API call | detection result | Receive | — |

**Integration Contract:**
- **Load API:** `require('impeccable-skill')` → returns Skill API object
- **Request Schema:** `{ mode: 'static'|'rendered'|'both', threshold?: number }`
- **Response Schema:** `{ instanceId: string, status: 'loaded'|'error' }`
- **Auth:** None (local package)
- **Retry Policy:** No retry; fail fast with error message

### 5.2 External System: WASM Detector Binary
| Attribute | Value |
|-----------|-------|
| Purpose | Execute static/rendered analysis |
| Direction | Bidirectional |
| Data Format | WebAssembly binary + JSON |
| Frequency | On-demand |

**Data Exchange:**
| Our Data | External Data | Direction | Business Rule |
|----------|--------------|-----------|---------------|
| source files / HTML content | findings array | Send/Receive | BR-05, BR-08 |

**Integration Contract:**
- **Init API:** `WasmDetector.load(buffer)` → Promise<Detector>
- **Detect API:** `detector.analyze({ content, mode })`
- **Request Schema:** `{ content: string|Uint8Array, mode: 'static'|'rendered' }`
- **Response Schema:** `{ findings: [{ file, severity, message, line? }], score: number }`
- **Error Handling:** Timeout after 30s, return partial findings
- **Retry Policy:** No retry; WASM runs in-process

### 5.3 External System: Localhost Dev Server
| Attribute | Value |
|-----------|-------|
| Purpose | Provide rendered UI for detection |
| Direction | Outbound |
| Data Format | HTTP/HTTPS |
| Frequency | On-demand when rendered mode enabled |

**Data Exchange:**
| Our Data | External Data | Direction | Business Rule |
|----------|--------------|-----------|---------------|
| GET request | HTML page | Send/Receive | BR-07 |

**Integration Contract:**
- **Endpoint:** `GET {localhostUrl}`
- **Request Headers:** `User-Agent: SDLC-Agents-Extension/1.0`
- **Response Schema:** HTTP 200 with HTML body; timeout 10s
- **Auth:** None (localhost only)
- **Retry Policy:** 1 retry with exponential backoff (500ms → 1s); fail gracefully if unreachable
- **Circuit Breaker:** Skip rendered detection after 2 consecutive failures in same run

External systems: Localhost Dev Server (fetch rendered UI), Impeccable Skill Package (npm), WASM Detector Binary.

---

## 6. Processing Logic

### 6.1 Design Quality Gate Process

**Trigger:** SDLC pipeline command
**Input:** detectionMode, threshold, sourcePath, localhostUrl
**Output:** Quality gate report

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Load Impeccable skill & WASM | Log error, abort |
| 2 | Run static detection | Continue if no source |
| 3 | If rendered enabled, fetch localhost | Graceful fallback if unavailable |
| 4 | Run rendered detection | Skip on fetch error |
| 5 | Aggregate findings & score | Default score 0 on error |
| 6 | Determine pass/fail | Fail-open configurable |
| 7 | Persist report | Log persistence error |

<!-- TA enrichment -->
**Pseudocode — Static Detection Flow**
```typescript
// [Implements: UC-002]
async function runStaticDetection(instanceId: string, sourcePath: string): Promise<StaticResult> {
  if (!fs.existsSync(sourcePath)) {
    throw new Error('Source path does not exist'); // EF-1
  }
  const files = await listFiles(sourcePath, { maxFiles: 10000 });
  if (files.length === 0) {
    return { findings: [], fileCount: 0, durationMs: 0, cacheHit: false };
  }
  const cacheKey = hash(sourcePath);
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 5*60*1000) {
    return { ...cached.result, cacheHit: true }; // AF-2
  }
  const start = Date.now();
  const findings = [];
  for (const batch of chunk(files, 100)) {
    const batchFindings = await detector.analyzeBatch(batch, { timeout: 30000 });
    findings.push(...batchFindings);
    if (Date.now() - start > 30000) {
      return { findings, fileCount: files.length, durationMs: Date.now()-start, cacheHit: false, partial: true }; // EF-2
    }
  }
  const result = { findings, fileCount: files.length, durationMs: Date.now()-start, cacheHit: false };
  cache.set(cacheKey, { ts: Date.now(), result });
  return result;
}
```

**Pseudocode — Rendered Detection Flow**
```typescript
// [Implements: UC-003]
async function runRenderedDetection(instanceId: string, localhostUrl: string): Promise<RenderedResult> {
  try {
    const html = await fetchWithRetry(localhostUrl, { retries: 1, timeout: 10000 });
    const findings = await detector.analyze({ content: html, mode: 'rendered' });
    return { renderedFindings: findings, fetchStatus: 'success', pagesFetched: 1 };
  } catch (e) {
    if (e.code === 'ECONNREFUSED') {
      log.warn('Dev server unavailable, skipping rendered detection'); // AF-1
      return { renderedFindings: [], fetchStatus: 'skipped', pagesFetched: 0 };
    }
    if (e.type === 'CORS') {
      log.warn('CORS block prevented fetch'); // EF-2
      return { renderedFindings: [], fetchStatus: 'failed', pagesFetched: 0 };
    }
    return { renderedFindings: [], fetchStatus: 'failed', pagesFetched: 0 };
  }
}
```

**Pseudocode — Quality Gate Decision**
```typescript
// [Implements: UC-004]
function determinePassFail(score: number, threshold?: number, failOpen = false): boolean {
  if (failOpen) return true; // AF-1
  if (threshold == null) return true;
  if (isNaN(score)) {
    log.error('Score calculation failed'); // EF-1
    return failOpen; // inconclusive
  }
  return score >= threshold; // BR-11
}
```

*State diagram:*
![State Diagram](diagrams/state-diagram.png)
*[Edit in draw.io](diagrams/state-diagram.drawio)*

---

## 7. Security Requirements

### 7.1 Authentication & Authorization

| Role | Permissions | Screens/Features |
|------|-------------|------------------|
| Developer | Execute quality gate | Pipeline command |
| QA Engineer | View report | Pipeline output |

### 7.2 Data Sensitivity Classification

| Data Type | Classification | Business Requirement |
|-----------|----------------|----------------------|
| Source code | Internal | No exfiltration |
| Detection results | Internal | Audit retained |

### 7.3 Audit Trail

| Event | Logged Fields | Retention | Business Reason |
|-------|--------------|-----------|-----------------|
| Quality gate execution | runId, user, mode, score, pass | 90 days | Auditability |

---

## 8. Non-Functional Requirements

<!-- TA enrichment -->
| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
| Performance | Detection must complete within pipeline budget | Static < 30s per module (p95), Rendered < 60s per page (p95); WASM load < 2s cold start |
| Security | No external network calls except localhost | WASM in-process; source code never leaves workspace; audit log retention 90 days |
| Availability | Quality gate optional, pipeline continues on failure | Fail-open configurable; availability 99.5% during VSCode active hours |
| Scalability | Support multiple projects in workspace | Isolated instances per project; memory footprint < 150MB per detector instance; concurrent runs ≤ 3 per workspace |
| Reliability | Graceful degradation on errors | Rendered detection skip does not abort static; partial findings returned on timeout |
| Maintainability | Extensible detection modes | New mode added via plugin config without code change; config reload < 1s |

---

## 9. Error Handling (User-Facing)

### 9.1 Error Scenarios

| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
| WASM load failure | Critical | "Impeccable detector failed to load" | Abort gate |
| Localhost unreachable | Warning | "Dev server not reachable, skipping rendered detection" | Continue static only |
| Source path invalid | Critical | "Source path does not exist" | Abort gate |

---

## 10. Testing Considerations

### 10.1 Test Scenarios

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-01 | Static detection success | Valid source path | Findings list + score | High |
| TC-02 | Rendered detection with server up | localhostUrl up | Rendered findings | High |
| TC-03 | Rendered detection server down | localhostUrl down | Warning, static only | Medium |
| TC-04 | Threshold pass | score >= threshold | pass=true | High |
| TC-05 | Threshold fail | score < threshold | pass=false | High |

---

## 11. Appendix

### Diagrams

| Diagram | File |
|---------|------|
| System Context | [system-context.png](diagrams/system-context.png) |
| Sequence Static | [sequence-static.png](diagrams/sequence-static.png) |
| Sequence Rendered | [sequence-rendered.png](diagrams/sequence-rendered.png) |
| State Diagram | [state-diagram.png](diagrams/state-diagram.png) |

### Change Log from BRD

- FSD elaborates use cases with main/alternative/exception flows.
- Business rules extracted and numbered.
- Data specifications defined for detection inputs/outputs.
- API Contracts, Integration Specs, Pseudocode omitted per request for TA enrichment.

<!-- TA enrichment -->
### Open Issues

| Issue ID | Description | Owner | Target Date | Severity |
|----------|-------------|-------|-------------|----------|
| OI-01 | WASM detector Node runtime compatibility not validated | SA | 2026-11-10 | High |
| OI-02 | Caching strategy for static detection results undefined | DEV | 2026-11-15 | Medium |
| OI-03 | Localhost URL discovery mechanism (auto-detect port) not specified | BA | 2026-11-12 | Medium |
| OI-04 | Fail-open default behavior needs product decision | PO | 2026-11-08 | High |
| OI-05 | Audit persistence format (JSON vs SQLite) unresolved | TA | 2026-11-20 | Low |

**TA Notes:**
- OI-01 requires spike to confirm WASM loading in VSCode extension host Node version.
- OI-04 impacts Security Requirements §7.3 and NFR Availability.

---

## Addendum 4 (SA4E-393 Scope Extension, 2026-11-12) — Agent-Invocable Design Gate + Agent Self-Check

**Status:** Draft — pending SM review · **Enforcement:** MUST + SM blocker (USER-APPROVED, RUN-LOG #43) · **TDD counterpart:** TDD Addendum 4 (sa-agent, parallel) owns technical design and implementation detail.

> **USER finding (verbatim, RUN-LOG #43):** "Chúng ta làm chức năng này để các AI agent dùng để đảm bảo UI code được thiết kế đúng, nhưng với cách dùng hiện tại thì AI agent không thể dùng được."
>
> **Traceability:** BRD Story 1 original purpose — the gate exists so AI agents ensure UI/design code is designed correctly. FSD BR-03 ("Quality gate must be invocable from SDLC pipeline") is implemented for the AI-agent actor by this addendum.

### A4.1 Background

The design quality gate (native 30-rule engine derived from Impeccable ideas, running inside the extension — no npx/external binary dependency, see TDD Addendum 3) is currently invocable only manually, via VSCode/Kiro commands ("SDLC Agents: Run Design Quality Gate (Static/Rendered/Both)"). AI agents in the SDLC pipeline therefore cannot use it, which leaves the BRD's original purpose unmet. This addendum extends the functional scope (same ticket SA4E-393 — scope extension, no new ticket):

1. **Expose the gate as agent-callable tools** through the extension's existing `LOCAL_TOOL_REGISTRY` (`extension/src/backend-local-tools/registry.ts`, OCP pattern — already used by SA4E-406 drawio tools and SA4E-110 jira/confluence tools). Agents call them through the standard `find_tools` → `execute_dynamic_tool` transport, exactly like `jira_get_issue`. No new MCP server is required.
2. **Mandate agent self-check:** every agent that creates or edits design artifacts MUST run the gate on those artifacts before reporting completion; SM enforces gate evidence at Phase 5/6 completion.

### A4.2 FR-AG1 — Agents invoke the design gate via extension local tools

**Requirement:** Any AI agent in the SDLC pipeline can invoke the design quality gate through the extension-local tools `design_gate_run` and `design_gate_list_rules`, transported via `execute_dynamic_tool` (discovery via `find_tools`), and receives a real report JSON in the same session.

**Actor:** AI agent (primarily dev-agent and ui-agent; any agent per steering rule `.opencode/rules/sdlc/ui-design-gate.md`).

**Use Case UC-AG1 — Agent runs the design gate:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | AI Agent | | Discovers tools: `find_tools("design gate")` |
| 2 | | Extension (LOCAL_TOOL_REGISTRY) | Returns `design_gate_run`, `design_gate_list_rules` |
| 3 | AI Agent | | Calls `execute_dynamic_tool(toolName: "design_gate_run", arguments: { mode, source_path?, threshold? })` |
| 4 | | WASM Detector / native rule engine | Runs locally in the extension host; no npx/external binary |
| 5 | AI Agent | | Receives report JSON (runId, score, pass, findings) in the same session |

**Functional contract (FSD level — TDD Addendum 4 owns exact schemas):**

Tool `design_gate_run` — input arguments (an OBJECT, never a JSON string):

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| mode | string | No | both | static / rendered / both |
| source_path | string | No | "" | Workspace-relative path to scan; omitted/empty = whole workspace |
| threshold | number | No | 0.8 | Pass threshold, 0–1 |

Tool `design_gate_run` — output report JSON:

| Field | Type | Description |
|-------|------|-------------|
| runId | string | Run identifier — required part of agent gate evidence |
| mode | string | Echoed mode |
| score | number | 0–1 (normalized scoring per TDD Addendum (A1)/Addendum 2) |
| pass | boolean | score ≥ threshold |
| threshold | number | Threshold applied |
| findings | array | { file, line?, rule, severity (high/medium/low), message } |
| fileCount / totalFiles | number | Scope accounting |
| severityBreakdown | object | Count per severity (triage) |

Tool `design_gate_list_rules` — input: `{}`; output: catalog of 30 rules (id, severity, description) for triage and traceability to the Impeccable-derived rule set.

**Business Rules:**

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-AG1 | Tools are registered in LOCAL_TOOL_REGISTRY, discoverable via `find_tools`, invocable via `execute_dynamic_tool` — no new MCP server | RUN-LOG #43 (SM verification) |
| BR-AG2 | The gate runs locally inside the extension host; no npx/external binary dependency | RUN-LOG #40 (native decision) |
| BR-AG3 | All report/finding paths are workspace-relative (constraint C5); never absolute paths | RUN-LOG #34/#40; C5 |
| BR-AG4 | Honest reporting: a FAIL on dirty input MUST be returned as FAIL with full findings — never masked, filtered, or force-passed | USER finding; RUN-LOG #40 (FAIL 0.79 = real design debt) |
| BR-AG5 | `arguments` passed to `execute_dynamic_tool` MUST be an object, not a JSON string | tool-usage-dynamic.md |
| BR-AG6 | `design_gate_list_rules` returns the 30-rule catalog | RUN-LOG #43 |

**Acceptance Criteria (FR-AG1):**

| AC ID | Criterion |
|-------|-----------|
| AC-AG1.1 | An agent calling `design_gate_run` via `execute_dynamic_tool` receives, in the same session, a real report JSON containing runId, score, pass, findings |
| AC-AG1.2 | `design_gate_list_rules` returns the rule catalog (30 rules) |
| AC-AG1.3 | Every finding path in the report is workspace-relative |
| AC-AG1.4 | A run over intentionally dirty input returns pass=false with truthful findings (no masking) |
| AC-AG1.5 | `find_tools("design gate")` discovery returns both tools |

### A4.3 FR-AG2 — Agent self-check enforcement (MUST + SM blocker)

**Requirement:** Every agent that creates or edits design artifacts MUST run `design_gate_run` on those artifacts BEFORE reporting done. A FAIL result must be handled by (a) fixing the findings, or (b) a written acceptance justification recorded in RUN-LOG/phase report. Missing gate evidence is an SM blocker for Phase 5 Implementation and Phase 6 Testing completion.

**Trigger scope — design artifacts:**

| Extensions |
|------------|
| .html, .htm, .css, .scss, .sass, .less, .vue, .svelte, .tsx, .jsx |

(Consistent with scan scope TDD Addendum (A1) — `DESIGN_FILE_EXTENSIONS` in `fs.adapter.ts`.)

**FAIL handling — one of the two, no silent acceptance:**

| Option | Requirement | Recorded in |
|--------|-------------|-------------|
| (a) Fix | Fix the findings in the same change/commit and re-run the gate until PASS (LOW findings may be triaged only) | Commit |
| (b) Justify | Written justification (biên bản lý do chấp nhận) for remaining HIGH/MEDIUM findings + follow-up ticket in the shared backlog (SA4E-438) | RUN-LOG / phase report |

**Severity semantics:** HIGH/MEDIUM findings fail the file; LOW is triage-only.

**Gate evidence required in every agent completion report that touches design artifacts:**

| Evidence field | Source |
|----------------|--------|
| tool | "design_gate_run" |
| runId | report JSON |
| score | report JSON |
| pass/fail | report JSON |

**Business Rules:**

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-AG7 | Agents MUST run `design_gate_run` on design artifacts they create/edit before reporting done | USER-APPROVED MUST (RUN-LOG #43) |
| BR-AG8 | FAIL → fix in same change OR written justification + follow-up ticket (SA4E-438 shared backlog) | USER-APPROVED (RUN-LOG #43) |
| BR-AG9 | SM blocks Phase 5 Implementation and Phase 6 Testing completion if the phase report lacks gate evidence (tool name, runId, score, pass/fail) | USER-APPROVED blocker (RUN-LOG #43) |
| BR-AG10 | The steering rule file `.opencode/rules/sdlc/ui-design-gate.md` exists and is loaded in `.opencode/rules` so every agent session carries the obligation | This addendum; AC-AG2.3 |

**Acceptance Criteria (FR-AG2):**

| AC ID | Criterion |
|-------|-----------|
| AC-AG2.1 | An agent that creates/edits a design artifact has gate evidence (tool name, runId, score, pass) in its completion report |
| AC-AG2.2 | Any FAIL is either fixed in the same change or covered by a written justification plus a follow-up ticket (SA4E-438) — never silently accepted |
| AC-AG2.3 | `.opencode/rules/sdlc/ui-design-gate.md` exists and is loaded under `.opencode/rules` |
| AC-AG2.4 | A phase report for Phase 5/6 without gate evidence is blocked by SM |

### A4.4 Scope Boundary

- No changes to the business rules or behavior of FR-01…FR-04 (Sections 3.1–3.4); this addendum adds new actors (AI agents) and enforcement on top of the existing gate.
- Technical wiring (registry registration, exact tool schemas, argument validation) is specified in TDD Addendum 4 (sa-agent).
- No new external dependency; no new MCP server.

### A4.5 Addendum Open Issues

| Issue ID | Description | Owner | Target Date | Severity |
|----------|-------------|-------|-------------|----------|
| OI-AG1 | Confirm `design_gate_list_rules` output shape (id/severity/description vs raw rule text) | SA | before dev hand-off | Low |
| OI-AG2 | Decide whether qa-agent (Phase 6) requires a gate re-run or may reuse the dev-agent runId for the same artifact set | SM/QA | before Phase 6 | Medium |

---

