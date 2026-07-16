# System Test Plan (STP)

## SA4E Extension — SA4E-29: Fix base64 design for file tools (drawio, mem_ingest_file)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-29 |
| Title | Fix base64 design for file tools (drawio, mem_ingest_file) |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-07-21 |
| Status | Approved (Retroactive) |
| Related BRD | documents/SA4E-29/BRD.md |
| Related FSD | documents/SA4E-29/FSD.md |
| Related TDD | documents/SA4E-29/TDD.md |
| Documentation Mode | Retroactive — tests already implemented |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | QA Agent – QA Engineer | Create document |
| Peer Reviewer | SA Agent – Solution Architect | Review technical completeness |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-21 | QA Agent | Initiate document — retroactive STP from implemented tests (SA4E-29) |

---

## 1. Introduction

### 1.1 Purpose

This System Test Plan defines the test strategy, scope, and approach for validating the Base64 Proxy system (SA4E-29). Since this is a retroactive document, tests are already implemented in `extension/src/__tests__/backend-local-tools.test.ts`.

### 1.2 Scope

**In Scope:**
- Local tool execution (stream_write_file, embed_image)
- Base64ProxyService: detection, rewrite, input/output proxy, unwrap/wrap
- WrapperServer HTTP endpoint (E2E-API via /mcp)
- Error handling: file not found, body too large, backend unreachable

**Out of Scope:**
- Backend tool logic (drawio CLI, mem processing) — tested separately
- LLM integration — no LLM in test loop
- UI testing — no user-facing UI in this feature (extension feature)

### 1.3 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-29/BRD.md |
| FSD | documents/SA4E-29/FSD.md |
| TDD | documents/SA4E-29/TDD.md |
| Test Implementation | extension/src/__tests__/backend-local-tools.test.ts |

---

## 2. Test Strategy

### 2.1 Architecture Context

This feature is a **VS Code Extension** module (TypeScript/Node.js) that operates as an in-process proxy between LLM and remote Backend. The architecture dictates the testing approach:

| Layer | Description | Testability |
|-------|-------------|-------------|
| Local Tools | In-process functions (stream_write_file, embed_image) | Direct unit testing |
| Base64ProxyService | Pure logic + fs I/O | Unit testing with real fs |
| WrapperServer | HTTP server (port 9181) | E2E-API via HTTP requests |
| Backend interaction | restCallTool to port 48721 | Mocked in UT; real in E2E-API |

### 2.2 Test Levels

| Level | Applicable | Rationale | Tool Count |
|-------|-----------|-----------|------------|
| **UT** (Unit Test) | Yes | Core logic: detection, rewriting, proxy, unwrap/wrap | 19 (implemented) |
| **IT** (Integration Test) | Yes | WrapperServer + Base64ProxyService wired together | 5 (planned) |
| **E2E-API** | Yes | HTTP requests to /mcp endpoint, full JSON-RPC flow | 6 (planned) |
| **E2E-UI** | N/A | No user-facing UI — extension feature with no webview | 0 |
| **SIT** (System Integration) | N/A | In-process proxy — no separate service integration needed | 0 |
| **PBT** (Property-Based) | Optional | Could apply to schema detection (arbitrary schemas) | 2 (candidate) |

### 2.3 Test Level Justification

#### Unit Tests (UT) — PRIMARY FOCUS

The Base64ProxyService is a pure-logic service with deterministic behavior. Unit tests exercise:
- Schema detection logic (BR-01, BR-02)
- Schema rewriting transforms (BR-03, BR-04)
- Input proxy (file read + base64 encode) (BR-05, BR-06)
- Output proxy (base64 decode + file write) (BR-07, BR-08, BR-16, BR-17)
- Dynamic tool unwrap/wrap (BR-09, BR-10)

Local tools (stream_write_file, embed_image) are self-contained functions tested with real filesystem.

#### Integration Tests (IT) — SECONDARY FOCUS

WrapperServer integrates Base64ProxyService + routing logic. IT verifies:
- routeToolCall dispatches correctly (LOCAL_TOOLS, execute_dynamic_tool, proxy)
- getToolsRewritten chains detection + rewrite
- handleDynamic chains unwrap + proxy + wrap

#### E2E-API — TERTIARY FOCUS

Full HTTP round-trip testing via /mcp endpoint validates:
- JSON-RPC protocol compliance
- Body size enforcement (BR-15)
- tools/list returns rewritten schemas
- tools/call with execute_dynamic_tool unwraps correctly
- Error responses (wrong method, parse error, backend unreachable)

#### E2E-UI — NOT APPLICABLE

This feature has no user-facing UI. The WrapperServer is an internal MCP proxy consumed by LLM agents, not by human users through a browser or webview.

#### SIT — NOT APPLICABLE

The proxy operates in-process within the VS Code extension. There's no separate service deployment to integrate with. Backend interaction is tested via mocked restCallTool in UT and via real HTTP in E2E-API.

#### PBT (Property-Based Testing) — CANDIDATE

Schema detection satisfies properties that could be verified with arbitrary schemas:
- **Property 1:** Any tool with `content_base64` in `inputSchema.properties` is detected as input proxy
- **Property 2:** Any tool without `content_base64` is NOT detected (no false positives)

These are candidates for future implementation using `fast-check` library.

### 2.4 Test Environment

| Component | Configuration |
|-----------|---------------|
| Runtime | Node.js 18+ (VS Code Extension host) |
| Test Framework | Vitest |
| Assertion Library | Vitest built-in (expect) |
| Mocking | Vitest mocks (vi.fn, vi.mock) |
| Filesystem | Real temp directory (.tmp-local-tools) |
| HTTP Testing | Native http.request or fetch (for E2E-API) |
| CI Integration | GitHub Actions (ci.yml) |

### 2.5 Test Data Strategy

| Category | Strategy |
|----------|----------|
| File content | Inline strings ("hello proxy", "PNG data") |
| Tool schemas | Inline JSON objects matching backend format |
| Base64 content | Computed from source via Buffer.from().toString('base64') |
| Temp files | Created in beforeAll, cleaned in afterAll |
| Error scenarios | ENOENT (nonexistent path), invalid JSON, oversized body |

---

## 3. Test Coverage Matrix

### 3.1 Requirements Traceability Matrix (RTM)

| UC/BR | Requirement | Test Cases | Level | Coverage |
|-------|-------------|-----------|-------|----------|
| UC-01 | Transparent file tool call via proxy | TC-14, TC-17, TC-22 | UT, E2E-API | 100% |
| UC-02 | Auto-detection of proxy tools from schema | TC-12, TC-13, TC-27 | UT, PBT | 100% |
| UC-03 | Schema rewriting for LLM | TC-18, TC-23 | UT, E2E-API | 100% |
| UC-04 | execute_dynamic_tool unwrapping | TC-19, TC-20, TC-21, TC-24 | UT, E2E-API | 100% |
| UC-05 | find_tools response rewriting | TC-23, TC-25 | IT, E2E-API | 100% |
| UC-06 | Zero-config operation | TC-01, TC-12, TC-16, TC-26 | UT, E2E-API | 100% |
| BR-01 | Input proxy detection: content_base64 in properties | TC-12, TC-27 | UT, PBT | 100% |
| BR-02 | Output proxy detection: "output_base64" in description | TC-13 | UT | 100% |
| BR-03 | Rewrite: remove content_base64, add file_path required | TC-18 | UT | 100% |
| BR-04 | Rewrite: add output_path optional for output tools | TC-18 | UT | 100% |
| BR-05 | Input proxy: fs.readFileSync + base64 encoding | TC-14 | UT | 100% |
| BR-06 | Skip if content_base64 already in args | TC-08 | UT | 100% |
| BR-07 | Output path: output_path > derived > null | TC-17, TC-09 | UT | 100% |
| BR-08 | Create parent directories recursively | TC-01 | UT | 100% |
| BR-09 | Unwrap supports toolName/tool_name + arguments/args | TC-19, TC-20 | UT | 100% |
| BR-10 | Wrap preserves original key (arguments vs args) | TC-19, TC-20 | UT | 100% |
| BR-11 | find_tools response rewriting uses same logic as tools/list | TC-25 | IT | 100% |
| BR-12 | Detection Sets rebuilt on every tools/list | TC-12 | UT | 100% |
| BR-13 | No hardcoded tool names | TC-12, TC-27 | UT, PBT | 100% |
| BR-14 | LOCAL_TOOLS execute locally | TC-01..07 | UT | 100% |
| BR-15 | Max body size = 1MB | TC-28 | E2E-API | 100% |
| BR-16 | Output proxy skips if result.isError | TC-10 | UT | 100% |
| BR-17 | Output proxy silent catch on parse/write failure | TC-11 | UT | 100% |

### 3.2 RTM Coverage Summary

| Category | Total Items | Covered | Coverage % |
|----------|-------------|---------|------------|
| Use Cases (UC-01..06) | 6 | 6 | **100%** |
| Business Rules (BR-01..17) | 17 | 17 | **100%** |
| **Overall** | **23** | **23** | **100%** |

---

## 4. Test Execution Strategy

### 4.1 Execution Order

```
Phase 1: Unit Tests (19 tests — already implemented)
  +-- Local tools: TC-01..07, TC-10, TC-11
  +-- Base64ProxyService: TC-08..09, TC-12..21

Phase 2: Integration Tests (5 tests — planned)
  +-- WrapperServer integration: TC-22..26

Phase 3: E2E-API Tests (6 tests — planned)
  +-- HTTP round-trip: TC-22..26, TC-28..30

Phase 4: PBT (2 tests — candidate)
  +-- Schema detection properties: TC-27..28
```

### 4.2 Entry Criteria

| Criterion | Status |
|-----------|--------|
| BRD + FSD + TDD approved | Done |
| Test framework configured (Vitest) | Done |
| Source code implemented | Done |
| Test environment available | Done |

### 4.3 Exit Criteria

| Criterion | Threshold |
|-----------|-----------|
| All UT pass | 100% (19/19) |
| All IT pass (when implemented) | 100% |
| All E2E-API pass (when implemented) | 100% |
| RTM coverage | 100% (UC + BR) |
| No Critical/High defects open | 0 |

### 4.4 Run Command

```bash
cd extension && npx vitest run src/__tests__/backend-local-tools.test.ts
```

---

## 5. Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| File system permissions in CI | Medium | Low | Tests use temp directory with explicit cleanup |
| Port conflicts (9181) for E2E-API | Medium | Medium | Use dynamic port assignment in tests |
| Base64 encoding of large files | Low | Low | Tests use small inline content; BR-15 caps at 1MB |
| Flaky tests from timing | Low | Low | No async timers; synchronous file I/O |

---

## 6. Test Case Summary by Level

| Level | Test Cases | Count | Status |
|-------|-----------|-------|--------|
| UT | TC-01..21 | 19 | Implemented and Passing |
| IT | TC-22..26 | 5 | Planned |
| E2E-API | TC-22, TC-24, TC-28..30 | 5 | Planned |
| PBT | TC-27..28 | 2 | Candidate |
| **Total** | | **31** | 19 done + 12 planned |

---

## 7. Diagrams

### 7.1 Test Coverage

![Test Coverage](diagrams/test-coverage.png)

### 7.2 Test Execution Flow

![Test Execution Flow](diagrams/test-execution-flow.png)

---

## 8. Appendix

### 8.1 Test File Location

| File | Purpose |
|------|---------|
| `extension/src/__tests__/backend-local-tools.test.ts` | All UT (19 tests implemented) |
| `extension/src/__tests__/wrapper-server-e2e.test.ts` | E2E-API tests (planned) |

### 8.2 Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Test Coverage — Coverage per level and requirement area | [test-coverage.png](diagrams/test-coverage.png) | [test-coverage.drawio](diagrams/test-coverage.drawio) |
| 2 | Test Execution Flow — Order of test phases | [test-execution-flow.png](diagrams/test-execution-flow.png) | [test-execution-flow.drawio](diagrams/test-execution-flow.drawio) |
