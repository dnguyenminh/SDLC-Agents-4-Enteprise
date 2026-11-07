# 🔒 Security Assessment Report

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise |
| Scope | Security review of Enrichment with Dynamic Context Budget & Runtime Model Swap (SA4E-387) — API security, model swap, input validation, authentication/authorization, OWASP Top 10 |
| Date | 2026-10-31 |
| Assessor | Security Agent |
| Version | 1.0 |

## Executive Summary

SA4E-387 introduces dynamic context budget calculation and runtime model swap for the LLM enrichment pipeline. The design replaces static token caps with per-model BudgetGuard calculations, adds ContextWindowDiscovery cache invalidation on model change, and enables chunked map-reduce enrichment for large files.

From a security perspective the feature is sound in concept but the current implementation exhibits several control gaps. The `/enrich` and `/model/swap` endpoints are exposed without authentication middleware, allowing unauthenticated callers to trigger enrichment and model changes. Input validation via Zod is present but error details are echoed to clients, and `filePath` is accepted without path canonicalisation or allow-list checks. Model swap performs no authorization check for Admin role and does not validate the target model against a controlled registry beyond existence. Budget calculation logic inverts the expected relationship between file size and window size, which is a logic flaw rather than a direct security issue but increases DoS risk.

**Overall Risk Rating:** Medium

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 2 |
| 🟡 Medium | 3 |
| 🔵 Low | 2 |
| ℹ️ Informational | 1 |

## Findings by OWASP Top 10 (2021)

### A01:2021 — Broken Access Control
- **Missing authorization on model swap** — `/model/swap` can be invoked by any caller; no Admin role check. See Finding #1.
- **No authentication on enrichment endpoints** — `/enrich` and `/model/swap` lack JWT middleware, contradicting TDD §3.2. See Finding #2.

### A02:2021 — Cryptographic Failures
No issues found ✅. TLS enforcement is assumed by platform; no evidence of plaintext secrets in code.

### A03:2021 — Injection
- **Path Traversal via filePath** — `filePath` is accepted from client and used without canonicalisation or whitelist. See Finding #3.

### A04:2021 — Insecure Design
- **Dynamic budget can overflow context window** — `BudgetGuard.calculateBudget` uses `Math.ceil(fileSize / windowSize)` which produces a budget that grows with file size rather than shrinking. Design intent requires `inputBudget + outputBudget <= context_window`. See Finding #4.

### A05:2021 — Security Misconfiguration
- **Verbose error responses** — stack traces / error messages returned to client. See Finding #5.
- **Missing security headers** — no HSTS, CSP, X-Content-Type-Options on Hono app.

### A06:2021 — Vulnerable and Outdated Components
No issues found ✅. Node 22.23.4 is current per SA4E-386.

### A07:2021 — Identification and Authentication Failures
- **Endpoints lack Bearer JWT validation** — TDD specifies Auth Bearer Token, route code does not enforce it. See Finding #2.

### A08:2021 — Software and Data Integrity Failures
Informational — Model resolver trusts client-supplied model name without server-side allow-list check beyond existence.

### A09:2021 — Security Logging and Monitoring Failures
- **Error details logged with user input** — logger.error includes raw error object which may contain filePath. See Finding #5.

### A10:2021 — Server-Side Request Forgery (SSRF)
No issues found ✅. No external URL fetching from user input.

## Detailed Findings

### Finding #1: Missing Authorization on Runtime Model Swap

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟠 High |
| **OWASP Category** | A01:2021 — Broken Access Control |
| **CWE** | CWE-285: Improper Authorization |
| **CVSS Score** | 7.5 |
| **Location** | `backend/src/routes/enrichment.ts:91-121` |
| **Status** | Open |

**Description:**
The `/model/swap` endpoint performs model resolution and cache invalidation without verifying caller role. FSD §7.1 requires Admin role for model swap, and TDD §7.2 specifies Admin only. The route handler does not apply `jwtAuth` or `requireEnrichmentAdmin` middleware.

**Evidence:**
```typescript
app.post('/model/swap', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = swapSchema.safeParse(body);
    // ... no auth check ...
    await contextWindowDiscovery.invalidateCache(model);
    return c.json({ status: 'success', message: `Model ${model} swapped...` });
  }
});
```

**Impact:**
Any unauthenticated or authenticated user can change the active model for a ticket, causing cache poisoning, unexpected cost increase, and potential prompt injection via model choice.

**Remediation:**
```typescript
import { jwtAuth, requireEnrichmentAdmin } from '../server/routes/enrichment-auth-guard.js';

app.post('/model/swap', jwtAuth, requireEnrichmentAdmin, async (c) => {
  // existing logic
});

```

References:
- OWASP A01:2021
- CWE-285

---

### Finding #2: Enrichment Endpoints Lack Authentication

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟠 High |
| **OWASP Category** | A07:2021 — Identification and Authentication Failures |
| **CWE** | CWE-306: Missing Authentication for Critical Function |
| **CVSS Score** | 8.2 |
| **Location** | `backend/src/routes/enrichment.ts:38-89` |
| **Status** | Open |

**Description:**
TDD §3.2 specifies `Auth: Bearer Token` for `/enrich`. The implementation creates a Hono app without JWT middleware, allowing anonymous enrichment requests.

**Evidence:**
```typescript
app.post('/enrich', async (c) => {
  const body = await c.req.json();
  // ... no auth ...
  const modelConfig = await modelResolver.resolveModel(model, 'SA4E-387');
```

**Impact:**
Uncontrolled enrichment usage enables abuse, cost escalation, and data exfiltration via LLM prompts.

**Remediation:**
Apply `jwtAuth` middleware and validate scope:
```typescript
app.post('/enrich', jwtAuth, async (c) => {
  const identity = c.get('jwtPayload');
  // enforce developer role
});
```

---

### Finding #3: Path Traversal via Unvalidated filePath

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟠 High |
| **OWASP Category** | A03:2021 — Injection |
| **CWE** | CWE-22: Path Traversal |
| **CVSS Score** | 7.5 |
| **Location** | `backend/src/routes/enrichment.ts:50` |
| **Status** | Open |

**Description:**
`filePath` is validated only as `z.string().min(1)`. No canonicalisation, allow-list, or sandbox check is performed before the path is used to mock file content. In production this would reach `loadBodyText`.

**Impact:**
Attacker can read arbitrary files outside project scope leading to information disclosure.

**Remediation:**
```typescript
const pathSchema = z.string().refine(p => {
  const resolved = path.resolve(cwd, p);
  return resolved.startsWith(ENRICHMENT_ROOT);
});
```
Enforce whitelist and reject `..` segments.

---

### Finding #4: Insecure Error Information Disclosure

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP Category** | A05:2021 — Security Misconfiguration |
| **CWE** | CWE-209: Information Exposure Through an Error Message |
| **CVSS Score** | 5.3 |
| **Location** | `backend/src/routes/enrichment.ts:84-87` |
| **Status** | Open |

**Description:**
Catch blocks return `error.message` directly to client and include `parsed.error` details from Zod. This leaks internal implementation details.

**Evidence:**
```typescript
return c.json({
  status: 'error',
  error: error instanceof Error ? error.message : 'Unknown error',
}, 500);
```

**Impact:**
Facilitates attack reconnaissance.

**Remediation:**
Return generic messages and log details server-side:
```typescript
logger.error({ error }, 'enrich failed');
return c.json({ status: 'error', error: 'Internal error' }, 500);
```

---

### Finding #5: Dynamic Budget Calculation Logic Flaw

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP Category** | A04:2021 — Insecure Design |
| **CWE** | CWE-682: Incorrect Calculation |
| **CVSS Score** | 4.8 |
| **Location** | `backend/src/modules/enrichment/BudgetGuard.ts:71-78` |
| **Status** | Open |

**Description:**
`calculateBudget` returns `chunkSize = Math.ceil(fileSize / windowSize)`. For typical fileSize > windowSize this yields a small integer budget, opposite of intended behaviour. BR-01 requires budget <= context window.

**Impact:**
Under-allocation causes truncation; over-allocation in edge cases may exceed model limits leading to LLM errors or DoS.

**Remediation:**
Implement proper token estimation and cap:
```typescript
calculateBudget(fileSize: number, modelConfig: ModelConfig): Budget {
  const tokensEst = this.estimateTokens(fileSize);
  const inputBudget = Math.min(Math.floor(modelConfig.contextWindow * 0.6), tokensEst);
  return { budget: inputBudget, windowSize: modelConfig.contextWindow };
}
```

---

### Finding #6: Model Resolver Leaks Internal Error

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP Category** | A07:2021 |
| **CWE** | CWE-200: Information Exposure |
| **CVSS Score** | 3.1 |
| **Location** | `backend/src/modules/enrichment/ModelResolver.ts:63-73` |
| **Status** | Open |

**Description:**
Tool handler returns `Error: ${error.message}` to caller.

**Remediation:** Map errors to generic messages.

### Finding #7: Missing Security Headers

| Attribute | Value |
|-----------|-------|
| **Severity** | ℹ️ Informational |
| **OWASP Category** | A05:2021 |
| **CWE** | CWE-16: Configuration |
| **CVSS Score** | 0.0 |
| **Location** | Hono app bootstrap |
| **Status** | Open |

**Description:**
No `secureHeaders` middleware.

**Remediation:** Add `secureHeaders` middleware.

---

## Dependency Vulnerabilities

| Dependency | Current Version | CVE | Severity | Fixed In |
|-----------|----------------|-----|----------|----------|
| No critical findings identified in package-lock.json review | — | — | — | — |

## Security Headers Assessment

| Header | Status | Recommendation |
|--------|--------|----------------|
| Strict-Transport-Security | ❌ | Add `Strict-Transport-Security: max-age=31536000; includeSubDomains` |
| Content-Security-Policy | ❌ | Define restrictive CSP for API responses |
| X-Content-Type-Options | ❌ | Add `nosniff` |
| X-Frame-Options | ⚠️ | Add `DENY` |
| Referrer-Policy | ❌ | Set `no-referrer` |
| Permissions-Policy | ❌ | Restrict unnecessary features |

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | Missing Authentication on /enrich | Low | Prevents unauthenticated abuse |
| 2 | Missing Authorization on /model/swap | Low | Prevents privilege escalation |
| 3 | Path Traversal via filePath | Medium | Prevents file disclosure |
| 4 | Error Information Disclosure | Low | Reduces reconnaissance |
| 5 | Budget Calculation Logic Flaw | Medium | Ensures correct token usage |

## Recommendations Summary

### Immediate Actions (Critical/High)
1. Add `jwtAuth` middleware to `/enrich` and `/model/swap`.
2. Enforce `requireEnrichmentAdmin` on `/model/swap`.
3. Implement filePath allow-list and path canonicalisation.

### Short-term Improvements (Medium)
1. Remove error detail leakage from API responses.
2. Fix BudgetGuard calculation to respect `inputBudget + outputBudget <= context_window`.
3. Add security headers via Hono `secureHeaders` middleware.

### Long-term Hardening (Low/Informational)
1. Add rate limiting per user/role on enrichment endpoints.
2. Introduce model allow-list in ModelResolver.
3. Centralise logging with PII masking.

## Positive Security Controls ✅

- Zod schemas validate request bodies for `/enrich` and `/model/swap`.
- Logging via Pino is present for enrichment failures.
- Model config is loaded via repository abstraction, not hardcoded.
- Cache invalidation is designed to trigger on model swap.
- TDD documents authentication and authorization requirements.

## Appendix

### A. Tools & Methodology
- Static code analysis (manual review)
- Dependency version checking
- Configuration review
- OWASP Testing Guide v4.2 methodology

### B. Scope Limitations
- No dynamic testing or penetration testing performed
- Runtime model swap cache invalidation not verified in distributed scenario
- LLM provider security outside scope

### C. Severity Classification

| Severity | CVSS Range | Criteria |
|----------|-----------|----------|
| **Critical** | 9.0-10.0 | Remote code execution, authentication bypass, full data breach |
| **High** | 7.0-8.9 | Privilege escalation, significant data exposure, injection with impact |
| **Medium** | 4.0-6.9 | Limited data exposure, requires authentication, complex exploitation |
| **Low** | 0.1-3.9 | Information disclosure, requires local access, minimal impact |
| **Informational** | 0.0 | Best practice recommendations, defense-in-depth suggestions |

### D. Glossary
- **CVSS**: Common Vulnerability Scoring System
- **CWE**: Common Weakness Enumeration
- **OWASP**: Open Web Application Security Project
- **SSRF**: Server-Side Request Forgery
- **IDOR**: Insecure Direct Object Reference
