# Software Test Plan (STP)

## Smart KB Ingest — SA4E-38: Local LLM Semantic Evaluation

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-38 |
| Title | Smart KB Ingest — Local LLM Semantic Evaluation |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-07-15 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-38.docx |
| Related FSD | FSD-v1-SA4E-38.docx |
| Related TDD | TDD-v1-SA4E-38.docx |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | QA Agent – QA Engineer | Create document |
| Peer Reviewer | SA Agent – Solution Architect | Review technical coverage |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-15 | QA Agent | Initiate document — auto-generated from BRD, FSD, and TDD |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm the test plan in this STP |
| | ☐ I agree and confirm the test plan in this STP |

---

## 1. Introduction

### 1.1 Purpose

This test plan defines the comprehensive testing strategy for the `mem_smart_ingest` and `mem_smart_ingest_cleanup` MCP tools. These tools use a local Ollama LLM to semantically evaluate user messages before KB ingestion, replacing the inline chat LLM evaluation that consumed cloud tokens.

### 1.2 Test Objectives

- Verify all functional requirements from FSD use cases UC-01 through UC-04 are correctly implemented
- Validate all 15 business rules (BR-01 through BR-15) are enforced
- Ensure fallback mechanism works reliably when Ollama is unavailable
- Confirm graceful degradation — tool never crashes or throws unhandled exceptions
- Validate batch cleanup correctly re-evaluates and mutates unfiltered entries
- Verify non-functional requirements (latency, throughput, data locality)
- Ensure deduplication logic prevents duplicate KB entries

### 1.3 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-SA4E-38.docx |
| FSD | FSD-v1-SA4E-38.docx |
| TDD | TDD-v1-SA4E-38.docx |

---

## 2. Test Strategy

### 2.1 Test Levels

| Level | Code | Scope | Responsibility | Tools | Count |
|-------|------|-------|---------------|-------|-------|
| Property-Based Testing | PBT | Invariants of ClassifyService parsing + truncation logic | Developer | Vitest + fast-check | 5 |
| Unit Testing | UT | Individual functions: classify, validate, fallback, dedup, truncate | Developer | Vitest + vi.mock | 18 |
| Integration Testing | IT | ClassifyService ↔ LLMService ↔ OllamaAdapter (mocked HTTP) | Developer + QA | Vitest + msw | 8 |
| E2E API Testing | E2E-API | Full MCP tool call → response (mem_smart_ingest, mem_smart_ingest_cleanup) | QA | Vitest + MCP client | 12 |
| E2E UI Testing | E2E-UI | N/A — No UI components in this feature | — | — | 0 |
| System Integration Testing | SIT | Hook → Backend → Ollama → KB (real Ollama instance) | QA | Manual + automated script | 5 |

**Total test cases: 48**

### 2.2 Test Types

| Type | Description | Applicable |
|------|-------------|------------|
| Functional Testing | Verify features work per FSD use cases | Yes |
| Regression Testing | Ensure existing mem_ingest, mem_search not broken | Yes |
| Performance Testing | Verify response times (< 3s ingest, < 100ms fallback) | Yes |
| Security Testing | Verify data stays local, no cloud leakage | Yes |
| Usability Testing | N/A — no UI | No |
| Compatibility Testing | N/A — backend only | No |

### 2.3 Test Approach

- **Automated-first:** All PBT, UT, IT, and E2E-API tests are automated in Vitest
- **Risk-based prioritization:** Fallback logic and graceful degradation are highest priority (failure = message loss)
- **Mock strategy:** OllamaAdapter mocked at HTTP level for UT/IT; real Ollama for SIT only
- **Test data:** CSV files with message samples covering business-value, social, edge-case categories
- **CI integration:** All automated tests run on every push via GitHub Actions

### 2.4 Entry Criteria

| Level | Entry Criteria |
|-------|---------------|
| UT/IT | Code compiles, all existing tests pass, test data CSVs available |
| E2E-API | Backend server starts, MCP tools registered, mock Ollama configured |
| SIT | Real Ollama running (qwen3:1.7b), backend deployed to test env, hook configured |

### 2.5 Exit Criteria

| Level | Exit Criteria |
|-------|--------------|
| UT/IT | 100% test cases executed, 0 failures, branch coverage ≥ 90% |
| E2E-API | 100% test cases executed, 0 Critical defects, ≤ 1 Major open |
| SIT | All 5 SIT scenarios pass, latency within NFR targets |

---

## 3. Test Scope

### 3.1 Features In Scope

| # | Feature / Story | Priority | FSD Reference | Test Type |
|---|----------------|----------|---------------|-----------|
| 1 | Local LLM Semantic Evaluation | High | UC-01, BR-01, BR-02, BR-14 | PBT, UT, IT, E2E-API, SIT |
| 2 | Auto-Ingest with LLM Summary | High | UC-01, BR-03, BR-04, BR-05, BR-13 | UT, E2E-API |
| 3 | Fallback — Ollama Unavailable | High | UC-02, BR-06, BR-07, BR-08, BR-09 | UT, IT, E2E-API, SIT |
| 4 | Batch Cleanup Job | High | UC-03, BR-10, BR-11 | UT, IT, E2E-API |
| 5 | Hook Trigger (fire-and-forget) | High | UC-04, BR-12 | E2E-API, SIT |
| 6 | Deduplication Logic | Medium | BR-13 | UT, E2E-API |
| 7 | Empty Message Handling | Medium | TC-07 | UT |
| 8 | Summary/Message Truncation | Medium | BR-03, BR-08 | PBT, UT |
| 9 | Malformed LLM Response | High | EF-01 | UT, IT |
| 10 | Batch Dry Run | Medium | AF-04 | E2E-API |

### 3.2 Features Out of Scope

| # | Feature | Reason |
|---|---------|--------|
| 1 | OllamaAdapter internal logic | Existing component, tested separately |
| 2 | KB schema/storage engine changes | No changes per BRD scope |
| 3 | UI for managing unfiltered entries | Explicitly out of scope in BRD |
| 4 | Model training/fine-tuning | Out of scope |
| 5 | Other MCP tools (mem_search, mem_ingest) | Tested via regression only |

---

## 4. Test Environment

### 4.1 Environment Requirements

| Environment | URL | Database | Purpose |
|-------------|-----|----------|---------|
| DEV | localhost:3000 (MCP server) | SQLite (in-memory for tests) | UT + IT + E2E-API |
| SIT | localhost:3000 + Ollama :11434 | SQLite (test file DB) | System Integration Testing |

### 4.2 Browser / Device Requirements

N/A — Backend-only feature, no browser testing required.

### 4.3 Test Data Requirements

| Data Type | Description | Source | Preparation |
|-----------|-------------|--------|-------------|
| Business-value messages | Messages with decisions, architecture, requirements | CSV file | Pre-authored samples |
| Social messages | "ok", "thanks", "sure", "got it" | CSV file | Pre-authored samples |
| Edge-case messages | Empty, very long (>10000 chars), unicode, special chars | CSV file | Generated |
| Unfiltered KB entries | Entries tagged "unfiltered" for cleanup testing | DB seed script | Auto-generated |
| LLM mock responses | Predetermined JSON responses for deterministic testing | JSON fixtures | Pre-authored |

### 4.4 External Dependencies

| System | Dependency | Mock/Stub Available |
|--------|-----------|---------------------|
| Ollama Server | Local LLM inference (localhost:11434) | Yes — msw HTTP mock for UT/IT; real Ollama for SIT |
| MemoryEngine (SQLite) | KB storage | Yes — in-memory SQLite for tests |
| LLMService | Facade for OllamaAdapter | Yes — mock via dependency injection |

---

## 5. Test Schedule

| Phase | Start Date | End Date | Duration | Milestone |
|-------|-----------|----------|----------|-----------|
| Test Planning | 2026-07-15 | 2026-07-15 | 1 day | STP + STC approved |
| Test Data Preparation | 2026-07-16 | 2026-07-16 | 1 day | CSV files + DB seeds ready |
| UT/IT Implementation | 2026-07-17 | 2026-07-18 | 2 days | All UT/IT pass |
| E2E-API Execution | 2026-07-19 | 2026-07-20 | 2 days | All E2E-API pass |
| SIT Execution | 2026-07-21 | 2026-07-21 | 1 day | SIT sign-off |
| Defect Fix & Retest | 2026-07-22 | 2026-07-23 | 2 days | All Critical/Major fixed |

---

## 6. Resources & Responsibilities

| Role | Name | Responsibility |
|------|------|---------------|
| Test Lead | QA Agent | Test planning, coordination, reporting |
| QA Engineer | QA Agent | Test case design, E2E/SIT execution, defect reporting |
| Developer | DEV Agent | UT/IT implementation, bug fixing |
| SA | SA Agent | Technical review of test coverage |

---

## 7. Risk & Mitigation

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | Ollama not available in CI | High | Medium | Use HTTP mocks for CI; SIT runs locally with real Ollama |
| 2 | LLM response non-deterministic | Medium | High | Mock LLM responses for UT/IT; SIT validates general behavior only |
| 3 | Test data insufficient coverage | Medium | Low | Use property-based testing (fast-check) for edge cases |
| 4 | SQLite locking in parallel tests | Low | Medium | Separate DB file per test suite |
| 5 | Batch cleanup timeout on large datasets | Low | Low | Limit test data to 10 entries, verify processing time |

---

## 8. Defect Management

### 8.1 Severity Levels

| Severity | Definition | Example |
|----------|-----------|---------|
| Critical | Message loss, tool crashes, data corruption | Fallback not triggered → message lost |
| Major | Feature not working correctly, workaround exists | Wrong tags applied to ingested entry |
| Minor | Non-critical behavior deviation | Log message format incorrect |
| Trivial | Cosmetic, no functional impact | Typo in reason string |

### 8.2 Priority Levels

| Priority | Definition | SLA (Fix Time) |
|----------|-----------|----------------|
| P1 | Must fix immediately | 4 hours |
| P2 | Must fix before release | 1 business day |
| P3 | Should fix if time permits | 3 business days |
| P4 | Nice to fix, can defer | Next release |

### 8.3 Defect Lifecycle

```
New → Open → In Progress → Fixed → Ready for Retest → Verified → Closed
                                                     → Reopened → In Progress
```

---

## 9. Test Metrics & Reporting

### 9.1 Metrics

| Metric | Formula | Target |
|--------|---------|--------|
| Test Execution Rate | Executed / Total × 100% | 100% |
| Pass Rate | Passed / Executed × 100% | ≥ 95% |
| Defect Density | Defects / Test Cases | ≤ 0.1 |
| Critical Defect Count | Count of Critical severity | 0 |
| Branch Coverage (UT) | Covered branches / Total | ≥ 90% |

### 9.2 Reporting Schedule

| Report | Frequency | Audience |
|--------|-----------|----------|
| Daily Test Status | Daily during execution | Project team |
| Defect Summary | Per test level completion | Dev team + SM |
| Test Completion Report | End of SIT | All stakeholders |

---

## 10. Test Coverage Diagram

![Test Coverage](diagrams/test-coverage.png)

---

## 11. Test Execution Flow

![Test Execution Flow](diagrams/test-execution-flow.png)

---

## 12. Requirements Traceability Matrix (RTM)

### 12.1 Use Cases → Test Cases

| Use Case | FSD Ref | Test Cases (by Level) | Coverage |
|----------|---------|----------------------|----------|
| UC-01 | Evaluate + Auto-Ingest | PBT-01, UT-01, UT-02, UT-05, UT-06, UT-08, UT-14, IT-01, IT-02, E2E-01, E2E-02, E2E-05, SIT-01 | ✅ Covered |
| UC-02 | Fallback: Ollama Unavailable | UT-03, UT-04, UT-07, UT-09, IT-03, IT-04, E2E-03, E2E-04, E2E-06, SIT-02 | ✅ Covered |
| UC-03 | Batch Cleanup | UT-10, UT-11, UT-12, UT-13, IT-05, IT-06, E2E-07, E2E-08, E2E-09, E2E-10, SIT-03 | ✅ Covered |
| UC-04 | Hook Trigger | E2E-11, SIT-04, SIT-05 | ✅ Covered |

### 12.2 Business Rules → Test Cases

| BR | Rule Description | Test Cases | Coverage |
|----|-----------------|------------|----------|
| BR-01 | 3-day value evaluation criteria | UT-01, UT-02, IT-01, E2E-01, E2E-02 | ✅ Covered |
| BR-02 | Structured JSON response | UT-05, UT-06, PBT-02 | ✅ Covered |
| BR-03 | Summary ≤ 200 chars | UT-08, PBT-03, E2E-05 | ✅ Covered |
| BR-04 | type=CONTEXT, source=/chat-prompt | UT-14, E2E-01 | ✅ Covered |
| BR-05 | tags=chat,stream,user,smart-ingest | UT-14, E2E-01 | ✅ Covered |
| BR-06 | Ollama availability 3s timeout | UT-03, IT-03, E2E-03 | ✅ Covered |
| BR-07 | Fallback tagged "unfiltered" | UT-04, UT-07, E2E-03, E2E-04 | ✅ Covered |
| BR-08 | Fallback raw ≤ 500 chars | UT-09, PBT-04, E2E-06 | ✅ Covered |
| BR-09 | Tool NEVER throws | UT-15, UT-16, IT-07, E2E-12 | ✅ Covered |
| BR-10 | Batch max 50 (configurable) | UT-12, E2E-08 | ✅ Covered |
| BR-11 | Batch stops on LLM failure | UT-13, IT-06, E2E-09 | ✅ Covered |
| BR-12 | Hook ≤ 20 lines | SIT-04 (manual verification) | ✅ Covered |
| BR-13 | Dedup prevents duplicates | UT-17, E2E-12 | ✅ Covered |
| BR-14 | Social messages = skip | UT-02, IT-02, E2E-02 | ✅ Covered |
| BR-15 | Use existing OllamaAdapter | IT-01 (verify adapter call) | ✅ Covered |

### 12.3 Coverage Summary

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 4 | 4 | 100% |
| Business Rules | 15 | 15 | 100% |
| Acceptance Criteria | 31 | 31 | 100% |
| Alternative Flows | 5 | 5 | 100% |
| Exception Flows | 8 | 8 | 100% |
| **Overall** | **63** | **63** | **100%** |

---

## 13. Appendix

### Glossary

| Term | Definition |
|------|------------|
| PBT | Property-Based Testing — generates random inputs to verify invariants |
| UT | Unit Testing — tests individual functions in isolation |
| IT | Integration Testing — tests component interactions |
| E2E-API | End-to-End API Testing — tests full MCP tool call lifecycle |
| E2E-UI | End-to-End UI Testing — N/A for this feature |
| SIT | System Integration Testing — full stack with real Ollama |
| RTM | Requirements Traceability Matrix |
| msw | Mock Service Worker — HTTP mocking library |

### Assumptions

- Ollama server available locally for SIT testing with qwen3:1.7b model
- SQLite database can be created/destroyed per test run
- MCP tool framework test utilities available for E2E-API tests
- CI environment supports running Vitest with coverage reporting
- fast-check library available for property-based testing

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Test Coverage | [test-coverage.png](diagrams/test-coverage.png) | [test-coverage.drawio](diagrams/test-coverage.drawio) |
| 2 | Test Execution Flow | [test-execution-flow.png](diagrams/test-execution-flow.png) | [test-execution-flow.drawio](diagrams/test-execution-flow.drawio) |
