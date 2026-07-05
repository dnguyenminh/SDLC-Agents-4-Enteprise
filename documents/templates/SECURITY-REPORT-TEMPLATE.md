# 🔒 Security Assessment Report

## Document Information

| Field | Value |
|-------|-------|
| Project | {project name} |
| Scope | {what was audited} |
| Date | {YYYY-MM-DD} |
| Assessor | Security Agent |
| Version | 1.0 |

## Executive Summary

{2-3 paragraph overview of security posture, critical findings count, overall risk level}

**Overall Risk Rating:** {Critical / High / Medium / Low}

| Severity | Count |
|----------|-------|
| 🔴 Critical | {n} |
| 🟠 High | {n} |
| 🟡 Medium | {n} |
| 🔵 Low | {n} |
| ℹ️ Informational | {n} |

## Findings by OWASP Top 10 (2021)

### A01:2021 — Broken Access Control
{findings or "No issues found ✅"}

### A02:2021 — Cryptographic Failures
{findings or "No issues found ✅"}

### A03:2021 — Injection
{findings or "No issues found ✅"}

### A04:2021 — Insecure Design
{findings or "No issues found ✅"}

### A05:2021 — Security Misconfiguration
{findings or "No issues found ✅"}

### A06:2021 — Vulnerable and Outdated Components
{findings or "No issues found ✅"}

### A07:2021 — Identification and Authentication Failures
{findings or "No issues found ✅"}

### A08:2021 — Software and Data Integrity Failures
{findings or "No issues found ✅"}

### A09:2021 — Security Logging and Monitoring Failures
{findings or "No issues found ✅"}

### A10:2021 — Server-Side Request Forgery (SSRF)
{findings or "No issues found ✅"}

## Detailed Findings

### Finding #1: {Title}

| Attribute | Value |
|-----------|-------|
| **Severity** | {Critical/High/Medium/Low} |
| **OWASP Category** | {A01-A10} |
| **CWE** | {CWE-ID: Name} |
| **CVSS Score** | {0.0-10.0} |
| **Location** | {file:line} |
| **Status** | Open |

**Description:**
{What the vulnerability is and why it matters}

**Evidence:**
```kotlin
// Vulnerable code
{code snippet showing the issue}
```

**Impact:**
{What an attacker could achieve by exploiting this}

**Remediation:**
```kotlin
// Fixed code
{code snippet showing the secure implementation}
```

**References:**
- {link to CWE}
- {link to relevant documentation}

---

## Dependency Vulnerabilities

| Dependency | Current Version | CVE | Severity | Fixed In |
|-----------|----------------|-----|----------|----------|
| {name} | {version} | {CVE-ID} | {severity} | {fixed version} |

## Security Headers Assessment

| Header | Status | Recommendation |
|--------|--------|----------------|
| Strict-Transport-Security | {✅/❌/⚠️} | {recommendation} |
| Content-Security-Policy | {✅/❌/⚠️} | {recommendation} |
| X-Content-Type-Options | {✅/❌/⚠️} | {recommendation} |
| X-Frame-Options | {✅/❌/⚠️} | {recommendation} |
| Referrer-Policy | {✅/❌/⚠️} | {recommendation} |
| Permissions-Policy | {✅/❌/⚠️} | {recommendation} |

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | {Critical finding} | {Low/Medium/High} | {description} |
| 2 | {High finding} | {Low/Medium/High} | {description} |

## Recommendations Summary

### Immediate Actions (Critical/High)
1. {action item}
2. {action item}

### Short-term Improvements (Medium)
1. {action item}
2. {action item}

### Long-term Hardening (Low/Informational)
1. {action item}
2. {action item}

## Positive Security Controls ✅

{List what the application does well — acknowledge existing security measures}

## Appendix

### A. Tools & Methodology
- Static code analysis (manual review)
- Dependency version checking
- Configuration review
- OWASP Testing Guide v4.2 methodology

### B. Scope Limitations
- {what was NOT tested — e.g., dynamic testing, penetration testing, infrastructure}
- {assumptions made}

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
- **XSS**: Cross-Site Scripting
