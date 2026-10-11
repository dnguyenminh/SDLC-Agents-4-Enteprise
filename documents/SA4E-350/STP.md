# Software Test Plan (STP)

## SDLC-Agents-4-Enterprise — SA4E-350: Pega CodeIntelligence @baseclass appliesTo stripped → 0 results; short insKey 404

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-350 |
| Title | Pega CodeIntelligence: rules/query strips '@baseclass' appliesTo → 0 results; short insKey 404 on custom service |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-10-11 |
| Status | Draft |
| Related BRD | N/A (Bugfix — root cause confirmed via real-server probe) |
| Related FSD | N/A (Bugfix — no FSD-Lite created, violation V2) |
| Related TDD | N/A (Bugfix — no TDD-Bugfix created, violation V3) |
| Related TEST-REPORT | TEST-REPORT-v1-SA4E-350.docx |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | QA Agent – QA Engineer | Create document |
| Peer Reviewer | BA Agent – Business Analyst | Review business coverage |
| Approver | SM Agent – Scrum Master | Final approval |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-11 | QA Agent | Initiate STP for bugfix SA4E-350 — 6 test levels, RTM trace to root cause probes |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm the test plan in this STP |
| | ☐ I agree and confirm the test plan in this STP |

---

## 1. Introduction

### 1.1 Purpose

This Test Plan defines the strategy, scope, and approach for verifying the bugfix for SA4E-350. The bugfix addresses two critical issues in the Pega CodeIntelligence client (`PegaRuleReadClient`):

1. **`@baseclass` appliesTo stripping** — The client stripped `@baseclass` from the appliesTo field before sending the query to the custom service `/api/CodeIntelligence/v1/rules/query`, causing 0 results because the service matches `appliesTo` EXACTLY (empty → 0, `@baseclass` → 1 result).

2. **Short insKey 404 on `/rules/instance`** — The query returns handle-only rows (no rule content). To fetch full rule content for KB indexing, a follow-up call to `/rules/instance` with the FULL `pzInsKey` (including `#timestamp`) is required. Short keys (without `#`) returned 404.

The fix (commit `96cc3b3`) implements:
- **Verbatim `@baseclass` passthrough** in `getObject()` triple query
- **Compat retry** with empty appliesTo ONLY when exact query misses AND original was `@baseclass` (fail-loud on auth/5xx)
- **Handle-row follow-up** via `fetchFullRuleIfHandleRow()` — calls `/rules/instance` with full `pzInsKey` for full rule JSON; soft fallback to handle row on failure

### 1.2 Test Objectives

- Verify the `@baseclass` appliesTo is passed verbatim to the query service (Probe A2 behavior)
- Verify compat retry with empty appliesTo triggers ONLY on exact miss + original `@baseclass`
- Verify handle-only query rows trigger `/rules/instance` follow-up with full `pzInsKey`
- Verify short `pzInsKey` (without `#`) falls back gracefully without 404 error
- Verify `/rules/instance` failures fall back softly to handle row
- Verify full rule body in query response skips instance follow-up (no extra HTTP call)
- Verify non-`@baseclass` appliesTo (e.g., `Work-`, `Data-Admin-Operator-ID`) works without retry
- Verify 401/5xx errors on query are rethrown immediately (fail-loud, no silent retry)
- Verify regression: existing rules like `pxIsMobileDevice` continue to work
- Verify runtime against real Pega Academy server (3/3 scenarios: pzBulkActions, pzModalButtonsConfiguration, pxIsMobileDevice)

### 1.3 References

| Document | Location |
|----------|----------|
| TEST-REPORT | TEST-REPORT-v1-SA4E-350.docx |
| STATUS | documents/SA4E-350/STATUS.json |
| RUN-LOG | documents/SA4E-350/RUN-LOG.md |
| Fix Commit | 96cc3b3 (main branch) |
| Source Code | extension/src/services/pega/PegaRuleReadClient.ts |
| Unit Tests | extension/src/__tests__/pega-rule-read-client.test.ts |

---

## 2. Test Strategy

### 2.1 Test Levels (6 Levels for Bugfix-Lite)

| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| **UT** | Unit tests for `PegaRuleReadClient` methods: `getObject`, `queryByTripleWithCompatRetry`, `fetchFullRuleIfHandleRow` | Automated | vitest |
| **IT** | Integration tests: Hono app in-process, real routing to `/api/CodeIntelligence/v1/rules/query` and `/rules/instance` | Automated | vitest + Hono `app.request()` |
| **E2E-API** | REST endpoint E2E against real server (Pega Academy): query + instance follow-up | Automated | vitest + fetch (real HTTP) |
| **Regression** | Full test suite + specific regression scenarios (pxIsMobileDevice, non-@baseclass rules) | Automated | vitest |
| **Smoke** | Quick verification of critical path after deploy: Index @baseclass rules, verify full content | Automated | vitest (temp suite) |
| **SIT** | Manual exploratory: UAT checklist from TEST-REPORT §4 (Index Source Code, KB entries, non-@baseclass) | Manual | Browser (Kiro extension) |

### 2.2 Test Types

| Type | Description | Applicable |
|------|-------------|------------|
| Functional Testing | Verify fix behavior per root cause probes | Yes |
| Regression Testing | Ensure existing features not broken | Yes |
| Integration Testing | Client ↔ custom service interaction | Yes |
| End-to-End API Testing | Real server probe scenarios | Yes |
| Smoke Testing | Post-deploy quick validation | Yes |

### 2.3 Test Approach

**Risk-Based Prioritization:**
- **P1 (Critical)**: Core fix scenarios (Probes A1-A2, B1-B2) — must pass
- **P2 (High)**: Edge cases (handle follow-up, fallback, non-@baseclass, 401 fail-loud)
- **P3 (Medium)**: Regression scenarios, full-body no follow-up
- **P4 (Low)**: Smoke/SIT manual UAT

**Automation First:** All levels except SIT are automated. SIT is manual UAT only (visual verification of KB content in Kiro).

**Test Data:** Real Pega Academy server (`https://8b99ujcj.pegaacademy.net/prweb`, operator `SSA@TGB`) used for E2E-API and Smoke. Unit/Integration tests use mocked HTTP responses based on probe data.

### 2.4 Entry Criteria

| Level | Entry Criteria |
|-------|---------------|
| UT | Source code committed, vitest available |
| IT | Hono test server starts, mocked service routes configured |
| E2E-API | Pega Academy server reachable, credentials in env vars |
| Regression | Full suite baseline (2405 tests) passing |
| Smoke | Extension packaged (.vsix), Kiro available |
| SIT | Extension installed in Kiro, user logged in |

### 2.5 Exit Criteria

| Level | Exit Criteria |
|-------|--------------|
| UT | 6/6 unit tests PASS, 100% coverage on modified methods |
| IT | All integration scenarios PASS, mocked responses match probe data |
| E2E-API | 3/3 runtime verify scenarios PASS against real server |
| Regression | 2405/2405 full suite PASS, pxIsMobileDevice regression PASS |
| Smoke | Extension installs, Index Source Code finds @baseclass rules with full content |
| SIT | UAT checklist 3/3 PASS (user confirmed) |

### 2.6 E2E Automation Coverage Classification

| Scenario Type | Classify As | Rationale |
|--------------|-------------|-----------|
| Query with appliesTo=@baseclass → verify 1 result | E2E-API | Deterministic API check |
| Query with appliesTo=empty → verify 0 results | E2E-API | Deterministic API check |
| /rules/instance with short insKey → verify 404 fallback | E2E-API | API-level check sufficient |
| /rules/instance with full insKey → verify full rule JSON | E2E-API | API-level check sufficient |
| Handle-row follow-up → verify instance called | IT | In-process Hono app, inspect call |
| Instance fail → verify soft fallback | IT | Mock instance failure, verify fallback |
| Full rule body → verify NO instance call | IT | In-process, verify no extra HTTP |
| Non-@baseclass appliesTo → verify no retry | UT/IT | Unit/integration logic check |
| 401 on query → verify rethrow (fail-loud) | UT | Unit test error path |
| Runtime verify 3 scenarios (real server) | E2E-API | Real HTTP, credentials from env |
| UAT: Index Source Code in Kiro | SIT | Visual, requires human judgment |
| UAT: KB entries have full content | SIT | Visual inspection |
| UAT: Non-@baseclass rules still work | SIT | Visual + functional |

---

## 3. Test Scope

### 3.1 Features In Scope

| # | Feature / Scenario | Priority | Root Cause Probe | Test Type |
|---|-------------------|----------|------------------|-----------|
| 1 | `@baseclass` appliesTo verbatim passthrough | P1 | A2 | UT, IT, E2E-API |
| 2 | Empty appliesTo compat retry (only on exact miss + original @baseclass) | P1 | A1→A2 | UT, IT |
| 3 | Handle-only row → `/rules/instance` follow-up with full pzInsKey | P1 | B1→B2 | UT, IT, E2E-API |
| 4 | Short pzInsKey (no #) → soft fallback (no 404 error) | P1 | B1 | UT, IT, E2E-API |
| 5 | `/rules/instance` failure → soft fallback to handle row | P2 | — | UT, IT |
| 6 | Full rule body in query → NO instance follow-up | P2 | — | UT, IT |
| 7 | Non-@baseclass appliesTo (Work-, Data-) → no retry | P2 | — | UT, IT, Regression |
| 8 | 401/5xx on query → fail-loud rethrow | P2 | — | UT |
| 9 | Regression: pxIsMobileDevice resolves | P1 | — | Regression, E2E-API, Smoke |
| 10 | Runtime: pzBulkActions full rule resolved | P1 | — | E2E-API, Smoke |
| 11 | Runtime: pzModalButtonsConfiguration full rule resolved | P1 | — | E2E-API, Smoke |
| 12 | UAT: Index Source Code finds @baseclass rules | P1 | — | SIT |
| 13 | UAT: KB entries have full rule content | P1 | — | SIT |
| 14 | UAT: Non-@baseclass rules still resolve | P2 | — | SIT |

### 3.2 Features Out of Scope

| # | Feature | Reason |
|---|---------|--------|
| 1 | Pega authentication / login flow | Not modified by this fix |
| 2 | Crawl helper parallel fetch logic | Caller unchanged |
| 3 | MCP tools integration | Caller unchanged |
| 4 | Other rule types (Decision Table, Data Transform) | Fix is generic to rule resolution |
| 5 | Performance/load testing | Bugfix, not performance change |
| 6 | UI/UX of Kiro extension | Backend fix only |

---

## 4. Test Environment

### 4.1 Environment Requirements

| Environment | URL | Database | Purpose |
|-------------|-----|----------|---------|
| Local Dev | http://localhost:3000 | SQLite (test.db) | Unit / Integration |
| Test (CI) | N/A | SQLite (in-memory) | Full suite |
| Real Server (E2E-API) | https://8b99ujcj.pegaacademy.net/prweb | Pega Academy | E2E-API, Smoke, Runtime Verify |
| UAT (SIT) | Kiro Extension Host | Extension SQLite | SIT Manual |

### 4.2 Test Data Requirements

| Data Type | Description | Source | Preparation |
|-----------|-------------|--------|-------------|
| Probe A1 | appliesTo=empty → 0 results | Real server probe | Pre-recorded in testdata/probe-a1.csv |
| Probe A2 | appliesTo=@baseclass → 1 result (pzBulkActions) | Real server probe | Pre-recorded in testdata/probe-a2.csv |
| Probe B1 | /rules/instance short insKey → 404 | Real server probe | Pre-recorded in testdata/probe-b1.csv |
| Probe B2 | /rules/instance full pzInsKey → 200 full rule (20KB) | Real server probe | Pre-recorded in testdata/probe-b2.csv |
| Handle-only row | 10 fields, no content, has pzInsKey | Derived from probe | testdata/handle-row.csv |
| Full rule JSON | Complete rule with content properties | Derived from probe B2 | testdata/full-rule.json |

### 4.3 External Dependencies

| System | Dependency | Mock/Stub Available |
|--------|-----------|---------------------|
| Pega Academy Server | `/api/CodeIntelligence/v1/rules/query` + `/rules/instance` | Yes — mocked in UT/IT using probe data |
| Pega Authentication | SSO/Operator credentials | Yes — env vars for real, mocked for UT/IT |

---

## 5. Test Schedule

| Phase | Start Date | End Date | Duration | Milestone |
|-------|-----------|----------|----------|-----------|
| Test Planning | 2026-10-11 | 2026-10-11 | 1 day | STP + STC approved |
| Test Implementation (UT/IT) | 2026-10-10 | 2026-10-10 | Done | 6 UT tests created |
| E2E-API / Runtime Verify | 2026-10-10 | 2026-10-10 | Done | 3/3 PASS |
| Regression | 2026-10-10 | 2026-10-10 | Done | 2405/2405 PASS |
| Smoke / SIT (UAT) | 2026-10-10 | 2026-10-10 | Done | User UAT PASS |
| Documentation | 2026-10-11 | 2026-10-11 | 1 day | STP/STC/UG/DPG/RLN complete |

---

## 6. Resources & Responsibilities

| Role | Name | Responsibility |
|------|------|---------------|
| Test Lead | QA Agent | Test planning, STP/STC creation, KB ingest |
| QA Engineer | QA Agent | Test case design, execution, defect reporting |
| Developer | Dev Agent | Bug fix implementation, unit test creation, UG.md |
| DevOps | DevOps Agent | Packaging, deployment, DPG/RLN |
| BA | BA Agent | Business coverage review (STC) |
| SM | SM Agent | Coordination, review, Jira transitions |

---

## 7. Risk & Mitigation

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | Pega Academy server unavailable | E2E-API/Smoke blocked | Medium | Mock server for UT/IT; skip E2E-API if down, document |
| 2 | Credentials expired (env var) | E2E-API blocked | Low | Rotate credentials, document in RUN-LOG |
| 3 | Test data mismatch (probe vs live) | False failures | Low | Use recorded probe data for mocks; real server for E2E only |
| 4 | Fix regression in future changes | Silent bug return | Medium | Regression tests in suite; CI gate |

---

## 8. Defect Management

### 8.1 Severity Levels

| Severity | Definition | Example |
|----------|-----------|---------|
| Critical | Core fix broken: @baseclass still stripped, or instance follow-up missing | Probe A2 returns 0, or full rule not fetched |
| Major | Edge case broken: compat retry wrong, fallback missing | Empty retry fires incorrectly, or 401 swallowed |
| Minor | Regression: non-@baseclass rule fails | pxIsMobileDevice not found |
| Trivial | Test code style, naming | Test name doesn't match convention |

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
| Pass Rate | Passed / Executed × 100% | 100% (bugfix) |
| Defect Density | Defects / Test Cases | 0 |
| Critical Defect Count | Count of Critical severity | 0 |
| Defect Fix Rate | Fixed / Total Defects × 100% | 100% |

### 9.2 Reporting Schedule

| Report | Frequency | Audience |
|--------|-----------|----------|
| Test Status | Once (bugfix) | Project team |
| Defect Summary | On failure | Dev team |
| Test Completion Report | End of test planning | All stakeholders |

---

## 10. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Test Coverage Matrix | [test-coverage.png](diagrams/test-coverage.png) | [test-coverage.drawio](diagrams/test-coverage.drawio) |
| 2 | Test Execution Flow | [test-execution-flow.png](diagrams/test-execution-flow.png) | [test-execution-flow.drawio](diagrams/test-execution-flow.drawio) |

### Glossary

| Term | Definition |
|------|------------|
| appliesTo | Pega rule resolution field (e.g., @baseclass, Work-, Data-) |
| pzInsKey | Pega instance key (format: `RULE-HTML-SECTION @BASECLASS PZBULKACTIONS #20180713T134741.673 GMT`) |
| Handle-only row | Query result with only metadata fields (10 fields), no rule content |
| Full rule JSON | Complete rule including content properties (HTML, JSON, etc.) |
| Compat retry | Fallback query with empty appliesTo for server compatibility |
| Fail-loud | Rethrow auth/5xx errors immediately, no silent retry |

### Assumptions

- Pega Academy server remains accessible and unchanged
- Custom service `/api/CodeIntelligence/v1/rules/query` behavior (exact appliesTo match) is stable
- Fix commit `96cc3b3` is the final version (no further changes)
- Version 1.48.0 includes this fix (released)