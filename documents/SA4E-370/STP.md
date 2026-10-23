# Software Test Plan (STP)

## SDLC Agents 4 Enterprise — SA4E-370: Custom Agents — real file-defined agent personas wired into the chat engine (identity, role scoping, per-tab sessions)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-370 |
| Title | Custom Agents — real file-defined agent personas wired into the chat engine (identity, role scoping, per-tab sessions) |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-10-19 |
| Status | Draft |
| Related BRD | documents/SA4E-370/BRD.md |
| Related FSD | documents/SA4E-370/FSD.md |
| Related TDD | documents/SA4E-370/TDD.md |
| Related Security Assessment | documents/SA4E-370/SECURITY-ASSESSMENT.md |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | QA Agent – QA Engineer | Create document |
| Peer Reviewer | Duc Nguyen Minh – Product Owner (Reporter) | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-19 | QA Agent | Initiate document — auto-generated from BRD, FSD, TDD, and SECURITY-ASSESSMENT |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm the test plan in this STP |
| | ☐ I agree and confirm the test plan in this STP |

---

## 1. Introduction

### 1.1 Purpose

This Software Test Plan (STP) defines the testing strategy, scope, approach, resources, schedule, and risks for the **Custom Agents** feature (Epic SA4E-370). The feature transforms the current cosmetic agent selection (text prefix `[Agent: X]`) into real agent identity wiring where agent definition files (`.code-intel/agents/*.md`) drive the engine's persona, role-scoped tool/skill/steering loadout, and per-tab session isolation.

### 1.2 Test Objectives

1. Verify all 13 Functional Requirements (FR-01 to FR-13) from FSD §11 test scenarios are implemented correctly.
2. Validate all Business Rules (BR-01 to BR-07, BR-S1-01 to BR-S1-03, BR-S2-01 to BR-S2-03, BR-S3-01 to BR-S3-04, BR-S4-01 to BR-S4-03) are enforced.
3. Validate security findings F01, F02, F03, F05, F06, F08, F16 are remediated/tested.
4. Verify non-functional requirements: agent switch latency < 500ms, hot-reload propagate < 2s, zero regression, ≥ 10 concurrent tabs scalability.
5. Ensure 100% requirements traceability (RTM coverage).

### 1.3 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-370/BRD.md |
| FSD | documents/SA4E-370/FSD.md |
| TDD | documents/SA4E-370/TDD.md |
| SECURITY-ASSESSMENT | documents/SA4E-370/SECURITY-ASSESSMENT.md |
| STATUS.json | documents/SA4E-370/STATUS.json |
| Project conventions | AGENTS.md (role matrix, draw.io only — never Mermaid) |

---

## 2. Test Strategy

### 2.1 Test Levels

| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| PBT | Correctness properties (random inputs) | Automated | fast-check |
| UT | Unit/edge case tests | Automated | vitest |
| IT | API/Integration (Hono app in-process) | Automated | vitest |
| E2E-API | REST endpoint E2E (real server) | Automated | vitest + fetch |
| E2E-UI | Browser UI E2E (Playwright) | Automated | Playwright |
| SIT | Manual exploratory / edge cases only | Manual | Browser / VS Code Extension Host |

For SA4E-370 (VS Code extension), the applicable levels are:
- **UT**: Parser (`fs-helpers.ts`), registry, loadout, context-compaction, context-usage unit tests.
- **IT**: Adapter selectAgent wiring, governance layer integration (budget gate → auto-chunk → TurnBudgetGuard → context pipeline), session lifecycle per-tab.
- **E2E-UI**: VS Code webview agent slash menu, badge per tab, switch indicator, tab switch.
- **SIT**: Manual exploratory testing in actual VS Code Extension Host (edge cases, visual/UX verification).

### 2.2 Test Types

| Type | Description | Applicable |
|------|-------------|------------|
| Functional Testing | Verify features per FSD use cases (UC-1 to UC-4) | Yes |
| Regression Testing | Ensure existing suites green (`role-scope-wiring.test.ts`, `tool-loadout-roles.test.ts`, `context-governance.*`, auto-chunk, session routing) | Yes |
| Performance Testing | Agent switch latency < 500ms; hot-reload propagate < 2s | Yes |
| Security Testing | Prompt injection, session isolation, agentId authorization, role validation, YAML safety, fail-open, audit trail | Yes |
| UI/UX Testing | Agent badge per tab, switch indicator truthfulness, history tagged | Yes |
| Compatibility Testing | VS Code Extension Host environment | Yes |

### 2.3 Test Approach

- **Risk-based prioritization**: MUST priority FRs (FR-01 to FR-10) tested first; SHOULD (FR-11, FR-12) and COULD (FR-13) next.
- **Automation first**: UT + IT automated via vitest; E2E-UI automated via Playwright where possible; SIT reserved for visual/UX/timing tests that cannot be automated.
- **Security findings tested as dedicated test cases** mapped to F01–F03, F05, F06, F08, F16.
- **Regression suites** executed as gate before any feature sign-off.

### 2.4 Entry Criteria

| Level | Entry Criteria |
|-------|---------------|
| UT | Source code compiled; test fixtures (agent .md files) prepared; vitest configured |
| IT | Integration test environment ready; mock LLM provider available; session cache clear hooks available |
| E2E-UI | Playwright installed; VS Code Extension Host launchable; test agent files pre-seeded |
| SIT | Extension built and packaged; VS Code available; admin/test credentials available |

### 2.5 Exit Criteria

| Level | Exit Criteria |
|-------|--------------|
| UT | 100% UT executed; 0 Critical/Major defects open |
| IT | 100% IT executed; 0 Critical defects; ≤ 2 Major defects open with workaround |
| E2E-UI | 100% automated E2E-UI executed; visual defects documented |
| SIT | All SIT scenarios executed; 0 Critical defects open; business sign-off obtained |
| Overall | RTM 100% coverage; all security findings addressed; NFR targets met |

---

## 3. Test Scope

### 3.1 Features In Scope

| # | Feature / Story | Priority | FSD Reference | Test Type |
|---|----------------|----------|---------------|-----------|
| 1 | S1 — Agent Definition Format v2 (parser, frontmatter v2, backward compat, hot-reload) | MUST | FSD 3.1 (FR-01, FR-02, FR-03, FR-04, FR-13) | Functional, UI, Regression |
| 2 | S2 — Real selectAgent Wiring (persona + role injection, governance, loadout scoping) | MUST | FSD 3.2 (FR-05, FR-06, FR-07, FR-08, FR-11) | Functional, Integration, Security |
| 3 | S3 — Per-tab / Per-agent Session Isolation (registry key, tabId compaction, dispose) | MUST | FSD 3.3 (FR-09, FR-10) | Functional, Integration, Security |
| 4 | S4 — UI Truthfulness (badge per tab, switch indicator, history tagged) | MUST / SHOULD | FSD 3.4 (FR-11, FR-12) | UI, Functional |
| 5 | Security findings remediation (F01, F02, F03, F05, F06, F08, F16) | HIGH | SECURITY-ASSESSMENT | Security |
| 6 | Regression (existing suites green) | MUST | FSD §11 TC-REG-01..05 | Regression |
| 7 | Non-functional (switch latency < 500ms, hot-reload < 2s, ≥ 10 tabs) | HIGH | BRD §6, FSD §8 | Performance, Scalability |

### 3.2 Features Out of Scope

| # | Feature | Reason |
|---|---------|--------|
| 1 | Cross-machine agent calls (@bacnh85/pi-a2a) | NG-1, tracked separately |
| 2 | pi-subagents parent→child delegation / acp_delegate | NG-2, feature addition not replacement |
| 3 | MCP tool registration | NG-3, separate SA4E-364 track |
| 4 | PeerBus tab↔tab messaging | NG-4, SA4E-369 owns delivery; this epic only delivers prerequisite S3 |
| 5 | Human inbox approval flow | NG-5, SA4E-369 locked AUTO-RUN |
| 6 | Official agent management UI editor form | NG-6, agent remains file-based; UI read-only |

---

## 4. Test Environment

### 4.1 Environment Requirements

| Environment | Purpose | Details |
|-------------|---------|---------|
| Dev / Local | Unit & Integration testing | Node.js, vitest, TypeScript, extension/src |
| E2E-UI | Playwright browser testing | Chromium, VS Code Extension Host launchable |
| SIT | Manual exploratory | VS Code Desktop (Insider/Stable), extension .vsix installed |

### 4.2 Browser / Device Requirements

| Browser | Version | OS | Required |
|---------|---------|-----|----------|
| Chromium (Playwright) | Latest | Windows/Mac/Linux | Yes (E2E-UI) |
| VS Code Extension Host | Stable/Insider | Windows/Mac/Linux | Yes (SIT) |

### 4.3 Test Data Requirements

| Data Type | Description | Source | Preparation |
|-----------|-------------|--------|-------------|
| Agent .md files (v2) | Valid agent definitions with role, phase, model, personaBody | `.code-intel/agents/*.md` fixtures | Pre-seed in test workspace |
| Agent .md files (v1) | Backward-compat files (name + description only) | Fixtures | Pre-seed |
| Invalid agent .md files | Broken YAML, crafted role, oversized persona | Fixtures | Pre-seed |
| Tab IDs | tab-1, tab-2, ... tab-10 | Test harness | Generated per test |
| Workspace roots | /ws-root-a, /ws-root-b | Test harness | Temp directories |

### 4.4 External Dependencies

| System | Dependency | Mock/Stub Available |
|--------|-----------|---------------------|
| LLM Provider | Model responses for turns | Mock provider (no real API calls) |
| File System | `.code-intel/agents/*.md` read/watch | Real temp FS + watcher |
| VS Code Extension Host | webview postMessage, file watchers | Playwright + real VS Code (SIT) |

---

## 5. Test Schedule

| Phase | Start Date | End Date | Duration | Milestone |
|-------|-----------|----------|----------|-----------|
| Test Planning | 2026-10-19 | 2026-10-19 | 1 day | STP + STC approved |
| Test Data Preparation | 2026-10-20 | 2026-10-20 | 1 day | Test agent fixtures ready |
| UT Execution | 2026-10-21 | 2026-10-21 | 1 day | UT sign-off |
| IT Execution | 2026-10-22 | 2026-10-22 | 1 day | IT sign-off |
| E2E-UI Execution | 2026-10-23 | 2026-10-23 | 1 day | E2E-UI sign-off |
| SIT Execution | 2026-10-26 | 2026-10-27 | 2 days | SIT sign-off |
| Defect Fix & Retest | 2026-10-28 | 2026-10-29 | 2 days | All Critical/Major fixed |
| UAT / Business Sign-off | 2026-10-30 | 2026-10-30 | 1 day | UAT sign-off |

---

## 6. Resources & Responsibilities

| Role | Responsibility |
|------|---------------|
| Test Lead (QA Agent) | Test planning, coordination, reporting, RTM maintenance |
| QA Engineer | Test case design, execution, defect reporting |
| BA (Duc Nguyen Minh) | UAT support, acceptance criteria clarification |
| Developer | Bug fixing, unit test coverage, fixture preparation |
| DevOps | Environment setup, extension build/packaging |

### Tools
- Test management: STC.md + TEST-REPORT CSV
- Bug tracking: Jira (SA4E project)
- Automation: vitest (UT/IT), Playwright (E2E-UI), fast-check (PBT)
- Diagrams: draw.io

---

## 7. Risk & Mitigation

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | Persona injection triggers budget gate (PI_CONTEXT_BUDGET_EXCEEDED) | High | Medium | Test gate with oversized persona; persona kept concise |
| 2 | Role filter drops critical tool | High | Low | BR-06 core tools never dropped; test tool-loadout-roles |
| 3 | Prompt injection via malicious personaBody | Medium | Medium | Sanitize personaBody; trust posture documented |
| 4 | S3 design duplicates SA4E-369 D1 | Medium | Medium | Locked rule: design ONCE; coordinate with SA4E-369 |
| 5 | Format v2 breaks v1 agent files | Medium | Low | FR-03 backward compatibility + fallback testing |
| 6 | Registry key churn / session leak | Medium | Medium | Dispose lifecycle on tab close; memory audit |
| 7 | Hardcoded `tabId="default"` missed | Medium | Medium | Grep audit + FR-10 test coverage |

---

## 8. Defect Management

### 8.1 Severity Levels

| Severity | Definition | Example |
|----------|-----------|---------|
| Critical | System crash, data loss, security breach, session isolation failure | History/token leak between tabs |
| Major | Feature not working, workaround exists | Agent switch fails; persona not injected |
| Minor | UI issue, cosmetic defect | Badge stale; indicator timing off |
| Trivial | Typo, minor alignment issue | Warning message wording |

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
| Defect Fix Rate | Fixed / Total Defects × 100% | ≥ 90% |
| RTM Coverage | Covered Requirements / Total Requirements × 100% | 100% |

### 9.2 Reporting Schedule

| Report | Frequency | Audience |
|--------|-----------|----------|
| Daily Test Status | Daily during execution | Project team |
| Defect Summary | Daily | Dev team + PM |
| Test Completion Report | End of SIT / End of UAT | All stakeholders |

---

## 10. Traceability Matrix (FR ↔ TC ↔ Security Finding)

| FR | Source | Test Cases | Security Findings | Status |
|----|--------|------------|-------------------|--------|
| FR-01 Persona body semantics | FSD 3.1 | TC-S1-01, TC-S1-02, TC-S1-03 | F05 (prompt injection) | Covered |
| FR-02 Extended frontmatter | FSD 3.1 | TC-S1-01, TC-S1-05, TC-S1-06 | F03 (role validation), F06 (YAML safety) | Covered |
| FR-03 Backward compatibility | FSD 3.1 | TC-S1-02, TC-S1-03 | F10 (v1 bypass) | Covered |
| FR-04 Hot-reload | FSD 3.1 | TC-S1-04 | F15 (integrity/hot-reload) | Covered |
| FR-05 Real selectAgent | FSD 3.2 | TC-S2-01, TC-S2-03, TC-S2-04 | F02 (agentId authz) | Covered |
| FR-06 Persona injection | FSD 3.2 | TC-S2-01, TC-S2-02 | F05 (prompt injection), F08 (fail-open) | Covered |
| FR-07 Role/phase from definition | FSD 3.2 | TC-S2-01, TC-S2-05 | F03 (role validation), F08 (fail-open) | Covered |
| FR-08 Role-scoped engine | FSD 3.2 | TC-S2-01, TC-S2-05, TC-REG-01 | F08 (fail-open privilege) | Covered |
| FR-09 Per-tab session | FSD 3.3 | TC-S3-01, TC-S3-03 | F01 (session isolation) | Covered |
| FR-10 Per-tab budget/compaction | FSD 3.3 | TC-S3-02, TC-S3-04 | F01 (session isolation) | Covered |
| FR-11 UI truthfulness | FSD 3.4 | TC-S4-01, TC-S4-02 | F02 (agentId authz) | Covered |
| FR-12 Per-agent conversation identity | FSD 3.4 | TC-S4-03 | — | Covered |
| FR-13 Model override | FSD 3.1, 3.2 | TC-S1-06, TC-S2-04 | F03 (model validation) | Covered |
| BR-01 Governance layers | BRD §5.2 | TC-S2-01, TC-S2-02 | F05, F08 | Covered |
| BR-02 Persona token cost | BRD §5.2 | TC-S2-02 | F05 | Covered |
| BR-03 Model override invalid | BRD §5.2 | TC-S1-06, TC-S2-04 | F03 | Covered |
| BR-04 Parser fail-safe | BRD §5.2 | TC-S1-03, TC-S2-01 (file error) | F06 | Covered |
| BR-05 No leak between tabs | BRD §5.2 | TC-S3-01, TC-S3-04 | F01 | Covered |
| BR-06 Core tools never dropped | BRD §5.2 | TC-REG-02 | F08 | Covered |
| BR-07 Fail-open | BRD §5.2 | TC-S2-05 | F08 | Covered |
| Security F01 | SECURITY-ASSESSMENT | TC-S3-01, TC-S3-03, TC-S3-04 | — | Covered |
| Security F02 | SECURITY-ASSESSMENT | TC-S2-01, TC-S4-01 | — | Covered |
| Security F03 | SECURITY-ASSESSMENT | TC-S1-05, TC-S1-06, TC-S2-05 | — | Covered |
| Security F05 | SECURITY-ASSESSMENT | TC-S1-01 (oversized), TC-S2-02 | — | Covered |
| Security F06 | SECURITY-ASSESSMENT | TC-S1-03 | — | Covered |
| Security F08 | SECURITY-ASSESSMENT | TC-S2-05, TC-S1-05 | — | Covered |
| Security F16 | SECURITY-ASSESSMENT | TC-SEC-AUDIT-01..04 | — | Covered |
| Regression REG-01..05 | FSD §11 | TC-REG-01..05 | — | Covered |

**Coverage Summary:**
| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Functional Requirements (FR-01 to FR-13) | 13 | 13 | 100% |
| Business Rules | 19 | 19 | 100% |
| Security Findings | 7 | 7 | 100% |
| Regression Suites | 5 | 5 | 100% |
| **Overall** | **44** | **44** | **100%** |

---

## 11. Appendix

### Glossary

| Term | Definition |
|------|------------|
| Agent Persona | Markdown body content of agent .md, injected as system prompt |
| AgentInfo v2 | Parsed structure: {id, name, description, role?, phase?, model?, personaBody} |
| selectAgent | Handler that loads agent file, injects persona, sets role/phase |
| Per-tab Session | Independent AgentSession per tab, key workspaceRoot+tabId |
| Budget Gate | runSessionBudgetGate — rejects with PI_CONTEXT_BUDGET_EXCEEDED |
| RTM | Requirements Traceability Matrix |

### Assumptions

- VS Code Extension Host is available for SIT/E2E-UI testing.
- Mock LLM provider available for IT (no real API calls).
- Agent .md fixtures pre-seeded in test workspace.
- S3 design shared with SA4E-369 (no duplicate implementation).
