# 🔒 Security Audit Report — Authentication & Authorization
**Scope:** `backend/src/server/routes/` (all route files)
**Date:** 2025-07-14
**Assessor:** Security Agent (static analysis)
**Focus:** Missing auth, missing authorization, data leakage, broken access control

---

## Executive Summary

The admin route layer (`/api/admin/*`) is **well-structured overall** — the vast majority of endpoints correctly call `requireAuth` followed by `requirePermission`. However, several critical gaps were identified:

1. **3 unauthenticated endpoints** expose infrastructure data and accept DB credentials with no identity check.
2. **5 endpoints** have `requireAuth` but **no permission check** — any authenticated user can access.
3. **MCP tool execution** (`POST /mcp/tools/call`) has no hard authentication gate; identity comes from an unverified header.
4. **3 indexing write endpoints** (`/api/index/*`) are **completely unauthenticated** and write files to disk.
5. A **token injection** vulnerability exists in the admin SPA static route (token in HTML via URL param).

**Overall Risk Rating: 🔴 High**


---

## Summary Table

| # | File | Line(s) | Method | Path | Issue Type | Severity |
|---|------|---------|--------|------|-----------|----------|
| F-01 | `routes/database.ts` | 33 | GET | `/api/admin/database/status` | Missing auth | High |
| F-02 | `routes/database.ts` | 40 | POST | `/api/admin/database/test-connection` | Missing auth | Critical |
| F-03 | `routes/database.ts` | 63 | POST | `/api/admin/database/migrate` | Missing auth | Critical |
| F-04 | `routes/database.ts` | 80 | POST | `/api/admin/database/migrate/cancel` | Missing auth | High |
| F-05 | `routes/database.ts` | 86 | POST | `/api/admin/database/switch-to-sqlite` | Missing auth | High |
| F-06 | `routes/api-index.ts` | 108 | POST | `/api/index/source` | Missing auth + unauthenticated file write | Critical |
| F-07 | `routes/api-index.ts` | 117 | POST | `/api/index/document` | Missing auth + unauthenticated file write | Critical |
| F-08 | `routes/api-index.ts` | 125 | POST | `/api/index/documents` | Missing auth + unauthenticated file write | Critical |
| F-09 | `routes/tools.ts` | 101 | GET | `/mcp/tools/list` | Missing auth (tool enumeration) | Medium |
| F-10 | `routes/tools.ts` | 105 | POST | `/mcp/tools/call` | Weak auth - identity from unverified header | High |
| F-11 | `routes/api.ts` | 17-55 | GET/POST/PUT/DEL | `/api/dashboard/*`, `/api/kb/*`, `/api/analytics/*`, `/api/tags/*`, `/api/quality/*` | Missing auth on all endpoints | Medium |
| F-12 | `routes/health.ts` | 18 | GET | `/health` | Info disclosure - module status, version, uptime | Low |
| F-13 | `admin/static.ts` | 32 | GET | `/admin?token=...` | Token injection via URL query param into HTML | High |
| F-14 | `admin/config.ts` | 25 | GET | `/api/admin/llm/models` | requireAuth only, no requirePermission | Medium |
| F-15 | `admin/config.ts` | 37 | POST | `/api/admin/llm/test` | requireAuth only, no requirePermission + SSRF risk | High |
| F-16 | `admin/sse.ts` | 10 | GET | `/api/admin/sse` | Uses authenticate (soft-fail) not requireAuth (hard-fail) | Medium |
| F-17 | `admin/kb-graph.ts` | 70 | POST | `/api/admin/kb/graph/sync` | Write operation gated on read-only GRAPH_VIEW permission | Medium |
| F-18 | `admin/database.ts` | 25 | GET | `/api/admin/database/status` | Missing auth (duplicate admin route) | High |
| F-19 | `admin/database.ts` | 37 | POST | `/api/admin/database/test-connection` | Missing auth | Critical |
| F-20 | `admin/database.ts` | 60 | POST | `/api/admin/database/validate-schema` | Missing auth | Critical |


---

## Detailed Findings

### F-01 to F-05 — Missing Authentication on Database Routes (`routes/database.ts`)

| Attribute | Value |
|-----------|-------|
| **Severity** | Critical (F-02, F-03, F-20) / High (F-01, F-04, F-05, F-18, F-19) |
| **OWASP** | A01:2021 Broken Access Control |
| **CWE** | CWE-306: Missing Authentication for Critical Function |
| **Location** | `backend/src/server/routes/database.ts` (lines 33, 40, 63, 80, 86) |

**Description:**
The `database.ts` route file registers five endpoints with no authentication whatsoever:

```typescript
// backend/src/server/routes/database.ts
app.get('/api/admin/database/status', (c) => { ... });           // line 33 — no auth
app.post('/api/admin/database/test-connection', async (c) => { ... }); // line 40 — no auth
app.post('/api/admin/database/migrate', async (c) => { ... });   // line 63 — no auth
app.post('/api/admin/database/migrate/cancel', (c) => { ... });  // line 80 — no auth
app.post('/api/admin/database/switch-to-sqlite', (c) => { ... }); // line 86 — no auth
```

Note: `admin/database.ts` (the admin-module version of these routes) has the **same problem** — all its handlers are also missing `requireAuth` calls.

**Impact:**
- Any unauthenticated attacker can send arbitrary database credentials to `/api/admin/database/test-connection` (accepts host, port, username, password) — this is a **Server-Side Request Forgery** (SSRF) vector for network scanning
- `/api/admin/database/migrate` triggers a full database migration SSE stream without authentication
- `/api/admin/database/switch-to-sqlite` reconfigures the active database engine without authentication

**Remediation:**
```typescript
app.get('/api/admin/database/status', async (c) => {
  // ADD: authentication + permission gate
  const auth = c.req.header('Authorization') || '';
  const token = auth.replace('Bearer ', '');
  const session = await validateSession(token);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  // ... existing logic
});
```

For a consistent pattern, wire these through `AdminContext` and call `ctx.requireAuth` + `ctx.requirePermission(c, user.userId, 'CONFIG_EDIT')` on all mutation endpoints.


---

### F-06 to F-08 — Unauthenticated File Write (`routes/api-index.ts`)

| Attribute | Value |
|-----------|-------|
| **Severity** | Critical |
| **OWASP** | A01:2021 Broken Access Control + A03:2021 Injection (path traversal) |
| **CWE** | CWE-306 + CWE-22 Path Traversal |
| **Location** | `backend/src/server/routes/api-index.ts` lines 108, 117, 125 |

**Description:**
All three indexing write endpoints (`/api/index/source`, `/api/index/document`, `/api/index/documents`) are registered with zero authentication:

```typescript
// backend/src/server/routes/api-index.ts — lines 108-127
export function registerIndexRoutes(app: Hono, registry: ModuleRegistry, logger: Logger): void {
  app.post('/api/index/source', (c) => handleIndexSource(c, registry, logger));   // NO AUTH
  app.post('/api/index/document', (c) => handleIndexDocument(c, logger));          // NO AUTH
  app.post('/api/index/documents', (c) => handleIndexDocuments(c, logger));        // NO AUTH
}
```

The `resolveUserId` helper (line 35) is explicitly non-fatal — it returns `''` if unauthenticated and **does not block** the request. Files are written to disk via `writeFilesPhase`.

**Impact:**
- Any unauthenticated caller can write arbitrary files into the configured workspace directory
- Although `resolveWithinWorkspace()` provides path-traversal protection, there is no authentication barrier to prevent mass file writes (DoS) or workspace pollution
- Project registry entries can be created by unauthenticated callers via `registerProjectPhase`

**Remediation:**
```typescript
export function registerIndexRoutes(app: Hono, registry: ModuleRegistry, logger: Logger): void {
  // REQUIRE auth on all indexing endpoints
  app.post('/api/index/source', async (c) => {
    const session = await resolveAndRequireAuth(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);
    return handleIndexSource(c, registry, logger, session.userId);
  });
  app.post('/api/index/document', async (c) => {
    const session = await resolveAndRequireAuth(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);
    return handleIndexDocument(c, logger);
  });
  app.post('/api/index/documents', async (c) => {
    const session = await resolveAndRequireAuth(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);
    return handleIndexDocuments(c, logger);
  });
}

async function resolveAndRequireAuth(c: Context): Promise<{ userId: string } | null> {
  const auth = c.req.header('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;
  return await validateSession(token);
}
```


---

### F-09 — Missing Auth on MCP Tool Listing (`routes/tools.ts`)

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP** | A05:2021 Security Misconfiguration |
| **CWE** | CWE-200: Exposure of Sensitive Information |
| **Location** | `backend/src/server/routes/tools.ts` line 101 |

**Description:**
`GET /mcp/tools/list` exposes the complete list of available tools (names, descriptions, inputSchema) without any authentication:

```typescript
// tools.ts line 101-103
app.get('/mcp/tools/list', (c) => {
  const tools = router.listTools();
  return c.json({ tools });     // No auth check
});
```

**Impact:** Unauthenticated attacker can enumerate all available MCP tools — their names, descriptions, and parameter schemas. This enables targeted reconnaissance for tool-based attacks.

**Remediation:** Add JWT or session token verification before returning the tool list.

---

### F-10 — Weak Authentication on MCP Tool Execution (`routes/tools.ts`)

| Attribute | Value |
|-----------|-------|
| **Severity** | High |
| **OWASP** | A07:2021 Identification and Authentication Failures |
| **CWE** | CWE-290: Authentication Bypass by Spoofing |
| **Location** | `backend/src/server/routes/tools.ts` lines 45-53 |

**Description:**
When API key auth is disabled, user identity is taken from the `X-User-Id` header with no cryptographic verification:

```typescript
// tools.ts lines 45-53
function stampUserId(c: Context, args: Args, logger: Logger): void {
  if (isApiKeyAuthEnabled()) {
    args.__userId = 'api-key-user';
    return;
  }
  const userId = c.req.header('X-User-Id') || c.req.header('x-user-id');
  if (userId) {
    logger.warn({ userId }, 'X-User-Id header used without API key auth — identity unverified');
    args.__userId = userId; // ACCEPTS UNVERIFIED IDENTITY
  }
}
```

The code itself logs a warning ("identity unverified"), confirming this is a known weak point. Any caller can spoof any userId by setting `X-User-Id: admin`.

**Impact:** Any tool call can be attributed to any userId. If tools perform authorization checks based on `__userId`, they can be bypassed.

**Remediation:**
```typescript
function stampUserId(c: Context, args: Args, logger: Logger): void {
  if (isApiKeyAuthEnabled()) {
    args.__userId = 'api-key-user';
    return;
  }
  // REQUIRE JWT verification — never accept userId from client header
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (token) {
    const { valid, payload } = verifyJwtToken(token);  // sync check
    if (valid && payload?.sub) {
      args.__userId = payload.sub;
      return;
    }
  }
  // No verified identity — reject or use anonymous sentinel
  args.__userId = '__anonymous__';
}
```


---

### F-11 — Missing Auth on Webview API Routes (`routes/api.ts`)

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP** | A01:2021 Broken Access Control |
| **CWE** | CWE-306 |
| **Location** | `backend/src/server/routes/api.ts` lines 17-55 |

**Description:**
All webview data endpoints in `api.ts` have zero authentication — no `requireAuth`, no JWT middleware:

```typescript
// routes/api.ts — all unauthenticated
app.get('/api/dashboard/summary', (c) => { ... });   // line 17
app.get('/api/dashboard/recent',  (c) => { ... });   // line 23
app.get('/api/kb/graph',          (c) => { ... });   // line 28
app.get('/api/kb/graph/node/:id', (c) => { ... });   // line 33
app.get('/api/analytics/overview',(c) => { ... });   // line 38
app.get('/api/analytics/timeline',(c) => { ... });   // line 43
app.get('/api/tags/list',         (c) => { ... });   // line 48
app.post('/api/tags',             async (c) => { ... }); // line 53 — WRITE, no auth
app.put('/api/tags/:id',          async (c) => { ... }); // line 58 — WRITE, no auth
app.delete('/api/tags/:id',       (c) => { ... });   // line 63 — DELETE, no auth
app.get('/api/quality/scores',    (c) => { ... });   // line 67
app.get('/api/quality/summary',   (c) => { ... });   // line 71
```

**Note:** Current responses are mostly empty/stub data, reducing immediate impact. However POST/PUT/DELETE tags are real write operations without auth.

**Remediation:** Apply the `jwtAuth` middleware (already used in `kb-api.ts`) globally to this router:
```typescript
export function createApiRoute(registry: ModuleRegistry, logger: Logger): Hono {
  const app = new Hono();
  app.use('*', jwtAuth);  // ADD: protect all endpoints in this router
  // ... existing routes
}
```

---

### F-12 — Information Disclosure via `/health` (`routes/health.ts`)

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP** | A05:2021 Security Misconfiguration |
| **CWE** | CWE-200 |
| **Location** | `backend/src/server/routes/health.ts` line 18 |

**Description:**
`GET /health` returns detailed module health status, version, uptime, and tool count to any unauthenticated caller:

```typescript
return c.json({
  status: allReady ? 'healthy' : 'starting',
  version,         // Application version — aids targeted exploit
  uptime,          // Server restart pattern
  tools_loaded: toolCount,
  modules,         // Module names and status
});
```

**Remediation:** Return minimal status for unauthenticated requests; return full detail only for authenticated admin callers.


---

### F-13 — Token Injection via URL Query Parameter (`admin/static.ts`)

| Attribute | Value |
|-----------|-------|
| **Severity** | High |
| **OWASP** | A02:2021 Cryptographic Failures + A03:2021 Injection |
| **CWE** | CWE-598: Information Exposure Through Query Strings in GET Request |
| **Location** | `backend/src/server/routes/admin/static.ts` lines 25-30 |

**Description:**
The admin SPA accepts a `?token=` query parameter and injects it directly into the HTML response via `localStorage.setItem`:

```typescript
// admin/static.ts lines 25-30
const token = c.req.query('token');
if (token) {
  const injectScript = '<script>localStorage.setItem("admin_token","' + token + '");</script>';
  html = html.replace('</head>', injectScript + '</head>');
}
```

**Issues:**
1. **Token in URL** — tokens appear in server access logs, browser history, and HTTP Referer headers
2. **XSS vector** — the `token` value is injected into HTML **without sanitization**. If the token value contains `</script>`, an attacker can inject arbitrary JavaScript. Example: `?token=x%22)%3C/script%3E%3Cscript%3Ealert(1)%3C/script%3E`
3. **CSRF** — if an attacker tricks a user into visiting a crafted URL, the attacker-controlled token gets stored in `localStorage`

**Remediation:**
```typescript
// REMOVE the token injection pattern entirely.
// Use HTTP-only cookies or a separate /api/admin/auth/token-exchange endpoint.
// If URL-based token handoff is required, sanitize strictly:
import { escapeHtml } from '../utils/sanitize.js';
if (token && /^[A-Za-z0-9._\-]+$/.test(token)) { // whitelist alphanumeric only
  const safe = escapeHtml(token);
  html = html.replace('</head>', `<script>localStorage.setItem("admin_token","${safe}");</script></head>`);
}
```

---

### F-14 — Missing Permission Check on LLM Models List (`admin/config.ts`)

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP** | A01:2021 Broken Access Control |
| **CWE** | CWE-285: Improper Authorization |
| **Location** | `backend/src/server/routes/admin/config.ts` line 25 |

**Description:**
`GET /api/admin/llm/models` calls `requireAuth` but NOT `requirePermission`. Any authenticated user (regardless of role) can query LLM model lists, which triggers an outbound HTTP request to the configured LLM server:

```typescript
app.get('/api/admin/llm/models', async (c) => {
  const user = await ctx.requireAuth(c);          // Auth: YES
  if (user instanceof Response) return user;
  // requirePermission: MISSING
  // ... makes outbound HTTP request to LLM server
});
```

**Remediation:** Add `await ctx.requirePermission(c, user.userId, 'CONFIG_EDIT')` before the fetch call.


---

### F-15 — Missing Permission + SSRF Risk on LLM Test (`admin/config.ts`)

| Attribute | Value |
|-----------|-------|
| **Severity** | High |
| **OWASP** | A01:2021 Broken Access Control + A10:2021 SSRF |
| **CWE** | CWE-918: Server-Side Request Forgery |
| **Location** | `backend/src/server/routes/admin/config.ts` line 37 |

**Description:**
`POST /api/admin/llm/test` has `requireAuth` but no permission check. More critically, the SSRF protection has a bypass:

```typescript
app.post('/api/admin/llm/test', async (c) => {
  const user = await ctx.requireAuth(c);
  if (user instanceof Response) return user;
  // requirePermission: MISSING
  const config = getEffectiveConfig(ctx);   // reads server-side LLM config
  const base = llm.baseUrl || 'http://localhost:11434';
  const isLocalUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(base);
  if (llm.baseUrl && llm.baseUrl !== 'http://localhost:11434' && !isLocalUrl) {
    const urlCheck = validateExternalUrl(base);
    if (!urlCheck.valid) return c.json({ success: false, ... }, 400);
  }
  // ... makes outbound HTTP request
});
```

SSRF bypass: the `base` URL comes from **server-side config** (`configOverrides`), not the request body. But a user with `CONFIG_EDIT` can first PATCH `llm.baseUrl` to an internal IP (e.g., `http://169.254.169.254/latest/meta-data/`), then call this endpoint to probe internal network — even though `validateExternalUrl` may not block cloud metadata IPs.

**Remediation:**
1. Add `requirePermission(c, user.userId, 'CONFIG_EDIT')` 
2. Expand SSRF block list to include: `169.254.169.254`, `100.64.0.0/10`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`

---

### F-16 — Soft Authentication on SSE Endpoint (`admin/sse.ts`)

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP** | A07:2021 Identification and Authentication Failures |
| **CWE** | CWE-306 |
| **Location** | `backend/src/server/routes/admin/sse.ts` line 10 |

**Description:**
The SSE endpoint uses `ctx.authenticate()` (which returns `null` on failure) rather than `ctx.requireAuth()` (which returns 401). The null-check is present, but the distinction matters for consistency and defense-in-depth:

```typescript
app.get('/api/admin/sse', async (c) => {
  const user = await ctx.authenticate(c);   // soft — returns null
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  // No permission check — any authenticated user gets real-time stats
```

Any authenticated user (including low-privilege accounts) receives real-time KB entry counts, user counts, and memory statistics. Consider adding a `DASHBOARD_VIEW` permission check consistent with `analytics.ts`.

---

### F-17 — Write Operation on Read-Only Permission (`admin/kb-graph.ts`)

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP** | A01:2021 Broken Access Control |
| **CWE** | CWE-285 |
| **Location** | `backend/src/server/routes/admin/kb-graph.ts` line 70 |

**Description:**
`POST /api/admin/kb/graph/sync` is a mutating operation (resets and resyncs the entire graph) but is gated on `GRAPH_VIEW` — a read-only permission:

```typescript
app.post('/api/admin/kb/graph/sync', async (c) => {
  const user = await ctx.requireAuth(c);
  if (user instanceof Response) return user;
  const permCheck = await ctx.requirePermission(c, user.userId, 'GRAPH_VIEW'); // READ permission for WRITE op
  // ... triggers ctx.db.graph.resetGraph() and graphService.fullSync()
```

A user with read-only `GRAPH_VIEW` can trigger a full graph reset and resync. This should require an administrative permission.

**Remediation:** Change to `'KB_WRITE'` or `'CONFIG_EDIT'` permission check.


---

## What Was Done Well (Positive Findings)

- ✅ **`/api/admin/projects`** — Fixed correctly. Uses `requireAuth` + `requirePermission('RBAC_MANAGE')` with proper data filtering (admins see all, others see only their own rows). This is the correct pattern.
- ✅ **All CRUD in `users.ts`, `rbac.ts`, `kb-entries.ts`, `kb-operations.ts`, `kb-tags.ts`, `analytics.ts`, `mcp.ts`, `mcp-crud.ts`** — All endpoints use `requireAuth` + `requirePermission` with appropriate permission names.
- ✅ **`kb-api.ts`** — Uses `jwtAuth` middleware applied at router level (`api.use('*', jwtAuth)`), which is the cleanest pattern.
- ✅ **IDOR protection in `users.ts`** — `GET /api/admin/profile` explicitly checks `USER_MANAGE` permission before allowing one user to access another user's profile, and logs the access attempt as an audit record.
- ✅ **Privilege escalation prevention in `users.ts`** — `POST /api/admin/users` prevents a user from creating accounts with permissions higher than their own (`escalated.length > 0` check).
- ✅ **JWT project binding in `tools.ts`** — `verifyProjectBinding()` validates that the requested `X-Project-Id` is within the JWT's granted project list (SEC-03).
- ✅ **Reserved scope key stripping in `tools.ts`** — `stripReservedKeys()` prevents client-supplied `__projectId`, `__userId`, `__workspaceRoot` from being honored (SEC-02).
- ✅ **Path traversal protection in `api-index.ts`** — `resolveWithinWorkspace()` is called before any file write; unsafe paths are rejected and logged.
- ✅ **HTML sanitization in KB import** — `containsHtml()` and `sanitizeKbEntry()` protect against script injection in imported KB entries.
- ✅ **Config read-only enforcement** — `CONFIG_EDIT` with `roleData.readOnly === true` blocks mutation operations even for users with the permission.

---

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | F-06/F-07/F-08 — Unauthenticated file writes on `/api/index/*` | Low | Unauthenticated disk write |
| 2 | F-02/F-03 — Unauthenticated DB credential test + migration trigger | Low | Credential exposure, DB takeover |
| 3 | F-19/F-20 — Admin database routes missing auth | Low | Same as above via admin path |
| 4 | F-13 — Token XSS injection via URL | Medium | Session hijack |
| 5 | F-10 — Unverified X-User-Id in tool calls | Medium | Identity spoofing in tool context |
| 6 | F-15 — Missing permission + SSRF on LLM test | Low | Internal network probe |
| 7 | F-01/F-04/F-05/F-18 — Unauthenticated DB status/cancel/switch | Low | Reconnaissance + DoS |
| 8 | F-11 — Unauthenticated webview API write endpoints | Low | Unauthenticated tag writes |
| 9 | F-17 — Write op behind read permission on graph sync | Low | Unauthorized graph reset |
| 10 | F-14/F-16 — Missing permission on LLM models + SSE | Low | Info disclosure |
| 11 | F-09 — Unauthenticated tool listing | Low | Tool enumeration |
| 12 | F-12 — Health endpoint info disclosure | Low | Version/module disclosure |

---

## Scope Limitations

- **Static analysis only** — no runtime testing, no actual exploitation attempted
- `/api/index/*` routes may be intentionally internal (called by the IDE extension, not browser) — if protected by network-level controls (localhost only), severity of F-06/F-07/F-08 may be reduced in practice
- `/health` (F-12) and `/mcp/tools/list` (F-09) may be intentionally public depending on deployment model
- The `routes/database.ts` (non-admin path) may be disabled in production depending on feature flags — not verified

---

*Report generated by Security Agent — static code review only*
