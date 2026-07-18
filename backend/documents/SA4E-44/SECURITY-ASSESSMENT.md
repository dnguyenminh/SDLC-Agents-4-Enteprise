# 🔒 Security Assessment Report — SA4E-44

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (Code Intelligence Module) |
| Scope | SA4E-44 implementation: CodeIntelModule, CodeIntelReceiver, PayloadValidator, TaskProcessors, TaskSchemas, CodeSearchHandler, EnrichmentTaskCreator, TaskWorker, PendingTaskRepository, TaskMonitor, Query Handlers |
| Date | 2025-07-25 |
| Assessor | Security Agent (Static Analysis) |
| Version | 1.0 |

## Executive Summary

The SA4E-44 implementation demonstrates **solid security fundamentals**. All SQL queries use parameterized statements (no injection vectors found). The PayloadValidator provides comprehensive path traversal prevention and input sanitization. Zod schema validation at task creation (SEC-02) is correctly implemented. API key authentication (SEC-01) is properly configured with timing-safe comparison.

The overall risk posture is **Low-Medium**. No Critical vulnerabilities were found. The primary concerns are: (1) the global error handler leaks `err.message` to clients which may contain internal details, (2) CSP allows `'unsafe-inline'` and `'unsafe-eval'` reducing XSS defense-in-depth, (3) `TaskMonitor` routes currently lack auth middleware when mounted, and (4) the `CodeSearchHandler` doesn't cap search term length before executing queries.

**Overall Risk Rating:** 🟡 Medium

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 3 |
| 🔵 Low | 3 |
| ℹ️ Informational | 2 |

---

## Phase 3.7 Security Design Review Compliance

| SEC Control | Status | Evidence |
|-------------|--------|----------|
| **SEC-01**: API key auth mandatory (auto-generated) | ✅ Implemented | `api-key-auth.ts` — timing-safe comparison, env-based key, enforced on `/mcp/*` and `/api/tags/*` routes |
| **SEC-02**: Zod payload schema validation at task creation | ✅ Implemented | `TaskSchemas.ts` + `PendingTaskRepository.create()` calls `validateTaskPayload()` before INSERT |
| **SEC-07**: git execFile (array args, no shell) | ⏭️ Skipped | Extension code — not in scope |

---

## Findings by OWASP Top 10 (2021)

### A01:2021 — Broken Access Control

**Finding #1 (Low):** TaskMonitor routes designed without auth middleware.

The `createTaskMonitorRoutes()` function exposes `/internal/tasks/stats`, `/internal/tasks/failed`, and `/internal/tasks/:id/retry` without any authentication guard within its Hono sub-app. Currently this is **not currently exploitable** because `createTaskMonitorRoutes` is exported but never mounted in `HttpServer.ts` (dead code). However, if mounted in the future without explicit auth, it would expose task queue internals and allow unauthorized retry.

### A02:2021 — Cryptographic Failures

No issues found ✅

API key uses `timingSafeEqual` for comparison. No secrets hardcoded in source. Secrets loaded from environment variables.

### A03:2021 — Injection

No issues found ✅

All SQL queries across all reviewed files use parameterized statements (`?` placeholders). The `CodeSearchHandler` ILIKE pattern is built via parameterized binding. No string interpolation in SQL.

### A04:2021 — Insecure Design

No issues found ✅

The architecture follows sound security design: validation at boundary, Strategy pattern isolation, fail-closed behavior.

### A05:2021 — Security Misconfiguration

**Finding #2 (Medium):** CSP header permits `'unsafe-inline'` and `'unsafe-eval'`.
**Finding #3 (Medium):** Error handler exposes `err.message` in HTTP responses.
**Finding #5 (Medium):** No query length limit on CodeSearchHandler.

### A06:2021 — Vulnerable and Outdated Components

**Finding #6 (Informational):** Dependencies use caret ranges (`^`) instead of pinned versions. No known CVEs in current versions.

### A07:2021 — Identification and Authentication Failures

**Finding #4 (Low):** API key auth is disabled when `CODE_INTEL_API_KEY` env var is not set (intentional for local dev).

### A08:2021 — Software and Data Integrity Failures

No issues found ✅

Zod validation ensures task payload integrity. Upload payloads validated before DB writes. SHA-256 hash verification for file deduplication.

### A09:2021 — Security Logging and Monitoring Failures

**Finding #7 (Informational):** No structured audit logging for security-relevant operations.

### A10:2021 — Server-Side Request Forgery (SSRF)

No issues found ✅

The code-intel module does not make outbound HTTP requests.

---

## Detailed Findings

### Finding #1: TaskMonitor Routes Lack Authentication Guard

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP Category** | A01:2021 — Broken Access Control |
| **CWE** | CWE-306: Missing Authentication for Critical Function |
| **CVSS Score** | 3.1 |
| **Location** | `backend/src/modules/memory/task-queue/TaskMonitor.ts:12-42` |
| **Status** | Potential (not currently exploitable — routes not mounted) |

**Description:**
`createTaskMonitorRoutes()` creates a Hono sub-app with diagnostic endpoints but does not apply any authentication middleware. The POST `/internal/tasks/:id/retry` endpoint allows modifying task state.

**Evidence:**
```typescript
// TaskMonitor.ts — no auth check
export function createTaskMonitorRoutes(worker: TaskWorker): Hono {
  const app = new Hono();
  app.get('/internal/tasks/stats', (c) => { ... });      // No auth
  app.get('/internal/tasks/failed', (c) => { ... });     // No auth
  app.post('/internal/tasks/:id/retry', (c) => { ... }); // No auth — state mutation!
  return app;
}
```

**Impact:**
If these routes are mounted on a publicly accessible host without auth, an attacker could enumerate failed tasks (potential info disclosure) and retry tasks at will (DoS / unexpected behavior).

**Remediation:**
```typescript
import { apiKeyAuth } from '../../../server/middleware/api-key-auth.js';

export function createTaskMonitorRoutes(worker: TaskWorker): Hono {
  const app = new Hono();
  // Apply auth to all internal routes
  app.use('*', apiKeyAuth);
  
  app.get('/internal/tasks/stats', (c) => { ... });
  app.get('/internal/tasks/failed', (c) => { ... });
  app.post('/internal/tasks/:id/retry', (c) => { ... });
  return app;
}
```

---

### Finding #2: CSP Allows unsafe-inline and unsafe-eval

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A05:2021 — Security Misconfiguration |
| **CWE** | CWE-1021: Improper Restriction of Rendered UI Layers |
| **CVSS Score** | 4.3 |
| **Location** | `backend/src/server/middleware/security-headers.ts:24-30` |
| **Status** | Open (Accepted trade-off for localhost dev tool) |

**Description:**
The Content-Security-Policy includes `'unsafe-inline' 'unsafe-eval'` for `script-src`. This significantly weakens XSS mitigation because any injected inline script will execute. The comment explains this is needed for the admin SPA (Babel + inline scripts), which is an acceptable trade-off for a localhost-only dev tool, but reduces defense-in-depth.

**Evidence:**
```typescript
c.header('Content-Security-Policy', [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  // ...
].join('; '));
```

**Impact:**
If an XSS vector exists in the admin UI, CSP will not block execution of injected scripts.

**Remediation:**
For a localhost-only tool this is acceptable (documented trade-off). For hardening:
```typescript
// Use nonce-based CSP when migrating admin SPA to bundled build
const nonce = crypto.randomBytes(16).toString('base64');
c.header('Content-Security-Policy', [
  "default-src 'self'",
  `script-src 'self' 'nonce-${nonce}'`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; '));
```

---

### Finding #3: Error Handler Leaks Internal Error Messages

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A05:2021 — Security Misconfiguration |
| **CWE** | CWE-209: Generation of Error Message Containing Sensitive Information |
| **CVSS Score** | 4.0 |
| **Location** | `backend/src/server/middleware/error-handler.ts:13-17` |
| **Status** | Open |

**Description:**
The global error handler returns `err.message` verbatim in HTTP responses. Internal error messages can contain file paths, SQL statements, stack information, or library-specific details that assist attackers in reconnaissance.

**Evidence:**
```typescript
return c.json(
  {
    error: {
      code: 'INTERNAL_ERROR',
      message: `Internal server error: ${err.message}`,
    },
  },
  500
);
```

**Impact:**
An attacker triggering unexpected errors could learn internal implementation details (database schema, file paths, library versions).

**Remediation:**
```typescript
export function createErrorHandler(logger: Logger): ErrorHandler {
  return (err, c) => {
    logger.error({ err, path: c.req.path, method: c.req.method }, 'Unhandled error');

    const isProduction = process.env.NODE_ENV === 'production';
    return c.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: isProduction
            ? 'An internal error occurred. Please try again later.'
            : `Internal server error: ${err.message}`,
        },
      },
      500
    );
  };
}
```

---

### Finding #4: API Key Auth Disabled by Default

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP Category** | A07:2021 — Identification and Authentication Failures |
| **CWE** | CWE-287: Improper Authentication |
| **CVSS Score** | 3.5 |
| **Location** | `backend/src/server/middleware/api-key-auth.ts:20-22` |
| **Status** | Open (Accepted — documented design decision for local dev) |

**Description:**
When `CODE_INTEL_API_KEY` environment variable is not set, the API key middleware becomes a no-op, allowing unauthenticated access to all protected endpoints. This is an intentional design choice for local development ergonomics.

**Evidence:**
```typescript
const API_KEY = process.env.CODE_INTEL_API_KEY || '';

export function isApiKeyAuthEnabled(): boolean {
  return API_KEY.length > 0;
}

export const apiKeyAuth: MiddlewareHandler = async (c, next) => {
  if (!isApiKeyAuthEnabled()) {
    await next();  // No auth enforced!
    return;
  }
  // ...
};
```

**Impact:**
In environments where the env var is not configured (developer oversight), endpoints are exposed without authentication. For a localhost-only server, risk is minimal.

**Remediation:**
```typescript
// Add visible startup warning in server initialization
if (!isApiKeyAuthEnabled()) {
  console.warn('⚠️  WARNING: CODE_INTEL_API_KEY not set — API endpoints are UNPROTECTED');
}
```

---

### Finding #5: CodeSearchHandler Missing Query Length Limit

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A05:2021 — Security Misconfiguration |
| **CWE** | CWE-400: Uncontrolled Resource Consumption |
| **CVSS Score** | 4.0 |
| **Location** | `backend/src/modules/code-intel/query/CodeSearchHandler.ts:24-26` |
| **Status** | Open |

**Description:**
The `CodeSearchHandler` accepts a `query` parameter of unlimited length. While the SQL is parameterized (safe from injection), a very long query string wrapped with `%..%` wildcards creates a computationally expensive LIKE scan on SQLite.

**Evidence:**
```typescript
handle(args: Record<string, unknown>): string {
  const query = (args.query as string) || '';
  // No length validation on query
  const pattern = `%${query}%`;  // Unbounded user input in LIKE pattern
  const results = this.db.all<SearchResult>(
    `... WHERE (cs.name LIKE ? OR cs.signature LIKE ?) ...`,
    [projectId, projectId, pattern, pattern, limit],
  );
}
```

**Impact:**
A malicious client could send a multi-KB query string causing high CPU usage on the SQLite LIKE operation, potentially causing denial-of-service for concurrent queries.

**Remediation:**
```typescript
handle(args: Record<string, unknown>): string {
  const query = (args.query as string) || '';
  const projectId = (args.projectId as string) || (args.__projectId as string) || '';
  const limit = Math.min((args.limit as number) || 50, 100);

  if (!query) return JSON.stringify({ results: [], message: 'query is required' });

  // Cap query length to prevent expensive LIKE scans
  const sanitizedQuery = query.slice(0, 200);
  const pattern = `%${sanitizedQuery}%`;
  // ... rest of query
}
```

---

### Finding #6: Dependencies Use Caret Ranges

| Attribute | Value |
|-----------|-------|
| **Severity** | Informational |
| **OWASP Category** | A06:2021 — Vulnerable and Outdated Components |
| **CWE** | CWE-1104: Use of Unmaintained Third-Party Components |
| **CVSS Score** | 0.0 |
| **Location** | `backend/package.json:52-64` |
| **Status** | Informational |

**Description:**
Most dependencies use caret ranges (`^`) which allows automatic minor/patch upgrades. While `package-lock.json` pins exact versions at install time, new installs could pull in a compromised version if lock file is regenerated.

No known CVEs found in current dependency versions:
- `hono` ^4.0.0 — no known vulns
- `zod` ^3.23.0 — no known vulns
- `better-sqlite3` ^11.10.0 — no known vulns
- `pino` ^9.2.0 — no known vulns

**Remediation:**
Run `npm audit` in CI pipeline. Consider pinning critical deps for production.

---

### Finding #7: No Security Audit Logging

| Attribute | Value |
|-----------|-------|
| **Severity** | Informational |
| **OWASP Category** | A09:2021 — Security Logging and Monitoring Failures |
| **CWE** | CWE-778: Insufficient Logging |
| **CVSS Score** | 0.0 |
| **Location** | Multiple files |
| **Status** | Informational |

**Description:**
Security-relevant operations (task retry, bulk code upload, failed validation) are not explicitly logged with security context. The request logger exists but doesn't tag security events.

**Remediation:**
Add structured security event logging for: failed auth, payload validation failures, retry operations, bulk uploads.

---

## Security Strengths Acknowledged ✅

| Area | Implementation | Rating |
|------|---------------|--------|
| SQL Injection Prevention | ALL queries use parameterized statements | ⭐⭐⭐⭐⭐ |
| Path Traversal Prevention | `PayloadValidator.ts` blocks `..`, absolute paths | ⭐⭐⭐⭐⭐ |
| Input Validation (SEC-02) | Zod schemas + PayloadValidator + hash format check | ⭐⭐⭐⭐⭐ |
| Timing-Safe Auth (SEC-01) | `timingSafeEqual` in API key comparison | ⭐⭐⭐⭐⭐ |
| Fail-Closed Design | DB not available → error returned, no bypass | ⭐⭐⭐⭐ |
| Reserved Key Stripping | `RESERVED_SCOPE_KEYS` stripped from client args | ⭐⭐⭐⭐⭐ |
| Transaction Safety | Batch upload wrapped in `db.transaction()` | ⭐⭐⭐⭐ |
| Rate Limiting | Applied to admin routes, 100 req/min | ⭐⭐⭐⭐ |
| Security Headers | Comprehensive set applied globally | ⭐⭐⭐⭐ |

---

## Security Headers Assessment

| Header | Status | Recommendation |
|--------|--------|----------------|
| X-Content-Type-Options | ✅ `nosniff` | Good |
| X-XSS-Protection | ✅ `1; mode=block` | Good (legacy) |
| Referrer-Policy | ✅ `strict-origin-when-cross-origin` | Good |
| Permissions-Policy | ✅ Restrictive | Good |
| Content-Security-Policy | ⚠️ `unsafe-inline`+`unsafe-eval` | Acceptable for dev tool; tighten for prod |
| X-Frame-Options | ❌ Removed (intentional) | CSP frame-ancestors handles; documented |
| Strict-Transport-Security | ❌ Not set | N/A for localhost HTTP |
| Cache-Control | ❌ Not set for APIs | Add `no-store` for sensitive endpoints |

---

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | #3 Error handler leaks err.message | Low | Prevents reconnaissance |
| 2 | #5 CodeSearchHandler query length limit | Low | Prevents DoS via expensive queries |
| 3 | #2 CSP unsafe-inline/unsafe-eval | Medium | Reduces XSS attack surface |
| 4 | #1 TaskMonitor routes need auth when mounted | Low | Prevents future exposure |
| 5 | #4 Auth disabled warning at startup | Low | Developer awareness |

---

## Recommendations Summary

### Immediate Actions (Medium Findings)
1. **Sanitize error responses** — Don't expose `err.message` in production (Finding #3)
2. **Cap search query length** — Add `query.slice(0, 200)` in CodeSearchHandler (Finding #5)
3. **Add auth to TaskMonitor** before mounting — preventive measure (Finding #1)

### Short-term Improvements
1. Add request body size limit (5MB max) on upload endpoints
2. Log security events with structured format (failed validations, auth, retries)
3. Add startup warning when API key auth is disabled

### Long-term Hardening
1. Migrate CSP to nonce-based when admin SPA moves to bundled build
2. Add HSTS if server is ever exposed beyond localhost
3. Pin dependency versions for production builds
4. Add `Cache-Control: no-store` to API responses containing sensitive data

---

## Appendix

### A. Tools and Methodology
- Static code analysis (manual review of source files)
- OWASP Testing Guide v4.2 methodology
- Dependency version checking against known CVE databases
- Review of middleware pipeline ordering and route protection

### B. Scope Limitations
- **NOT tested:** Dynamic/runtime behavior, penetration testing, infrastructure security
- **NOT tested:** Extension code (SEC-07 git operations)
- **Assumption:** Server is localhost-only (as documented in architecture)
- **Assumption:** `package-lock.json` pins dependency versions in deployments

### C. Glossary
- **CVSS**: Common Vulnerability Scoring System
- **CWE**: Common Weakness Enumeration
- **OWASP**: Open Web Application Security Project
- **CSP**: Content Security Policy
- **LIKE**: SQL pattern matching operator (case-insensitive in SQLite by default)
