# UAT Test Cases — SA4E-242
## KB Scope Auto-Detection based on VCS presence and branch for Extension ingest

---

## Document Information

| Field | Value |
|-------|-------|
| Ticket | SA4E-242 |
| Title | UAT Test Cases |
| Version | 1.0 |
| Date | 2026-09-05 |
| Author | QA Agent |

---

## Test Case Summary

| ID | Scenario | Priority |
|----|----------|----------|
| UAT-001 | Create file in workspace without git → scope WORKSPACE | High |
| UAT-002 | Create file in feature branch → scope WORKSPACE | High |
| UAT-003 | Commit on main branch → scope PROJECT | High |
| UAT-004 | Commit on master branch → scope PROJECT | High |
| UAT-005 | Switch branch and verify scope updates after cache TTL | Medium |
| UAT-006 | Verify scope badge UI and ingest confirmation | High |
| UAT-007 | Verify IsolationLayer prevents cross-scope read | High |
| UAT-008 | Git detection failure fallback to WORKSPACE | Medium |

---

### UAT-001: Create file in workspace without git → scope WORKSPACE

| Field | Value |
|-------|-------|
| ID | UAT-001 |
| Priority | High |
| Type | Functional / UAT |
| Requirement | US-1, BR-1, UC-1 |
| Preconditions | Workspace `workspace-no-git/` has no .git folder. Extension active. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open VS Code with `workspace-no-git/` |
| 2 | Trigger KB ingest via Extension command "Ingest Current File" on new file |
| 3 | Observe scope badge / output channel | |
| 4 | Check logs for scope decision | |

**Expected Result:** Scope detected as WORKSPACE, reason='no VCS', ingest confirmation shows WORKSPACE badge, entry persisted with scope WORKSPACE.

**Test Data:** New file `test-no-git.md` content arbitrary.

**Postconditions:** KB entry exists with scope WORKSPACE.

---

### UAT-002: Create file in feature branch → scope WORKSPACE

| Field | Value |
|-------|-------|
| ID | UAT-002 |
| Priority | High |
| Type | Functional / UAT |
| Requirement | US-1, BR-2, UC-1 |
| Preconditions | Workspace `workspace-feature/` git repo on branch `feature/kb-scope`. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open workspace-feature |
| 2 | Verify current branch via `git branch --show-current` = feature/kb-scope |
| 3 | Create file `feature-doc.md` and trigger ingest |
| 4 | Check scope badge | |

**Expected Result:** Scope = WORKSPACE, reason='branch=feature/kb-scope', ingest confirmation shows WORKSPACE.

**Test Data:** file content valid.

**Postconditions:** Entry persisted with scope WORKSPACE.

---

### UAT-003: Commit on main branch → scope PROJECT

| Field | Value |
|-------|-------|
| ID | UAT-003 |
| Priority | High |
| Type | Functional / UAT |
| Requirement | US-2, BR-4, UC-2 |
| Preconditions | Workspace `workspace-main/` on branch `main`. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open workspace-main |
| 2 | Verify branch = main |
| 3 | Trigger ingest on file |
| 4 | Check logs | |

**Expected Result:** Scope = PROJECT, reason='branch=main', scope badge shows PROJECT, entry persisted with PROJECT.

**Postconditions:** KB entry with PROJECT scope.

---

### UAT-004: Commit on master branch → scope PROJECT

| Field | Value |
|-------|-------|
| ID | UAT-004 |
| Priority | High |
| Type | Functional / UAT |
| Requirement | US-2, BR-5, UC-2 |
| Preconditions | Workspace `workspace-master/` on branch `master`. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open workspace-master |
| 2 | Trigger ingest |
| 3 | Verify scope | |

**Expected Result:** Scope = PROJECT, reason='branch=master'.

---

### UAT-005: Switch branch and verify scope updates after cache TTL

| Field | Value |
|-------|-------|
| ID | UAT-005 |
| Priority | Medium |
| Type | Functional / Non-Functional |
| Requirement | Cache TTL 5 min, FSD 2.3 |
| Preconditions | Workspace on feature branch, cache has WORKSPACE. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Perform ingest on feature branch → WORKSPACE |
| 2 | Switch git branch to main via terminal |
| 3 | Immediately trigger ingest again | |
| 4 | Wait >5 min TTL or forceRefresh |
| 5 | Trigger ingest again | |

**Expected Result:** First immediate ingest returns cached WORKSPACE. After TTL expiry, ingest returns PROJECT with reason='branch=main' and source='detected'.

---

### UAT-006: Verify scope badge UI, ingest confirmation

| Field | Value |
|-------|-------|
| ID | UAT-006 |
| Priority | High |
| Type | UI / UAT |
| Requirement | BRD US-1 AC3, US-2 AC3 |
| Preconditions | Extension UI active. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger ingest in no-git workspace |
| 2 | Observe status bar / toast notification |
| 3 | Check output channel log entry format | |

**Expected Result:** Scope badge shows WORKSPACE with color coding, toast shows "Ingested with scope WORKSPACE — reason: no VCS". Log contains `{ticket, detectedScope, reason}`.

---

### UAT-007: Verify IsolationLayer prevents cross-scope read

| Field | Value |
|-------|-------|
| ID | UAT-007 |
| Priority | High |
| Type | Security / Integration |
| Requirement | SA4E-31, IsolationLayer |
| Preconditions | Pre-seeded KB entries: WORKSPACE entry and PROJECT entry for same ticket. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open workspace-feature, query KB for ticket |
| 2 | Verify only WORKSPACE entries returned |
| 3 | Open workspace-main, query same ticket |
| 4 | Verify only PROJECT entries returned | |

**Expected Result:** IsolationLayer filters results by detected scope; cross-scope read blocked. No PROJECT entry visible in WORKSPACE context and vice versa.

---

### UAT-008: Git detection failure fallback to WORKSPACE

| Field | Value |
|-------|-------|
| ID | UAT-008 |
| Priority | Medium |
| Type | Exception |
| Requirement | FSD 5.1 Error Handling |
| Preconditions | Workspace with .git but git binary unavailable / timeout simulated. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Simulate git timeout / rename .git |
| 2 | Trigger ingest |
| 3 | Check logs | |

**Expected Result:** Fallback to WORKSPACE with reason='git error' / 'git timeout', WARN log emitted, ingest succeeds.

---

## Requirements Traceability Matrix

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| US-1 AC1 | BRD | UAT-001 | ✅ |
| US-1 AC2 | BRD | UAT-002 | ✅ |
| US-2 AC1 | BRD | UAT-003 | ✅ |
| US-2 AC2 | BRD | UAT-004 | ✅ |
| Cache TTL | FSD 2.3 | UAT-005 | ✅ |
| Scope badge UI | BRD | UAT-006 | ✅ |
| IsolationLayer | SA4E-31 | UAT-007 | ✅ |
| Fallback error | FSD 5.1 | UAT-008 | ✅ |

---

## Appendix

**Evidence:** Screenshots of scope badge, log excerpts, KB query results.

**Sign-off:** Business User signature required after successful execution.
