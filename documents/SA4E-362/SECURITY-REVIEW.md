# 🔒 Security Design Review — Phase 3.7

| Field | Value |
|-------|-------|
| Ticket | SA4E-362 — [Pega Ingest] Refresh-on-401 cho ingest path |
| Review type | Design-stage security review (pre-implementation) |
| Inputs | TDD v1.0 (authoritative), FSD v1.0 (§4.1, §5.3, §7), code branch SA4E-362 |
| Files verified | AuthManager.ts, backend-auth-headers.ts, PegaStreamIngester.ts, PegaBfsPipeline.ts, IndexerHttpClient.ts, BackendHttpPoster.ts, PegaBackendClient.ts, PegaSchemaIndexer.ts, PegaCodeIntelDiscovery.ts, HttpServer.ts, jwt-auth.ts, refresh-tokens.ts |
| Date / Assessor | 2026-10-16 — Security Agent |
| Verdict | **APPROVED-WITH-CONDITIONS** (2 design-level conditions, 12 code-review checkpoints) |

## Verdict

Thiết kế refresh-on-401 **an toàn về bản chất**: retry đúng 1 lần chỉ khi HTTP 401 (middleware chặn trước handler → không side-effect), refresh dedupe bằng `refreshInFlight` (check-and-set đồng bộ trong JS event-loop → không TOCTOU), clearSession khi refresh credential chết là hành vi đúng (ngăn replay token backend đã từ chối), không thêm storage, không log token, không thêm endpoint/URL mới. 2 điều kiện thiết kế (SEC-01, SEC-02) phải được áp vào code khi implement; 12 checkpoint bắt buộc verify lại ở Phase 5.7.

## Findings

| ID | Severity | Description | Design element | Recommendation |
|----|----------|-------------|----------------|----------------|
| SEC-01 | Low | `stopReason` và `shouldStop?` typed `string \| null` (TDD §2.3) — chuỗi reason tự do chảy vào log line "Stopped: <label>" và `BfsRunResult`. Hiện tại chỉ có hằng số nội bộ 'auth', nhưng typing mở cho chuỗi không kiểm soát trong tương lai (log-injection tiềm ẩn qua OutputChannel) | PegaBfsPipeline §2.3, BfsRunResult §4.1 | Thu hẹp kiểu thành literal union `'auth' \| null` (cả `shouldStop?: () => 'auth' \| null` và `BfsIndexResult.stopReason?: 'auth' \| null`). Compile-enforced, không đổi hành vi |
| SEC-02 | Low | Body của response lỗi nhúng nguyên văn vào error message: "Ingest submit failed: HTTP <status> — <text>" (TDD §2.2 Đổi 6) — `text` không giới hạn độ dài; backend tin được nhưng proxy/HTML error page có thể chèn nội dung lớn/xuống dòng vào exception → noise log. (Trong auth-dead path, BFS indexer log message cố định nên không leak — chỉ non-401 path) | PegaStreamIngester submitJob Đổi 6 | Cap độ dài theo pattern hiện có của Discovery/SchemaIndexer: `text.substring(0, 200)` + strip newline. Giữ format message (contract UT) — chỉ truncate |
| SEC-03 | Info | `sdlcAgents.backendUrl` không có HTTPS enforcement (default `http://localhost:48721`, PegaHttpCore.ts:74-76); FSD §7-3 "giả định HTTPS prod" nhưng không verify. Token Bearer đi qua scheme user cấu hình. **Pre-existing, ngoài scope fix** — enforcement SEC-02 hiện chỉ áp cho pegaEndpoint | Transport (không đổi bởi thiết kế) | Hardening tương lai (ticket riêng): warn khi backendUrl là http:// và không phải localhost. Không block thiết kế này |
| SEC-04 | Info | Legacy fallback `globalThis.__authTokenProvider` được giữ (TDD §2.5 Đổi 5, backend-auth-headers.ts:21) — token truy cập qua global in-memory. Chấp nhận được (pre-existing, in-memory only, BR-5 vẫn đảm bảo token rỗng → không header); PegaMcpTools chưa wire provider (nợ REG-13 tường minh) | backend-auth-headers.ts, CatalogIndexer Đổi 5 | Ghi nhận nợ kỹ thuật: dọn globalThis fallback khi mọi path đã qua IngestAuthProvider; wire PegaMcpTools trong follow-up |
| SEC-05 | Info (positive) | `/api/v1/pega/schema/generate` nằm sau `jwtAuth` (HttpServer.ts:111 `app.use('/api/v1/pega/*', jwtAuth)`) → việc PegaSchemaIndexer hiện KHÔNG gửi Authorization là **bug thật** trong mode CODE_INTEL_REQUIRE_AUTH=true (401 mọi call). Fix FR-7-T3 sửa đúng root cause; trong mode anonymous (REQUIRE_AUTH=false) middleware `return anonymous()` nên thêm header không phá gì | PegaSchemaIndexer T-3 (FR-7) | Không cần thay đổi — thiết kế đúng. Verify UT-13 tại 5.7 |

## Checklist Answers (1-8)

| # | Câu hỏi | Kết luận | Bằng chứng |
|---|---------|----------|-----------|
| 1 | Token leak vào logs/errors/telemetry? | **PASS** — các log line thiết kế (FSD §4.1: 🔐 401/refresh, ⛔ auth-dead, ⏸️ stopped) chỉ chứa endpoint + hành vi, BR-6 cấm tường minh; grep các file bị tác động: 0 log statement tham chiếu token; BackendHttpPoster throw chỉ statusText. Rủi ro duy nhất = SEC-02 (error body, đã cap) | FSD §4.1; grep 10 file; TDD §2.8 |
| 2 | Replay risk của single-retry? TOCTOU refreshInFlight? ClearSession đúng? | **PASS** — (a) 401 phát từ jwtAuth middleware TRƯỚC handler (HttpServer.ts:111, jwt-auth.ts:113/118) → request 401 không side-effect; backend dedup checksum → replay POST an toàn; retry dùng token MỚI, không replay token cũ. (b) `refreshInFlight` check-then-set đồng bộ (AuthManager.ts:472-473, không await xen giữa) → không TOCTOU trong event-loop. (c) Rotation backend: family-based + REFRESH_GRACE_SEC=60 cho concurrent refresh; reuse sau grace → revoke cả family (stolen-token detection) — design chỉ gọi refresh qua AuthManager live, không giữ refresh token cũ → không kích hoạt family-revoke. (d) clearSession trên 401/403/400/404 của /refresh là đúng: xoá cả 2 token + secrets, không throw → adapter trả undefined (AuthManager.ts:491-497, :509-520); network error chỉ warn, giữ session — fail-safe | AuthManager.ts:471-520; refresh-tokens.ts:17,96-99; FSD §5.3 |
| 3 | Provider surface có exposure? | **PASS** — IngestAuthProvider là interface in-memory, tham chiếu live qua closure `currentToken()`, không copy/hold token; GAP 4 cập nhật `this.token` (field in-memory pre-existing, IndexingService.ts:25). Tất cả consumer là services nội bộ extension (trusted). Không persist, không ra webview (webview đọc qua BasePanel.authTokenProvider riêng, không đổi) | TDD §2.7; IndexingService.ts:20-53; CommandRegistrar.ts:49-51 |
| 4 | Transport: hardcoded URL / http:// mới? | **PASS** — grep 10 file bị tác động: 0 hardcoded URL; mọi fetch dùng backendUrl từ config (PegaHttpCore.ts:74-76); FR-7 không thêm endpoint mới (PegaBackendClient: core.getBackendUrl(); Discovery: getBackendUrlPublic(); SchemaIndexer: httpClient.getBaseUrl()). Lưu ý SEC-03 (pre-existing, không block) | grep; TDD §4.2 "wire-format unchanged" |
| 5 | shouldStop/stopReason/BfsRunResult injection? | **PASS với điều kiện** — 'auth' là hằng số nội bộ hardcode (TDD §2.4 Đổi 5), notification là chuỗi cố định (không interpolate user input), counters là số. Điều kiện: thu hẹp type (SEC-01) để khoá surface | TDD §2.3/§2.4; FSD §4.1 |
| 6 | DoS/resource: retry loop, unbounded? | **PASS** — fetch ≤ 2 / refresh ≤ 1 per request (PBT-01 property test bắt buộc); refresh song song N→1 qua refreshInFlight (chống thundering-herd); poll giữ nhịp 3s cũ, mỗi iteration retry độc lập bounded; bounded channel + 64 concurrency KHÔNG đổi; không auto-login (BR-3) → không refresh storm khi phiên chết | TDD §5 PBT-01; FSD §7-6; §2.10 GIỮ NGUYÊN |
| 7 | AuthZ: schema/generate + X-Project-Id? | **ANSWERED** — route jwtAuth-enforced (HttpServer.ts:111) → thiếu header là bug, thêm header là FIX (không bypass gì); mode anonymous không bị phá (jwt-auth.ts:112 `return anonymous()`). X-Project-Id trên pollUntilComplete (Đổi 7) khớp quy ước SEC-01 — identity header, backend vẫn scope theo JWT identity, không phải authz boundary | HttpServer.ts:111; jwt-auth.ts:18,31,85-118 |
| 8 | Storage mới ngoài AuthManager? | **PASS** — thiết kế KHÔNG thêm storage: token vẫn ở SecretStorage (OS keychain) + cachedToken in-memory; provider là reference; adapter chỉ ghi `this.token` in-memory (field có sẵn); rollback không để lại state | TDD §6.1; FSD §7-2 |

## Phase 5.7 Handoff — MUST verify at code review

1. **Grep log leak**: mọi log line mới/khía cạnh sửa — 0 xuất hiện token cũ/mới, `Authorization`, `refresh_token` (BR-6).
2. **Retry đúng cơ chế**: send lần 2 rebuild headers + body với token fresh; `makeBody()` tạo stream instance mới mỗi attempt; `duplex:'half'` ở CẢ HAI lần (UT-04).
3. **Exactly-once**: retry vẫn 401 → KHÔNG refresh lần 2 (UT-14); refresh gọi ≤ 1/request (PBT-01: fetch ≤ 2).
4. **Catch order**: `instanceof IngestAuthError` đứng TRƯỚC catch-generic trong `ingestAndDiscover` (TDD §2.4 Đổi 6).
5. **Poll rebuild**: `pollUntilComplete` rebuild headers per-iteration + có `X-Project-Id` (Đổi 7 — fix bug build-1-lần :148-150).
6. **BackendHttpPoster**: runtime discriminate — legacy `() => string` KHÔNG refresh; retry chỉ rebuild Authorization; 3 test cũ :31/:44/:58 xanh không sửa (UT-10d).
7. **SchemaIndexer**: gửi `buildBackendAuthHeaders()` (Authorization + X-Project-Id khi có token, BR-5); anonymous mode không vỡ (UT-13).
8. **GAP 4**: refresh thành công → `this.token` cập nhật → `getTokenSync()` trả fresh (UT-11); adapter trả `undefined` khi refresh chết (không throw).
9. **SEC-01 áp dụng**: `shouldStop`/`stopReason`/`BfsRunResult.stopReason`/`BfsIndexResult.stopReason` typed literal union `'auth' \| null`.
10. **SEC-02 áp dụng**: error body truncate `substring(0, 200)` + strip newline trong submitJob Đổi 6 (giữ format contract UT).
11. **No new storage**: không có secrets.store/persist token ngoài AuthManager; provider không được serialize.
12. **REG-13 audit grep**: 0 call site `/api/v1/pega/*` tự dựng Authorization từ getTokenSync() mà không qua withAuthRetry (trừ AuthManager nội bộ; PegaMcpTools ghi nhận tường minh).

## Security Notes — những gì thiết kế làm ĐÚNG (acknowledge)

- Retry safety có nền tảng verify được: 401 pre-handler + checksum dedup (FSD §5.3) — không phải đoán.
- Chống thundering-herd bằng promise dedupe thay vì retry-storm; không auto-login loại trừ credential-stuffing surface.
- Fail-safe đúng chỗ: network error KHÔNG trigger refresh (BR-1), không log user out vì lỗi tạm thời.
- Typed error + `instanceof` thay regex message — giảm false-positive auth-dead.
- Rollback sạch: không storage mới, không data migration → revert không để lại rác token.

---
*Security Design Review v1.0 — Security Agent, 2026-10-16. Static design-stage analysis; không chạy runtime/penetration test. Findings SEC-03/SEC-04 là pre-existing ngoài scope fix.*
