# 🔒 Security Assessment Report

## Document Information
| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise |
| Scope | SA4E-247 Phase 5.7 Security Review Code — extension/src/webview/components/kb-graph |
| Date | 2026-09-06 |
| Assessor | Security Agent |
| Version | 1.0 |

## Executive Summary

Security review code cho SA4E-247 đã hoàn thành cho các component LegendWindow, MinimapController, FilterPanel, FilterSearchInput, stores và utils wildcardMatcher / localStorageSync. Tổng thể mức rủi ro **Medium**.

Các biện pháp mitigation đã được triển khai một phần so với SECURITY-REVIEW thiết kế: safeWildcardToRegExp đã có length cap và escape regex meta, sanitizeWindowState đã clamp giá trị localStorage. Tuy nhiên vẫn còn các lỗ hổng thực tế về postMessage origin validation, XSS qua style attribute color, và thiếu schema validation cho vscode.postMessage.

**Overall Risk Rating:** Medium

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 3 |
| 🔵 Low | 2 |
| ℹ️ Informational | 2 |

## Findings by OWASP Top 10

### A01:2021 — Broken Access Control
**Finding:** postMessage handler không kiểm tra event.origin và không validate schema message.
**Status:** Medium

### A03:2021 — Injection
**Finding 1:** ReDoS wildcard đã được giảm thiểu bởi safeWildcardToRegExp, nhưng không có timeout evaluation và vẫn cho phép backtracking phức tạp với pattern dài 128.
**Status:** Low

**Finding 2:** XSS tiềm ẩn qua color style binding.
**Status:** Medium

### A04:2021 — Insecure Design
**Finding:** localStorage key không scoped theo workspace, thiếu versioning.
**Status:** Low

### A05:2021 — Security Misconfiguration
**Finding:** CSP được áp dụng ở base HTML, nhưng nội dung webview có style inline unsafe-inline.
**Status:** Informational

### A08:2021 — Software and Data Integrity Failures
**Finding:** localStorage load không có integrity check / signature.
**Status:** Low

## Detailed Findings

### Finding #1: PostMessage origin & schema validation missing

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A01, A03 |
| **CWE** | CWE-602, CWE-829 |
| **Location** | extension/src/panels/panel-html.ts:128-140 |
| **Status** | Open |

**Description:**
window.addEventListener('message', ...) trong getBaseHtml không kiểm tra event.origin, không whitelist message.type. handlePanelMessage được gọi trực tiếp với payload từ bất kỳ nguồn nào. Webview có thể nhận message từ iframe nội bộ hoặc attacker-controlled content.

**Evidence:**
```typescript
window.addEventListener('message', (event) => {
  const msg = event.data;
  ...
  if (typeof handlePanelMessage === 'function') { handlePanelMessage(msg); }
});
```

**Impact:**
Nếu webview bị XSS, attacker có thể gửi message giả mạo tới extension host qua vscode.postMessage, gây privilege escalation.

**Remediation:**
```typescript
window.addEventListener('message', (event) => {
  if (event.origin !== window.origin && !event.origin.startsWith('vscode-webview://')) return;
  const msg = event.data;
  if (!msg || typeof msg.type !== 'string') return;
  if (!['serverStatus','error'].includes(msg.type)) return;
  // validate with Zod
  if (typeof handlePanelMessage === 'function') handlePanelMessage(msg);
});
```
Ở extension host, validate schema Zod trước khi xử lý.

---

### Finding #2: XSS via unsanitized color style binding

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A03 Injection |
| **CWE** | CWE-79 |
| **Location** | extension/src/webview/components/kb-graph/LegendWindow.svelte:59 |
| **Status** | Open |

**Description:**
item.color từ backend được bind trực tiếp vào style="background:{item.color}". Svelte escape text nhưng style attribute không được sanitize. Nếu backend trả về `red; background-image:url(javascript:...)` có thể gây injection.

**Evidence:**
```svelte
<span class="color" style="background:{item.color}"></span>
```

**Impact:**
Stored XSS trong webview, leo thang tới postMessage injection.

**Remediation:**
Validate color server-side và client-side bằng regex:
```typescript
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
if (!COLOR_RE.test(item.color)) item.color = '#cccccc';
```
Không bind trực tiếp chuỗi user-controlled vào style.

---

### Finding #3: Wildcard matcher ReDoS residual risk

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP Category** | A03 Injection |
| **CWE** | CWE-1333 |
| **Location** | extension/src/webview/components/kb-graph/utils/wildcardMatcher.ts:5-15 |
| **Status** | Partially Mitigated |

**Description:**
safeWildcardToRegExp đã có length cap 128 và escape meta, tuy nhiên vẫn tạo RegExp mỗi lần input và không có timeout. Pattern `*a*a*a*a*a*a*` có thể gây backtracking.

**Evidence:**
```typescript
const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
const regexSource = '^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
```

**Remediation:**
Giữ hiện tại + thêm debounce 150ms đã có, và giới hạn số lượng ký tự `*` tối đa 5. Có thể dùng `new RegExp` với try/catch và giới hạn thời gian bằng Worker.

---

### Finding #4: localStorage state poisoning DoS

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP Category** | A04 Insecure Design |
| **CWE** | CWE-532 |
| **Location** | extension/src/webview/components/kb-graph/utils/localStorageSync.ts:9-19 |
| **Status** | Mitigated |

**Description:**
sanitizeWindowState đã clamp x,y,w,h. Tuy nhiên loadFromLocalStorage trả về raw JSON parse không validate shape trước khi sanitize, và key không scoped theo workspace.

**Remediation:**
Prefix key với workspace root hash:
```typescript
const LEGEND_KEY = `kb-graph.legend.window:${workspaceRootHash}`;
```
Thêm version field và migration.

---

### Finding #5: Token exposure risk via error logging

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP Category** | A02 Cryptographic Failures |
| **Location** | extension/src/webview/components/kb-graph/utils/localStorageSync.ts:36 |
| **Status** | Open |

**Description:**
console.warn trên localStorage quota exceeded không lộ token, nhưng fetch wrapper chưa được audit. Nếu error được log kèm headers, JWT có thể lộ.

**Remediation:**
Wrap fetch để strip Authorization khỏi error logs.

---

## Dependency Vulnerabilities

Không phát hiện dependency mới. Svelte 4, Vite, Three.js hiện tại không có CVE liên quan.

## Security Headers Assessment

| Header | Status | Recommendation |
|--------|--------|----------------|
| Content-Security-Policy | ⚠️ | Giữ nonce, tránh unsafe-inline cho style nếu có thể |
| X-Frame-Options | ✅ | VS Code webview mặc định |
| Referrer-Policy | ✅ | meta referrer no-referrer |

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | PostMessage origin & schema validation | Medium | High |
| 2 | Color validation & style binding | Low | Medium |
| 3 | localStorage workspace scoping | Low | Low |

## Recommendations Summary

### Immediate Actions
1. Thêm origin check và Zod schema validation cho postMessage cả webview ↔ host.
2. Validate color type trước khi render, cấm style injection.
3. Giới hạn số lượng wildcard star.

### Short-term
1. Scope localStorage key theo workspace root.
2. Thêm unit test cho wildcard pathological patterns.
3. Thêm logging security events.

### Long-term
1. Mã hoá nhẹ localStorage state.
2. Thêm Workspace Trust gate.

## Appendix

### Tools & Methodology
Static code review, OWASP ASVS 4.0, VS Code Extension Security Best Practices.

### Scope Limitations
Không dynamic testing, không audit backend API.

### Glossary
ReDoS, postMessage, XSS
