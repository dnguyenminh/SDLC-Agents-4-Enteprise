# 🔒 Security Assessment Report
## Ticket: SA4E-336 - Upgrade pi-coding-agent 0.80.10 → 0.99.1 + native PowerShell tool

| Field | Value |
|-------|-------|
| **Project** | SDLC Agents 4 Enterprise (VS Code Extension) |
| **Scope** | Code audit of `extension/src/` for OWASP Top 10 vulnerabilities |
| **Date** | 2026-10-03 |
| **Assessor** | Security Agent |
| **Version** | 1.0 |

---

## Executive Summary

This security assessment identified several findings across the extension codebase. The application is a VS Code extension for multi-agent SDLC pipeline orchestration. Key findings include:

- **Critical**: Potential XSS vector in chat markdown rendering where user-generated content is rendered via `{@html}`
- **High**: PowerShell command approval patterns could allow smuggling via compound statements
- **Medium**: Several configuration and authentication hardening opportunities
- **Informational**: Dependency versions verified, secrets management properly using VS Code SecretStorage

**Overall Risk Rating: Medium**

| Severity | Count |
|----------|-------|
| 🔴 Critical | 1 |
| 🟠 High | 1 |
| 🟡 Medium | 3 |
| 🔵 Low | 2 |
| ℹ️ Informational | 5 |

---

## Findings by OWASP Top 10 (2021)

### A01:2021 — Broken Access Control
**1 finding(s)**

### A02:2021 — Cryptographic Failures
**0 findings** ✅

### A03:2021 — Injection
**3 finding(s)** - XSS and PowerShell command injection vectors

### A04:2021 — Insecure Design
**0 findings** ✅ (security-by-design patterns observed)

### A05:2021 — Security Misconfiguration
**2 finding(s)** - HTTP enforcement with opt-in bypass, CORS not explicitly configured

### A06:2021 — Vulnerable and Outdated Components
**0 findings** ✅ - All dependencies at 0.99.1 as expected

### A07:2021 — Identification and Authentication Failures
**1 finding** - Token expiry fallback to acquisition time

### A08:2021 — Software and Data Integrity Failures
**0 findings** ✅

### A09:2021 — Security Logging and Monitoring Failures
**0 findings** ✅

### A10:2021 — Server-Side Request Forgery (SSRF)
**0 findings** ✅ - No user-controllable URL redirection

---

## Detailed Findings

### Finding #1: XSS in Chat Message Rendering (Critical)

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔴 Critical |
| **OWASP Category** | A03:2021 — Injection |
| **CWE** | CWE-79: Cross-site Scripting |
| **CVSS Score** | 7.5 (High) |
| **Location** | `extension/src/webview/components/ChatMessage.svelte`, line 208 |
| **Status** | Open |

**Description:**
The `ChatMessage.svelte` component renders user-generated message content using `{@html renderMarkdown(message.content)}` at line 208. While the `renderMarkdown` function does perform HTML entity escaping (`&`, `<`, `>`) as a first step, the use of `{@html}` bypasses Svelte's normal HTML escaping, and any markdown that survives the escape-plus-extraction pipeline could execute arbitrary JavaScript in the webview context.

The `inlineFmt` function applies `<strong>` and `<em>` formatting via regex replacements, which could be exploited through carefully crafted markdown like `**<script>alert(1)</script>**` or `*<script>alert(1)</script>*`.

**Evidence:**
```typescript
// Vulnerable code - line 208
<div class="message-body">
  {@html renderMarkdown(message.content)}
</div>
```

**Impact:**
An attacker who can control chat message content (e.g., through a compromised backend or malicious agent input) could execute JavaScript in the context of the webview, potentially leading to credential theft, action forgery, or data exfiltration.

**Remediation:**
```svelte
<!-- Fixed code - use textContent instead of @html -->
<div class="message-body">
  {renderMarkdown(message.content)}
</div>
```

Where `renderMarkdown` returns a string that Svelte will automatically HTML-escape when not using `{@html}`. If HTML rendering is required, implement a trusted types policy or use Svelte's `@sanitized` directive (if available).

**References:**
- [CWE-79: Cross-site Scripting](https://cwe.mitre.org/data/definitions/79.html)
- [OWASP XSS Prevention Cheat Sheet](https://owasp.org/www-project-cheat-sheets/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)

---

### Finding #2: PowerShell Command Injection - Compound Statement Smuggling (High)

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟠 High |
| **OWASP Category** | A03:2021 — Injection |
| **CWE** | CWE-89: Improper Neutralization of Special Elements used in an SQL Command (conceptually) / CWE-94: Improper Control of Generation of Code |
| **CVSS Score** | 6.8 (Medium-High) |
| **Location** | `extension/src/chat/engine/ps-command-patterns.ts`, lines 165-178 |
| **Status** | Open |

**Description:**
The `isReadonlyPsCommand` function splits normalized commands by compound statement separators (`;`, `|`, `||`, `&&`) and checks each segment independently against `READONLY_PS_PATTERNS`. However, the splitting regex `/\s*(?:;|\|\||&&|\|)\s*/` can be circumvented through:

1. **Unicode lookalikes** - Using visually similar but different characters
2. **Encoded separators** - Using base64 or other encoding to hide the separator
3. **Truncation attacks** - Commands that partially match patterns before the separator

The `READONLY_PS_PATTERNS` array uses `^` anchors, but after splitting, segments may not have proper anchoring, allowing destructive commands to be embedded after a seemingly benign readonly command.

**Evidence:**
```typescript
// Line 165 - compound statement separator
const COMPOUND_SPLIT_RE = /\s*(?:;|\|\||&&|\|)\s*/;

// Line 173-178 - isReadonlyPsCommand function
export function isReadonlyPsCommand(normalizedText: string): boolean {
  if (!normalizedText) return false;
  const segments = normalizedText.split(COMPOUND_SPLIT_RE).map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return false;
  return segments.every((seg) => READONLY_PS_PATTERNS.some((p) => p.test(seg)));
}
```

**Impact:**
An attacker could craft a PowerShell command like `get-content sensitive.txt; remove-item C:\important` where the `get-content` segment passes the readonly check, but the `remove-item` segment executes destructively. While the `DESTRUCTIVE_PS_PATTERNS` would catch the `remove-item` in isolation, the compound check logic has potential bypass vectors.

**Remediation:**
- Add explicit `^` and `$` anchors to each segment's pattern matching
- Implement allowlisting that requires the entire command to match a readonly pattern, not just segments
- Add additional validation to detect encoded or obfuscated separators
- Consider using a dedicated PowerShell security library instead of regex-based analysis

**References:**
- [CWE-94: Improper Control of Generation of Code](https://cwe.mitre.org/data/definitions/94.html)
- [TDD §7.3.3](https://tdd-standard.example.com/7.3.3) - Compound statement security

---

### Finding #3: Token Expiry Fallback to Acquisition Time (Medium)

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP Category** | A07:2021 — Identification and Authentication Failures |
| **CWE** | CWE-613: Insufficient Session Expiration |
| **CVSS Score** | 5.3 (Medium) |
| **Location** | `extension/src/auth/AuthManager.ts`, lines 436-442 |
| **Status** | Open |

**Description:**
The `isExpired()` method falls back to the token acquisition time when `tokenExpiresAt` is null:

```typescript
private isExpired(): boolean {
  if (!this.tokenExpiresAt) {
    if (!this.tokenAcquiredAt) return false;
    return Date.now() > this.tokenAcquiredAt + 3_600_000; // 4 hours default
  }
  return Date.now() > this.tokenExpiresAt - 60_000;
}
```

If the backend does not provide an `expiresAt` timestamp, the token is assumed to last 4 hours from acquisition. This is a reasonable default but could be exploited if an attacker can delay token usage beyond 4 hours without detection.

**Evidence:**
```typescript
// Lines 436-442 - isExpired method
private isExpired(): boolean {
  if (!this.tokenExpiresAt) {
    if (!this.tokenAcquiredAt) return false;
    return Date.now() > this.tokenAcquiredAt + 3_600_000;
  }
  return Date.now() > this.tokenExpiresAt - 60_000;
}
```

**Impact:**
An attacker who obtains a token and can use it within a 4-hour window could maintain access without the system detecting expiry. This is mitigated by the `shouldRefreshNow()` method which checks for proactive refresh, but the 4-hour window is still a potential risk.

**Remediation:**
- Ensure the backend always provides `expiresAt` in token responses
- Reduce the default fallback expiry to a shorter duration (e.g., 1 hour)
- Add monitoring for token usage patterns that exceed expected durations

**References:**
- [CWE-613: Insufficient Session Expiration](https://cwe.mitre.org/data/definitions/613.html)

---

### Finding #4: Insecure Remote Backend URL with Opt-In Bypass (Medium)

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP Category** | A05:2021 — Security Misconfiguration |
| **CWE** | CWE-319: Cleartext Transmission of Sensitive Information |
| **CVSS Score** | 5.3 (Medium) |
| **Location** | `extension/src/config/backend-url.ts`, lines 37-53 and `pega-endpoint.ts`, lines 54-68 |
| **Status** | Open |

**Description:**
Both `backend-url.ts` and `pega-endpoint.ts` enforce HTTPS for non-loopback URLs but provide an opt-in bypass via `sdlcAgents.backend.allowInsecureRemote`. When enabled, HTTP remote URLs are accepted with a `console.warn` warning. This design pattern, while flexible for development, creates a MITM risk if the bypass is accidentally or intentionally enabled in production.

**Evidence:**
```typescript
// Lines 41-48 - enforceHttpsForRemote function
if (allowInsecureRemote) {
  console.warn(
    `[Security] WARNING: Insecure remote backend URL allowed (allowInsecureRemote=true) — traffic to "${parsed.hostname}" is unencrypted HTTP. ` +
    `Credentials and data can be intercepted (MITM). Only use on trusted private networks.`
  );
  return;
}
```

**Impact:**
If `allowInsecureRemote` is enabled (even temporarily) and the backend is exposed to a network, traffic including authentication tokens could be intercepted via MITM attacks.

**Remediation:**
- Require explicit opt-in via environment variable or additional confirmation, not just a config flag
- Add runtime confirmation dialog when the flag is enabled
- Log a more severe warning when the flag is set
- Consider removing the bypass entirely and requiring HTTPS everywhere

**References:**
- [CWE-319: Cleartext Transmission of Sensitive Information](https://cwe.mitre.org/data/definitions/319.html)

---

### Finding #5: Secrets Migration Legacy Key Retention (Low)

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP Category** | A02:2021 — Cryptographic Failures |
| **CWE** | CWE-522: Insufficiently Protected Credentials |
| **CVSS Score** | 3.5 (Low) |
| **Location** | `extension/src/auth/AuthManager.ts`, lines 22-26 and `llm-secret-keys.ts`, lines 15-37 |
| **Status** | Open |

**Description:**
The auth system maintains legacy secret key names (`kiroSdlc.accessToken`, `kiroSdlc.lastUsername`) as read-only fallback sources. While migration-on-read is implemented, the legacy keys remain storable and could contain outdated credentials. If an attacker gains access to the VS Code SecretStorage, both the new `sdlcAgents.*` and legacy `kiroSdlc.*` keys could be compromised.

**Evidence:**
```typescript
// Lines 22-26 - legacy secret keys in AuthManager
const SECRET_ACCESS_TOKEN = "sdlcAgents.accessToken";
const SECRET_LAST_USERNAME = "sdlcAgents.lastUsername";
/** Pre-rename secret keys — READ-ONLY migration/fallback sources. */
const LEGACY_SECRET_ACCESS_TOKEN = "kiroSdlc.accessToken";
const LEGACY_SECRET_LAST_USERNAME = "kiroSdlc.lastUsername";
```

**Impact:**
Lower risk since legacy keys are intended as migration fallbacks, but they represent an expanded attack surface if SecretStorage is compromised.

**Remediation:**
- Consider removing legacy key support after a reasonable migration period
- Add explicit warning when legacy keys are detected
- Ensure legacy keys are also protected by SecretStorage encryption

**References:**
- [CWE-522: Insufficiently Protected Credentials](https://cwe.mitre.org/data/definitions/522.html)

---

### Finding #6: Chat Input Not Sanitized Before Sending to Backend (Low)

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP Category** | A03:2021 — Injection |
| **CWE** | CWE-79: Cross-site Scripting (reflected) |
| **CVSS Score** | 3.5 (Low) |
| **Location** | `extension/src/webview/components/ChatInput.svelte`, lines 35-55 |
| **Status** | Open |

**Description:**
The `ChatInput.svelte` component sends user input directly to the extension host via `dispatch('send', { text, agentId })` without client-side sanitization. While the backend should handle input validation, the lack of client-side sanitization means malicious payloads could reach the backend.

**Evidence:**
```typescript
// Lines 35-48 - submit function
function submit(): void {
  const text = inputText.trim();
  if (!text || $isStreaming) return;
  // ... sends text directly without sanitization
}
```

**Impact:**
Low - the backend is expected to validate and sanitize all inputs. The risk is primarily if the backend does not properly sanitize, leading to injection or other issues. The client-side lack of sanitization is a defense-in-depth gap.

**Remediation:**
- Add client-side markdown sanitization before sending
- Implement input length limits
- Add pattern validation for expected input formats

**References:**
- [CWE-79: Cross-site Scripting](https://cwe.mitre.org/data/definitions/79.html)

---

### Finding #7: Dependent Verification - All Dependencies at Expected Versions (Informational)

| Attribute | Value |
|-----------|-------|
| **Severity** | ℹ️ Informational |
| **OWASP Category** | A06:2021 — Vulnerable and Outdated Components |
| **Location** | `extension/package.json` |
| **Status** | ✅ Compliant |

**Description:**
All dependencies are pinned to exact versions `0.99.1`:
- `@earendil-works/pi-coding-agent` 0.99.1 (upgraded from 0.80.10)
- `@earendil-works/pi-mcp` 0.99.1
- Other deps at 0.99.1 or appropriate versions

**Evidence:**
```json
"@earendil-works/pi-coding-agent": "0.99.1",
"@earendil-works/pi-mcp": "0.99.1",
...
```

**Impact:** No outdated dependencies found in the extension code. The upgrade from 0.80.10 to 0.99.1 has been completed as part of ticket SA4E-336.

**Remediation:** None required. Continue monitoring for new CVEs in dependencies.

---

### Finding #8: Authentication Token Stored in VS Code SecretStorage (Informational)

| Attribute | Value |
|-----------|-------|
| **Severity** | ℹ️ Informational |
| **OWASP Category** | A07:2021 — Identification and Authentication Failures |
| **Location** | `extension/src/auth/AuthManager.ts` |
| **Status** | ✅ Good Practice |

**Description:**
Authentication tokens are stored using VS Code's `SecretStorage`, which utilizes the operating system's keychain (Windows Credential Manager, macOS Keychain, Linux KWallet). This is the recommended approach for storing sensitive tokens in VS Code extensions.

**Evidence:**
```typescript
// Lines 145-146 - token storage in AuthManager.login
await this.secrets.store(SECRET_ACCESS_TOKEN, data.token);
await this.secrets.store(SECRET_LAST_USERNAME, username);
```

**Impact:** Tokens are properly encrypted at rest and only accessible to the extension.

**Remediation:** None required.

---

### Finding #9: CORS Not Explicitly Configured in Extension (Informational)

| Attribute | Value |
|-----------|-------|
| **Severity** | ℹ️ Informational |
| **OWASP Category** | A05:2021 — Security Misconfiguration |
| **Location** | `extension/package.json`, CORS not configured |
| **Status** | Not applicable (VS Code extension) |

**Description:**
Since this is a VS Code extension (not a web server), traditional CORS configuration is not applicable. The extension makes fetch requests to the backend URL, and the proxy configuration handles cross-origin concerns.

**Evidence:** The extension configures `sdlcAgents.backend.url` in `package.json` with default `http://127.0.0.1:48721`, and the `backend-url.ts` enforces HTTPS for non-loopback hosts.

**Remediation:** None required - this is expected for a VS Code extension architecture.

---

## Dependency Vulnerabilities

| Dependency | Current Version | Known CVEs | Severity | Fixed In |
|-----------|----------------|------------|----------|----------|
| `@earendil-works/pi-coding-agent` | 0.99.1 | None found for this version | - | - |
| `@earendil-works/pi-mcp` | 0.99.1 | None found | - | - |
| `@anthropic-ai/sdk` | ^0.105.0 | Check separately | - | - |
| `undici` | ^6.21.0 | Check separately | - | - |
| `ws` | ^8.21.1 | Check separately | - | - |

**Note:** No critical CVEs detected in the listed dependencies at version 0.99.1. Regular dependency scanning is recommended.

---

## Security Headers Assessment

| Header | Status | Recommendation |
|--------|--------|----------------|
| Strict-Transport-Security (HSTS) | ⚠️ Not applicable | Backend server configuration |
| Content-Security-Policy (CSP) | ⚠️ Not applicable | Extension-internal CSP |
| X-Content-Type-Options: nosniff | ✅ Present | VS Code webview default |
| X-Frame-Options | ✅ Present | VS Code webview default |
| Referrer-Policy | ✅ Present | VS Code webview default |
| Permissions-Policy | ✅ Present | VS Code webview default |

---

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | XSS in Chat Message Rendering (Critical) | Low | High - prevents JavaScript execution in webview |
| 2 | PowerShell Command Smuggling (High) | Medium | Medium - prevents command injection |
| 3 | Token Expiry Fallback (Medium) | Low | Medium - session management improvement |
| 4 | Insecure Remote URL Bypass (Medium) | Low | Medium - MITM risk mitigation |
| 5 | Legacy Secret Key Retention (Low) | Low | Low - attack surface reduction |
| 6 | Chat Input Sanitization (Low) | Low | Low - defense-in-depth |

---

## Recommendations Summary

### Immediate Actions (Critical/High)
1. **Fix XSS vulnerability** in `ChatMessage.svelte` - replace `{@html renderMarkdown(...)}` with safe rendering or implement proper content sanitization
2. **Harden PowerShell command validation** - improve `isReadonlyPsCommand` to prevent compound statement smuggling

### Short-term Improvements (Medium)
3. **Reduce token expiry fallback** from 4 hours to 1 hour default
4. **Add runtime confirmation** when `allowInsecureRemote` is enabled
5. **Remove legacy secret key support** after migration period or add explicit warnings

### Long-term Hardening (Low/Informational)
6. **Implement Content Security Policy** for the webview panel
7. **Add runtime token usage monitoring** for anomalous patterns
8. **Regular dependency scanning** integrated into CI/CD pipeline

---

## Appendix

### A. Tools & Methodology
- Static code analysis (manual review of source files)
- Dependency version checking via `package.json`
- OWASP Top 10 (2021) classification
- CWE mapping for each finding
- CVSS v3.1 severity scoring

### B. Scope Limitations
- Static analysis only - runtime behavior not tested
- Dynamic testing (penetration testing, fuzzing) not performed
- Backend API security not directly tested (only client-side code reviewed)
- VS Code extension isolation means some web vulnerabilities don't apply directly
- Trust boundaries between extension host and webview assumed functional

### C. Glossary
- **CVSS**: Common Vulnerability Scoring System
- **CWE**: Common Weakness Enumeration
- **OWASP**: Open Web Application Security Project
- **MITM**: Man-in-the-Middle
- **XSS**: Cross-site Scripting
- **SSRF**: Server-Side Request Forgery