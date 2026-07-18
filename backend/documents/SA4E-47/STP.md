# Software Test Plan (STP)

## Knowledge Base Evolution Memory — SA4E-47: Cải tiến Document Indexing với LLM Context Chain

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-47 |
| Title | Cải tiến Document Indexing với LLM Context Chain |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-07-18 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-47.docx |
| Related FSD | FSD-v1-SA4E-47.docx |
| Related TDD | TDD-v1-SA4E-47.docx |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | QA Agent – QA Engineer | Create document |
| Peer Reviewer | TA Agent – Technical Architect | Review testing scope and coverage |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-18 | QA Agent | Initiate document — auto-generated from BRD, FSD, and TDD v1.0 |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm the test plan in this STP |
| | ☐ I agree and confirm the test plan in this STP |

---

## 1. Introduction

### 1.1 Purpose

This Software Test Plan (STP) defines the testing strategy, scope, resources, and schedule for **SA4E-47: Cải tiến Document Indexing với LLM Context Chain**. The feature enhances the Knowledge Base (KB) document indexing pipeline with four key improvements: (1) full content LLM analysis (removing the 2000-char truncation), (2) context chain between document sections, (3) expanded LLM extraction (summary, business_entities, actors, business_rules), and (4) persistent storage of extraction results in `structured_map` JSON column.

### 1.2 Test Objectives

- Verify all functional requirements from FSD UC-001 through UC-004 are implemented correctly
- Validate all 54 business rules (BR-001 through BR-054) are enforced
- Ensure backward compatibility for existing entries with `structured_map = '{}'`
- Validate graceful degradation when LLM is unavailable or times out
- Ensure performance budgets from FSD Section 8 are met
- Verify error handling scenarios from FSD Section 9
- Ensure integration test code uses real dependencies (DB, actual HTTP to LM Studio) not all mocks

### 1.3 References

| Document | Location |
|----------|----------|
| BRD v1.0 | documents/SA4E-47/BRD.md |
| FSD v1.0 | documents/SA4E-47/FSD.md |
| TDD v1.0 | documents/SA4E-47/TDD.md |
| STP Template | documents/templates/STP-TEMPLATE.md |
| STC Template | documents/templates/STC-TEMPLATE.md |

---

## 2. Test Strategy

### 2.1 Test Levels

| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| **PBT** | Correctness properties for pure functions (chunkContent, safeParseStructuredMap, parseEnhancedResponse) with random inputs | ✅ Automated | vitest + fast-check |
| **UT** | Unit/edge case tests for individual functions and methods with mocked dependencies | ✅ Automated | vitest (Jest-compatible) |
| **IT** | Integration tests with real SQLite DB and mocked LLM (full component interaction) | ✅ Automated | vitest + better-sqlite3 (:memory:) |
| **E2E-API** | Full REST endpoint E2E (mem_ingest_file → structured_map in DB) | ✅ Automated | vitest + Ktor/Hono test client |
| **E2E-UI** | Browser UI E2E — not applicable (backend-only feature, no UI changes) | ❌ N/A | N/A |
| **SIT** | Manual exploratory / visual verification / edge cases requiring human judgment | ❌ Manual | Browser (manual) |

### 2.2 Test Types

| Type | Description | Applicable |
|------|-------------|------------|
| Functional Testing | Verify features work per FSD use cases (UC-001 to UC-004) | Yes |
| Regression Testing | Ensure existing features (handleIngest, keyword fallback, TaskWorker) are not broken | Yes |
| Performance Testing | Verify response times, token budgets, throughput targets from FSD §8 | Yes |
| Security Testing | Verify data isolation, input validation, LLM prompt injection protection | Partial |
| Backward Compatibility | Verify old entries with `structured_map = '{}'` still work | Yes |
| Error Handling | Verify all 13 error scenarios from FSD §9.1 | Yes |

### 2.3 Test Approach

- **Unit Testing (UT + PBT)**: Each pure function is tested with deterministic inputs and property-based random inputs. Mock LLMService for tests that call analyzeWithLLM. Mock PendingTaskRepository + MemoryEngine for processTagEnrichment tests.
- **Integration Testing (IT)**: Use in-memory SQLite database with full schema. Mock only the LLM HTTP call (via vi.mock on LLMService). Test the full pipeline from pending_tasks insertion through TaskWorker processing to final structured_map update.
- **E2E-API Testing**: Use Hono test client to invoke `mem_ingest_file` tool endpoint. Verify knowledge_entries and pending_tables state after processing.
- **Performance Testing**: Use wall-clock timing with real LLM calls (LM Studio) for latency measurement. Repeat 20 iterations for statistical significance.
- **SIT (Manual)**: Reserved for visual verification of log output, DB state inspection, and edge cases that require human judgment (race conditions, timing-dependent behavior).

### 2.4 Entry Criteria

| Level | Entry Criteria |
|-------|---------------|
| PBT + UT | Code compiles without errors; test environment configured; vitest runs |
| IT | UT passed; database schema available; test fixtures defined |
| E2E-API | IT passed; Hono server can start; MCP tool endpoint accessible |
| SIT | All automated tests pass; code deployed to test environment; test data prepared |
| Performance | All functional tests pass; LM Studio running with qwen3-8b model |

### 2.5 Exit Criteria

| Level | Exit Criteria |
|-------|--------------|
| All Automated | 100% test cases executed; 0 critical defects; ≥ 95% pass rate |
| SIT | 100% test cases executed; 0 critical defects; ≤ 2 major defects open |
| Performance | LLM analysis latency for 5000 chars ≤ 10s p95; structured_map merge ≤ 5ms |
| Overall | All exit criteria met; RTM shows 100% coverage; test report filed |

### 2.6 E2E Automation Coverage

The following SIT-eligible scenarios are reclassified to automated levels to minimize manual testing:

| Scenario Type | Classification | Rationale |
|--------------|---------------|-----------|
| CRUD via file ingest (mem_ingest_file) | **E2E-API** | Deterministic API call/response |
| structured_map JSON verification | **E2E-API** | Query DB directly, no browser needed |
| Context chain propagation | **E2E-API** | Verify via DB queries on multiple entries |
| LLM response parsing (old format, invalid JSON) | **UT** | Pure function, deterministic inputs |
| Chunking merge correctness | **UT** | Pure function test with known inputs |
| Fallback scenarios (timeout, LLM down) | **IT** | Mock LLM errors, verify fallback output |
| Backward compatibility | **IT** | Insert old-format entries, process with new code |
| structured_map size limit | **UT** | Unit test with oversized mock data |
| Visual log inspection | **SIT** | Requires human to read log output |
| Race condition timing | **SIT** | Timing-dependent, hard to reproduce automatically |

### 2.7 Test Levels Table (Kiro Spec)

| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| PBT | Correctness properties (random inputs) | ✅ Automated | vitest + fast-check |
| UT | Unit/edge case tests | ✅ Automated | vitest |
| IT | API integration (real DB, mocked LLM) | ✅ Automated | vitest + better-sqlite3 |
| E2E-API | REST endpoint E2E (real server) | ✅ Automated | Hono test client + vitest |
| E2E-UI | Browser UI E2E | ❌ N/A | No UI changes in this ticket |
| SIT | Manual exploratory / edge cases only | ❌ Manual | Browser |

### 2.8 Test Cases Summary Table

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 3 | 3 | 0 |
| UT | 12 | 12 | 0 |
| IT | 8 | 8 | 0 |
| E2E-API | 5 | 5 | 0 |
| E2E-UI | 0 | 0 | 0 |
| SIT | 4 | 0 | 4 |
| **Total** | **32** | **28 (87.5%)** | **4 (12.5%)** |

---

## 3. Test Scope

### 3.1 Features In Scope

| # | Feature / Story | Priority | FSD Reference | Test Type |
|---|----------------|----------|---------------|-----------|
| 1 | Full content LLM analysis (remove 2000-char truncation) | P0 | UC-001, BR-001 to BR-007 | UT, IT, E2E-API |
| 2 | Context chain between sections | P0 | UC-002, BR-010 to BR-016 | UT, IT, E2E-API |
| 3 | Expanded LLM extraction (summary, entities, actors, rules) | P0 | UC-003, BR-020 to BR-029 | UT, IT, PBT |
| 4 | structured_map storage (merge + truncation) | P0 | UC-004, BR-030 to BR-036 | UT, IT, E2E-API |
| 5 | Backward compatibility | P0 | BR-040 to BR-044 | IT |
| 6 | Configurable context chain and chunking | P1/P2 | BR-050 to BR-054 | UT, IT |
| 7 | LLM fallback (timeout, unavailable, parse error) | P0 | ERR-001 to ERR-013 | UT, IT |
| 8 | Chunking with overlap for long content | P0 | AF-001, BR-002 to BR-005 | UT, IT, PBT |
| 9 | Graceful degradation (keyword extraction fallback) | P0 | EF-001 to EF-004, ERR-001 to ERR-013 | UT, IT |
| 10 | structured_map size enforcement (100KB max) | P1 | BR-033, ERR-008 | UT |

### 3.2 Features Out of Scope

| # | Feature | Reason |
|---|---------|--------|
| 1 | Schema changes (knowledge_entries, pending_tasks) | No schema changes required; structured_map already exists |
| 2 | FTS5 indexing strategy changes | structured_map NOT in FTS index per design |
| 3 | UI/Admin Portal for structured_map visualization | Separate ticket |
| 4 | Search on structured_map fields | Separate ticket |
| 5 | Backend architecture changes (Hono routing, MCP tools, DatabaseAdapter) | Not part of this feature |
| 6 | File metadata scanning (loadFileMetadata) | Kept unchanged |
| 7 | VECTOR_EMBEDDING task processing | Unchanged TaskWorker behavior |
| 8 | Cross-file context chain | Context chain only within same file per BR-010 |

### 3.3 Test Coverage Diagram

![Test Coverage](diagrams/test-coverage.png)
*[Edit in draw.io](diagrams/test-coverage.drawio)*

---

## 4. Test Environment

### 4.1 Environment Requirements

| Environment | URL | Database | Purpose |
|-------------|-----|----------|---------|
| Development | localhost:3000 | SQLite (in-memory for test) | Unit + Integration testing |
| SIT | localhost:3000 | SQLite (WAL mode, file-based) | System Integration Testing |
| Performance | localhost:3000 | SQLite (WAL mode) | Performance benchmarks |

### 4.2 Browser / Device Requirements

| Browser | Version | OS | Required |
|---------|---------|-----|----------|
| Chromium | Latest | Windows/Mac | For SIT manual testing |
| Node.js | 20.x | Any | For all automated tests |

### 4.3 Test Data Requirements

| Data Type | Description | Source | Preparation |
|-----------|-------------|--------|-------------|
| Short documents | < 500 chars, 1-3 sections | Test fixtures | Inline test data |
| Medium documents | 500-5000 chars, 3-10 sections | Test fixtures | Pre-written markdown files |
| Long documents | 5000-15000 chars, 10-20 sections | Test fixtures | Generated via script |
| Chunk-boundary documents | 6000-20000 chars | Generated | Auto-generated to trigger chunking |
| Old-format entries | structured_map = '{}' | DB seed | Pre-inserted in DB |
| LLM mock responses | Various formats (valid, old, invalid) | Static JSON | Defined in test mocks |

### 4.4 External Dependencies

| System | Dependency | Mock/Stub Available |
|--------|-----------|---------------------|
| LM Studio (LLM Backend) | localhost:1234, qwen3-8b model | ✅ Mock LLMService for UT/IT |
| SQLite Database | better-sqlite3 | ✅ In-memory DB for UT/IT |
| MCP Framework | Hono server | ✅ Hono test client for E2E-API |

---

## 5. Test Schedule

| Phase | Start Date | End Date | Duration | Milestone |
|-------|-----------|----------|----------|-----------|
| Test Planning | 2026-07-18 | 2026-07-19 | 2 days | STP + STC approved |
| Test Data Preparation | 2026-07-19 | 2026-07-20 | 2 days | Test data (CSV, fixtures) ready |
| Unit Test Implementation | 2026-07-20 | 2026-07-22 | 3 days | UT + PBT pass |
| Integration Test Implementation | 2026-07-22 | 2026-07-23 | 2 days | IT pass |
| SIT Execution | 2026-07-23 | 2026-07-24 | 2 days | SIT sign-off |
| Defect Fix & Retest | 2026-07-24 | 2026-07-25 | 2 days | All Critical/Major fixed |
| Performance Testing | 2026-07-25 | 2026-07-25 | 1 day | Performance sign-off |
| Test Completion Report | 2026-07-25 | 2026-07-25 | 1 day | Final report |

---

## 6. Resources & Responsibilities

| Role | Name | Responsibility |
|------|------|---------------|
| Test Lead | QA Agent | Test planning, coordination, reporting |
| QA Engineer | QA Agent | Test case design, execution, defect reporting |
| BA | BA Agent | UAT support, acceptance criteria clarification |
| Developer | DEV Agent | Bug fixing, unit test coverage |
| Technical Architect | TA Agent | Review testing scope, verify integration test approach |
| Solution Architect | SA Agent | Verify TDD compliance in tests |

### 6.1 Tools

| Tool | Purpose | Version |
|------|---------|---------|
| vitest | Test runner (unit, integration, E2E) | Latest |
| better-sqlite3 | In-memory database for tests | 11.x |
| fast-check | Property-based testing (optional) | Latest |
| Hono test client | E2E-API testing | 4.x |
| Pino logger | Log inspection in SIT | 9.x |
| Jira | Defect tracking | Cloud |

---

## 7. Risk & Mitigation

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | LLM context window insufficient for long sections (>8K tokens) | High — extraction quality degrades | Medium | Implement chunking with configurable overlap; test with section content up to 20K chars |
| 2 | Context chain makes file processing sequential, increasing latency | Medium — file takes 2x longer | High | Async sections, DB-based context lookup at runtime (FSD AD-001); measure latency budget |
| 3 | LLM output format changes with model upgrade | Medium — parsing could break | Low | Robust JSON parser (parseEnhancedResponse) with regex fallback; always set fallbackUsed flag |
| 4 | structured_map column size growth | Low — storage cost | Medium | 100KB per entry limit with truncation strategy; automated enforcement via UT |
| 5 | LLM hallucination in summary/entity extraction | Medium — incorrect KB metadata | Medium | confidence threshold; extraction_meta tracks model & fallback for audit trail |
| 6 | Race condition: section N processed before section N-1 | Medium — context chain empty | Low | loadPreviousContext returns null gracefully; test with artificial timing |
| 7 | Test environment (LM Studio) not available for performance testing | High — cannot measure real latency | Medium | Mock LLM latency for CI; manual perf run on dev machine with LM Studio |

---

## 8. Defect Management

### 8.1 Severity Levels

| Severity | Definition | Example |
|----------|-----------|---------|
| Critical | System crash, data loss, extraction produces no output | LLM fallback not working; no tags applied |
| Major | Feature not working as designed, workaround exists | Context chain not applied; structured_map not updated |
| Minor | Incorrect behavior in edge case, easy workaround | Fields not truncated at exactly 100KB boundary |
| Trivial | Cosmetic, logging level incorrect | Log message typo; debug level wrong |

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

### 8.4 SLA for Severity

| Severity | Initial Response | Fix Time | Re-test Time |
|----------|-----------------|----------|--------------|
| Critical | 1 hour | 4 hours | 2 hours |
| Major | 2 hours | 8 hours | 4 hours |
| Minor | 4 hours | 2 days | 4 hours |
| Trivial | 8 hours | 5 days | 8 hours |

---

## 9. Test Metrics & Reporting

### 9.1 Metrics

| Metric | Formula | Target |
|--------|---------|--------|
| Test Execution Rate | Executed / Total × 100% | 100% |
| Pass Rate | Passed / Executed × 100% | ≥ 95% |
| Defect Density | Defects / Test Cases | ≤ 0.15 |
| Critical Defect Count | Count of Critical severity | 0 at exit |
| Automation Coverage | Automated / Total × 100% | ≥ 85% |
| LLM Analysis Latency (5000 chars) | p95 of 20 runs | ≤ 10s |
| structured_map merge time | p95 of 100 runs | ≤ 5ms |
| Context chain DB lookup | p95 of 100 runs | ≤ 10ms |

### 9.2 Reporting Schedule

| Report | Frequency | Audience |
|--------|-----------|----------|
| Daily Test Status | Daily during SIT | Project team |
| Defect Summary | Daily | Dev team + SM |
| Performance Test Report | End of perf testing | All stakeholders |
| Test Completion Report | End of all testing | All stakeholders |

---

## 10. Appendix

### 10.1 Glossary

| Term | Definition |
|------|------------|
| Context Chain | Technique of passing prior section's summary into the next section's LLM prompt to maintain document-level context |
| structured_map | JSON column in `knowledge_entries` table storing extraction results (tags, summary, entities, actors, rules) |
| TagAnalyzerService | Service in `llm/analyzer.ts` that uses LLM to extract tags/metadata from KB entry content |
| TaskWorker | Background worker processing `pending_tasks` (TAG_ENRICHMENT, VECTOR_EMBEDDING) |
| Chunking | Automatic content splitting when section exceeds LLM context window, with configurable overlap |
| Context Window | Maximum tokens an LLM can process in one request (qwen3-8b: ~32K tokens via LM Studio) |
| Graceful Degradation | Fallback to keyword-based extraction when LLM is unavailable or times out |
| LLMService | Facade in `llm/LLMService.ts` providing multi-provider LLM access |
| PBT | Property-Based Testing — tests that verify properties hold for many random inputs |
| IT | Integration Testing — tests component interactions with real DB and mocks for external services |

### 10.2 Assumptions

- LLM backend (qwen3-8b via LM Studio) is available on localhost:1234 for performance testing
- `structured_map` column already exists in DB schema — zero migration needed
- Existing entries with `structured_map = '{}'` remain fully operational
- File documents have 3-20 sections (typical); context chain overhead is proportional
- TaskWorker processes 1 task at a time (single-threaded); no concurrent processing issues

### 10.3 Test Execution Flow Diagram

![Test Execution Flow](diagrams/test-execution-flow.png)
*[Edit in draw.io](diagrams/test-execution-flow.drawio)*

### 10.4 Test Data Setup Scripts

See `testdata/` directory for CSV test data files:
- `pre-seeded-users.csv` — Pre-seeded test data for knowledge_entries
- `ingest-file-testdata.csv` — Test documents for file ingestion scenarios
- `create-entry-testdata.csv` — Test data for entry creation with various content lengths
- `structured-map-testdata.csv` — Test data for structured_map merge/truncation scenarios
- `auth-testdata.csv` — Test data for backward compatibility scenarios

### 10.5 Quality Gates

| Gate | Criteria | Check |
|------|----------|-------|
| RTM Coverage | 100% of requirements have test cases | Manual review |
| Test Automation | ≥ 85% of tests automated | CI pipeline |
| Integration Tests | Use real SQLite DB, not mock DB adapters | Code review |
| Performance Budgets | LLM latency ≤ 10s p95 for 5000 chars | Performance test run |
| No Broken Tests | All tests must pass with ZERO failures | CI pipeline gate |
