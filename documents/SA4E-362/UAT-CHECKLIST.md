# UAT CHECKLIST — SA4E-362

## [Pega Ingest] Refresh-on-401 cho ingest path — Ingest Auth Hardening

> Ticket: SA4E-362 · Linked: SA4E-99, SA4E-300 · Branch: SA4E-362

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-362 |
| Title | [Pega Ingest] Invalid or expired token — ingest path thiếu refresh-on-401 khi access JWT hết hạn giữa job dài |
| Version | 1.0 |
| Date | 2026-10-16 |
| Executor | ____________ (điền khi thực hiện) |
| Execution date | ____-__-__ |
| Based on | STC v1.1 (22 TCs), TEST-REPORT v1.0, UG v1.0, IMPLEMENTATION-NOTES, BRD v1.0 |
| Related | SA4E-99 (pattern download refresh-on-401), SA4E-300 (GAP 4 wiring `refreshTokenFn`) |

> ⚠️ **Bản chất tài liệu:** Đây là **readiness document** (sẵn sàng thực thi), KHÔNG phải kết quả. Tất cả mục manual ở trạng thái **PENDING** cho đến khi executor chạy và điền kết quả. **⛔ Không đánh dấu PASS bất kỳ mục nào chưa được thực thi.**

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-16 | QA Agent | Initiate UAT-CHECKLIST — cover 22/22 TCs của STC v1.1: 16 automated (Part A) + 2 SIT manual (Part B) + 4 E2E-API covered-by-SIT (Part C) + UX spot-checks theo BRD US-1..US-4 (Part D). UAT execution deferred bởi user — checklist ready cho later execution. |

---

## 1. Mục đích & Phạm vi

### 1.1 Mục đích

Cung cấp script thực thi UAT hoàn chỉnh cho SA4E-362 sao cho:

1. **Cover 100% (22/22 TCs)** của STC v1.1 — executor KHÔNG cần đọc lại toàn bộ STC; mỗi TC xuất hiện đúng 1 phần trong checklist này.
2. **Bất kỳ ai cũng thực hiện được sau** — mỗi bước có lệnh cụ thể, log kỳ vọng exact-text (từ UG v1.0 + source), tiêu chí pass rõ ràng, vị trí lưu evidence định sẵn.
3. **Không xâm phạm git** — executor KHÔNG commit; SM handles git. Có 1 sửa tạm thời bắt buộc (TTL=60s) với cảnh báo do-not-commit + bước REVERT.

### 1.2 Bối cảnh Phase 6 (đã xong)

Automated testing đã **PASS 16/16 TCs** (UT-01..UT-14, PBT-01, REG-13) ngày 2026-10-16:

- Evidence: `documents/SA4E-362/evidence/vitest-run.log`, `documents/SA4E-362/evidence/compile.log`
- Báo cáo: `documents/SA4E-362/TEST-REPORT.md` v1.0
- 6 TCs còn lại (E2E-API-01..04, SIT-01, SIT-02) là manual/covered-by-SIT — **pending UAT human gate** (cần TTL=60s temp build + revoke refresh token giữa job; không tự động hóa được trong CI theo STP §2.2).

### 1.3 Cấu trúc checklist

| Part | Nội dung | TCs | Bản chất |
|------|----------|-----|----------|
| A | Automated regression re-run | 16 (UT-01..14, PBT-01, REG-13) | Chạy lại vitest — optional nhưng khuyến nghị tại thời điểm UAT |
| B | Manual SIT scripts | 2 (SIT-01, SIT-02) | Bắt buộc — human gate chính của UAT |
| C | E2E-API auth contracts | 4 (E2E-API-01..04) | Thực thi trong SIT-01 (curl) — không cần harness riêng |
| D | UX/acceptance spot-checks | BRD US-1..US-4 (17 ACs) | Quan sát user-visible, map vào bước SIT |

---

## 2. Prerequisites & Environment Setup

Hoàn tất **toàn bộ** mục 2.1–2.6 trước khi chạy Part A/B/C. Đánh dấu ✓ vào checklist 2.6.

### 2.1 Backend local chạy với auth BẬT

Backend KB phải chạy tại `http://localhost:48721` với JWT middleware bật (mặc định anonymous khi thiếu auth env — không dùng cho UAT).

PowerShell:

```powershell
$env:CODE_INTEL_REQUIRE_AUTH = "true"
$env:KB_TOKEN_SECRET = "uat-secret-sa4e-362"   # secret tuỳ ý, đủ dài
# Khởi động backend theo cách chuẩn của repo, ví dụ:
#   npx tsx backend/src/index.ts    (hoặc npm script dev tương ứng)
```

**Verify auth middleware hoạt động** (không token → 401 trước handler):

```powershell
curl.exe -s -w "%{http_code}" -X POST http://localhost:48721/api/v1/pega/bulk-check -H "Content-Type: application/json" -d "{\"checksums\": [\"a\"*64]}"
```

Expected: `401` + body chứa `TOKEN_INVALID` / `Invalid or expired token`. Nếu trả 200/400 (không phải 401) → auth chưa bật, dừng lại và kiểm tra env.

**Lấy token cho curl (dùng ở Part C):** login admin qua API — `POST /api/admin/auth/login` với credentials admin local → response chứa access token. Refresh rotation (tham chiếu): `POST /api/auth/refresh` body `{"refresh_token": "..."}` → trả `accessToken`/`refreshToken` mới; trả `401 Invalid or expired session` nếu session đã bị revoke (dùng để verify SIT-02 bước 3).

### 2.2 TTL=60s tạm thời — ⚠️ DO NOT COMMIT

Sửa MỘT dòng để access token hết hạn sau 60 giây (thay vì 15 phút), buộc kịch bản refresh giữa job xảy ra trong thời gian quan sát được:

```ts
// backend/src/admin/db/jwt.ts — dòng 14
// TRƯỚC:  export const ACCESS_TTL_SEC = 15 * 60;
// SAU:    export const ACCESS_TTL_SEC = 60;
```

Sau khi sửa → **build lại backend** và start (mục 2.1).

> ⛔ **CẢNH BÁO DO-NOT-COMMIT:**
> - Thay đổi này CHỈ phục vụ UAT, KHÔNG được commit lên branch.
> - Executor KHÔNG commit bất kỳ thứ gì — SM handles git.
> - BẮT BUỘC REVERT về `15 * 60` khi kết thúc (bước REVERT cuối SIT-01 + checkbox ở Sign-off §8).
> - Xác nhận sạch bằng `git diff backend/src/admin/db/jwt.ts` → phải rỗng sau revert.

### 2.3 Extension login (bản chứa SA4E-362)

1. Extension (Kiro) phải build từ working tree chứa fix SA4E-362 (branch `SA4E-362`).
2. VS Code → `F1` → chạy lệnh **"SDLC Agents: Login"** (command ID: `sdlcAgents.login`), hoặc click nút Login trên sidebar.
3. Login vào backend local (`localhost:48721`) — đăng nhập thành công, sidebar chuyển sang trạng thái authenticated.

### 2.4 Pega workspace đủ lớn (job chạy > 60s)

- Chọn project Pega mà lệnh **"Index Source Code"** chạy **dài hơn 60 giây** (mục tiêu: job vượt qua ranh giới TTL=60s để 401 + refresh xảy ra giữa job).
- Gợi ý: dùng **catalog sub-set** của project lớn (kiểu project ~33.677 rules trong BRD) — không cần full project, chỉ cần phần đủ để job chạy 2–5 phút.
- Nếu workspace quá nhỏ (job < 60s) → chọn project lớn hơn hoặc thêm rules; không thỏa mãn thì SIT-01 không tái hiện được kịch bản.

### 2.5 Cách ghi evidence

| Loại | Cách ghi | Lưu tại |
|------|----------|---------|
| Log extension | VS Code → **Output** panel → chọn channel **"SDLC Indexing"** (log tags: `[Pega Ingester]`, `[BfsPipeline]`, `[Catalog]`) → copy toàn bộ nội dung run | `documents/SA4E-362/evidence/SIT-0x-log.txt` |
| Notification (popup) | Screenshot VS Code khi notification xuất hiện | `documents/SA4E-362/evidence/SIT-0x-*.png` |
| Backend response (curl) | Copy output curl kèm HTTP status | `documents/SA4E-362/evidence/E2E-API-0x.md` |
| Kết quả chạy vitest | Copy terminal output | `documents/SA4E-362/evidence/uat-partA.log` |

Thư mục evidence đã tồn tại: `documents/SA4E-362/evidence/`.

### 2.6 Setup checklist (đánh dấu khi xong)

| # | Mục | Status |
|---|-----|--------|
| S1 | 2.1 Backend chạy với `CODE_INTEL_REQUIRE_AUTH=true` + `KB_TOKEN_SECRET`; curl không token → 401 | ☐ |
| S2 | 2.2 `ACCESS_TTL_SEC = 60` đã sửa tại `jwt.ts:14` + backend rebuilt | ☐ |
| S3 | 2.3 Extension login `sdlcAgents.login` thành công | ☐ |
| S4 | 2.4 Project Pega chọn được — job dự kiến > 60s | ☐ |
| S5 | 2.5 Output channel "SDLC Indexing" mở sẵn; thư mục evidence xác nhận | ☐ |

---

## 3. Part A — Automated regression re-run (16 TCs)

> **Reference:** Phase 6 đã verify 16/16 PASS ngày 2026-10-16 — evidence `documents/SA4E-362/evidence/vitest-run.log`, `compile.log`; TEST-REPORT.md v1.0. **Re-run là optional nhưng khuyến nghị tại thời điểm UAT** để xác nhận branch state chưa drift (working tree có thể thay đổi sau Phase 6).

### 3.1 Lệnh chạy tổng (một lần cho cả 16 TCs)

```powershell
Set-Location extension
npm run compile
npx vitest run src/services/__tests__/PegaStreamIngester.auth-retry.test.ts src/services/__tests__/PegaBfsPipeline.auth-dead.test.ts src/code-intel/delta/__tests__/BackendHttpPoster.test.ts src/auth/__tests__/auth-manager.test.ts src/services/__tests__/IndexingService.ingest-auth.test.ts src/services/__tests__/PegaSchemaIndexer.auth.test.ts src/services/__tests__/PegaBackendClient.crawl-plan-auth.test.ts
```

Expected: **mọi test trong 7 file PASS (0 fail)** — gồm UT-01..UT-14, PBT-01, UT-10d (3 legacy BackendHttpPoster), 25 legacy auth-manager, SEC-02, CR-01. `npm run compile` → exit 0, 0 errors.

Lọc theo từng TC (tuỳ chọn): thêm `-t "UT-01"` (tên test nhúng TC ID, ví dụ "UT-12 — concurrent refresh dedupe").

### 3.2 Checklist từng TC

Status mặc định: **PENDING** (điền PASS/FAIL sau khi chạy; evidence = đường dẫn file log).

| TC ID | Re-run command (từ `extension/`) | Expected | Status | Evidence |
|-------|-----------------------------------|----------|--------|----------|
| UT-01 | `npx vitest run src/services/__tests__/PegaStreamIngester.auth-retry.test.ts -t "UT-01"` | 401 → refresh đúng 1 lần → retry Bearer fresh-token → success; log có điểm refresh, KHÔNG chứa giá trị token | PENDING | Phase 6: PASS 2026-10-16 (vitest-run.log); re-run: ____ |
| UT-02 | `... PegaStreamIngester.auth-retry.test.ts -t "UT-02"` | refresh trả undefined → fetch 1x, không loop, raise typed `IngestAuthError` wrap 401 gốc | PENDING | Phase 6: PASS 2026-10-16; re-run: ____ |
| UT-03 | `... PegaStreamIngester.auth-retry.test.ts -t "UT-03"` | 400/403/500/503 → refreshToken 0 lần; lỗi propagate như cũ | PENDING | Phase 6: PASS 2026-10-16; re-run: ____ |
| UT-04 | `... PegaStreamIngester.auth-retry.test.ts -t "UT-04"` | makeBody 2x, 2 stream instance khác nhau, duplex:'half' cả 2, retry Bearer fresh | PENDING | Phase 6: PASS 2026-10-16; re-run: ____ |
| UT-05 | `... PegaStreamIngester.auth-retry.test.ts -t "UT-05"` | poll 401 giữa loop → rebuild header per-request → poll tiếp tới succeeded (fake timers) | PENDING | Phase 6: PASS 2026-10-16; re-run: ____ |
| UT-06 | `... PegaStreamIngester.auth-retry.test.ts -t "UT-06"` | Không auth provider → 401 trả nguyên trạng (message), không crash | PENDING | Phase 6: PASS 2026-10-16; re-run: ____ |
| UT-07 | `... PegaStreamIngester.auth-retry.test.ts -t "UT-07"` | Token rỗng → không có key Authorization; X-Project-Id luôn có | PENDING | Phase 6: PASS 2026-10-16; re-run: ____ |
| UT-08 | `npx vitest run src/services/__tests__/PegaBfsPipeline.auth-dead.test.ts -t "UT-08"` | IngestAuthError → dừng sớm, B/C không dispatch, không skip hàng loạt, 1 message "login lại", stopReason='auth' | PENDING | Phase 6: PASS 2026-10-16; re-run: ____ |
| UT-09 | `... PegaBfsPipeline.auth-dead.test.ts -t "UT-09"` | Lỗi 500 thường → authDead=false, B/C vẫn xử lý, không có "paused due to auth" | PENDING | Phase 6: PASS 2026-10-16; re-run: ____ |
| UT-10 | `npx vitest run src/code-intel/delta/__tests__/BackendHttpPoster.test.ts` | 10a 401→refresh→retry fresh; 10b undefined→reject 401 không fallback; 10c 500→0 refresh; 3 test legacy (:31/:44/:58) vẫn xanh | PENDING | Phase 6: PASS 2026-10-16; re-run: ____ |
| UT-11 | `npx vitest run src/services/__tests__/IndexingService.ingest-auth.test.ts` | Provider có cả getTokenSync + refreshToken; this.token sync 'fresh-2' (GAP 4) | PENDING | Phase 6: PASS 2026-10-16; re-run: ____ |
| UT-12 | `npx vitest run src/auth/__tests__/auth-manager.test.ts -t "UT-12"` | 2 getAccessToken song song → đúng 1 POST /api/auth/refresh (dedupe) | PENDING | Phase 6: PASS 2026-10-16; re-run: ____ |
| UT-13 | `npx vitest run src/services/__tests__/PegaSchemaIndexer.auth.test.ts` | Call#1 CÓ Authorization Bearer stale; call#2 Bearer fresh (root-cause #13) | PENDING | Phase 6: PASS 2026-10-16; re-run: ____ |
| UT-14 | `... PegaStreamIngester.auth-retry.test.ts -t "UT-14"` | Retry vẫn 401 sau refresh OK → fetch 2x, refresh 1x, KHÔNG loop, typed IngestAuthError | PENDING | Phase 6: PASS 2026-10-16; re-run: ____ |
| PBT-01 | `... PegaStreamIngester.auth-retry.test.ts -t "PBT-01"` | Mọi chuỗi status (fast-check): fetch ≤ 2, refresh ≤ 1, chỉ refresh khi 401 đầu | PENDING | Phase 6: PASS 2026-10-16; re-run: ____ |
| REG-13 | `npm run compile` + `npx vitest run` (full suite) + grep audit static-token | compile exit 0; full suite 0 fail; audit 0 static-token path trên /api/v1/pega/* (SM-6/SM-7) | PENDING | Phase 6: PASS 2026-10-16 (compile.log + vitest-full-run.log); re-run: ____ |

**Part A tổng kết:** ☐ 16/16 re-run PASS — evidence: `documents/SA4E-362/evidence/uat-partA.log` — Executor: ________ Date: ______

---

## 4. Part B — Manual SIT (SIT-01, SIT-02)

> Đây là **human gate chính** của UAT. Cần môi trường đã setup xong (§2). Chạy SIT-01 trước (kèm Part C), sau đó SIT-02.

### 4.1 SIT-01 — TTL=60s: index project chạy > 60s → đúng 1 refresh rồi tiếp tục, 0 spam

| Attribute | Value |
|-----------|-------|
| **ID** | SIT-01 |
| **Requirement** | US-1 AC2/AC6; US-3 AC1; BRD SM-1, SM-2, SM-5; E2E-API-01..04 |
| **Preconditions** | §2.1–§2.5 xong (backend TTL=60 + auth bật; extension đã login; project > 60s) |
| **Status** | PENDING |
| **Evidence** | `documents/SA4E-362/evidence/SIT-01-log.txt` + `SIT-01-*.png` |

**Script bước-bước:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Xác nhận setup: backend đang chạy TTL=60 (jwt.ts:14 = 60, đã rebuild); curl không token vào `/api/v1/pega/bulk-check` → 401 | 401 TOKEN_INVALID — middleware xác nhận |
| 2 | VS Code → `F1` → **"SDLC Agents: Login"** (`sdlcAgents.login`) | Login thành công; access token TTL 60s |
| 3 | Mở **Output** → channel **"SDLC Indexing"**; clear/log-mark để dễ đếm occurrence | Channel sẵn sàng ghi |
| 4 | Chạy **"Index Source Code"** cho project Pega đã chọn | Job bắt đầu ingest bình thường (progress tăng) |
| 5 | Quan sát log khi job vượt mốc 60s (token hết hạn giữa job) | Kịch bản thiết kế: gặp 401 → **điểm refresh** ghi rõ trong log (KHÔNG chứa giá trị JWT) → retry với token mới |
| 6 | Tiếp tục quan sát tới hết job | `[Pega Ingester] ⏳ Progress: N/M (pct%)` **tiếp tục tăng sau điểm refresh**; job **hoàn tất**; KHÔNG dừng, KHÔNG skip |
| 7 | Đếm occurrences trong log run này | (a) `Invalid or expired token`: **≤ 1 lần** tại ĐIỂM 401 duy nhất; **0 lần lặp** SAU điểm refresh (SM-1). (b) `Ingest POST failed (skipping)`: **0** silent skip (SM-2). (c) `bulk-check HTTP 401` / `[Catalog] ⚠️ Bulk-check failed`: **0** (SM-5). (d) Không có giá trị JWT nào trong log (US-1 AC6) |
| 8 | Chạy Part C — E2E-API-01..04 (curl, backend vẫn TTL=60) | Xem §5 — điền kết quả vào Part C |
| 9 | **REVERT**: `jwt.ts:14` về `15 * 60`, rebuild backend, `git diff backend/src/admin/db/jwt.ts` | Diff rỗng — không để lại thay đổi backend |

**Pass criteria SIT-01:** (1) đúng 1 điểm refresh rồi ingest tiếp tục tới hoàn tất; (2) SM-1=0, SM-2=0, SM-5=0; (3) log không lộ token; (4) TTL đã revert + git diff sạch.

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú/actual: ______________________ — Evidence: ____________

### 4.2 SIT-02 — Revoke refresh token giữa job → dừng sạch "login lại", không skip hàng loạt, rerun incremental

| Attribute | Value |
|-----------|-------|
| **ID** | SIT-02 |
| **Requirement** | US-2 AC1..AC4; BRD SM-2, SM-3, SM-4 |
| **Preconditions** | Như SIT-01 (TTL=60); có khả năng vô hiệu hóa refresh token giữa chừng (logout server-side / xóa session row phía backend); backend đã revert TTL? — KHÔNG, giữ TTL=60 cho tới khi xong SIT-02 |
| **Status** | PENDING |
| **Evidence** | `documents/SA4E-362/evidence/SIT-02-log.txt` + `SIT-02-*.png` (notification + paused log + rerun) |

**Cách revoke refresh token giữa job (chọn 1):**
- (a) **Logout phiên phía server:** logout user tương ứng từ admin viewer/backend (session bị xóa, key `sid`).
- (b) **Xóa session row trong backend storage:** xóa row session của user đang chạy (bảng/collection session, khóa `sid` trong access claims).
- Verify revoke đã có hiệu lực: `POST /api/auth/refresh` với refresh_token của phiên → `401 "Invalid or expired session"`.

**Script bước-bước:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Login extension (`sdlcAgents.login`) → chạy **"Index Source Code"** → chờ job chạy > 60s (đã qua ≥ 1 chu kỳ TTL) | Job đang chạy bình thường |
| 2 | GIỮA job: revoke refresh token theo (a) hoặc (b) ở trên; verify bằng `POST /api/auth/refresh` → 401 | Refresh token đã chết; job vẫn đang chạy với access token cũ |
| 3 | Chờ access token hiện tại hết hạn (≤ 60s nữa) → 401 → refresh attempt | Refresh **THẤT BẠI** → typed `IngestAuthError` |
| 4 | Quan sát pipeline dừng (trong vài giây sau 401) | DỪNG NGAY sau item in-flight; KHÔNG có chuỗi `⚠️ Ingest error (skipping)` / `Ingest POST failed (skipping)` hàng loạt cho phần còn lại (SM-2: skip trước khi dừng ≈ 0) |
| 5 | Kiểm tra notification + log | **Đúng 1 thông báo** — notification: `⛔ Auth hết hạn và refresh thất bại — dừng ingest. Hãy login lại rồi chạy lại (state đã preserve).` + log `[Pega Ingester] ⛔ Auth hết hạn và refresh thất bại — dừng ingest. Hãy login lại rồi chạy lại (state đã preserve)` + log `[BfsPipeline] ⏸️ Stopped: paused due to auth (in-flight completed: N, buffered discarded: M)` và/hoặc `[Catalog] ⏸️ Paused due to auth — rerun sẽ tiếp tục incremental (ingested=N trước khi dừng)` — KHÔNG spam lỗi (SM-3) |
| 6 | Kiểm tra không auto-login | KHÔNG có request login tự động nào được phát (US-2 / BRD out-of-scope #1) |
| 7 | Login lại (`sdlcAgents.login`) → chạy lại **"Index Source Code"** | **INCREMENTAL** (SM-4): rules đã ingest được skip nhanh qua local index (không POST lại), chỉ phần còn dở được ingest; job hoàn tất phần còn lại |
| 8 | Sau SIT-02: REVERT `jwt.ts:14` về `15 * 60` (nếu chưa) + `git diff` sạch | Không để lại thay đổi backend |

**Pass criteria SIT-02:** (1) dừng ngay sau in-flight — 0 mass skip; (2) đúng 1 notification + log "paused due to auth" — không spam; (3) 0 auto-login; (4) rerun incremental hoàn tất phần còn lại; (5) TTL reverted.

**Kết quả:** ☐ PASS ☐ FAIL — Ghi chú/actual: ______________________ — Evidence: ____________

---

## 5. Part C — E2E-API-01..04 (thực thi trong SIT-01)

> 4 TC này là **auth contract** của các endpoint `/api/v1/pega/*`: 401 `TOKEN_INVALID` phải trả **TRƯỚC khi vào handler** (JWT middleware, `HttpServer.ts:111-119`) → request 401 **không side-effect** → retry sau refresh an toàn. Không cần harness riêng: mỗi TC được thực thi bằng 2 lần curl trong SIT-01 (bước 8), khi backend đang TTL=60 + auth bật.

**Chuẩn bị token cho curl:**
1. Token HẾT HẠN: login qua `POST /api/admin/auth/login` → lấy `accessToken` từ response → **chờ 60s** (TTL=60) → token hết hạn.
2. Token HỢP LỆ: login lại (bước 1) và dùng ngay, hoặc `POST /api/auth/refresh` với `refresh_token` còn hạn → lấy `accessToken` mới.

### E2E-API-01: POST /api/v1/pega/ingest-rule — auth contract

| Attribute | Value |
|-----------|-------|
| **Verifies** | 401 trả trước handler với token hết hạn; 0 side-effect (0 record mới); token hợp lệ → 2xx ingested |
| **Exercised via** | SIT-01 step 8 (curl) — same JWT middleware as SIT run |
| **Status** | PENDING |
| **Evidence** | `documents/SA4E-362/evidence/E2E-API-01.md` |

```powershell
# (1) Token hết hạn → kỳ vọng HTTP 401 + {"error":{"code":"TOKEN_INVALID","message":"Invalid or expired token"}}
curl.exe -s -w "HTTP %{http_code}" -X POST http://localhost:48721/api/v1/pega/ingest-rule `
  -H "Authorization: Bearer <EXPIRED_TOKEN>" -H "Content-Type: application/json" -H "X-Project-Id: <PROJECT_ID>" `
  -d "{\"ruleJson\": {\"pyRuleName\": \"UATProbe\"}, \"checksum\": \"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}"

# (2) Kiểm tra side-effect: query/KB xác nhận KHÔNG có rule mới tạo từ request (1) → retry an toàn

# (3) Token hợp lệ → kỳ vọng 2xx (200/201) — rule ingested
curl.exe -s -w "HTTP %{http_code}" -X POST http://localhost:48721/api/v1/pega/ingest-rule `
  -H "Authorization: Bearer <VALID_TOKEN>" -H "Content-Type: application/json" -H "X-Project-Id: <PROJECT_ID>" `
  -d "{\"ruleJson\": {\<rule JSON mẫu từ project>\}, \"checksum\": \<64-hex>\}"
```

**Pass criteria:** (1)=401 TOKEN_INVALID trước handler; (2)=0 side-effect; (3)=2xx.

### E2E-API-02: POST /api/v1/pega/ingest-stream — auth contract (NDJSON)

| Attribute | Value |
|-----------|-------|
| **Verifies** | 401 trước handler, không consume job; token hợp lệ → 200/202 job accepted + jobId |
| **Exercised via** | SIT-01 step 8 (curl) |
| **Status** | PENDING |
| **Evidence** | `documents/SA4E-362/evidence/E2E-API-02.md` |

```powershell
# Tạo stream.ndjson nhỏ (2 dòng rule NDJSON mẫu) rồi:
# (1) Token hết hạn → 401 TOKEN_INVALID
curl.exe -s -w "HTTP %{http_code}" -X POST http://localhost:48721/api/v1/pega/ingest-stream `
  -H "Authorization: Bearer <EXPIRED_TOKEN>" -H "Content-Type: application/x-ndjson" --data-binary "@stream.ndjson"
# (2) Token hợp lệ → 200/202 + jobId trong response
curl.exe -s -w "HTTP %{http_code}" -X POST http://localhost:48721/api/v1/pega/ingest-stream `
  -H "Authorization: Bearer <VALID_TOKEN>" -H "Content-Type: application/x-ndjson" --data-binary "@stream.ndjson"
```

**Pass criteria:** (1)=401 trước handler (không tạo job); (2)=200/202 + jobId. JobId này dùng cho E2E-API-03.

### E2E-API-03: GET /api/v1/pega/jobs/:id — auth contract (poll endpoint)

| Attribute | Value |
|-----------|-------|
| **Verifies** | GET với token hết hạn → 401; token hợp lệ (idempotent GET — retry an toàn) → 200 + job status |
| **Exercised via** | SIT-01 step 8 (curl) — jobId từ E2E-API-02 |
| **Status** | PENDING |
| **Evidence** | `documents/SA4E-362/evidence/E2E-API-03.md` |

```powershell
# (1) Token hết hạn → 401 TOKEN_INVALID
curl.exe -s -w "HTTP %{http_code}" http://localhost:48721/api/v1/pega/jobs/<JOB_ID> -H "Authorization: Bearer <EXPIRED_TOKEN>"
# (2) Token hợp lệ → 200, body có status (queued/running/succeeded)
curl.exe -s -w "HTTP %{http_code}" http://localhost:48721/api/v1/pega/jobs/<JOB_ID> -H "Authorization: Bearer <VALID_TOKEN>"
```

**Pass criteria:** (1)=401; (2)=200 + job status.

### E2E-API-04: POST /api/v1/pega/bulk-check — auth contract, không side-effect

| Attribute | Value |
|-----------|-------|
| **Verifies** | 401 trước handler (US-3 AC3 — retry bulk-check an toàn); catalog không đổi khi 401; token hợp lệ → 200, KHÔNG cần full catalog re-fetch |
| **Exercised via** | SIT-01 step 8 (curl) + SIT-01 step 7c (0× `bulk-check HTTP 401` trong run) |
| **Status** | PENDING |
| **Evidence** | `documents/SA4E-362/evidence/E2E-API-04.md` |

```powershell
# (1) Token hết hạn → 401 TOKEN_INVALID (checksums: 40 hoặc 64 hex; tối đa 5000 phần tử)
curl.exe -s -w "HTTP %{http_code}" -X POST http://localhost:48721/api/v1/pega/bulk-check `
  -H "Authorization: Bearer <EXPIRED_TOKEN>" -H "Content-Type: application/json" `
  -d "{\"checksums\": [\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"]}"
# (2) Xác nhận catalog KHÔNG đổi (0 catalog records thay đổi) → retry an toàn
# (3) Token hợp lệ → 200, response data.existing[]
curl.exe -s -w "HTTP %{http_code}" -X POST http://localhost:48721/api/v1/pega/bulk-check `
  -H "Authorization: Bearer <VALID_TOKEN>" -H "Content-Type: application/json" `
  -d "{\"checksums\": [\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"]}"
```

**Pass criteria:** (1)=401 trước handler; (2)=0 side-effect; (3)=200; cộng với SIT-01 step 7c: 0× `bulk-check HTTP 401` trong run thật.

**Part C tổng kết:** ☐ 4/4 E2E-API PASS — Executor: ________ Date: ______

---

## 6. Part D — UX/acceptance spot-checks (BRD US-1..US-4)

Các kiểm tra quan sát được từ góc độ user — thực hiện song song với Part B/C (cột "Where" trỏ tới bước tương ứng). Mỗi dòng map đúng 1 AC của BRD.

| US | AC (BRD) | Kiểm tra quan sát (user-visible) | Where | Status |
|----|----------|----------------------------------|-------|--------|
| US-1 | AC1 — token còn hạn: dùng cached token, 0 refresh | Job chạy bình thường khi token còn hạn; log không có điểm refresh nào trước mốc 60s | SIT-01 step 4 | PENDING |
| US-1 | AC2 — 401 giữa job: refresh 1 lần → retry → 200, loop tiếp tục | Một khoảng dừng ngắn tại điểm refresh rồi progress `⏳` tiếp tục; job không gián đoạn thêm | SIT-01 step 5–6 | PENDING |
| US-1 | AC3 — nhiều 401 song song → 1 refresh call (dedupe) | Chỉ 1 điểm refresh trong log dù nhiều call song song (tham chiếu UT-12 automated) | SIT-01 step 7a | PENDING |
| US-1 | AC4 — submitJob stream retry qua makeBody() | Job stream (ingest-stream) tiếp tục sau refresh (tham chiếu UT-04 automated) | SIT-01 step 6 + E2E-API-02 | PENDING |
| US-1 | AC5 — poll 401 → rebuild headers, poll tiếp | `⏳ Progress: N/M` tiếp tục cập nhật sau điểm refresh | SIT-01 step 6 | PENDING |
| US-1 | AC6 — log ghi điểm refresh, không log token | Log có dòng refresh/retry; grep log: 0 JWT (`eyJ...`) trong toàn bộ run | SIT-01 step 7d | PENDING |
| US-2 | AC1 — typed IngestAuthError, authDead (2 trigger) | Dừng khi refresh chết (SIT-02) — hành vi đúng cho cả 2 trigger (tham chiếu UT-02/UT-08/UT-14 automated) | SIT-02 step 3–4 | PENDING |
| US-2 | AC2 — shouldStop dừng producer, không skip hàng loạt | 0 dòng `Ingest POST failed (skipping)` hàng loạt sau điểm dừng; log `⏸️ Stopped: paused due to auth` | SIT-02 step 4 | PENDING |
| US-2 | AC3 — đúng 1 thông báo "login lại", không spam | Đúng 1 notification + 1 cụm log; không lặp | SIT-02 step 5 | PENDING |
| US-2 | AC4 — rerun incremental sau login lại | Rerun nhanh qua phần đã ingest (local index); chỉ phần còn lại chạy | SIT-02 step 7 | PENDING |
| US-2 | AC5 — bulk-check dừng theo auth-dead, không fallback re-fetch | Khi auth chết: không thấy full catalog re-fetch phát sinh sau điểm dừng | SIT-02 step 4–5 | PENDING |
| US-3 | AC1 — bulk-check 401 → refresh → retry 1 lần; hết spam 401 | 0× `bulk-check HTTP 401` trong run có refresh thành công | SIT-01 step 7c | PENDING |
| US-3 | AC2 — refresh chết → bulk-check dừng theo auth-dead | Không re-fetch catalog sau auth-dead (kết hợp US-2 AC5) | SIT-02 step 4 | PENDING |
| US-3 | AC3 — retry bulk-check an toàn (401 trước handler) | E2E-API-04: 401 không đổi catalog | E2E-API-04 | PENDING |
| US-4 | AC1 — mọi call /api/v1/pega/* qua provider; audit 0 static-token path | REG-13 audit: 0 static-token path (tham chiếu Phase 6 SM-6 audit; re-run tại Part A) | Part A REG-13 | PENDING |
| US-4 | AC2 — PegaSchemaIndexer có Authorization + refresh-on-401 | UT-13 PASS (Part A); schema indexing không lỗi 401 khi chạy | Part A UT-13 | PENDING |
| US-4 | AC3 — regression suite xanh | `npm run compile` + full suite 0 fail | Part A REG-13 | PENDING |

**Part D tổng kết:** ☐ 17/17 ACs xác nhận — Executor: ________ Date: ______

---

## 7. Coverage Matrix — 22/22 TCs (100%)

Mỗi TC của STC v1.1 xuất hiện **đúng 1 lần** trong checklist: 16 ở Part A, 2 ở Part B, 4 ở Part C.

### 7.1 TC → Part mapping

| TC ID | STC Section | Part | Checklist section | Status |
|-------|-------------|------|-------------------|--------|
| UT-01 | STC §3 | A | §3.2 | PENDING |
| UT-02 | STC §3 | A | §3.2 | PENDING |
| UT-03 | STC §3 | A | §3.2 | PENDING |
| UT-04 | STC §3 | A | §3.2 | PENDING |
| UT-05 | STC §3 | A | §3.2 | PENDING |
| UT-06 | STC §3 | A | §3.2 | PENDING |
| UT-07 | STC §3 | A | §3.2 | PENDING |
| UT-08 | STC §3 | A | §3.2 | PENDING |
| UT-09 | STC §3 | A | §3.2 | PENDING |
| UT-10 | STC §3 | A | §3.2 | PENDING |
| UT-11 | STC §3 | A | §3.2 | PENDING |
| UT-12 | STC §3 | A | §3.2 | PENDING |
| UT-13 | STC §3 | A | §3.2 | PENDING |
| UT-14 | STC §3 | A | §3.2 | PENDING |
| PBT-01 | STC §3 | A | §3.2 | PENDING |
| REG-13 | STC §3 | A | §3.2 | PENDING |
| SIT-01 | STC §3 | B | §4.1 | PENDING |
| SIT-02 | STC §3 | B | §4.2 | PENDING |
| E2E-API-01 | STC §3 | C | §5 (E2E-API-01) | PENDING |
| E2E-API-02 | STC §3 | C | §5 (E2E-API-02) | PENDING |
| E2E-API-03 | STC §3 | C | §5 (E2E-API-03) | PENDING |
| E2E-API-04 | STC §3 | C | §5 (E2E-API-04) | PENDING |

**Coverage: 22/22 TCs = 100%.** (16 Part A + 2 Part B + 4 Part C; không TC nào thiếu, không TC nào trùng.)

### 7.2 RTM — BRD US-1..US-4 → checklist sections

| Requirement (BRD) | FSD FR | Covering checklist sections | Coverage |
|-------------------|--------|------------------------------|----------|
| US-1 (6 ACs) — refresh-on-401 giữa job | FR-2, FR-5 | Part A (UT-01..07, UT-14, PBT-01), SIT-01 §4.1, E2E-API-01..03 §5 | ✅ |
| US-2 (5 ACs) — auth-dead stop + rerun incremental | FR-3, FR-4 | Part A (UT-08, UT-09, UT-02, UT-14), SIT-02 §4.2, Part D US-2 rows | ✅ |
| US-3 (3 ACs) — bulk-check refresh-on-401 | FR-6 | Part A (UT-10), SIT-01 §4.1 (SM-5), E2E-API-04 §5, Part D US-3 rows | ✅ |
| US-4 (3 ACs) — single auth contract, 0 static-token | FR-1, FR-7, FR-8 | Part A (UT-11, UT-12, UT-13, REG-13), Part D US-4 rows | ✅ |

**Coverage statement: 22/22 TCs (100%) + 17/17 ACs của US-1..US-4 (100%) — mọi requirement đều có ít nhất 1 mục checklist tương ứng.**

---

## 8. Sign-off

### 8.1 Pass criteria summary (để checklist được coi là ĐẠT)

1. **Part A:** 16/16 automated TCs re-run PASS (hoặc Phase 6 evidence xác nhận khi skip re-run, kèm lý do).
2. **SIT-01:** đúng 1 điểm refresh → job tiếp tục hoàn tất; SM-1=0, SM-2=0, SM-5=0; log không lộ JWT; E2E-API-01..04 pass (Part C); TTL reverted + `git diff` sạch.
3. **SIT-02:** dừng sạch sau in-flight (0 mass skip); đúng 1 notification "login lại"; 0 auto-login; rerun incremental hoàn tất phần còn lại.
4. **Part D:** 17/17 ACs US-1..US-4 xác nhận bằng quan sát user-visible.
5. Không defect mở nào thuộc phạm vi SA4E-362 (nếu FAIL → ghi defect ID, quay lại DEV theo quy trình).

### 8.2 REVERT confirmation (bắt buộc)

| Mục | Xác nhận |
|-----|----------|
| `backend/src/admin/db/jwt.ts:14` đã về `15 * 60` | ☐ |
| `git diff backend/src/admin/db/jwt.ts` rỗng (không commit nào chứa TTL=60) | ☐ |

### 8.3 Executor confirmation

| Field | Value |
|-------|-------|
| Executor name | ____________ |
| Execution date | ____-__-__ |
| Tổng kết | ☐ UAT PASS — ☐ UAT FAIL (defects: ____________) |
| Evidence index | SIT-01-log.txt, SIT-01-*.png, SIT-02-log.txt, SIT-02-*.png, E2E-API-01..04.md, uat-partA.log |

> ⛔ **Human gate:** UAT approval là human gate — **SM sẽ chỉ transition QA TEST → UAT → DONE sau khi executor confirm** vào mục 8.3. Checklist này PENDING hoàn toàn cho tới thời điểm đó; không mục nào được tự đánh dấu PASS nếu chưa thực thi.

---

*UAT-CHECKLIST v1.0 — QA Agent, 2026-10-16. Trace: STC v1.1 (22 TCs) → Parts A/B/C; BRD US-1..US-4 (17 ACs) → Part D. Related: SA4E-99, SA4E-300.*
