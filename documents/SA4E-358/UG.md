# User Guide (UG)

## SA4E Extension MCP Wrapper — SA4E-358: CORS Origin/Host validation trên loopback :9181

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-358 |
| Title | [Follow-up SA4E-356/SA-01] CORS * + no authN trên loopback :9181 — Origin/Host validation |
| Author | DEV Agent |
| Reviewer | BA Agent |
| Version | 1.0 |
| Date | 2026-10-13 |
| Status | Draft |
| Related BRD | documents/SA4E-358/BRD.md (v1.0) |
| Related FSD | documents/SA4E-358/FSD.md (v1.2) |
| Related TDD | documents/SA4E-358/TDD.md (v1.1 — §7 deny handling, §3 contract, §15 AD-10) |
| Related STC | documents/SA4E-358/STC.md (v1.1 — behaviors đã verify bằng tests) |
| Related Security Review | documents/SA4E-358/SECURITY-REVIEW.md (v1.0 — SEC-358-01 Option A + điều kiện merge) |
| UG format tham chiếu | documents/SA4E-356/UG.md (v1.1 — ticket liền trước cùng domain) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-13 | DEV Agent | Initial document — UG cho Origin/Host gate sau fix SA4E-358: Origin Gate Rules, deny response + error codes, troubleshooting 403, FAQ, behavior changes. Facts verified từ OriginGate.ts + WrapperServer.ts + STC v1.1 + evidence test-run |

---

## 1. Introduction

### 1.1 Purpose

Guide này mô tả **hành vi mới của MCP wrapper HTTP server** (WrapperServer, loopback `127.0.0.1:9181`) sau khi hardening bảo mật SA4E-358: server giờ chạy một **Origin/Host validation gate** — module `OriginGate.ts` — tại điểm vào duy nhất `handleRequest` của `WrapperServer.ts`, **trước mọi route và trước khi set bất kỳ CORS header nào**.

**Vấn đề được đóng (finding SA-01 của SA4E-356, live-confirmed ×3):** trước fix, wrapper trả `Access-Control-Allow-Origin: *` vô điều kiện, preflight OPTIONS luôn 204, và SSE GET /mcp mở cho tất cả. Hệ quả: bất kỳ trang web nào user visit (drive-by) đều gửi được cross-origin request vào loopback :9181, thực thi MCP tools với session/credential của user extension-side, và **đọc được response** (cross-origin readback dữ liệu Atlassian) — điều kiện kích hoạt chỉ là "user mở extension + visit 1 trang web".

**Sau fix:** gate phân loại mọi request theo 2 header (`Origin`, `Host`) theo quy tắc §2 — caller hợp lệ đi qua như cũ; web origin lạ nhận **403 Forbidden** không kèm CORS headers (browser tự chặn readback); DNS rebinding bị chặn bởi Host validation.

### 1.2 Relation to SA4E-356

| Ticket | Đóng gì | Liên hệ |
|--------|---------|---------|
| **SA4E-356** | Path resolution theo workspace root + containment (chặn đọc/ghi file ngoài workspace) + envelope lỗi chuẩn | Giảm surface **side-effect trong workspace**; cung cấp finding SA-01 + pentest harness pattern |
| **SA4E-358 (ticket này)** | Origin/Host gate + bỏ `ACAO: *` | Đóng kênh **readback + tool-abuse từ browser** (drive-by + DNS rebinding) — 2 ticket cộng lại chặn cả chuỗi tấn công |

Hành vi MCP tools của SA4E-356 (resolve path, `PATH_*`/`FILE_NOT_FOUND`/`FS_ERROR`, envelope `Wrapper Error:`) **giữ nguyên 100%** cho caller được phép — xem UG SA4E-356 cho các quy tắc đó.

### 1.3 Audience

| Audience | What They Need |
|----------|---------------|
| AI Agent / MCP HTTP client (gọi wrapper qua `http://127.0.0.1:9181/mcp`) | Quy tắc gate (§2), ví dụ gọi đúng (§4), nghĩa vụ khi gặp 403 (§5, §6) |
| Extension / Webview developer | Allowlist semantics, CORS echo behavior (§2, §5.5), behavior changes (§8) |
| Security reviewer | Deny shape + log format (§5), trạng thái verification (§9.4) |
| System Administrator | §3 (không có config — giải thích tại sao), §6.4 (log noise) |

### 1.4 Prerequisites

| Prerequisite | Version | Required |
|-------------|---------|----------|
| Kiro (hoặc VS Code) với SA4E extension chứa fix SA4E-358 | extension 1.52.0+ (commit chứa fix) | Yes |
| Config port wrapper | `sdlcAgents.mcpServerPort` — **config CŨ có sẵn** (default `9181`), không phải config mới | No change |

> **Không có dependency, config hay cài đặt mới** cho fix này. Gate luôn-on, không có feature flag (rollback = revert commit — xem §7 Q3).

---

## 2. Origin Gate Rules (TRỌNG TÂM — đọc trước khi gọi bất kỳ request nào)

Mọi HTTP request vào wrapper đi qua `evaluateOriginGate(rawHeaders, listenPort)` — pure function 7 phases, **fail-closed**: mọi trạng thái không chắc chắn (header hỏng, duplicate, port lệch) → **403**. Gate không đọc body, không throw, overhead < 1ms (đo được: p99 tối đa 145µs — §9.4).

### 2.1 Bảng quy tắc (theo thứ tự đánh giá)

| # | Tình huống request | Kết quả | Chi tiết |
|---|--------------------|---------|----------|
| 1 | `Origin: vscode-webview://<id-bất-kỳ>` (mọi webview ID, **không port** — webview thật không bao giờ có port) | **ALLOW** + ACAO echo | Pattern theo scheme `vscode-webview` + host wildcard `*`; ID webview đổi theo phiên không cần cập nhật gì |
| 2 | `Origin: http://localhost:<port-bất-kỳ>` · `https://localhost:<port-bất-kỳ>` · `http://127.0.0.1:<port-bất-kỳ>` | **ALLOW** + ACAO echo | Port của Origin **không cần** trùng port listen (vd dev server Vite :5173 vẫn hợp lệ); `https://127.0.0.1:*` **KHÔNG** trong allowlist → deny (chủ đích FR-03) |
| 3 | `Origin` khác (mọi web origin khác — `https://evil.com`, `http://localhost.evil.com:3000`, `http://[::1]:3000`, trailing dot `localhost.`, `file://`, `javascript:`…) | **DENY 403** (`origin-not-allowed`) | So khớp scheme + hostname **chính xác** (exact set membership) — KHÔNG substring; hostname so case-insensitive |
| 4 | **KHÔNG** header Origin (native MCP client: VS Code/Kiro MCP HTTP client, MCP SDK, curl/Node script không tự gắn Origin) | **ALLOW**, pass-through — **KHÔNG có CORS header nào** trên response | Native client không parse CORS → zero functional impact. LƯU Ý: nếu request có header Host thì vẫn bị validate theo rule #5 |
| 5 | Có header `Host` NHƯNG không phải `127.0.0.1:<port-listen>` hoặc `localhost:<port-listen>` | **DENY 403** (`host-mismatch`) — **áp cho MỌI request có Host, kể cả không-Origin** (rule #4) | Phòng **DNS rebinding** (SEC-358-01 Option A / invariant I-8). Port so **chính xác** với port đang listen; hostname case-insensitive; **deny cả**: IPv6 literal `[::1]` (server bind 127.0.0.1 nên ::1 không chạm được server), shorthand `127.1` / `0.0.0.0` (KHÔNG normalize trên Host path), port sai/malformed (`:abc`, port+1) |
| 6 | Header hỏng: **duplicate** Origin/Host (>1 dòng), Origin chứa `,`, chứa control chars, URL không parse được (`%%`, `null`), scheme-only (`localhost:3000` thiếu scheme), `vscode-webview://abc:9181` (scheme đặc biệt + port) | **DENY 403** fail-closed (`malformed-origin` cho lỗi Origin; `host-mismatch` cho duplicate Host) | KHÔNG first-wins với duplicate — reject dù 1 trong 2 giá trị hợp lệ |
| 7 | Binding server | **Luôn `127.0.0.1`** — verify-only | Không có code change cho bind; unit test assert `address() === "127.0.0.1"` chặn hồi quy âm thầm về `0.0.0.0` (AC-7) |

**Carve-out duy nhất của rule #5:** request **không-Origin VÀ không-Host** (HTTP/1.0 legacy) → PASS. Request **có-Origin nhưng thiếu Host** → DENY `host-mismatch` (fail-closed).

### 2.2 Ma trận hành vi theo route (sau gate)

| Caller nhánh | POST /mcp | GET /mcp (SSE) | OPTIONS (preflight) | GET /health | Path lạ |
|--------------|-----------|----------------|---------------------|-------------|---------|
| Origin ∈ allowlist (rule 1-2) + Host OK | 200/202/400 như cũ **+ ACAO echo + Vary: Origin** | 200 SSE như cũ + ACAO echo | **204 + ACAO echo + Allow-*** | 200 + ACAO echo | **404** + ACAO echo (echo uniform kể cả 404) |
| No-Origin (native — rule 4) + Host OK (hoặc không Host) | như cũ, **zero CORS** | như cũ (stream mở, keep-alive 15s), zero CORS | 204 bare, zero CORS | như cũ, zero CORS | 404 như cũ, zero CORS |
| Mọi caller bị deny (rule 3/5/6) | **403 + `{"error":"Forbidden"}` + zero CORS** | 403 — KHÔNG byte SSE nào rò ra | **403 (KHÔNG 204)** | 403 | **403 (thay vì 404 — không leak route map)** |

> Điểm cần nhớ: caller bị deny nhận **403 uniform trên mọi path + method** — kể cả path không tồn tại. Sự khác biệt 403/404 không tiết lộ route nào tồn tại; control bảo mật thực sự là **không ACAO + tool không thực thi**.

---

## 3. Configuration Reference

**KHÔNG có configuration cho gate này.** Allowlist là **constant immutable trong code** (`ALLOWED_ORIGIN_PATTERNS`, `OriginGate.ts`) — không setting runtime, không `contributes.configuration`.

**Tại sao cố tình không cấu hình được (BR-09, FSD §3.1.4.1):**

1. **Supply-chain surface:** workspace-scoped settings bị kế thừa qua repo (`.vscode/settings.json` theo workspace) — attacker có thể tự thêm origin lạ vào allowlist bằng chính side-effect ghi-file-trong-workspace (vector SA-01), khiến gate vô dụng.
2. **Không có nút "vô hiệu hóa bảo mật"** cho user bấm nhầm.
3. **Nhu cầu hiện tại tĩnh:** 1 webview scheme + localhost — ổn định.

**Cách mở rộng khi có client hợp lệ mới (R-1/R-2):** sửa constant trong `OriginGate.ts` = code change nhỏ + unit test mở rộng — **TUYỆT ĐỐI KHÔNG nới rule thành `*` hay substring matching** (BR-10, no-workaround-rule). Mitigation dài hạn cho non-browser là **shared-secret header** — follow-up ticket chính thức (OI-1), không nằm trong ticket này.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| *(none — gate)* | — | — | Không có config mới. Port server dùng **config cũ** `sdlcAgents.mcpServerPort` (default `9181`); Host check so port với port **đang listen thực tế** (`srv.address().port`), không hardcode 9181 |

---

## 4. Usage

### 4.1 Native MCP HTTP client (no-Origin) — gọi bình thường, không đổi gì

MCP SDK / VS Code / Kiro HTTP client **không tự gắn header Origin** (Node fetch/undici không gắn; chỉ browser engine gắn) → request rơi nhánh pass-through:

```text
POST http://127.0.0.1:9181/mcp
Host: 127.0.0.1:9181
Content-Type: application/json

{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"jira_get_issue","arguments":{...}}}
```

**Kết quả:** 200 + JSON-RPC result — byte-semantic như trước fix; response **không có** CORS header nào (native client không parse CORS → không ảnh hưởng).

> **Verify status:** giả định "native client không gửi Origin" đã chứng minh bằng static grep HTTP layer của MCP SDK (V-1a PASS) + session runtime full flow ở mức standalone (LH-08 PASS). **Xác nhận cuối trên extension dev host thật đang chờ SM/QA chạy lại harness (N-QA2)** — xem §9.4.

### 4.2 HTTP client tự gắn Origin localhost (script/agent dùng curl/fetch với header Origin tùy ý)

```text
curl -X POST http://127.0.0.1:9181/mcp \
  -H "Origin: http://localhost:3000" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

**Kết quả:** 200 + ACAO echo `http://localhost:3000` + `Vary: Origin` — Origin ∈ allowlist (port Origin bất kỳ). Nếu bỏ header Origin đi → vẫn pass (nhánh native), chỉ là không có CORS headers.

### 4.3 SSE stream (GET /mcp)

```text
GET http://127.0.0.1:9181/mcp
```

**Caller được phép** (no-Origin với Host loopback đúng, hoặc Origin ∈ allowlist): stream mở như cũ — `text/event-stream`, event `endpoint`, keep-alive 15s. **Origin lạ:** 403 trả ra **trước khi mở stream** — không một byte SSE nào rò ra.

### 4.4 Stdio client (SDLC agents) — không đổi

Stdio không đi qua HTTP server (`routeToolCall` được gọi in-process) → gate **không thể tác động**. Pipeline SDLC không cần thay đổi gì (assert bằng full regression suite — 2808 tests pass).

### 4.5 Webview flow (vscode-webview)

```text
1. OPTIONS /mcp   → 204 + Access-Control-Allow-Origin: vscode-webview://<id> (echo EXACT)
                    + Allow-Methods: GET, POST, OPTIONS + Allow-Headers: Content-Type + Vary: Origin
2. POST /mcp      → 200 + ACAO echo → webview đọc được response
```

Webview ID đổi giữa phiên không cần cập nhật gì (pattern `*` khớp mọi ID).

### 4.6 /health

```text
GET http://127.0.0.1:9181/health
```

Caller được phép: `200 {"status":"ok","mode":"wrapper"}`. Origin lạ: **403** (trước fix: 200 + ACAO `*` — P6-15). Health-checker nội bộ của extension chạy in-process, không qua HTTP → không bị ảnh hưởng.

---

## 5. Error Codes / Responses

### 5.1 Deny response shape (thống nhất mọi path + method)

| Aspect | Giá trị |
|--------|---------|
| Status | **403 Forbidden** |
| Body | `{"error":"Forbidden"}` (exact) |
| Content-Type | `application/json` |
| CORS headers | **KHÔNG có** — không ACAO, không Allow-Methods, không Allow-Headers → browser chặn readback |
| Leak | Reason **KHÔNG** xuất hiện trong response — chỉ trong log (§5.4); không echo header attacker; không leak allowlist |

Body **không phân biệt** theo reason — attacker không đọc được chi tiết từ response.

### 5.2 Deny reasons (chỉ trong log)

| Reason | Trigger | Ví dụ |
|--------|---------|-------|
| `origin-not-allowed` | Origin parse OK nhưng không khớp allowlist | `https://evil.com`; `http://localhost.evil.com:3000` (substring không được nhận); `https://127.0.0.1:8443`; `http://[::1]:3000`; `http://localhost.` (trailing dot); `file://x`; `javascript:` |
| `host-mismatch` | Host hỏng trên **mọi** request có Host (P1.5) — hoặc duplicate Host — hoặc có-Origin mà thiếu Host | `Host: attacker.com:9181` (**kể cả request không-Origin — rebinding same-origin**); `Host: 127.0.0.1:<port-sai>`; `Host: [::1]:9181`; `Host: 0.0.0.0:9181` / `Host: 127.1:9181` (không normalize); `Host: 127.0.0.1:abc`; có-Origin + không Host |
| `malformed-origin` | Duplicate Origin (>1 dòng — KHÔNG first-wins); Origin chứa `,`; chứa control chars; URL throw (`%%`, `null`); scheme-only (`localhost:3000`); scheme đặc biệt + port (`vscode-webview://abc:9181`) | — |

**Precedence khi cả Origin lẫn Host cùng hỏng:** Host check (Phase 1.5) chạy **trước** → log ghi **`host-mismatch`** ("deny đầu tiên định reason"). Khác biệt chỉ nằm trong log — response luôn 403 như nhau.

### 5.3 Header semantics trên response được phép

| Caller | ACAO | Allow-Methods / Allow-Headers | Vary |
|--------|------|------------------------------|------|
| Origin ∈ allowlist | **echo đúng Origin RAW** đã gửi (không bao giờ `*`) | `GET, POST, OPTIONS` / `Content-Type` — set trên **mọi** response của caller này (200/202/204/400/404/405/500) | `Vary: Origin` (SEC-358-03) |
| No-Origin (native) | không có | không có | không có |
| Caller bị deny | không có | không có | không có |

### 5.4 Deny log — format + nơi xem

Mỗi lần deny ghi **đúng 1 dòng** vào outputChannel của extension (VS Code/Kiro → **View → Output** → channel của SA4E extension):

```text
[WrapperServer] Denied request — reason=<reason> origin=<sanitized> host=<sanitized> (<METHOD> <path>)
```

Ví dụ:

```text
[WrapperServer] Denied request — reason=origin-not-allowed origin=https://evil.com host=127.0.0.1:9181 (POST /mcp)
[WrapperServer] Denied request — reason=host-mismatch origin= host=evil.com:9181 (GET /mcp)
[WrapperServer] Denied request — reason=malformed-origin origin=%% host=127.0.0.1:9181 (POST /mcp)
```

- Giá trị origin/host đã qua `sanitizeLogText` **bên trong gate** — ký tự control `[\r\n\0]` bị thay bằng `?` (chống log-forging; gate không thể log giá trị raw dù muốn).
- **Không log body**, không log full header list; request **được phép** không log thêm gì.

---

## 6. Troubleshooting

### 6.1 "Tool call bị 403" — quy trình chẩn đoán

**Bước 1 — đọc deny log** (§5.4) và nhìn field `reason`:

| reason | Nguyên nhân khả dĩ | Fix đúng |
|--------|--------------------|----------|
| `origin-not-allowed` | (a) Browser tab có origin lạ đang gọi (drive-by thật — kiểm tra log `origin=`); (b) client tự gắn Origin ngoài allowlist (app Electron, scheme fork IDE…) | (a) Không có gì phải sửa — gate đang làm việc đúng; (b) nếu là client hợp lệ: thêm pattern vào `ALLOWED_ORIGIN_PATTERNS` (code change + test theo BR-10) — **KHÔNG nới `*`** |
| `host-mismatch` | (a) **Proxy/port-forward đổi Host** (vd gọi qua hostname khác `my-machine.local:9181`); (b) **DNS rebinding** (thật sự bị tấn công — xem log `origin=` rỗng + method GET); (c) port trong Host ≠ port đang listen (config `sdlcAgents.mcpServerPort` đổi nhưng client trỏ port cũ); (d) client gửi `Host: [::1]:…` (IPv6) | Gọi thẳng `127.0.0.1:<port-listen>` / `localhost:<port-listen>`; bỏ proxy trung gian; align client port với config |
| `malformed-origin` | Client tự dựng Origin hỏng (duplicate, thiếu scheme, chứa ký tự lạ) | Sửa client gửi Origin hợp lệ (scheme+host) hoặc bỏ hẳn header Origin (rơi nhánh native) |

**Bước 2 — đối chiếu `origin=` / `host=` trong log** với caller của bạn để xác định request đến từ đâu.

**⛔ KHÔNG BAO GIỜ "sửa" bằng cách disable gate, bỏ check, hay nới `*`** (no-workaround-rule): không có feature flag; cách duy nhất rollback là revert commit (SM quyết định) — và khi đó finding SA-01 mở lại.

### 6.2 Webview không load / không đọc được response

1. Kiểm tra deny log — nếu `reason=host-mismatch` với `origin=vscode-webview://…`: request bị chuyển hướng qua proxy làm Host sai (rule #5). Gọi thẳng loopback.
2. Nếu `reason=origin-not-allowed` với origin webview scheme **khác** (fork IDE dùng scheme riêng, R-1): thêm pattern theo BR-10.
3. Preflight bị 403 → browser không gửi POST thật (theo CORS spec) — luôn xử lý origin/root cause trước, không debug phía request thật.

### 6.3 Native MCP client vẫn OK — khi nào cần lo?

- Flow chuẩn (initialize → tools/list → tools/call → SSE) **không đổi config, không đổi behavior** — HTTP/1.1 bắt buộc Host và MCP SDK luôn gửi `Host: 127.0.0.1:<port>` đúng → pass Phase 1.5.
- Client native bị 403 chỉ khi: chạy sau proxy đổi Host (→ §6.1 reason `host-mismatch`), hoặc tự gắn Origin lạ (R-3 → thêm pattern theo BR-10). Deny log là capture mechanism: nếu 1 session đầy đủ không sinh dòng `Denied` nào → client của bạn không bị gate đụng tới.

### 6.4 Log 403 spam liên tục

Trang web trong browser có thể JS-loop fetch → nhiều dòng 403/phút (deny log chưa có rate-limit — SEC-358-02, Low, accepted cho ticket này). Attacker **không đọc được gì** (403 + zero CORS) — thiệt hại giới hạn ở noise/memory cục bộ. Xử lý: xác định tab/nguồn từ `origin=`; mitigation thật (rate-limit + shared-secret) nằm ở follow-up OI-1.

---

## 7. FAQ

**Q1: Tôi mở web app trên `http://localhost:3000` rồi gọi /mcp mà vẫn 403?**
A: Origin localhost **mọi port** đều hợp lệ (rule #2) — nên 403 gần như chắc chắn do **Host** (reason `host-mismatch`): bạn đang đi qua proxy/port-forward làm `Host` không còn `127.0.0.1:<port-listen>`, hoặc trỏ sai port server. Đọc deny log (§5.4) → sửa theo §6.1.

**Q2: curl gửi `Origin: vscode-webview://evil` + `Host: 127.0.0.1:9181` có qua gate không?**
A: Có — gate không phải authN boundary cho **non-browser**: process cục bộ tự do set header và đã có full user rights của user (documented threat model, BRD §1.1.1 + SEC-358-05 design-accepted). Mục tiêu của gate là **browser drive-by** — browser không cho phép JS giả mạo Origin. Mitigation thật cho non-browser là shared-secret (follow-up OI-1).

**Q3: Có cách nào tắt gate không?**
A: **KHÔNG.** Không config, không feature flag — gate luôn-on, fail-closed (tắt gate = bypass security, trái no-workaround-rule). Rollback duy nhất = revert commit chứa change (SM quyết định; khi đó SA-01 mở lại).

**Q4: Có thêm origin vào allowlist qua config/settings không?**
A: **KHÔNG** — immutable constant trong code (§3 — lý do supply-chain). Mở rộng = code change nhỏ + unit test (BR-10). Nếu nhu cầu là "chống process cục bộ giả mạo header" → đó là bài toán của shared-secret (OI-1), không phải nới allowlist.

**Q5: Gate làm request chậm hơn không?**
A: Không đáng kể — đo được (bench 10⁶ lần/class): p99 tối đa **145µs** (class malformed, đường `new URL` throw), các class còn lại ≤ 6.3µs; e2e delta median trên `GET /health` **≈ 0** (−0.015ms). Ngưỡng thiết kế < 1ms — PASS dư (~7×).

**Q6: Tại sao response của tôi không còn `Access-Control-Allow-Origin: *`?**
A: Behavior change **có chủ đích** — `*` vô điều kiện chính là finding SA-01 (cho mọi origin đọc response). Giờ ACAO chỉ được echo cho Origin ∈ allowlist (§5.3). Native client trước đây nhận `*` vô nghĩa, giờ nhận response không có CORS headers — không ảnh hưởng vì native không parse CORS.

**Q7: Request trỏ đúng server nhưng qua path không tồn tại — vì sao 403 thay vì 404?**
A: Nếu caller **bị deny**, mọi path trả 403 uniform — không leak route map (§2.2). Nếu caller **được phép**, path lạ vẫn trả 404 như cũ. Đọc deny log để phân biệt.

**Q8: Port của tôi khác 9181 — gate có hardcode 9181 không?**
A: Không. Host check so port với port **đang listen thực tế** (`srv.address().port`, theo config `sdlcAgents.mcpServerPort`). Đổi port → gate tự theo port mới.

---

## 8. Behavior Changes (cho user cũ — đọc kỹ trước khi nâng cấp)

| # | Hành vi | Trước fix | Sau fix | Ảnh hưởng đến bạn |
|---|---------|-----------|---------|-------------------|
| 1 | **ACAO `*`** | Mọi response (kể cả 404, /health, 403-era) kèm `Access-Control-Allow-Origin: *` — mọi web origin đọc được response | **Không còn `*` ở bất kỳ đâu** — ACAO chỉ echo cho Origin ∈ allowlist; web origin lạ → 403 + zero CORS, không readback | Drive-by mất khả năng đọc dữ liệu Atlassian (BO-1/AC-1/AC-8); web app của bạn trên localhost vẫn đọc được (echo) |
| 2 | **Preflight OPTIONS** | 204 vô điều kiện + ACAO `*` — preflight pass 100% | **204 chỉ khi caller được phép** (no-Origin Host-OK, hoặc Origin ∈ allowlist + Host OK) + echo + Allow-*; origin lạ → **403** (không 204) | Browser không còn gửi POST thật sau preflight fail (UC-01) |
| 3 | **Host validation (MỚI)** | Không kiểm tra Host — DNS rebinding đi lọt (đặc biệt same-origin GET sau rebind không mang Origin) | Mọi request **có Host** phải là `127.0.0.1`/`localhost` + **đúng port listen** — kể cả request không-Origin (I-8, SEC-358-01 Option A); carve-out: không-Origin + không-Host (HTTP/1.0 legacy) | Client gọi qua hostname/proxy khác loopback → 403 `host-mismatch` — gọi thẳng `127.0.0.1:<port>` |
| 4 | **Vary: Origin (MỚI)** | Không có | Response có ACAO echo kèm `Vary: Origin` (SEC-358-03 — best practice CORS/OWASP) | Không ảnh hưởng chức năng; đúng chuẩn cache |
| 5 | **Binding** | `listen(port, "127.0.0.1")` đã đúng từ trước | **Giữ nguyên + test assert** (`address() === "127.0.0.1"`) — không code change, chặn hồi quy về `0.0.0.0` | Không đổi; attacker từ mạng vẫn ngoài tầm với (AC-7) |
| 6 | **Native client / stdio** | Hoạt động bình thường (nhận `*` vô nghĩa) | **Zero regression** — stdio không qua HTTP; native HTTP no-Origin pass-through; nhận zero CORS headers thay vì `*` (không parse CORS → zero functional impact); không đổi config | Pipeline SDLC chạy như cũ (2808 tests + live session standalone PASS) |

**Thay đổi bổ sung đáng chú ý (cùng release):**

- **403 uniform cho caller bị deny trên mọi path** — kể cả path không tồn tại (trước: 404 + ACAO `*`).
- **Deny log mới** 1 dòng/deny vào outputChannel (format §5.4, sanitized) — đây là kênh chẩn đoán chính (và là capture mechanism cho V-1b).
- **Không đổi:** hành vi MCP tools của SA4E-356 (handshake, envelope `PathResolverError`, schema rewrite Base64Proxy, SSE keep-alive 15s, body limit 1MB, port retry EADDRINUSE, socket force-close), tool signatures, stdio transport.

---

## 9. Appendix

### 9.1 Glossary

Thuật ngữ CORS đầy đủ xem FSD SA4E-358 §1.3 + `testdata/glossary-cors.md` (CORS, Origin, ACAO, Preflight, Allowlist, DNS Rebinding, Loopback Binding, Cross-Origin Readback, Fail-closed, Drive-by, rawHeaders). Bổ sung guide này:

| Term | Definition |
|------|------------|
| OriginGate | Pure module `extension/src/services/OriginGate.ts` — gate 7 phases chạy đầu `handleRequest`; không I/O, không throw, fail-closed |
| echo / echo-only | ACAO trên response = giá trị Origin RAW caller đã gửi (không `url.origin`, không `*`) — chỉ khi Origin ∈ allowlist |
| listenPort | Port đang listen thực tế từ `srv.address().port` — nguồn so khớp Host (không hardcode 9181) |
| Phase 1.5 (I-8) | Bước Host-validate áp cho **mọi** request có header Host — trước cả nhánh no-Origin; đóng DNS rebinding same-origin (SEC-358-01 Option A) |
| DENY_SHAPE | 403 + `{"error":"Forbidden"}` + Content-Type json + zero `access-control-*` + 1 dòng deny log |

### 9.2 Related Documents

| Document | Location |
|----------|----------|
| BRD SA4E-358 (v1.0) | documents/SA4E-358/BRD.md |
| FSD SA4E-358 (v1.2) | documents/SA4E-358/FSD.md |
| TDD SA4E-358 (v1.1) | documents/SA4E-358/TDD.md |
| STC SA4E-358 (v1.1 — behaviors đã verify) | documents/SA4E-358/STC.md |
| Security Review (PASS-with-fixes — SEC-358-01 Option A) | documents/SA4E-358/SECURITY-REVIEW.md |
| UG format tham chiếu + tool-behavior kế thừa | documents/SA4E-356/UG.md |
| Gate source (single source of truth) | extension/src/services/OriginGate.ts · extension/src/services/WrapperServer.ts (`handleRequest`) |
| Evidence | documents/SA4E-358/evidence/ (test-run-summary, bench, pentest-results, native-client-headers) |

### 9.3 Version Compatibility

| System Version | Breaking Changes |
|----------------|------------------|
| Extension chứa fix SA4E-358 (1.52.0+; working tree main HEAD tham chiếu `7bb9222` — SM commit) | §8 — behavior changes có chủ đích (đều là mục đích của fix); caller hợp lệ + native client: backward compatible, không đổi config |
| Extension trước fix | Có finding SA-01 mở (ACAO `*` + preflight mở + SSE mở) — khuyến nghị nâng cấp |

### 9.4 Trạng thái Verification (minh bạch — cái gì đã chứng minh, cái gì đang chờ)

| Mục | Trạng thái | Nguồn |
|-----|-----------|-------|
| Unit gate (PBT + UT-01..39, gồm H-7/H-8/H-9 SEC-358-01) | ✅ PASS (46/46; OriginGate coverage 100% stmts) | STC v1.1 + test-run-summary §1 |
| Integration server-thật (IT-01..14: deny shape, sweep 15 responses, raw-socket duplicate, preflight matrix, binding) | ✅ PASS (40/40) | test-run-summary §1 |
| Full regression extension | ✅ PASS (286 files · 2808 tests · 0 failed) | test-run-summary §1 |
| Live harness :9181 (LH-01..15 — gồm LH-13 rebinding no-Origin → 403 host-mismatch) | ✅ PASS 15/15 — **chế độ STANDALONE** (boot WrapperServer thật in-process, cùng HTTP surface + deny log production) | test-run-summary §4 |
| Bench NFR <1ms | ✅ PASS (p99 ≤ 145.2µs; e2e delta median ≈ 0) | test-run-summary §3 |
| Static gates (SCAN-01/02, semgrep, tsc, eslint) | ✅ PASS | test-run-summary §2 |
| V-1a static grep (MCP SDK không gắn Origin) | ✅ PASS | native-client-headers.md |
| V-1b runtime session client thật | ✅ ở mức **standalone** (LH-08) — ⏳ **xác nhận trên extension dev host thật đang PENDING (SM/QA chạy lại harness, N-QA2)** | test-run-summary §5 |
| V-4 (cập nhật BRD A-1 status) | ⏳ Thuộc BA/SM | test-run-summary §5 |

> Guide này chỉ mô tả behaviors đã verify ở các mức trên. Mục có trạng thái ⏳ **không** được coi là đã confirm cho đến khi SM/QA ghi nhận evidence dev-host.

---

*— Hết UG v1.0 — SA4E-358 — Origin/Host gate trên loopback :9181: 7 gate rules (fail-closed, echo-only CORS, Host-check-mọi-request-có-Host), deny 403 + `{"error":"Forbidden"}` + zero CORS, 3 deny reasons trong log sanitized, behavior changes cho user cũ — facts verified từ OriginGate.ts + WrapperServer.ts + STC v1.1 + evidence test-run —*
