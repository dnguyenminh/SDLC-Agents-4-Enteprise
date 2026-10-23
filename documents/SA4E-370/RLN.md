# Release Notes (RLN)

## SDLC Agents 4 Enterprise — SA4E-370: Custom Agents — real file-defined agent personas wired into the chat engine (identity, role scoping, per-tab sessions)

> **Scope of this document:** SA4E-370 (Epic) as delivered within release **v1.54.0**. The same release also ships SA4E-369 (PeerBus), SA4E-373 (ide_launch fix) and SA4E-374/375 follow-ups, covered by their own notes. This RLN covers the SA4E-370 scope only.

---

## Release Information

| Field | Value |
|-------|-------|
| Release Version | **1.54.0** (from 1.53.12) |
| Release Date | 2026-10-21 |
| Jira Ticket | SA4E-370 (Epic) — https://jiraassist.atlassian.net/browse/SA4E-370 |
| Artifact | `extension/sdlc-agents-4-enterprise-1.54.0.vsix` — 11,406,074 bytes (packaged 2026-10-21 13:21 +07) |
| Artifact SHA-256 | `1F805C8EA8C5B9FF1C917D21433A8432AC3F211023FCEC72447913B3E2B1749D` |
| Source Revision | tag `v1.54.0` → commit `dac657f` (2026-10-21 12:45 +07); merged to `main` via `94695ec` |
| Environment | PROD — Kiro / VS Code workstations |
| Author | DevOps Agent |
| Status | Draft — pending sign-off (retrospective documentation of the shipped release) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-23 | DevOps Agent | Initiate document — release v1.54.0 (SA4E-370 scope); figures verified against git history, release artifacts and SA4E-370 documents |

---

## 1. What's New

### 1.1 Feature Summary

Agent selection in the SDLC Chat is no longer cosmetic. With release 1.54.0, the agents you define as Markdown files in `.code-intel/agents/*.md` become **real personas wired into the chat engine**:

- **The file is the agent (S1).** The Markdown body of an agent file is the agent's system-prompt persona; optional frontmatter `role`, `phase` and `model` describe how the agent runs. Existing v1 agent files (only `name` + `description`) keep working — they load with default role/phase.
- **Selecting an agent actually switches the engine (S2).** Picking an agent in a chat tab loads its file, injects the persona into the session context (still passing through the context-governance/budget pipeline) and runs subsequent turns under the agent's `role`/`phase` — instead of the previous hardcoded `sm-agent` behaviour. Role-scoped tool loadout, skills and steering (built in SA4E-355) now apply to user-defined agents.
- **Each tab has its own brain (S3).** Every chat tab gets an independent agent session (registry key `workspaceRoot+tabId`) with per-tab token accounting and compaction — no shared history or budget between tabs. This is the same per-tab-session prerequisite (D1) that SA4E-369 PeerBus builds on — designed once, shared by both tickets.
- **The UI tells the truth (S4).** The per-tab agent badge and switch indicator reflect the agent actually active in that tab; `AGENT_SWITCHED` is emitted only after wiring (persona + role/phase + loadout) has succeeded and carries success/error detail.

Everything stays **zero-config**: no new settings keys, no new commands, nothing to manage beyond the agent files you already had.

### 1.2 User-Facing Changes

| # | Change | Description | Impact |
|---|--------|-------------|--------|
| 1 | Agent definition format v2 (S1) | `.code-intel/agents/*.md`: Markdown body = persona (system prompt); optional frontmatter `role`, `phase`, `model` (model override applied when valid, otherwise default + warning). v1 files remain supported | Medium |
| 2 | Real selectAgent wiring (S2) | Agent switch loads the file, injects persona respecting context governance, sets session `role`/`phase` from the definition; role-scoped loadout/skills/steering takes effect; hardcoded `sm-agent` role removed for user agents | High |
| 3 | Per-tab session isolation (S3) | One `AgentSession` per tab (`workspaceRoot+tabId`); per-tab budget/compaction; no history/token leakage across tabs | High |
| 4 | UI truthfulness (S4) | Per-tab agent badge + switch indicator; `AGENT_SWITCHED` only after successful wiring; conversation identity per agent in history | Medium |

### 1.3 Screenshots / UAT Evidence

Runtime UAT evidence (4 screenshots, 2026-10-19, captured via `ide_current_screenshot` after the SA4E-373 ide_launch fix) — full list in [TEST-REPORT.md](TEST-REPORT.md). Files live under the local temp path (%TEMP%/ide-screenshot-17923941*.png) and are not committed to the repo.

---

## 2. Technical Changes

### 2.1 Message / Type Surface

| Type | Item | Description |
|------|------|-------------|
| Modified | `AGENT_SWITCHED` message | Extended with `tabId`, `success`, `sessionRole`, `sessionPhase`, `error` — matches `ChatEngineAdapter` output (commit `90e41d5`) |
| Modified | `AgentInfo` | Adds `personaBody`; `ChatEngineAdapter.selectAgent` is now async/await (commit `8f200bc`) |
| Unchanged | VS Code commands / settings / activation events | Zero-config — no new keys or commands (DPG §1; TDD §10.1/§10.2) |

### 2.2 Database Changes

**None.** All agent/session/history/budget state is in-memory in the extension host; nothing persists to disk or a database (TDD §4.1).

### 2.3 Configuration Changes

**None.** Zero new configuration keys for agent identity. Version bump `1.53.12 → 1.54.0` applied to root / extension / backend `package.json` (release commit `dac657f`; `extension/package.json` verified at `1.54.0` on the tag).

### 2.4 Infrastructure Changes

**None.** Extension-only delivery — no containers, no new network surface, no pipeline changes (`npm run compile` → vitest → `vsce package` → Marketplace/OpenVSX unchanged; DPG §1 result: **NO CI/CD changes required**).

### 2.5 SA4E-370 Commits in Tag `v1.54.0`

| Commit | Date (+07) | Summary |
|--------|------------|---------|
| `8f200bc` | 2026-10-21 05:36 | Type definitions — `AgentInfo.personaBody` + `ChatEngineAdapter` async/await (fixes 3 TS errors from scope-mixed `adapter-core.ts`) |
| `90e41d5` | 2026-10-21 05:46 | `AGENT_SWITCHED` extended with `tabId` / `success` / `sessionRole` / `sessionPhase` / `error` |
| `f97e2fc` | 2026-10-21 05:50 | Complete webview/chat-panel type dependencies (agentStore, messageListener, postMessage, ChatStateManager, context-compaction/usage, message-routing, Layout.svelte, adapter-legacy-turns, ide-session-manager, cdp-tool-specs) + `bus.ts` PEER_010_EMPTY |
| `b28631e` | 2026-10-21 10:34 | 77 extension test failures fixed → **0/3224** (was 77/3218): D1 per-tab session keys (12 test files with `tabId`), mock path fixes, real-fs rewrites, `TabBar.svelte` CSS typo fix, new `selectAgent.test.ts` (6 tests), `ui-truthfulness.test.ts`, `tabStore.ts` |
| `dac657f` | 2026-10-21 12:45 | Release commit — version bump 1.53.12 → 1.54.0, README changelog/badges/install commands |

**Repository note (verified 2026-10-23).** Git history also contains three tree-identical parallel commits — `98457fb` (≡ `b28631e`), `cf725aa` (≡ `8f200bc`), `afa4ae9` (≡ `f97e2fc`) — that are **not** in tag `v1.54.0`'s ancestry; they are present on `main` and included from `v1.54.1` onward. For tag `v1.54.0`, the SA4E-370 commits are the four above plus the release commit.


---

## 3. Bug Fixes / Test & CI Alignment

| # | Change | Summary | Type |
|---|--------|---------|------|
| 1 | `TabBar.svelte` CSS typo | Missing `;` after `width:18px` caused a Svelte CSS-parser throw — fixed in `b28631e` | Production fix (Minor) |
| 2 | 77 extension test failures resolved | Test-suite alignment: D1 per-tab session keys applied to 12 test files (`ensureSessionHost` + `tabId`), mock path fixes (per-tab-session, dir-watchers, selectAgent incl. `vi.hoisted`), real-fs rewrites (fs-helpers, selectAgent), `compaction-helpers` `getActiveTabId` — result **3224/3224 PASS** | Test integrity |
| 3 | CI type alignment | 3 TypeScript errors from scope-mixed committed code; type definitions & dependencies completed (`8f200bc`, `90e41d5`, `f97e2fc`) — `tsc --noEmit` exit 0 | CI integrity |

> The 77 failing tests were pre-existing debt (flagged during SA4E-369 forensics; tied largely to the in-flight per-tab session refactor D1) and were fully resolved before tagging — the release ships with a green suite (Extension 3,224/3,224; Backend 3,330/3,330; tsc 0).

---

## 4. Testing Summary (at release time — v1.54.0)

| Level | Result |
|-------|--------|
| Extension unit/integration (vitest) | **3,224 / 3,224 PASS**, 0 failed (commits `b28631e`/`98457fb`; README v1.54.0 entry) |
| Backend (vitest) | **3,330 / 3,330 PASS** (README v1.54.0 CI-green entry) |
| TypeScript (`tsc --noEmit`) | **0 errors** (verified in fix commits; CI GREEN at `dac657f`) |
| Contract tests | PASS (README v1.54.0 CI entry; fix `9563c74`) |
| UAT (manual, 2026-10-19) | **PASS** — code-truthfulness verified: TC-004 (select agent wires persona + role), TC-005 (two tabs = two sessions; registry key `workspaceRoot+tabId`), TC-006 (badge truthfulness per tab), TC-007 (`AGENT_SWITCHED` only after wiring); plus S1 parser v2, S2 selectAgent governance, S4 UI truthfulness paths. Runtime evidence captured after SA4E-373 fix (4 screenshots) |
| STC catalog | 18 test cases defined (`TC-S1-01` … `TC-S4-03`) in [STC.md](STC.md) |

### Defect Summary

| Severity | Found | Fixed | Open |
|----------|-------|-------|------|
| Critical | 0 | 0 | 0 |
| Major | 0 | 0 | 0 |
| Minor | 1 (`TabBar.svelte` CSS typo) | 1 | 0 |

---

## 5. Known Issues & Limitations

| # | Issue | Impact | Workaround | Target Fix |
|---|-------|--------|------------|------------|
| 1 | UAT evidence is from 2026-10-19 (pre-release build, captured after the SA4E-373 ide_launch fix); no separate UAT pass is recorded on the packaged v1.54.0 VSIX — packaged artifact validation = full automated suite + CI GREEN | Packaged artifact not separately smoke-tested via UAT tooling | Optional post-release spot-check on an installed 1.54.0 build | Next spot-check / release policy |
| 2 | Security residuals from the design-time assessment (Phase 3.7 SAR, 2026-10-19): persona-body content sanitization (F05), per-agentId authorization matrix (F02) and audit trail (F16) have no recorded post-implementation verification in the SA4E-370 document set. Core structural gaps were addressed by delivery (per-tab isolation F01 via S3; role/phase wiring via S2) | Residual prompt-injection / visibility risk — bounded by workspace trust boundary, context-governance budget gate, and no code execution from agent files | Operate in trusted workspaces; review agent files before use | Track under a follow-up security item |
| 3 | `extension/CHANGELOG.md` not updated for v1.54.0 (top entry remains `[1.53.11]`); README.md carries the v1.54.0 changelog | Release history split across two files | Treat README.md changelog + this RLN as canonical for v1.54.0 | Next packaging cycle |
| 4 | Repo-root unversioned VSIX artifacts exist (`sdlc-agents-4-enterprise.vsix`, `sdlc-agents-4-enterprise-latest.vsix`) and are not the v1.54.0 release artifact | Installing them deploys an older/unknown build | Install only versioned artifacts from `extension/` (verify version + SHA-256) | Hygiene — carried over from v1.53.12 release notes |
| 5 | Later releases carry SA4E-370 forward: v1.54.1–v1.54.4 (2026-10-21) and v1.55.0–v1.55.1 (2026-10-22). v1.55.0 standardizes config keys with an auto-migration helper (old flat keys auto-migrated on activation) | Users on ≥ v1.55.0 see renamed settings (auto-migrated) | Auto-migration helper on activation; see v1.55.0 changelog | Informational |

> Release-level security context: the v1.54.0 bundle passed the security gates governed by the SA4E-369 pipeline — security review PASS, pentest 5/6 SAFE, deploy review GO (README v1.54.0 entry).

---

## 6. Breaking Changes

**None for v1.54.0 / SA4E-370 scope.**

- v1 agent files keep loading (missing role → default fallback; FR-03 backward compatibility).
- No settings, commands, data or config migration; all state is in-memory.
- Behavioural upgrade by design: a selected agent now scopes its tab's session (role/phase/loadout) instead of being a cosmetic label.

---

## 7. Dependencies

### 7.1 Co-released / Pre-requisite Changes

| Release | Version | Status | Note |
|---------|---------|--------|------|
| SA4E-369 PeerBus | same release v1.54.0 | Included (`71869e0`… in tag ancestry) | Its D1 = this epic's S3 (per-tab sessions) — designed once, shared |
| SA4E-373 ide_launch fix | same release v1.54.0 | Included | Required to capture UAT runtime evidence via CDP (`ide_launch` + `remoteDebuggingPort`) |
| SA4E-374 / SA4E-375 follow-ups | same release train | Included | Pega indexing SRP fix / project auto-upsert; related CI alignment commits in the release window |

### 7.2 External System Changes

None — no external systems, no new network surface.

---

## 8. Migration Notes

- **Data migration:** none (in-memory only).
- **Config migration:** none.
- **Agent files:** v1 files continue to work; to use v2 semantics, add a persona body + optional `role`/`phase`/`model` frontmatter.
- **Upgrade path:** in-place VSIX upgrade 1.53.12 → 1.54.0; reload the IDE window after install.

---

## 9. Deployment Instructions

Extension-only deployment; **no CI/CD changes required** (DPG §1). Full details: [DPG.md](DPG.md) — Deployment & Pipeline Guide SA4E-370, v1.0 (2026-10-19).

| Step | Action | Estimated |
|------|--------|-----------|
| 1 | Build & package (`cd extension` → `npm ci` → `npm run esbuild` → `npx vsce package --no-dependencies`) | ~5 min (est.) |
| 2 | Artifact verification (extension version `1.54.0`, SHA-256 `1F805C8E…B1749D`) | ~2 min (est.) |
| 3 | Install (`kiro --install-extension sdlc-agents-4-enterprise-1.54.0.vsix`) + Reload Window | ~2 min (est.) |
| 4 | Verification (activation without error; `agentsLoaded` with v2 AgentInfo; `AGENT_SWITCHED` after wiring; per-tab isolation smoke) | ~5 min (est.) |
| **Total** | | **~15 min (est.)** |

Distribution: SIT = install packaged `.vsix` on VS Code / Kiro desktop; PROD = VS Code Marketplace / OpenVSX (same pipeline). Install only versioned artifacts from `extension/`.

---

## 10. Rollback Plan

**A. Artifact rollback (standard release rollback):** uninstall 1.54.0 → install previous release `extension/sdlc-agents-4-enterprise-1.53.12.vsix` (11,405,657 bytes, packaged 2026-10-20) → Reload Window. **~5 min (est.)**. No data/config rollback needed.

**B. Source-level rollback (per DPG §7):** revert registry key `workspaceRoot+tabId` → `workspaceRoot`; revert `context-compaction`/`context-usage` to `tabId="default"`; revert `adapter-core.ts` `selectAgent` to emit-only stub; revert `fs-helpers.ts` parser to v1; revert `message-routing.ts` prefix mechanism. All changes are in-memory — no database migration to roll back.

**Rollback decision criteria:**
- Extension fails to activate, or agent switch breaks chat sessions (no session created / cross-tab leakage) → **immediate rollback**
- Regression in context governance / budget gates / compaction → **immediate rollback**
- Cosmetic-only UI issue → hotfix, no rollback

---

## 11. Contacts

| Role | Name | Contact | Responsibility |
|------|------|---------|----------------|
| Release Manager | {SM name} | {email} | Release coordination |
| Product Owner | Duc Nguyen Minh | (Jira reporter) | Business sign-off |
| Dev Lead | {name} | {email} | Technical issues |
| QA Lead | {name} | {email} | Testing sign-off |
| DevOps | DevOps Agent | — | Deployment execution |

---

## 12. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Dev Lead | | | ☐ Approved |
| QA Lead | | | ☐ Approved |
| Product Owner | | | ☐ Approved |
| Release Manager | | | ☐ Approved |

---

## Appendix A — Related Documents

| Document | Location |
|----------|----------|
| BRD / FSD / TDD | `documents/SA4E-370/BRD.md`, `FSD.md`, `TDD.md` |
| STP / STC | `documents/SA4E-370/STP.md`, `STC.md` (18 cases `TC-S1-01` … `TC-S4-03`) |
| UAT / Test report | `documents/SA4E-370/TEST-REPORT.md` |
| Security assessment (Phase 3.7, design-time) | `documents/SA4E-370/SECURITY-ASSESSMENT.md` |
| Deployment guide | `documents/SA4E-370/DPG.md` |
| PeerBus release notes (same release) | `documents/SA4E-369/RLN.md` |

## Appendix B — Verification Trail (2026-10-23)

```
git log --oneline --all --grep="SA4E-370"      → 8 commits (4 in tag v1.54.0 + release commit + 3 parallel re-commits)
git rev-list v1.54.0                            → includes b28631e, 8f200bc, 90e41d5, f97e2fc, dac657f
git rev-parse b28631e^{tree} 98457fb^{tree}     → identical tree 07618c3d… (likewise 8f200bc ≡ cf725aa, f97e2fc ≡ afa4ae9)
git log -1 v1.54.0                              → dac657f "Release v1.54.0 — … 77 test fixes (SA4E-370) …"
git tag --list "v1.54*"                         → v1.54.0 … v1.54.4
Get-FileHash extension/sdlc-agents-4-enterprise-1.54.0.vsix → 1F805C8E…B1749D
```

---

*End of Release Notes — SA4E-370, release v1.54.0 (2026-10-21). Documented retrospectively 2026-10-23. Author: DevOps Agent.*
