# 🔒 Security Assessment Report — Phase 3.7 (Design Review)

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (SA4E-411) |
| Scope | Full backend security review: authentication, authorization, API security, dependencies, configuration |
| Date | 2025-11-15 |
| Assessor | Security Agent |
| Version | 1.0 |

## Executive Summary

The SDLC-Agents-4-Enterprise backend implements a **dual-token authentication system** (15-minute HS256 access JWT + 7-day rotating opaque refresh tokens) with PBKDF2-SHA512 password hashing, session fixation protection via user-agent binding, and a comprehensive RBAC permission model. The Docker deployment follows security hardening practices: multi-stage builds with digest-pinned base images, non-root runtime user, read-only root filesystem, and no build tooling in production.

**However, critical authentication gaps exist in the route layer** — several administrative and data-write endpoints lack any authentication, and the MCP tool execution endpoint accepts unverified user identity via a client-controlled header. A token injection XSS vulnerability exists in the admin SPA static route.

**Overall Risk Rating: 🟠 High**

| Severity | Count |
|----------|-------|
| 🔴 Critical | 6 |
| 🟠 High | 8 |
| 🟡 Medium | 9 |
| 🔵 Low | 3 |
| ℹ️ Informational | 4 |

---

## Findings by OWASP Top 10 (2021)

### A01:2021 — Broken Access Control

**Findings:** F-01 to F-08, F-11, F-14, F-15, F-17, F-18 to F-20 (from SECURITY-AUTH-AUDIT.md)
- 6 endpoints in `routes/database.ts` with **no authentication** (accept DB credentials, trigger migrations)
- 3 indexing write endpoints (`/api/index/*`) with **no authentication** — unauthenticated file writes
- 11 webview API endpoints (`/api/dashboard/*`, `/api/kb/*`, `/api/analytics/*`, `/api/tags/*`, `/api/quality/*`) with **no authentication**
- 3 admin database routes (duplicate paths) with **no authentication**
- 3 endpoints with authentication but **missing permission checks** (`/api/admin/llm/models`, `/api/admin/llm/test`, `/api/admin/kb/graph/sync`)
- SSE endpoint uses soft-fail `authenticate()` instead of hard-fail `requireAuth()`

### A02:2021 — Cryptographic Failures

**Findings:**
- **F-13**: Token injection via URL query parameter into HTML response (XSS vector)
- **Password policy**: Minimum 6 characters only — insufficient for credential hardening
- **JWT algorithm**: HS256 (symmetric) used for access tokens; RS256 recommended for any public-facing validation
- **JWT secret**: Generated at runtime if not provided via env; file-based provisioning survives restarts but has no rotation mechanism

### A03:2021 — Injection

**Findings:**
- **F-13**: XSS via unsanitized `token` query parameter injected into `<script>` tag
- **F-15**: SSRF risk on `/api/admin/llm/test` — config-controlled URL can be pointed to internal metadata endpoints (169.254.169.254, 10.0.0.0/8, etc.)
- **Path traversal**: `resolveWithinWorkspace()` protects `/api/index/*` writes, but protection is defense-in-depth only (no auth gate)
- **SQL injection**: Parameterized queries used throughout (better-sqlite3/pg `?` placeholders) — **no raw concatenation found**

### A04:2021 — Insecure Design

**Findings:**
- Dual auth paths (JWT + opaque session tokens) increase attack surface; session token validation falls back to unauthenticated mode when `CODE_INTEL_REQUIRE_AUTH=false`
- Extension client user-agent binding deliberately **disabled** (empty UA) to support VS Code webview iframe — weakens session fixation protection for extension users
- MCP tool execution identity derived from unverified `X-User-Id` header when API key auth disabled
- Project registration auto-upsert on first access (SA4E-375) — creates project registry entries without explicit admin action

### A05:2021 — Security Misconfiguration

**Findings:**
- **Missing HSTS header** — `Strict-Transport-Security` not set (server binds to 127.0.0.1 only in production, but header should still be present)
- **CSP allows `unsafe-inline` and `unsafe-eval`** — required for admin SPA (Babel + inline scripts) but weakens XSS protection
- **X-Frame-Options removed** — replaced by CSP `frame-ancestors` but not explicitly set (relies on CSP only)
- **Health endpoint** (`/health`) exposes version, uptime, module status, tool count to unauthenticated callers
- **Rate limiter** uses in-memory Map — not distributed (single-instance only)
- **Trust proxy** disabled by default (`TRUST_PROXY=true` required) — IP-based rate limiting ineffective behind reverse proxy without config

### A06:2021 — Vulnerable and Outdated Components

**Findings:** (Current as of 2025-11-15)
| Dependency | Current | Latest | Status | Notes |
|------------|---------|--------|--------|-------|
| hono | 4.13.14 | 4.13.14 | ✅ Current | |
| zod | 4.6.6 | 4.6.6 | ✅ Current | |
| @hono/node-server | 2.1.6 | 2.1.6 | ✅ Current | Pinned via overrides |
| pg | 8.23.0 | 8.23.0 | ✅ Current | |
| jose | 6.2.12 | 6.2.12 | ✅ Current | Available for RS256 migration |
| bcrypt | 6.0.0 | 6.0.0 | ✅ Current | Not used for passwords (PBKDF2 used) |
| pino | 9.14.0 | 9.14.0 | ✅ Current | |
| dockerode | 5.0.1 | 5.0.1 | ✅ Current | |
| @modelcontextprotocol/sdk | 1.32.1 | 1.32.1 | ✅ Current | |
| undici | 6.29.1 | 6.29.1 | ✅ Current | Pinned via overrides |

**No known CVEs in current dependency versions.** Overrides are used to pin transitive dependencies (undici, glob, serialize-javascript, minimatch, diff).

### A07:2021 — Identification and Authentication Failures

**Findings:**
- **F-10**: MCP tool execution accepts `X-User-Id` header without verification when API key auth disabled — identity spoofing
- **F-09**: `/mcp/tools/list` exposes full tool catalog without authentication
- **F-13**: Token in URL query parameter — appears in access logs, browser history, Referer headers
- **Password hashing**: PBKDF2-SHA512 with 10,000 iterations — acceptable but Argon2id would be stronger
- **Session fixation protection**: User-agent binding implemented but **disabled for extension clients**
- **No account lockout** mechanism observed after failed login attempts
- **No MFA** support in current auth flow

### A08:2021 — Software and Data Integrity Failures

**Findings:**
- **Docker base image pinned by SHA256 digest** — ✅ Supply chain integrity
- **npm ci** used for hermetic dependency installation — ✅
- **No signed commits / SLSA provenance** verified in CI pipeline
- **MCP child servers** (markitdown-mcp, markdown-exporter-mcp-local) built from pinned git refs — ✅
- **setuptools upgraded to 84.0.0** in Python venvs to avoid CVE-2024-6345, CVE-2025-47273, CVE-2026-23949, CVE-2026-24049 — ✅
- **certifi upgraded to 2026.10.19**, **pillow to 13.0.0** in venvs — ✅

### A09:2021 — Security Logging and Monitoring Failures

**Findings:**
- **Audit logging** implemented via `recordAudit()` for login, logout, password change, user management, config changes — ✅
- **Query logging** for KB searches — ✅
- **Error handler** logs full error with path/method but returns generic message to client — ✅
- **Rate limit headers** (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) exposed — ✅
- **No centralized SIEM integration** — logs to stdout (pino) only
- **No alerting** on repeated auth failures or anomalous tool calls

### A10:2021 — Server-Side Request Forgery (SSRF)

**Findings:**
- **F-15**: `/api/admin/llm/test` makes outbound HTTP to configured `llm.baseUrl`. SSRF validation has bypass:
  - Config can be patched via `CONFIG_EDIT` to internal IPs
  - Cloud metadata endpoints (169.254.169.254, 100.64.0.0/10) not explicitly blocked
  - Private CIDRs (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) not blocked
- **Pega indexing** makes outbound requests to configured Pega endpoint — URL from user config, no SSRF validation observed
- **Atlassian/Jira integration** makes outbound requests — credentials from secret storage, endpoint from config

---

## Detailed Findings

### Finding #1: Unauthenticated Database Administration Endpoints

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔴 Critical |
| **OWASP Category** | A01:2021 Broken Access Control |
| **CWE** | CWE-306: Missing Authentication for Critical Function |
| **CVSS Score** | 9.1 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N) |
| **Location** | `backend/src/server/routes/database.ts` lines 33, 40, 63, 80, 86 |
| **Status** | Open |

**Description:**
Five database administration endpoints have **zero authentication**:
- `GET /api/admin/database/status` — exposes DB engine status, connection info
- `POST /api/admin/database/test-connection` — accepts arbitrary host, port, username, password (SSRF vector)
- `POST /api/admin/database/migrate` — triggers full DB migration (SSE stream)
- `POST /api/admin/database/migrate/cancel` — cancels running migration
- `POST /api/admin/database/switch-to-sqlite` — reconfigures active database engine

**Impact:**
- Attacker can probe internal network via `test-connection` (SSRF)
- Attacker can trigger disruptive migrations or engine switches
- Database credentials accepted without any identity verification

**Evidence:**
```typescript
// backend/src/server/routes/database.ts
app.get('/api/admin/database/status', (c) => { ... });           // line 33 — NO AUTH
app.post('/api/admin/database/test-connection', async (c) => { ... }); // line 40 — NO AUTH
app.post('/api/admin/database/migrate', async (c) => { ... });   // line 63 — NO AUTH
app.post('/api/admin/database/migrate/cancel', (c) => { ... });  // line 80 — NO AUTH
app.post('/api/admin/database/switch-to-sqlite', (c) => { ... }); // line 86 — NO AUTH
```

**Remediation:**
```typescript
import { createAdminContext } from './context.js';
// In route factory:
const ctx = createAdminContext(logger, registry);

app.get('/api/admin/database/status', async (c) => {
  const user = await ctx.requireAuth(c);
  if (user instanceof Response) return user;
  await ctx.requirePermission(c, user.userId, 'CONFIG_EDIT');
  // ... existing logic
});

app.post('/api/admin/database/test-connection', async (c) => {
  const user = await ctx.requireAuth(c);
  if (user instanceof Response) return user;
  await ctx.requirePermission(c, user.userId, 'CONFIG_EDIT');
  // ... existing logic + SSRF validation on host parameter
});
```

**References:**
- CWE-306: https://cwe.mitre.org/data/definitions/306.html
- OWASP A01:2021: https://owasp.org/Top10/A01_2021-Broken_Access_Control/

---

### Finding #2: Unauthenticated File Write Endpoints (`/api/index/*`)

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔴 Critical |
| **OWASP Category** | A01:2021 Broken Access Control + A03:2021 Injection |
| **CWE** | CWE-306, CWE-22 (Path Traversal) |
| **CVSS Score** | 8.8 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:L) |
| **Location** | `backend/src/server/routes/api-index.ts` lines 108, 117, 125 |
| **Status** | Open |

**Description:**
Three indexing endpoints accept file uploads and write to disk with **no authentication**:
- `POST /api/index/source` — indexes source code files
- `POST /api/index/document` — indexes single document
- `POST /api/index/documents` — batch document indexing

The `resolveUserId()` helper returns empty string on missing auth but **does not block** the request. Path traversal protection exists via `resolveWithinWorkspace()` but is defense-in-depth only.

**Impact:**
- Unauthenticated attackers can write arbitrary files to workspace
- Disk exhaustion DoS via mass uploads
- Workspace pollution with malicious content

**Evidence:**
```typescript
// backend/src/server/routes/api-index.ts
export function registerIndexRoutes(app: Hono, registry: ModuleRegistry, logger: Logger): void {
  app.post('/api/index/source', (c) => handleIndexSource(c, registry, logger));   // NO AUTH
  app.post('/api/index/document', (c) => handleIndexDocument(c, logger));          // NO AUTH
  app.post('/api/index/documents', (c) => handleIndexDocuments(c, logger));        // NO AUTH
}
```

**Remediation:**
```typescript
import { validateSession } from '../../admin/admin-db.js';

async function requireAuth(c: Context): Promise<{ userId: string } | null> {
  const auth = c.req.header('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;
  return await validateSession(token);
}

export function registerIndexRoutes(app: Hono, registry: ModuleRegistry, logger: Logger): void {
  app.post('/api/index/source', async (c) => {
    const session = await requireAuth(c);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);
    return handleIndexSource(c, registry, logger, session.userId);
  });
  // Repeat for document/documents
}
```

**References:**
- CWE-306: https://cwe.mitre.org/data/definitions/306.html
- CWE-22: https://cwe.mitre.org/data/definitions/22.html

---

### Finding #3: Unverified Identity in MCP Tool Execution

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟠 High |
| **OWASP Category** | A07:2021 Identification and Authentication Failures |
| **CWE** | CWE-290: Authentication Bypass by Spoofing |
| **CVSS Score** | 7.5 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N) |
| **Location** | `backend/src/server/routes/tools.ts` lines 45-53 |
| **Status** | Open |

**Description:**
When `CODE_INTEL_API_KEY` is not configured, the `stampUserId()` function accepts the `X-User-Id` header **without any cryptographic verification**:

```typescript
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

The code itself logs a warning acknowledging this weakness.

**Impact:**
- Any caller can spoof any `userId` (e.g., `X-User-Id: admin`)
- Tool authorization checks based on `__userId` can be bypassed
- Audit logs will attribute actions to spoofed identities

**Remediation:**
```typescript
import { verifyJwtToken } from '../../middleware/jwt-auth.js';

function stampUserId(c: Context, args: Args, logger: Logger): void {
  if (isApiKeyAuthEnabled()) {
    args.__userId = 'api-key-user';
    return;
  }
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (token) {
    const { valid, payload } = await verifyJwtToken(token);
    if (valid && payload?.sub) {
      args.__userId = payload.sub;
      return;
    }
  }
  args.__userId = '__anonymous__'; // Explicit sentinel
}
```

**References:**
- CWE-290: https://cwe.mitre.org/data/definitions/290.html

---

### Finding #4: Token Injection XSS via URL Query Parameter

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟠 High |
| **OWASP Category** | A02:2021 Cryptographic Failures + A03:2021 Injection |
| **CWE** | CWE-598, CWE-79 |
| **CVSS Score** | 7.1 (CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N) |
| **Location** | `backend/src/server/routes/admin/static.ts` lines 25-30 |
| **Status** | Open |

**Description:**
The admin SPA accepts a `?token=` query parameter and injects it directly into HTML via unsanitized string concatenation:

```typescript
const token = c.req.query('token');
if (token) {
  const injectScript = '<script>localStorage.setItem("admin_token","' + token + '");</script>';
  html = html.replace('</head>', injectScript + '</head>');
}
```

**Issues:**
1. Token in URL — logged in access logs, browser history, Referer headers
2. XSS vector — token value not escaped; `</script>` injection possible
3. CSRF — attacker can craft URL to plant token in victim's localStorage

**Remediation:**
```typescript
import { escapeHtml } from '../utils/sanitize.js';

const token = c.req.query('token');
if (token && /^[A-Za-z0-9._\-]+$/.test(token)) { // Strict whitelist
  const safe = escapeHtml(token);
  html = html.replace('</head>', `<script>localStorage.setItem("admin_token","${safe}");</script></head>`);
}
// Better: Remove URL token handoff entirely; use HTTP-only cookie or /api/admin/auth/token-exchange
```

**References:**
- CWE-598: https://cwe.mitre.org/data/definitions/598.html
- CWE-79: https://cwe.mitre.org/data/definitions/79.html

---

### Finding #5: SSRF Risk on LLM Test Endpoint

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟠 High |
| **OWASP Category** | A10:2021 SSRF + A01:2021 Broken Access Control |
| **CWE** | CWE-918 |
| **CVSS Score** | 7.7 (CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:N/A:N) |
| **Location** | `backend/src/server/routes/admin/config.ts` line 37 |
| **Status** | Open |

**Description:**
`POST /api/admin/llm/test` has authentication but **no permission check**. The SSRF validation has a bypass — the target URL comes from server-side config (`configOverrides`), which a user with `CONFIG_EDIT` can modify to point to internal endpoints:

```typescript
const base = llm.baseUrl || 'http://localhost:11434';
const isLocalUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(base);
if (llm.baseUrl && llm.baseUrl !== 'http://localhost:11434' && !isLocalUrl) {
  const urlCheck = validateExternalUrl(base);
  if (!urlCheck.valid) return c.json({ success: false, ... }, 400);
}
```

Cloud metadata IPs (169.254.169.254), private CIDRs (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), and link-local (169.254.0.0/16) are not blocked.

**Remediation:**
```typescript
// 1. Add permission check
const permCheck = await ctx.requirePermission(c, user.userId, 'CONFIG_EDIT');
if (permCheck instanceof Response) return permCheck;

// 2. Expand SSRF blocklist
const BLOCKED_CIDRS = [
  '169.254.169.254',           // AWS/GCP/Azure metadata
  '100.64.0.0/10',             // Carrier-grade NAT
  '10.0.0.0/8',                // RFC1918
  '172.16.0.0/12',             // RFC1918
  '192.168.0.0/16',            // RFC1918
  '169.254.0.0/16',            // Link-local
  '127.0.0.0/8',               // Loopback (beyond localhost)
  '::1',                       // IPv6 loopback
  'fe80::/10',                 // IPv6 link-local
];

function isBlockedIp(hostname: string): boolean {
  // Resolve hostname and check against CIDRs
  // Use 'ipaddr.js' or native dns.resolve4 + cidr matching
}
```

**References:**
- CWE-918: https://cwe.mitre.org/data/definitions/918.html
- OWASP SSRF: https://owasp.org/Top10/A10_2021-Server-Side_Request_Forgery_(SSRF)/

---

### Finding #6: Missing Authentication on Webview API Routes

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP Category** | A01:2021 Broken Access Control |
| **CWE** | CWE-306 |
| **CVSS Score** | 5.3 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:N) |
| **Location** | `backend/src/server/routes/api.ts` lines 17-67 |
| **Status** | Open |

**Description:**
All webview data endpoints in `api.ts` have zero authentication — no `requireAuth`, no JWT middleware. POST/PUT/DELETE tag endpoints are real write operations.

**Remediation:**
```typescript
import { jwtAuth } from '../middleware/jwt-auth.js';

export function createApiRoute(registry: ModuleRegistry, logger: Logger): Hono {
  const app = new Hono();
  app.use('*', jwtAuth); // Protect all endpoints
  // ... existing routes
}
```

---

### Finding #7: Unauthenticated MCP Tool Listing

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP Category** | A05:2021 Security Misconfiguration |
| **CWE** | CWE-200 |
| **CVSS Score** | 4.3 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N) |
| **Location** | `backend/src/server/routes/tools.ts` line 101 |
| **Status** | Open |

**Description:**
`GET /mcp/tools/list` exposes complete tool catalog (names, descriptions, inputSchema) without authentication.

**Remediation:**
```typescript
app.get('/mcp/tools/list', async (c) => {
  const auth = c.req.header('Authorization') || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  // Verify token...
  const tools = router.listTools();
  return c.json({ tools });
});
```

---

### Finding #8: Write Operation Behind Read-Only Permission

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP Category** | A01:2021 Broken Access Control |
| **CWE** | CWE-285 |
| **CVSS Score** | 4.9 (CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:L/A:L) |
| **Location** | `backend/src/server/routes/admin/kb-graph.ts` line 70 |
| **Status** | Open |

**Description:**
`POST /api/admin/kb/graph/sync` triggers full graph reset/resync but gated on `GRAPH_VIEW` (read permission).

**Remediation:**
```typescript
const permCheck = await ctx.requirePermission(c, user.userId, 'KB_WRITE'); // or 'CONFIG_EDIT'
```

---

### Finding #9: Missing HSTS Header

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP Category** | A05:2021 Security Misconfiguration |
| **CWE** | CWE-693 |
| **CVSS Score** | 3.7 (CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N) |
| **Location** | `backend/src/server/middleware/security-headers.ts` |
| **Status** | Open |

**Description:**
`Strict-Transport-Security` header not set. Server binds to 127.0.0.1 in production Docker, but header should be present for defense-in-depth.

**Remediation:**
```typescript
// In security-headers.ts
c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
```

---

### Finding #10: Weak Password Policy

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP Category** | A07:2021 Identification and Authentication Failures |
| **CWE** | CWE-521 |
| **CVSS Score** | 2.1 (CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N) |
| **Location** | `backend/src/server/routes/auth/login-routes.ts` line 18 |
| **Status** | Open |

**Description:**
Registration schema allows minimum 6-character passwords: `z.string().min(6)`. No complexity requirements (uppercase, lowercase, digit, symbol).

**Remediation:**
```typescript
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string()
    .min(12)
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[a-z]/, 'Must contain lowercase')
    .regex(/[0-9]/, 'Must contain digit')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
  username: z.string().optional()
});
```

---

### Finding #11: CSP Allows `unsafe-inline` and `unsafe-eval`

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP Category** | A05:2021 Security Misconfiguration |
| **CWE** | CWE-693 |
| **CVSS Score** | 3.1 (CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N) |
| **Location** | `backend/src/server/middleware/security-headers.ts` lines 25-28 |
| **Status** | Open |

**Description:**
CSP allows `'unsafe-inline'` and `'unsafe-eval'` for admin SPA (Babel + inline scripts + CDN libs). This weakens XSS protection.

**Remediation:**
- Move inline scripts to external files
- Use nonce-based CSP for inline scripts
- Remove `'unsafe-eval'` by pre-compiling templates

---

### Finding #12: Health Endpoint Information Disclosure

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP Category** | A05:2021 Security Misconfiguration |
| **CWE** | CWE-200 |
| **CVSS Score** | 2.7 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N) |
| **Location** | `backend/src/server/routes/health.ts` line 18 |
| **Status** | Open |

**Description:**
`GET /health` returns version, uptime, module status, tool count to unauthenticated callers.

**Remediation:**
```typescript
app.get('/health', async (c) => {
  const auth = c.req.header('Authorization');
  const detailed = auth ? true : false; // Minimal for anon, detailed for auth
  return c.json(detailed ? fullStatus : { status: 'healthy' });
});
```

---

## Dependency Vulnerabilities

| Dependency | Current Version | CVE | Severity | Fixed In |
|-----------|----------------|-----|----------|----------|
| (none) | — | No known CVEs in current versions | — | — |

**Note:** All dependencies are current as of 2025-11-15. Overrides pin transitive dependencies to versions without known CVEs.

---

## Security Headers Assessment

| Header | Status | Recommendation |
|--------|--------|----------------|
| Strict-Transport-Security | ❌ Missing | Add `max-age=31536000; includeSubDomains; preload` |
| Content-Security-Policy | ⚠️ Present (weak) | Remove `unsafe-inline`/`unsafe-eval`; use nonces |
| X-Content-Type-Options | ✅ Present | `nosniff` — good |
| X-Frame-Options | ❌ Removed | CSP `frame-ancestors` used instead; consider adding header |
| X-XSS-Protection | ✅ Present | `1; mode=block` — legacy but harmless |
| Referrer-Policy | ✅ Present | `strict-origin-when-cross-origin` — good |
| Permissions-Policy | ✅ Present | `camera=(), microphone=(), geolocation=()` — good |

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
| 13 | HSTS header missing | Low | Transport security |
| 14 | Weak password policy | Low | Credential strength |
| 15 | CSP unsafe-inline/eval | Medium | XSS protection |

---

## Recommendations Summary

### Immediate Actions (Critical/High)
1. **Add authentication to `/api/index/*` endpoints** — highest impact, lowest effort
2. **Add authentication + `CONFIG_EDIT` permission to all `/api/admin/database/*` endpoints**
3. **Fix MCP tool execution identity verification** — require JWT validation
4. **Remove token injection from admin SPA** — use HTTP-only cookie or token exchange endpoint
5. **Add `CONFIG_EDIT` permission check + expanded SSRF blocklist to `/api/admin/llm/test`**

### Short-term Improvements (Medium)
6. **Add authentication to `/api/*` webview routes** (apply `jwtAuth` middleware)
7. **Add authentication to `/mcp/tools/list` and `/mcp/tools/call`**
8. **Fix `/api/admin/kb/graph/sync` permission** (change to `KB_WRITE`)
9. **Implement account lockout** after failed login attempts
10. **Add HSTS header** to security headers middleware

### Long-term Hardening (Low/Informational)
11. **Migrate JWT to RS256** for public-facing token validation (use `jose` library already in deps)
12. **Strengthen password policy** (min 12 chars + complexity)
13. **Refactor CSP** to remove `unsafe-inline`/`unsafe-eval` (nonce-based)
14. **Implement MFA** support (TOTP/WebAuthn)
15. **Add distributed rate limiting** (Redis-backed) for multi-instance deployments
16. **Centralize audit logs** to SIEM; add alerting on auth anomalies

---

## Appendix

### A. Tools & Methodology
- Static code analysis (manual review of TypeScript source)
- Dependency version checking via `package.json` and `package-lock.json`
- Configuration review (Dockerfile, docker-compose, security headers middleware)
- OWASP Testing Guide v4.2 methodology
- CWE/CVSS v3.1 scoring

### B. Scope Limitations
- **Static analysis only** — no runtime testing, no actual exploitation attempted
- `/api/index/*` routes may be intentionally internal (called by IDE extension) — if protected by network-level controls (localhost only), severity may be reduced in practice
- `/health` and `/mcp/tools/list` may be intentionally public depending on deployment model
- `routes/database.ts` (non-admin path) may be disabled in production via feature flags — not verified
- Extension (frontend) code reviewed for auth flow only; full extension security audit out of scope
- Infrastructure/network security (firewall, VPC, TLS termination) not assessed

### C. Glossary
- **CVSS**: Common Vulnerability Scoring System
- **CWE**: Common Weakness Enumeration
- **OWASP**: Open Web Application Security Project
- **SSRF**: Server-Side Request Forgery
- **CSP**: Content Security Policy
- **HSTS**: HTTP Strict Transport Security
- **PBKDF2**: Password-Based Key Derivation Function 2
- **HS256/RS256**: HMAC-SHA256 / RSA-SHA256 (JWT algorithms)
- **RBAC**: Role-Based Access Control
- **MCP**: Model Context Protocol

---

*Report generated by Security Agent — static code review only*