# Security Design Review — SA4E-410

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-410 |
| Title | Context Usage UI Enhancements & Small-Context Compaction Guard |
| Review Date | 2026-11-07 |
| Reviewer | Security Agent |
| TDD Version | 1.0 |
| Status | Draft |

---

## Executive Summary

This security design review covers the TDD for SA4E-410 which implements three features:

1. **Small-Context Compaction Guard** — Raises auto-compaction threshold from 95% to 97% and requires minimum 6 messages (vs. 2) for models with `maxTokens < 16,384`
2. **Client-Side Context Usage Detail on Click** — Clicking the context arc gauge displays a detailed toast with token counts, percentages, and category breakdown
3. **Client-Side MCP Server List Detail on Click** — Clicking an MCP server entry shows connection status via toast

**Overall Risk Rating: MEDIUM**

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 1 |
| 🟡 Medium | 3 |
| 🔵 Low | 2 |
| ℹ️ Informational | 3 |

### Key Findings

1. **HIGH**: Missing `showToast` implementation — click handlers call `S.showToast()` but the function is not defined in the webview codebase, causing silent failures
2. **MEDIUM**: XSS risk in `chat-context-usage.js` click handler — HTML built via string concatenation without `escapeHtml` on `breakdown` values
3. **MEDIUM**: XSS risk in `chat-context-usage.js` `updateContextIcon` — `breakdown` values directly interpolated into `innerHTML` without escaping
4. **MEDIUM**: Small-context guard threshold manipulation — potential DoS via crafted `maxTokens` values
5. **LOW**: Data exposure — token counts and breakdown shown in UI (low sensitivity but visible)
6. **LOW**: Client-side trust assumption — no server-side validation of compaction thresholds
7. **INFO**: `escapeHtml` function exists but is not consistently used
8. **INFO**: CSP is properly configured with nonce-based script-src
9. **INFO**: No host round-trip for click handlers reduces attack surface

---

## Detailed Findings

### Finding #1: Missing `showToast` Implementation Causes Silent Failure

| Attribute | Value |
|-----------|-------|
| **Severity** | High |
| **OWASP Category** | A05:2021 — Security Misconfiguration |
| **CWE** | CWE-754: Improper Check for Unusual or Exceptional Conditions |
| **CVSS Score** | 7.5 |
| **Location** | `chat-context-usage.js:107`, `chat-sidebar.js:60` |
| **Status** | Open |

**Description:**
The click handlers in both `chat-context-usage.js` (line 107) and `chat-sidebar.js` (line 60) call `S.showToast(html, 4000)` to display detailed information toasts. However, `S.showToast` is **not defined anywhere in the webview JavaScript codebase**. The `ChatState` namespace (initialized in `chat-core.js`) does not include a `showToast` function.

The optional chaining `S.showToast && S.showToast(...)` prevents runtime errors, but the feature silently fails — users clicking the context gauge or MCP server entries see no toast, with no error indication.

**Evidence:**
```javascript
// chat-context-usage.js:107
S.showToast && S.showToast(html, 4000);

// chat-sidebar.js:60
S.showToast && S.showToast(detail, 4000);
```

**Impact:**
- Feature non-functional for users
- No visibility into context usage details or MCP server status on click
- Silent failure makes debugging difficult

**Remediation:**
Implement `S.showToast` in `chat-core.js` or a dedicated toast module:
```typescript
// In chat-core.js (after escapeHtml definition)
S.showToast = function(html, durationMs = 4000) {
  if (!S.contextToast || !S.toastText) return;
  S.toastText.innerHTML = html;  // HTML is pre-sanitized by caller
  S.contextToast.classList.add('visible');
  setTimeout(() => {
    S.contextToast.classList.remove('visible');
  }, durationMs);
};
```

**References:**
- CWE-754: https://cwe.mitre.org/data/definitions/754.html

---

### Finding #2: XSS in `updateContextIcon` — Unescaped `breakdown` Values in `innerHTML`

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A03:2021 — Injection |
| **CWE** | CWE-79: Improper Neutralization of Input During Web Page Generation (XSS) |
| **CVSS Score** | 5.3 |
| **Location** | `chat-context-usage.js:41-45` |
| **Status** | Open |

**Description:**
The `updateContextIcon` function builds tooltip HTML by directly interpolating `breakdown` values into an `innerHTML` assignment without escaping:

```javascript
contextTooltip.innerHTML =
  '<div style="font-weight:600;margin-bottom:4px;">Context Usage<span style="float:right">' + pct + '%</span></div>' +
  '<div>Conversation<span style="float:right">' + (breakdown.conversation || 0) + '%</span></div>' +
  '<div>MCP tools<span style="float:right">' + (breakdown.mcpTools || 0) + '%</span></div>' +
  '<div>Steering files<span style="float:right">' + (breakdown.steering || 0) + '%</span></div>';
```

While `breakdown` values are expected to be numeric percentages from the host, they originate from `ContextUsageTracker` which processes message content. If a malicious or buggy token counter returns a string containing HTML/JS (e.g., via prototype pollution or type confusion), it would execute in the webview context.

**Evidence:**
- `breakdown.conversation`, `breakdown.mcpTools`, `breakdown.steering` used directly in string concatenation
- `S.escapeHtml` function exists but is not used here
- Data flows: Host → `tab:contextUpdate` message → `handleContextUpdate` → `updateContextIcon`

**Impact:**
- Potential XSS if `breakdown` values can be manipulated
- Webview runs with VS Code extension privileges (access to `acquireVsCodeApi()`)
- Could lead to arbitrary code execution in extension host context

**Remediation:**
Use `S.escapeHtml` on all dynamic values, or better, use `textContent` for data-only elements:
```javascript
// Safe approach using textContent
contextTooltip.innerHTML = '';
const title = document.createElement('div');
title.style.cssText = 'font-weight:600;margin-bottom:4px;';
title.textContent = 'Context Usage';
const pctSpan = document.createElement('span');
pctSpan.style.float = 'right';
pctSpan.textContent = pct + '%';
title.appendChild(pctSpan);
contextTooltip.appendChild(title);

// Helper for breakdown rows
function addRow(label, value) {
  const row = document.createElement('div');
  row.textContent = label;
  const valSpan = document.createElement('span');
  valSpan.style.float = 'right';
  valSpan.textContent = (value || 0) + '%';
  row.appendChild(valSpan);
  contextTooltip.appendChild(row);
}
addRow('Conversation', breakdown.conversation);
addRow('MCP tools', breakdown.mcpTools);
addRow('Steering files', breakdown.steering);
```

**References:**
- CWE-79: https://cwe.mitre.org/data/definitions/79.html
- OWASP XSS Prevention Cheat Sheet

---

### Finding #3: XSS in Click Handler — Unescaped `breakdown` Values in Toast HTML

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A03:2021 — Injection |
| **CWE** | CWE-79: Improper Neutralization of Input During Web Page Generation (XSS) |
| **CVSS Score** | 5.3 |
| **Location** | `chat-context-usage.js:100-104` |
| **Status** | Open |

**Description:**
The click handler builds toast HTML by directly interpolating `breakdown` values:

```javascript
if (breakdown) {
  html += '<div style="margin-top:8px">' +
    '<div>Conversation: ' + (breakdown.conversation||0) + '%</div>' +
    '<div>MCP tools: ' + (breakdown.mcpTools||0) + '%</div>' +
    '<div>Steering: ' + (breakdown.steering||0) + '%</div>' +
    '</div>';
}
```

Same risk as Finding #2 — if `breakdown` values contain malicious strings, they execute when the toast is rendered via `innerHTML` (in the missing `showToast` implementation).

**Evidence:**
- `breakdown` values from `ChatState` tab state
- No `S.escapeHtml` usage on these values
- Toast renders via `innerHTML` (implied by `toastText.innerHTML = html` in remediation)

**Impact:**
- XSS when user clicks context gauge
- Requires user interaction (click) but high impact if exploited

**Remediation:**
Use `S.escapeHtml` on all dynamic values:
```javascript
if (breakdown) {
  html += '<div style="margin-top:8px">' +
    '<div>Conversation: ' + S.escapeHtml(String(breakdown.conversation||0)) + '%</div>' +
    '<div>MCP tools: ' + S.escapeHtml(String(breakdown.mcpTools||0)) + '%</div>' +
    '<div>Steering: ' + S.escapeHtml(String(breakdown.steering||0)) + '%</div>' +
    '</div>';
}
```

**References:**
- CWE-79: https://cwe.mitre.org/data/definitions/79.html

---

### Finding #4: Small-Context Guard Threshold Manipulation — Potential DoS

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A04:2021 — Insecure Design |
| **CWE** | CWE-400: Uncontrolled Resource Consumption |
| **CVSS Score** | 4.8 |
| **Location** | `context-compaction.ts:107-110` |
| **Status** | Open |

**Description:**
The small-context guard logic in `compactIfThreshold` uses `maxTokens` from the payload to determine compaction thresholds:

```typescript
const maxTokens = payload.maxTokens || 0;
const isSmallContext = maxTokens > 0 && maxTokens < 16384;
const messageThreshold = isSmallContext ? 6 : 2;
const compactThreshold = isSmallContext ? 0.97 : COMPACT_USAGE_THRESHOLD; // 0.95
```

If an attacker can influence `maxTokens` (via model registry manipulation, probe spoofing, or crafted `tab:contextUpdate` messages), they could:
1. **Force aggressive compaction** — Set `maxTokens` just below 16384 to trigger 97% threshold with only 6 messages, causing frequent compaction loops
2. **Disable compaction** — Set `maxTokens` very high to keep threshold at 95% with only 2 messages, allowing context to fill completely
3. **Cause thrashing** — Oscillate `maxTokens` around the 16384 boundary

The `maxTokens` value comes from `resolveMaxTokensFromEngine()` which queries the model registry (`getModelContextWindow()`) first, then falls back to probe (`getDetectedContextWindow()`). If the registry or probe can be manipulated, the thresholds change.

**Evidence:**
- `maxTokens` derived from external model registry/probe
- No validation/sanitization of `maxTokens` before threshold calculation
- Threshold logic directly uses raw `maxTokens` value

**Impact:**
- Potential DoS via excessive compaction (CPU/memory)
- Context window exhaustion leading to truncated conversations
- Degraded user experience

**Remediation:**
Add bounds checking and validation on `maxTokens`:
```typescript
function compactIfThreshold(deps: ContextUsageDeps, tabId: string, messages: any[], payload: ContextUsagePayload): ContextUsagePayload {
  const usageFraction = normalizeUsageToFraction(payload.total.percentage);
  
  // Validate maxTokens - clamp to reasonable range
  const rawMaxTokens = payload.maxTokens || 0;
  const MAX_REASONABLE_TOKENS = 2_000_000; // e.g., 2M tokens
  const MIN_REASONABLE_TOKENS = 1024;      // e.g., 1k tokens
  const maxTokens = Math.min(Math.max(rawMaxTokens, MIN_REASONABLE_TOKENS), MAX_REASONABLE_TOKENS);
  
  const isSmallContext = maxTokens < 16384;
  const messageThreshold = isSmallContext ? 6 : 2;
  const compactThreshold = isSmallContext ? 0.97 : COMPACT_USAGE_THRESHOLD;
  
  // ... rest of function
}
```

Also consider adding rate limiting on compaction triggers per tab.

**References:**
- CWE-400: https://cwe.mitre.org/data/definitions/400.html

---

### Finding #5: Data Exposure — Token Counts and Breakdown Visible in UI

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP Category** | A01:2021 — Broken Access Control |
| **CWE** | CWE-200: Exposure of Sensitive Information to an Unauthorized Actor |
| **CVSS Score** | 2.1 |
| **Location** | `chat-context-usage.js:96-104`, `chat-sidebar.js:57-59` |
| **Status** | Open |

**Description:**
The context usage detail toast and MCP server detail toast display:
- Absolute token counts (`tokenCount`, `maxTokens`)
- Percentage usage
- Category breakdown (Conversation / MCP Tools / Steering percentages)
- MCP server names and connection status

While this data is not highly sensitive (it's operational metadata about the current chat session), it is exposed to any user with access to the VS Code window. In shared/remote development scenarios, this could leak information about:
- Model context window size (infrastructure detail)
- Token consumption patterns
- Which MCP servers are configured

**Evidence:**
```javascript
// chat-context-usage.js:96-98
var html = '<div style="font-weight:700;margin-bottom:8px">Context Details</div>' +
  '<div>' + tokenCount.toLocaleString() + ' / ' + maxTokens.toLocaleString() + ' tokens (' + pct + '%)</div>' +
  '<div style="margin-top:6px;color:#888">4% of window = ' + fourPct.toLocaleString() + ' tokens</div>';

// chat-sidebar.js:57-59
var detail = '<div style="font-weight:700;margin-bottom:6px">MCP Server: ' + S.escapeHtml(name) + '</div>' +
  '<div>Status: ' + (srv ? srv.status : 'unknown') + '</div>' +
  '<div>Details shown client-side to avoid tool-call loops.</div>';
```

**Impact:**
- Low — operational metadata only, no PII or secrets
- Visible only to local user with VS Code access

**Remediation:**
- No code change required
- Document in threat model that this data is intentionally visible to local user
- Consider adding a setting to disable detailed tooltips in high-security environments

**References:**
- CWE-200: https://cwe.mitre.org/data/definitions/200.html

---

### Finding #6: Client-Side Trust — No Server-Side Validation of Compaction Logic

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP Category** | A04:2021 — Insecure Design |
| **CWE** | CWE-602: Client-Side Enforcement of Server-Side Security |
| **CVSS Score** | 3.7 |
| **Location** | `context-compaction.ts:102-123` |
| **Status** | Open |

**Description:**
The compaction logic runs entirely in the extension host (TypeScript), which is good — it's not client-side JavaScript. However, the `maxTokens` value used for threshold decisions comes from the model registry/probe via `PiWorkflowAdapter`. If the registry returns an attacker-controlled value, the compaction behavior changes.

The TDD notes "Registry-first context window" and "never hardcoded 128000 as source" which is correct design. However, there's no validation that the registry value is within expected bounds for the claimed model.

**Evidence:**
- `resolveMaxTokensFromEngine()` → `getModelContextWindow()` (registry) → fallback to `getDetectedContextWindow()` (probe)
- No allowlist of known model context windows
- No anomaly detection on registry values

**Impact:**
- If registry is compromised, compaction thresholds can be manipulated
- Low likelihood in local VS Code extension context

**Remediation:**
- Add model allowlist with expected context window ranges
- Log warnings when registry returns unexpected values
- Consider hardcoded fallback limits as safety net

**References:**
- CWE-602: https://cwe.mitre.org/data/definitions/602.html

---

### Finding #7: `escapeHtml` Function Exists But Inconsistently Used

| Attribute | Value |
|-----------|-------|
| **Severity** | Informational |
| **OWASP Category** | A03:2021 — Injection |
| **CWE** | CWE-79: Improper Neutralization of Input During Web Page Generation |
| **CVSS Score** | 0.0 |
| **Location** | `chat-core.js:108-110` (definition), multiple call sites |
| **Status** | Open |

**Description:**
The `S.escapeHtml` function is properly implemented in `chat-core.js`:
```javascript
S.escapeHtml = function (str) {
  return (str || "").replace(/&/g, "\x26amp;").replace(/</g, "\x26lt;").replace(/>/g, "\x26gt;");
};
```

It is used correctly in many places (`chat-sidebar.js`, `chat-chips.js`, `chat-render.js`, `chat-input.js`, `chat-render-tool.js`, `chat-steering.js`, `chat-stream.js`, `chat-slash.js`, `model-picker-popup.js`, `chat-attachments.js`).

However, it is **NOT used** in:
1. `chat-context-usage.js` — both `updateContextIcon` (tooltip) and click handler (toast)
2. `markdown-renderer.js` has its own duplicate `escapeHtml` implementation

**Remediation:**
- Apply `S.escapeHtml` to all dynamic values in `chat-context-usage.js`
- Consolidate `escapeHtml` to single implementation in `chat-core.js`
- Consider adding ESLint rule to flag `innerHTML` assignments without escaping

**References:**
- OWASP XSS Prevention Cheat Sheet

---

### Finding #8: CSP Properly Configured with Nonce-Based Script-Src

| Attribute | Value |
|-----------|-------|
| **Severity** | Informational (Positive) |
| **OWASP Category** | A05:2021 — Security Misconfiguration |
| **CVSS Score** | 0.0 |
| **Location** | `ChatHtmlBuilder.ts:62` |
| **Status** | ✅ Secure |

**Description:**
The Content Security Policy is properly configured in `ChatHtmlBuilder.build()`:

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} data:; font-src ${cspSource}; connect-src 'none';">
```

**Strengths:**
- `default-src 'none'` — deny by default
- `script-src 'nonce-...'` — only scripts with correct nonce execute
- `connect-src 'none'` — no network requests from webview (good for extension)
- Nonce generated per-load via `getNonce()`

**Note:** `'unsafe-inline'` for styles is acceptable for VS Code webviews but could be tightened with nonce-based styles.

---

### Finding #9: No Host Round-Trip for Click Handlers — Reduced Attack Surface

| Attribute | Value |
|-----------|-------|
| **Severity** | Informational (Positive) |
| **OWASP Category** | A04:2021 — Insecure Design |
| **CVSS Score** | 0.0 |
| **Location** | `chat-context-usage.js:85-107`, `chat-sidebar.js:54-61` |
| **Status** | ✅ Secure Design |

**Description:**
Both click handlers (context gauge and MCP server list) are implemented purely client-side:
- No `postMessage` to host
- No tool calls
- No async operations
- Data read from local `ChatState`

This design eliminates:
- Injection via host message handling
- Tool call loops (explicitly noted in code comment)
- Network/latency attacks
- Server-side DoS from repeated clicks

**Evidence:**
```javascript
// chat-context-usage.js:83-86 - "avoid postMessage loop"
contextUsageIcon.addEventListener("click", function(e) {
  e.stopPropagation();
  var tab = S.getTab ? S.getTab(S.activeTabId) : null;
  // ... reads local state only
  S.showToast && S.showToast(html, 4000);
});

// chat-sidebar.js:54-61
el.addEventListener('click', function() {
  // ... reads local servers closure array
  S.showToast && S.showToast(detail, 4000);
});
```

---

## OWASP Top 10 (2021) Mapping

| OWASP Category | Findings | Status |
|----------------|----------|--------|
| A01:2021 — Broken Access Control | #5 (Low) | ✅ Mitigated by design (local-only) |
| A02:2021 — Cryptographic Failures | None | N/A |
| A03:2021 — Injection | #2, #3 (Medium), #7 (Info) | 🔴 Action Required |
| A04:2021 — Insecure Design | #4 (Medium), #6 (Low) | 🟡 Review Required |
| A05:2021 — Security Misconfiguration | #1 (High), #8 (Info+) | 🔴 Action Required |
| A06:2021 — Vulnerable Components | None identified | ✅ |
| A07:2021 — Auth Failures | None | N/A |
| A08:2021 — Integrity Failures | None | N/A |
| A09:2021 — Logging Failures | None | N/A |
| A10:2021 — SSRF | None | N/A |

---

## Dependency Vulnerabilities

No third-party dependencies are directly used in the reviewed files. The webview uses vanilla JavaScript with VS Code's `acquireVsCodeApi()`. The TypeScript host code uses:
- `@vscode/webview` — VS Code API (managed by VS Code)
- Internal modules only

No `package.json` vulnerabilities to report for this scope.

---

## Security Headers Assessment

| Header | Status | Recommendation |
|--------|--------|----------------|
| Content-Security-Policy | ✅ Configured | Consider nonce for styles |
| X-Content-Type-Options | N/A | Webview not served via HTTP |
| X-Frame-Options | N/A | Webview not served via HTTP |
| Referrer-Policy | N/A | Webview not served via HTTP |
| Permissions-Policy | N/A | Webview not served via HTTP |

Note: VS Code webviews run in a special context (`vscode-webview:` protocol), not standard HTTP. Security headers are enforced via CSP meta tag and VS Code's webview sandbox.

---

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | #1: Missing `showToast` implementation | Low | High — feature broken |
| 2 | #2: XSS in `updateContextIcon` tooltip | Low | Medium — XSS on hover |
| 3 | #3: XSS in click handler toast | Low | Medium — XSS on click |
| 4 | #4: Small-context guard threshold validation | Medium | Medium — DoS potential |
| 5 | #6: Registry value validation | Medium | Low — defense in depth |
| 6 | #7: Consistent `escapeHtml` usage | Low | Low — code quality |
| 7 | #5: Data exposure documentation | Low | Informational |

---

## Recommendations Summary

### Immediate Actions (Critical/High)
1. **Implement `S.showToast` function** in `chat-core.js` to enable click-to-detail feature
2. **Apply `S.escapeHtml` to all dynamic values** in `chat-context-usage.js` (both `updateContextIcon` and click handler)

### Short-term Improvements (Medium)
3. **Add bounds validation on `maxTokens`** in `compactIfThreshold` before threshold calculation
4. **Add model allowlist with expected context window ranges** in `PiWorkflowAdapter` or `resolveMaxTokensFromEngine`
5. **Consolidate `escapeHtml` implementation** — remove duplicate in `markdown-renderer.js`

### Long-term Hardening (Low/Informational)
6. **Add rate limiting on compaction triggers** per tab to prevent thrashing
7. **Document threat model** for data exposure in shared/remote development scenarios
8. **Consider ESLint rule** to flag `innerHTML` assignments without escaping
9. **Evaluate nonce-based styles** in CSP to remove `'unsafe-inline'`

---

## Appendix

### A. Tools & Methodology
- Static code analysis (manual review of TypeScript/JavaScript source)
- Data flow tracing from host to webview
- OWASP Testing Guide v4.2 methodology
- CSP configuration review

### B. Scope Limitations
- **Not tested**: Runtime behavior, dynamic analysis, penetration testing
- **Not tested**: Infrastructure security (VS Code, Electron, Node.js)
- **Not tested**: MCP server communication security (out of scope for this TDD)
- **Assumption**: `breakdown` values are numeric from trusted host code
- **Assumption**: Model registry (`getModelContextWindow`) is not attacker-controlled

### C. Glossary
- **CSP**: Content Security Policy
- **CWE**: Common Weakness Enumeration
- **CVSS**: Common Vulnerability Scoring System
- **MCP**: Model Context Protocol
- **OWASP**: Open Web Application Security Project
- **XSS**: Cross-Site Scripting
- **DoS**: Denial of Service

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Security Reviewer | Security Agent | 2026-11-07 | ✅ |
| Solution Architect | (pending) | | |
| Developer | (pending) | | |