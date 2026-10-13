# 🔒 Security Design Review — SA4E-358 (AC-3 gate)

## Document Information

| Field | Value |
|-------|-------|
| Ticket | SA4E-358 — [Follow-up SA4E-356/SA-01] CORS * + no authN trên loopback :9181 — Origin/Host validation |
| Review target | TDD v1.0 (1027 dòng) + FSD v1.1 (1191 dòng) — design review trước Phase 5 |
| Code đối chiếu | extension/src/services/WrapperServer.ts (337 dòng, branch main) — re-read độc lập 2026-10-13 |
| Evidence nguồn | SA4E-356 SECURITY-ASSESSMENT.md (SA-01) + PENTEST-REPORT.md (P6-15/16/17 live-confirmed ×3) |
| Assessor | Security Agent (độc lập — AC-3 Phase 3.7 gate) |
| Date | 2026-10-13 |
| Version | 1.0 |

---

## Verdict

# ✅ PASS-with-fixes

**Overall Risk Rating: Medium** (thiết kế nền tảng đúng; 1 design gap Medium cần chốt handling trước khi đóng AC-3).

| Severity | Count | IDs |
|----------|-------|-----|
| 🔴 Critical | 0 | — |
| 🟠 High | 0 | — |
| 🟡 Medium | 1 | SEC-358-01 |
| 🔵 Low | 1 | SEC-358-02 |
| ℹ️ Informational | 3 | SEC-358-03..05 |

**Có block Phase 4 (Test Planning) / Phase 5 (Implementation) không? KHÔNG.** Gate thiết kế đúng layer, đúng vị trí, fail-closed, chống được toàn bộ attack surface chính của SA-01 (drive-by readback, preflight abuse, SSE mở, log forging, duplicate-header tricks). Phase 4/5 triển khai bình thường theo TDD §12 (C1..C12).

**Điều kiện kèm verdict (bắt buộc trước khi đóng AC-3 / merge):**
1. **SEC-358-01 phải được chốt handling** bằng 1 trong 2 lựa chọn: (A) fold fix Host-check-for-all-requests vào Phase 5 (khuyến nghị — rẻ, ~5-8 dòng + 3 test cases), hoặc (B) giữ thiết kế + document residual risk + SM tạo follow-up ticket shared-secret (OI-1) chính thức. KHÔNG được để trạng thái "pending mơ hồ" khi merge.
2. V-1..V-4 evidence đầy đủ (đã là điều kiện merge của TDD — OI-3, giữ nguyên).
3. T1..T14 + unit ~30 case + regression 100% PASS, live harness green, bench p99 < 1ms.

---

## Findings Table

| # | Severity | Location (TDD/FSD/code) | Mô tả | Remediation | Owner |
|---|----------|------------------------|-------|-------------|-------|
| SEC-358-01 | 🟡 Medium (5.4) | TDD §3.3 Phase 2 + §8.1 row "DNS rebinding"; FSD §6.1 pseudocode Phase 2/5 + FR-04/BR-05/BR-06 + UC-05 AF-1/EF-1 + TA Note v1.1 (§6.1, dòng 963) | **DNS rebinding same-origin qua nhánh no-Origin — Host check bị skip.** Host check chỉ chạy khi CÓ Origin (FR-04). Kịch bản: attacker phục vụ trang từ chính domain của họ trên port 9181 (http://evil.com:9181/) → DNS rebind evil.com → 127.0.0.1 → sau rebind, fetch/EventSource **same-origin** → browser KHÔNG gắn Origin trên GET → rơi nhánh no-Origin → **PASS dù Host: evil.com:9181**. GET surface lộ: GET /mcp (SSE), /health. Claim "DNS rebinding chặn bởi Host check" (AC-5, §8.1, FSD UC-05 EF-1) bị overstated | **Option A (khuyến nghị):** chạy Host check cho MỌI request CÓ Host (kể cả no-Origin); Host thiếu → chỉ pass khi no-Origin (HTTP/1.0 legacy). Native clients (MCP SDK/undici, HTTP/1.1) luôn gửi Host đúng → zero breakage. Delta ~5-8 dòng + 3 unit cases (H-7/H-8/H-9). **Option B:** giữ thiết kế + document residual + follow-up shared-secret BẮT BUỘC trước release public | SA/SM chốt tại AC-3; DEV implement nếu chọn A |
| SEC-358-02 | 🔵 Low (3.7) | TDD §7.3 + §10.3 (OI-3); FSD §7.3, §9.3 | **Deny log amplification — không rate-limit/cap.** Trang web độc hại có thể loop fetch → mỗi request sinh 1 dòng 403 log → outputChannel phình memory + noise. Gate MỚI tạo kênh log amplification (pre-fix không có deny log). OI-3 đã ghi nhận "KHÔNG rate-limit trong ticket" | Follow-up: cap/throttle deny log (vd chỉ log khi reason đổi hoặc throttle cùng reason < N ms), hoặc gộp vào follow-up shared-secret. Với ticket này: chấp nhận, đã documented | SM (OI-3 tracking) |
| SEC-358-03 | ℹ️ Info | TDD §3.6 echo block; FSD §3.1.6.1-C | **Vary: Origin thiếu trên response echo.** Chuẩn CORS best practice (OWASP): khi ACAO echo theo request Origin, response nên kèm `Vary: Origin`. Tác động thực tế cục bộ ≈ 0 (loopback, không intermediary cache; deny-before-route → không có response-data để poison) | Thêm 1 dòng `res.setHeader("Vary", "Origin")` trong block echo khi implement Phase 5 — không đổi contract | DEV (Phase 5, 1 dòng) |
| SEC-358-04 | ℹ️ Info (pre-existing) | WrapperServer.ts:138-143 | **500 handler echo err.message** ra body cho caller (`JSON.stringify({ error: (err as Error).message })`) — có thể leak chi tiết nội bộ (đường dẫn, fs error). Chỉ caller đã pass gate (trusted) → không phải vector mới; pre-existing, giữ nguyên theo FR-10 | Hardening future (ngoài scope): trả generic message + log full server-side | SM (backlog) |
| SEC-358-05 | ℹ️ Info (design-accepted) | TDD §8.1 "Không trong threat model" + FSD AF-1 UC-01; BRD §1.1.1 | **Non-browser local process forge Origin/Host → full access.** curl/Node gửi `Origin: vscode-webview://x` + `Host: 127.0.0.1:9181` → pass gate. Đã documented out of threat model (local process = đã có full user rights — gate không phải authN boundary). Ghi chú kỹ thuật phụ: WHATWG URL strip \t\n\r trong Origin value ("local\thost" → "localhost") — browser không bao giờ serialize Origin dạng này → không phải bypass thực tế; có thể deny thêm Origin chứa control chars (1 dòng defense-in-depth) | OI-1 shared-secret là mitigation thật — khuyến nghị SM tạo follow-up ticket chính thức (SHOULD, P3) thay vì để mở chung chung | SM (OI-1) |

---

## Điểm thiết kế làm ĐÚNG (ghi nhận — không phải loanh quanh chỉ bắt lỗi)

1. **Single entry point + fail-closed** — gate là statement đầu tiên của `handleRequest`, route-agnostic, 403 uniform mọi path/method (không leak route map); mọi trạng thái không chắc chắn → deny (AD-2/AD-7, G-6).
2. **rawHeaders duplicate reject** (AD-2) — không first-wins, đo bằng nguồn version-independent + dual-check comma. Đúng lựa chọn duy nhất an toàn mọi phiên bản Node (C-3).
3. **sanitize BÊN TRONG gate** (G-3) — WrapperServer không thể log giá trị raw dù muốn. Đây là bài học SEC-05/SA-02 (SA4E-356: sanitize 1/2 biến ở call site) được nâng cấp đúng mức.
4. **XÓA setHeader cũ chứ không ghi đè** (C-2) — nắm đúng semantics `res.setHeader` tích lũy của Node; T11 sweep assert systematic thay vì assert lẻ tẻ.
5. **Allowlist immutable** (BR-09/§8.3) — chặn supply-chain qua workspace settings (attacker tự cho phép origin qua chính side-effect SA-01). Phân tích đúng và quan trọng.
6. **V-1b dùng chính deny log làm capture mechanism** — evidence runtime mạnh hơn proxy trung gian, zero infra thêm.
7. **House pattern nhất quán** — `AuthManager.ts:283-314` (OAuth callback server) trong repo đã áp Host-check + remote-addr + origin + state validation; OriginGate tiếp nối cùng pattern.
8. **Không caching gate decision** (AD-9), **không feature flag** (rollback = revert commit), **deny không đọc body** — cả 3 đều đúng principle, tránh phức tạp hóa không cần thiết.

---

## Detailed Findings

### SEC-358-01 — DNS rebinding same-origin qua nhánh no-Origin (Host check bị skip)

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium (CVSS ~5.4 — AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:L/A:N; impact thực tế hiện tại thấp hơn do GET surface hạn chế, nhưng claim thiết kế bị overstated) |
| **OWASP** | A01:2021 Broken Access Control |
| **CWE** | CWE-350 (Reliance on DNS Resolution within a Security Decision) + CWE-346 (Origin Validation Error) |
| **Location** | TDD §3.3 Phase 2 + §8.1 threat table; FSD §6.1 pseudocode Phase 2/5, FR-04, BR-05, BR-06, UC-05 AF-1/EF-1, TA Note v1.1 (§6.1 dòng 963) |
| **Status** | Open — chốt handling là điều kiện AC-3 |

**Description:**

Thiết kế chạy Host check **CHỈ khi request CÓ Origin** (FR-04/BR-06; TA Note v1.1 tự sửa claim "Host chặn cả khi bỏ Origin"). Trong khi đó, kịch bản DNS rebinding thực tế nhất lại sinh ra request **KHÔNG có Origin**:

1. Attacker điều hành `evil.com`, chạy server HTTP trên **port 9181**, phục vụ trang HTML (DNS TTL thấp, A record → server attacker).
2. Victim mở `http://evil.com:9181/` — origin của trang là `http://evil.com:9181`.
3. Attacker rebind DNS: `evil.com` → `127.0.0.1`.
4. JS trên trang gọi `fetch("http://evil.com:9181/mcp")` hoặc `new EventSource("http://evil.com:9181/mcp")` — **same-origin** theo quan điểm browser → **GET không mang header Origin** (Origin chỉ được browser gắn cho cross-origin, hoặc non-GET).
5. Gate: Phase 2 no-Origin → **PASS echoOrigin=null** — Host check KHÔNG chạy → `Host: evil.com:9181` không bị ai soi → request đi thẳng vào route.

Kết quả: GET surface của wrapper tiếp cận được từ browser sau rebinding mà không vướng lớp nào:
- **GET /mcp (SSE)** — `handleMcpGet` mở stream (endpoint event + initialized + keep-alives). Hiện tại nội dung nghèo (near-zero data), NHƯNG đây là kênh server-push theo thiết kế MCP Streamable HTTP — nếu tương lai wrapper push notification/data thật qua SSE, kênh này trở thành readback đầy đủ.
- **GET /health** — `{"status":"ok","mode":"wrapper"}` (negligible).

**POST `tools/call` nhiều khả năng VẪN bị chặn** — browser gắn Origin cho non-GET (fetch POST/form POST kể cả same-origin theo behavior Chrome/Firefox hiện hành) → `Origin: http://evil.com:9181` ∉ allowlist → deny. Lớp Content-Type check (`application/json`) cũng chặn form/beacon. Đây là lý do impact thực tế hiện tại bị kéo xuống Low-Medium thay vì High.

**Điểm sai trong tài liệu thiết kế (phải sửa nếu chọn Option A, hoặc ghi nhận rõ nếu chọn Option B):**

- TDD §8.1 threat table: vector "DNS rebinding" ghi "Chốt bởi: Host check khi có Origin (FR-04, AC-5)" — **claim overstated**: Host check không chặn case rebinding sinh request no-Origin (chính là case phổ biến nhất vì page và endpoint cùng origin sau rebind).
- FSD UC-05 AF-1 (dòng 368): scenario "rebinding hoàn hảo" mô tả attacker set `Host: 127.0.0.1:9181` — **không khả thi với browser** (browser tự set Host theo URL, attacker không kiểm soát Host header). Scenario browser-thật là Host = `evil.com:9181` + KHÔNG Origin (same-origin GET).
- FSD TA Note v1.1 justification "non-browser tự chịu trách nhiệm header" **không đúng cho case này** — request no-Origin sau rebinding VẪN do browser phát sinh; giả định "no-Origin ⇒ non-browser" bị phá vỡ đúng ở đây.

**Evidence (thiết kế hiện tại — FSD §6.1 Phase 2/5):**

```
# ── Phase 2 — nhánh no-Origin (FR-02a, BR-06) ───────────────────────────
if origin == "":
    return PASS(echoOrigin = null)     # ← Host check KHÔNG chạy — Host: evil.com:9181 đi lọt
...
# ── Phase 5 — Host check (FR-04, BR-03) — CHỈ chạy khi CÓ Origin ────────
```

**Impact:**

- Hiện tại: thấp (SSE gần trống + /health) — nhưng phá vỡ chính claim bảo mật của ticket ("Host check chặn DNS rebinding") và để sẵn kênh readback khi SSE được dùng thật.
- Tương lai: nếu wrapper push notification/data qua SSE (đúng thiết kế MCP), vector trở thành full readback từ browser sau rebinding.

**Remediation — Option A (KHUYẾN NGHỊ, fold vào Phase 5):**

Chạy Host check cho MỌI request có header Host; Host thiếu chỉ được pass khi request no-Origin (HTTP/1.0 legacy). Native clients (MCP SDK StreamableHTTP/SSE trên undici/Node fetch, HTTP/1.1) LUÔN gửi Host đúng `127.0.0.1:<port>`/`localhost:<port>` → zero breakage (và chính V-1b regression sẽ chứng minh).

```
# Phase 1 — extract (giữ nguyên)
...
# Phase 1.5 — Host validation (MỌI request có Host — mới, đóng rebinding same-origin)
if host != "":
    # nguyên logic Phase 5 hiện tại: IPv6 literal deny; hostname ∉ {127.0.0.1, localhost} → deny;
    # port parse + effectivePort !== listenPort → deny
    ...validate...
    hostValid = true
# host == "" → defer: pass chỉ khi no-Origin (HTTP/1.0 legacy), deny khi có Origin

# Phase 2 — no-Origin branch
if origin == "":
    return PASS(echoOrigin = null)     # Host đã validate ở Phase 1.5 nếu có

# Phase 3-4 — parse/allowlist Origin (giữ nguyên)

# Phase 5 — Host required khi có Origin (giữ nguyên EF-1)
if host == "": return DENY("host-mismatch")
```

Test bổ sung: **H-7** no-Origin + `Host: attacker.com:<port>` → DENY host-mismatch (case rebinding); **H-8** no-Origin + `Host: 127.0.0.1:<port>` → PASS; **H-9** no-Origin + không Host (HTTP/1.0) → PASS legacy. Cập nhật: T12 (raw socket no-Origin + Host evil), T13, §8.1 threat table, AC-5 wording, I-invariants (thêm I-8: "Host check áp cho mọi request có header Host").

**Remediation — Option B (nếu giữ thiết kế):**

Ghi nhận residual risk trong TDD §8.1 + FSD §9 (kèm kịch bản cụ thể ở trên), và SM **bắt buộc** tạo follow-up ticket shared-secret (OI-1) với deadline trước release public — shared-secret chặn triệt để cả rebinding lẫn non-browser forged-header (SEC-358-05). Option B chỉ chấp nhận khi có lý do rõ ràng để không đụng FR-04/BR-06.

**References:**
- CWE-350: https://cwe.mitre.org/data/definitions/350.html
- CWE-346: https://cwe.mitre.org/data/definitions/346.html
- OWASP Secure Headers / CORS Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Origin_Resource_Sharing_Policy_Cheat_Sheet.html
- Fetch spec — Origin header append (non-GET + CORS): https://fetch.spec.whatwg.org/

---

### SEC-358-02 — Deny log amplification (không rate-limit/cap)

| Attribute | Value |
|-----------|-------|
| **Severity** | Low (3.7) |
| **OWASP** | A09:2021 Logging Failures (abuse) |
| **CWE** | CWE-770 (Allocation of Resources Without Limits) |
| **Location** | TDD §7.3 + §10.3 (OI-3); FSD §7.3, §9.3 |
| **Status** | Open — accepted for this ticket, follow-up tracked |

**Description:** Gate log 1 dòng cho MỌI deny, không cap. Một trang web trong browser user có thể JS-loop fetch → hàng nghìn 403/phút → mỗi cái 1 dòng log vào outputChannel (in-memory) → memory growth + UI noise. Pre-fix không tồn tại deny log nên đây là bề mặt amplification MỚI do gate tạo ra. TDD §10.3 đã ghi nhận "KHÔNG rate-limit trong ticket" (OI-3) — đánh giá đồng ý chấp nhận cho ticket này vì attacker browser KHÔNG được đọc gì (403 + zero CORS), thiệt hại giới hạn ở local performance.

**Remediation:** Follow-up (gộp OI-3 + OI-1): throttle deny log theo reason (vd không log cùng reason trong <100ms, hoặc đếm aggregate rồi log summary mỗi N giây). Không block ticket.

---

### SEC-358-03 — Vary: Origin thiếu trên response echo (Informational)

**Description:** Khi gate echo ACAO theo request Origin, response nên kèm `Vary: Origin` (OWASP CORS cheat sheet) để HTTP cache không phục vụ response cache của origin này cho origin khác. Với wrapper loopback: không có intermediary cache, deny-before-route nghĩa là attacker không bao giờ tạo được response mang data + ACAO-sai → rủi ro ≈ 0. Vẫn nên thêm vì 1 dòng, zero cost, đúng chuẩn.

**Remediation (Phase 5, trong echo block):**

```typescript
if (gate.echoOrigin !== null) {
  res.setHeader("Access-Control-Allow-Origin", gate.echoOrigin);
  res.setHeader("Vary", "Origin"); // ← thêm — cache không tái dùng response cross-origin
  ...
}
```

---

### SEC-358-04 — 500 handler echo err.message (Informational, pre-existing)

**Description:** `handleRequest` catch-all (`WrapperServer.ts:138-143`) trả `JSON.stringify({ error: (err as Error).message })` — message nội bộ (đường dẫn, fs error detail) leak ra body cho caller. Caller đã pass gate (trusted) nên không phải vector mới; pre-existing và TDD giữ nguyên theo FR-10 — review không yêu cầu đổi trong ticket này.

**Remediation (future hardening):** trả generic `{"error":"Internal error"}` + log full message server-side, hoặc whitelist message types đã sanitize.

---

### SEC-358-05 — Non-browser forge Origin/Host → full access (Informational, design-accepted)

**Description:** Gate không phải authN boundary: bất kỳ local process nào đều set được `Origin: vscode-webview://x` + `Host: 127.0.0.1:9181` và nhận full MCP access + CORS echo. Threat model BRD §1.1.1 + TDD §8.1 đã loại rõ (local malware = đã có full user rights; attacker thật lợi dụng gate không tăng quyền). Đánh giá: chấp nhận được — MIỄN là được document đúng như hiện tại, và OI-1 (shared-secret) được đưa thành follow-up ticket chính thức thay vì mục "chờ chốt" chung chung.

Ghi chú kỹ thuật phụ (defense-in-depth tùy chọn): WHATWG URL strip `\t \n \r` trong Origin value trước khi parse — `Origin: https://local\thost:3000` parse thành hostname "localhost". Browser không bao giờ serialize Origin chứa control chars → không phải bypass thực tế (non-browser only). Nếu muốn siết: deny thêm khi Origin match /[\t\n\r\f\v]/ trước `new URL` — 1 dòng, test 1 case.

**Remediation:** SM tạo follow-up ticket shared-secret (OI-1) — SHOULD, P3. Tùy chọn thêm control-char deny trong Phase 5 (không bắt buộc).

---

## Đánh giá Checklist Review (security lens — 9 mục)

### 1. Gate completeness — ✅ PASS

- Gate là statement đầu tiên của `handleRequest` (:124) — chạy **trước** URL parse, trước mọi setHeader, trước mọi route (I-1). Re-read WrapperServer.ts xác nhận: chỉ có 1 điểm vào HTTP duy nhất; grep toàn extension/src: **duy nhất WrapperServer.ts:126-128 set Access-Control headers** (các match còn lại là bundle vendored `lighthouse-devtools-mcp-bundle.js` — third-party content, không phải surface wrapper).
- Route coverage: POST /mcp, GET /mcp (SSE), OPTIONS preflight (mọi path), /health, 404 fallback — **mọi route đi qua 1 cửa**; caller bị deny nhận 403 uniform **kể cả path không tồn tại** (không leak route map — AD-3 đúng).
- Method coverage: PUT/DELETE/PATCH — gate chạy trước mọi method; caller được phép → 405 từ handleMcp (behavior giữ nguyên); caller bị deny → 403. Đúng.
- Path traversal (`/../../mcp`, `/./mcp`, `/MCP`): vô nghĩa với gate — gate không đọc path, normalize URL diễn ra SAU gate và chỉ route exact-match. Không bypass.
- Scope note (ngoài ticket): grep `createServer` phát hiện **AuthManager.ts:283-389** — một HTTP server loopback khác (OAuth callback). Server này ĐÃ tự áp Host-check + remote-addr + origin + state validation (pattern tốt) → không phải finding, nhưng SM nên ghi nhận trong backlog security review rằng SA4E-358 chỉ phủ WrapperServer :9181.

### 2. Bypass vectors của Origin/Host validation — ⚠️ 1 gap (SEC-358-01), còn lại PASS

| Vector | Đánh giá |
|--------|----------|
| **Origin spoof từ non-browser** (curl/Node) | Thiết kế đã tính — out of threat model có documented (BRD §1.1.1, AF-1 UC-01, §8.1): local process đã có full user rights, gate không phải authN. Chấp nhận — xem SEC-358-05 cho follow-up shared-secret. |
| **DNS rebinding cross-origin** | ✅ Chặn đúng: browser gắn Origin thật (evil.com) → allowlist miss → 403, bất kể Host. UC-05 flow hợp lý. |
| **DNS rebinding same-origin (no-Origin)** | ❌ **Gap — SEC-358-01 (Medium)**: GET sau rebind không mang Origin → nhánh no-Origin PASS, Host không check. Chi tiết + remediation ở finding. |
| **Origin null / file://** | ✅ Deny đúng chủ đích: `null` literal → URL throw → malformed (M-2); `file://x` → scheme ngoài allowlist (M-3). Sandboxed iframe → deny — chấp nhận được cho wrapper use case. |
| **vscode-webview:// opaque origin** | ✅ Parsing đúng: opaque host giữ case → gate tự fold (G-8); host chứa ":" → URL throw → deny (M-7); `host: "*"` chấp nhận được — vscode-webview origin chỉ tồn tại trong webview context (extension-provided content), webview đã là full-trust scope; pattern là exact scheme match + host wildcard, KHÔNG prefix-match lỏng. |
| **Multiple-Origin reject (AD-2)** | ✅ Đủ: đếm trên rawHeaders (version-independent) + dual-check comma. Không first-wins — đúng lựa chọn an toàn mọi Node version. |
| **Header injection / rawHeaders tricks** | ✅ Đủ: Node llhttp chặn CR/LF trong header value (không smuggle được header thứ 2 qua value); OWS được Node trim + gate trim lại; obs-fold bị parser xử lý/reject. Duplicate key → deny. Không thấy vector còn mở. |
| **IPv6 [::1] / 0.0.0.0 / 127.1 / trailing dot** | ✅ Handle đủ: Origin `http://[::1]:3000` → hostname "::1" ∉ allowlist → deny (A-9); `0.0.0.0` → deny; `127.1` → WHATWG URL normalize thành 127.0.0.1 → PASS — **đúng mức trust** (127.1 ≡ 127.0.0.1, cùng máy); trailing dot `localhost.` → deny (A-8, không DNS-normalize — đúng chủ đích, ghi trong pseudocode). Host IPv6 literal → deny (P5b); Host shorthand/trailing-dot → hostname ∉ set → deny. |
| **Referer / Sec-Fetch-Site fallback** | ✅ Cấm đúng (BR-05) — Referer client tự set; Sec-Fetch-Site chỉ Chromium. Không mở tín hiệu trust giả. |

### 3. Deny response hygiene — ✅ PASS (1 Low đã ghi ở SEC-358-02)

- 403 body `{"error":"Forbidden"}` cố định — không leak reason, không stack, không path, không echo attacker header (FR-08; §8.4 classify 403 body = Public). Reason chỉ nằm trong server log (FR-09) — đúng.
- No-ACAO-on-deny: thiết kế đúng control thật (I-2 + T11 sweep systematic + `assertNoAccessControlHeaders` trên MỌI denied response kể cả 404) — C-2 (xóa setHeader cũ, không ghi đè) nắm đúng Node semantics, có test bắt lỗi "quên xóa".
- Log sanitize: `sanitizeLogText` bên trong gate (G-3) + `req.url` sanitize ở call site + `req.method` là token do Node parser kiểm soát (không thể chứa CR/LF). Bài học SA-02 (sanitize MỌI biến) đã được áp — DEV double-check 3 biến này ở code review.
- Rate-limit denied: KHÔNG có → SEC-358-02 (Low, accepted, OI-3).

### 4. Fail-closed audit — ✅ PASS

- Port undefined → `this.port ?? 0` → mọi Host check fail → 403 (AD-7). handleRequest không thể chạy khi chưa listen (Node chỉ dispatch sau listen callback) — fallback là defensive đúng.
- Header parse throw → extractGateHeaders loop guard `i+1 < length` (odd/empty array → undefined → nhánh no-Origin, không crash — E-5).
- URL parse throw → try/catch → deny malformed (P3b).
- Gate KHÔNG throw tổng thể (G-1) + fuzz test R-4 (100 random inputs) + T10 assert "server không crash, request kế tiếp vẫn 200".
- Deny KHÔNG đọc body, KHÔNG `req.destroy()` — Node tự drain sau `res.end()` (FSD §5.3 #10) — đúng, tránh tự tạo edge case.
- Kết luận: mọi error path đều deny hoặc pass-with-rationale; không có path crash hay pass mơ hồ. I-3 "gate không throw" là đủ.

### 5. SSE endpoint — ✅ PASS

- Gate chạy lúc **handshake** (mỗi HTTP request — GET /mcp cũng là 1 request) — 403 đi ra trước khi 1 byte SSE nào được write (C-4; T7 assert body không chứa `event:`/`text/event-stream`).
- Connection giữ sau khi pass: không có risk "allowlist đổi giữa chừng" vì **allowlist là constant** (BR-09) — không tồn tại runtime change để stale. Không cần re-validate per message. Đúng.
- SSE socket được track trong `activeSockets` + force-close on stop (:108-122) — stream không sống vượt vòng đời server.

### 6. V-1/R-3 verify plan — ✅ PASS (plan đủ chặt; 1 khuyến nghị nhỏ)

- Cấu trúc 2 lớp (V-1a static grep HTTP layer từng client + V-1b runtime session thật) + V-1c evidence CSV + V-4 chốt assumption — đủ chặt; V-1b dùng **chính deny log làm capture mechanism** là thiết kế evidence thông minh (zero infra thêm, không thể bỏ sót vì mọi Origin lạ đều sinh log).
- Fallback nếu V-1 fail (native client CÓ gửi Origin): có sẵn — AF-2 UC-04: thêm pattern allowlist theo BR-10 (code change + test, KHÔNG nới `*`) + update T4/T5 + BRD A-1 = refuted. Thiết kế không rơi vào tình huống không lối thoát.
- **Khuyến nghị nhỏ:** VS Code là Electron — nếu MCP client nào chạy ở renderer (Chromium), Origin sẽ là `vscode-file://vscode-app` hoặc tương tự (không phải "không có"). Nên chạy **one-off header capture (V-3 listener) TRƯỚC khi enable gate** để biết trước giá trị Origin thật của từng client, thay vì để optional. DEV/QA: đưa vào C9 như bước đầu tiên.
- Trạng thái blocker (OI-3: V-1..V-4 không chạy đủ → KHÔNG merge) — đúng, giữ nguyên.

### 7. Regressions — ✅ PASS

- **Stdio clients không bị ảnh hưởng:** xác nhận độc lập — `remote-backend-client.ts:120` `invokeTool` gọi `this.wrapperServer!.routeToolCall(...)` **in-process**, không qua HTTP → gate không thể tác động. SDLC agents qua stdio bridge tương tự.
- **routeToolCall envelope SA4E-356 giữ nguyên:** TDD §5.2 row 9 ("KHÔNG THAY ĐỔI" ToolProxy.ts + tool layer) + row 6 + I-7 liệt kê đủ bề mặt phải semantic-identical (handshake :170-182, notifications 202 :184, tools/list :186-190, tools/call envelope :191-195 + :233-254, SSE keep-alive 15s, body limit 1MB :314-326, 405, parse-error, 404/500). Regression suite TC-22..TC-31 + TC-37 + tool-proxy + mcp-handshake.regression bắt buộc pass.
- Native no-Origin client: pass-through, **zero CORS headers** — native không parse CORS → zero functional impact (FSD §3.1.6.1 FR-10 clarify hợp lý; QA không được assert ACAO trên response native — ghi đúng trong T11/T3).
- `wrapper-server.helpers.ts` hiện có (postMcp :79, postRaw :102, openSse :124, createMockOutputChannel :19-20 `appendLine: () => {}`): verify khớp claim TDD §11.1 (không capture → cần helper mới; postMcp hard-code headers → cần requestWithHeaders). Delta test infra được chỉ định cụ thể, không phá helpers cũ.

### 8. Residual risks — ⚠️ Chấp nhận được, với điều kiện

| Residual | Đánh giá | Điều kiện |
|----------|----------|-----------|
| Rebinding same-origin GET (SEC-358-01) | Chưa đóng bởi thiết kế | Chốt Option A hoặc B trước merge (xem finding) |
| Non-browser forged headers (SEC-358-05) | Đã documented out of threat model — hợp lý | OI-1 shared-secret thành follow-up ticket chính thức (SHOULD, P3) |
| OI-2 CSRF-style token | ✅ Đồng ý không làm: wrapper KHÔNG dùng cookie/session → không có bề mặt CSRF kinh điển; Origin gate + SameSite mặc định của browser đã đủ cho bề mặt hiện tại | Chỉ revisit khi wrapper thêm cookie/session |
| Log flooding (SEC-358-02) | Accepted cho ticket | Gộp OI-3 follow-up |
| Non-threat-model: attacker remote từ mạng | ✅ Bind 127.0.0.1 (:98) + T8 assert — ngoài tầm với | Giữ invariant binding (AC-7) |

### 9. SEC-01..08 lessons từ SA4E-356 — ✅ Carry-over đúng

| Lesson (SA4E-356) | Carry-over trong SA4E-358 |
|--------------------|--------------------------|
| SEC-05 sanitizeLogText + bài học SA-02 ("sanitize MỌI biến trong log line") | ✅ G-3 sanitize bên trong gate (nâng cấp so với call-site pattern); deny log có 3 biến động (origin/host/url) — origin/host bắt buộc sanitized từ gate, url sanitize call-site |
| Fail-closed mọi nhánh | ✅ G-1/G-6, §8.2 bảng 7 điểm fail-closed |
| 2-mức testability (pure helper + integration) | ✅ §11.3 — pattern PathResolver tái sử dụng nguyên; unit ~30 case không cần server |
| Attacker-red-then-green harness + evidence CSV | ✅ §11.6 cors-pentest-harness (P6-15/16/17 làm red baseline có sẵn) |
| Envelope/tool-error không phá contract | ✅ FR-10 + I-7 + regression matrix bắt buộc |
| No-workaround (không nới `*`, mở rộng = code change + test) | ✅ BR-10 + §8.3 allowlist immutability |
| N-8 style consistency gate | ⚠️ Không có trong ticket này — thay bằng §8.6 checklist code review + T11 sweep. Đủ cho scope nhỏ (1 method + 1 module mới) |

---

## Recommendations cho DEV (Phase 5)

1. **[SEC-358-01 — nếu SM/SA chốt Option A]** Sửa §3.3 Phase 2/§6.1 pseudocode: Host check áp cho MỌI request có header Host (Phase 1.5), no-Origin + Host thiếu → pass (HTTP/1.0 legacy), có-Origin + Host thiếu → deny (giữ EF-1). Thêm unit cases H-7/H-8/H-9 + cập nhật T12/T13 + AC-5 wording + §8.1 threat table + thêm invariant I-8. SA sign-off cần thiết vì đổi FR-04/BR-06 contract.
2. **Implement đúng §3.6 nguyên văn:** gate là statement đầu tiên; **XÓA** dòng :126-128 (setHeader ACAO */Methods/Headers) — KHÔNG ghi đè sau (C-2); deny path: 1 dòng log + `writeHead(403, {"Content-Type":"application/json"})` trên res sạch + `end('{"error":"Forbidden"}')` + return; echo block `if (gate.echoOrigin !== null)` ngay sau gate; GIỮ NGUYÊN :129-143.
3. **Thêm `res.setHeader("Vary", "Origin")`** trong echo block (SEC-358-03 — 1 dòng).
4. **(Tùy chọn, defense-in-depth)** Deny Origin match /[\t\n\r\f\v]/ trước `new URL` (SEC-358-05 phụ).
5. **KHÔNG refactor ngoài scope** — WrapperServer đã oversized (C-1/OI-5); không đụng routeToolCall/readBody/port-retry/socket tracking; không đổi PathResolver/ToolProxy/remote-backend-client.
6. **Code review bắt buộc theo §8.6 checklist + I-1..I-7** trước PR; đặc biệt: grep `setHeader("Access-Control` chỉ còn trong echo block; gate là lệnh đầu tiên; allowlist readonly không export mutable.
7. **Test không skip:** T11 sweep (15 response), T12 raw-socket duplicate, T13 preflight matrix; `assertNoAccessControlHeaders` trên MỌI denied response + mọi response no-Origin.
8. **Logging kỷ luật:** đúng 1 dòng/deny format §7.3; KHÔNG log allowed request; KHÔNG log body/full headers.
9. **C9 (V-1) bắt đầu bằng one-off header capture** trước khi enable gate (khuyến nghị 6 ở trên).

## Điều kiện merge (AC-3 — tổng hợp)

| # | Điều kiện | Nguồn |
|---|-----------|-------|
| 1 | T1..T14 + unit ~30 case + full regression (TC-22..31/37, tool-proxy, mcp-handshake) 100% PASS | TDD §8.5, §12 |
| 2 | V-1..V-4 evidence đầy đủ (`native-client-headers.md` + CSV); không có open assumption | OI-3, FSD §3.1.4.3 |
| 3 | Live harness green (green bắt buộc; attacker-red optional có baseline P6-15/16/17) | TDD §8.5, §11.6 |
| 4 | **SEC-358-01 đã chốt:** Option A implemented (H-7/H-8/H-9 PASS) HOẶC Option B documented + follow-up ticket shared-secret được tạo | Security review này |
| 5 | Bench p99 < 1ms + e2e delta median < 1ms evidence | TDD §9, FSD §8.1 |
| 6 | Grep xác nhận không còn `ACAO: *` ở bất kỳ đâu; deny response zero CORS (T11 evidence) | AC-8 |
| 7 | Verdict security review cuối: không còn finding Medium+ về CORS/Origin trên :9181 | AC-3 |

---

## Appendix

### A. Phương pháp & Tools
- Static design review (manual, security lens) đối chiếu TDD v1.0 ↔ FSD v1.1 ↔ code thật (branch main, 2026-10-13).
- Re-read độc lập: WrapperServer.ts (337 dòng toàn bộ), PathResolver.ts (sanitizeLogText :189-191), wrapper-server.helpers.ts, remote-backend-client.ts (:118-123), AuthManager.ts (:275-314).
- Greps độc lập: `Access-Control` (toàn extension/src), `createServer|listen` (bề mặt HTTP server), FR-04/BR-06/AF-1 (FSD).
- Live evidence nguồn: SA4E-356 PENTEST-REPORT P6-15/16/17 (ACAO *, preflight 204, SSE no-auth — live-confirmed ×3).
- OWASP Top 10 (2021) + CWE mapping; threat model review theo OWASP Testing Guide v4.2 (thiết kế — chưa dynamic test).

### B. Scope Limitations
- **Đây là design review (static)** — chưa dynamic test gate (sẽ làm ở Phase 6 qua live harness + V-1b). Browser behavior cụ thể (Origin trên same-origin POST theo từng engine/version) dựa trên spec + behavior hiện hành, KHÔNG được verify động trong session này — SEC-358-01 impact thực tế cần confirm ở Phase 6 (test EventSource/fetch same-origin sau rebinding nếu chọn Option B).
- Chưa review backend/ và orchestration (ngoài bề mặt :9181); AuthManager callback server chỉ review skim (out of scope ticket).
- Không test hiệu năng, không test multi-window/reload scenarios (đã có suite riêng).

### C. Glossary
- **ACAO**: Access-Control-Allow-Origin; **OriginGate**: module gate mới (§3 TDD); **no-Origin branch**: nhánh pass cho request không header Origin (BR-06); **rebinding same-origin**: DNS rebinding khiến request của browser trở thành same-origin → không mang Origin; **fail-closed**: trạng thái không chắc chắn → deny.

---

*— Hết Security Review v1.0 — SA4E-358 — Verdict PASS-with-fixes: 1 Medium (SEC-358-01 rebinding no-Origin gap — chốt Option A/B trước AC-3), 1 Low (log amplification — accepted), 3 Informational — KHÔNG block Phase 4/5 — SM ingest vào KB sau khi nhận báo cáo này.*
