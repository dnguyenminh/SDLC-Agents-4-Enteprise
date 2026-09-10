# Test Plan — SA4E-257: Wire DB-backed MCP server config to McpClientManager

## Document Information

| Field | Value |
|-------|-------|
| **Ticket** | SA4E-257 |
| **Title** | Wire DB-backed MCP server config (mcp_servers) to McpClientManager so configured servers actually connect |
| **Version** | 1.0 |
| **Date** | 2026-09-09 |
| **Status** | In Progress |

---

## Section 1: Introduction

### 1.1 Purpose
This test plan defines the strategy, scope, resources, and schedule for testing the implementation of SA4E-257: wiring the DB-backed `mcp_servers` table to `McpClientManager` so configured servers actually connect.

### 1.2 Scope
- **In Scope:** All acceptance criteria from FSD §5 (7 criteria), unit/integration/api/UI testing, test environment setup, defect management
- **Out of Scope:** Redesign of KB tool-search index, orchestration.json format changes beyond mapping, Admin UI layout changes beyond data source switch

### 1.3 References
- BRD.md — SA4E-257 Business Requirements
- FSD.md — SA4E-257 Functional Specification
- TDD.md — SA4E-257 Technical Design

### 1.4 Test Objectives
1. Verify all 7 acceptance criteria from FSD §5 are met
2. Ensure DB `mcp_servers` drives `McpClientManager` connection lifecycle
3. Validate transport type normalization (`streamable-http` → `httpStream`)
4. Confirm UI reflects live `McpClientManager` state (not mock/DB values)
5. Ensure CRUD operations trigger correct connection lifecycle events
6. Validate error handling and edge cases for all API endpoints

---

## Section 2: Test Strategy

### 2.1 Test Levels

| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| **PBT** | Correctness properties (random inputs) | ✅ Automated | fast-check |
| **UT** | Unit/edge case tests | ✅ Automated | vitest |
| **IT** | API integration (Hono app in-process) | ✅ Automated | vitest + Hono `app.request()` |
| **E2E-API** | REST endpoint E2E (real server) | ✅ Automated | vitest + fetch |
| **E2E-UI** | Browser UI E2E (Playwright) | ✅ Automated | Playwright |
| **SIT** | Manual exploratory / edge cases only | ❌ Manual | Browser |

### 2.2 Test Types
- **Functional:** CRUD lifecycle, connection events, status display
- **Non-Functional:** Startup performance (< 2s), scalability (100+ servers), reliability (isolated failures)
- **Security:** Config encryption, auth on API endpoints
- **Regression:** Existing functionality preservation

### 2.3 Entry/Exit Criteria

| Level | Entry Criteria | Exit Criteria |
|-------|---------------|---------------|
| PBT | Test cases defined with property predicates | All property tests pass |
| UT | Source code ready, mocks available | 100% unit test pass rate |
| IT | API routes implemented, DB seeded | All integration scenarios pass |
| E2E-API | Server running, auth tokens available | All API endpoint tests pass |
| E2E-UI | Build deployed, browser available | All UI flows pass |
| SIT | Build deployed, test environment ready | Sign-off from BA/UAT |

### 2.4 E2E Automation Coverage

**Goal:** Minimize manual SIT to visual/UX-only tests.

| Scenario Type | Classify As | Reason |
|--------------|-------------|--------|
| CRUD operations (create, edit, delete via UI) | **E2E-UI** | Deterministic, easy to automate |
| Form validation (empty, invalid input) | **E2E-UI** | Clear input/output |
| API response verification (status codes, body) | **E2E-API** | No browser needed |
| RBAC/auth checks (401, 403) | **E2E-API** | API-level check sufficient |
| Status changes (disable/enable) | **E2E-UI** | Click + verify badge |
| Confirmation dialogs (delete confirm) | **E2E-UI** | Click + verify dialog |
| Regression — existing features | **E2E-UI** | Automate to run quickly |
| Blocking overlay timing | **SIT** (manual) | Visual timing hard to automate |
| Complex UX flows (drag-drop, animations) | **SIT** (manual) | Human judgment needed |
| Visual/layout verification | **SIT** (manual) | Human eyes needed |

### 2.5 Test Summary Table

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 3 | 3 | 0 |
| UT | 8 | 8 | 0 |
| IT | 5 | 5 | 0 |
| E2E-API | 6 | 6 | 0 |
| E2E-UI | 8 | 8 | 0 |
| SIT | 6 | 0 | 6 |
| **Total** | **36** | **38 (~64%)** | **6 (~17%)** |

*Note: PBT count overlaps with UT; unique test cases = 33 total.*

---

## Section 3: Test Scope

### 3.1 In Scope
- **Story 1:** DB Config Auto-Connect on Startup — verify all enabled DB servers connect on app restart
- **Story 2:** CRUD Drives Connection Lifecycle — verify create → connect, update → reconnect, delete → disconnect
- **Story 3:** Live Status in UI — verify UI shows Connected/Disconnected from McpClientManager live state
- **Story 4:** Transport Type Normalization — verify streamable-http maps to httpStream, both vocabularies supported
- **Story 5:** Config Source of Truth Decision — verify ADR documented and BRD references it
- **API Endpoints:** GET/POST/PUT/DELETE /api/sa4e-215/mcp/servers
- **McpClientManager Methods:** connectServer, disconnectServer, reconnectServer, isServerConnected, getServerToolCount, listServers, loadFromDB, normalizeTransportType

### 3.2 Out of Scope
- Redesign of KB tool-search index (`mcp_tools`)
- Modification of `orchestration.json` format beyond mapping
- Admin UI layout/design changes beyond data source switch
- Any changes unrelated to unifying DB `mcp_servers` with `McpClientManager` lifecycle

---

## Section 4: Test Environment

### 4.1 Environment Requirements
- **Browser:** Chromium (Playwright default), latest Chrome/Firefox
- **OS:** Windows 10/11, macOS 13+, Ubuntu 22.04
- **Server:** localhost:3000 (Hono backend)
- **Database:** SQLite with mcp_servers table seeded with test data

### 4.2 Test Data Requirements
- Pre-seeded `mcp_servers` rows with various transport types (stdio, sse, streamable-http)
- Servers with `disabled=0` (enabled) and `disabled=1` (disabled)
- Test data covering all transport type vocabularies

### 4.3 External System Dependencies
- **McpClientManager** — must have `connectServer`, `disconnectServer`, `reconnectServer`, `isServerConnected`, `getServerToolCount`, `listServers`, `loadFromDB`, `normalizeTransportType` methods
- **TransportFactory** — must support `stdio`, `sse`, `httpStream` (normalized from `streamable-http`)
- **Auth middleware** — Session auth on API endpoints
- **Existing DB schema** — `mcp_servers` table from SA4E-215

---

## Section 5: Test Schedule

| Phase | Duration | Milestones |
|-------|----------|------------|
| **Test Planning** | 1 day | STP.md + STC.md completed, diagrams exported |
| **Unit Testing** | 2 days | UT + IT tests written and passing |
| **E2E Automation** | 3 days | E2E-API + E2E-UI tests written and passing |
| **Manual SIT** | 2 days | SIT test cases executed, defects logged |
| **Test Execution & Reporting** | 2 days | TEST-REPORT.md, CSV test data, DOCX exports |
| **Total** | **10 days** | — |

---

## Section 6: Resource & Responsibilities

| Role | Responsibility |
|------|----------------|
| **Test Lead** | Overall test strategy, STP/STC review, defect triage |
| **QA Engineers** | Write test cases, execute tests, report defects |
| **BA** | UAT support, acceptance sign-off, story validation |
| **Dev** | Bug fixes, test environment setup, API support |
| **DevOps** | CI/CD pipeline, test environment deployment, Docker configs |

### Tools
- **Test Management:** Jira (test cases), TEST-REPORT.csv
- **Automation:** vitest, Playwright
- **Bug Tracking:** Jira
- **Diagrams:** draw.io
- **Data CSV:** documents/SA4E-257/testdata/

---

## Section 7: Risk & Mitigation

| Risk | Mitigation |
|------|------------|
| **Data availability** — DB not seeded with proper test data | Prepare pre-seeded CSV test data before test execution |
| **Environment stability** — Server may restart during testing | Use stable test environment; snapshot before test runs |
| **Timeline pressure** — Insufficient time for full E2E coverage | Prioritize critical paths (happy path + error flows); defer SIT to later sprint |
| **Transport mapping regression** — Existing `httpStream` servers break | Unit tests for both vocabularies; backward-compatible mapping in TransportFactory |
| **DB and orchestration.json conflict** — Duplicate connections | Document source-of-truth decision; deduplication logic if co-existing |

---

## Section 8: Defect Management

| Severity | Definition | SLA |
|----------|------------|-----|
| **Critical** | System crash, data loss, security breach, cannot proceed | 2 hours |
| **Major** | Key functionality broken, cannot complete test case | 1 day |
| **Minor** | UI cosmetic issue, non-blocking error | 3 days |
| **Trivial** | Typo, minor wording, unlikely to affect users | 1 week |

### Defect Lifecycle
`New → Open → In Progress → Fixed → Verified → Closed`

### Priority Levels
- **P0:** Must fix before release — blocks acceptance criteria
- **P1:** Should fix — affects key functionality
- **P2:** Nice to fix — minor impact
- **P3:** Low priority — cosmetic/edge case

---

## Section 9: Test Metrics

- **Test Execution Progress:** % of test cases executed per level
- **Defect Density:** defects per 100 test cases
- **Pass/Fail Rate:** % of tests passed vs failed
- **Test Coverage Percentage:** % of requirements with at least one test case
- **RTM Coverage:** 100% of FSD acceptance criteria traced to test cases

---