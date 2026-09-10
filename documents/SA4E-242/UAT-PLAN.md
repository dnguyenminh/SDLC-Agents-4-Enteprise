# UAT Plan — SA4E-242
## KB Scope Auto-Detection based on VCS presence and branch for Extension ingest

---

## Document Information

| Field | Value |
|-------|-------|
| Ticket | SA4E-242 |
| Title | UAT Plan |
| Version | 1.0 |
| Date | 2026-09-05 |
| Author | QA Agent |
| Status | Draft |

---

## 1. Purpose & Objectives

### 1.1 Purpose
This User Acceptance Test Plan defines the strategy, scope, criteria and execution approach for UAT of KB Scope Auto-Detection feature. UAT is performed directly on production localhost due to single-environment constraint, with workspace isolation and feature flag control.

### 1.2 UAT Objectives
- Validate `detectKbScope()` correctly returns WORKSPACE for no VCS / feature branch and PROJECT for main/master
- Verify scope badge UI reflects detected scope and shows ingest confirmation
- Verify cache TTL behavior when switching branches
- Verify IsolationLayer prevents cross-scope read
- Ensure seamless migration for existing KB entries
- Confirm no regression for existing PROJECT ingest on main branch

---

## 2. Scope

### 2.1 In Scope
- Auto-assign WORKSPACE when .git absent
- Auto-assign WORKSPACE when current branch != main/master
- Auto-assign PROJECT when branch = main or master
- Scope badge UI display and ingest confirmation message
- Cache per workspace session with TTL 5 minutes
- Branch switch triggers scope recalculation after cache expiry
- IsolationLayer scope enforcement for read operations
- KPIs: detector overhead <50ms, fallback to WORKSPACE on error

### 2.2 Out of Scope
- Changing IsolationLayer backend logic
- Modifying data retention policies
- Manual scope override UI
- Performance benchmarks beyond detector latency

---

## 3. Entry & Exit Criteria

### 3.1 Entry Criteria
- Deployment phase is in_progress and extension is installed in PROD localhost environment
- BRD v1.1, FSD v1.1, TDD v1.0 approved
- STP and STC completed
- Test environment provisioned: VS Code with SA4E extension, git repos, backend indexer-http running on http://localhost:48721
- Data freeze snapshot taken before UAT
- Feature flag scope.autoDetect.enabled configured
- Synthetic test workspaces prepared with workspace isolation
- Test data: workspaces with/without .git, branches main, master, feature/x, develop

### 3.2 Exit Criteria
- All UAT test cases in UAT-STC.md executed with ≥95% pass rate
- Critical defects = 0, Major defects ≤1
- Scope badge UI verified for all scenarios
- IsolationLayer cross-scope prevention verified
- UAT sign-off by Business User / BA
- Test evidence captured: screenshots, logs with `{ticket, detectedScope, reason}`

---

## 4. Test Environment

### 4.1 Environment Configuration
- **Single environment constraint:** Only localhost production is available
- OS: Windows 11 / macOS 14
- VS Code 1.95+
- Extension version: sa4e-extension@1.40.2
- Node.js >=18.14.1
- Git 2.40+
- Backend: indexer-http Hono service running on http://localhost:48721 (PROD)
- KB Store: Production SQLite with data freeze snapshot
- Feature flag: scope.autoDetect.enabled = true
- Workspace isolation enabled for UAT

### 4.2 Test Workspaces
- `workspace-no-git/` : No .git folder
- `workspace-feature/` : .git present, branch `feature/kb-scope`
- `workspace-develop/` : .git present, branch `develop`
- `workspace-main/` : .git present, branch `main`
- `workspace-master/` : .git present, branch `master`

### 4.3 Test Data Requirements
- Pre-seeded KB entries with scope WORKSPACE and PROJECT
- Log file access for scope decision entries

---

## 5. Roles & Responsibilities

| Role | Responsibility |
|------|----------------|
| Business User / BA | Define acceptance criteria, execute UAT scenarios, sign-off |
| QA Agent | Prepare UAT plan & cases, coordinate execution, track defects |
| Developer | Fix defects, provide environment support |
| Scrum Master | Track UAT progress, ensure entry/exit criteria met |

---

## 6. Test Schedule

| Phase | Duration | Milestone |
|-------|----------|-----------|
| UAT Preparation | 0.5 day | Environment ready |
| UAT Execution | 1 day | Test cases executed |
| Defect Retest | 0.5 day | Closure |
| UAT Sign-off | 0.5 day | Approval |

---

## 7. Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Git detection timeout | False WORKSPACE | Increase timeout, fallback logging |
| Cache stale after branch switch | Wrong scope | Force refresh option, TTL verification |
| Production data contamination during UAT | Data integrity loss | Data freeze snapshot before UAT; synthetic test workspace isolation |
| Uncontrolled rollout in single environment | Immediate production impact | Feature flag scope.autoDetect.enabled for instant toggle; rollback plan verified |
| No separate UAT environment | Reduced safety net | Workspace isolation + synthetic data + limited UAT window + on-call DevOps |
| Rollback failure | Extended downtime | Pre-tested rollback steps; previous VSIX version kept ready |

---

## 8. Defect Management

Severity: Critical / Major / Minor / Trivial
Priority: P1-P4
Defect lifecycle: New → Open → In Progress → Fixed → Verified → Closed
SLA: Critical 24h, Major 48h

---

## 9. References
- BRD.md v1.1
- FSD.md v1.1
- TDD.md v1.0
- STP.md v1
- UAT-STC.md
