# 🔒 Security Assessment Report — SA4E-358 (Phase 5.7 / C11 — Security Code Review)

## Document Information

| Field | Value |
|-------|-------|
| Ticket | SA4E-358 — [Follow-up SA4E-356/SA-01] CORS * + no authN trên loopback :9181 — Origin/Host validation |
| Review target | Implementation commit **7bb9222** (branch main) — OriginGate.ts + WrapperServer.ts gate wiring + test suites |
| Đối chiếu thiết kế | TDD v1.1 (7 phases, AD-10/I-8) + FSD v1.2 (sync N-BA2) + SECURITY-REVIEW.md v1.0 (PASS-with-fixes) |
| Assessor | Security Agent (độc lập — Phase 5.7 gate C11, điều kiện AC-3) |
| Date | 2026-10-14 |
| Version | 1.0 |
| Phương pháp | Static code review thủ công từng phase của gate + wiring + tests, đối chiếu TDD §3.3 v1.1 nguyên văn; bypass hunt chủ động (parse tricks, Host edge, carve-out abuse, TOCTOU); kiểm chứng evidence V-1/LH/bench; git-diff regression surface |

---

## Verdict

# ✅ APPROVED WITH FINDINGS

**Overall Risk Rating: LOW** (cho bề mặt :9181 trong threat model đã chốt — local loopback, gate không phải authN boundary)

| Severity | Count | IDs |
|----------|-------|-----|
| 🔴 Critical | 0 | — |
| 🟠 High | 0 | — |
| 🟡 Medium | 0 | — |
| 🔵 Low | 1 | SA358-R1 (pre-existing) |
| ℹ️ Informational | 2 | SA358-R2, SA358-R3 |

**Có block Phase 6 (Testing) không? KHÔNG.** Implementation khớp TDD v1.1/FSD v1.2 nguyên văn, không tìm thấy bypass mới khả thi trong threat model, evidence merge conditions đủ. **Hai điều kiện kèm theo (không block, bắt buộc đóng trong Phase 6):**
1. **N-QA2 — V-1b dev-host rerun** (harness KHÔNG `--standalone` trên Kiro/VS Code thật :9181) + **V-4** (BRD A-1 status update — thuộc SM/BA) phải PASS trước khi đóng AC-3 cuối cùng / close ticket. Đây là merge condition #2 còn partial — assess chi tiết ở §7.
2. QA sync STC IT-06 step 5 (assert `host-mismatch` theo TDD v1.1/AD-10, STC v1.0 còn ghi `origin-not-allowed` — leftover, test đã ghi comment, deviation note #4).

---

## 1. Bypass Hunt — kết quả thủ công từng phase (OriginGate.ts, 198 dòng)

### Phase 1 — Extract (rawHeaders, duplicate detection) — ✅ KHÔNG có bypass

| Vector | Kết quả |
|--------|---------|
| Duplicate Origin/Host qua rawHeaders | `scanGateHeaders` đếm trên rawHeaders (version-independent, không phụ thuộc join-semantics của `req.headers`) → `duplicateOrigin/duplicateHost` → deny trước khi dùng giá trị. Test: UT-02/03/04, UT-03b, T10 (raw socket), T12.1/2, LH-10/11. **Không first-wins** — đúng AD-2. |
| Key casing (ORIGIN/origin, HOST/host) | Keys lowercased trước so sánh (OriginGate.ts:82,87) — UT-04, T12.3 (lowercase `origin:` vẫn deny). |
| Odd-length / empty rawHeaders | Loop guard `i + 1 < length` (:81) — không throw, không OOB. UT-05, PBT-02 (10k runs, seed 388912). |
| CR/LF/NUL trong header value | Node llhttp chặn ở parser (T9 layer-1: client throw / raw 400); nếu lọt (unit context) → `sanitizeLogText` trong `deny()` (G-3) — PBT-03 (10k) assert không \r\n\0 sống sót trong deny payload. |

### Phase 1.5 — Host check UNCONDITIONAL (SEC-358-01 Option A) — ✅ Đóng đúng, không carve-out abuse

| Vector | Kết quả |
|--------|---------|
| **DNS rebinding same-origin (no-Origin + `Host: evil.com:9181`)** — vector SEC-358-01 | `host !== ""` → validate **trước** nhánh no-Origin (:153-156) → deny `host-mismatch`. Đóng đúng AD-10/I-8. Live: **LH-13** (raw GET /mcp no-Origin + Host evil → 403 + log `host-mismatch`); unit UT-32 (H-7); integration T12.4, T13 row 1b. |
| `Host: LOCALHOST:9181` (uppercase) | PASS — `hostName.toLowerCase()` fold (:110). **Đúng**, không phải bypass: hostname DNS case-insensitive (RFC 3986 §3.2.2), LOCALHOST ≡ 127.0.0.1. UT-31, UT-33. |
| `Host: localhost.evil.com` | hostName `localhost.evil.com` ∉ {127.0.0.1, localhost} → deny. Exact set membership, không substring. |
| Port edge `:0` / `:443` / `:09181` / `:abc` / `:` / no-port | `:0`→0≠listen→deny; `:443`→deny; `:09181`→parseInt=9181→PASS (numeric — G-8, đúng thiết kế: cùng port vật lý); `abc`/`:`→regex ^\d+$ fail→deny; no-port→effectivePort=80≠listen→deny (UT-31b). `+9181`, ` 9181` (space nội bộ) → regex fail → deny. |
| IPv6 literal `[::1]:9181` / bare `::1` | `startsWith("[")` → deny (:106); bare `:.` → tách sai → hostName ∉ set → deny. P5b đúng — server bind 127.0.0.1 nên ::1 không thể chạm (T8 assert bind). |
| Shorthand `127.1` / `0.0.0.0` / trailing dot | Deliberately KHÔNG normalize (LH-14/15, UT corpus PBT-04) — deny. Đúng mức trust (127.1 ≡ loopback về mặt routing nhưng deny là fail-closed, zero breakage native vì native luôn gửi `127.0.0.1`). |
| Multiple Host (rawHeaders) | duplicateHost → deny `host-mismatch` (request-smuggling fail-closed). T12.2, LH-11. |
| **no-Origin + KHÔNG Host (HTTP/1.0 carve-out)** | PASS (UT-34/H-9) — **duy nhất carve-out được pass khi thiếu Host**. Đánh giá: browser KHÔNG BAO GIỜ gửi HTTP/1.0 không Host (browsers dùng HTTP/1.1+/h2) → chỉ non-browser chạm được → trong threat model (SEC-358-05 class). Node `http` chỉ HTTP/1.1 bắt buộc Host (RFC 7230 §5.4); HTTP/1.0 không Host là hợp lệ. Carve-out hẹp đúng như thiết kế. |
| **HTTP/1.1 không Host** | Node llhttp tự trả 400 trước khi tới gate — không phải bề mặt gate. |
| TOCTOU | Gate pure, không cache decision (AD-9); allowlist immutable constant (BR-09); `this.port ?? 0` đọc mỗi request — null (chưa listen/đã stop) → 0 → mọi Host check fail → fail-closed (UT-36). Không có state giữa các request để race. |

### Phase 2-4 — Origin parse + allowlist — ✅ KHÔNG có bypass browser-khả thi

| Vector | Kết quả |
|--------|---------|
| `,` trong Origin (Node join trick) | Dual-check: duplicate trên rawHeaders (:143) + `includes(",")` (:163) → deny malformed. UT-13, T10. |
| Control chars \t\n\r\f\v (UT-39 guard — SEC-358-05 defense-in-depth) | **Đã implement** (:166) — deny TRƯỚC `new URL`, chặn WHATWG strip-trick (`local\thost` → `localhost`). UT-39 assert cả 5 chars + zero false positive. Recommendation #4 của Security Review v1.0 được thực hiện đầy đủ. |
| Backslash `http:\\\\evil.com` | WHATWG parse → host `evil.com` → allowlist miss → deny. |
| Credentials `https://evil@localhost` | `new URL` strip userinfo → hostname `localhost` → **PASS**. Phân tích: browser KHÔNG BAO GIỜ serialize Origin chứa userinfo (Fetch spec §4.4 origin serialization = scheme://host[:port]) → chỉ non-browser gửi được → **SEC-358-05 class (out of threat model)**. Không có kịch bản browser nào bị ảnh hưởng (ACAO echo giá trị này không match origin của browser nào). Ghi nhận → **SA358-R2 (Informational)**. |
| Percent-encoded host `http://local%68ost:3000` | WHATWG percent-decode host special-scheme → `localhost` → PASS — cùng class non-browser-only (browser serialize origin canonical, không encode). Gộp vào SA358-R2. |
| Unicode/homoglyph host | Punycode/decode → không match allowlist → deny. Homoglyph Latin không decode về `localhost` → deny. |
| `vscode-webview://` wildcard — prefix injection? | Pattern là **exact scheme match + host wildcard** (`pattern.scheme === scheme` so sánh chuỗi đầy đủ, không prefix/substring). `vscode-webview-resource://` → scheme khác → deny. Host `evil.com` với scheme vscode-webview → wildcard match, nhưng scheme này chỉ browser engine tạo trong webview context (extension-provided content = full-trust scope) → đúng thiết kế BR-09 + Security Review §2 (đã assess PASS). |
| `vscode-webview://abc:9181` (P3d deviation) | Node 22 WHATWG parse KHÔNG throw như TDD giả định → DEV thêm check: non-special scheme + `url.port !== ""` → deny malformed (:178-180). Deviation **documented** (test-run-summary #2), giữ đúng contract UT-15, fail-closed. Chấp nhận — đúng intent, SA-verified runtime probe. |
| `null` literal / `file://` / `javascript:` / scheme-only `localhost:3000` | URL throw hoặc hostname rỗng → deny malformed. UT-09/10/11/12/37. Sandboxed iframe (`Origin: null`) bị deny — chấp nhận cho wrapper use case (đã document). |
| Scheme/host case fold | `protocol.slice(0,-1).toLowerCase()` + `hostname.toLowerCase()` — `HTTPS://LOCALHOST` PASS với RAW echo (UT-20) — đúng G-8 (fold khi so, RAW khi echo). |
| Allowlist substring/prefix leak (`localhost.attacker.com`, `notlocalhost`) | Exact membership `pattern.host === hostname` — deny. UT-21, UT-23 (trailing dot — không DNS-normalize). |

### Phase 5-6 — Host required + echo — ✅ đúng EF-1/G-4

- Có Origin + không Host → deny `host-mismatch` (:193, UT-28, T6.3 raw HTTP/1.0 + Origin + no Host → 403). ✅
- Echo **RAW trimmed** (không phải `url.origin`) — UT-16/20/25, T4/T5 assert EXACT byte value. ✅
- ACAO chỉ set khi `echoOrigin !== null` (G-5) — native no-Origin KHÔNG BAO GIỜ nhận CORS header (T3, T11 sweep, LH-01 header list). ✅

**Kết luận bypass hunt: không tìm thấy bypass khả thi nào trong threat model.** Mọi vector parse-trick còn PASS đều thuộc class non-browser-only (đã accept qua SEC-358-05 + OI-1 shared-secret follow-up).

---

## 2. WrapperServer Wiring — ✅ PASS (gate-first nguyên vẹn)

| Kiểm tra | Kết quả |
|----------|---------|
| **Gate TRƯỚC mọi route + trước body read** | `handleRequest` (:136-150): `evaluateOriginGate` là **statement đầu tiên** (:138) — trước URL parse, trước setHeader, trước OPTIONS/404/health/handleMcp. Body chỉ được đọc trong `handleMcp` POST **sau** gate. Deny path không drain body chủ đích (Node tự drain sau `res.end()` — đúng FSD §5.3 #10). |
| **Deny path không leak** | 403 + `{"error":"Forbidden"}` cố định (:147-148) — không reason, không stack, không path, không echo attacker header. LH-01 capture đầy đủ header deny response: `[content-type, date, connection, keep-alive, transfer-encoding]` — **zero access-control-\***. |
| **SSE handshake gated** | GET /mcp đi qua cùng `handleRequest` → gate trước `handleMcpGet`. T7: evil → 403, body không chứa `event:`/`text/event-stream` (không 1 byte SSE nào); allowed branch vẫn mở stream bình thường. P6-17 đóng. |
| **Error handler có set CORS?** | Catch-all 500 (:169-174) `writeHead(500)` — CORS headers chỉ tồn tại nếu caller đã pass gate + có allowlisted Origin (echo block đã set trước try) → đúng thiết kế (echo chỉ cho caller được phép). Caller bị deny không bao giờ chạm error handler. |
| **Deny response headers an toàn** | `writeHead(403, {"Content-Type":"application/json"})` trên res sạch — không header nào được set trước gate. ✅ |
| **Old ACAO \* đã XÓA (không ghi đè)** | Git diff 7bb9222: 4 dòng `setHeader("Access-Control-Allow-Origin", "*")` + Methods + Headers bị **xóa bỏ**; grep toàn extension/src (non-test, non-node_modules): CORS emission **duy nhất** WrapperServer.ts:153-155 (echo block). Điều kiện merge #6 ✅ (SCAN script: 528 files PASSED — cors-gate-script-output.txt). |
| **Echo block đúng chỗ** | `if (gate.echoOrigin !== null)` ngay sau gate (:152-157): ACAO = RAW echo, Allow-Methods/Headers, **`Vary: Origin`** (SEC-358-03 — T4 assert `vary` = `Origin`). ✅ |
| **Single entry point** | `http.createServer((req, res) => this.handleRequest(req, res))` (:100) — duy nhất 1 handler; grep `createServer` trong extension/src: WrapperServer + AuthManager (OAuth callback — có sẵn Host-check/origin/state validation riêng, out of scope, đã ghi nhận từ design review). |

## 3. Log Hygiene — ✅ PASS

- **1 dòng/deny**, format cố định `[WrapperServer] Denied request — reason=… origin=… host=… (METHOD URL)` — T9/T1 assert format regex + đếm chính xác số dòng tăng thêm (`expectDeniedLog`).
- **Sanitize bên trong gate** (G-3 — bài học SA-02/SEC-05): `deny()` gọi `sanitizeLogText` cho origin/host; `req.url` sanitize ở call site; `req.method` là token do llhttp kiểm soát (không thể chứa CR/LF). T9 assert **mọi** dòng log không chứa \r\n\0. PBT-03 (10k runs) phủ deny payload.
- **Reason là enum cố định** (`origin-not-allowed` / `host-mismatch` / `malformed-origin`) — không echo raw attacker-controlled. ✅
- **Không log allowed request** (T3: allowed session → deny-log delta = 0). Không log body/full headers. ✅
- **Limitation ghi nhận:** `sanitizeLogText` thay \r\n\0 → "?" nhưng **không** thay \t (tab). Tab không tạo dòng mới trong outputChannel → không log-forging theo nghĩa line-injection; chỉ ảnh hưởng cosmetique nếu log được parse cột. → **SA358-R3 (Informational, defense-in-depth)**.
- **Log flooding (SEC-358-02)**: KHÔNG rate-limit — đúng như thiết kế đã accept cho ticket này (OI-3), không phải finding mới của Phase 5.7.

## 4. Echo Correctness — ✅ PASS

- RAW **trimmed** origin echoed (không normalize qua `url.origin`) — browser so ACAO case-insensitive scheme/host → uppercase echo vẫn hợp lệ; mọi trường hợp echo đều là giá trị browser vừa gửi.
- `Vary: Origin` đúng trong echo block (SEC-358-03 đóng — Security Review recommendation #3).
- ACAO = `\*` không tồn tại ở bất kỳ đâu trong runtime code (grep + semgrep R1/R2 + T4 BR-07 sweep assert mọi access-control header không chứa \*).

## 5. Regressions — ✅ PASS (SA4E-356 envelope + PathResolver nguyên vẹn)

| Bề mặt | Kiểm chứng |
|--------|-----------|
| **routeToolCall envelope (SA4E-356)** | Git diff 7bb9222 trên WrapperServer.ts: **chỉ** thay đổi import + thêm getter `boundAddress` (verify-only) + rewrite `handleRequest`. `routeToolCall` (:264-285), `handleFindTools`, `handleDynamic`, `callWithProxy`, `readBody` (1MB limit), handshake/negotiation/notifications/tools-list, SSE keep-alive 15s, 405/parse-error/404/500 — **byte-identical, không đụng**. `return await` + PathResolverError → Format-1 tool-error giữ nguyên. |
| **stdio không qua gate** | `remote-backend-client.ts:120`: `invokeTool` → `this.wrapperServer!.routeToolCall({name, arguments})` **in-process** — không HTTP → gate không thể deny stdio clients. Native-client-headers.md row 3/4 xác nhận cùng kết luận. |
| **PathResolver** | Không bị commit này đụng (stat chỉ có OriginGate/WrapperServer/tests/docs); `sanitizeLogText` (:189-191) được **reuse** (không copy/drift) — đúng G-3. |
| **Regression suites** | `regression-sa4e-356.e2e.test.ts` + `mcp-handshake.regression.test.ts` + TC-22..43 tồn tại và nằm trong full suite **286 files / 2808 tests / 0 failed** (coverage-summary.txt). T3 chứng minh full native session (initialize → 202 → tools/list → 3× tools/call) flow như cũ + zero CORS. |
| **Bind invariant** | `listen(requestedPort, "127.0.0.1", …)` không đổi (FR-11); T8 + `boundAddress` assert 127.0.0.1 (AC-7). |

## 6. Test Adequacy — ✅ ĐỦ CHẶT (46 unit + 40 integration)

Câu hỏi audit #6 trả lời trực tiếp:

- **Assert zero access-control-\* trên MỌI deny path (404, health)?** — **CÓ.** T11 sweep 5 routes (GET /health, GET /mcp SSE, POST /mcp, OPTIONS /mcp, GET /nonexistent) × 3 branches (evil / webview / native) = **15/15 responses**: evil → 403 + `acKeys().length === 0` **kể cả /health và /nonexistent (404)**; webview → ACAO echo trên mọi status; native → zero CORS. Helper `assertNoAccessControlHeaders` (case-insensitive prefix match) dùng lại ở T1/T2/T6/T10/T13. **Không có deny path nào bị bỏ sót.**
- **Raw-socket duplicate-header tests?** — **CÓ.** T12 (duplicate Origin → malformed-origin; duplicate Host → host-mismatch; lowercase key; no-Origin + Host evil), T10 (duplicate Origin raw + server-alive check), helper `sendRawRequest` socket thật (không qua http.request auto-normalize). LH-10/11/12 replay live.
- Điểm mạnh khác: T9 2-lớp log-forging (llhttp + gate sanitize), T13 preflight matrix 14 assertions khớp CSV, T14 micro-bench p99 < 1ms trong CI, PBT-01..04 fast-check 10k runs seed cố định (reproducible), UT-36 fail-closed port=0, allowlist immutability test.
- Process note: T6 case 5 (both-fail precedence) assert `host-mismatch` theo TDD v1.1 AD-10 — STC v1.0 IT-06 step 5 còn ghi `origin-not-allowed` (leftover). Test đã comment rõ + deviation note #4. **Cần QA sync STC** (nhỏ, không phải security gap — cả hai reason đều 403 fail-closed).

## 7. Evidence Quality & V-1 Assessment — ✅ đủ để merge code; V-1b dev-host = conditional-accept

| Evidence | Đánh giá |
|----------|----------|
| Live harness (LH-01..15) | Chất lượng cao: chạy WrapperServer THẬT in-process (standalone, vscode stub — cùng HTTP surface + deny log production), bind 9181 thật; LH-01 capture **đầy đủ header list** deny response (chứng minh zero CORS tốt hơn assert lẻ); LH-13 chính là vector SEC-358-01 live; LH-14/15 phủ Host shorthand/0.0.0.0. Self-cleaning trong `finally`. |
| Bench | 10⁶ calls/class + warmup 10⁴; p99 tệ nhất 43.9µs (malformed) — ~23× dưới ngưỡng 1ms; e2e delta median **−0.0116ms** (gate KHÔNG làm chậm — trong margin noise). Đúng phương pháp TDD §9. |
| Coverage | OriginGate 100% stmts / 100% funcs / 100% lines / 96.42% branches — perFile gate PASS. |
| V-1a static | Grep trên **đúng layer vendored** (`@modelcontextprotocol/sdk` client streamableHttp/sse/auth/middleware): 0 Origin-header emission; các match `origin` đều là `URL.origin` property (đọc, không set header). Phân loại match rõ ràng từng file:line — evidence có thể kiểm chứng lại. |
| **V-1b dev-host (pending)** | **Conditional-accept — KHÔNG block Phase 6, bắt buộc đóng trong Phase 6.** Căn cứ: (1) V-1a là bằng chứng mạnh ở layer code thật của IDE client; (2) undici/Node fetch KHÔNG BAO GIỜ tự thêm Origin (protocol fact); (3) V-1b standalone với WrapperServer thật đã chứng minh full-session flow + deny-log delta 0; (4) failure mode nếu dev-host thực sự gửi Origin là **fail-closed** (native client bị deny → wrapper hỏng chức năng cho IDE client — lỗi availability nhìn thấy ngay trong dev, KHÔNG phải lỗ hổng bảo mật), và có sẵn remediation path (AF-2 UC-04 + BR-10: thêm pattern allowlist qua code change + test, cấm nới \*). → Điều kiện: QA chạy harness KHÔNG `--standalone` trên dev host trong Phase 6 (N-QA2) + V-4 (SM/BA update BRD A-1) trước khi đóng AC-3. |

## 8. Dependencies — ✅ PASS

- Commit 7bb9222 **không đổi package.json/package-lock** → **zero new runtime deps**.
- `fast-check` (PBT) nằm trong **devDependencies** (test-only) — không vào bundle runtime.
- Không có typosquatting mới; không thêm HTTP client nào mới (SSRF surface không đổi).

## 9. Findings

| # | Severity | File:line | Description | Remediation | Owner |
|---|----------|-----------|-------------|-------------|-------|
| SA358-R1 | 🔵 Low (pre-existing — KHÔNG phải regression của 7bb9222) | extension/src/services/WrapperServer.ts:160 | `new URL(req.url \|\| "/", "http://localhost")` nằm **ngoài try/catch** của handleRequest. Request-target absolute-form malformed (vd `GET http://[::1 HTTP/1.1`, chỉ non-browser gửi được) làm URL constructor throw → unhandled promise rejection (async handler không có catch ở createServer callback) → risk crash/log-noise extension host. Code cũ (pre-7bb9222) cũng ngoài try nên đây là pre-existing; ticket này còn khiến headers echo đã set trước khi throw (khác biệt thứ hai, vô hại vì không ghi response). | Move `const u = new URL(...)` vào trong try (hoặc wrap try/catch riêng → 404). 1 dòng dịch chuyển, không đổi contract (FR-10 — response cho absolute-form hợp lệ giữ nguyên). Không bắt buộc trong ticket này (out of threat model — non-browser only); gộp backlog hardening cùng SEC-358-04 (500 handler echo err.message). | SM (backlog) |
| SA358-R2 | ℹ️ Informational | extension/src/services/OriginGate.ts:169-189 | WHATWG URL normalization cho phép vài variant Origin pass allowlist qua hostname sau decode: userinfo (`https://evil@localhost` → host `localhost`), percent-encoded host (`http://local%68ost` → `localhost`). **Toàn bộ là non-browser-only** (browser serialize origin canonical, không userinfo/encode) → thuộc đúng class SEC-358-05 đã accept (local process đã có full user rights). ACAO echo các giá trị này không match origin của browser nào → zero browser-impact. | Optional defense-in-depth (khi làm OI-1 shared-secret): deny khi raw trimmed Origin ≠ serialization canonical của nó (so `url.origin`/`url.href` với input sau strip) hoặc đơn giản deny Origin chứa `@`/`%`. Không bắt buộc. | SM (gộp OI-1) |
| SA358-R3 | ℹ️ Informational | extension/src/services/PathResolver.ts:189-191 | `sanitizeLogText` thay \r\n\0 nhưng không \t — tab sống sót trong deny log. Không log-forging (tab không xuống dòng trong outputChannel), chỉ cosmetique nếu sau này log được machine-parse. | Optional: thêm \t vào regex (`/[\r\n\0\t]/g`). Cân nhắc ripple: sanitizeLogText dùng chung với SA4E-356 message builders (Format-1) — đổi cần chạy lại regression 356. | SM (backlog) |

**Accepted residuals (không tính finding mới — đúng trạng thái Security Review v1.0 yêu cầu):**
- **SEC-358-02** log amplification — accepted, OI-3/OI-1 follow-up. Trạng thái: documented đúng.
- **SEC-358-04** 500 handler echo `err.message` — pre-existing, giữ nguyên theo FR-10 (đúng chỉ dẫn). Backlog hardening cùng SA358-R1.
- **SEC-358-05** non-browser forge Origin/Host — accepted; OI-1 shared-secret **vẫn cần SM tạo follow-up ticket chính thức** (SHOULD, P3) — chưa thấy ticket trong STATUS.json related. Đề xuất SM hành động trước release public.

## 10. Verification Matrix

### 10.1 SEC-358-01..05 (Security Review v1.0 → implementation)

| Finding | Trạng thái | Bằng chứng |
|---------|-----------|------------|
| SEC-358-01 (Medium — DNS rebinding no-Origin) | ✅ **RESOLVED — Option A đúng thiết kế** | Phase 1.5 I-8 (OriginGate.ts:153-156); H-7/H-8/H-9 = UT-32/33/34 PASS; IT-12 step 4 (raw socket); IT-13 row 1b; **live LH-13..15 PASS**; TDD v1.1 AD-10 + FSD v1.2 sync N-BA2. Merge condition #4 ✅ |
| SEC-358-02 (Low — log amplification) | ⚠️ **ACCEPTED (đúng thiết kế)** | Không rate-limit — documented OI-3; follow-up gộp OI-1. Không block. |
| SEC-358-03 (Info — Vary: Origin) | ✅ **RESOLVED** | WrapperServer.ts:156; T4 assert `vary === "Origin"`. |
| SEC-358-04 (Info — 500 echo err.message) | ℹ️ **PRE-EXISTING giữ nguyên** (đúng chỉ dẫn review) | WrapperServer.ts:172; FR-10. Backlog cùng SA358-R1. |
| SEC-358-05 (Info — non-browser forge) | ℹ️ **ACCEPTED + defense-in-depth ĐÃ implement** | UT-39 guard control-chars (recommendation #4 của review — được thực hiện); OI-1 shared-secret follow-up cần SM tạo ticket chính thức. |

### 10.2 Merge Conditions 7/7 (SECURITY-REVIEW.md v1.0 §"Điều kiện merge")

| # | Điều kiện | Trạng thái | Bằng chứng |
|---|-----------|------------|------------|
| 1 | T1..T14 + unit ~30 + full regression 100% PASS | ✅ **PASS** | 40/40 integration (T1..T14) + 46/46 unit (UT-01..39 + PBT) + **2808/2808** full suite; tsc 0 lỗi; eslint 0 lỗi |
| 2 | V-1..V-4 evidence đầy đủ, không open assumption | ⚠️ **PARTIAL — conditional** | V-1a ✅ (static, 4 files); V-1b ✅ standalone (LH-08) / **dev-host pending N-QA2**; V-1c CSV ✅; **V-4 thuộc SM/BA — pending**. Assess: conditional-accept (§7) — không block Phase 6, bắt buộc đóng trước khi close AC-3 |
| 3 | Live harness green | ✅ **PASS (standalone)** | 15/15 (live-harness-standalone-output.txt); dev-host rerun = một phần N-QA2 (điều kiện #2) |
| 4 | SEC-358-01 chốt: Option A implemented (H-7/8/9 PASS) | ✅ **PASS** | UT-32..34 + IT-12.4 + IT-13.1b + LH-13..15 — full stack unit→integration→live |
| 5 | Bench p99 < 1ms + e2e delta < 1ms | ✅ **PASS** | p99 tệ nhất 43.9µs (malformed, ~23× dưới ngưỡng); allow-path 1.4µs; e2e delta −0.0116ms |
| 6 | Grep không còn ACAO \*; deny zero CORS (T11) | ✅ **PASS** | Grep runtime code: chỉ echo block WrapperServer.ts:153-155; semgrep R1/R2 0 findings; SCAN 528 files PASSED; T11 15/15 + LH-01 header list |
| 7 | Verdict security review cuối: không còn finding Medium+ CORS/Origin trên :9181 | ✅ **PASS** | Báo cáo này: 0 Critical/High/Medium; 1 Low pre-existing (non-browser-only) + 2 Info |

**Tổng: 6/7 ✅ · 1/7 partial (điều kiện #2 — V-1b dev-host + V-4, có kế hoạch đóng trong Phase 6).**

## 11. Recommendations Summary

### Immediate (trước khi đóng AC-3 / trong Phase 6)
1. **QA — N-QA2:** chạy `npx tsx documents/SA4E-358/testdata/cors-pentest-harness.ts` (KHÔNG `--standalone`) trên extension dev host thật (:9181, Kiro/VS Code) → kỳ vọng 15/15 PASS + deny log outputChannel thật không có `reason=origin-not-allowed` cho native session. Nếu FAIL → xử lý theo AF-2 UC-04 + BR-10 (code change + test — **tuyệt đối không nới \***).
2. **SM/BA — V-4:** update BRD A-1 (assumption "native client không gửi Origin" → verified) + FSD §11.2 Change Log; attach native-client-headers.md vào Jira.
3. **QA:** sync STC IT-06 step 5 — đổi expected reason `origin-not-allowed` → `host-mismatch` (TDD v1.1 AD-10 authoritative; test comment đã ghi sẵn).
4. **SM:** tạo follow-up ticket chính thức cho **OI-1 shared-secret** (SHOULD, P3 — mitigation thật cho SEC-358-05 + đóng hẳn SA358-R2 class) — thay vì để mục "chờ chốt".

### Short-term (backlog hardening — gộp 1 ticket nhỏ)
5. **SA358-R1:** move `new URL(req.url)` vào trong try của `handleRequest` (crash-robustness, non-browser-only).
6. **SEC-358-04 + SA358-R1 cùng nhóm:** 500 handler trả generic `{"error":"Internal error"}` + log full server-side.
7. **SA358-R3:** thêm \t vào `sanitizeLogText` (chạy lại regression SA4E-356 sau khi đổi).
8. **SEC-358-02:** throttle deny-log theo reason (gộp OI-3) khi làm OI-1.

### Long-term
9. Khi wrapper thêm cookie/session → revisit OI-2 (CSRF token).
10. Security review định kỳ cho các HTTP server khác trong extension (AuthManager OAuth callback đã tự áp Host-check — keep pattern khi mở rộng).

## 12. Điểm implementation làm ĐÚNG (ghi nhận tích cực)

1. **Phase 1.5 nằm toàn bộ trong `evaluateOriginGate`** — WrapperServer không biết gì về Host-check-unconditional; call signature giữ nguyên → đúng TDD §5 row 7, đúng G-2 (pure module, chỉ import sanitizeLogText).
2. **1 hàm `validateHostParts` dùng chung P1.5 + P5** (idempotent) — không nhân đôi logic Host check (richtig theo thiết kế ~5-8 dòng).
3. **Deny là happy path có chủ đích** (AD-6) — code deny path gọn, sạch, zero header leak, log đúng 1 dòng.
4. **PBT seeds cố định** (388911..388914) — reproducible; 10k runs/property.
5. **Deviation P3d xử lý đúng cách** — phát hiện Node 22 parse khác giả định TDD → thêm check fail-closed **giữ contract** thay vì nới, + SA-verified runtime probe + document.
6. **T11 sweep** thiết kế test xuất sắc — 15 responses phủ mọi route × mọi branch, bắt được cả lỗi "quên xóa setHeader" (C-2 Node semantics).
7. **V-1b dùng deny log làm capture mechanism** — evidence runtime không thể bỏ sót, zero infra thêm (đúng như design review khen).

## 13. Phase 6 Blocking Assessment

| Câu hỏi | Trả lời |
|---------|---------|
| Verdict | **APPROVED WITH FINDINGS** (0 Critical/High/Medium · 1 Low pre-existing · 2 Info) |
| Overall risk | **LOW** (trong threat model đã chốt: loopback 127.0.0.1, gate không phải authN boundary) |
| **Có block Phase 6?** | **KHÔNG.** Implementation đúng thiết kế, không có bypass mới, evidence đủ. |
| Điều kiện kèm | (1) N-QA2 (V-1b dev-host) + V-4 **bắt buộc PASS trong Phase 6** trước khi đóng AC-3/close ticket; (2) QA sync STC IT-06 step 5. Hai điều kiện này là verification/process — không phải code defect. |
| Finding nào cần fix TRƯỚC Phase 6? | **Không có.** SA358-R1/R2/R3 đều backlog (non-browser-only / cosmetique). |

## Appendix

### A. Phương pháp & Tools
- Static code review thủ công — đọc toàn bộ OriginGate.ts (198 dòng), WrapperServer.ts (368 dòng), PathResolver.ts (sanitizeLogText), origin-gate.test.ts (430 dòng), wrapper-server.test.ts (911 dòng), wrapper-server.helpers.ts (241 dòng).
- Bypass hunt chủ động theo checklist 8 mục: URL constructor edge cases (unicode/backslash/credentials/whitespace/tab-NUL), allowlist match edges (scheme case/host case/port edges/vscode-webview wildcard), Phase 1.5 Host bypass (uppercase/suffix-domain/port variants/duplicate rawHeaders), no-Origin carve-out abuse (HTTP/1.0 qua Node http), TOCTOU/state.
- Đối chiếu TDD v1.1 §3.3 (7 phases nguyên văn), FSD v1.2 (FR-04/BR-05/BR-06/UC-05 sync N-BA2), SECURITY-REVIEW.md v1.0 (5 findings + 7 merge conditions).
- Git forensics: `git show 7bb9222` (diff WrapperServer — regression surface; stat — deps untouched), grep `Access-Control` toàn extension/src, grep `routeToolCall` (stdio path).
- Evidence kiểm chứng: test-run-summary.md, native-client-headers.md, live-harness-standalone-output.txt, pentest-results.csv, bench-output.txt, coverage-summary.txt, cors-gate-script-output.txt, cors-pentest-harness.ts (harness code), STATUS.json.
- OWASP Top 10 (2021) mapping: A01 Broken Access Control (gate chính), A05 Security Misconfiguration (CORS), A08 Data Integrity (allowlist immutable); CWE-346 (Origin Validation Error), CWE-350 (DNS rebinding), CWE-942 (Overly Permissive CORS).

### B. Scope Limitations
- **Static analysis** — chưa dynamic test trên dev host thật (N-QA2 đang pending đúng vì vậy). Browser engine behavior (Origin serialization trên same-origin GET sau rebind) dựa trên Fetch spec + behavior hiện hành — đã được design review ghi nhận; LH-13 phủ vector ở tầng HTTP thật nhưng chưa qua browser engine thật.
- Chưa review AuthManager OAuth callback server chi tiết (out of scope ticket — đã assess skim từ design review: có sẵn protections).
- Chưa test multi-window/reload/perf scenarios (suite riêng đã có — 2808 tests).
- Semgrep/CI gates tin theo evidence output (cors-gate-script-output.txt); không chạy lại trong session này.
- Node version assumption: behavior WHATWG URL theo Node ≥22 (đã SA-verified runtime probe cho P3d).

### C. Glossary
- **ACAO**: Access-Control-Allow-Origin · **I-8**: invariant "Host check áp cho mọi request có Host" (TDD v1.1) · **AD-10**: design decision Option A (Host-check-unconditional) · **H-7/8/9**: remediation test cases SEC-358-01 · **LH-x**: live harness vector · **N-QA2**: item QApending (dev-host harness rerun) · **fail-closed**: trạng thái không chắc chắn → deny · **carve-out**: ngoại lệ có chủ đích (no-Origin + no Host = HTTP/1.0 legacy) · **V-1a/b/c**: static grep / runtime session / CSV evidence của giả định A-1.

---
*— Hết Security Assessment v1.0 — SA4E-358 Phase 5.7 — Verdict: **APPROVED WITH FINDINGS** (0 Medium+ · 1 Low pre-existing · 2 Info) — KHÔNG block Phase 6 — điều kiện: N-QA2 + V-4 đóng trong Phase 6 trước khi close AC-3 — SM ingest vào KB + log RUN-LOG.*
