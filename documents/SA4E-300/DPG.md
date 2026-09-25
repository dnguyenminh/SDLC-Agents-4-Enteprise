# Deployment Guide (DPG)

## SDLC-Agents-4-Enterprise — SA4E-300: Improve error detail in source-code ingest flow into KB

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-300 |
| Title | [Extension/Backend] Improve error detail in source-code ingest flow into KB |
| Author | DevOps Agent |
| Version | 1.0 |
| Date | 2026-09-22 |
| Status | Draft — staging only (NO-GO production) |
| Related TDD | documents/SA4E-300/TDD.md v1.0 |
| Related TEST-REPORT | documents/SA4E-300/TEST-REPORT.md (Round 3, 2026-09-19) |
| Related SECURITY-REVIEW | documents/SA4E-300/SECURITY-DEPLOY-REVIEW.md v1.0 (2026-09-22) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-22 | DevOps Agent | Initiate DPG for SA4E-300 staging — from TDD v1.0, TEST-REPORT Round 3, SECURITY-DEPLOY-REVIEW v1.0 |

---

## Sign-Off

| Name | Role | Signature and date |
|------|------|--------------------|
| | Dev Lead | ☐ Approved for staging deployment |
| | QA Lead | ☐ Testing completed (PASS WITH BLOCKERS — 5 NOT_RUN deferred to staging) |
| | Ops Lead | ☐ Staging infrastructure ready |
| | PO | ☐ Risk-acceptance for High #1/#2 on staging (if not fixed pre-staging) |

---

## 1. Overview

### 1.1 Feature Summary

SA4E-300 enriches error surfacing across the ingest chain Backend → HTTP → Extension → VS Code Output channel ("Kiro Indexer"), so developers get full error details without SSH-ing into the backend to read pino logs:

- Backend `indexError` returns `{ error, details?, action? }` instead of generic "Internal error" (ENOSPC/EACCES mapping, default action "Retry").
- Per-file failures: `rejectedReasons: [{ file, code, message }]` for `POST /api/index/source` and `failedFiles: [{ file, reason }]` for `POST /api/index/ingest-docs`.
- Extension `httpPostWithDetail` forwards `err.body.details/action`; `triggerDocumentIngest` checks `result.ok` (no silent catch); `console.debug/warn` in the ingest flow replaced by the singleton Output channel; 401 refresh-and-retry preserved.
- No change to retry/polling logic, no change to `parseIngestResponse` / `UNCONVERTIBLE` legacy contract, no Pega-flow changes. Fully backward compatible (new fields optional).

### 1.2 Deployment Scope

| Item | Type | Description |
|------|------|-------------|
| `backend/src/server/routes/api-index.ts` | Modified | Path-safety helpers, enriched `indexError`, `rejectedReasons`/`failedFiles`, 429 backpressure on `/api/index/source` |
| `backend/src/server/routes/admin/kb-graph.ts`, `backend/src/modules/memory/engine/edge-on-ingest.ts` | Modified | `populate-edges` fix (BUG-002: adapter + `relation` column) |
| `extension/src/services/IndexerHttpClient.ts`, `IndexingService.ts`, `src/indexer.ts` | Modified | Error forwarding, singleton channel, token propagation wiring |
| Database | No migration | TDD §4: no schema changes; error DTOs are transient, not persisted |
| Configuration | Staging-only new env values | Dedicated port, workspace, data-dir/DB, auth secrets (see §6) |
| Extension artifact | Rebuilt | `out/` bundle + `.vsix` repackaged from SA4E-300 branch |

### 1.3 Target Environments

| Environment | URL / Port | Deploy Order | Approval Required | Status |
|-------------|-----------|--------------|-------------------|--------|
| Staging | `http://127.0.0.1:48722` (loopback, no internet exposure) | 1st | Dev Lead + QA Lead + PO risk sign-off (§9) | ✅ GO WITH CONDITIONS |
| PROD (`:48721`) | `http://127.0.0.1:48721` (current prod) | — | PM + Business + Security | ⛔ NO-GO — see §9.4 |
| DEV/SIT/UAT | Developer machines | — | No | Informational only |

> Staging MUST run on a different port (48722) and isolated workspace/data-dir/DB from prod (48721). Never point staging at the prod DB.

---

## 2. Prerequisites (staging)

### 2.1 Infrastructure

| Requirement | Status | Notes |
|-------------|--------|-------|
| Staging host (same OS family as target, Windows 11 or Linux) | ☐ Ready | Loopback-only; firewall blocks inbound from internet |
| Isolated staging workspace + data dir + DB file (fresh, NOT prod) | ☐ Ready | e.g. staging workspace, data-dir `.code-intel-staging`, `CODE_INTEL_DB=index-staging.db` |
| Dedicated disk volume (or quota) for `CODE_INTEL_INDEX_TEMP_DIR` | ☐ Ready | Monitor free space; ENOSPC is a known failure mode under test |
| No internet exposure of staging backend | ☐ Verified | Bind `CODE_INTEL_HOST=127.0.0.1`; no reverse-proxy public route; no CORS allowlist changes |

### 2.2 Software Dependencies

| Dependency | Version | Status |
|-----------|---------|--------|
| Node.js | **22.x** (see `backend/package.json` engines) | ☐ Installed (`node --version`) |
| npm | bundled with Node 22 | ☐ Installed |
| Backend deps | `hono ^4`, `pino ^9`, `zod ^3`, `better-sqlite3`/sqlite-wasm (see `backend/package.json`) | ☐ Installed via `npm ci` |
| Extension toolchain | TypeScript `^5.4`, esbuild `^0.21`, `@vscode/vsce ^2.24`, vitest `^4.1.8` | ☐ Installed via `npm ci` |
| VS Code (for TC-701/704) | `^1.85.0` (see extension `engines.vscode`) | ☐ Available on tester machine |
| Storage engine | **sqlite only** | ☐ Confirmed — do NOT use pg until Security Finding Low #7 (placeholder dialect) is fixed |

### 2.3 Access Requirements

| Access | Type | Who Needs It |
|--------|------|-------------|
| Shell on staging host | Local admin / SSH key | DevOps |
| Staging secrets (`ADMIN_INITIAL_PASSWORD`, `KB_TOKEN_SECRET`) | Vault/env, never committed | DevOps |
| VS Code Extension Development Host (F5) | Local VS Code | QA (TC-701/704) |
| Git branch `SA4E-300` | Read | DevOps (build source) |

### 2.4 Secrets and Env (staging — set BEFORE start)

| Variable | Required | Value / Rule |
|----------|----------|--------------|
| `ADMIN_INITIAL_PASSWORD` | Yes | Strong seed password for admin bootstrap (change after first login; never commit) |
| `KB_TOKEN_SECRET` | Yes | Long random secret; JWT signing. Staging MUST set it |
| `CODE_INTEL_REQUIRE_AUTH` (`REQUIRE_AUTH`) | Yes | `true` — never run staging in anonymous JWT mode |
| `CODE_INTEL_PORT` | Yes | `48722` (avoid clash with prod `48721`) |
| `CODE_INTEL_HOST` | Yes | `127.0.0.1` (loopback; no internet exposure) |
| `CODE_INTEL_WORKSPACE` | Yes | Fresh staging workspace path (NOT prod workspace) |
| `CODE_INTEL_DATA_DIR` | Yes | Fresh staging data dir (NOT prod `.code-intel`) |
| `CODE_INTEL_DB` | Yes | Fresh staging DB file, e.g. `index-staging.db` (NOT prod `index.db`) |
| `CODE_INTEL_INDEX_TEMP_DIR` | Recommended | Staging temp dir on monitored volume |

### 2.5 Monitoring Prerequisites

- [ ] Disk monitor on staging temp dir + data dir (alert at < 20% free; ENOSPC fault-injection is planned — see §7.3).
- [ ] Watch for HTTP 429 (`Server busy`) during concurrency probes; 429 is expected behavior, not an outage.
- [ ] Backend pino logs accessible (server-side full errors stay in pino; client sees sanitized `details`).

### 2.6 Backup Requirements

- [ ] Prod DB (`index.db` on `:48721`) NOT touched — verify staging env points at staging DB before start.
- [ ] Previous staging artifact (if any) saved for rollback (`dist/` + `.vsix`, see §8).
- [ ] Staging config backup (env file snapshot; secrets in vault only, never in plain-text docs).

---

## 3. Pre-Deployment Checklist

| # | Item | Responsible | Status |
|---|------|-------------|--------|
| 1 | Branch `SA4E-300` merged content verified (commit `8a923ee` or later); backend `npm run build` GREEN (BUG-002 closed per RUN-LOG 2026-09-19) | Developer | ☐ |
| 2 | Targeted automated suites GREEN: extension 27/27 + backend 18/18 (total 45/45, TEST-REPORT Round 3) | QA | ☐ |
| 3 | Extension `npm run compile` (tsc) exit 0 + `npm run lint` PASS (BUG-001 closed) | Developer | ☐ |
| 4 | Staging env file prepared: `ADMIN_INITIAL_PASSWORD`, `KB_TOKEN_SECRET`, `CODE_INTEL_REQUIRE_AUTH=true`, `CODE_INTEL_PORT=48722`, fresh workspace/data-dir/DB | DevOps | ☐ |
| 5 | PO risk sign-off for Security High #1 (BOLA) + #2 (sync RBAC) on staging, OR fixes landed and re-reviewed | PO + Security | ☐ |
| 6 | Staging stays on sqlite (Finding Low #7 pg placeholders unfixed — pg forbidden) | DevOps | ☐ |
| 7 | Monitoring (disk + 429) configured | DevOps | ☐ |
| 8 | Rollback plan (§8) reviewed; previous staging artifact archived | Team | ☐ |
| 9 | No PROD deployment — staging only (§9.4) | SM | ☐ |

---

## 4. Database Migration

**None.** Per TDD §4, SA4E-300 makes no schema changes — error payloads (`details`/`action`/`rejectedReasons`/`failedFiles`) are transient response DTOs, not persisted.

| Order | Script | Description | Estimated Time |
|-------|--------|-------------|----------------|
| — | N/A | No migration scripts | 0 min |

Verification (fresh staging DB created on first start):

```powershell
# Staging data dir must contain a NEW sqlite file, not the prod one
Get-ChildItem "<staging-data-dir>\index-staging.db"
# Fail the deploy if CODE_INTEL_DB / CODE_INTEL_DATA_DIR resolve to prod paths
```

Rollback: N/A (no migration). If the staging DB is polluted during fault-injection, delete it and restart the backend to recreate a clean one.

---

## 5. Application Deployment

### 5.1 Build

Build from branch `SA4E-300` (do NOT build from `master`).

**Backend** (`backend/` — script `build` = `tsc` + copy `src/viewer` → `dist/viewer`):

```powershell
Set-Location backend
npm ci
npm run build        # must exit 0 — includes viewer copy step; BUG-002 fix makes full build GREEN
```

**Extension** (`extension/` — scripts `compile` = `tsc -p ./`, `esbuild-production`, `package:prod` = `esbuild-production && vsce package`):

```powershell
Set-Location ../extension
npm ci
npm run compile            # must exit 0 (BUG-001 fix: sendBatchWithRetry carries details?/action?)
npm run lint               # must pass (only pre-existing MODULE_TYPELESS_PACKAGE_JSON warning)
npm run esbuild-production
npx vsce package --no-dependencies   # or: npm run package:prod
```

**Verify after build** (same targeted suites as TEST-REPORT Round 3):

```powershell
# extension (expect 27/27 PASS)
Set-Location extension
npm run test -- src/services/__tests__/IndexerHttpClient.error.test.ts src/services/__tests__/indexer-http-proxy.test.ts src/services/__tests__/token-refresh.test.ts
# backend (expect 18/18 PASS)
Set-Location ../backend
npx vitest run src/server/routes/__tests__/api-index-errors.test.ts src/modules/memory/engine/edge-on-ingest.test.ts
```

Record versions: backend `1.40.0`, extension `1.40.2` (from `package.json` at build time) + git commit hash.

### 5.2 Deployment Steps (staging)

| Step | Action | Command | Verification |
|------|--------|---------|-------------|
| 1 | Stop any process on staging port | `Get-NetTCPConnection -LocalPort 48722` then stop PID; ensure prod `:48721` untouched | Port 48722 free; prod still listening on 48721 |
| 2 | Export staging env (PowerShell) | `$env:CODE_INTEL_PORT="48722"; $env:CODE_INTEL_HOST="127.0.0.1"; $env:CODE_INTEL_WORKSPACE="<staging-ws>"; $env:CODE_INTEL_DATA_DIR="<staging-data-dir>"; $env:CODE_INTEL_DB="index-staging.db"; $env:CODE_INTEL_INDEX_TEMP_DIR="<staging-temp>"; $env:CODE_INTEL_REQUIRE_AUTH="true"; $env:KB_TOKEN_SECRET="<vault-secret>"; $env:ADMIN_INITIAL_PASSWORD="<vault-pw>"` | `node -e "console.log(process.env.CODE_INTEL_PORT)"` → `48722` |
| 3 | Sanity-check isolation | Confirm staging paths differ from prod workspace/DB | No prod path in env dump |
| 4 | Start staging backend | `Set-Location backend; npm run start` (runs `node dist/index.js`) | `GET /health` → 200 (see §7.1) |
| 5 | Confirm auth gate enforced (no token) | `curl http://127.0.0.1:48722/api/index/progress` | `401 {"error":"Unauthorized"}` — route live, gate enforced |
| 6 | Obtain test JWT (admin seed login) | `POST /api/admin/auth/login` with `{"username":"admin","password":"<ADMIN_INITIAL_PASSWORD>"}` → save `token` | Response contains `token` + `expiresAt` |
| 7 | Install staging `.vsix` in a test VS Code profile; set `kiroSdlc.backend.url = http://127.0.0.1:48722` | VS Code → Extensions → Install from VSIX | Extension host connects to `:48722`, not `:48721` |
| 8 | Run post-deploy health + smoke (§7) | Endpoints + one happy-path ingest | All §7.1 checks GREEN before NOT_RUN campaign |

**Get the test JWT (Step 6 detail):**

```powershell
$login = Invoke-RestMethod -Uri "http://127.0.0.1:48722/api/admin/auth/login" -Method POST `
  -ContentType "application/json" `
  -Body '{"username":"admin","password":"<ADMIN_INITIAL_PASSWORD>"}'
$token = $login.token   # session token for Authorization header
```

**Standard headers for every SA4E-300 API call (staging):**

| Header | Value |
|--------|-------|
| `Authorization` | `Bearer <token from login>` |
| `X-Project-Id` | `sa4e-300-staging` (use this exact fixture project for all 5 NOT_RUN cases) |
| `X-Workspace-Root` | (optional) staging workspace path label |

Example:

```powershell
$headers = @{ Authorization = "Bearer $token"; "X-Project-Id" = "sa4e-300-staging" }
Invoke-RestMethod -Uri "http://127.0.0.1:48722/api/index/source" -Method POST `
  -ContentType "application/json" -Headers $headers `
  -Body '{"files":[{"path":"hello.ts","content":"export const a = 1;"}]}'
```

### 5.3 Docker Deployment

N/A — this project deploys as a Node process (`node dist/index.js`) + VSIX install; no Dockerfile/compose change in SA4E-300 scope.

---

## 6. Configuration Changes

### 6.1 New Environment Variables (staging values; PROD = placeholder — never copy secrets)

| Variable | Description | Staging | PROD |
|----------|-------------|---------|------|
| `ADMIN_INITIAL_PASSWORD` | Admin seed password | `<vault-secret>` | `<PLACEHOLDER — vault>` |
| `KB_TOKEN_SECRET` | JWT signing secret | `<vault-secret>` | `<PLACEHOLDER — vault>` |
| `CODE_INTEL_REQUIRE_AUTH` | Enforce auth (jwt-auth.ts) | `true` | `true` |
| `CODE_INTEL_PORT` | Backend listen port | `48722` | `48721` (unchanged) |
| `CODE_INTEL_HOST` | Bind address | `127.0.0.1` | `127.0.0.1` |
| `CODE_INTEL_WORKSPACE` | Workspace root | `<staging-ws>` | `<prod-ws — unchanged>` |
| `CODE_INTEL_DATA_DIR` | Data dir | `<staging-data-dir>` | `<prod-data-dir — unchanged>` |
| `CODE_INTEL_DB` | sqlite file | `index-staging.db` | `index.db` (unchanged) |
| `CODE_INTEL_INDEX_TEMP_DIR` | File-staging temp base | `<staging-temp>` | unchanged |

No new `config.json` keys; `maxFileSize` (512KB) exists in config but is NOT enforced by `api-index.ts` (Security Finding #5) — monitor only, do not rely on it as a guard.

### 6.2 Application Properties Changes

None (no `application.yml`/properties deltas; all staging variance is via env vars above).

### 6.3 Feature Flags

None — SA4E-300 has no feature flags; enriched error fields are always on and backward compatible.

---

## 7. Post-Deployment Verification

### 7.1 Health Checks

| Check | Endpoint/Command | Expected Result | Timeout |
|-------|-----------------|-----------------|---------|
| Backend liveness | `GET http://127.0.0.1:48722/health` | 200 (see `routes/health.ts`) | 10s |
| Auth gate (unauthenticated) | `GET http://127.0.0.1:48722/api/index/progress` (no headers) | `401 {"error":"Unauthorized"}` | 10s |
| Auth gate (source route) | `POST http://127.0.0.1:48722/api/index/source` body `{"files":[]}` (no auth) | 401, rejected before any file write | 10s |
| Authenticated smoke | `POST /api/index/source` with headers (§5.2) + 1 valid file | 200 with `written/skipped/rejected/projectId`, no `error` field | 30s |
| Prod untouched | prod `:48721` still serving | No restart/redeploy artifacts on prod | — |

### 7.2 Smoke Tests

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 1 | Happy-path source ingest | §5.2 example call | 200, `written=1`, empty `rejected` |
| 2 | Docs ingest | `POST /api/index/ingest-docs` with headers | 200 with `ingested/errors/total/failedFiles` shape |
| 3 | Output-channel wiring (extension) | Trigger ingest from staging-connected VS Code | "Kiro Indexer" channel shows result; no `console.debug` fallback |

### 7.3 NOT_RUN Campaign (mandatory before prod promotion)

Execute the 5 cases that were NOT_RUN in TEST-REPORT (no live JWT fixture / no VS Code host at QA time). Use staging base `http://127.0.0.1:48722`, headers from §5.2 (`X-Project-Id: sa4e-300-staging`).

**Via API + fault injection (no VS Code needed):**

| ID | Case (STC pass criteria) | Staging procedure | Pass criteria (from STC.md) |
|----|--------------------------|-------------------|-----------------------------|
| TC-101 | Successful ingest returns 200 without error fields | POST `/api/index/source` with valid files + auth headers | Status 200; body has `written/skipped/rejected`, NO `error` field |
| TC-201 | 401 surfaces action re-authenticate | POST `/api/index/source` with expired/invalid token | Status 401; body `error="Unauthorized"`, `action` contains re-authenticate |
| TC-703 | Error codes surfaced (ENOSPC/EACCES/429/401) | (a) EACCES: batch with unwritable path → `rejectedReasons` code `EACCES`; (b) 429: fire 4+ concurrent `/api/index/source` (limit 3) → one `429 Server busy` with `retryAfter`; (c) 401: as TC-201; (d) ENOSPC: temp-volume-full simulation (quota/small ramdisk) or mocked write failure → `details` contains ENOSPC + non-empty `action` | Each code distinguishable in `details`; messages differ per code |

**Via Extension Development Host (F5, needs VS Code):**

| ID | Case (STC pass criteria) | Staging procedure | Pass criteria (from STC.md) |
|----|--------------------------|-------------------|-----------------------------|
| TC-701 | Full chain Backend→Extension→Output | F5 Debugging on staging `.vsix` config; trigger ingest that returns enriched error (e.g. reuse TC-703 EACCES batch) | Output channel shows `error/details/action`; toast shows error summary |
| TC-704 | Per-file failure displayed in UI | Ingest batch with 2 good + 1 bad file via Extension UI | Response has `rejectedReasons`; UI lists file names with reasons |

**Rules:** append results (PASS/FAIL + evidence) to TEST-REPORT.md Round 4 addendum; on ANY failure → stop, file/refresh defect, and apply §8 if staging is corrupted. All 5 must PASS before any prod discussion.

### 7.4 Log Verification

| Log Entry | Level | Expected | Location |
|-----------|-------|----------|----------|
| Backend startup (port 48722, sqlite) | INFO | Within 60s of start | pino stdout |
| Enriched error with context (not stack to client) | ERROR/WARN | Server-side full error in pino; client receives capped `details` (≤2000 chars) | pino stdout |
| Auth rejections | WARN | 401s for no/invalid token probes | pino stdout |
| No secret leakage | — | No token/password in any log line (verified pattern per Security INFO-2) | pino + Output channel |

### 7.5 Monitoring Dashboard

- [ ] Disk free % on staging temp + data volumes logged before/after campaign.
- [ ] Count of 429 responses during TC-703 recorded (expected ≥1 under concurrency probe).
- [ ] Error rate returns to baseline after campaign; no lingering background syncs (`sync-pega-rules` is fire-and-forget — do not trigger it unless testing Finding #2 controls).

---

## 8. Rollback Plan

### 8.1 Rollback Decision Criteria

| Condition | Action |
|-----------|--------|
| Staging backend fails health checks (§7.1) after deploy | Immediate rollback to previous staging artifact |
| Staging DB polluted by fault injection and cannot be cleaned | Delete staging DB, restart backend (fresh recreate) |
| Auth misconfiguration (anonymous mode / prod DB referenced) | Stop staging immediately, fix env, redeploy |
| Error rate / crash loop on staging | Rollback; do NOT promote |
| Minor display issue with workaround | Log defect, no rollback |

### 8.2 Rollback Steps

| Step | Action | Command | Verification |
|------|--------|---------|-------------|
| 1 | Stop staging backend | Stop the `node dist/index.js` process on :48722 | Port 48722 free |
| 2 | Restore previous artifact | Re-extract archived `dist/` + reinstall previous `.vsix` (if any) | Checksums match archive |
| 3 | Restore staging env snapshot | Re-apply backed-up staging env (no secrets in docs) | `CODE_INTEL_PORT=48722`, staging DB paths |
| 4 | Reset staging DB if polluted | Delete `index-staging.db`, restart backend to recreate | Fresh DB file timestamp |
| 5 | Verify rollback | Repeat §7.1 health checks | All GREEN; prod `:48721` untouched |

No database rollback scripts (no migrations — §4).

### 8.3 Rollback Time Estimate

| Action | Estimated Time |
|--------|---------------|
| Stop + restore artifact | 5 min |
| DB reset (if needed) | 5 min |
| Verification (§7.1) | 10 min |
| **Total** | **~20 min** |

---

## 9. Environment-Specific Notes

### 9.1 Staging (`:48722`)

- Loopback-only, sqlite, trusted users. Run `npm audit` (backend + extension) during the staging window and record results in TEST-REPORT addendum (required by Security review — currently missing).
- Change the admin seed password after first login.

### 9.2 DEV / SIT / UAT

Developer machines only; reuse the same build + JWT/header procedure at reduced scope (happy-path smoke). No sign-off gates.

### 9.3 Pre-existing TEST-REPORT inconsistency (must align before prod)

TEST-REPORT.md file text still marks BUG-002 OPEN, while RUN-LOG 2026-09-19 records BUG-002 fixed with `npm run build` GREEN (verified in code: `extractIngestEdges` + `relation` column). QA must add a Round 4 addendum confirming closure (with build log) so the file matches the verified state. This DPG treats BUG-002 as **closed** per the verified RUN-LOG entry.

### 9.4 PROD — ⛔ NO-GO

**Do NOT deploy SA4E-300 to production.** Remaining conditions (all must close first):

1. **Security High #1 (BOLA tenant isolation) + High #2 (missing RBAC on `sync-pega-rules`)** — currently being fixed in parallel by dev-agent → status **PENDING verification**. Either land the fixes + security re-review, or record formal PO risk-acceptance. Production stays NO-GO until then.
2. **5 NOT_RUN cases (TC-101/201/703/701/704) must PASS on staging** (§7.3) and be appended to TEST-REPORT.
3. **Medium findings #3–#6** (mandatory `X-Project-Id`, fs-error sanitization, size/count caps, global backpressure) fixed or risk-accepted before prod.
4. **Low #7 pg placeholders** fixed + pg smoke test before ANY pg-backed deploy (staging and prod stay sqlite until then).
5. **BUG-002 closure addendum** in TEST-REPORT (§9.3) + `npm audit` results recorded.
6. Security re-verdict **GO for production** explicitly issued.

---

## 10. Appendix

### Contacts

| Role | Name | Contact |
|------|------|---------|
| DevOps (deploy executor) | — | — |
| Dev Lead (build owner) | — | — |
| QA Lead (NOT_RUN campaign) | — | — |
| Security (re-review Highs) | — | — |
| PO (risk sign-off) | — | — |

### Related Tickets and References

| Item | Location |
|------|---------|
| SA4E-300 (main ticket) | Error-detail surfacing feature |
| TDD v1.0 | `documents/SA4E-300/TDD.md` (§4 no migration; §3 API contracts; §7 auth) |
| STC v1.0 | `documents/SA4E-300/STC.md` (pass criteria for TC-101/201/703/701/704) |
| TEST-REPORT (Round 3) | `documents/SA4E-300/TEST-REPORT.md` (45/45 automated; 15/20 verified; 5 NOT_RUN) |
| SECURITY-DEPLOY-REVIEW v1.0 | `documents/SA4E-300/SECURITY-DEPLOY-REVIEW.md` (GO WITH CONDITIONS staging / NO-GO prod; 6 staging conditions) |
| Build scripts | `backend/package.json` (`build`, `test`, `test:e2e-api`), `extension/package.json` (`compile`, `esbuild-production`, `package:prod`) |
| Env resolution | `backend/src/config/index.ts` (port/workspace/data-dir/temp resolution), `backend/src/server/middleware/jwt-auth.ts` (`CODE_INTEL_REQUIRE_AUTH` + `KB_TOKEN_SECRET`) |
| Auth login | `backend/src/server/routes/admin/auth.ts` (`POST /api/admin/auth/login`) |
