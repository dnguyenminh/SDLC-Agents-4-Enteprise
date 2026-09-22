# 🔒 Security Deployment Review — SA4E-300

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (Code Intelligence MCP Server + VS Code Extension) |
| Ticket | SA4E-300 — [Extension/Backend] Cải thiện error detail trong luồng ingest source code vào KB |
| Scope | Pre-deploy review for **staging** — backend `src/server/routes/api-index.ts`, `src/server/routes/admin/kb-graph.ts`, `src/modules/memory/engine/edge-on-ingest.ts`, extension `src/services/IndexerHttpClient.ts`, `src/services/IndexingService.ts`, `src/indexer.ts`, plus auth/middleware/config (`jwt-auth.ts`, `HttpServer.ts`, `security-headers.ts`, `rate-limiter.ts`, `config/index.ts`, `code-intel-isolation.ts`) |
| Date | 2026-09-22 |
| Assessor | Security Agent (static review, no exploitation) |
| Version | 1.0 |
| Inputs | `documents/SA4E-300/TDD.md v1.0`, `TEST-REPORT.md` (Round 3, 2026-09-19, verdict PASS, 45/45 automated), `STATUS.json` (deployment in_progress), `RUN-LOG.md`, source code at workspace root |
| Output | `documents/SA4E-300/SECURITY-DEPLOY-REVIEW.md` |

## Executive Summary

SA4E-300 enriches error surfacing across the ingest chain (Backend → HTTP → Extension → Output channel) without changing retry/polling contracts. The security-relevant changes were reviewed line-by-line: path-safety helpers (`sanitizePathSegment` / `resolveSafeTargetPath` / `resolveIndexTempBase`), centralized `indexError` enrichment, per-file `rejectedReasons` / `failedFiles`, singleton Output channel, and token-refresh propagation.

**Security posture is GOOD for staging.** Path traversal is correctly blocked (verified by 18 backend tests including `../evil.ts`, absolute, backslash, encoded, drive-letter cases). All `/api/index/*` routes enforce `requireAuth` (401 probes confirm the gate). `populate-edges` correctly requires `GRAPH_MAINTAIN`. SQL uses parameterized placeholders. No hardcoded secrets, no token logging, no stack-trace exposure. Global `securityHeaders` + `bodyLimit(100MB)` + `requestLogger` (no PII) are in place; the global error handler returns a generic message.

**No Critical findings.** Two High findings (tenant isolation + missing RBAC on sync endpoint) do not block a controlled staging deploy but MUST be fixed or formally risk-accepted before production. Four Medium and six Low/Info findings are defense-in-depth hardening.

**Overall Risk Rating for staging:** Medium

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 2 |
| 🟡 Medium | 4 |
| 🔵 Low | 5 |
| ℹ️ Informational | 3 |

**Verdict: GO WITH CONDITIONS for staging deploy. NO-GO for production until High findings are resolved.**

## Scope & Method

### In scope (SA4E-300 deltas)

- `backend/src/server/routes/api-index.ts` (lines 44-139 path helpers, 142-211 route auth + 429, 213-424 handlers + `indexError`)
- `backend/src/server/routes/admin/kb-graph.ts` lines 101-140 (`populate-edges`: RBAC, adapter, SQL, `relation` column)
- `backend/src/modules/memory/engine/edge-on-ingest.ts` (pure `extractIngestEdges`, parameterized pagination/insert)
- `extension/src/services/IndexerHttpClient.ts` (singleton channel, `setOnTokenRefreshed`/`getCurrentToken`/`notifyTokenRefreshed`, `httpPostWithDetail` slice 500, `buildHeaders`)
- `extension/src/services/IndexingService.ts` (token sync, `pollTaskWorkerProgress` refresh persistence, concurrency guard)
- `extension/src/indexer.ts` lines 75-83 (wiring `setRefreshTokenFn` into both client and service — GAP 4 fix)

### Supporting config/middleware reviewed

- `backend/src/server/HttpServer.ts` (global `securityHeaders`, `bodyLimit`, `rateLimiter` scope, `jwtAuth` mounting)
- `backend/src/server/middleware/jwt-auth.ts`, `security-headers.ts`, `error-handler.ts`, `request-logger.ts`, `rate-limiter.ts`
- `backend/src/config/index.ts` (`indexTempDir`), `backend/src/engine/query/code-intel-isolation.ts` (`requireProjectId`)
- `backend/package.json` (hono ^4, pino ^9, zod ^3, better-sqlite3/sqlite-wasm + pg — no known typosquat)

### Method

Static review only (no exploitation, no infra/network pentest). Checked OWASP Top 10 (2021) + Hono/Node specifics + deployment readiness. Cross-checked TDD §7 (auth/authZ/data-protection claims) and TEST-REPORT §2B/§3.4/§4 (BUG-001 closed, BUG-002 status conflict — see Limitations). Verified each finding against actual `file:line`.

## Detailed Findings

### Finding #1 (High): Any authenticated user can write/sync to any project — no tenant-membership check (BOLA)

| Attribute | Value |
|-----------|-------|
| Severity | High |
| OWASP | A01:2021 — Broken Access Control |
| CWE | CWE-639: Authorization Bypass Through User-Controlled Key |
| CVSS | 7.1 (High) |
| Location | `backend/src/server/routes/api-index.ts:34-39` (`resolveRequestScope`), `213-264` (`handleIndexSource`), `291-305`, `311-366`, `369-400` (`handleSyncPegaRules`) |
| Status | Open |

**Description:**
`resolveRequestScope` trusts the client-supplied `X-Project-Id` header verbatim (only `requireProjectId` non-empty check). No verification that `session.userId` is a member of that project. Same for `handleSyncPegaRules`, which takes `body.projectId` from the JSON body with no binding to identity. Any valid session can therefore write files to another tenant's temp dir (`{indexTempDir}/{userId}/{projectId}/...` — note `userId` is session-bound but `projectId` is fully attacker-controlled) and trigger Pega sync for an arbitrary project.

**Evidence:**
```typescript
// backend/src/server/routes/api-index.ts:34-39
function resolveRequestScope(c: Context): IndexScope {
  const config = loadConfig();
  const projectId = requireProjectId(c.req.header('X-Project-Id') || config.projectId);
  const workspace = c.req.header('X-Workspace-Root') || config.workspace;
  return { projectId, workspace };
}
// handleSyncPegaRules:369-375 — projectId from body, no ownership check
const body = await c.req.json<{ projectId?: string }>();
if (!body.projectId) { /* 400 */ }
// ... no check that session.userId may access body.projectId
const service = new PegaService(memModule.getEngine());
service.syncIndexedRulesToKb(body.projectId) // arbitrary project
```

**Impact:** Horizontal privilege escalation: cross-tenant file write (disk), KB poisoning via `ingest-docs`/`sync-pega-rules` for another project, quota/resource abuse.

**Remediation (report only — DO NOT apply here):**
```typescript
// Bind project to authenticated identity; reject cross-tenant access
import { allowedProjectsFromClaims, verifyJwtToken } from '../middleware/jwt-auth.js';
const session = await requireAuth(c);
if (!session) return c.json({ error: 'Unauthorized', ... }, 401);
const requested = c.req.header('X-Project-Id') || '';
// Option A (minimal for staging): require explicit header + membership check
const membership = await ctx.checkMembership?.(session.userId, requested);
if (!requested || !membership) return c.json({ error: 'Forbidden', details: 'No access to project', action: 'Use an authorized project' }, 403);
```

**References:** https://owasp.org/Top10/A01_2021-Broken_Access_Control/ — CWE-639

---

### Finding #2 (High): `POST /api/index/sync-pega-rules` has no RBAC — any authenticated user can trigger expensive background sync

| Attribute | Value |
|-----------|-------|
| Severity | High |
| OWASP | A01:2021 — Broken Access Control |
| CWE | CWE-862: Missing Authorization |
| CVSS | 7.0 (High) |
| Location | `backend/src/server/routes/api-index.ts:196-200`, `369-400` |
| Status | Open |

**Description:**
All other admin/graph maintenance endpoints in scope require explicit permissions (`populate-edges` → `GRAPH_MAINTAIN` at `kb-graph.ts:104`, `graph/sync` → `RBAC_MANAGE` at `kb-graph.ts:90`). `sync-pega-rules` only calls `requireAuth` (session exists) with no `requirePermission`. Combined with Finding #1 (arbitrary `body.projectId`), any authenticated low-privilege user can fire-and-forget `PegaService.syncIndexedRulesToKb()` for any project, repeatedly (no concurrency guard — see Finding #6).

**Evidence:**
```typescript
// api-index.ts:196-200 — only requireAuth, no requirePermission
app.post('/api/index/sync-pega-rules', async (c) => {
  const session = await requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized', ... }, 401);
  return handleSyncPegaRules(c, registry, logger); // no RBAC
});
// Contrast kb-graph.ts:104
const permCheck = await ctx.requirePermission(c, user.userId, 'GRAPH_MAINTAIN');
```

**Impact:** Privilege escalation (standard user → graph-write), DoS via repeated background syncs, cross-project KB pollution.

**Remediation:**
```typescript
// Require the same gate as populate-edges (or RBAC_MANAGE if sync is admin-only)
const permCheck = await ctx.requirePermission(c, user.userId, 'GRAPH_MAINTAIN');
if (permCheck instanceof Response) return permCheck;
return handleSyncPegaRules(c, registry, logger);
```

---

### Finding #3 (Medium): `X-Project-Id` silently falls back to server default — `PROJECT_REQUIRED` is dead code, tenant confusion

| Attribute | Value |
|-----------|-------|
| Severity | Medium |
| OWASP | A01:2021 — Broken Access Control (fail-open default) |
| CWE | CWE-1188: Insecure Default Initialization |
| CVSS | 5.4 (Medium) |
| Location | `backend/src/server/routes/api-index.ts:36`, `backend/src/config/index.ts:155-157`, `backend/src/engine/query/code-intel-isolation.ts:30-35` |
| Status | Open |

**Description:**
TDD §3.2 and tests (`api-index-errors.test.ts:37-48`) promise `400 PROJECT_REQUIRED` when the header is missing. In production code `resolveRequestScope` does `requireProjectId(header || config.projectId)` where `config.projectId` is always truthy (`deriveProjectId` falls back to hash). `requireProjectId` therefore never throws on live routes; a missing header silently indexes into the server's default project instead of failing loudly. The `indexError` PROJECT_REQUIRED branch (lines 404-407) is only reachable in unit tests, not via HTTP.

**Impact:** Accidental cross-project writes, confusing `projectId` in responses, breaks TDD contract; amplifies Finding #1.

**Remediation:**
```typescript
function resolveRequestScope(c: Context): IndexScope {
  const raw = c.req.header('X-Project-Id');
  const projectId = requireProjectId(raw?.trim() || undefined); // throws → indexError 400
  const workspace = c.req.header('X-Workspace-Root') || loadConfig().workspace;
  return { projectId, workspace };
}
```

---

### Finding #4 (Medium): Error responses echo server filesystem paths and OS errors (info disclosure)

| Attribute | Value |
|-----------|-------|
| Severity | Medium |
| OWASP | A05:2021 — Security Misconfiguration (verbose errors) |
| CWE | CWE-209: Generation of Error Message Containing Sensitive Information |
| CVSS | 5.3 (Medium) |
| Location | `backend/src/server/routes/api-index.ts:129-135`, `246-252`, `340-358`, `403-423` |
| Status | Open |

**Description:**
No stack trace is exposed (good — complies with TDD §1.5). However `rejectedReasons[].message` (`err?.message`), `failedFiles[].reason`, and `indexError.details` (up to 2000 chars) return raw `fs`/`OS` messages verbatim, e.g. `EACCES: permission denied, open '/tmp/CodeIntel/<userId>/<projectId>/...'` or `ENOSPC: no space left on device`. This discloses absolute temp paths, OS user/layout, and `userId`/`projectId` segments to any authenticated caller (and to VS Code Output via forwarding). Extension truncates only `error` to 500 chars (`IndexerHttpClient.ts:489`); `details` is forwarded unbounded (up to 2000).

**Evidence:**
```typescript
// api-index.ts:131-135 — raw OS message reflected
rejectedReasons.push({ file: file.path, code: err?.code || 'UNKNOWN', message: err?.message || String(err) });
// api-index.ts:408-409 — up to 2000 chars of err.message
let details = err?.message ? String(err.message) : String(err);
if (details.length > 2000) details = details.slice(0, 2000);
```

**Impact:** Internal path disclosure aids further attacks (path prediction, user enumeration); `details` may include DB/driver strings on dispatcher failures.

**Remediation:**
```typescript
// Sanitize: keep code + basename only, never absolute paths
import * as path from 'path';
function safeFsMessage(err: any): string {
  const base = (err?.path ? path.basename(String(err.path)) : '');
  return `${err?.code || 'UNKNOWN'}${base ? `: ${base}` : ''}`;
}
// rejectedReasons.push({ file: file.path, code: err?.code ?? 'UNKNOWN', message: safeFsMessage(err) });
// indexError: strip absolute paths: details.replace(/\\/g,'/').replace(/\\/[^\\s]*\\/[^\\s]*/g,'[path]')
```

---

### Finding #5 (Medium): No per-file / per-batch size or count limits — `maxFileSize` not enforced, 100MB bodyLimit only

| Attribute | Value |
|-----------|-------|
| Severity | Medium |
| OWASP | A04:2021 — Insecure Design (resource exhaustion) |
| CWE | CWE-400: Uncontrolled Resource Consumption |
| CVSS | 5.7 (Medium) |
| Location | `backend/src/server/routes/api-index.ts:213-264`, `291-305`, `HttpServer.ts:80-83`, `backend/src/config/index.ts:41` (`maxFileSize: 512_000`) |
| Status | Open |

**Description:**
`handleIndexSource`/`handleIndexDocuments`/`writeFilesPhase` accept an unbounded `files[]` array with unbounded `file.content` strings and unbounded `file.path` lengths. Global `bodyLimit({maxSize: 100MB})` is the only guard. Config `maxFileSize` (512KB) exists but is never checked in `api-index.ts`. Client `batchSize=20` is bypassable (direct HTTP). A single request can stage 100MB to Temp (`writeFileSync` per file, sync I/O in event loop), fill disk (ENOSPC), and bloat `rejectedReasons`/`failedFiles` responses. No `file.path` length cap, no `files.length` cap.

**Impact:** Authenticated DoS (disk fill, event-loop blocking via sync `mkdirSync`/`writeFileSync`/`readFileSync`/`readdirSync`, memory exhaustion on `JSON.parse` + `Buffer.from(content,'utf-8').toString('base64')` at line 348).

**Remediation:**
```typescript
const MAX_FILES = 100, MAX_FILE_BYTES = 512_000, MAX_PATH_LEN = 512;
if (files.length > MAX_FILES) return c.json({ error: 'Batch too large', details: `Max ${MAX_FILES} files per request`, action: 'Split into smaller batches' }, 413);
for (const f of files) {
  if (typeof f.path !== 'string' || f.path.length > MAX_PATH_LEN) { /* reject EACCES */ }
  if (typeof f.content !== 'string' || Buffer.byteLength(f.content,'utf8') > MAX_FILE_BYTES) { /* reject EFBIG */ }
}
```

---

### Finding #6 (Medium): Concurrency backpressure only on `/api/index/source` — `documents` / `ingest-docs` / `sync-pega` / `full` unguarded; `populate-edges` unbounded scan

| Attribute | Value |
|-----------|-------|
| Severity | Medium |
| OWASP | A04:2021 — Insecure Design |
| CWE | CWE-400 / CWE-770 |
| CVSS | 5.3 (Medium) |
| Location | `backend/src/server/routes/api-index.ts:29-31`, `153-166` (guard), `167-210` (unguarded routes), `311-366` (`handleIngestDocsFromTemp` walk), `backend/src/server/routes/admin/kb-graph.ts:111-138` |
| Status | Open |

**Description:**
`INDEX_CONCURRENCY_LIMIT=3` + 429 is correctly implemented but only wraps `POST /api/index/source`. `POST /api/index/documents`, `/ingest-docs` (recursive `walk` + `readFileSync` + per-file `dispatcher.dispatch`), `/sync-pega-rules` (fire-and-forget background sync), and `/full` have no in-memory guard. `rateLimiter` middleware covers `/api/admin/*` and `/api/v1/pega/*` but NOT `/api/index/*` (see `HttpServer.ts:85-95`). `populate-edges` loads ALL `knowledge_entries` (`SELECT ... WHERE archived=0`, no LIMIT/pagination) then does N× `SELECT 1 ... WHERE source_id=?` + M× `INSERT` sequentially with no transaction — O(N²) on large KBs. Extension-side politeness (500ms/200ms delays, backoff 2s/4s/8s) does not protect against direct HTTP floods.

**Impact:** Authenticated DoS: event-loop starvation, disk/CPU exhaustion, long `populate-edges` requests timing out staging health checks.

**Remediation:**
```typescript
// Share the semaphore across all mutating index routes
async function withBackpressure(c: Context, fn: () => Promise<Response>) {
  if (activeIndexRequests >= INDEX_CONCURRENCY_LIMIT)
    return c.json({ error: 'Server busy', details: `Active index requests >= ${INDEX_CONCURRENCY_LIMIT}`, action: 'Retry after 2 seconds', retryAfter: 2 }, 429);
  activeIndexRequests++;
  try { return await fn(); } finally { activeIndexRequests--; }
}
// populate-edges: paginate (LIMIT 500/OFFSET), wrap inserts in a transaction, add MAX_ENTRIES cap
```

---

### Finding #7 (Low): `populate-edges` uses `?` placeholders on the pg path — breaks PostgreSQL deploy

| Attribute | Value |
|-----------|-------|
| Severity | Low (High for pg production readiness) |
| OWASP | A05:2021 — Security Misconfiguration |
| CWE | CWE-89 (variant: placeholder dialect mismatch → availability) |
| CVSS | 3.7 (Low on sqlite-default staging) |
| Location | `backend/src/server/routes/admin/kb-graph.ts:111`, `126` |
| Status | Open |

**Description:**
`insertSql` correctly branches (`?` for sqlite, `$1..$4` for pg at lines 120-122), but the two `SELECT`s hardcode `?` regardless of engine: line 111 `... project_id = ? ...` with `[projectId]`, line 126 `... source_id = ? ...`. On `pg` these throw (`syntax error at or near "?"`), returning 500. Default staging is sqlite (`better-sqlite3`/sqlite-wasm) so not blocking for staging, but any pg-backed staging/prod deploy fails closed. No data-leak, but error text may surface driver details.

**Remediation:**
```typescript
const ph = (i: number) => engine === 'sqlite' ? '?' : `$${i}`;
const entries = await adapter.allAsync<any>(
  `SELECT ... WHERE archived = 0${projectId ? ` AND (project_id = ${ph(1)} OR project_id IS NULL)` : ''}`,
  projectId ? [projectId] : []);
const existing = await adapter.getAsync<any>(
  `SELECT 1 FROM knowledge_graph_edges WHERE source_id = ${ph(1)} LIMIT 1`, [entry.id]);
```

---

### Finding #8 (Low): Security headers incomplete — no HSTS, no frame-ancestors, permissive CSP

| Attribute | Value |
|-----------|-------|
| Severity | Low |
| OWASP | A05:2021 — Security Misconfiguration |
| CWE | CWE-693: Protection Mechanism Failure |
| CVSS | 3.1 (Low — localhost-first server) |
| Location | `backend/src/server/middleware/security-headers.ts:1-37`, `backend/src/server/HttpServer.ts:78` |
| Status | Open |

**Description:**
Positives: `securityHeaders` is global, sets `X-Content-Type-Options: nosniff`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`, restrictive `default-src 'self'` + `object-src 'none'` + `base-uri 'self'`, deletes `X-Powered-By`. Gaps: (a) No `Strict-Transport-Security` (understandable for `http://127.0.0.1` but required once behind TLS in staging/prod); (b) `X-Frame-Options` removed and `frame-ancestors` absent from CSP despite the comment claiming `frame-ancestors *` — clickjacking unmitigated; (c) `script-src` allows `'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net` (documented for admin SPA + Babel, but widens XSS impact if an injection exists).

**Remediation:**
```typescript
if (process.env.CODE_INTEL_BEHIND_TLS === 'true')
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
c.header('Content-Security-Policy', [...existing, "frame-ancestors 'none'"].join('; '));
// Long-term: nonce-based scripts to drop unsafe-inline/unsafe-eval; pin CDN with SRI
```

---

### Finding #9 (Low): JWT comparison not constant-time; unverified-JWT trust when `KB_TOKEN_SECRET` empty (mitigated in SA4E-300 scope)

| Attribute | Value |
|-----------|-------|
| Severity | Low |
| OWASP | A07:2021 — Identification and Authentication Failures |
| CWE | CWE-307 / CWE-347 |
| CVSS | 3.4 (Low) |
| Location | `backend/src/server/middleware/jwt-auth.ts:41-48`, `94-115` |
| Status | Open (compensating control present) |

**Description:**
`verifyHs256` uses `signature === expected` (timing side-channel, low exploitability). More notable: when `KB_TOKEN_SECRET` is empty, `looksLikeJwt` tokens skip signature verification and the decoded payload is trusted to build `projectContext` (lines 95/101). `verifyJwtToken` correctly rejects when secret is missing (SR-01 fix), but the middleware path does not. **Compensating control for SA4E-300:** `HttpServer.ts:87` mounts non-strict `jwtAuth` on `/api/index/*`, but every SA4E-300 route additionally calls session-based `requireAuth` (`api-index.ts:143-149` → `validateSession`), so a forged JWT alone cannot reach handlers. Other `/api/v1/*` routes relying solely on `jwtAuth` in anonymous mode remain exposed — out of SA4E-300 scope, noted for completeness.

**Remediation:**
```typescript
import { timingSafeEqual } from 'crypto';
const a = Buffer.from(signature, 'base64url'), b = Buffer.from(expected, 'base64url');
const valid = a.length === b.length && timingSafeEqual(a, b);
// And: if (looksLikeJwt && !TOKEN_SECRET) return mustAuth ? unauthorized(...) : anonymous();
```

---

### Finding #10 (Low): Attacker-controlled paths/strings logged and reflected without sanitization (log forging / Output-channel injection)

| Attribute | Value |
|-----------|-------|
| Severity | Low |
| OWASP | A09:2021 — Security Logging and Monitoring Failures |
| CWE | CWE-117: Improper Output Neutralization for Logs |
| CVSS | 2.8 (Low) |
| Location | `backend/src/server/routes/api-index.ts:256-258`, `298-300`, `357`, `backend/src/server/middleware/request-logger.ts:9-25`, `extension/src/services/IndexerHttpClient.ts:200`, `297-314` |
| Status | Open |

**Description:**
`file.path` (fully attacker-controlled, up to bodyLimit) is echoed in `rejected`/`rejectedReasons` responses, in `logger.warn({rejectedReasons})` (pino JSON — escaped, lower risk), and in VS Code Output via `channel.appendLine` with no newline/control-char stripping. A path containing `\\n`/`\\r` or ANSI escapes could forge log lines in the Output panel (local-only impact) or bloat responses. `request-logger` correctly logs only method/path/status/duration (no headers/body/token — good). No token/secret was found in any log path (verified by grep).

**Remediation:**
```typescript
const safeForLog = (s: string) => String(s).slice(0, 256).replace(/[\\r\\n\\x1b]/g, '_');
channel.appendLine(`⚠️ ${safeForLog(d.path)}: no content`);
```

---

### Finding #11 (Low): `requireAuth` Bearer parsing + `pollTaskWorkerProgress` minor robustness gaps

| Attribute | Value |
|-----------|-------|
| Severity | Low |
| OWASP | A07:2021 |
| CWE | CWE-436 |
| CVSS | 2.0 (Low) |
| Location | `backend/src/server/routes/api-index.ts:143-149`, `extension/src/services/IndexingService.ts:204-225` |
| Status | Open |

**Description:**
`requireAuth` does `auth.replace('Bearer ', '').trim()` — replaces the first occurrence anywhere, not a prefix check (`startsWith`). A malformed header like `X-Bearer foo` would be mangled rather than rejected early; final `validateSession` still fails closed (401), so no bypass. `pollTaskWorkerProgress` `fetch` has no `AbortSignal.timeout` (unlike `IndexerHttpClient` 5s/10s/30s/60s timeouts) and sends `Authorization` even when `this.token` is stale — refresh logic now persists (`this.token = fresh`, GAP 4 fix verified at `IndexingService.ts:211`, `indexer.ts:81`), so functional, just missing timeout.

**Remediation:**
```typescript
const m = auth.match(/^Bearer\\s+(.+)$/); const token = m?.[1]?.trim() ?? '';
// pollTaskWorkerProgress: fetch(url, { headers, signal: AbortSignal.timeout(10000) })
```

---

### Informational notes (no action required for staging)

- **INFO-1 — No CORS middleware (fail-closed, good).** Grep finds no `cors()` in `backend/src/server`. Browsers calling the API cross-origin get no `Access-Control-Allow-Origin`, which is the safe default for a localhost-first server. If a web admin SPA needs cross-origin access in staging, add an explicit allowlist (never `*` with credentials).
- **INFO-2 — Token handling is sound.** Tokens live only in memory (`IndexerHttpClient.lastRefreshedToken`, `IndexingService.token`), travel only in `Authorization: Bearer`, are refreshed on 401 and propagated via `setOnTokenRefreshed` (GAP 3/4). Grep confirms no `appendLine(token)` / `console.log(token)` in the ingest flow. Default `http://127.0.0.1:48721` is loopback (cleartext acceptable); if staging uses a remote URL, enforce `https://` so the Bearer token is never sent in cleartext off-host.
- **INFO-3 — SQL is parameterized; no secrets in scope.** `populate-edges` and `edge-on-ingest` pagination/insert use bound params; no string-concatenated user input in SQL. No hardcoded credentials/API keys in SA4E-300 files. Passwords elsewhere use `bcrypt`/pbkdf2 `salt:hash`. `bodyLimit` exempts only `/api/v1/pega/ingest-stream` (streaming reader — by design).

## What SA4E-300 does well (positive findings) ✅

- Path traversal comprehensively blocked: null-byte, absolute, drive-letter (`C:`), backslash, single-encoded (`%2e%2e`), `..` segments, plus `path.relative` containment check (`api-index.ts:83-108`); `userId`/`projectId` sanitized (`sanitizePathSegment`, `resolveIndexTempBase` cross-platform via `os.tmpdir()`/env — no hardcoded Windows base); covered by 18 backend tests.
- Auth gate on every `/api/index/*` and `populate-edges` route; live probes (`GET /progress` → 401, `POST /source` → 401) confirm enforcement; `GRAPH_MAINTAIN`/`RBAC_MANAGE` correctly applied on graph admin routes.
- `details` capped at 2000 chars, `error` at 500 chars client-side; global `error-handler` returns generic `INTERNAL_ERROR` (no stack leak); full errors stay server-side in pino.
- Extension removed `console.debug/warn` from ingest flow (remaining hits are Pega/Wrapper files, out of scope per BRD); singleton `Kiro Indexer` channel; 401 refresh-and-retry preserved without changing `parseIngestResponse`/`UNCONVERTIBLE` contract.

## OWASP Top 10 (2021) Checklist

| Category | Status | Notes |
|----------|--------|-------|
| A01 Broken Access Control | ⚠️ High findings | Findings #1 (tenant isolation), #2 (sync RBAC), #3 (default-project fallback). `populate-edges` RBAC correct. |
| A02 Cryptographic Failures | ✅ Pass | No crypto added; Bearer over loopback; pg password ENC: at rest (out of scope). Enforce HTTPS for remote staging (INFO-2). |
| A03 Injection | ✅ Pass (with notes) | SQL parameterized; no command/LDAP/XXE/template injection in scope. Path traversal blocked. Finding #10 (log forging) is output-neutralization, not code injection. |
| A04 Insecure Design | ⚠️ Medium | Findings #5 (no size/count caps), #6 (partial backpressure, unbounded scan). 429 + retry/backoff present but incomplete. |
| A05 Security Misconfiguration | ⚠️ Medium/Low | Findings #4 (verbose fs errors), #7 (pg dialect), #8 (HSTS/frame-ancestors/CSP). `securityHeaders` + `bodyLimit` + generic 500 are good. |
| A06 Vulnerable & Outdated Components | ✅ Pass | `hono ^4`, `pino ^9`, `zod ^3`, `pg ^8`, `onnxruntime-node ^1.18` — no EOL/typosquat observed. Full CVE scan (npm audit) is a DevOps deploy-step (see Limits). |
| A07 Identification & Auth Failures | ⚠️ Low | Findings #9, #11. Session enforcement present on all SA4E-300 routes; no lockout/MFA in scope (local-first tool). |
| A08 Software & Data Integrity | ✅ Pass | No deserialization of untrusted objects; `JSON.parse` on known shapes; no unsigned auto-update in scope. |
| A09 Logging & Monitoring Failures | ⚠️ Low | Finding #10. Pino `logger.error({err})` server-side only; request logger avoids PII; Output-channel surfacing is the feature (not a leak). |
| A10 SSRF | ✅ Pass | No server-side fetch of user-supplied URLs in scope (`fetch` is extension→backend with configured `backendUrl`; `X-Workspace-Root` is a label, not a fetched URL). Validate `backend.url` allowlist in staging config. |

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | #1 Tenant-membership check (BOLA) | Medium (RBAC/membership lookup + tests) | Blocks cross-tenant write/poisoning |
| 2 | #2 RBAC on `sync-pega-rules` | Low (one `requirePermission` + test) | Blocks unprivileged expensive sync |
| 3 | #3 Mandatory `X-Project-Id` (no silent default) | Low | Restores TDD contract, reduces confusion |
| 4 | #5 Per-file/batch caps (`maxFileSize`, count, path len) | Low-Medium | Prevents disk/memory DoS |
| 5 | #6 Extend backpressure + paginate `populate-edges` | Medium | Staging stability under load |
| 6 | #4 Sanitize fs errors (basename only) | Low | Removes path disclosure |
| 7 | #7 pg placeholder fix | Low (2 lines + pg test) | Required before any pg-backed deploy |
| 8 | #8 HSTS/frame-ancestors/CSP tightening | Low (reverse-proxy + header) | Clickjacking/TLS hardening |

## Recommendations Summary

### Immediate (before staging deploy — low cost)

1. Document risk-acceptance for #1/#2 if they cannot be fixed pre-staging (staging data is non-sensitive, all users trusted) — otherwise apply the 5-line RBAC + mandatory-header fixes.
2. Confirm `CODE_INTEL_REQUIRE_AUTH` / `KB_TOKEN_SECRET` are set in the staging env; never run staging with anonymous JWT trust.
3. Run `npm audit` (backend + extension) in the DevOps pipeline; record results in DPG (currently missing).

### Short-term (before production)

1. Fix #1–#6 (tenant check, sync RBAC, mandatory project header, size/count caps, global backpressure, error sanitization).
2. Fix #7 and add a pg smoke test for `populate-edges` (or declare sqlite-only support).
3. Add HSTS at the reverse proxy + `frame-ancestors 'none'`; review CSP `unsafe-eval`/CDN necessity.
4. Execute the 5 NOT_RUN cases (TC-101/201/701/703/704) in staging with a test JWT + project fixture + Extension host.

### Long-term hardening

1. Constant-time JWT compare; reject unverified JWTs when secret is absent even in anonymous mode.
2. Centralize request validation with Zod schemas on all `/api/index/*` bodies (types, lengths, counts).
3. Move file staging to async I/O + antivirus/size pre-checks; consider per-tenant disk quotas and audit logging of cross-project attempts.

## Verdict

**GO WITH CONDITIONS for staging deploy (sqlite-backed, loopback or TLS, trusted users). NO-GO for production until High findings are closed.**

### Staging deploy conditions

1. **Auth:** staging sets `KB_TOKEN_SECRET` + `CODE_INTEL_REQUIRE_AUTH=true`; issue a dedicated test JWT + project fixture for the 5 NOT_RUN cases.
2. **Risk-accept or fix #1/#2:** either land the membership + `GRAPH_MAINTAIN` fixes, or record PO sign-off that staging tenants are non-sensitive and all authenticated users are trusted.
3. **Resource guards:** monitor disk (`indexTempDir`), cap `CODE_INTEL_INDEX_TEMP_DIR` on its own volume if possible; watch for 429s; do not expose staging unauthenticated to the internet.
4. **Tests:** run TC-101, TC-201, TC-703 (staging backend) + TC-701, TC-704 (Extension host) and append results to TEST-REPORT before prod promotion.
5. **Docs:** DevOps to produce missing `DPG.md`/`RLN.md` (build, env vars, TLS/HSTS, `npm audit`, backup/rollback) — staging deploy must not be treated as prod-ready without them.
6. **pg:** staging stays on sqlite until Finding #7 is fixed and verified against pg.

## Appendix

### A. Tools & Methodology

- Static code review (manual, line-referenced); dependency manifest read; middleware/config review; OWASP Testing Guide v4.2 (static subset); TDD/TEST-REPORT cross-check. No dynamic exploitation, no dependency CVE live-query (`npm audit` deferred to pipeline), no infra/network test.

### B. Scope Limitations (MUST READ)

- **DPG.md / RLN.md do not exist** (DevOps phase pending) — deployment config (TLS, HSTS, CORS allowlist, `npm audit`, secrets rotation, backups, rollback) could not be reviewed; verdict is code-only.
- **5 STC cases NOT_RUN** (TC-101/201/701/703/704) require staging (test JWT + project fixture + VS Code host); live probes were read-only 401 checks only — no results fabricated.
- **BUG-002 status conflict:** TEST-REPORT still marks BUG-002 OPEN (out-of-scope build errors), while RUN-LOG 2026-09-19 records BUG-002 fixed and `npm run build` GREEN with the `kb-graph.ts`/`edge-on-ingest.ts` fix verified in code. SM to confirm closure and align TEST-REPORT before prod.
- Runtime behavior, concurrency under load, infrastructure, and network controls were NOT tested.

### C. Glossary

- **BOLA:** Broken Object Level Authorization — accessing another tenant's object by manipulating an ID. **RBAC:** Role-Based Access Control. **CSP/HSTS:** Content-Security-Policy / HTTP Strict Transport Security. **CVSS:** Common Vulnerability Scoring System. **CWE:** Common Weakness Enumeration.
