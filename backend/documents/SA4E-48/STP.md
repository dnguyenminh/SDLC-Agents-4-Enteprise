# Software Test Plan (STP)

## SDLC Agents 4 Enterprise — SA4E-48: OpenCode v1.17.15 SSE error 405 — WrapperServer missing endpoint event

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-48 |
| Title | OpenCode v1.17.15 SSE error 405 — WrapperServer missing endpoint event |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-07-20 |
| Status | Draft |
| Related BRD | documents/SA4E-48/BRD.md |
| Related FSD | documents/SA4E-48/FSD.md |
| Related TDD | documents/SA4E-48/TDD.md |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | QA Agent – QA Engineer | Create document |
| Peer Reviewer | TBD – Technical Lead | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-20 | QA Agent | Initiate document — auto-generated from BRD, FSD, and TDD |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm the test plan in this STP |
| | ☐ I agree and confirm the test plan in this STP |

---

## 1. Introduction

### 1.1 Purpose

This Software Test Plan (STP) defines the testing strategy, scope, resources, and schedule for verifying the fix of OpenCode v1.17.15 SSE error 405 (SA4E-48). The fix addresses the missing `event: endpoint` in the WrapperServer's MCP Streamable HTTP transport SSE handshake, which caused the MCP client to receive HTTP 405 on connection attempts.

The plan covers:
- **SSE Handshake Protocol** — Verification that `GET /mcp` returns compliant SSE events with correct ordering, headers, and content
- **JSON-RPC POST Handler** — Verification that `POST /mcp` correctly handles MCP lifecycle methods (`initialize`, `ping`, `tools/list`, `tools/call`, `notifications/initialized`)
- **Error Handling** — Verification of HTTP error codes, JSON-RPC error codes, body size enforcement, and edge cases
- **Regression Testing** — 7 regression tests guard against MCP handshake regressions
- **Existing Functionality** — Ensure existing WrapperServer integration tests continue to pass

### 1.2 Test Objectives

- Verify all functional requirements from FSD §3 are implemented correctly (SSE handshake, JSON-RPC handler, error responses)
- Validate all business rules (BR-1 through BR-28) are enforced
- Ensure the 7 regression tests (REG-01 through REG-07) pass to guard against the exact failure mode
- Validate that the fix is backward-compatible — existing tests (TC-22 through TC-36) continue to pass
- Ensure non-functional requirements are met (SSE keep-alive timing, connection lifecycle, body size limits)
- Achieve 100% requirement traceability coverage for all FSD use cases and business rules

### 1.3 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-48/BRD.md |
| FSD | documents/SA4E-48/FSD.md (v1.1, enriched by TA) |
| TDD | documents/SA4E-48/TDD.md |
| WrapperServer Source | extension/src/services/WrapperServer.ts |
| Regression Tests | extension/src/__tests__/mcp-handshake.regression.test.ts |
| Integration Tests | extension/src/__tests__/wrapper-server.test.ts |
| Test Helpers | extension/src/__tests__/wrapper-server.helpers.ts |
| MCP Streamable HTTP Spec | https://spec.modelcontextprotocol.io/ |
| JSON-RPC 2.0 Spec | https://www.jsonrpc.org/specification |

---

## 2. Test Strategy

### 2.1 Test Levels

| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| PBT | Correctness properties (random inputs for tool schema detection) | Automated | fast-check (vitest) |
| UT | Unit/edge case tests (individual handler logic) | Automated | vitest |
| IT | API integration (WrapperServer with mocked deps, random port) | Automated | vitest + Node.js `http` |
| E2E-API | REST endpoint E2E (full JSON-RPC lifecycle, SSE stream) | Automated | vitest + Node.js `http` |
| E2E-UI | Browser UI E2E (VS Code extension UI) | N/A | N/A (server-side fix only) |
| SIT | Manual exploratory / edge cases (SSE visual timing, concurrent connections) | Manual | Browser / Node.js REPL |

### 2.2 Test Types

| Type | Description | Applicable |
|------|-------------|------------|
| Functional Testing | Verify MCP SSE handshake, JSON-RPC methods, error handling per FSD use cases | Yes |
| Regression Testing | Ensure existing MCP functionality not broken by the fix (7 regression + 15 integration tests) | Yes |
| Performance Testing | Verify SSE handshake latency (< 50ms), initialize response time (< 100ms), keep-alive timing precision | Yes (measured via test assertions) |
| Security Testing | Verify localhost-only binding, CORS headers, body size enforcement (1MB limit) | Yes |
| Compatibility Testing | MCP Streamable HTTP transport spec compliance (OpenCode CLI v1.17.15+) | Yes |
| Usability Testing | Error messages clarity, VS Code Output Channel logging | Yes |

![Test Execution Flow](diagrams/test-execution-flow.png)
*[Edit in draw.io](diagrams/test-execution-flow.drawio)*

### 2.3 Test Approach

The primary testing approach is **automated integration testing** using the Node.js `http` module against a WrapperServer instance created with mocked dependencies on a random port:

1. **Property-based (PBT)**: fast-check for Base64Proxy detection logic (TC-27)
2. **Integration (IT)**: Each test creates a WrapperServer via `createTestServer()` with `MockDeps`, starts on port 0, executes HTTP requests, and asserts responses
3. **Regression (E2E-API)**: 7 dedicated regression tests guard against the exact MCP handshake failure mode (`-32601 Method not supported: initialize`)
4. **SSE-level**: Raw SSE stream parsing to verify event ordering, content, and keep-alive behavior
5. **Error-level**: Negative tests for invalid JSON, wrong Content-Type, oversized bodies, unknown paths, unsupported methods
6. **Manual SIT**: Reserved for scenarios requiring human judgment (visual timing of keep-alive, concurrent SSE connections)

**Test Execution Flow:**
1. `createTestServer()` — Factory creates WrapperServer with mock dependencies
2. `server.start(0)` — Server begins listening on random port
3. Test sends HTTP request via `postMcp()` / `openSse()` / `postRaw()` helpers
4. Assert response status, headers, body content
5. `server.stop()` — Cleanup in `afterAll`

### 2.4 Entry Criteria

| Level | Entry Criteria |
|-------|---------------|
| Unit / Integration / Regression | Source code compiled successfully (`npm run compile`), test environment Node.js 20.x available |
| E2E-API | WrapperServer source with SSE fix applied, test helpers available |
| SIT | All automated tests pass, extension VSIX built, VS Code with extension installed |

### 2.5 Exit Criteria

| Level | Exit Criteria |
|-------|--------------|
| Automated Tests | 22/22 tests pass (7 regression + 15 integration) |
| SIT | 5/5 manual test cases executed, 0 Critical defects |
| Total | 100% test cases executed, 0 Critical defects, <= 2 Major defects open |
| Coverage | 100% RTM coverage for all FSD use cases, business rules, and acceptance criteria |

---

## 3. Test Scope

![Test Coverage](diagrams/test-coverage.png)
*[Edit in draw.io](diagrams/test-coverage.drawio)*

### 3.1 Features In Scope

| # | Feature / Story | Priority | FSD Reference | Test Type |
|---|----------------|----------|---------------|-----------|
| 1 | MCP Streamable HTTP SSE Handshake (GET /mcp) | MUST | UC-01, BR-1-BR-10 | Functional / Integration |
| 2 | MCP JSON-RPC POST Handler (POST /mcp) | MUST | UC-02, BR-11-BR-25 | Functional / Integration |
| 3 | MCP Handshake Regression Tests (7 tests) | MUST | UC-03, BR-26-BR-28 | Regression |
| 4 | SSE Event Ordering (endpoint before message) | MUST | BR-1, TC-13 | Business Rule |
| 5 | Protocol Version Negotiation | MUST | BR-11, BR-20 | Business Rule |
| 6 | Error Handling (invalid JSON, wrong Content-Type, unknown method, oversized body) | MUST | EF-8-EF-12 | Negative / Error |
| 7 | SSE Keep-Alive Timer | SHOULD | BR-4, BR-7, BR-9 | Non-Functional |
| 8 | CORS Handling (OPTIONS preflight, headers on every response) | SHOULD | BR-24 | Integration |
| 9 | HTTP Error Responses (404, 405, 500) | MUST | EF-4, EF-5, EF-6 | Error Handling |
| 10 | SSE Connection Cleanup on Close | SHOULD | BR-9, TC-18 | Integration |
| 11 | Build & Release Verification | SHOULD | BRD Story 3, FSD 3.4 | Build Verification |

### 3.2 Features Out of Scope

| # | Feature | Reason |
|---|---------|--------|
| 1 | Backend REST API (Code Intelligence MCP Server) | Unchanged by this fix; tested separately |
| 2 | Base64ProxyService internals | Unchanged by this fix; existing tests cover this |
| 3 | MCP stdio transport | Unchanged; only Streamable HTTP transport is affected |
| 4 | Authentication or security mechanisms | Unchanged; server is localhost-only |
| 5 | UI / browser testing | This is a server-side fix; no UI changes |
| 6 | Performance load testing (beyond single-user scenarios) | Local-only, single-user server |
| 7 | Cross-browser / cross-OS compatibility beyond VS Code host | WrapperServer runs inside VS Code extension host |
| 8 | Protocol version list configurability (OI-01) | Out of scope per FSD; post-release enhancement |
| 9 | Metrics/monitoring for SSE connection count (OI-03) | Out of scope per FSD; post-release enhancement |

---

## 4. Test Environment

### 4.1 Environment Requirements

| Environment | Node.js | VS Code | OS | Purpose |
|-------------|---------|---------|-----|---------|
| Development/Test | 20.x | Any version | Windows / macOS / Linux | Automated test execution via vitest |
| SIT (Manual) | 20.x | Latest stable | Windows (primary) | Manual exploratory testing with VSIX |

### 4.2 Test Data Requirements

| Data Type | Description | Source | Preparation |
|-----------|-------------|--------|-------------|
| Mock tool schemas | `TOOL_SCHEMAS` array with `drawio_export_png`, `mem_search` | `wrapper-server.helpers.ts` line 19-41 | Built into test helpers |
| Mock backend | `restGetToolsMock`, `restCallToolMock` | `createTestServer()` factory | Created per test via `MockDeps` |
| SSE test data | Raw HTTP GET request to /mcp | `openSse()` helper | Server started on random port |
| Body size test data | Buffer.alloc(1MB+1) with filler | `postRaw()` helper | Generated at test time |

### 4.3 External Dependencies

| System | Dependency | Mock/Stub Available |
|--------|-----------|---------------------|
| Backend REST API | `restGetTools()`, `restCallTool()` via dependency injection | Yes - `MockDeps` with async mock functions |
| VS Code OutputChannel | Logging channel for diagnostic messages | Yes - `createMockOutputChannel()` no-op mock |
| File system | Temp directory for file proxy tests | Yes - `.tmp-wrapper-server` managed by `ensureTmpDir()`/`cleanTmpDir()` |

---

## 5. Test Schedule

| Phase | Start Date | End Date | Duration | Milestone |
|-------|-----------|----------|----------|-----------|
| Test Planning | 2026-07-20 | 2026-07-20 | 1 day | STP + STC approved |
| Test Execution (Automated) | 2026-07-20 | 2026-07-20 | 1 day | 22/22 automated tests pass |
| SIT Execution (Manual) | 2026-07-21 | 2026-07-21 | 1 day | SIT sign-off |
| Defect Fix & Retest | 2026-07-21 | 2026-07-22 | 2 days | All Critical/Major fixed |
| Go-Live | 2026-07-22 | 2026-07-22 | 1 day | VSIX published and release tagged |

---

## 6. Resources & Responsibilities

| Role | Name | Responsibility |
|------|------|---------------|
| Test Lead | QA Agent | Test planning, coordination, reporting |
| QA Engineer | QA Agent | Test case design, execution, defect reporting |
| BA | BA Agent | UAT support, acceptance criteria clarification |
| Developer | Duc Nguyen Minh | Bug fixing, unit test coverage |
| Solution Architect | SA Agent | Technical design clarification |

---

## 7. Risk & Mitigation

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | Regression: SSE fix breaks other MCP clients | High | Low | 7 dedicated regression tests guard the exact failure mode; 15 integration tests ensure backward compatibility |
| 2 | Stale compiled output after future changes | Medium | Medium | CI build step must include `npm run compile` + `npx vitest run`; document in README |
| 3 | Incomplete test coverage for edge cases (e.g., concurrent SSE connections) | Medium | Low | Manual SIT covers concurrent connections, keep-alive timing edge cases |
| 4 | Environment mismatch (VS Code extension host vs. test runner) | Low | Low | All critical logic is framework-agnostic Node.js `http` module; extension host differences are minimal |
| 5 | Body size enforcement via `req.destroy()` cannot be tested deterministically | Low | Low | Test verifies connection error or non-200 response; exact behavior depends on OS TCP stack |

---

## 8. Defect Management

### 8.1 Severity Levels

| Severity | Definition | Example |
|----------|-----------|---------|
| Critical | SSE handshake completely broken, connection cannot be established | Missing `event: endpoint` - OpenCode CLI reports 405 error |
| Major | MCP method returns wrong response or error | `initialize` returns wrong protocol version; `tools/list` returns empty array |
| Minor | Non-critical error message or logging issue | Error message typo in VS Code Output Channel |
| Trivial | Code style, comment, or documentation issue | Missing JSDoc on handler method |

### 8.2 Priority Levels

| Priority | Definition | SLA (Fix Time) |
|----------|-----------|----------------|
| P1 | Must fix immediately - blocks testing | 4 hours |
| P2 | Must fix before release - functional issue | 1 business day |
| P3 | Should fix if time permits | 3 business days |
| P4 | Nice to fix, can defer to next release | Next release |

### 8.3 Defect Lifecycle

```
New -> Open -> In Progress -> Fixed -> Ready for Retest -> Verified -> Closed
                                     -> Reopened -> In Progress
```

---

## 9. Test Metrics & Reporting

### 9.1 Metrics

| Metric | Formula | Target |
|--------|---------|--------|
| Test Execution Rate | Executed / Total x 100% | 100% |
| Pass Rate | Passed / Executed x 100% | >= 95% |
| Defect Density | Defects / Test Cases | <= 0.1 |
| Critical Defect Count | Count of Critical severity | 0 |
| Regression Test Coverage | REG tests passing / REG tests total | 7/7 (100%) |
| RTM Coverage | Requirements with >= 1 test case / Total requirements | 100% |

### 9.2 Reporting Schedule

| Report | Frequency | Audience |
|--------|-----------|----------|
| Test Execution Results | After test run | QA + Dev team |
| Defect Summary | After each SIT cycle | Dev team + BA |
| Test Completion Report | End of testing | All stakeholders |

---

## 10. Appendix

### Glossary

| Term | Definition |
|------|------------|
| MCP | Model Context Protocol - protocol for LLM/tool server communication |
| SSE | Server-Sent Events - W3C standard for server push over HTTP |
| Streamable HTTP | MCP transport: SSE for server-to-client, HTTP POST for client-to-server |
| WrapperServer | Local HTTP server in VS Code extension bridging MCP to backend REST |
| JSON-RPC 2.0 | Lightweight RPC protocol using JSON encoding |
| SIT | System Integration Testing |
| VSIX | VS Code Extension Package format |
| PBT | Property-Based Testing |

### Assumptions

- All MCP clients using Streamable HTTP transport require the `event: endpoint` event
- The POST handler (`handleMcp` for POST) was already functional and needs no changes
- The fix is backward-compatible - existing clients continue to work
- Node.js `http` module behaves consistently across OS platforms for SSE streams
- Test environment has Node.js 20.x installed with `npm` available
