# Software Test Cases (STC)

## SDLC Agents 4 Enterprise — SA4E-362: [Pega Ingest] Refresh-on-401 cho ingest path

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-362 |
| Author | QA Agent |
| Version | 1.1 |
| Date | 2026-10-16 |
| Status | Draft (pending BA review gate) |
| Inputs | BRD.md (US-1..US-4), SessionTimeout-FIX-PLAN.md §4/§7 |

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-16 | QA Agent | Initiate STC — 22 TCs (14 UT + PBT-01 + REG-13 + 4 E2E-API covered-by-SIT + 2 SIT), RTM trace BRD-level; BA review gate iteration 1 incorporated (thêm UT-14 retry-vẫn-401, pin typed IngestAuthError, thêm E2E-API-04 bulk-check) |
| 1.1 | 2026-10-16 | QA Agent | RTM 3-way sync: US→FR→TC — thêm cột FSD FR (FR-1..FR-8 theo FSD v0.9) + FR Coverage Rollup §2.2; giữ nguyên 22 TCs, không renumber |

---

## 1. Conventions (match existing test style)

- **Fetch mock:** vi.stubGlobal('fetch', fetchMock) + mockResolvedValueOnce chains (pattern: IndexerHttpClient.token-refresh.test.ts).
- **Response helper:** jsonResponse(body, status) → { ok: status ∈ 2xx, status, text: async () => body } (pattern: IndexerHttpClient.ingest.test.ts).
- **Private access:** (instance as any).method() cho private helpers (fetchWithAuthRetry, authHeaders).
- **AuthManager stub:** Map-based secrets (makeSecrets) + okJson fake Response (pattern: auth-manager.test.ts).
- **Fake timers BẮT BUỘC:** vi.useFakeTimers() + vi.advanceTimersByTimeAsync(3000) cho mọi test chạm pollUntilComplete (POLL_INTERVAL_MS = 3000 tại PegaStreamIngester.ts:53); afterEach: vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks().
- **Signature nguồn:** tên interface/hàm theo fix plan §6 (IngestAuthProvider, IngestAuthError, shouldStop trong PipelineOptions, authHeaders, fetchWithAuthRetry, makeBody). Nếu DEV đặt tên khác → STC cập nhật trong sync pass, test intent không đổi.

## 2. Requirements Traceability Matrix (RTM)

Trace 3 cấp: **BRD US/AC → FSD FR-1..FR-8 (FSD v0.9) → Test Cases** (sync v1.1 — FR IDs ổn định, không đổi qua TA enrichment v1.0).

### 2.1 BRD US/AC → FR → TC

| Requirement (BRD) | FSD FR | Test Cases | Coverage |
|-------------|--------------|------------|----------|
| US-1 AC1 — token còn hạn: dùng cached token, 0 lời gọi refresh | FR-2 | UT-03, UT-07, PBT-01 | ✅ |
| US-1 AC2 — 401 giữa job: refresh đúng 1 lần → rebuild headers/body → retry 1 lần → 200, loop tiếp tục | FR-2, FR-5 | UT-01, UT-02, UT-04, E2E-API-01, SIT-01 | ✅ |
| US-1 AC3 — nhiều 401 song song → đúng 1 refresh network call (dedupe refreshInFlight) | FR-1, FR-2 | UT-12 | ✅ |
| US-1 AC4 — submitJob stream retry: body dựng lại qua makeBody() factory | FR-2 | UT-04 | ✅ |
| US-1 AC5 — pollUntilComplete GET 401: headers rebuild per-request, poll tiếp tục | FR-2 | UT-05 | ✅ |
| US-1 AC6 — log ghi rõ điểm refresh, không log giá trị token | FR-2, FR-3 | UT-01, SIT-01 | ✅ |
| US-2 AC1 — typed IngestAuthError nhận diện (không regex), authDead = true — CẢ 2 trigger: refresh trả undefined VÀ retry vẫn 401 | FR-2, FR-3 | UT-08, UT-02, UT-14 | ✅ |
| US-2 AC2 — shouldStop dừng producer, không skip hàng loạt | FR-4 | UT-08, UT-09 | ✅ |
| US-2 AC3 — đúng 1 thông báo "login lại", không spam lỗi | FR-3, FR-4 | UT-08, SIT-02 | ✅ |
| US-2 AC4 — rerun incremental sau khi login lại | FR-4 | SIT-02 | ✅ |
| US-2 AC5 — bulk-check/call song song dừng sạch theo auth-dead, không fallback re-fetch | FR-6 | UT-10 | ✅ |
| US-3 AC1 — bulk-check 401 → refresh → retry 1 lần → thành công, hết spam 401 | FR-6 | UT-10, SIT-01 | ✅ |
| US-3 AC2 — refresh chết → bulk-check dừng theo auth-dead, không re-fetch catalog | FR-6 | UT-10 | ✅ |
| US-3 AC3 — retry bulk-check an toàn (401 trước handler, không side-effect) | FR-6 | E2E-API-01, E2E-API-02, E2E-API-03, E2E-API-04 | ✅ |
| US-4 AC1 — mọi call /api/v1/pega/* qua provider refresh-on-401; audit 0 static-token path | FR-1, FR-5, FR-7 | UT-11, REG-13 | ✅ |
| US-4 AC2 — PegaSchemaIndexer có Authorization header + refresh-on-401 | FR-7 | UT-13 | ✅ |
| US-4 AC3 — regression suite npm test xanh (auth-manager, token-refresh-timer, http-client + UT mới) | FR-8 | REG-13, UT-10 | ✅ |

### 2.2 FR Coverage Rollup (FR → TC)

| FSD FR | Mô tả | Test Cases | Coverage |
|--------|-------|------------|----------|
| FR-1 | Contract `IngestAuthProvider` + adapter tại call site | UT-06, UT-07, UT-11, UT-12 | ✅ |
| FR-2 | `fetchWithAuthRetry` + per-call-site retry (submitJob/pollUntilComplete/ingestSingleRule) | UT-01, UT-02, UT-03, UT-04, UT-05, UT-07, UT-12, UT-14, PBT-01 | ✅ |
| FR-3 | Typed `IngestAuthError` + `PegaBfsIndexer.authDead` | UT-02, UT-08, UT-09, UT-14 | ✅ |
| FR-4 | `PegaBfsPipeline` shouldStop graceful stop | UT-08, SIT-02 | ✅ |
| FR-5 | Wiring `IndexingService` + token sync (GAP 4) | UT-11 | ✅ |
| FR-6 | `BackendHttpPoster` bulk-check refresh-on-401 (back-compat) | UT-06, UT-10, E2E-API-04 | ✅ |
| FR-7 (SHOULD) | Static-token paths còn sót (PegaSchemaIndexer/PegaBackendClient/PegaCodeIntelDiscovery) | UT-13, REG-13 (audit SM-6) | ✅ |
| FR-8 | Yêu cầu kiểm thử tự động (suite UT + regression) | UT-01..UT-14, PBT-01, REG-13 | ✅ |

**Coverage: 17/17 ACs của US-1..US-4 = 100%; 8/8 FR-1..FR-8 = 100%.** FR-7 (SHOULD) đã có UT-13 (SchemaIndexer gửi Authorization header + refresh-on-401 on 401) + audit REG-13 — không cần thêm TC.
---

## 3. Test Cases

### Level legend

| Prefix | Level | Automation |
|--------|-------|------------|
| UT-xx | Unit | Automated (vitest) |
| PBT-xx | Property-Based | Automated (vitest + fast-check) |
| E2E-API-xx | REST contract E2E | Covered-by-SIT (manual — justification STP §2.2) |
| REG-xx | Regression suite | Automated |
| SIT-xx | System Integration | Manual |

---

### UT-01: ingestSingleRule — 401 → refresh đúng 1 lần → retry với token mới → thành công

| Field | Value |
|-------|-------|
| **ID** | UT-01 |
| **Priority** | P1 |
| **Type** | Functional (Automated — vitest) |
| **Requirement** | US-1 AC2, AC6 |
| **Precondition** | PegaStreamIngester đã nhận IngestAuthProvider; fetch được stub |
| **Target file** | extension/src/services/__tests__/PegaStreamIngester.auth-retry.test.ts (mới — auto-discovered bởi vitest.config include) |

**Steps:**

| Phase | Action | Expected |
|-------|--------|----------|
| Arrange | fetchMock.mockResolvedValueOnce(jsonResponse('{"error":{"code":"TOKEN_INVALID","message":"Invalid or expired token"}}', 401)).mockResolvedValueOnce(jsonResponse('{"ok":true}', 200)); auth = { getTokenSync: () => 'stale-token', refreshToken: vi.fn().mockResolvedValue('fresh-token') }; new PegaStreamIngester('http://localhost:48721', auth) | — |
| Act | await (ing as any).ingestSingleRule(rule) (hoặc public method bọc nó) | — |
| Assert | auth.refreshToken | được gọi đúng 1 lần |
| Assert | fetchMock.mock.calls.length | === 2 |
| Assert | Header call #2: Authorization | === 'Bearer fresh-token' (call #1 là 'Bearer stale-token') |
| Assert | Kết quả | rule ingested thành công (200), KHÔNG throw |
| Assert | Log output | có dòng ghi điểm refresh/retry; KHÔNG chứa chuỗi 'fresh-token' hay 'stale-token' (US-1 AC6) |

**Test Data:** stale-token, fresh-token, rule = { projectId: 'proj-1', ruleName: 'Test-Rule', ... } (xem test-data/http-status-scenarios.csv dòng UT-01).

---

### UT-02: refresh trả undefined → trả 401 gốc, fetch đúng 1 lần, không loop

| Field | Value |
|-------|-------|
| **ID** | UT-02 |
| **Priority** | P1 |
| **Type** | Functional / Negative (Automated — vitest) |
| **Requirement** | US-1 AC2 (validation rule: refresh undefined → không retry, trả 401 gốc cho caller) |
| **Precondition** | Như UT-01; refreshToken resolves undefined |
| **Target file** | extension/src/services/__tests__/PegaStreamIngester.auth-retry.test.ts |

**Steps:**

| Phase | Action | Expected |
|-------|--------|----------|
| Arrange | fetchMock.mockResolvedValueOnce(jsonResponse('', 401)); auth = { getTokenSync: () => 'stale-token', refreshToken: vi.fn().mockResolvedValue(undefined) } | — |
| Act | await (ing as any).ingestSingleRule(...) — catch nếu throw | — |
| Assert | fetchMock.mock.calls.length | === 1 (không retry, không loop) |
| Assert | auth.refreshToken | đúng 1 lần |
| Assert | Kết quả | 401 gốc được propagate nguyên trạng cho caller — error raise là **typed IngestAuthError** (assert `instanceof IngestAuthError`) mang context 401 gốc (status 401 / message 'Invalid or expired token'); KHÔNG dựa vào regex trên message; không crash, không retry thêm |

---

### UT-03: non-401 (400/500/503) → refreshToken gọi 0 lần

| Field | Value |
|-------|-------|
| **ID** | UT-03 |
| **Priority** | P1 |
| **Type** | Functional / Negative (Automated — vitest, it.each) |
| **Requirement** | US-1 AC1 (token còn hạn/không 401 → không refresh) |
| **Precondition** | Provider có refreshToken spy |
| **Target file** | extension/src/services/__tests__/PegaStreamIngester.auth-retry.test.ts |

**Steps:**

| Phase | Action | Expected |
|-------|--------|----------|
| Arrange + Act | it.each([400, 403, 500, 503]) — fetch resolves jsonResponse(errBody, status); act ingestSingleRule | — |
| Assert | auth.refreshToken | gọi đúng 0 lần với MỌI status non-401 |
| Assert | fetchMock.mock.calls.length | === 1 (không retry) |
| Assert | Hành vi | lỗi propagate như hiện trạng (throw/skip logic không đổi) — 403 KHÔNG bị coi là hết hạn |

**Test Data:** test-data/http-status-scenarios.csv — 14 dòng (7 status × refresh true/false); status 200/202 → success, không refresh.

---

### UT-04: submitJob stream replay — makeBody gọi 2 lần, 2 ReadableStream instance, duplex:'half' cả 2, header lần 2 Bearer fresh

| Field | Value |
|-------|-------|
| **ID** | UT-04 |
| **Priority** | P1 |
| **Type** | Functional (Automated — vitest) |
| **Requirement** | US-1 AC4 (+ AC2) |
| **Precondition** | submitJob dùng factory makeBody() per-send (fix plan §4.2.1) |
| **Target file** | extension/src/services/__tests__/PegaStreamIngester.auth-retry.test.ts |

**Steps:**

| Phase | Action | Expected |
|-------|--------|----------|
| Arrange | fetchMock 401 lần 1 → 200 lần 2; auth.refreshToken → 'fresh-token'; spy ReadableStream nếu cần đếm instance | — |
| Act | await (ing as any).submitJob(jobPayload) | — |
| Assert | makeBody | được gọi đúng 2 lần (không reuse stream đã consume) |
| Assert | 2 body | là 2 instance ReadableStream KHÁC nhau (body1 !== body2) |
| Assert | init của cả 2 call | đều có duplex: 'half' |
| Assert | Header call #2 | Authorization === 'Bearer fresh-token' |

---

### UT-05: pollUntilComplete — 401 giữa loop → refresh per-request, polling tiếp tới done (fake timers)

| Field | Value |
|-------|-------|
| **ID** | UT-05 |
| **Priority** | P1 |
| **Type** | Functional (Automated — vitest + fake timers) |
| **Requirement** | US-1 AC5 (+ AC2) |
| **Precondition** | pollUntilComplete đã rebuild headers TRONG vòng while (per-request), không build 1 lần trước loop |
| **Target file** | extension/src/services/__tests__/PegaStreamIngester.auth-retry.test.ts |

**Steps:**

| Phase | Action | Expected |
|-------|--------|----------|
| Arrange | vi.useFakeTimers(); fetchMock: GET#1 jsonResponse('',401) → GET#2 jsonResponse('{"status":"succeeded"}',200); auth.refreshToken → 'fresh-token' | — |
| Act | pollPromise = (ing as any).pollUntilComplete(jobId, projectId); await vi.advanceTimersByTimeAsync(3000) nếu cần giữa các poll; await pollPromise | — |
| Assert | auth.refreshToken | đúng 1 lần |
| Assert | Call #2 headers | Authorization === 'Bearer fresh-token' (headers rebuild per-request — call #1 là stale) |
| Assert | Kết quả | polling hoàn tất với status succeeded — KHÔNG treo, KHÔNG skip job |
| Cleanup | afterEach | vi.useRealTimers() |

---

### UT-06: Back-compat — constructor không auth → 401 trả nguyên trạng, không crash

| Field | Value |
|-------|-------|
| **ID** | UT-06 |
| **Priority** | P2 |
| **Type** | Functional / Backward-compat (Automated — vitest) |
| **Requirement** | US-4 AC1 (adapter giữ chữ ký công khai; call site cũ không vỡ) |
| **Precondition** | PegaStreamIngester cho phép khởi tạo không auth (auth?: IngestAuthProvider optional) |
| **Target file** | extension/src/services/__tests__/PegaStreamIngester.auth-retry.test.ts |

**Steps:**

| Phase | Action | Expected |
|-------|--------|----------|
| Arrange | fetchMock jsonResponse('', 401); ing = new PegaStreamIngester('http://localhost:48721') — KHÔNG truyền auth | — |
| Act | await (ing as any).ingestSingleRule(...) — catch nếu throw | — |
| Assert | Không throw TypeError/undefined access | xử lý auth === undefined an toàn (optional chaining) |
| Assert | fetchMock.mock.calls.length | === 1 (không retry khi không có provider) |
| Assert | Kết quả | 401 trả nguyên trạng cho caller (envelope parse như cũ) |

---

### UT-07: Token rỗng → không gắn Authorization, X-Project-Id luôn có

| Field | Value |
|-------|-------|
| **ID** | UT-07 |
| **Priority** | P2 |
| **Type** | Functional / Security (Automated — vitest) |
| **Requirement** | US-1 AC1; US-4 AC1 (authHeaders contract — fix plan §4.2) |
| **Precondition** | Provider getTokenSync trả '' (chưa login) |
| **Target file** | extension/src/services/__tests__/PegaStreamIngester.auth-retry.test.ts |

**Steps:**

| Phase | Action | Expected |
|-------|--------|----------|
| Arrange | auth = { getTokenSync: () => '', refreshToken: vi.fn() }; fetchMock 200 | — |
| Act | gọi ingestSingleRule/submitJob/pollUntilComplete | — |
| Assert | Header mọi call | KHÔNG có key Authorization (không gửi 'Bearer ' rỗng) |
| Assert | Header mọi call | X-Project-Id luôn được gắn (project identity) |
| Assert | refreshToken | 0 lần (không 401 vì chưa có 401 response) |

### UT-08: BFS authDead — ingestFn throw auth error → pipeline dừng sớm, remaining KHÔNG skip silently, log "paused due to auth"

| Field | Value |
|-------|-------|
| **ID** | UT-08 |
| **Priority** | P1 |
| **Type** | Functional (Automated — vitest) |
| **Requirement** | US-2 AC1, AC2, AC3 |
| **Precondition** | PegaBfsPipeline hỗ trợ shouldStop trong PipelineOptions; PegaBfsIndexer set authDead khi bắt IngestAuthError |
| **Target file** | extension/src/services/__tests__/PegaBfsPipeline.auth-dead.test.ts (mới) |

**Steps:**

| Phase | Action | Expected |
|-------|--------|----------|
| Arrange | 3 items [A, B, C]; ingestFn: item A throw **typed IngestAuthError** — producer của typed error là ingester: raise khi refresh trả undefined (UT-02) HOẶC khi retry vẫn 401 (UT-14); indexer nhận diện qua `instanceof IngestAuthError` — KHÔNG regex trên message (BRD loại bỏ regex brittle) | — |
| Act | chạy pipeline (producer-consumer) tới hoàn tất | — |
| Assert | Flag aborted của pipeline (PegaBfsPipeline :71) | = true — producer NGỪNG phát B, C |
| Assert | Số item bị ingest-fail xử lý sau A | ≈ 0 — KHÔNG có log lỗi per-rule hàng loạt cho B/C (không skip silently 25k+) |
| Assert | Log | chứa 'paused due to auth' (hoặc 'dừng ingest') + hướng dẫn 'login lại rồi chạy lại (state preserved)' — đúng 1 thông báo |
| Assert | Rule A | trả { ingested: false } — giữ eligible cho run sau (rerun incremental) |
| Assert | KHÔNG có auto-login | không có lời gọi login nào trong flow |

---

### UT-09: Non-auth error (HTTP 500) → authDead false, pipeline resilient như cũ

| Field | Value |
|-------|-------|
| **ID** | UT-09 |
| **Priority** | P1 |
| **Type** | Functional / Negative (Automated — vitest) |
| **Requirement** | US-2 (Error Handling: typed IngestAuthError là tín hiệu DUY NHẤT phân biệt lỗi auth) |
| **Precondition** | Như UT-08 nhưng error là Error('Ingest failed: HTTP 500') |
| **Target file** | extension/src/services/__tests__/PegaBfsPipeline.auth-dead.test.ts |

**Steps:**

| Phase | Action | Expected |
|-------|--------|----------|
| Arrange + Act | ingestFn throw Error thường (500) cho item A; chạy pipeline hết | — |
| Assert | authDead / aborted | = false |
| Assert | B, C | VẪN được xử lý bình thường (resilient như hành vi hiện tại) |
| Assert | Log | KHÔNG chứa 'paused due to auth' |

---

### UT-10: BackendHttpPoster — 401 → refresh → retry + non-401 không refresh (giữ 3 test cũ xanh — union signature)

| Field | Value |
|-------|-------|
| **ID** | UT-10 |
| **Priority** | P1 |
| **Type** | Functional / Backward-compat (Automated — vitest) |
| **Requirement** | US-3 AC1, AC2; US-2 AC5; US-4 AC3 |
| **Precondition** | BackendHttpPoster chấp nhận tokenProvider: (() => string) | IngestAuthProvider (union — 3 test cũ tại __tests__/BackendHttpPoster.test.ts :31/:44/:58 KHỔNG đổi) |
| **Target file** | extension/src/code-intel/delta/__tests__/BackendHttpPoster.test.ts (mở rộng — giữ nguyên 3 test cũ) |

**Steps:**

| Phase | Action | Expected |
|-------|--------|----------|
| 10a | fetch 401 → 200; poster = new BackendHttpPoster(url, { getTokenSync: () => 'stale', refreshToken: async () => 'fresh' }) | refreshToken đúng 1 lần; call #2 Authorization 'Bearer fresh'; kết quả parsed JSON |
| 10b | fetch 401; refreshToken → undefined | fetch đúng 1 lần; rejects /bulk-check HTTP 401/ — KHÔNG fallback re-fetch (US-2 AC5, US-3 AC2) |
| 10c | fetch 500; provider đầy đủ | refreshToken 0 lần; rejects /500/ như cũ |
| 10d (REG) | chạy nguyên file test cũ | 3 test cũ (plain () => string) vẫn xanh — union signature back-compat |

**Test Data:** TOKEN = 'jwt-token-abc', stale/fresh; xem test-data/http-status-scenarios.csv dòng UT-10*.

---

### UT-11: IndexingService wiring — provider có cả getTokenSync + refreshToken; refresh → this.token cập nhật (GAP 4)

| Field | Value |
|-------|-------|
| **ID** | UT-11 |
| **Priority** | P1 |
| **Type** | Integration-lite / Wiring (Automated — vitest) |
| **Requirement** | US-4 AC1; SA4E-300 GAP 4 (this.token đồng bộ) |
| **Precondition** | IndexingService tạo IngestAuthProvider đầy đủ theo fix plan §4.6 |
| **Target file** | extension/src/services/__tests__/IndexingService.ingest-auth.test.ts (mới) |

**Steps:**

| Phase | Action | Expected |
|-------|--------|----------|
| Arrange | svc = new IndexingService(...); set refreshTokenFn = vi.fn().mockResolvedValue('fresh-2') | — |
| Act | provider = (svc as any) provider builder; t1 = provider.getTokenSync(); fresh = await provider.refreshToken() | — |
| Assert | provider | có CẢ 2 method getTokenSync + refreshToken (không còn { getTokenSync } đơn lẻ) |
| Assert | fresh | === 'fresh-2'; refreshTokenFn đúng 1 lần |
| Assert | provider.getTokenSync() SAU refresh | === 'fresh-2' (this.token được cập nhật — GAP 4) |
| Assert | refreshTokenFn undefined | refreshToken() resolves undefined (không crash — nhánh graceful) |

---

### UT-12: AuthManager concurrent refresh dedupe — 2 Promise.all → 1 fetch /api/auth/refresh

| Field | Value |
|-------|-------|
| **ID** | UT-12 |
| **Priority** | P1 |
| **Type** | Functional / Concurrency (Automated — vitest) |
| **Requirement** | US-1 AC3 |
| **Precondition** | Token expired; refreshInFlight dedupe đã có trong AuthManager |
| **Target file** | extension/src/auth/__tests__/auth-manager.test.ts (thêm test vào file có sẵn) |

**Steps:**

| Phase | Action | Expected |
|-------|--------|----------|
| Arrange | makeSecrets(); fetchMock: login → okJson({ token: 'expired-tok', expiresAt: past }); rồi refresh → okJson({ token: 'fresh-tok', expiresAt: future }); auth.login('u','p') | — |
| Act | await Promise.all([auth.getAccessToken(), auth.getAccessToken()]) (2 call 401 song song) | — |
| Assert | fetchMock calls đến /api/auth/refresh | đúng 1 lần (dedupe refreshInFlight — không thundering herd) |
| Assert | Cả 2 promise | resolve 'fresh-tok' |

---

### UT-13: PegaSchemaIndexer — request có Authorization header (trước đây thiếu hẳn) + refresh-on-401

| Field | Value |
|-------|-------|
| **ID** | UT-13 |
| **Priority** | P2 |
| **Type** | Functional / Security (Automated — vitest) |
| **Requirement** | US-4 AC2 |
| **Precondition** | PegaSchemaIndexer nhận IngestAuthProvider |
| **Target file** | extension/src/services/__tests__/PegaSchemaIndexer.auth.test.ts (mới) |

**Steps:**

| Phase | Action | Expected |
|-------|--------|----------|
| Arrange | fetchMock: 401 lần 1 → 200 lần 2; provider stale/fresh | — |
| Act | chạy schema index flow | — |
| Assert | Call #1 | CÓ Authorization 'Bearer stale' (trước đây: header vắng hoàn toàn — root cause #13 BRD §8.1) |
| Assert | Call #2 | 'Bearer fresh' — refresh-on-401 đúng 1 lần |

---

### UT-14: Retry VẪN 401 sau khi refresh thành công → typed IngestAuthError (auth-dead trigger #2)

| Field | Value |
|-------|-------|
| **ID** | UT-14 |
| **Priority** | P1 |
| **Type** | Functional / Negative (Automated — vitest) |
| **Requirement** | US-2 AC1 (trigger "retry vẫn 401" — Business Flow Step 8 BRD: refresh thất bại **hoặc retry vẫn 401** → typed IngestAuthError); US-2 RD #1 (vẫn 401 = phiên thực sự chết) |
| **Precondition** | Provider refresh thành công (trả token mới) nhưng token mới cũng bị từ chối — phiên thực sự chết ở phía backend |
| **Target file** | extension/src/services/__tests__/PegaStreamIngester.auth-retry.test.ts |

**Steps:**

| Phase | Action | Expected |
|-------|--------|----------|
| Arrange | fetchMock.mockResolvedValueOnce(jsonResponse('', 401)).mockResolvedValueOnce(jsonResponse('{"error":{"code":"TOKEN_INVALID","message":"Invalid or expired token"}}', 401)); auth = { getTokenSync: () => 'stale-token', refreshToken: vi.fn().mockResolvedValue('fresh-token') } | — |
| Act | await (ing as any).ingestSingleRule(...) — catch | — |
| Assert | fetchMock.mock.calls.length | === 2 (retry đúng 1 lần — KHÔNG refresh/retry lần 2, không loop) |
| Assert | auth.refreshToken | đúng 1 lần (không refresh lặp lại với token vừa rotate) |
| Assert | Error raise | **typed IngestAuthError** (`instanceof IngestAuthError`) — tín hiệu duy nhất cho US-2 set authDead; KHÔNG phải generic Error, KHÔNG qua regex message |
| Assert | Hành vi tiếp theo | Caller (PegaBfsIndexer) xử lý như auth-dead → pipeline dừng sớm (liên kết UT-08) |

**Test Data:** stale-token, fresh-token (bị backend từ chối); xem test-data/http-status-scenarios.csv dòng UT-14.

---

### PBT-01: Property retry-once — mọi chuỗi status → ≤2 HTTP request, ≤1 lời gọi refresh

| Field | Value |
|-------|-------|
| **ID** | PBT-01 |
| **Priority** | P2 |
| **Type** | Property-Based (Automated — vitest + fast-check ^4.9.0) |
| **Requirement** | US-1 AC1, AC2 (tổng quát hóa UT-01..UT-03) |
| **Precondition** | fetchWithAuthRetry expose được qua public path (hoặc test qua (ing as any)) |
| **Target file** | extension/src/services/__tests__/PegaStreamIngester.auth-retry.test.ts |

**Steps:**

| Phase | Action | Expected |
|-------|--------|----------|
| Property | fc.assert(fc.property(fc.array(fc.constantFrom(200, 202, 400, 401, 403, 500, 503), { minLength: 1, maxLength: 8 }), fc.boolean(), async (statuses, refreshOk) => { ... fetch mock trả statuses tuần tự (401 đầu tiên → refresh nếu refreshOk → retry); chạy fetchWithAuthRetry(send) | với MỌI tổ hợp: fetch calls ≤ 2; refreshToken calls ≤ 1; refresh chỉ xảy ra khi response đầu là 401 |

---

### REG-13: Regression — npm run compile + npm run test:unit toàn suite xanh + audit static-token path

| Field | Value |
|-------|-------|
| **ID** | REG-13 |
| **Priority** | P1 |
| **Type** | Regression (Automated) |
| **Requirement** | US-4 AC1 (audit), AC3 (suite xanh); BRD SM-6, SM-7 |
| **Precondition** | Toàn bộ fix + test mới trong working tree (branch SA4E-362, chưa commit từ phía QA) |
| **Target file** | extension/package.json scripts (compile, test:unit) |

**Steps:**

| Phase | Action | Expected |
|-------|--------|----------|
| 1 | npm run compile (extension/) | exit 0 — không lỗi TypeScript |
| 2 | npm run test:unit (extension/) | toàn suite xanh — đặc biệt auth-manager.test.ts, token-refresh-timer.test.ts, http-client.test.ts, BackendHttpPoster.test.ts (3 test cũ :31/:44/:58 giữ nguyên), + 14 UT mới + PBT-01 |
| 3 (audit SM-6) | grep các call site /api/v1/pega/* (PegaBackendClient, PegaCodeIntelDiscovery, PegaSchemaIndexer, PegaCatalogIndexer, PegaBfs*) | 0 call site tự dựng Authorization từ getTokenSync() mà không qua fetchWithAuthRetry/provider (ngoại trừ nội bộ AuthManager) |
---

### E2E-API-01: POST /api/v1/pega/ingest-rule — auth contract (expired → 401 trước handler; valid → 200)

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-01 |
| **Priority** | P1 |
| **Type** | Covered-by-SIT (thực thi thủ công trong SIT-01 — justification STP §2.2: ACCESS_TTL_SEC là compile-time constant, CI không boot KB auth backend) |
| **Requirement** | US-1 AC2; US-3 AC3 (retry an toàn) |
| **Target file** | Thực thi: curl/REST client → localhost:48721; evidence: evidence/E2E-API-01.md |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | POST /api/v1/pega/ingest-rule với access token HẾT HẠN (Authorization: Bearer expired) | HTTP 401, body { error: { code: 'TOKEN_INVALID', message: 'Invalid or expired token' } } — trả TRƯỚC khi vào handler |
| 2 | Kiểm tra backend: rule KHÔNG được ingest (không side-effect) → retry sau refresh là an toàn | 0 record mới |
| 3 | POST lại với token mới (sau refresh) | HTTP 200 — rule ingested |

---

### E2E-API-02: POST /api/v1/pega/ingest-stream — auth contract (NDJSON stream)

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-02 |
| **Priority** | P1 |
| **Type** | Covered-by-SIT (chạy trong SIT-01) |
| **Requirement** | US-1 AC4; US-3 AC3 |
| **Target file** | curl --data-binary @stream.ndjson (Content-Type: application/x-ndjson) |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | POST /api/v1/pega/ingest-stream với token hết hạn | HTTP 401 TOKEN_INVALID — trước handler, không consume job |
| 2 | POST lại với token mới, stream NDJSON hợp lệ (duplex: 'half') | HTTP 200/202 — job accepted, trả jobId |

---

### E2E-API-03: GET /api/v1/pega/jobs/:id — auth contract (poll endpoint)

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-03 |
| **Priority** | P1 |
| **Type** | Covered-by-SIT (chạy trong SIT-01) |
| **Requirement** | US-1 AC5; US-3 AC3 |
| **Target file** | curl → localhost:48721 |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | GET /api/v1/pega/jobs/{jobId} với token hết hạn | HTTP 401 TOKEN_INVALID |
| 2 | GET lại với token mới (idempotent GET — retry an toàn) | HTTP 200, body có status job (queued/running/succeeded) |

---

### E2E-API-04: POST /api/v1/pega/bulk-check — auth contract (expired → 401 trước handler, không side-effect)

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-04 |
| **Priority** | P1 |
| **Type** | Covered-by-SIT (thực thi thủ công trong SIT-01 — cùng justification STP §2.2) |
| **Requirement** | US-3 AC3 (retry bulk-check an toàn — 401 phát trước handler, không side-effect); US-3 AC1/AC2 nền tảng |
| **Target file** | curl/REST client → localhost:48721; evidence: evidence/E2E-API-04.md |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | POST /api/v1/pega/bulk-check với access token HẾT HẠN | HTTP 401 TOKEN_INVALID 'Invalid or expired token' — trả trước khi vào handler (cùng JWT middleware với 3 endpoint kia) |
| 2 | Kiểm tra backend: catalog KHÔNG thay đổi (không side-effect) | 0 catalog records thay đổi → retry bulk-check sau refresh là an toàn |
| 3 | POST lại với token mới | HTTP 200 — bulk-check thành công, KHÔNG cần full catalog re-fetch |

---

### SIT-01 (Manual): TTL=60s — index project chạy > 60s → 1 lần refresh rồi tiếp tục, 0 spam

| Attribute | Value |
|-----------|-------|
| **ID** | SIT-01 |
| **Priority** | P1 |
| **Type** | Manual System Integration |
| **Requirement** | US-1 AC2/AC6; US-3 AC1; BRD SM-1, SM-2, SM-5; E2E-API-01..04 |
| **Precondition** | Backend local build với ACCESS_TTL_SEC = 60 (sửa TẠM backend/src/admin/db/jwt.ts:14 — REVERT sau test); refresh token TTL 7 ngày còn hiệu lực; project Pega test có thời gian chạy > 60s |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Sửa ACCESS_TTL_SEC = 60, build + start backend localhost:48721 | Backend lên |
| 2 | Login qua extension (AuthManager) | Access token TTL 60s |
| 3 | Chạy index project Pega (thời gian > 60s) | Job bắt đầu ingest bình thường |
| 4 | Sau 60s+, quan sát log extension | Đúng 1 lần: 401 → điểm refresh → retry với token mới → ingest TIẾP TỤC (không dừng, không skip) |
| 5 | Đếm occurrences | 'Invalid or expired token' xuất hiện ≤ 1 lần ĐIỂM (không spam lặp); SM-1 = 0 lần lặp SAU điểm refresh; SM-2 = 0 silent skip; KHÔNG có 'bulk-check HTTP 401' (SM-5) |
| 6 | Log không lộ token | Không có giá trị JWT trong log (US-1 AC6) |
| 7 | Chạy E2E-API-01/02/03/04 (curl) | 401 TOKEN_INVALID trước handler; valid token → 200 |
| 8 | **REVERT** ACCESS_TTL_SEC về 15 * 60; git diff xác nhận sạch | Không để lại thay đổi backend |

**Evidence:** screenshots/log → evidence/SIT-01-*.png, SIT-01-log.txt.

---

### SIT-02 (Manual): Revoke refresh token → dừng sạch "login lại", không skip hàng loạt, rerun incremental

| Attribute | Value |
|-----------|-------|
| **ID** | SIT-02 |
| **Priority** | P1 |
| **Type** | Manual System Integration |
| **Requirement** | US-2 AC1..AC4; BRD SM-2, SM-3, SM-4 |
| **Precondition** | Như SIT-01 (TTL=60); có khả năng vô hiệu hóa refresh token (logout server-side / xóa secret / revoke tại backend) |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Login, chạy index project; giữa job revoke refresh token (xoá refresh token phía backend / logout phiên) | Job đang chạy |
| 2 | Access token hết hạn → 401 → refresh attempt | Refresh THẤT BẠI (refresh token chết) → typed IngestAuthError |
| 3 | Quan sát pipeline | DỪNG NGAY sau item đang chạy (vài giây) — KHÔNG skip hàng loạt rule còn lại; SM-2: skip trước khi dừng ≈ 0 (chỉ item in-flight) |
| 4 | Thông báo | Đúng 1 thông báo rõ: 'hãy login lại rồi chạy lại (state preserved, rerun incremental)' — không spam lỗi (SM-3) |
| 5 | KHÔNG auto-login | Không có request login tự động nào |
| 6 | Login lại → rerun | INCREMENTAL: rules đã ingest không chạy lại; chỉ phần còn lại được xử lý (SM-4) |

**Evidence:** evidence/SIT-02-*.png, SIT-02-log.txt.

---

## 4. Test Data Files

| File | Phủ |
|------|-----|
| test-data/http-status-scenarios.csv | UT-01, UT-02, UT-03, UT-04, UT-05, UT-10, UT-13, UT-14, E2E-API-01..04 |
| test-data/token-auth-provider-scenarios.csv | UT-02, UT-06, UT-07, UT-11, UT-12, PBT-01 |
| test-data/pipeline-error-scenarios.csv | UT-08, UT-09, SIT-01, SIT-02 |
| test-data/TEST-REPORT-SA4E-362.csv | Execution tracker toàn bộ 22 TCs |

## 5. Execution Notes

- Chạy UT: cd extension && npm run test:unit (vitest include src/**/__tests__/**/*.test.ts — file test mới tự được pick up, không cần đăng ký).
- Thứ tự đề xuất: UT-01..07, UT-14 (ingester) → UT-08/09 (pipeline) → UT-10 (poster) → UT-11 (wiring) → UT-12 (auth) → UT-13 → PBT-01 → REG-13 → E2E-API-01..04 (SIT-01) → SIT-02.
- Mọi test fetch-mock KHÔNG được sleep thật: bắt buộc fake timers cho pollUntilComplete (POLL_INTERVAL_MS=3000).
- Mock discipline (Phase 6 review): UT được phép stubGlobal fetch; E2E-API/SIT phải dùng backend thật — cấm vi.fn() thay dependency thật ở các level đó.

---

*STC v1.1 — QA Agent, 2026-10-16. RTM 3-way trace: BRD US-1..US-4 + 17 ACs → FSD FR-1..FR-8 → TCs (100% coverage cả 2 chiều; 22 TCs giữ nguyên).*