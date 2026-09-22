# Kế hoạch: Multi-Provider SSO (Strategy) — Epic SA4E-262

> **Mục tiêu:** Mở rộng SSO từ chỉ Entra (MS AD) sang **nhiều provider: MS Entra AD, Google, GitHub** — theo **Strategy pattern**, để thêm provider mới không phải sửa flow lõi.
> **Nguồn:** Xác minh code thực tế 2026-09-20. Đây là backlog để AI khác implement; ticket Story được tạo trên Jira, link vào Epic SA4E-262.

---

## 1. Trạng thái hiện tại (bằng chứng code)

| Thành phần | Trạng thái |
|---|---|
| DB `sso_providers` (client_id, client_secret, tenant_id, redirect_uri, scopes, login_ui_html) | ✅ Đủ cột cho mọi provider |
| Admin UI CRUD providers (`admin/sso-providers.ts` + trang "SSO Providers") | ✅ Có |
| Login page liệt kê providers enabled (`/sso/providers`) | ✅ Có |
| **Entra (MS AD)** flow: authorize → callback → verify RS256/JWKS → JIT | ✅ Đầy đủ (`routes/auth/entra.ts`) |
| Google / GitHub flow | ❌ `sso-dynamic.ts` trả **501 "not implemented yet"** |
| Verifier abstraction (`TokenVerifier` interface) | ✅ Có (dùng cho HS256 + Entra RS256) |
| `JitProvisioningService` | ⚠️ Hardcode `provider = 'entra'`, claims kiểu `EntraClaims` (`oid`) |

**Kết luận:** Hạ tầng đã có; chỉ Entra chạy thật. Cần (a) tổng quát hoá thành Strategy, (b) implement Google (OIDC) và GitHub (OAuth2 non-OIDC).

---

## 2. Khác biệt kiến trúc phải xử lý

| Provider | Giao thức | Token định danh | Verify | Claims chính | Email verified |
|---|---|---|---|---|---|
| Entra (MS AD) | OIDC + PKCE | `id_token` (JWT RS256) | JWKS + issuer/aud/nonce | `oid`, `email`, `email_verified` | claim `email_verified` |
| Google | OIDC + PKCE | `id_token` (JWT RS256) | Google JWKS + issuer/aud/nonce | `sub`, `email`, `email_verified` | claim `email_verified` |
| GitHub | OAuth2 (KHÔNG OIDC) | `access_token` (opaque) | Gọi `GET /user` + `/user/emails` | `id`, `email`, `login`, `name` | field `verified` trong `/user/emails` |

➡️ Điểm mấu chốt: **GitHub không có id_token/JWKS** → Strategy phải cho phép cách verify khác (gọi userinfo API), không giả định luôn có JWT.

---

## 3. Thiết kế Strategy (đích kiến trúc)

### 3.1 Interface `SsoProviderStrategy`
Đặt tại `backend/src/server/auth/strategies/SsoProviderStrategy.ts`:

```
interface NormalizedProfile {
  provider: string;           // 'entra' | 'google' | 'github'
  externalSubjectId: string;  // Entra oid / Google sub / GitHub id
  email: string;
  emailVerified: boolean;
  name: string;
  groups?: string[];          // optional (Entra groups)
}

interface SsoProviderStrategy {
  readonly providerType: string;
  buildAuthorizeUrl(ctx): { url: string; state: string; nonce?: string; codeVerifier?: string };
  handleCallback(params): Promise<NormalizedProfile>;  // exchange code, verify, normalize
}
```

- Mỗi strategy tự lo: build authorize URL (PKCE nếu OIDC), exchange code→token, verify (JWKS cho OIDC / userinfo API cho GitHub), rồi **normalize về `NormalizedProfile`**.
- `EntraProviderStrategy` = refactor từ `entra.ts` hiện có (không đổi hành vi).
- Registry/Factory: `SsoStrategyRegistry.get(providerType)` — dispatch trong `sso-dynamic.ts` thay cho switch/501.

### 3.2 Refactor `JitProvisioningService`
- Nhận `NormalizedProfile` (không còn `EntraClaims`), dùng `profile.provider` thay hardcode `'entra'`.
- Giữ nguyên policy: email_verified gate, anti-HYBRID, default `grp-viewer`, group mapping (Entra-only, provider khác bỏ qua groups).
- Config unique index `(external_provider, external_subject_id)` đã hỗ trợ đa provider — không cần đổi schema.

### 3.3 Config per provider
- Lấy client_id/secret/redirect/scopes từ bảng `sso_providers` (đã có) — KHÔNG hardcode env cho Google/GitHub.
- Secret quản lý qua Admin UI (đã mask). Không commit secret.

---

## 4. Backlog Story (tạo trong Epic SA4E-262)

> Thứ tự theo dependency. Mỗi Story kèm Acceptance Criteria (AC) và test tối thiểu.

### S-A — [Backend] SSO Provider Strategy abstraction + registry + refactor Entra
**Depends:** — (nền tảng)
**Scope:**
- Tạo `SsoProviderStrategy` interface + `NormalizedProfile` + `SsoStrategyRegistry`.
- Refactor Entra flow hiện tại thành `EntraProviderStrategy` (giữ nguyên RS256/JWKS/PKCE/nonce/state, không đổi hành vi/URL).
- Refactor `JitProvisioningService` nhận `NormalizedProfile`, provider động.
- `sso-dynamic.ts` dispatch qua registry (bỏ switch 501 cho các provider đã đăng ký).
**AC:**
1. Entra login/callback hoạt động y như trước (regression pass — 58/58 test SSO hiện tại vẫn xanh).
2. `JitProvisioningService` không còn hardcode `'entra'`; unit test cho provider = google/github (mock profile).
3. Thêm provider mới chỉ cần thêm 1 strategy class + đăng ký registry, KHÔNG sửa flow lõi.
4. Tuân code-standards: file ≤200 dòng, mỗi strategy 1 file, models tách riêng.

### S-B — [Backend] Google SSO (OIDC + PKCE) strategy
**Depends:** S-A
**Scope:**
- `GoogleProviderStrategy`: authorize URL (`accounts.google.com/o/oauth2/v2/auth`, scope `openid email profile`, PKCE S256), exchange code, verify `id_token` bằng Google JWKS + issuer (`https://accounts.google.com`) + aud + nonce, normalize (`sub`→externalSubjectId, `email`, `email_verified`, `name`).
- Đọc client_id/secret/redirect từ `sso_providers` (provider_type='google').
**AC:**
1. Bấm "Sign in with Google" → authorize Google → callback → JIT tạo/link user, `account_type=SSO`, `external_provider='google'`.
2. Token giả/sai issuer/aud/expired/nonce mismatch → reject.
3. `email_verified=false` → reject link (theo policy Epic).
4. Integration test cho login URL + callback (mock token endpoint + JWKS), giống `entra-oauth.it.test.ts`.

### S-C — [Backend] GitHub SSO (OAuth2, non-OIDC) strategy
**Depends:** S-A
**Scope:**
- `GitHubProviderStrategy`: authorize URL (`github.com/login/oauth/authorize`, scope `read:user user:email`, state — GitHub **không hỗ trợ PKCE tiêu chuẩn/nonce**, dùng state chống CSRF), exchange code→`access_token`, gọi `GET https://api.github.com/user` + `GET /user/emails`, chọn email primary+verified, normalize (`id`→externalSubjectId, `email`, `verified`→emailVerified, `name`/`login`).
- Xử lý riêng: GitHub có thể không trả email ở `/user` → phải gọi `/user/emails`.
**AC:**
1. Bấm "Sign in with GitHub" → authorize → callback → JIT tạo/link user, `external_provider='github'`.
2. State mismatch → reject (CSRF).
3. Email chưa verified ở GitHub → reject link.
4. Integration test (mock `/login/oauth/access_token`, `/user`, `/user/emails`).
5. Ghi rõ trong docs: GitHub không PKCE/nonce → bù bằng state + client_secret backend-side.

### S-D — [Extension] UI provider selection cho Google/GitHub
**Depends:** S-B, S-C
**Scope:**
- Login panel: nút "Sign in with Google" / "Sign in with GitHub" (đã có cơ chế render từ `/sso/providers` — verify hiển thị đúng khi provider enabled).
- Loopback flow (giống Entra) hoặc web redirect tuỳ provider — tái dùng cơ chế `redirect_to` + state client-initiated.
**AC:**
1. Provider enabled trong Admin → hiện nút tương ứng ở login.
2. Chọn provider → hoàn tất đăng nhập, trạng thái phản ánh ở status bar; lỗi hiển thị user-facing.

### S-E — [Security] Review multi-provider hardening
**Depends:** S-B, S-C, S-D
**Scope:** state/nonce/PKCE per provider; không log token/secret; GitHub email verification enforce; redirect allowlist (tái dùng `isLoopbackRedirect` + allowlist path); rate limit callback per provider; anti account-takeover khi email trùng giữa provider.
**AC:** SECURITY-REVIEW findings + không có Critical; test cho các vector (state mismatch, email unverified, token giả).

### S-F — [QA] STP/STC + [Docs] cập nhật multi-provider
**Depends:** S-A..S-E
**Scope:** RTM cho Google/GitHub; test data; cập nhật docs auth-sso (thêm sequence Google OIDC + GitHub OAuth2, config reference per provider, khác biệt PKCE/nonce).
**AC:** RTM coverage 100% AC mới; docs mô tả đúng 3 provider + khác biệt kiến trúc.

---

## 5. Ràng buộc & quyết định kế thừa từ Epic
- Account linking chỉ khi `email_verified=true` (áp dụng cho MỌI provider).
- KHÔNG HYBRID: user là LOCAL hoặc SSO; login SSO chỉ link.
- Default group JIT = `grp-viewer`.
- Secret per provider quản lý qua Admin UI (`sso_providers`), không hardcode/commit.

## 6. Rủi ro cần lưu ý cho người implement
- **GitHub ≠ OIDC**: đừng ép khung JWKS/id_token cho GitHub — Strategy phải cho phép verify bằng userinfo API.
- **Email trùng giữa provider** (vd cùng email ở Google và GitHub): quyết định policy link — bám policy Epic (chỉ link khi verified; cân nhắc chặn cross-provider auto-link nếu chưa rõ). Nêu cho Security (S-E).
- **Regression Entra**: S-A refactor lõi — phải giữ 58/58 test SSO hiện tại xanh.
- Rủi ro `isLoopbackRedirect` any-port (đã ghi ở HANDOVER-PLAN) áp dụng cho mọi provider dùng loopback.

---

## 7. Hướng A — Unify SSO config về single source of truth (ĐÃ HOÀN THÀNH 2026-09-21)

**Vấn đề phát hiện khi test:** Entra cấu hình qua ENV (tab "auth" với field entra*), còn Google/GitHub qua bảng `sso_providers` (trang "SSO Providers") → 2 nguồn tách rời, không cấu hình được 3 provider cùng chỗ.

**Quyết định (user chọn Hướng A):** Gộp mọi provider về bảng `sso_providers`, quản lý qua MỘT UI.

**Đã thay đổi:**
1. `EntraProviderStrategy` → `loadEntraConfigAsync()` (DB-first, fallback env) thay vì `loadEntraConfig(process.env)` sync.
2. `entra.ts` route login+callback → async, dùng `loadEntraConfigAsync` + `getEntraVerifierAsync`.
3. `entra-auth.ts` → thêm `getEntraVerifierAsync()` build verifier từ config DB (rebuild khi config đổi).
4. `schema.ts` → seed row `entra` vào `sso_providers` (trước đây thiếu).
5. `config/index.ts` → `loadEntraSurfaceSafe()` KHÔNG throw (fix root cause trang Configuration trắng: loadConfig sync throw khi SSO bật + ENV trống).
6. `viewer/admin/index.html` → tab "auth" nhúng `<SSOProvidersPage embedded={true}/>` thay bảng entra* cũ.

**Verify (server 48721 sau restart):** `/config` 200 đủ 8 sections; tab auth hiện 5 provider; PUT sso-providers lưu OK (CRUD verified).

**KB:** decision #613249, error-pattern #613227 (Configuration blank on Postgres).

**Còn lại (theo dõi):** login Entra runtime thật (browser → tenant thật) là UAT; các provider google/github cần nhập client_id/secret thật để enable.
