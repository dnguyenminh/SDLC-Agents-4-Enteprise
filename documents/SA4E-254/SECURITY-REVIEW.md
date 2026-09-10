# 🔒 Security Assessment Report - Design Review

## Document Information
| Field | Value |
|-------|-------|
| Project | SA4E-254 Advanced RAG for large documents |
| Scope | Design review of BRD.md, FSD.md v1.1, TDD.md v1.0 |
| Date | 2026-09-09 |
| Assessor | Security Agent |
| Version | 1.0 |

## Executive Summary

Design review covers Query Router, Summary Tree pre-computed at ingest, Semantic Cache in Redis, and Async Queue via BullMQ for RAG pipeline. Architecture introduces new attack surface via intent classification, external LLM summarization, Redis key construction from user input, and multi-layer vector storage.

**Overall Risk Rating:** Medium

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 2 |
| 🟡 Medium | 4 |
| 🔵 Low | 3 |
| ℹ️ Informational | 3 |

## Findings by OWASP Top 10 (2021)

### A01:2021 — Broken Access Control
**Finding:** No per-document ownership enforcement documented for `/api/rag/query`. `doc_id` is optional input and can be supplied by caller. Authorization matrix only states User READ / Admin WRITE ingest, without tenant isolation or row-level access control on `document_summaries`. Potential IDOR.

**Finding:** Cache invalidation uses pattern delete `rag:cache:{doc_id}:*`. If doc_id is not validated against ownership, one user can poison cache for another document.

### A02:2021 — Cryptographic Failures
**Finding:** Redis semantic cache stores `{answer, source_layer, created_at}` in plaintext. No encryption-at-rest for cache or BullMQ job payload. Job schema includes `query_text` and `user_id` which may contain PII.

**Finding:** JWT handling referenced as `jwtAuth` middleware with no specification of algorithm enforcement, secret management, token expiry, or `none` algorithm rejection. No mention of key rotation.

### A03:2021 — Injection
**Finding:** Query Router input validation limited to Zod `minLength:1` for `query_text` and UUID format for `doc_id`. No max length, no normalization against prompt injection or control characters. User-controlled `query_text` is forwarded to classifier and ultimately to LLM summarization prompts, enabling prompt injection.

**Finding:** Redis cache key construction uses `doc_id` and normalized query directly in key string `rag:cache:{doc_id}:{intent}:{hash(normalized_query)}`. If `doc_id` validation fails or normalization is insufficient, key injection / cache poisoning possible.

### A04:2021 — Insecure Design
**Finding:** Summary Tree generation via external LLM at ingest uses document content directly in prompts. No documented prompt sanitization, output validation, or isolation per tenant. Malicious document content can influence LLM behavior.

**Finding:** Async queue max depth 500 with backpressure returns 429 but no documented rate limiting per user, enabling abuse for resource exhaustion.

### A05:2021 — Security Misconfiguration
**Finding:** No security headers, CORS, or Content-Type enforcement specified for `/api/rag/query` and `/api/rag/ingest`. Error responses may leak internal paths.

**Finding:** Ingest endpoint accepts `multipart/form-data` file without documented size limits, file type validation, or virus scanning.

### A06:2021 — Vulnerable and Outdated Components
No explicit dependency versions reviewed in design. Technology stack lists TypeScript 5.x, Hono 4.x, PostgreSQL 15+, Redis + BullMQ 7.x. No SBOM or CVE check performed.

### A07:2021 — Identification and Authentication Failures
**Finding:** JWT authentication assumed but token validation details missing: no audience/issuer checks, no refresh flow, no session timeout documented.

### A08:2021 — Software and Data Integrity Failures
**Finding:** Summary Tree data stored in `document_summaries` with `parent_id` reference. No checksum or integrity verification for summary generation. Re-ingest invalidation relies on cache delete pattern; race condition noted in TA-03.

### A09:2021 — Security Logging and Monitoring Failures
**Finding:** Logging masks `doc_id` per TDD 7.3, but `query_text`, `summary_text`, and LLM prompts may be logged in structured JSON via Pino. No PII redaction policy defined.

### A10:2021 — Server-Side Request Forgery (SSRF)
No direct SSRF vectors identified in design. Ingest file upload mitigated by file type validation not documented.

## Detailed Findings

### Finding #1: Redis Cache Key Injection & Cache Poisoning

| Attribute | Value |
|-----------|-------|
| **Severity** | High |
| **OWASP Category** | A01, A03 |
| **CWE** | CWE-22: Improper Limitation of a Pathname to a Restricted Directory |
| **CVSS Score** | 7.5 |
| **Location** | FSD.md 13.3 AD-03, TDD.md 7.4 |
| **Status** | Open |

**Description:**
Cache key `rag:cache:{doc_id}:{intent}:{hash(normalized_query)}` is constructed from user-supplied `doc_id` and `query_text`. If `doc_id` validation is bypassed or normalization allows ':' or special characters, attacker can craft keys to collide or overwrite cache entries.

**Impact:**
Cache poisoning leading to cross-tenant data disclosure or denial of service for GLOBAL queries.

**Remediation:**
Enforce strict UUID v4 validation for `doc_id` at API edge using Zod `.uuid()`. Normalize query with whitelist characters and length cap 2048. Use fixed-width encoding for key parts, e.g., base64url encode each component. Add tenant_id prefix to key namespace.

### Finding #2: Prompt Injection via Query Router and Summary Generation

| Attribute | Value |
|-----------|-------|
| **Severity** | High |
| **OWASP Category** | A03 |
| **CWE** | CWE-170: Improper Null Termination |
| **CVSS Score** | 7.2 |
| **Location** | FSD.md 13.2 AD-02, TDD.md 7.4 |
| **Status** | Open |

**Description:**
`query_text` is passed to classifier and, for GLOBAL/STRUCTURAL, to LLM for summarization. No input sanitization or prompt delimiting is specified. Malicious user can embed instructions to exfiltrate document summaries.

**Impact:**
LLM jailbreak, data exfiltration via prompt injection, or denial of service.

**Remediation:**
Implement prompt templating with strict delimiters, e.g., XML tags, and strip control characters. Apply maximum query length 2000 chars. Add classifier-level sanitization and output validation against expected schema.

### Finding #3: IDOR on doc_id Parameter

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A01 |
| **CWE** | CWE-639: Authorization Bypass Through User-Controlled Key |
| **CVSS Score** | 6.5 |
| **Location** | FSD.md 3.1.4, TDD.md 3.2 |
| **Status** | Open |

**Description:**
`/api/rag/query` accepts optional `doc_id`. No documented check that user owns document or tenant has access.

**Remediation:**
Add middleware to resolve `doc_id` to tenant scope and enforce ownership before routing. Return 404 for unauthorized docs.

### Finding #4: PII Logging and Redis Data Exposure

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A02, A09 |
| **CWE** | CWE-532: Insertion of Sensitive Information into Log File |
| **CVSS Score** | 5.8 |
| **Location** | TDD.md 7.3, 9 |
| **Status** | Open |

**Description:**
Structured logging via Pino may capture `query_text` containing PII. Redis cache stores answers in plaintext. BullMQ jobs store `query_text`.

**Remediation:**
Define PII redaction rules for logs. Encrypt cache values with tenant key. Avoid storing raw query_text in queue; store reference ID.

### Finding #5: JWT Configuration Incomplete

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A07 |
| **CWE** | CWE-327: Use of a Broken or Risky Cryptographic Algorithm |
| **CVSS Score** | 6.0 |
| **Location** | TDD.md 7.1 |
| **Status** | Open |

**Description:**
JWT Bearer token mentioned but algorithm, secret source, expiry, and audience validation not specified.

**Remediation:**
Enforce RS256 with public key verification, reject `none` algorithm, set short access token TTL 15min, use HttpOnly Secure cookies if used.

### Finding #6: Ingest File Upload Validation Missing

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A05 |
| **CWE** | CWE-434: Unrestricted Upload of File with Dangerous Type |
| **CVSS Score** | 5.4 |
| **Location** | FSD.md 13.3, TDD.md 3.3 |
| **Status** | Open |

**Description:**
`/api/rag/ingest` accepts multipart file without documented size limit, MIME validation.

**Remediation:**
Enforce max file size 100MB, allow only text/*, PDF, DOCX. Scan content. Store file in isolated storage.

### Finding #7: pgvector Data Exposure Across Tenants

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP Category** | A01 |
| **CWE** | CWE-639 |
| **CVSS Score** | 3.7 |
| **Location** | TDD.md 4.2 |
| **Status** | Open |

**Description:**
`document_summaries` table has no tenant_id column documented. HNSW indexes per layer could allow cross-tenant vector search if query not filtered.

**Remediation:**
Add `tenant_id` column and enforce row-level security policy.

### Finding #8: No Rate Limiting Documented

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP Category** | A05 |
| **CWE** | CWE-770: Allocation of Resources Without Limits or Throttling |
| **CVSS Score** | 3.5 |
| **Location** | FSD.md 13.4 |
| **Status** | Open |

**Description:**
No rate limiting specified for query or ingest endpoints.

**Remediation:**
Implement per-user rate limit 60/min for query, 10/min for ingest.

### Finding #9: Security Headers Missing

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP Category** | A05 |
| **CWE** | CWE-693 |
| **CVSS Score** | 2.9 |
| **Location** | TDD.md 7 |
| **Status** | Open |

**Description:**
No HTTP security headers documented.

**Remediation:**
Add HSTS, CSP, X-Content-Type-Options, X-Frame-Options.

## Dependency Vulnerabilities

No dependency manifest reviewed in design. Recommend SBOM review before implementation.

## Security Headers Assessment

| Header | Status | Recommendation |
|--------|--------|----------------|
| Strict-Transport-Security | ❌ | Add HSTS max-age 31536000 |
| Content-Security-Policy | ❌ | Restrict default-src |
| X-Content-Type-Options | ❌ | Set nosniff |
| X-Frame-Options | ❌ | Set DENY |
| Referrer-Policy | ❌ | Set strict-origin-when-cross-origin |
| Permissions-Policy | ❌ | Restrict unnecessary features |

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | Redis Cache Key Injection | Low | High |
| 1 | Prompt Injection | Medium | High |
| 2 | IDOR on doc_id | Medium | Medium |
| 2 | PII Logging | Low | Medium |
| 3 | JWT Configuration | Low | Medium |

## Recommendations Summary

### Immediate Actions (Critical/High)
1. Enforce strict UUID validation and tenant-scoped Redis keys.
2. Implement prompt sanitization and max length for query_text.
3. Add ownership check for doc_id in query pipeline.

### Short-term Improvements (Medium)
1. Encrypt Redis cache values and BullMQ job payloads.
2. Define PII redaction policy for logs.
3. Harden JWT middleware with algorithm enforcement and secret rotation.

### Long-term Hardening (Low/Informational)
1. Add security headers middleware.
2. Implement rate limiting and file upload validation.
3. Add tenant_id to pgvector schema and enable RLS.

## Verdict

**APPROVED-WITH-CONDITIONS**

Design is acceptable with mandatory remediation of High severity findings before implementation. Specifically:
- Redis cache key injection and prompt injection must be mitigated.
- IDOR and JWT hardening required prior to code freeze.
- PII logging policy must be documented.

## Appendix

### A. Tools & Methodology
- Static design review against OWASP Top 10 2021
- Document analysis: BRD, FSD v1.1, TDD v1.0
- Focus areas per ticket scope

### B. Scope Limitations
- No source code review performed; findings based on design docs only
- Dynamic testing, penetration testing not performed
- Infrastructure security out of scope

### C. Glossary
- CVSS: Common Vulnerability Scoring System
- CWE: Common Weakness Enumeration
- OWASP: Open Web Application Security Project
