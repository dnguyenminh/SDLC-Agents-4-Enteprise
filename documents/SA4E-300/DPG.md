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
| Isolated staging workspace + data dir + DB file (fresh, NOT prod) | ☐ Ready | e.g. `D:\staging\sa4e-300-ws`, data-dir `.code-intel-staging`, `CODE_INTEL_DB=index-staging.db` |
| Dedicated disk volume (or quota) for `CODE_INTEL_INDEX_TEMP_DIR` | ☐ Ready | Monitor free space; ENOSPC is a known failure mode under test |
| No internet exposure of staging backend | ☐ Verified | Bind `CODE_INTEL_HOST=127.0.0.1`; no reverse-proxy public route; no CORS allowlist changes |

### 2.2 Software Dependencies

| Dependency | Version | Status |
|-----------|---------|--------|
| Node.js | **22.x** (see `backend/package.json` engines) | ☐ Installed (`node --version`) |
| npm | bundled with Node 22 | ☐ Installed |
| Backend deps | `hono ^4`, `pino ^9`, `zod ^3`, `better-sqlite3`/sqlite-wasm (see `backend/package.json`) | ☐ Installed via `npm ci` |
| Extension toolchain | TypeScript `^5.4`, esbuild `^0.21`, `@vscode/vsce ^2.24`, vitest `^4.1.8` | ☐ Installed via `npm ci` |
| VS Code (for TC-701/704) | `^1.85.0` (see `engines.vscode`) | ☐ Available on tester machine |
| Storage engine | **sqlite only** | ☐ Confirmed — do NOT use pg until Security Finding Low #7 (placeholder dialect) is fixed |

### 2.3 Access Requirements

| Access | Type | Who Needs It |
|--------|------|-------------|
| Shell on staging host | Local admin / SSH key | DevOps |
| Staging secrets (`ADMIN_INITIAL_PASSWORD`, `KB_TOKEN_SECRET`) | Vault/env, never committed | DevOps |
| VS Code Extension Development Host (F5) | Local VS Code | QA (TC-701/704) |
| Git branch `SA4E-300` | Read | DevOps (build source) |

### 2.4 Secrets & Env (staging — set BEFORE start)

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

- [ ] Disk monitor on staging temp dir + data dir (alert on < 20% free; ENOSPC fault-injection is planned — see §7.3).
- [ ] Watch for HTTP 429 (`Server busy`) during concurrency probes; 429 is expected behavior, not an outage.
- [ ] Backend pino logs accessible (server-side full errors stay in pino; client sees sanitized `details`).

### 2.6 Backup Requirements

- [ ] Prod DB (`index.db` on `:48721`) NOT touched — verify staging env points at staging DB before start.
- [ ] Previous staging artifact (if any) saved for rollback (`dist/` + `.vsix`, see §8).
- [ ] Staging config backup (env file snapshot without secrets in plain text — secrets in vault only).

---
