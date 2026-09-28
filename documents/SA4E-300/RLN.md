# Release Notes (RLN)

## SDLC-Agents-4-Enterprise — SA4E-300: Improve error detail in source-code ingest flow into KB

---

## Release Information

| Field | Value |
|-------|-------|
| Proposed Release Version | **v1.44.0** (MINOR — 1 ticket = 1 MINOR bump from latest tag `v1.43.0`; **NOT tagged yet, NOT deployed**) |
| Release Date | TBD (after staging NOT_RUN campaign + security re-review) |
| Jira Ticket | SA4E-300 |
| Environment | Staging only (`:48722`). ⛔ NOT deployed to production. |
| Author | DevOps Agent |
| Status | Draft |

> Version note: latest git tag at time of writing is `v1.43.0`; HEAD is branch `SA4E-300` (commit `8a923ee`). Per repo convention (1 implemented ticket = MINOR bump), the proposed next version for this feature is **v1.44.0**. No tag has been created; tagging happens only after staging pass + approvals (§8–§9).

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-22 | DevOps Agent | Initiate RLN for SA4E-300 from BRD/FSD/TDD, TEST-REPORT Round 3, SECURITY-DEPLOY-REVIEW v1.0 |

---

## 1. What's New

### 1.1 Feature Summary

When indexing source code into the Knowledge Base failed, developers only saw a generic "Internal error" and had to ask for backend server logs to find the cause. This release makes failure reasons visible directly in VS Code:

- Clear error messages now explain **what failed and what to do next** (e.g. disk full → free space and retry; permission denied → check file access; session expired → sign in again).
- When only some files fail, the response now **names each failed file and its reason**, so developers know exactly which files need attention.
- All ingest errors are logged to the **"Kiro Indexer" Output channel** inside VS Code instead of hidden developer consoles.
- No workflow changes: the same buttons, same retry behavior, same success messages — only failure details are richer.

### 1.2 User-Facing Changes

| # | Change | Description | Impact |
|---|--------|-------------|--------|
| 1 | Detailed ingest failure messages | Backend returns `{ error, details, action }`; Extension shows them in Output channel + toast | High — faster root-cause diagnosis, no backend log access needed |
| 2 | Per-file failure list | `rejectedReasons` / `failedFiles` identify each bad file with code + reason | High — mixed good/bad batches are actionable |
| 3 | Distinguishable error codes | ENOSPC, EACCES, 429 backpressure, 401 expiry each produce distinct, recognizable messages | Medium |
| 4 | No silent failures | `triggerDocumentIngest` surfaces backend errors as warnings instead of fake success | Medium |

---

## 2. Technical Changes

### 2.1 API Changes

| Type | Endpoint | Method | Description |
|------|----------|--------|-------------|
| Modified (backward compatible) | `/api/index/source` | POST | Error responses enriched to `{ error, details?, action? }`; 200 responses add `rejectedReasons: [{ file, code, message }]`; 429 backpressure `{ error, details, action, retryAfter }` (concurrency limit 3) |
| Modified (backward compatible) | `/api/index/ingest-docs` | POST | 200 responses add `failedFiles: [{ file, reason }]`; errors via `indexError` |
| Modified (backward compatible) | `/api/index/full` | POST | Errors via `indexError` (202/background behavior unchanged) |
| Fixed | `POST /api/admin/graph/populate-edges` path (BUG-002) | POST | Uses `getDbAdapter()` + `relation` column; RBAC/counters/response unchanged |
| Unchanged | `parseIngestResponse`, `UNCONVERTIBLE` marker, retry/polling | — | Contracts preserved |

Auth: all `/api/index/*` routes keep `requireAuth` (401 without token) + `X-Project-Id` project scoping.

### 2.2 Database Changes

| Type | Object | Description |
|------|--------|-------------|
| None | — | No schema changes (TDD §4). Error DTOs are transient response objects, not persisted. |

### 2.3 Configuration Changes

| Property | Change Type | Description |
|----------|-----------|-------------|
| Staging env set (port/workspace/data-dir/DB/auth) | New (staging only) | `CODE_INTEL_PORT=48722`, fresh workspace/data-dir/DB, `KB_TOKEN_SECRET` + `CODE_INTEL_REQUIRE_AUTH=true`, `ADMIN_INITIAL_PASSWORD` — see DPG §6 |
| `maxFileSize` (512KB, pre-existing) | No change | Exists in config but NOT enforced by `api-index.ts` (Security Finding #5) — monitor only |

### 2.4 Infrastructure Changes

| Component | Change | Description |
|-----------|--------|-------------|
| Staging backend | New isolated instance | Loopback `127.0.0.1:48722`, sqlite-only, no internet exposure |
| Production | No change | ⛔ NOT deployed to prod (`:48721` untouched) |

---

## 3. Bug Fixes

| # | Jira Ticket | Summary | Severity |
|---|------------|---------|----------|
| 1 | SA4E-300 / BUG-001 | Extension compile failure — `sendBatchWithRetry` dropped `details`/`action` (8× TS2339). Fixed by widening return type and propagating fields; `npm run compile` GREEN, 27/27 extension tests PASS | Critical — **CLOSED** (verified Round 2/3) |
| 2 | SA4E-300 / BUG-002 | Backend full build failure on out-of-scope files (`EdgeOnIngestStrategy` missing export, `ctx.db.admin` missing, wrong `label` column). Fixed via `extractIngestEdges` + adapter + `relation` column; `npm run build` GREEN (verified per RUN-LOG 2026-09-19) | Major — **CLOSED** (QA Round 4 addendum in TEST-REPORT still pending to align file text) |

> No other defects found in SA4E-300 scope. Automated suites: 45/45 PASS (27 extension + 18 backend); extension compile + lint GREEN.

---

## 4. Known Issues and Limitations

| # | Issue | Impact | Workaround | Target Fix |
|---|-------|--------|------------|------------|
| 1 | 5 STC cases NOT_RUN, deferred to staging: TC-101 (happy-path 200), TC-201 (401 action), TC-703 (ENOSPC/EACCES/429/401 codes), TC-701 (full chain in Extension host), TC-704 (per-file UI) | Staging-gated; product behavior unverified live | Execute per DPG §7.3 on staging before prod promotion | Staging campaign (this release) |
| 2 | Security High #1 (BOLA: any authenticated user can write/sync any project via `X-Project-Id`/body) — fix in progress by dev-agent, **PENDING verification** | Cross-tenant write/KB-poisoning risk | Staging only, trusted users; or PO risk-acceptance | Must close (or formally accept) before prod |
| 3 | Security High #2 (no RBAC on `POST /api/index/sync-pega-rules`) — fix in progress by dev-agent, **PENDING verification** | Unprivileged expensive background sync / DoS | Same as #2; avoid triggering this endpoint on staging | Must close (or formally accept) before prod |
| 4 | Security Medium #3–#6 (default-project fallback, verbose fs paths, no size/count caps, partial backpressure) | Hardening gaps; authenticated DoS/info-disclosure surface | Monitored staging, trusted users | Fix or risk-accept before prod |
| 5 | Security Low #7 (pg `?` placeholders in `populate-edges` SELECTs) | Any pg-backed deploy fails | Stay on sqlite (staging + prod) until fixed | Fix + pg smoke test before any pg deploy |
| 6 | TEST-REPORT file text still shows BUG-002 OPEN (stale vs RUN-LOG verified fix) | Doc inconsistency only | QA Round 4 addendum to confirm closure | Before prod |

> This release makes NO production deployment claim. Security verdict: **GO WITH CONDITIONS for staging; NO-GO for production** (see §7 below and DPG §9.4).

---

## 5. Dependencies

### 5.1 Pre-requisite Releases

| Release | Version | Status | Required Before |
|---------|---------|--------|-----------------|
| Current prod baseline | `v1.43.0` (tag) | Deployed (prod `:48721`) | Staging deploy of SA4E-300 |
| SA4E-300 staging build | **v1.44.0 (proposed, untagged)** | Pending staging deploy | Any prod promotion discussion |

### 5.2 External System Changes

| System | Change Required | Status | Contact |
|--------|----------------|--------|---------|
| Staging host env/secrets | Set `ADMIN_INITIAL_PASSWORD`, `KB_TOKEN_SECRET`, `CODE_INTEL_REQUIRE_AUTH=true`, port/workspace/data-dir isolation | Pending (DPG §5.2) | DevOps |
| Reverse proxy / TLS / HSTS | None for loopback staging (Security Finding #8 noted for future prod) | N/A | DevOps |
| Pega / Jira / other externals | None | N/A | — |

---

## 6. Migration Notes

### 6.1 Data Migration

| Migration | Description | Automated | Estimated Time |
|-----------|-------------|-----------|----------------|
| None | No schema or data changes | N/A | 0 min |

### 6.2 Breaking Changes

No breaking changes in this release. Fully backward compatible: `details`/`action`/`rejectedReasons`/`failedFiles` are optional additions; `parseIngestResponse` and `UNCONVERTIBLE` contracts unchanged.

### 6.3 Backward Compatibility

Fully backward compatible with existing Extension ↔ Backend integrations. Old clients ignore the new optional fields; new Extension handles responses with or without them.

---

## 7. Testing Summary

Source: TEST-REPORT.md Round 3 (2026-09-19). File verdict **✅ PASS** with 5 live cases deferred — treated as **PASS WITH BLOCKERS** for deployment gating (blockers = 5 NOT_RUN must pass on staging).

| Test Level | Total | Passed | Failed | NOT_RUN | Pass Rate |
|-----------|-------|--------|--------|---------|-----------|
| Automated (vitest: 27 extension + 18 backend) | 45 | 45 | 0 | — | 100% |
| STC static verification | 11 | 11 | 0 | — | 100% |
| STC live execution (needs staging JWT/host) | 5 | 0 | 0 | 5 (TC-101/201/703/701/704) | N/A |
| **Total STC disposition** | **20** | **15 verified** | **0 failed** | **5 NOT_RUN** | **75% verified** |

### Defect Summary

| Severity | Found | Fixed | Open | Deferred |
|----------|-------|-------|------|----------|
| Critical | 1 (BUG-001) | 1 | 0 | 0 |
| Major | 1 (BUG-002) | 1 | 0 | 0 (closure addendum pending in file text) |
| Minor/Obs | 3 (docs/env observations) | 1 (KB ingest) | 2 (STP/STC count alignment, MCP wrapper degraded) | 0 |

### Security Review Summary

Security-agent review v1.0 (2026-09-22): 0 Critical / 2 High (pending verify) / 4 Medium / 5 Low / 3 Info. Verdict **GO WITH CONDITIONS for staging (sqlite, loopback, trusted users); NO-GO for production until Highs resolved**. Six staging conditions: (1) auth secrets set, (2) fix or PO risk-accept High #1/#2, (3) disk/429 monitoring + no internet exposure, (4) run 5 NOT_RUN on staging, (5) DPG/RLN produced (this document set), (6) stay on sqlite until Low #7 fixed.

---

## 8. Deployment Instructions

Full steps: see [Deployment Guide](DPG.md) (staging-only).

### Quick Reference

| Step | Action | Estimated Time |
|------|--------|---------------|
| 1 | Database migration | 0 min (none) |
| 2 | Build backend + extension + verify (compile/lint/targeted vitest) | ~20 min |
| 3 | Start staging backend `:48722` + auth-gate check + test JWT | ~15 min |
| 4 | Install staging VSIX + smoke tests | ~15 min |
| 5 | NOT_RUN campaign (TC-101/201/703 API + TC-701/704 Extension host) | ~1–2 h |
| **Total** | | **~2–3 h** |

⛔ Production deployment is NOT authorized (see §9).

---

## 9. Rollback Plan

See DPG §8. Summary: stop staging `:48722`, restore archived artifact/env, reset staging DB if polluted, re-run health checks. No DB migration rollback needed. Estimated rollback time ~20 min.

**Rollback triggers:** staging health-check failure, auth misconfiguration (anonymous mode or prod DB referenced), crash loop, uncleanable fault-injection pollution.

---

## 10. Contacts

| Role | Name | Contact | Responsibility |
|------|------|---------|---------------|
| Release Manager | — | — | Staging release coordination (SM) |
| Dev Lead | — | — | Build issues |
| QA Lead | — | — | NOT_RUN campaign + TEST-REPORT addendum |
| DevOps | — | — | Staging deployment execution |
| Security | — | — | High-findings fix verification + re-verdict |
| Business Owner / PO | — | — | Risk sign-off (High #1/#2 staging), prod gate |

---

## 11. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Dev Lead | | | ☐ Approved (staging) |
| QA Lead | | | ☐ Approved (PASS WITH BLOCKERS → staging) |
| Security | | | ☐ GO WITH CONDITIONS (staging) / NO-GO (prod) confirmed |
| Business Owner / PO | | | ☐ Risk-acceptance High #1/#2 (staging) |
| Release Manager | | | ☐ Approved (staging only) |
