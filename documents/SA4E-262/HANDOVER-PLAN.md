# Kế hoạch bàn giao — Epic SA4E-262 (SSO Microsoft Entra ID)

> **Mục đích:** Tài liệu để một AI/kỹ sư khác tiếp nhận và hoàn tất Epic. Được viết dựa trên **xác minh code + test thực tế** (ngày 2026-09-20), KHÔNG dựa vào các STATUS.json/TEST-REPORT có sẵn (chúng mâu thuẫn nhau — xem mục "Cảnh báo nguồn dữ liệu").

---

## ⚠️ Cảnh báo nguồn dữ liệu (đọc trước tiên)

Ba nguồn trong repo mâu thuẫn nhau về trạng thái Epic:

| Nguồn | Tuyên bố |
|---|---|
| `documents/SA4E-SSO-Entra/RUN-LOG.md` (entry #8) | wave1 **blocked** — không invoke được sub-agent, code chưa làm |
| `documents/SA4E-SSO-Entra/STATUS.json` | `currentPhase: wave1_in_progress_blocked_invoke`, các ticket `to_do/requirements` |
| `documents/SA4E-262/STATUS.json` + `TEST-REPORT.md` | Đã implement đầy đủ, "ready for UAT / DONE" |
| Jira | Epic **In Progress**; 12/13 con **In Review**; SA4E-276 **In Progress**; chưa ai Done; chưa gán assignee |

**Sự thật (xác minh bằng code + chạy test):** Code SSO **đã được implement gần đầy đủ và chạy được**. Đừng tin markdown status — luôn xác minh bằng `npx vitest run` trong `backend/`.

---

## ✅ Trạng thái thực tế theo từng ticket (bằng chứng code)

| Ticket | Hạng mục | Bằng chứng | Trạng thái |
|---|---|---|---|
| SA4E-264 | Config env + zod | `backend/src/config/EntraConfig.ts`, `backend/.env.example`, `tests/unit/EntraConfig.test.ts` (11 pass) | ✅ Xong |
| SA4E-265 | DB migration | `backend/src/admin/db/schema.ts` (account_type, external_provider/subject_id, unique index `uq_users_external_identity`, password_hash nullable) | ✅ Xong |
| SA4E-266 | RS256+JWKS+Strategy | `backend/src/server/middleware/verifiers/{EntraRS256Verifier,LocalHS256Verifier,TokenVerifier,JwksCache}.ts`, `verifier.test.ts` (17 pass) | ✅ Xong |
| SA4E-267 | OAuth2+PKCE callback | `backend/src/server/routes/auth/entra.ts` `createEntraAuthRoutes()`; integration test `tests/integration/entra-oauth.it.test.ts` (6/6 pass) | ✅ Xong |
| SA4E-268 | JIT Provisioning | `backend/src/server/services/JitProvisioningService.ts` (email_verified gate, anti-HYBRID, grp-viewer), `__tests__/JitProvisioningService.test.ts` (5 pass) | ✅ Xong |
| SA4E-269 | Unified UserRepository | `backend/src/server/routes/auth/unified.ts` `createUnifiedAuthRoutes()`, `UserRepository.test.ts` (12 pass) | ✅ Xong |
| SA4E-270 | Extension PKCE wire | `extension/src/auth/{AuthManager,PkceService,TokenRefreshTimer}.ts`, `__tests__/pkce-service.test.ts` | ✅ Xong |
| SA4E-271 | DevOps runbook Entra | Bộ docs đầy đủ trong `documents/SA4E-271/` | ✅ Xong (docs) |
| SA4E-272 | Security hardening | Trong `entra.ts`: session rotation, user-agent binding, rate limit callback (5/60s), PKCE S256 bắt buộc; `EntraConfig` redact secrets | ✅ Xong |
| SA4E-273 | UI "Sign in with Microsoft" | `extension/src/panels/login-panel.ts` (`entraBtn`), command `kiroSdlc.loginEntra` | ✅ Xong |
| SA4E-274 | QA STP/STC + tests | 5 unit + 1 integration test file | ✅ Xong |
| SA4E-275 | Docs auth-sso | Bộ docs đầy đủ trong `documents/SA4E-275/` | ✅ Xong (docs) |
| SA4E-276 | Admin UI SSO config | `backend/src/server/routes/admin/sso-providers.ts` (CRUD, mask secret) + admin viewer HTML; UAT-SIGNOFF có | ⚠️ Xong backend/viewer — **chưa** webview trong extension. Cần chốt phạm vi |

---

## 🔧 Đã fix trong đợt bàn giao này (2026-09-20)

1. **Bug seed SSO providers** — `backend/src/admin/db/schema.ts`:
   - `seedDefaultSsoProviders` và `seedSsoProvidersFromEnv` có INSERT với **12 placeholder cho 13 cột** → SQLite ném `12 values for 13 columns`, seed provider mặc định thất bại âm thầm.
   - Đã sửa thành 13 placeholder. Đã nâng log từ `console.debug` → `console.error` để lỗi không bị nuốt (theo code-standards). Không throw để không chặn khởi động (seed là non-critical).
   - Verify: chạy lại test JIT không còn warning "12 values for 13 columns".

2. **✅ P1 — QUYẾT mô hình state CSRF = client-initiated** — `backend/src/server/routes/auth/entra.ts`:
   - **Bằng chứng quyết định:** `extension/src/auth/AuthManager.loginEntra()` TỰ sinh `state` (`crypto.randomBytes(16)`), truyền lên backend, và TỰ verify state khi Entra redirect về loopback (`if (returnedState !== state) → CSRF error`). Đây là mô hình client-initiated.
   - **Root cause:** backend cũ VỨT BỎ state của client và sinh state riêng → state extension nhận về không bao giờ khớp → phá vỡ chính CSRF check của extension (SA4E-270). Ngoài ra callback không append `state`/`token`/`expiresAt` về loopback, và loopback URL bị allowlist path nội bộ loại bỏ. Ba mắt xích cùng hỏng.
   - **Fix:** (a) route `/auth/entra/login` honor `state` client truyền, chỉ random khi không có; (b) cho phép loopback (`127.0.0.1`/`localhost`) làm `redirect_to`; (c) callback append `state`+`token`+`expiresAt` khi redirect về loopback (web/admin vẫn dùng cookie + allowlist path). CSRF/PKCE backend vẫn nguyên vẹn vì `store` key theo chính state đó.
   - Verify: `entra-oauth.it.test.ts` 6/6 pass; toàn nhóm SSO **58/58 pass** (gồm 7 test bảo mật mới).

3. **Siết `isLoopbackRedirect` + test bảo mật** — `entra.ts` + `tests/unit/entra-loopback-redirect.test.ts`:
   - Self-review phát hiện bản fix đầu của mục 2 nới quá rộng (`https`, `localhost`, `::1`, mọi path) cho một endpoint **append token thật lên URL** → bề mặt exfiltration thừa.
   - Siết đúng contract extension: chỉ `http://127.0.0.1` + path `/callback`. Thêm 7 unit test cho các vector (https, localhost/::1, path lạ, host giả `127.0.0.1.evil.com`, private IP, internal path). Export `isLoopbackRedirect` để test.
   - **Rủi ro còn lại (P3 — Security):** vẫn chấp nhận `127.0.0.1` với **bất kỳ port** nào. Được bù bởi state do client tự sinh + verify (kẻ tấn công không biết state của nạn nhân) và port ngẫu nhiên phía client. Cần Security xác nhận mức chấp nhận này ở phase review.

4. **✅ P1 — Fix UA hash mismatch khiến admin login 401 sau login thành công** — `backend/src/server/routes/admin/context.ts`:
   - **Symptom:** login `POST /api/admin/auth/login` trả 200 + token, nhưng mọi API `/api/admin/*` sau đó trả **401 Unauthorized** → viewer gọi `window.__onAuthExpired()` → tự logout về login page. Từ phía user: "login không vào được" (không có error message nào hiển thị).
   - **Root cause:** `context.ts` (`authenticate()`) tự hash user-agent bằng `crypto.createHash('sha256').update(userAgent)` (giữ nguyên chữ hoa), trong khi login lưu session qua `SessionService.issue()` → `hashUserAgent()` (`utils/ua.ts` — `ua.trim().toLowerCase()` rồi mới sha256). Browser UA có chữ hoa (`Mozilla/5.0 ...`) → 2 hash khác nhau → `validateSession` không tìm thấy session → 401.
   - **Fix:** `context.ts` import và dùng `hashUserAgent()` từ `../../utils/ua.js` — nhất quán với `SessionService` và `jwt-auth.ts`.
   - **Verify (browser + API thật, 2026-09-20):** login UI → token lưu → Dashboard render 8 cards; reload giữ session; `curl` login → `GET /api/admin/projects` với Bearer token → **200** (trước fix: 401). Nhóm test SSO **51/51 pass** sau fix.

---

## ❗ Việc còn tồn đọng (cần AI kế nhiệm xử lý)

### ✅ P1 — Mô hình state CSRF — ĐÃ QUYẾT & FIX (2026-09-20)
- Đã chọn **client-initiated state** và fix `entra.ts` (chi tiết ở mục "Đã fix"). `entra-oauth.it.test.ts` 6/6 pass. Không còn hạng mục cần quyết ở đây.

### P1 — Regression đầy đủ (còn lại)
- Chạy `cd backend; npx vitest run` (toàn bộ, không chỉ file SSO) và `cd extension; npm test`.
- Chạy `npm run build` ở cả `backend/` và `extension/` để xác nhận typecheck pass.

### P2 — Chốt phạm vi SA4E-276
- Xác nhận với product: Admin UI quản lý SSO cần là **webview trong extension** hay **admin viewer HTML** (đã có) là đủ. Nếu cần webview → implement trong `extension/src`; nếu đủ → đóng ticket.

### P2 — Đồng bộ trạng thái quản trị
- Sửa `documents/SA4E-262/STATUS.json` và `documents/SA4E-SSO-Entra/STATUS.json` cho khớp thực tế.
- Cập nhật `SA4E-SSO-Entra/RUN-LOG.md`: entry #8 "blocked" đã lỗi thời (code đã hoàn tất sau đó).
- Gán assignee cho Epic + 13 con trên Jira.

### P3 — Release (human gate)
- Code review 2-axis (standards + spec) theo `phase-6-testing`.
- Sau khi user duyệt UAT + Deploy: merge branch về master (`--no-ff`), bump version, sync mọi version reference, cập nhật changelog. KHÔNG tự transition qua UAT/Deploy.

---

## 🧪 Cách xác minh nhanh (điểm khởi đầu tin cậy)

```powershell
# Nhóm test SSO cốt lõi (kỳ vọng: 51/51 pass)
cd backend
npx vitest run `
  src/server/services/__tests__/JitProvisioningService.test.ts `
  src/server/middleware/verifiers/verifier.test.ts `
  src/database/repositories/__tests__/UserRepository.test.ts `
  tests/unit/EntraConfig.test.ts `
  tests/integration/entra-oauth.it.test.ts
```

Kết quả tham chiếu (2026-09-20 sau fix P1, đã chạy lại xác minh): **51/51 pass**.

---

## 🗺️ Thứ tự thực hiện đề xuất
1. **P1** — Chạy full regression + build (`backend/` + `extension/`).
2. **P2** — Chốt phạm vi SA4E-276; đồng bộ STATUS.json/RUN-LOG + gán assignee.
3. **P3** — Code review → (user duyệt) → merge + release + version sync.
