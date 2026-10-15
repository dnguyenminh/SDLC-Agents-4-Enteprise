
# Release Notes (RLN)

## SDLC Agents for Enterprise — SA4E-360: Multi-Resolution Context Supply (P1: Code Skeletonization + Agentic Context Loading)

---

## Release Information

| Field | Value |
|-------|-------|
| Release Version | **1.53.0** (git tag `v1.53.0`) |
| Release Date | 2026-10-15 |
| Jira Ticket | SA4E-360 |
| Environment | Developer workstations (Kiro IDE + loopback backend) — UAT verified 2026-10-15 |
| Author | DevOps Agent |
| Status | Released |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-15 | DevOps Agent | Initiate document — release train v1.52.x → v1.53.0 |

---

## 1. What's New

### 1.1 Feature Summary

The AI assistant now reads your codebase the way a developer skims it: **structure first, details on demand**. Before this release, long working sessions pulled whole files into the model's context until the budget ran out. With **Multi-Resolution Context Supply (P1)**, the assistant receives a compact **code skeleton** — class/function signatures and structural outline — and can load exactly the method bodies it needs via a new `read_method` capability, backed by a semantic **functional map** of the workspace.

Result: multi-turn sessions on large workspaces now complete with **zero "context exceeded" errors**, and secret-looking content (passwords, API keys) is redacted before it ever reaches the model prompt.

### 1.2 User-Facing Changes

| # | Change | Description | Impact |
|---|--------|-------------|--------|
| 1 | Code skeleton in context | Assistant starts from a token-budgeted skeleton (signatures + outline) instead of full files; sessions stay within budget on large workspaces | High |
| 2 | Agentic detail loading (`read_method`) | The agent pulls specific method bodies on demand instead of bulk file reads; read-only tool, safe by design | High |
| 3 | Functional map | Two-level map (C-360-M1/M2) lets the assistant locate relevant code semantically before reading | Medium |
| 4 | Fallback ladder | If the code index is missing, stale, or the backend bridge is absent, the assistant automatically falls back to pre-360 behavior — nothing breaks | Medium |
| 5 | Secret redaction (SEC-360-01..07) | Secret-like values and secret-named files are excluded/redacted from skeletons and prompts | High (security) |
| 6 | Richer telemetry | `PI_GATE_DECISION` now carries skeleton audit fields; `PI_SKELETON_*` events make degradation observable in the "SDLC Agents" Output channel | Low |

### 1.3 Screenshots (if applicable)

See UAT evidence: `documents/SA4E-360/evidence/uat3/` (SDLC Chat panel turns, SIT-01/02/04/07 artifacts).

---

## 2. Technical Changes

### 2.1 API Changes (loopback backend MCP tools)

| Type | Endpoint/Tool | Method | Description |
|------|---------------|--------|-------------|
| New | `code_symbol_locate` | MCP tool | Thin tool (SQL over symbols JOIN files) — locate symbols semantically (TDD §4.2, DISC-1) |
| New | `code_extract_signatures` | MCP tool | Thin tool — backend-side signature extraction with regex fallback (TDD §4.3, OI-1) |
| New | `read_method` (extension) | Pi tool | Read-only detail loading; added to `READ_ONLY_TOOLS` and lean tool loadout |

### 2.2 Database Changes

None. No schema changes in this release (SQLite/PostgreSQL untouched).

### 2.3 Configuration Changes

| Property | Change Type | Description |
|----------|-------------|-------------|
| — | None | No new settings keys; SA4E-355 budget configuration reused unchanged; skeleton auto-activates on the Pi session path |

### 2.4 Infrastructure Changes

| Component | Change | Description |
|-----------|--------|-------------|
| Extension VSIX | Rebuilt | `sdlc-agents-4-enterprise-1.53.0.vsix` (~12.5 MB); new module `extension/src/pi-workflow/skeleton/` (8 modules) |
| Loopback backend | Additive tools | 2 new tool registrations (`backend/src/engine/tools/code-locate.ts`, `code-extract.ts`); rebuild + restart required when deploying from source |
| Git | Tag | `v1.53.0` on `main` |

---

## 3. Bug Fixes

| # | Jira Ticket | Summary | Severity |
|---|------------|---------|----------|
| 1 | SA4E-360 (F-1) | Security-review fix wave 1 — verified live in `evidence/f-fix-verification-2026-10-15.log` | Major |
| 2 | SA4E-360 (F-2) | Security-review fix wave 2 — verified live | Major |
| 3 | SA4E-360 (F-3) | Security-review fix wave 3 — verified live | Major |
| 4 | SA4E-360 (DEFECT-QA-01) | Dedicated regression tests for F-1/F-2/F-3 added before Phase 6 close | Minor |

> **Release-train note:** the SA4E-355 UAT bug-fix chain — legacy-path governance (`5663d11`), intra-turn `streamFn` gate (`70a0a90`), user-message pin (`c11f461`) — was **already included in tag `v1.52.0`** (same release train v1.52.x → v1.53.0) and is **not new** in v1.53.0. Listed here for train completeness only.

---

## 4. Known Issues & Limitations

| # | Issue | Impact | Workaround | Target Fix |
|---|-------|--------|------------|------------|
| 1 | Skeleton supply is active on the **session (Pi harness) path only**; the legacy chat path does not receive skeletons | Legacy-path sessions keep pre-360 behavior (no skeleton benefit) | Use the **SDLC Chat** panel (Pi session path) for skeleton-powered sessions | **SA4E-361** (follow-up ticket created) |
| 2 | Finding E: 2 files at **211 / 229 lines** exceed the 200-line code standard (exception recorded) | No user impact; internal code-quality exception | None needed — SIT-08 recorded **PASS with exception** | Backlog refactor |
| 3 | **SIT-03 / SIT-05 / SIT-06 NOT RUN** (harness-specific scenarios, user-discretion per UAT round 3) | Those three manual scenarios remain unverified | Manual spot-check on demand; SIT-01/02/04/07/08 all verified | Next regression cycle |
| 4 | **E2E-API-04 Postgres parity leg missing** — skeleton tools exercised on the SQLite leg in that E2E case | Postgres-engine parity for that specific flow not covered by E2E | Parity covered by unit/integration tests; both engines share the tool layer | Follow-up ticket (backend E2E) |
| 5 | **SEC-360-03 #1: rate limiting on `/mcp`** not implemented (security backlog) | Low practical risk: loopback-only binding + SA4E-358 OriginGate already mitigate external abuse | None required for local workstation use | Security backlog |
| 6 | **Turn duration up to 421 s** observed on a 9B-parameter local model with large prompts | Slow turns on small local models with heavy prompts | Use medium/large model tier, or reduce workspace scope for the session | Monitor; P2 optimization |

---

## 5. Dependencies

### 5.1 Pre-requisite Releases

| Release | Version | Status | Required Before |
|---------|---------|--------|-----------------|
| SA4E-355 Context Budget Governance | 1.52.0 | Deployed (tagged 2026-10-14) | This release — skeleton composes with the 3-gate budget enforcement |
| SA4E-356 / SA4E-358 security hardening | 1.52.0 | Deployed | Same train — MCP path resolution + CORS/Origin gate |

### 5.2 External System Changes

| System | Change Required | Status | Contact |
|--------|----------------|--------|---------|
| Loopback backend server | Rebuild + restart from source so the 2 new MCP tools register | Done (workstation) | DevOps |
| Code-intel index (workspace) | None — index self-heals via `IndexFreshnessChecker` (reindex or degrade) | N/A | — |

> Backward compatibility: extension **1.53.0 with backend 1.52.0** works via the fallback ladder (no new tools → pre-360 behavior, `PI_SKELETON_BRIDGE_ABSENT`/fallback events). Backend **1.53.0 with extension 1.52.0** works — new tools are additive and simply unused.

---

## 6. Migration Notes

### 6.1 Data Migration

| Migration | Description | Automated | Estimated Time |
|-----------|-------------|-----------|----------------|
| None | No data migration in this release | — | — |

### 6.2 Breaking Changes

| Change | Impact | Migration Path |
|--------|--------|----------------|
| None | — | — |

> No breaking changes in this release. Fully backward compatible (see §5.2).

### 6.3 Backward Compatibility

Fully compatible in both directions:
- **New extension + old backend:** fallback ladder engages automatically; turns complete with pre-360 context behavior.
- **Old extension + new backend:** 2 new tools are additive; existing endpoints and payloads unchanged.
- **No configuration or data migration** required when upgrading from 1.52.0 → 1.53.0.

---

## 7. Testing Summary

| Test Level | Total | Passed | Failed | Blocked/Pending | Pass Rate |
|------------|-------|--------|--------|-----------------|-----------|
| Unit/Integration (extension, Phase-7 pre-tag re-run) | 2,899 (298 files) | 2,899 | 0 | 0 | 100% |
| Backend unit (impl-time full suite) | 3,461 (330 files) | 3,461 | 0 | 0 | 100% |
| E2E-API (real loopback server) | 180 | 180 | 0 | 0 | 100% |
| Phase 6 test plan (STC, 2 rounds + F-fix verification) | 78 | 65 | 0 | 13 pending | 100% of executed |
| SIT (manual, CDP round 3) | 8 | 5 (SIT-01/02/04/07 + SIT-08 w/ exception) | 0 | 3 not run (SIT-03/05/06) | 100% of executed |
| UAT | 4 core | 4 | 0 | 0 | 100% |

### Defect Summary

| Severity | Found | Fixed | Open | Deferred |
|----------|-------|-------|------|----------|
| Critical | 0 | 0 | 0 | 0 |
| Major | 3 (F-1/F-2/F-3 security) | 3 | 0 | 0 |
| Minor | 1 (DEFECT-QA-01) + 6 Low (PT-360-01..06 pentest) | 1 (+ pentest Lows deferred) | 0 | 6 Low → backlog |

**Security:** pentest verdict **SECURE-WITH-NOTES** — 120 attempts, 0 Critical / 0 High / 0 Medium; design review SEC-360-01..07 all mapped to tests.

---

## 8. Deployment Instructions

See the Deployment Guide for detailed, executable steps: [DPG.md](DPG.md) (DPG-v1.0-SA4E-360.docx).

### Quick Reference

| Step | Action | Estimated Time |
|------|--------|----------------|
| 1 | Quit Kiro instances | < 1 min |
| 2 | Backend rebuild + restart (new tools) | ~3 min |
| 3 | Package VSIX (`npm run package:prod`) | ~2 min |
| 4 | Install VSIX + Reload Window | ~2 min |
| 5 | Verification (health checks + smoke turns) | ~5 min |
| **Total** | | **~13 min** (fresh workstation) |

> This release is **already installed** on the UAT workstation (verified 2026-10-15). Remaining GA actions: git tag `v1.53.0` + README changelog.

---

## 9. Rollback Plan

See DPG §8 for detailed steps and the rollback flow diagram.

**Rollback Decision Criteria:**
- Extension activation error or broken SDLC Chat panel → immediate rollback to 1.52.0
- Context-exceed errors reappear on session path → immediate rollback to 1.52.0
- Backend tool errors → extension rollback alone is sufficient (additive tools)

**Estimated Rollback Time:** ~5 min (extension only) / ~10 min incl. backend. No DB or config rollback needed.

---

## 10. Contacts

| Role | Name | Contact | Responsibility |
|------|------|---------|----------------|
| Release Manager | (per Jira SA4E-360 assignee) | Jira | Release coordination |
| Dev Lead | (per component owner) | Jira | Technical issues |
| QA Lead | (per Phase 6 owner) | Jira | Testing sign-off |
| DevOps | DevOps agent (via SM) | Jira | Deployment execution |
| Business Owner | (per epic owner) | Jira | Business sign-off |

---

## 11. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Dev Lead | | | ☐ Approved |
| QA Lead | | 2026-10-15 | ☑ Approved (UAT PASSED — CDP round 3) |
| Business Owner | | | ☐ Approved |
| Release Manager | | | ☐ Approved |
