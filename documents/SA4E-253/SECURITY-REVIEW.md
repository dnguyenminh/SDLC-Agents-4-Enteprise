# 🔒 Security Design Review Report

## Document Information
| Field | Value |
|-------|-------|
| Project | SDLC Agents 4 Enterprise |
| Ticket | SA4E-253 |
| Scope | Security Design Review of TDD.md, BRD.md, FSD.md |
| Date | 2026-09-09 |
| Assessor | Security Agent |
| Version | 1.0 |

## Executive Summary

Security Design Review for SA4E-253 implements parser kind emission and graph mapping changes for KB Graph node types. The design is internal-facing with JWT authentication for indexing triggers and basic role definitions. Overall security posture is acceptable for an internal tooling component, but design documentation lacks explicit controls for input validation, API security hardening, dependency governance, and data protection. No critical exploitable flaws are identified at design level, however several medium/low gaps could lead to information disclosure, unauthorized access, or injection if implementation deviates from secure defaults.

**Overall Risk Rating:** Medium

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 1 |
| 🟡 Medium | 4 |
| 🔵 Low | 3 |
| ℹ️ Informational | 3 |

## Findings by OWASP Top 10 (2021)

### A01:2021 — Broken Access Control
**Findings:**
- Role definitions exist (Developer read/write indexing, QA read graph, System Admin admin) in FSD 7.1 / TDD 7, but no explicit enforcement mechanism, RBAC matrix, or endpoint-level authorization checks documented.
- JWT middleware supports anonymous mode by default when CODE_INTEL_REQUIRE_AUTH != true. Design does not mandate strict mode for indexing endpoints.
- projectId derived from X-Project-Id header or JWT claim pid, with fallback to empty string. No validation that user is authorized for requested projectId.

**No issues found ✅** for IDOR in scope of kind emission, but authorization design is incomplete.

### A02:2021 — Cryptographic Failures
**Findings:**
- Encryption at rest for SQLite/PostgreSQL not documented. No requirement for database encryption or column-level protection for internal source code.
- Encryption in transit assumed via TLS but not enforced in design. No HSTS header documented.
- JWT uses HS256 with secret KB_TOKEN_SECRET. No algorithm pinning documentation; verifyHs256 implementation prevents alg none, but design does not explicitly forbid alg confusion.
- No key rotation or secret management process documented.

### A03:2021 — Injection
**Findings:**
- Database query patterns documented in TDD 4: `SELECT with kind IN CODE_KINDS OR kind LIKE 'pega_%'`, `replaceCodeNodes DELETE + INSERT IGNORE`. Design assumes DatabaseAdapter parameterization, but no explicit requirement for parameterized queries.
- `graphTypeForKind(kind:string)` accepts arbitrary string from parser output. No input validation/sanitization specified before mapping. Unknown kind fallback to CODE_ENTITY with warning.
- No evidence of command injection vectors in design; parser processing is in-process TypeScript.
- No LDAP/XML injection scope.

### A04:2021 — Insecure Design
**Findings:**
- Security Design section in TDD 7 is 2 sentences only. No threat model, no data flow diagram with trust boundaries.
- Session management for JWT not defined: token lifetime, refresh, revocation not specified in BRD/FSD/TDD.
- No rate limiting documented for parser/indexing trigger endpoint `syncProjectSymbols`. Rate limiting only mentioned for admin API in code.
- No input size limits for symbols or projectId validation beyond UUID mention.

### A05:2021 — Security Misconfiguration
**Findings:**
- Security headers middleware exists in codebase but design does not mandate it for new endpoints. CSP allows 'unsafe-inline' and 'unsafe-eval' for admin SPA — documented in code, not in design.
- CORS configuration not documented; no explicit deny-by-default policy described.
- Debug logging may leak kinds/file paths. Logging of unknown kind includes kind, filePath — potential information disclosure.
- X-Frame-Options removed intentionally for webview, but design does not document compensating controls.

### A06:2021 — Vulnerable and Outdated Components
**Findings:**
- Dependency list from package.json: hono ^4.0.0, bcrypt ^6.0.0, zod ^3.23.0, pino ^9.14.0, onnxruntime-node ^1.18.0. No dependency vulnerability scanning process documented in design.
- Design principle "Backward Compatibility, No Workaround" is present, but no software bill of materials or update cadence.

### A07:2021 — Identification and Authentication Failures
**Findings:**
- JWT authentication required for indexing trigger per TDD 7, but authentication is optional globally via CODE_INTEL_REQUIRE_AUTH env.
- JWT verification uses HS256 with secret, no issuer/audience validation. Token expiration checked.
- No MFA requirements for System Admin role.
- Session tokens validated via async validateSession, but error handling fails open to anonymous when mustAuth=false.

### A08:2021 — Software and Data Integrity Failures
**Findings:**
- No signature verification for parser emitters or mapping constants. KIND_TO_TYPE is code constant, integrity relies on code review.
- No integrity checks for indexed symbols.

### A09:2021 — Security Logging and Monitoring Failures
**Findings:**
- Logging defined for unknown kind WARN and graph sync failure ERROR. No centralized security event logging, no SIEM integration.
- No audit logging for indexing triggers or project access.

### A10:2021 — Server-Side Request Forgery (SSRF)
**Findings:**
- No external URL fetching in design scope for kind emission.
- Existing codebase has url-validator middleware preventing metadata endpoints.

## Detailed Findings

### Finding #1: Authorization enforcement not documented for indexing endpoints

| Attribute | Value |
|-----------|-------|
| **Severity** | High |
| **OWASP Category** | A01:2021 Broken Access Control |
| **CWE** | CWE-285: Improper Authorization |
| **CVSS Score** | 7.5 |
| **Location** | FSD.md:440-445, TDD.md:150-151 |
| **Status** | Open |

**Description:**
Design documents define roles Developer/QA/System Admin but do not specify how authorization is enforced per endpoint `syncProjectSymbols` and `graphTypeForKind`. JWT middleware injects projectContext but no check that user role permits indexing or that user owns projectId from header.

**Evidence:**
```markdown
Internal services. Indexing trigger requires JWT authentication. Roles: Developer read/write indexing, QA read graph, System Admin admin.
```

**Impact:**
Attacker with valid JWT for one project could potentially trigger indexing for another project by manipulating X-Project-Id header, leading to data exposure or resource exhaustion.

**Remediation:**
Document RBAC matrix and enforce role check in middleware:
```typescript
// pseudocode
if (!ctx.projectContext) deny
if (ctx.projectContext.userRole !== 'Developer' && ctx.projectContext.userRole !== 'System Admin') deny
if (!allowedProjectsFromClaims(payload).includes(projectId)) deny
```
Enable CODE_INTEL_REQUIRE_AUTH=true by default in production.

**References:**
- OWASP A01:2021

---

### Finding #2: JWT authentication optional and lacks strict claims validation

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A07:2021 Identification and Authentication Failures |
| **CWE** | CWE-287: Improper Authentication |
| **CVSS Score** | 5.9 |
| **Location** | backend/src/server/middleware/jwt-auth.ts:16-18 |
| **Status** | Open |

**Description:**
JWT auth defaults to anonymous mode when CODE_INTEL_REQUIRE_AUTH != true. VerifyHs256 implementation is secure, but design does not require issuer/audience validation, token binding, or refresh/revocation.

**Evidence:**
```typescript
const REQUIRE_AUTH = process.env.CODE_INTEL_REQUIRE_AUTH === 'true';
```

**Impact:**
In environments where auth is not enforced, indexing endpoints are accessible anonymously, bypassing multi-tenancy isolation.

**Remediation:**
Document requirement for CODE_INTEL_REQUIRE_AUTH=true in production. Add issuer/audience checks to verifyJwtToken. Define token lifetime max 15 min with refresh token flow.

**References:**
- OWASP JWT best practices

---

### Finding #3: No explicit input validation for symbol kind and projectId

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A03:2021 Injection / A04:2021 Insecure Design |
| **CWE** | CWE-20: Improper Input Validation |
| **CVSS Score** | 5.3 |
| **Location** | FSD.md:164-168, TDD.md:91-93 |
| **Status** | Open |

**Description:**
`graphTypeForKind(kind:string)` accepts arbitrary string from parser. No Zod schema or whitelist validation documented. projectId parameter described as UUID format validated by DB, but no application-level validation specified.

**Impact:**
Maliciously crafted symbol kind could trigger unexpected mapping, log injection, or error-based information disclosure.

**Remediation:**
Add Zod validation at API boundary:
```typescript
const KindSchema = z.string().regex(/^[a-z_]+$/).min(1).max(64);
```
Validate projectId with uuid v4 schema before DB access.

**References:**
- CWE-20

---

### Finding #4: Database encryption and data protection not addressed

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A02:2021 Cryptographic Failures |
| **CWE** | CWE-311: Missing Encryption of Sensitive Data |
| **CVSS Score** | 5.0 |
| **Location** | FSD.md:448-452 |
| **Status** | Open |

**Description:**
Data Sensitivity Classification lists source code as Internal, but no encryption at rest requirements for SQLite/PostgreSQL, no TLS enforcement, no PII handling procedures documented.

**Impact:**
Local file access compromises could expose indexed source code. Absence of encryption at rest violates defense-in-depth for internal classification data.

**Remediation:**
Document requirement for TLS 1.2+ in transit, enable database encryption at rest, add HSTS header. Classify logs as internal and mask file paths in WARN logs.

**References:**
- OWASP ASVS V6

---

### Finding #5: Missing CORS and API security hardening documentation

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A05:2021 Security Misconfiguration |
| **CWE** | CWE-935: CORS Misconfiguration |
| **CVSS Score** | 4.7 |
| **Location** | HttpServer.ts |
| **Status** | Open |

**Description:**
API security design does not document CORS policy, rate limiting for indexing endpoints, or request size limits beyond bodyLimit 100MB.

**Impact:**
Overly permissive CORS could enable cross-origin attacks. Absence of rate limiting on `syncProjectSymbols` may enable DoS via repeated indexing.

**Remediation:**
Document deny-by-default CORS with explicit origins. Add rate limiting per projectId for indexing triggers. Reduce body limit for symbol sync requests.

**References:**
- OWASP API Security Top 10

---

### Finding #6: Dependency vulnerability management not defined

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP Category** | A06:2021 Vulnerable and Outdated Components |
| **CWE** | CWE-1104: Use of Unmaintained Third Party Components |
| **CVSS Score** | 3.7 |
| **Location** | backend/package.json |
| **Status** | Open |

**Description:**
No SBOM, dependency scanning, or update cadence documented. Dependencies include hono, bcrypt, zod, onnxruntime-node.

**Impact:**
Known CVEs in dependencies could be exploited in supply chain.

**Remediation:**
Introduce weekly dependency audit via `npm audit` and Snyk. Document update policy.

---

### Finding #7: Session management and token revocation undefined

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP Category** | A07:2021 Identification and Authentication Failures |
| **CWE** | CWE-613: Insufficient Session Expiration |
| **CVSS Score** | 3.1 |
| **Location** | TDD.md:150-151 |
| **Status** | Open |

**Description:**
Token lifetime not specified, no refresh mechanism, no revocation strategy for compromised JWTs or admin session tokens.

**Impact:**
Long-lived tokens increase window of exploitation.

**Remediation:**
Define max token lifetime 15-60 minutes, implement refresh token rotation, and document revocation via sessions table deletion.

---

### Finding #8: Security headers allow unsafe-inline/eval

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP Category** | A05:2021 Security Misconfiguration |
| **CWE** | CWE-693: Protection Mechanism Failure |
| **CVSS Score** | 2.9 |
| **Location** | backend/src/server/middleware/security-headers.ts:27 |
| **Status** | Open |

**Description:**
CSP includes 'unsafe-inline' and 'unsafe-eval' for admin SPA. Design does not document risk acceptance.

**Impact:**
Increases XSS risk if admin UI is compromised.

**Remediation:**
Document risk acceptance with compensating controls. Plan migration to nonces/hashes.

---

### Finding #9: Logging may leak sensitive data

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP Category** | A09:2021 Security Logging and Monitoring Failures |
| **CWE** | CWE-532: Insertion of Sensitive Information into Log File |
| **CVSS Score** | 2.5 |
| **Location** | TDD.md:163 |
| **Status** | Open |

**Description:**
Unknown kind fallback logs kind and filePath. No masking of sensitive paths.

**Impact:**
Log files may contain internal source paths.

**Remediation:**
Mask file paths to project-relative paths, avoid logging full absolute paths.

---

## Dependency Vulnerabilities

| Dependency | Current Version | CVE | Severity | Fixed In |
|-----------|----------------|-----|----------|----------|
| No public CVE data reviewed in design | - | - | - | - |

**Note:** Dependency scanning not performed as part of design review. Recommend scanning backend/package.json with `npm audit` / Snyk.

## Security Headers Assessment

| Header | Status | Recommendation |
|--------|--------|----------------|
| Strict-Transport-Security | ❌ Missing | Add HSTS max-age=31536000; includeSubDomains |
| Content-Security-Policy | ⚠️ Present with unsafe-inline/eval | Accept risk documented; plan nonce migration |
| X-Content-Type-Options | ✅ Present | Maintain |
| X-Frame-Options | ❌ Removed | Document compensating CSP frame-ancestors |
| Referrer-Policy | ✅ Present | Maintain |
| Permissions-Policy | ✅ Present | Maintain |

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | Authorization enforcement not documented | Medium | Prevents cross-tenant access |
| 2 | JWT authentication optional | Low | Enforce auth in prod |
| 3 | Input validation for kind/projectId | Low | Prevent injection |
| 4 | Data protection encryption | Medium | Compliance |
| 5 | CORS and rate limiting documentation | Medium | API hardening |
| 6 | Dependency scanning process | Low | Supply chain |
| 7 | Session management definition | Medium | Token lifecycle |
| 8 | CSP unsafe-inline acceptance | High | Long term |
| 9 | Logging data masking | Low | Privacy |

## Recommendations Summary

### Immediate Actions (Critical/High)
1. Document and enforce RBAC for indexing endpoints. Ensure CODE_INTEL_REQUIRE_AUTH=true in production environments.
2. Add project ownership check using allowedProjectsFromClaims before processing syncProjectSymbols.

### Short-term Improvements (Medium)
1. Add Zod validation schemas for all API inputs: projectId, kind.
2. Document TLS enforcement, HSTS, and database encryption at rest requirements.
3. Define CORS policy deny-by-default and document rate limits for indexing.
4. Establish dependency vulnerability scanning cadence.

### Long-term Hardening (Low/Informational)
1. Define token lifetime, refresh token flow, and revocation mechanism.
2. Document risk acceptance for CSP unsafe-inline/eval with migration plan.
3. Implement security event audit logging for indexing triggers and access control decisions.
4. Threat model the parser pipeline with trust boundaries.

## Appendix

### A. Tools & Methodology
- Manual review of BRD.md, FSD.md, TDD.md
- Code inspection of jwt-auth.ts, security-headers.ts, HttpServer.ts, package.json
- OWASP Top 10 2021 mapping

### B. Scope Limitations
- Static design review only; no dynamic testing, penetration testing, or runtime analysis performed.
- Dependency CVE data not verified; requires automated scanning.
- Infrastructure network policies, secrets management not reviewed due to scope.

### C. Glossary
- **RBAC**: Role-Based Access Control
- **HSTS**: HTTP Strict Transport Security
- **CSP**: Content Security Policy
