# Software Test Plan (STP)

## Kiro Backend MCP Server — SA4E-18: Tool Visibility Tiers — reduce LLM context by hiding rarely-used tools

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-18 |
| Title | Tool Visibility Tiers — reduce LLM context by hiding rarely-used tools |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-07-09 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-18.docx |
| Related FSD | FSD-v1-SA4E-18.docx |
| Related TDD | TDD-v1-SA4E-18.docx |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | QA Agent – QA Engineer | Create document |
| Peer Reviewer | Duc Nguyen Minh – Reporter | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-09 | QA Agent | Initiate document — auto-generated from BRD, FSD, and TDD |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | [ ] I agree and confirm the test plan in this STP |
| | [ ] I agree and confirm the test plan in this STP |

---

## 1. Introduction

### 1.1 Purpose

This Test Plan defines the strategy, scope, levels, environment, and traceability for verifying **SA4E-18 — Tool Visibility Tiers** in the `kiro-backend-mcp` server. The change introduces a two-tier tool visibility model (CORE vs EXTENDED), a central `CORE_TOOLS` allowlist, non-blocking per-tool usage tracking, and 100% backward-compatible discoverability/callability of hidden tools.

The system under test is a **headless backend MCP server** (TypeScript/Node.js, `better-sqlite3`, MCP JSON-RPC). It has **no UI**. Consequently, the test effort concentrates on **Unit (UT)**, **Integration (IT)**, and **E2E-API** levels, with **Property-Based (PBT)** tests for correctness invariants of the pure config resolver and usage counter. E2E-UI is **Not Applicable** and SIT is minimized to a few manual/operator exploratory checks (see §2.1).

### 1.2 Test Objectives

- Verify `ListTools` returns exactly the 8 configured CORE tools and omits all EXTENDED tools (BR-01/02, UC-01).
- Verify meta-tools (`find_tools`, `execute_dynamic_tool`, `orchestration_status`) are always visible regardless of config (BR-03).
- Verify the central `CORE_TOOLS` resolver degrades gracefully for empty/duplicate/invalid/unknown entries and never throws (BR-04/05/06/08).
- Verify per-tool usage tracking increments on both invocation paths, persists across restart, never double-counts, and never blocks a tool call (BR-07/09/10/12, UC-03).
- Verify EXTENDED tools remain discoverable via `find_tools` and callable via `execute_dynamic_tool` and direct `CallTool` — 100% backward compatibility, 0 regressions (BR-11/13/14/15/16, UC-04).
- Verify the NFR target: `ListTools` serialized payload reduced by >= 70% vs the full-set baseline.

### 1.3 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-SA4E-18.docx |
| FSD | FSD-v1-SA4E-18.docx |
| TDD | TDD-v1-SA4E-18.docx |
| Dynamic tool execution pattern | .kiro/steering/tool-usage-dynamic.md |

---

## 2. Test Strategy

### 2.1 Test Levels

![Test Execution Flow](diagrams/test-execution-flow.png)

| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| PBT | Correctness properties over random inputs (resolver invariants, counter monotonicity) | Automated | fast-check + vitest/jest |
| UT | Unit/edge-case tests (resolveCoreToolNames, MemoryEngine methods, trackToolUsage) | Automated | vitest/jest |
| IT | In-process MCP handler + real SQLite integration (ListTools filter, CallTool hook, dynamic hook, mem_admin read path, schema DDL) | Automated | vitest/jest + better-sqlite3 (temp DB) |
| E2E-API | MCP JSON-RPC E2E against a running server instance (tools/list, tools/call, find_tools, execute_dynamic_tool, usage, restart) | Automated | MCP client / in-process transport + vitest/jest |
| E2E-UI | Browser UI E2E | N/A | — (no UI in this backend feature) |
| SIT | Manual exploratory / operator checks (LLM session context inspection, operator usage read, maintainer config edit) | Manual | MCP client / terminal |

**Rationale for E2E-UI = N/A and minimal SIT:** SA4E-18 is a pure backend/protocol change with no user interface. There are no screens, forms, or visual elements to validate. All observable behavior is expressed through the MCP JSON-RPC contract, which is fully automatable at the E2E-API level. SIT is therefore reduced to three manual sanity checks that benefit from human judgement (real LLM context reduction observation, human-readability of operator usage output, and the maintainer restart workflow).

**E2E Automation Coverage:** Every deterministic scenario from TDD §11.2 is automated as E2E-API (no browser needed). The only manual (SIT) items are the maintainer workflow and human-observation sanity checks that are not worth automating.

### 2.2 Test Types

| Type | Description | Applicable |
|------|-------------|------------|
| Functional Testing | Verify features per FSD use cases (filtering, tracking, discovery, execution) | Yes |
| Regression Testing | Ensure all previously-working tool invocations still work (BR-16) | Yes |
| Performance Testing | Usage-write overhead < 5 ms p95; filter cost < 1 ms; token reduction >= 70% | Yes |
| Security Testing | SQL-injection safety of bound `tool_name`; confirm visibility is NOT access control | Yes |
| Usability Testing | Not applicable (no UI) | No |
| Compatibility Testing | MCP protocol compliance with a smaller tool list | Yes |

### 2.3 Test Approach

Risk-based and traceability-driven. Correctness invariants of the pure resolver and the counter are covered by PBT; concrete edge cases by UT; wiring of handlers + real DB by IT; full protocol behavior by E2E-API. Manual SIT covers only what automation cannot meaningfully assert. Every test case traces to at least one BR / UC / AC, and every BR / UC has at least one test (see RTM in STC §10).

### 2.4 Entry Criteria

| Level | Entry Criteria |
|-------|---------------|
| PBT/UT | Code compiles (`npm run build` in `backend/`); new modules present (CoreTools.ts, toolUsageTracker.ts, MemoryEngine methods). |
| IT | UT pass; `tool_usage` DDL merged into `schema.ts`; temp SQLite DB provisioning available. |
| E2E-API | IT pass; server can start in test mode with full tool set ingested into `mcp_tools`. |
| SIT | E2E-API pass; a running server instance reachable by an MCP client. |

### 2.5 Exit Criteria

| Level | Exit Criteria |
|-------|--------------|
| PBT/UT | 100% of planned cases executed; 0 failing; branch coverage of new code >= 90%. |
| IT | 100% executed; 0 Critical/Major open; `tool_usage` row assertions pass against real DB. |
| E2E-API | 100% executed; all 10 §11.2 scenarios pass; token reduction assertion >= 70%; 0 regressions. |
| SIT | All 3 manual checks executed; results recorded with evidence; 0 Critical defects open. |

---
### 2.6 Test Cases Summary

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 4 | 4 | 0 |
| UT | 12 | 12 | 0 |
| IT | 5 | 5 | 0 |
| E2E-API | 10 | 10 | 0 |
| E2E-UI | 0 | 0 | 0 |
| SIT | 3 | 0 | 3 |
| **Total** | **34** | **31 (91%)** | **3 (9%)** |

---

## 3. Test Scope

![Test Coverage](diagrams/test-coverage.png)

### 3.1 Features In Scope

| # | Feature / Story | Priority | FSD Reference | Test Type |
|---|----------------|----------|---------------|-----------|
| 1 | Filtered ListTools (CORE-only response) | High | UC-01, BR-01/02/03/11 | Functional, Performance |
| 2 | Central CORE_TOOLS allowlist configuration | High | UC-02, BR-04/05/06/08 | Functional, Negative |
| 3 | Per-tool usage tracking (non-blocking, persistent) | Medium | UC-03, BR-07/09/10/12 | Functional, Performance, Integration |
| 4 | Backward-compatible discoverability & callability of hidden tools | High | UC-04, BR-13/14/15/16 | Functional, Regression |
| 5 | Usage read path (`mem_admin action=tool_usage`, OI-1) | Medium | TDD §4.3 | Integration, Manual |

### 3.2 Features Out of Scope

| # | Feature | Reason |
|---|---------|--------|
| 1 | Auto re-classification of tools from usage data | Out of scope per BRD §1.2 — this CR only collects counts. |
| 2 | Admin UI / console for the allowlist | Config-driven only; no UI in this CR. |
| 3 | Changes to tool handler behavior | No handler logic changes; only hooks added. |
| 4 | `find_tools` embedding / vector search logic | Unchanged per BRD §1.2. |
| 5 | Startup ingestion in `index.ts` | Explicitly UNCHANGED (BR-13); verified only, not modified. |
| 6 | Access-control enforcement on execution paths | By design, visibility is NOT access control (TDD §7.1). |

---

## 4. Test Environment

### 4.1 Environment Requirements

| Environment | Runtime | Database | Purpose |
|-------------|---------|----------|---------|
| Local / CI | Node.js + TypeScript (ESM) | `better-sqlite3` (temp/in-memory WAL SQLite per test) | PBT, UT, IT, E2E-API automated runs |
| Manual SIT | Running `kiro-backend-mcp` instance | Shared WAL SQLite (Memory DB) | Operator/maintainer manual checks via MCP client |

### 4.2 Browser / Device Requirements

Not applicable — headless MCP server, no UI.

### 4.3 Test Data Requirements

| Data Type | Description | Source | Preparation |
|-----------|-------------|--------|-------------|
| CORE tool list | The 8 CORE tool names + representative EXTENDED names | `testdata/core-tools-list.csv` | Static fixture |
| Resolver inputs | Valid/empty/duplicate/invalid/unknown CORE_TOOLS arrays | `testdata/resolve-core-scenarios.csv` | Static fixture |
| Usage scenarios | Invocation paths, repetition counts, expected counters | `testdata/usage-scenarios.csv` | Static fixture; DB seeded per test |
| Full tool set | ~60 registered tools ingested into `mcp_tools` at startup | Existing registry + startup ingestion | Provisioned by server bootstrap |

### 4.4 External Dependencies

| System | Dependency | Mock/Stub Available |
|--------|-----------|---------------------|
| MemoryModule DB | Persistent store for `tool_usage` counters | Yes — temp SQLite file / in-memory DB for automated tests |
| Child MCP servers (proxied tools) | Source of EXTENDED proxied tools (OI-4) | Yes — a native EXTENDED registry tool can substitute for proxied-path assertions |
| MCP transport | JSON-RPC request/response | Yes — in-process transport / direct handler invocation |

---

## 5. Test Schedule

| Phase | Duration (est.) | Milestone |
|-------|-----------------|-----------|
| Test Planning (STP + STC) | 1 day | STP + STC approved |
| Test Data Preparation | 0.5 day | CSV fixtures ready |
| PBT + UT Execution | 1 day | Resolver + engine + tracker verified |
| IT Execution | 1 day | Handler + DB wiring verified |
| E2E-API Execution | 1 day | All 10 §11.2 scenarios pass |
| Manual SIT + Report | 0.5 day | SIT sign-off, TEST-REPORT ready |

---

## 6. Resources & Responsibilities

| Role | Responsibility |
|------|---------------|
| Test Lead | Test planning, RTM ownership, reporting, quality gate |
| QA Engineer | Test case design, PBT/UT/IT/E2E-API authoring & execution, defect reporting |
| BA | Acceptance criteria clarification, UAT support |
| Developer | Implement per TDD checklist, fix defects, keep tests green (`npm run build` + test) |
| DevOps | CI pipeline for automated test execution |

Tools: test management (this STC + TEST-REPORT.csv), bug tracking (Jira), automation (vitest/jest + fast-check + better-sqlite3).

---

## 7. Risk & Mitigation

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | Hidden tool not discoverable due to weak embedding match | Medium | Low | Keep full vector ingestion; test find_tools with threshold 0.3 + rephrase (E2E-API-04). |
| 2 | Usage tracking adds latency / contention | Low | Low | Non-blocking best-effort UPSERT; micro-benchmark asserts < 5 ms p95 (TC covered under E2E-API perf). |
| 3 | Double counting in dynamic path | Medium | Medium | Explicit no_double_count test (E2E-API-10) + IT-03 asserting distinct rows. |
| 4 | Misconfigured CORE_TOOLS crashes startup | High | Low | PBT/UT prove resolver never throws; EF fallbacks tested (UT-02/04/05). |
| 5 | Regression on previously-working tool calls | High | Low | Regression coverage via direct CallTool + execute_dynamic_tool E2E (BR-16). |
| 6 | Visibility mistaken for access control | Medium | Low | Security test confirms hidden tools remain callable; documented as non-boundary (TDD §7.1). |

---

## 8. Defect Management

### 8.1 Severity Levels

| Severity | Definition | Example (this feature) |
|----------|-----------|------------------------|
| Critical | Server crash / all tool calls broken / data loss | Startup crash on bad CORE_TOOLS; every CallTool fails |
| Major | Feature not working, workaround exists | ListTools returns full set; usage never increments |
| Minor | Non-blocking incorrectness | Wrapper row not counted; ordering wrong in read path |
| Trivial | Cosmetic / log wording | Warn message text mismatch |

### 8.2 Priority Levels

| Priority | Definition | SLA (Fix Time) |
|----------|-----------|----------------|
| P1 | Must fix immediately | 4 hours |
| P2 | Must fix before release | 1 business day |
| P3 | Should fix if time permits | 3 business days |
| P4 | Nice to fix, can defer | Next release |

### 8.3 Defect Lifecycle

```
New -> Open -> In Progress -> Fixed -> Ready for Retest -> Verified -> Closed
                                                        -> Reopened -> In Progress
```

SLA: Critical=P1, Major=P2, Minor=P3, Trivial=P4.

---

## 9. Test Metrics & Reporting

### 9.1 Metrics

| Metric | Formula | Target |
|--------|---------|--------|
| Test Execution Rate | Executed / Total x 100% | 100% |
| Pass Rate | Passed / Executed x 100% | >= 95% |
| Defect Density | Defects / Test Cases | <= 0.1 |
| Critical Defect Count | Count of Critical severity | 0 |
| RTM Coverage | Requirements with >= 1 test / Total requirements | 100% |
| Branch Coverage (new code) | Covered branches / Total branches | >= 90% |
| Token Reduction | 1 - (CORE payload bytes / full payload bytes) | >= 70% |

### 9.2 Reporting

| Report | Frequency | Audience |
|--------|-----------|----------|
| Test execution status (TEST-REPORT.csv) | Per run | Project team |
| Defect summary | Daily during execution | Dev team + PM |
| Test Completion Report (TEST-REPORT.md) | End of cycle | All stakeholders |

---

## 10. Appendix

### Glossary

| Term | Definition |
|------|------------|
| CORE / EXTENDED tier | Visible allowlisted tools vs hidden-but-callable tools |
| PBT | Property-Based Test |
| UT / IT | Unit Test / Integration Test |
| E2E-API | End-to-end MCP JSON-RPC test against a running server |
| SIT | System Integration Testing (manual exploratory) |
| RTM | Requirements Traceability Matrix |
| UPSERT | Insert-or-update SQLite operation for the usage counter |

### Assumptions

- The existing `find_tools` + `execute_dynamic_tool` pattern is reliable (per tool-usage-dynamic.md).
- All ~60 tools are ingested into `mcp_tools` at startup (BR-13, unchanged).
- The confirmed 8-tool CORE set covers high-frequency operations.

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Test Coverage Matrix | [test-coverage.png](diagrams/test-coverage.png) | [test-coverage.drawio](diagrams/test-coverage.drawio) |
| 2 | Test Execution Flow | [test-execution-flow.png](diagrams/test-execution-flow.png) | [test-execution-flow.drawio](diagrams/test-execution-flow.drawio) |
