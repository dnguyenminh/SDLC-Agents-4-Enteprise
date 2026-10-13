# SA4E-358 — V-3 / V-1 Native Client Header Evidence

> Ticket: SA4E-358 · Điều kiện merge #5 (TDD §8.5 / §11.7, STC E2E-API-05)
> Thu thập: DEV agent, 2026-10-13 · Environment: Windows, Node v24.8.0, repo workspace
> Giả định A-1 cần chứng minh: **native MCP client KHÔNG gắn header `Origin`** (R-3/V-1).

---

## V-3 — Header capture (static + runtime, TRƯỚC khi bật gate)

### V-3a — Static grep `@modelcontextprotocol/sdk` (VS Code built-in MCP client layer)

- Package: `@modelcontextprotocol/sdk` ^1.29.0 (extension/node_modules — cùng code
  VS Code built-in MCP client vendor).
- Files grep: `dist/esm/client/{streamableHttp.js, sse.js, auth.js, middleware.js}`

Kết quả grep case-insensitive `origin`:

| File | Match | Phân loại |
|------|-------|-----------|
| `streamableHttp.js:380` | `// Get original message(s) for detecting request IDs` | từ "original" — KHÔNG phải header |
| `sse.js:104-105` | `if (this._endpoint.origin !== this._url.origin) throw ...` | **đọc** `URL.origin` property (validate endpoint event cùng origin) — KHÔNG set request header `Origin` |
| `auth.js:340,557-586` | `url.origin`, `resourceMetadata ... (or origin)` | **đọc** `URL.origin` property cho well-known discovery — KHÔNG set request header |
| `middleware.js:45` | `new URL(input).origin` | **đọc** `URL.origin` property — KHÔNG set request header |

Headers client THỰC SỰ set (`streamableHttp.js` `_commonHeaders()` + sse.js tương tự):

```
Authorization: Bearer <token>          (chỉ khi có auth)
mcp-session-id: <id>
mcp-protocol-version: <version>
Accept: application/json, text/event-stream
Content-Type: application/json
+ caller-provided extraHeaders (this._requestInit?.headers)
```

**Kết luận V-3a: PASS** — HTTP client layer của SDK KHÔNG tự gắn `Origin`.
`Origin` chỉ do browser engine gắn cho cross-origin fetch/XHR — Node fetch/undici
(kể cả khi caller truyền init không Origin) không thêm.

### V-3b — Runtime capture (STANDALONE — real WrapperServer + SDK-equivalent session)

Chạy `npx tsx documents/SA4E-358/testdata/cors-pentest-harness.ts --standalone`
(boot WrapperServer THẬT in-process, vscode stubbed — cùng HTTP surface production):

- LH-08 (V-1b): full native session **không Origin** — initialize →
  notifications/initialized → tools/list → tools/call → GET /mcp SSE →
  `flow=[200,202,200,200,200]`, **deny log delta = 0**
  (KHÔNG có dòng `reason=origin-not-allowed` cho native client).
- Host header client gửi: `127.0.0.1:9181` (mặc định Node http + SDK Streamable
  HTTP — khớp Phase 1.5, UT-33/H-8).

**Kết luận V-3b: PASS** (mức SDK-equivalent HTTP session).

---

## V-1a — Static grep verdict

| Client | HTTP layer | Kết luận |
|--------|-----------|----------|
| VS Code built-in MCP client | `@modelcontextprotocol/sdk` client/streamableHttp.js + client/sse.js (Node fetch/undici) | **KHÔNG set Origin** (V-3a bảng trên) |
| Kiro MCP client | Cùng SDK layer (vendor giống nhau) | **KHÔNG set Origin** — cùng bằng chứng V-3a |
| SDLC agents (in-process) | `remote-backend-client.ts:120` `invokeTool` gọi `routeToolCall` trực tiếp — KHÔNG qua HTTP | Ngoài bề mặt gate (FSD §2.2 row 13) — không thể bị deny |
| stdio transports | Không qua HTTP | Ngoài bề mặt gate |

**V-1a = PASS.**

## V-1b — Runtime verdict

| Bước | Kết quả |
|------|---------|
| LH-08 standalone (SDK-equivalent full session, no-Origin) | PASS — flow 100%, deny log delta 0 |
| **Còn lại cho SM/QA (dev-host thật)** | Chạy harness KHÔNG `--standalone` trên Kiro/VS Code extension host :9181 sau khi load extension build mới → xác nhận deny log outputChannel KHÔNG có `reason=origin-not-allowed` cho 1 session MCP thật của IDE client |

**V-1b = PASS (standalone) / PENDING dev-host confirmation (N-QA2 — block condition của QA, không block code merge vì static + standalone đã khớp A-1).**

## V-1c — CSV row (cũng đã append vào `pentest-results.csv`)

```
V-1,native client Origin assumption (A-1),"static grep SDK client layer + LH-08 runtime session","(a) khong Origin duoc set + (b) session live khong sinh deny log","V-1a PASS (4 files, 0 Origin-header emission); V-1b PASS standalone (deny log delta 0); dev-host rerun pending SM/QA","PASS (standalone) / PENDING dev-host"
```

## V-4 — Giả định A-1 chốt

- A-1 (**verified** ở mức evidence khả dụng): native client không gửi Origin →
  nhánh no-Origin + Phase 1.5 Host check đủ cho mọi client thật.
- Nếu dev-host rerun sinh `reason=origin-not-allowed` cho native client → xử lý
  theo AF-2 UC-04 + BR-10 (thêm pattern allowlist qua code change + test —
  TUYỆT ĐỐI KHÔNG nới `*`).
- Cập nhật BRD A-1 trạng thái + FSD §11.2 Change Log: **thuộc BA/SM** (DEV không
  sửa BRD/FSD) — SM attach evidence này vào ticket.
