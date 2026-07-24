# 🔒 Security Design Review

## Document Information

| Field | Value |
|-------|-------|
| Ticket | SA4E-55 |
| Title | Security Design Review — Authentication/Authorization Hotfix |
| Reviewer | Security Agent |
| Date | 2026-07-23 |
| TDD Version | 1.0 |
| Review Type | Design Review (Static — TDD + Source Code) |

---

## Executive Summary

SA4E-55 implements a comprehensive security hotfix addressing 20 authentication/authorization vulnerabilities (F-01 to F-20) in the Code Intelligence MCP Server. The TDD design is **sound and thorough** and the implementation closely follows the documented patterns. The overall security posture is significantly improved.

**Critical findings: 0.** The design correctly addresses core vulnerabilities with fail-closed patterns, RBAC enforcement, XSS sanitization, and SSRF protection.

**High findings: 3** — design gaps not fully covered by the TDD that warrant remediation: JWT algorithm enforcement when `KB_TOKEN_SECRET` is unset, SSRF DNS rebinding not mitigated, and credentials exposed during DB migration password fallback.

**Overall Risk Rating:** 🟡 Medium (after SA4E-55 fixes; was Critical before)

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 3 |
| 🟡 Medium | 4 |
| 🔵 Low | 4 |
| ℹ️ Informational | 3 |

---

## Findings Summary Table

| ID | Title | Severity | Area | File | Status |
|----|-------|----------|------|------|--------|
| SR-01 | JWT accepted without signature verification when KB_TOKEN_SECRET unset | 🟠 High | JWT Security | `jwt-auth.ts:72` | Open |
| SR-02 | SSRF DNS rebinding not mitigated (hostname-only blocklist) | 🟠 High | SSRF Protection | `url-validator.ts` | Open |
| SR-03 | Saved DB password exposed via migration password-fallback logic | 🟠 High | Data Protection | `admin/database.ts:135` | Open |
| SR-04 | `requireDatabaseAuth()` in routes/database.ts lacks CONFIG_EDIT permission check | 🟡 Medium | Authorization | `database.ts:28` | Open |
| SR-05 | Session token not validated before body parsing in `database.ts` migrate endpoint | 🟡 Medium | Auth Design | `database.ts:81` | Open — Fixed by design |
| SR-06 | Token regex allowlist in XSS sanitization admits `.` — JWT dots vs malformed input | 🟡 Medium | XSS | `static.ts:24` | Informational Risk |
| SR-07 | `page` query param injected into HTML without sanitization | 🟡 Medium | XSS | `static.ts:29` | Open |
| SR-08 | Rate limiter ineffective without TRUST_PROXY=true (all requests appear as 127.0.0.1) | 🔵 Low | DoS Protection | `rate-limiter.ts:22` | Open |
| SR-09 | CSP allows `unsafe-eval` and external CDN scripts | 🔵 Low | Security Headers | `security-headers.ts:24` | Open |
| SR-10 | HSTS header missing | 🔵 Low | Security Headers | `security-headers.ts` | Open |
| SR-11 | Session token stored in plaintext in SQLite sessions table | 🔵 Low | Data Protection | `schema.ts / sessions.ts` | Design Decision |
| SR-12 | PBKDF2 with 10,000 iterations — below modern recommendations | ℹ️ Info | Cryptography | `password.ts:5` | Informational |
| SR-13 | `resolveCallerIdentity()` order: API key mode bypasses session/JWT for all callers | ℹ️ Info | Auth Design | `tools.ts:33` | Design Decision |
| SR-14 | Admin impersonation (`X-Impersonate` header) not audited in audit_log | ℹ️ Info | Audit Logging | `context.ts:50` | Open |

---

## Review: 2. JWT Security


## Review: 1. Authentication / Authorization Design

### Verified Correct

- **`requireAuth()` in `api-index.ts`** — Auth check before body parsing. Fail-closed (returns null). `userId` threaded to `registerProjectPhase()` as `createdBy`. ✅ F-06/07/08 fixed.
- **`requireDatabaseAuth()` in `routes/database.ts`** — Session validation correct. SSE only opened after auth passes (BR-08). ✅ F-01/03/04/05 fixed.
- **`authGuard()` in `admin/database.ts`** — `ctx.requireAuth()` + `ctx.requirePermission(CONFIG_EDIT)` composed correctly. ✅ F-18/19/20 fixed.
- **`resolveCallerIdentity()` in `tools.ts`** — API key → session → JWT order correct. `X-User-Id` demoted to dev-mode fallback with WARNING. Reserved scope key stripping unconditional. ✅ F-09/10 fixed.
- **`authGuard()` in `admin/kb-graph.ts`** — Graph sync elevated to `RBAC_MANAGE`. ✅ F-17 fixed.
- **`authGuard()` in `admin/config.ts`** — Both LLM endpoints require CONFIG_EDIT. ✅ F-14/15 fixed.

### 🟠 SR-04: `requireDatabaseAuth()` in `routes/database.ts` — session only, no CONFIG_EDIT check

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium (design discrepancy — actual risk depends on routing) |
| **OWASP** | A01:2021 Broken Access Control |
| **CWE** | CWE-285: Improper Authorization |
| **File** | `backend/src/server/routes/database.ts:28` |

TDD §3.2 describes `requireDatabaseAuth()` as session-only while BRD Story 2 (BR-06) requires CONFIG_EDIT on all 8 database endpoints. The routes module path (`/api/admin/database/*`) only validates session presence, while the admin module path (`admin/routes/database.ts`) correctly enforces CONFIG_EDIT. Any authenticated user (including `grp-dev` or `grp-viewer`) can trigger database migrations via the routes module.

```typescript
// VULNERABLE — routes/database.ts
async function requireDatabaseAuth(c: Context) {
  return await validateSession(token) ?? null; // No CONFIG_EDIT check
}

// CORRECT — admin/routes/database.ts
async function authGuard(c: any) {
  const perm = await ctx.requirePermission(c, user.userId, 'CONFIG_EDIT'); // ✅
}
```

**Remediation:** Either add CONFIG_EDIT check to `requireDatabaseAuth()`, or consolidate both route files into one (admin module path) and remove `routes/database.ts`.

---

## Review: 2. JWT Security

### Verified Correct

- HS256 via Node.js built-in `crypto` — no external JWT library CVE surface.
- `isExpired()` checks `exp` claim before accepting payload.
- JWT `pid`/`pids` enforced against `X-Project-Id` header via `verifyProjectBinding()`. ✅
- Startup validation: if `REQUIRE_AUTH=true` and `KB_TOKEN_SECRET` unset → throws. ✅

### 🟠 SR-01: JWT accepted without signature verification when KB_TOKEN_SECRET is unset

| Attribute | Value |
|-----------|-------|
| **Severity** | High |
| **OWASP** | A07:2021 Identification and Authentication Failures |
| **CWE** | CWE-347: Improper Verification of Cryptographic Signature |
| **CVSS** | 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N) |
| **File** | `backend/src/server/middleware/jwt-auth.ts:72` |

In `verifyJwtToken()`, the HMAC check runs only inside `if (TOKEN_SECRET)`. If `KB_TOKEN_SECRET` is not set, **any well-formed 3-part JWT with a non-expired `exp` claim is accepted** regardless of signature. An attacker can forge `{ "sub": "admin", "pid": "any-project" }` and bypass identity verification.

```typescript
// VULNERABLE
if (TOKEN_SECRET) {                  // ← skipped if secret not configured
  const ok = await verifyHs256(...);
  if (!ok) return { valid: false, ... };
}
const payload = decodeJwtPayload(token); // attacker-controlled payload accepted
```

**Remediation:**
```typescript
// FIXED — reject JWT when no secret is configured
if (!TOKEN_SECRET) return { valid: false, payload: null }; // new guard
const ok = await verifyHs256(token, TOKEN_SECRET);
if (!ok) return { valid: false, payload: null };
```

The TDD §7.1 does not document this edge case. TDD should be updated to explicitly state: "JWT is only accepted when `KB_TOKEN_SECRET` is set."

---

## Review: 3. XSS Mitigation

### Verified Correct

The token sanitization in `admin/static.ts` exactly matches the TDD §7.3 design:
- Regex `/[^A-Za-z0-9\-_.]/g` strips all characters outside the allowlist. ✅
- Empty token after sanitization → no `<script>` block injected. ✅
- Attack vectors documented in TDD §7.3 are all blocked. ✅ F-13 fixed.

### 🟡 SR-07: `page` query parameter injected into HTML without sanitization

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP** | A03:2021 Injection — XSS |
| **CWE** | CWE-79: Improper Neutralization of Input During Web Page Generation |
| **CVSS** | 6.1 (AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N) |
| **File** | `backend/src/server/routes/admin/static.ts:29` |

The `page` query parameter is injected into the HTML via string replacement without sanitization:

```typescript
if (page) {
  // UNSANITIZED injection into HTML
  html = html.replace("useState('dashboard')", "useState('" + page + "')");
}
```

A crafted URL like `/admin?page=');alert(document.cookie)//` could inject JavaScript into the page if the HTML template uses `innerHTML` or an equivalent.

**Remediation:**
```typescript
if (page) {
  // Sanitize: only allow alphanumeric and dash/underscore (valid page names)
  const safePage = page.replace(/[^A-Za-z0-9\-_]/g, '');
  if (safePage) {
    html = html.replace("useState('dashboard')", `useState('${safePage}')`);
  }
}
```

**Note:** The TDD §7.3 only covers the `token` parameter — this finding is absent from the TDD. The TDD should add sanitization for the `page` parameter.

### 🔵 SR-06: Token regex admits `.` which is technically unnecessary for hex session tokens

| Attribute | Value |
|-----------|-------|
| **Severity** | Low / Informational |
| **File** | `backend/src/server/routes/admin/static.ts:24` |

The allowlist `[A-Za-z0-9\-_.]` includes `.` for JWT segment separators. Session tokens are hex strings (no dot needed). The dot is safe here but slightly widens the allowlist beyond what session tokens require. Informational only — no exploitable risk given the overall sanitization removes quotes and brackets.

---

## Review: 4. SSRF Protection

### Verified Correct

`validateExternalUrl()` blocks RFC1918 ranges, loopback, link-local (169.254.x.x for cloud metadata), and IPv6 private ranges. Applied to LLM test endpoint. SSRF blocked returns HTTP 200 `{ success: false }` to avoid distinguishing internal vs refused connections. ✅ F-15 fixed.

### 🟠 SR-02: SSRF DNS rebinding not mitigated

| Attribute | Value |
|-----------|-------|
| **Severity** | High |
| **OWASP** | A10:2021 Server-Side Request Forgery |
| **CWE** | CWE-918: Server-Side Request Forgery |
| **CVSS** | 7.2 (AV:N/AC:H/PR:H/UI:N/S:C/C:H/I:L/A:N) |
| **File** | `backend/src/server/middleware/url-validator.ts` |

`validateExternalUrl()` checks the hostname string but does **not perform DNS resolution** before checking. An attacker who controls a domain (e.g., `attacker.com`) can configure DNS to initially return a public IP (passes the check) and then re-bind to an internal IP after the check completes (DNS TTL 0). This technique bypasses hostname-based SSRF blocklists.

Additionally, the localhost exemption for Ollama (`http://localhost:11434`) is applied via regex in `config.ts` before `validateExternalUrl()` is called — this is correct but not documented in `url-validator.ts` itself.

**Impact:** An admin with `CONFIG_EDIT` permission can probe internal services by controlling their own DNS.

**Remediation options** (TDD should document chosen approach):
1. **DNS pre-resolution + re-check** — resolve the hostname to IP, then run `isPrivateIp()` against the resolved IP before making the HTTP request.
2. **Outbound proxy** — route all LLM/DB test calls through a proxy that enforces IP restrictions at the network level.
3. **Documented risk acceptance** — if the server is expected to be internal-only (localhost-based dev tool), document the DNS rebinding risk as accepted since admin access itself implies significant privilege.

```typescript
// Option 1: DNS pre-resolution approach (Node.js dns.promises)
import { promises as dns } from 'dns';

export async function validateExternalUrlWithDns(rawUrl: string): Promise<UrlValidationResult> {
  const result = validateExternalUrl(rawUrl); // hostname check first
  if (!result.valid) return result;
  try {
    const parsed = new URL(rawUrl);
    const addresses = await dns.resolve4(parsed.hostname);
    for (const ip of addresses) {
      if (isPrivateIp(ip)) return { valid: false, error: `Resolved to private IP: ${ip}` };
    }
  } catch { /* DNS failure = block */ return { valid: false, error: 'DNS resolution failed' }; }
  return { valid: true };
}
```

---

## Review: 5. Data Protection

### Verified Correct

- **LLM API key masking** — `apiKey: process.env.LLM_API_KEY ? '***' : ''` in `config.ts`. ✅ F-15 / BR-23 satisfied.
- **`created_by` isolation** — `registerProject()` uses INSERT ... ON CONFLICT DO UPDATE that does NOT update `created_by` (first-write-wins). ✅ F-16 ownership immutable.
- **Session token generation** — `crypto.randomBytes(32).toString('hex')` = 256 bits entropy. Cryptographically secure. ✅
- **Password hashing** — PBKDF2-SHA512 with random salt. Timing-safe comparison via `timingSafeEqual`. ✅
- **API key comparison** — `timingSafeEqual` used in `api-key-auth.ts`. ✅

### 🟠 SR-03: Saved database password exposed via migration password-fallback

| Attribute | Value |
|-----------|-------|
| **Severity** | High |
| **OWASP** | A02:2021 Cryptographic Failures |
| **CWE** | CWE-312: Cleartext Storage of Sensitive Information |
| **CVSS** | 7.1 (AV:L/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:N) |
| **File** | `backend/src/server/routes/admin/database.ts:130-140` |

The migration route contains a password fallback that reads the saved plaintext password from `database.json` when the client sends an empty or placeholder password:

```typescript
// RISK: reads plaintext password from database.json
if (!password || password === '••••••••••••••••••••' || password.length < 2) {
  const savedConfig = configService.load();
  const savedEngine = savedConfig.engines[engine as 'postgresql' | 'mysql'];
  if (savedEngine?.password) {
    password = savedEngine.password;  // ← plaintext credential from file
  }
}
```

The TDD §7.8 acknowledges `database.json` stores passwords in plaintext (labeled "operator responsibility") but does not document this fallback. The concern is:
1. The fallback means a user who can send a migrate request (with CONFIG_EDIT) can cause the server to use a saved credential they cannot directly read.
2. The plaintext storage itself is a risk if the file is readable by other processes or backed up without encryption.

**Remediation:**
- Document this behavior explicitly in the TDD as an accepted risk or address it.
- Consider storing DB passwords encrypted at rest (e.g., using an app-level key derived from a master secret).
- At minimum, log a warning when the fallback is used.

### 🔵 SR-11: Session tokens stored in plaintext in SQLite sessions table

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP** | A02:2021 Cryptographic Failures |
| **CWE** | CWE-312: Cleartext Storage |
| **File** | `backend/src/admin/db/schema.ts`, `sessions.ts` |

Session tokens are stored and queried in plaintext (no hash). If the SQLite file is accessed by a malicious process or included in a backup, all active session tokens are compromised.

The TDD §7.8 notes this as "operator responsibility" but does not explicitly acknowledge the plaintext token storage. Best practice is to store `SHA-256(token)` in the DB and compare hashes on lookup.

**Remediation (recommended for defense-in-depth):**
```typescript
// Store only hash in DB, compare hash on lookup
const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
// SELECT WHERE token_hash = ?
```

---

## Review: 6. API Security

### Verified Correct

- **Zod validation** on `connectionSchema` (host, port 1-65535, engine enum). ✅ BR-07 satisfied.
- **Body limit** — `bodyLimit({ maxSize: 100MB })` applied globally. ✅
- **Rate limiter** — `rateLimiter` applied to `/api/admin/*` and `/api/admin/auth/login`. ✅
- **Error handling** — `createErrorHandler` middleware prevents raw stack trace leakage. ✅
- **Content-Type enforcement** — Hono's JSON parsing rejects non-JSON bodies. ✅
- **Input validation on index endpoints** — `Array.isArray(files)` check before processing. ✅

### 🟡 SR-05: (Addressed) Body parsed before auth in migrate — design confirms it's fixed

Reviewed `routes/database.ts:81` — the migrate endpoint correctly calls `requireDatabaseAuth()` before `c.req.json()`. ✅ Confirmed BR-08 satisfied.

### 🔵 SR-08: Rate limiter ineffective without TRUST_PROXY=true

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP** | A04:2021 Insecure Design |
| **CWE** | CWE-799: Improper Control of Interaction Frequency |
| **File** | `backend/src/server/middleware/rate-limiter.ts:22` |

When `TRUST_PROXY` is not set to `true`, all requests are attributed to `127.0.0.1`, making the rate limiter track a single counter for all callers. This means:
1. In production behind a reverse proxy (nginx, Traefik), the limit effectively applies to the entire application.
2. A single malicious client can consume all remaining capacity before others are blocked.

The TDD does not specify rate limiter configuration requirements or document the `TRUST_PROXY` dependency.

**Remediation:**
```typescript
// Rate limiter default should fail-safe: warn if TRUST_PROXY not set and running in production
if (process.env.NODE_ENV === 'production' && process.env.TRUST_PROXY !== 'true') {
  logger.warn('TRUST_PROXY not set — rate limiter is tracking all IPs as 127.0.0.1');
}
```

---

## Review: 7. Infrastructure / Secrets Management

### Verified Correct

- `CODE_INTEL_API_KEY` — read from `process.env`, never logged, timing-safe comparison. ✅
- `KB_TOKEN_SECRET` — read from `process.env`, never returned in any API response. ✅
- `LLM_API_KEY` — masked as `***` in all API responses. ✅ F-15 / BR-23.
- Admin initial password: uses `ADMIN_INITIAL_PASSWORD` env var or `crypto.randomBytes(18)` — printed to stdout once at first run, not stored in logs. ✅
- No hardcoded credentials found in source code. ✅

### ℹ️ SR-12: PBKDF2 with 10,000 iterations — below modern OWASP recommendations

| Attribute | Value |
|-----------|-------|
| **Severity** | Informational |
| **OWASP** | A02:2021 Cryptographic Failures |
| **CWE** | CWE-916: Use of Password Hash With Insufficient Computational Effort |
| **File** | `backend/src/admin/db/password.ts:5` |

OWASP recommends PBKDF2-SHA512 with **at least 210,000 iterations** (2023 guidance). The current implementation uses 10,000 iterations, which is 21x below the recommended minimum. This reduces brute-force cost if the database is compromised.

**Remediation:**
```typescript
const PBKDF2_ITERATIONS = 210_000; // OWASP 2023 recommendation for SHA-512
const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 64, 'sha512').toString('hex');
```

Alternatively, migrate to **bcrypt** (cost factor 12) or **Argon2id** which are purpose-built for password hashing.

---

## Review: 8. Security Headers

### Verified Correct

- `X-Content-Type-Options: nosniff` ✅
- `X-XSS-Protection: 1; mode=block` ✅ (legacy)
- `Referrer-Policy: strict-origin-when-cross-origin` ✅
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` ✅
- `X-Powered-By` removed from responses ✅
- CSP present with `object-src 'none'`, `base-uri 'self'`, `frame-ancestors` not set (but this is a local dev tool). ✅

### 🔵 SR-09: CSP allows `unsafe-eval` and CDN scripts

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP** | A05:2021 Security Misconfiguration |
| **File** | `backend/src/server/middleware/security-headers.ts:24` |

Current CSP: `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net`

`unsafe-eval` enables `eval()`, `new Function()`, and dynamic code execution — negating much of the XSS protection that CSP provides. External CDN sources add supply chain risk (CDN compromise = XSS).

This is partially mitigated by the SPA being a local admin tool. However, the design should document why `unsafe-eval` is required (Babel transpilation in the admin SPA) and track this as tech debt to eliminate.

### 🔵 SR-10: HSTS header missing

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP** | A05:2021 Security Misconfiguration |
| **CWE** | CWE-523: Unprotected Transport of Credentials |
| **File** | `backend/src/server/middleware/security-headers.ts` |

`Strict-Transport-Security` is absent from the security headers middleware. While this server likely runs locally (HTTP), if TLS is ever configured, HSTS should be present to prevent protocol downgrade.

**Remediation:**
```typescript
// Add to security-headers.ts — conditional on HTTPS
if (c.req.url.startsWith('https://')) {
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
```

---

## Review: 9. MCP Protocol Security

### Verified Correct

- Tool listing requires authentication (`resolveCallerIdentity()`). ✅ F-09 fixed.
- `POST /mcp/tools/call` does not require explicit per-tool RBAC (by design — `MCP_ACCESS` is the gate).
- Reserved scope keys stripped unconditionally. ✅ F-10 fixed.
- JWT project binding enforced. ✅
- Tool existence checked before execution (404 for unknown tools). ✅

### ℹ️ SR-13: API key mode bypasses all RBAC for MCP tool calls

| Attribute | Value |
|-----------|-------|
| **Severity** | Informational (Design Decision) |
| **File** | `tools.ts:33` |

When `CODE_INTEL_API_KEY` is set, `resolveCallerIdentity()` returns `{ userId: 'api-key-user', apiKey: true }` and the RBAC filter in `tools/list` is skipped entirely. The TDD documents this as intentional (BR-16: "API key callers receive full unfiltered list"). Acceptable for a single-tenant dev tool, but should be reconsidered if multi-tenant deployments use API keys.

### ℹ️ SR-14: Admin impersonation via X-Impersonate header not audited

| Attribute | Value |
|-----------|-------|
| **Severity** | Informational |
| **File** | `backend/src/server/routes/admin/context.ts:50` |

`authenticate()` in `context.ts` supports impersonation via the `X-Impersonate` header when the caller has `RBAC_MANAGE`. Impersonation events are not written to `audit_log`. Actions taken while impersonating appear under the target user's identity with no trace of the impersonator.

**Remediation:** Log impersonation events to `audit_log` table:
```typescript
if (impersonateId) {
  await recordAudit(session.userId, session.username, 'IMPERSONATE',
    'user', impersonateId, JSON.stringify({ target: impersonateId }));
}
```

---

## Review: 10. Dependency Vulnerability Analysis

| Dependency | Version Pinned | Known CVEs | Notes |
|-----------|---------------|------------|-------|
| `hono` | ^4.0.0 | None known | Actively maintained. ✅ |
| `better-sqlite3` | ^11.10.0 | None known | Synchronous, in-process — no network attack surface. ✅ |
| `zod` | ^3.23.0 | None known | Input validation library. ✅ |
| `pino` | ^9.2.0 | None known | ✅ |
| `@modelcontextprotocol/sdk` | ^1.29.0 | None known | MCP protocol — actively maintained. ✅ |
| `pg` | ^8.22.0 | None known | PostgreSQL client. SSL optional (ssl: false by default — ⚠️ see note). |
| `@xenova/transformers` | ^2.0.1 | None known | ML library — large attack surface via model loading. ⚠️ |
| `onnxruntime-node` | ^1.18.0 | None known | Native binary loading. ⚠️ |
| `chokidar` | ^5.0.0 | None known | ✅ |

**Notes:**
- All dependencies use caret (`^`) ranges. In production, pin exact versions to prevent unexpected upgrades via `npm install`.
- `pg` SSL defaults to `false` in connection schema — ensure production DB connections use `ssl: true`.
- No dependencies with known CVEs identified. Recommend running `npm audit` as part of CI pipeline.

---

## Remediation Priority

| Priority | ID | Finding | Effort | Impact |
|----------|-----|---------|--------|--------|
| 1 | SR-01 | JWT accepted without signature verification when KB_TOKEN_SECRET unset | Low | High — identity forgery |
| 2 | SR-07 | `page` param injected into HTML unsanitized | Low | Medium — reflected XSS |
| 3 | SR-04 | `requireDatabaseAuth()` missing CONFIG_EDIT check | Low | Medium — privilege escalation to DB ops |
| 4 | SR-02 | SSRF DNS rebinding not mitigated | Medium | High — internal reachability (CVSS 7.2) |
| 5 | SR-03 | DB password exposed via migration fallback | Medium | High — credential exposure |
| 6 | SR-14 | Impersonation not audited | Low | Medium — audit gap |
| 7 | SR-08 | Rate limiter ineffective without TRUST_PROXY | Low | Low — DoS risk |
| 8 | SR-10 | HSTS missing | Low | Low — protocol downgrade |
| 9 | SR-09 | CSP allows unsafe-eval | Medium | Low for local tool |
| 10 | SR-11 | Session tokens plaintext in SQLite | Medium | Low — requires file access |
| 11 | SR-12 | PBKDF2 10k iterations | Low | Low — hash hardening |

---

## Recommendations Summary

### Immediate Actions (Before or During Implementation)

1. **SR-01** — Add `if (!TOKEN_SECRET) return { valid: false, payload: null }` guard to `verifyJwtToken()`. One-line fix.
2. **SR-07** — Sanitize `page` query param with same allowlist pattern as `token` in `static.ts`.
3. **SR-04** — Reconcile `requireDatabaseAuth()` in `routes/database.ts` to also enforce `CONFIG_EDIT`, matching `admin/database.ts`.

### Short-term Improvements

4. **SR-02** — Document DNS rebinding risk in TDD §7.4. Implement async DNS pre-resolution in `validateExternalUrl()` or add to known limitations.
5. **SR-03** — Document DB password fallback behavior in TDD §7.8. Add a warning log when fallback activates.
6. **SR-14** — Add `recordAudit()` call for impersonation events in `context.ts`.
7. **SR-08** — Add startup warning when `NODE_ENV=production` and `TRUST_PROXY` is not set.

### Long-term Hardening

8. **SR-11** — Store `SHA-256(token)` instead of plaintext in sessions table.
9. **SR-10** — Add conditional HSTS header for HTTPS deployments.
10. **SR-12** — Increase PBKDF2 iterations to 210,000 or migrate to Argon2id.
11. **SR-09** — Track `unsafe-eval` in CSP as tech debt; remove when admin SPA build is updated.
12. Enforce exact dependency versions in `package.json` for production builds.

---

## Positive Security Findings (What the Design Gets Right)

The following security controls in SA4E-55 are **well-designed and correct**:

- ✅ **Fail-closed authentication** — all auth helpers return null/Response, never throw or bypass
- ✅ **Body-before-auth prevention** — auth checked before `c.req.json()` in all modified routes
- ✅ **Timing-safe API key comparison** — `timingSafeEqual` used in `api-key-auth.ts`
- ✅ **Reserved scope key stripping** — unconditional, cannot be bypassed by client
- ✅ **First-write-wins ownership** — `ON CONFLICT DO UPDATE` does not overwrite `created_by`
- ✅ **SSRF basic protection** — RFC1918 + 169.254.x.x (cloud metadata) + IPv6 private ranges
- ✅ **LLM API key masking** — never exposed in GET responses
- ✅ **XSS token sanitization** — correct allowlist, empty token = no script injection
- ✅ **JWT project binding** — `pid`/`pids` claims enforced against `X-Project-Id`
- ✅ **Session entropy** — `crypto.randomBytes(32)` = 256-bit tokens
- ✅ **Audit logging** — config changes and sensitive operations written to `audit_log`

---

## Scope Limitations

- This is a **static design review** based on TDD + source code analysis. No dynamic testing was performed.
- Network-level controls (firewall rules, TLS termination, reverse proxy config) were not assessed.
- The `@xenova/transformers` and `onnxruntime-node` libraries load model files from disk — model poisoning/supply-chain risks were not assessed.
- Session token entropy is sufficient but the session table schema (`sessions.ts`) does not enforce per-device session limits.

---

## Appendix: Files Reviewed

| File | Purpose |
|------|---------|
| `documents/SA4E-55/TDD.md` | Technical design document |
| `backend/src/server/routes/api-index.ts` | Index endpoints auth |
| `backend/src/server/routes/database.ts` | DB routes auth |
| `backend/src/server/routes/tools.ts` | MCP tools auth + RBAC |
| `backend/src/server/routes/admin/config.ts` | LLM endpoints + SSRF |
| `backend/src/server/routes/admin/static.ts` | XSS sanitization |
| `backend/src/server/routes/admin/kb-graph.ts` | Graph sync RBAC |
| `backend/src/server/routes/admin/index.ts` | Workspace isolation |
| `backend/src/server/routes/admin/context.ts` | AdminContext auth helpers |
| `backend/src/server/routes/admin/database.ts` | Admin DB auth |
| `backend/src/server/middleware/jwt-auth.ts` | JWT verification |
| `backend/src/server/middleware/url-validator.ts` | SSRF protection |
| `backend/src/server/middleware/api-key-auth.ts` | API key auth |
| `backend/src/server/middleware/security-headers.ts` | HTTP security headers |
| `backend/src/server/middleware/rate-limiter.ts` | Rate limiting |
| `backend/src/server/HttpServer.ts` | Middleware registration |
| `backend/src/admin/db/schema.ts` | DB schema + migrations |
| `backend/src/admin/db/sessions.ts` | Session management |
| `backend/src/admin/db/password.ts` | Password hashing |
| `backend/package.json` | Dependency versions |
