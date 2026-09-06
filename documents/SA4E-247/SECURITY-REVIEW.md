# 🔒 Security Review Design — SA4E-247 Phase 3.7
## Cải thiện UI KB Graph: Legend window, Minimap và Filter với tách component

### Document Information
| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise |
| Ticket | SA4E-247 |
| Title | Security Review Design — UI component tách rời, localStorage, vscode.postMessage, API integration |
| Scope | Frontend webview components: LegendWindow, MinimapController, FilterPanel + FilterSearchInput, Svelte stores, localStorage persistence, vscode.postMessage communication, API /api/v1/admin/kb-graph/nodes/summary |
| Date | 2026-09-06 |
| Assessor | Security Agent |
| Version | 1.0 |

## Executive Summary

SA4E-247 là thay đổi frontend-only trong VS Code extension webview nhằm tách các UI component monolithic thành LegendWindow, MinimapController, FilterPanel. State UI được persist qua browser localStorage và điều khiển qua Svelte stores với event bus `vscode.postMessage`/`handlePanelMessage`. API duy nhất được tiêu thụ là `GET /api/v1/admin/kb-graph/nodes/summary` với Bearer JWT.

Tổng quan rủi ro ở mức **Medium**. Không có luồng xử lý bí mật hoặc PII, tuy nhiên có các attack surface điển hình của webview extension: lưu trữ client-side không mã hoá, thông điệp postMessage không được validate nghiêm ngặt, wildcard search chuyển sang RegExp, và hiển thị dữ liệu từ backend không qua sanitization.

**Overall Risk Rating:** Medium

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 1 |
| 🟡 Medium | 3 |
| 🔵 Low | 2 |
| ℹ️ Informational | 2 |

## Threat Model

### Actors
- **Legitimate KB Graph User**: Người dùng VS Code mở KB Graph viewer.
- **Malicious Repository Author**: Thư mục làm việc chứa dữ liệu Pega rule bị kiểm soát bởi attacker, có thể cung cấp node types độc hại.
- **Compromised Webview / Extension Host**: Kẻ tấn công đã kiểm soát nội dung webview qua XSS hoặc extension host compromise.
- **Network Adversary**: Nghe lén / MITM trên kênh API nếu không có TLS.

### Assets
- UI state vị trí/kích thước component (localStorage)
- Filter state, minimap state, legend state
- Dữ liệu node types từ backend `/api/v1/admin/kb-graph/nodes/summary`
- JWT token trong context webview
- Tích hợp `vscode.postMessage` giữa webview và extension host

### Attack Vectors
1. **localStorage Poisoning**: Ghi đè giá trị position/size → DoS UI, clickjacking nội bộ.
2. **Stored/Reflected XSS qua node type name**: Dữ liệu từ backend được render trong LegendWindow/FilterPanel không escaped.
3. **postMessage Spoofing**: Webview gửi message giả mạo tới extension host hoặc tin message không xác thực.
4. **ReDoS via Wildcard Search**: `FilterSearchInput` chuyển `*` `?` sang RegExp không giới hạn độ phức tạp.
5. **API Data Leakage & Token Exposure**: JWT được truyền trong webview fetch, có thể bị khai thác qua lỗi console/log hoặc XSS.
6. **Information Disclosure**: Error message chi tiết từ API hoặc localStorage fallback log ra console.

## OWASP Top 10 Assessment

### A01:2021 — Broken Access Control
- **Risk**: API `/api/v1/admin/kb-graph/nodes/summary` yêu cầu Bearer JWT nhưng frontend webview không thực hiện kiểm tra quyền chi tiết theo workspace/project. Nếu JWT bị lộ qua XSS, attacker có thể gọi API từ webview.
- **Status**: 🟡 Medium — Cần đảm bảo JWT chỉ tồn tại trong secure context và không log.

### A02:2021 — Cryptographic Failures
- **Risk**: State UI lưu trong localStorage không mã hoá. Không chứa secret, nhưng dữ liệu có thể bị đọc bởi extension khác cùng origin.
- **Status**: 🔵 Low — Chấp nhận được vì không PII/secret; khuyến nghị mã hoá nhẹ nếu cần.

### A03:2021 — Injection
- **F-01 Wildcard → RegExp ReDoS**: FSD 3.3.6 đề xuất `pattern.replace(/\*/g, '.*').replace(/\?/g, '.')`. Không có length cap, timeout, hay escape đặc biệt.
- **F-02 PostMessage Injection**: Nếu `handlePanelMessage` không validate `origin`/`message.type`/`payload` schema, attacker có thể gửi message giả.
- **Status**: 🟠 High for ReDoS, 🟡 Medium for postMessage.

### A04:2021 — Insecure Design
- LocalStorage persistence không có versioning/migration → lỗi khi schema thay đổi.
- Deduplication/state cache không scoped theo workspace → khả năng leak state giữa các workspace multi-root.
- **Status**: 🟡 Medium

### A05:2021 — Security Misconfiguration
- Webview CSP chưa được mô tả trong TDD. Mặc định VS Code webview có CSP hạn chế, nhưng nếu thêm inline script/style có thể mở lỗ hổng.
- **Status**: ℹ️ Informational

### A06:2021 — Vulnerable and Outdated Components
- Không thêm dependency mới. Sử dụng Svelte 4, Vite, Three.js hiện tại.
- **Status**: ✅ No issues found

### A07:2021 — Identification and Authentication Failures
- API sử dụng JWT, authentication được thừa kế từ backend. Frontend không cần xác thực riêng.
- **Status**: ✅ No issues found, nhưng cần đảm bảo token lifecycle.

### A08:2021 — Software and Data Integrity Failures
- localStorageSync không có integrity check → dữ liệu bị chỉnh sửa thủ công.
- **Status**: 🔵 Low

### A09:2021 — Security Logging and Monitoring Failures
- Lỗi localStorage full chỉ log warning theo FSD 9.1. Không có audit log cho thay đổi state quan trọng.
- **Status**: ℹ️ Informational

### A10:2021 — Server-Side Request Forgery (SSRF)
- Frontend webview chỉ gọi API internal, không thực hiện fetch tới URL do user cung cấp.
- **Status**: ✅ No issues found

## Detailed Findings

### Finding #1: ReDoS via wildcard search RegExp construction
| Attribute | Value |
|-----------|-------|
| **Severity** | 🟠 High |
| **OWASP Category** | A03:2021 — Injection |
| **CWE** | CWE-1333 Inefficient Regular Expression Complexity |
| **CVSS Score** | 7.5 |
| **Location** | FSD 3.3.6, TDD utils/wildcardMatcher.ts (planned) |
| **Status** | Open |

**Description:**
FilterSearchInput chuyển wildcard `*` `?` sang RegExp bằng `replace(/\*/g, '.*').replace(/\?/g, '.')`. Không có giới hạn độ dài pattern, không escape ký tự RegExp đặc biệt khác, không timeout.

**Impact:**
Attacker có thể tạo tên loại node chứa pattern có backtracking xấu, khiến UI freeze >200ms NFR, làm treo event loop webview.

**Remediation:**
```typescript
function safeWildcardToRegExp(pattern: string): RegExp | null {
  if (!pattern || pattern.length > 128) return null;
  // escape regex meta except * ?
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = '^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
  try { return new RegExp(regex, 'i'); }
  catch { return null; }
}
```
Thêm debounce 150ms và hard deadline evaluation.

**References:** OWASP ReDoS

---

### Finding #2: localStorage UI state poisoning và DoS
| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP Category** | A04:2021 — Insecure Design |
| **CWE** | CWE-532, CWE-212 |
| **Location** | TDD 6.1 Legend Window State Persistence, utils/localStorageSync.ts |
| **Status** | Open |

**Description:**
Vị trí/kích thước LegendWindow được persist qua localStorage với key cố định. Không có validation khi đọc lại. Attacker có thể chỉnh sửa devtools để set `w: 100000`, `x:-9999` gây render lỗi, overflow, hoặc che khuất UI.

**Impact:**
UI DoS, trải nghiệm xấu, có thể gây lỗi layout cascade.

**Remediation:**
```typescript
function sanitizeWindowState(raw: any): WindowState {
  const def = { x:0, y:0, w:400, h:300, maximized:false };
  if (typeof raw !== 'object' || raw===null) return def;
  return {
    x: Math.max(0, Math.min(Number(raw.x)||0, window.innerWidth-100)),
    y: Math.max(0, Math.min(Number(raw.y)||0, window.innerHeight-100)),
    w: Math.max(200, Math.min(Number(raw.w)||400, window.innerWidth-50)),
    h: Math.max(150, Math.min(Number(raw.h)||300, window.innerHeight-50)),
    maximized: !!raw.maximized
  };
}
```
Thêm try/catch quota exceeded fallback to memory store.

---

### Finding #3: vscode.postMessage validation thiếu
| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP Category** | A03:2021 — Injection, A01 Broken Access Control |
| **CWE** | CWE-602, CWE-829 |
| **Location** | FSD 2.2 Event bus via vscode.postMessage / handlePanelMessage |
| **Status** | Open |

**Description:**
Webview giao tiếp với extension host qua postMessage. Thiết kế không mô tả validation schema cho message type, payload, origin. Nếu webview bị XSS, attacker có thể gửi message tùy ý tới host, kích hoạt hành động không mong muốn.

**Impact:**
Command injection / privilege escalation trong extension host nếu host xử lý message không kiểm tra quyền.

**Remediation:**
- Trong webview: chỉ gửi message với type thuộc whitelist, validate payload bằng Zod.
- Trong extension host: kiểm tra `message.origin` === `vscode-webview`, validate schema trước khi xử lý.
- Sử dụng `postMessage` với structured clone và không gửi secret.

---

### Finding #4: XSS qua dữ liệu node type không được sanitize
| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP Category** | A03:2021 — Injection |
| **CWE** | CWE-79 |
| **Location** | LegendWindow.svelte, FilterPanel.svelte |
| **Status** | Open |

**Description:**
Dữ liệu `type` và `color` từ `/api/v1/admin/kb-graph/nodes/summary` được render trực tiếp trong Svelte template. Svelte mặc định escape HTML, nhưng nếu sử dụng `{@html}` hoặc truyền vào thuộc tính style `style="color:...` với giá trị user-controlled có thể dẫn tới injection.

**Impact:**
Stored XSS trong webview, có thể leo thang tới postMessage injection.

**Remediation:**
- Không dùng `{@html}` với dữ liệu backend.
- Validate `color` bằng regex `/^#[0-9a-fA-F]{6}$/`.
- Validate `type` chỉ chứa alphanumeric và dấu gạch nối/underscores.

---

### Finding #5: Token exposure trong webview console / network
| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP Category** | A02 Cryptographic Failures, A07 Identification and Authentication Failures |
| **Location** | API Client, browser fetch |
| **Status** | Open |

**Description:**
JWT Bearer được gắn vào header của fetch tới backend. Nếu lỗi xảy ra và error object được log ra console, token có thể lộ.

**Remediation:**
- Không log response headers.
- Sử dụng VS Code secret storage cho token thay vì để trong JS memory lâu.
- Implement fetch wrapper loại bỏ Authorization khỏi error logs.

---

## Controls & Mitigations

### Immediate Controls
1. **Input Validation**: Zod schema cho tất cả message postMessage và dữ liệu từ API.
2. **Safe Regex**: Áp dụng safeWildcardToRegExp với length cap 128 và timeout.
3. **Sanitize LocalStorage**: Validate và clamp giá trị khi đọc/ghi.
4. **CSP**: Đảm bảo webview CSP mặc định không cho phép `unsafe-inline`.

### Short-term Improvements
1. Thêm unit test cho wildcard matcher với pathological patterns.
2. Thêm integration test cho postMessage roundtrip với schema validation.
3. Log security events: localStorage quota exceeded, invalid message type.

### Long-term Hardening
1. Mã hoá nhẹ localStorage state bằng `crypto.subtle` với key session.
2. Scope localStorage key theo `workspaceRoot` để tránh multi-root leak.
3. Thêm Workspace Trust gate trước khi load dữ liệu node types từ untrusted repo.

## Recommendations Summary

### Critical / High
- Fix ReDoS trong wildcard search trước khi implementation. Thêm test ReDoS.
- Triển khai schema validation cho vscode.postMessage cả hai chiều.

### Medium
- Sanitize và clamp localStorage state.
- Validate color/type từ backend trước khi render.
- Thêm first-open consent khi workspace chứa >N node types.

### Low / Informational
- Tránh log JWT trong error.
- Thêm versioning cho localStorage schema.

## Appendix

### A. Tools & Methodology
- Static design review based on BRD/FSD/TDD
- OWASP ASVS 4.0
- VS Code Extension Security Best Practices

### B. Scope Limitations
- Không thực hiện dynamic testing / penetration test
- Không audit mã nguồn hiện tại, chỉ đánh giá thiết kế
- Không kiểm tra dependency CVE

### C. Glossary
- ReDoS: Regular Expression Denial of Service
- postMessage: API giao tiếp webview ↔ extension host
