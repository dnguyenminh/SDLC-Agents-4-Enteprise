# Release Notes (RLN)

## SDLC Agents for Enterprise — SA4E-355: Context Budget Governance for Pi Harness

---

## Release Information

| Field | Value |
|-------|-------|
| Release Version | 1.52.0 (git tag `v1.52.0`) |
| Release Date | 2026-10-13 (UAT PASSED) — tagged 2026-10-14 |
| Jira Ticket | SA4E-355 |
| Environment | UAT (PASSED) → PROD |
| Author | DevOps Agent |
| Status | Released |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-14 | DevOps Agent | Initiate document — release 1.52.0 |

---

## 1. What's New

### 1.1 Feature Summary

Phiên bản 1.52.0 hoàn tất **Context Budget Governance for Pi Harness**: mọi request gửi tới LLM giờ được đo lường và kiểm soát theo **ngân sách ngữ cảnh thực tế của model** (n_ctx). Người dùng có thể chọn model ngữ cảnh nhỏ (ví dụ qwen 32k) và chat bình thường — không còn gặp lỗi `exceed_context_size_error` (HTTP 400) ở lượt đầu tiên. Khi nội dung quá lớn, hệ thống **tự động nén/chia nhỏ** (auto-split, transcript compaction) thay vì để request thất bại; nếu vẫn vượt ngân sách, người dùng nhận được **thông báo lỗi rõ ràng, hành động được** thay vì lỗi trần trụi từ nhà cung cấp.

### 1.2 User-Facing Changes

| # | Change | Description | Impact |
|---|--------|-------------|--------|
| 1 | No more turn-1 context overflow | Selecting a small-context model no longer breaks the first turn; budget is resolved from the model's real n_ctx | High |
| 2 | Auto-split of oversized input | Steering/skills auto-chunked, incremental loading, lean tool loadout — large sessions keep working | High |
| 3 | Actionable error message | When a request truly exceeds budget: `PI_CONTEXT_BUDGET_EXCEEDED` with concrete numbers (static context N / budget M / n_ctx K) and guidance, instead of a raw 400 | Medium |
| 4 | Usage bar reflects reality | Context usage bar shows the actual resolved nCtx budget of the selected model | Medium |
| 5 | Legacy chat path also governed | Governance now covers the legacy (non-Pi) chat path — medium tier auto-chunk + history-aware chunking | High |

### 1.3 Screenshots

N/A — see UAT evidence in `documents/SA4E-355/evidence/` (llama-server-32k logs, governance-regression logs).

---

## 2. Technical Changes

### 2.1 API Changes

None (no public API changes). New internal extension log markers/events:

| Marker | Level | Description |
|--------|-------|-------------|
| `PI_CONTEXT_BUDGET_EXCEEDED` | error | Gate REJECT — provider NOT called (BR-09) |
| `PI_LEGACY_HISTORY_COMPACTED` | info | Intra-turn compaction completed |
| `PI_TRANSCRIPT_COMPACTED_NO_USER_QUERY` | warn | Defensive — userless compacted transcript made visible |
| `PI_CONTEXT_DETECT_FALLBACK` / `PI_CONTEXT_DETECT_DEFAULT` | warn | n_ctx fallback chain degraded |
| `PI_TOOL_SCHEMA_CAP` | warn | Tool schema tokens capped at min set |

### 2.2 Database Changes

None — extension-only release.

### 2.3 Configuration Changes

| Item | Change Type | Description |
|------|-------------|-------------|
| n_ctx resolution | New | 3-level fallback chain: provider `meta.n_ctx` → ModelRegistry → default 8192 (never 0) |
| Budget math | New | 8% safety margin; 70/30 static/history split |
| Model tiering | New | small (<16,384) / medium / large (≥128,000) from resolved nCtx; small forced-compress |
| Runtime settings | Unchanged | `.code-intel/settings.json` auto-managed; no mandatory user action |

### 2.4 Infrastructure Changes

None — desktop VSIX deployment (Kiro ≥ 1.2). Optional llama-server must report model context (`meta.n_ctx`) for local-model verification.


---

## 3. Features (Tasks 1–7 + UAT Bug-Fix Chain #1–#3)

| # | Item | Summary | Commit |
|---|------|---------|--------|
| 1 | Task 1 — Context Budget Resolver | Single source of truth for n_ctx: 3-level fallback chain (provider → registry → 8192), 8% safety margin, 70/30 static/history split, qwen registry entry maxOutput 2048 | `9cd5c5a` |
| 2 | Task 2+3 — Role-scoped steering + conditional compression | Role-scoped skills/steering override wiring, scoped-steering helper (phase map + priority drop + security-line preserve + fail-open), conditional compression via BudgetCalculator staticBudget, PBT invariants STC-300/301/302 | `0b2ab57` |
| 3 | Task 4+5 — Role-aware tool loadout + session-budget gate | buildSessionToolLoadout, estimateToolSchemaTokens, session-budget-gate measure→escalate→enforce, adapter early-detect, REJECT claim `PI_CONTEXT_BUDGET_EXCEEDED` | `a8ba7b5` |
| 4 | Task 6 — Model tiering wiring | SessionTier small/medium/large from resolved nCtx, LARGE threshold 128000, resolveShouldCompress (small forced-compress / medium-large surplus passthrough), invalid window fail-safe small | `18620e9` |
| 5 | Task 7 — Integration + E2E | 4 integration suites (turn1 / incident-67468-vs-65536-REJECT / escalation-ladder / tier-matrix), e2e-api real node:http STC-700–702, 3 wdio features | `60360d3` |
| 6 | Auto-split | Auto-chunk + incremental steering + lean loadout | `cf611ee` |
| 7 | UAT Bug #1 — Legacy-path governance | Governance wired into legacy chat path + medium tier auto-chunk + history-aware chunking | `5663d11` (VSIX 1.50.0) |
| 8 | UAT Bug #2 — Intra-turn streamFn gate | Per-request intra-turn budget gate in Agent streamFn (measure + compact + REJECT every LLM call, not only turn start) + direct tests for transcript-compaction module | `70a0a90` + `5d5b4b4` (VSIX 1.51.0) |
| 9 | UAT Bug #3 — User-message pin | Pin newest user message in transcript compaction (llama-server Jinja template validity); tool units droppable atomically incl. newest; anti-livelock backstop (TurnBudgetGuard); defensive `PI_TRANSCRIPT_COMPACTED_NO_USER_QUERY` | `c11f461` (VSIX 1.52.0) |

---

## 4. Bug Fixes (UAT Journey Evidence: 400 → 500 → PASS)

| # | Issue | Symptom | Fix | Evidence |
|---|-------|---------|-----|----------|
| 1 | Governance missing on legacy chat path | HTTP 400 `exceed_context_size_error` persisted on legacy path despite Pi-path governance | Wire governance into legacy chat path; medium tier auto-chunk; history-aware chunking | UAT ext 1.50.0 |
| 2 | Gate only ran at turn start | Mid-turn requests (subsequent LLM calls) could still overflow — 400 after first successful call | Per-request intra-turn budget gate in Agent `streamFn`: measure + compact + REJECT on EVERY LLM call; `PI_LEGACY_HISTORY_COMPACTED` on compaction | UAT ext 1.51.0 |
| 3 | Compacted transcript broke provider chat template | HTTP 500 from llama-server Jinja template — compacted transcript contained no user message | Pin newest user message (`userReserveTokens`: raw → compressed → kept over-budget so BR-09 gate REJECTs); tool units droppable atomically; anti-livelock backstop ×4 identical signature → steer → abort | UAT ext 1.52.0 — **PASS** |

**Final state (ext 1.52.0):** turn-1 + multi-turn conversations on qwen 32k complete without provider errors; user confirmed UAT PASSED 2026-10-13.

---

## 5. Known Issues & Limitations

| # | Issue | Impact | Workaround | Target Fix |
|---|-------|--------|------------|------------|
| 1 | E2E-UI wdio STC-500/501/703 NOT_RUN (usage indicator, error banner, turn-1 qwen select) | Automated UI-level verification of budget display/banner pending | Manual/visual verification performed in UAT (PASSED) | Follow-up — needs VS Code headless/display for wdio-vscode-service |
| 2 | SIT manual (visual/UX-only) pending | No functional risk — logic covered by 148/148 governance regression + full suite | Visual checks done in UAT | Follow-up |
| 3 | `pi-agent-session-host.ts` 371 lines > 200-line standard | Tech debt (pre-existing + wave additions), no functional impact | — | Refactor candidate: extract governance resolution |

---

## 6. Dependencies

### 6.1 Pre-requisite Releases

| Release | Version | Status | Required Before |
|---------|---------|--------|-----------------|
| SA4E-356 PathResolver work | consolidated on main | Deployed | This release (full-suite green dependency) |

### 6.2 External System Changes

| System | Change Required | Status | Contact |
|--------|----------------|--------|---------|
| Kiro IDE | Version ≥ 1.2 with `kiro.cmd` | Done (UAT) | — |
| llama-server (optional) | Must report model context (`meta.n_ctx`), e.g. `--ctx-size 32768` | Done (UAT evidence) | — |

---

## 7. Migration Notes

### 7.1 Data Migration

None — no data migration required. Settings/state compatible.

### 7.2 Breaking Changes

None.

### 7.3 Backward Compatibility

Fully backward compatible. Existing sessions, runtime settings (`.code-intel/settings.json`), and models continue to work. Governance is additive: requests that previously passed still pass; oversized requests now get nén tự động or a clear `PI_CONTEXT_BUDGET_EXCEEDED` error instead of a provider 400/500.


---

## 8. Testing Summary

| Test Level | Total | Passed | Failed | Blocked | Pass Rate |
|-----------|-------|--------|--------|---------|-----------|
| Unit + Integration (full suite, final run 2026-10-14) | 2,808 tests / 286 files | 2,808 | 0 | 0 | 100% |
| Full suite baseline (SA4E-355, post bug #3 + compaction tests) | 2,748 tests / 285 files | 2,748 | 0 | 0 | 100% |
| Governance regression | 148 | 148 | 0 | 0 | 100% |
| SIT STC (Phase 6) | 35 automated | 35 | 0 | — | 100% |
| E2E-UI wdio (STC-500/501/703) | 3 | 0 | 0 | 3 (NOT_RUN) | — (no display) |
| UAT | User-confirmed | PASS | — | — | ✅ 2026-10-13 |

> Note: final run 2,808/286 includes untracked SA4E-356 test directory (`extension/src/__tests__/sa4e-356-sq1-outside/`) present in the working tree; SA4E-355 baseline is 2,748/285.

### Defect Summary

| Severity | Found | Fixed | Open | Deferred |
|----------|-------|-------|------|----------|
| Critical | 3 (UAT chain #1–#3) | 3 | 0 | 0 |
| Major | 1 (B-04 full-suite block by concurrent SA4E-356) | 1 (RESOLVED) | 0 | 0 |
| Minor | 0 | 0 | 0 | 0 |

---

## 9. Deployment Instructions

See: [Deployment Guide](DPG-v1.0-SA4E-355.docx) — markdown source: [DPG.md](DPG.md)

### Quick Reference

| Step | Action | Estimated Time |
|------|--------|---------------|
| 1 | Build VSIX (`npm run package:prod` in `extension/`) | 2 min |
| 2 | Install: `kiro.cmd --install-extension sdlc-agents-4-enterprise-1.52.0.vsix` | 1 min |
| 3 | Reload window + verify version (`--list-extensions --show-versions`) | 2 min |
| 4 | Verification (PI_* markers + usage bar + turn-1 smoke) | 5 min |
| **Total** | | **~10 min** |

---

## 10. Rollback Plan

See DPG §8 for detailed steps.

**Rollback Decision Criteria:**
- Turn-1 `exceed_context_size_error` reappears → rollback now
- Opaque provider 500 on compacted transcripts → rollback now
- Extension activation failure / crash loop → rollback now
- Cosmetic budget display issue → hotfix, no rollback

**Estimated Rollback Time:** ~7 minutes (VSIX downgrade install + reload + verify; no DB rollback needed)

---

## 11. Contacts

| Role | Name | Contact | Responsibility |
|------|------|---------|---------------|
| Release Manager | SM Agent | RUN-LOG.md | Release coordination |
| Dev Lead | DEV Agent | session log | Technical issues |
| QA Lead | QA Agent | TEST-REPORT.md | Testing sign-off |
| DevOps | DevOps Agent | session log | Deployment execution |
| Business Owner | User (UAT confirmee) | Jira SA4E-355 | Business sign-off |

---

## 12. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Dev Lead | | | ☐ Approved |
| QA Lead | | 2026-10-13 | ☑ Approved (UAT PASSED) |
| Business Owner | | 2026-10-13 | ☑ Approved (UAT PASSED confirmed) |
| Release Manager | | | ☐ Approved |

---

*End of Release Notes — SA4E-355 — Release 1.52.0*
