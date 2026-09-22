# Hướng dẫn cấu hình SSO Provider (Entra ID / Google / GitHub)

**Epic:** SA4E-262 — Multi-provider SSO
**Phạm vi:** Hướng dẫn từng bước đăng ký ứng dụng ở phía nhà cung cấp (IdP) và cấu hình trong ứng dụng SDLC Agents 4 Enterprise.
**Đối tượng:** Quản trị viên hệ thống (admin).

---

## 1. Tổng quan

Hệ thống hỗ trợ đăng nhập một lần (SSO) từ nhiều nhà cung cấp danh tính, cấu hình tập trung qua **một nguồn duy nhất** là bảng `sso_providers` (Hướng A). Toàn bộ cấu hình được quản lý qua giao diện **Admin → tab Auth → SSO Providers** — không cần sửa file `.env`, không cần build lại, không cần restart backend (config đọc động lúc chạy).

| Provider | Giao thức | Cách xác thực danh tính | Có sẵn |
|----------|-----------|--------------------------|--------|
| Microsoft Entra ID (Azure AD) | OIDC + PKCE | Verify `id_token` qua JWKS (issuer/aud/exp) + nonce | ✅ |
| Google | OIDC + PKCE | Verify `id_token` qua Google JWKS + nonce | ✅ |
| GitHub | OAuth2 (không phải OIDC) | Gọi REST API `/user` + `/user/emails` (không có JWT) | ✅ |

### Kiến trúc chung (Strategy pattern)

Mỗi provider là một `SsoProviderStrategy` riêng, dùng chung:
- Route động `GET /auth/{provider}/login` và `GET /auth/{provider}/callback` (Entra có route riêng nhưng cùng chuẩn).
- JIT provisioning: lần đầu đăng nhập tự tạo user (`account_type=SSO`) và gán nhóm mặc định `grp-viewer`.
- Endpoint công khai `GET /auth/sso/providers` chỉ trả về provider **đang bật VÀ đã cấu hình** (`enabled=1 AND client_id<>''`) — dùng để render nút đăng nhập động trên UI.

---

## 2. Thông tin dùng chung

### 2.1. Callback URL (redirect_uri)

Callback URL của backend theo mẫu:

```
{SSO_BASE_URL}/auth/{provider}/callback
```

- `SSO_BASE_URL` mặc định là `http://localhost:{PORT}` với PORT lấy từ `CODE_INTEL_PORT`/`PORT`, mặc định **48721**.
- Nếu để trống ô **Redirect URI** trong UI, hệ thống **tự suy ra** callback URL đúng — nên khuyến nghị để trống để tránh gõ sai.

Với cấu hình mặc định (port 48721), callback URL cụ thể:

| Provider | Callback URL |
|----------|-------------|
| Entra | `http://localhost:48721/auth/entra/callback` |
| Google | `http://localhost:48721/auth/google/callback` |
| GitHub | `http://localhost:48721/auth/github/callback` |

> **Lưu ý:** URL đăng ký ở IdP phải **khớp tuyệt đối** (scheme, host, port, path) với callback URL của backend. Nếu deploy port khác, đặt biến môi trường `SSO_BASE_URL` cho backend và đăng ký lại URL tương ứng ở IdP.

### 2.2. Các trường cấu hình trong UI (Admin → Auth → SSO Providers)

| Trường | Bắt buộc | Ghi chú |
|--------|:--------:|---------|
| Client ID | ✅ | Lấy từ IdP |
| Client Secret | ✅ | Lấy từ IdP (chỉ hiện 1 lần khi tạo) |
| Tenant ID | Chỉ Entra | GUID tenant, hoặc `common`/`organizations`/`consumers` |
| Redirect URI | ❌ | Để trống → tự suy ra callback URL đúng |
| Scopes | ❌ | Để trống → dùng mặc định của provider |
| Enabled | ✅ | Bật để provider hoạt động và hiện nút đăng nhập |

### 2.3. Các guard bảo mật (áp dụng cho MỌI provider)

Hiểu các quy tắc này giúp không nhầm lẫn "lỗi" với hành vi bảo mật đúng:

- **SEC-01 — Cấm auto-link SSO → tài khoản LOCAL:** Nếu email SSO trùng email của một tài khoản mật khẩu (LOCAL) đã tồn tại, hệ thống **từ chối** tự động liên kết (chống chiếm tài khoản). Muốn liên kết phải làm thủ công từ account settings.
- **Một email = một danh tính SSO:** Nếu email đã liên kết với provider A (ví dụ Google), đăng nhập bằng provider B (ví dụ GitHub) với **cùng email** sẽ bị từ chối `Email already linked to another SSO identity`.
- **Email phải verified:** JIT provisioning chỉ tạo user khi email được xác minh:
  - Entra: dùng claim `xms_edov` (email domain owner verified) — xem mục 3.
  - Google: dùng claim `email_verified`.
  - GitHub: email phải là **primary + verified** (kiểm tra tại https://github.com/settings/emails).
- **Phản hồi lỗi rõ ràng:** Khi bị từ chối ở bước provisioning, backend trả HTTP **403** với `{"error":"provisioning_rejected","message":"..."}` để dễ chẩn đoán (thay vì lỗi chung chung).

---

## 3. Microsoft Entra ID (Azure AD)

### 3.1. Đăng ký App trên Azure Portal

1. Vào https://portal.azure.com → **Microsoft Entra ID** → menu **Manage → App registrations** → **New registration**.
   *(Hoặc gõ "App registrations" vào thanh Search ở trên cùng.)*
2. Điền:
   - **Name:** ví dụ `SDLC Agents 4 Enterprise (Test)`.
   - **Supported account types:**
     - *Single tenant* (chỉ tổ chức của bạn) → `Tenant ID` = GUID tenant.
     - *Multitenant + personal accounts* → `Tenant ID` = `common` (cho phép tài khoản cá nhân/hotmail đăng nhập).
   - **Redirect URI:** platform **Web** → `http://localhost:48721/auth/entra/callback`.
3. Bấm **Register**.
4. Ở trang **Overview**, copy:
   - **Application (client) ID** → `Client ID`.
   - **Directory (tenant) ID** → `Tenant ID` (nếu dùng single tenant).
5. **Certificates & secrets** → **Client secrets** → **New client secret** → copy giá trị ở cột **Value** (chỉ hiện 1 lần) → `Client Secret`.

### 3.2. ⚠️ Bật optional claim `xms_edov` (BẮT BUỘC)

Entra ID **không gửi** claim chuẩn `email_verified`. Claim tương đương của Microsoft là **`xms_edov`** (email domain owner verified). Đây là *optional claim* — Entra chỉ phát khi được khai báo:

1. Trong App registration → **Token configuration** (menu Manage) → **+ Add optional claim**.
2. **Token type = ID** → tick **`email`** → **Add**. Nếu Azure hỏi bật *Microsoft Graph email permission* → đồng ý.
3. **+ Add optional claim** lần nữa → **Token type = ID** → tick **`xms_edov`** → **Add**.
   - Nếu danh sách UI không có `xms_edov`, thêm qua tab **Manifest**: trong mảng `optionalClaims.idToken`, thêm phần tử `{ "name": "xms_edov", "source": null, "essential": false, "additionalProperties": [] }`.

> Không bật `xms_edov` → token thiếu claim → JIT từ chối với `SSO_JIT_REJECTED_EMAIL_NOT_VERIFIED`.

### 3.3. Cấu hình trong ứng dụng

Admin → tab **Auth** → **SSO Providers** → sửa dòng **Microsoft Entra ID**:

| Trường | Giá trị |
|--------|---------|
| Tenant ID | GUID tenant (hoặc `common`/`organizations`) |
| Client ID | Application (client) ID |
| Client Secret | Value của secret vừa tạo |
| Redirect URI | Để trống (tự suy `http://localhost:48721/auth/entra/callback`) |
| Scopes | Để trống → mặc định `openid profile email offline_access` |
| Enabled | ✅ |

Lưu lại.

### 3.4. Lưu ý Entra

- `Tenant ID` phải là GUID hợp lệ hoặc `common`/`organizations`/`consumers`; `Client ID` phải là GUID; `Client Secret` ≥ 8 ký tự — sai định dạng → login trả 400 `sso_not_configured`.
- `xms_edov=true` chỉ đạt khi email thuộc tenant đã verify domain, hoặc tài khoản MSA/Google/OTP. Tài khoản cá nhân hotmail có thể đăng nhập được nếu chọn multitenant + đã bật `xms_edov`.

---

## 4. Google

### 4.1. Đăng ký OAuth Client trên Google Cloud Console

1. Vào https://console.cloud.google.com → chọn/ tạo Project.
2. **APIs & Services → OAuth consent screen:**
   - User type: **External** (để tài khoản Google bất kỳ test được) → điền tên app, email hỗ trợ, developer email → Save.
   - Ở màn hình **Test users** (khi app đang ở trạng thái Testing), thêm các tài khoản Google sẽ dùng để test.
3. **APIs & Services → Credentials → + Create Credentials → OAuth client ID:**
   - Application type: **Web application**.
   - **Authorized redirect URIs** → thêm: `http://localhost:48721/auth/google/callback`.
   - Create → copy **Client ID** và **Client Secret**.

### 4.2. Cấu hình trong ứng dụng

Admin → tab **Auth** → **SSO Providers** → sửa dòng **Google**:

| Trường | Giá trị |
|--------|---------|
| Client ID | Client ID từ Google |
| Client Secret | Client secret từ Google |
| Redirect URI | Để trống (tự suy `http://localhost:48721/auth/google/callback`) |
| Scopes | Để trống → mặc định `openid email profile` |
| Enabled | ✅ |

Lưu lại.

### 4.3. Lưu ý Google

- Google luôn gửi `email_verified` nên không cần cấu hình claim thêm.
- Nếu OAuth consent screen ở trạng thái **Testing**, chỉ các tài khoản trong danh sách **Test users** đăng nhập được.
- ⚠️ **Bảo mật:** Client Secret không được để lộ (chat, commit, log). Nếu lỡ lộ, vào Credentials xoá/tạo lại secret và cập nhật lại trong UI.

---

## 5. GitHub

### 5.1. Đăng ký OAuth App trên GitHub

1. Vào https://github.com/settings/developers → tab **OAuth Apps** → **New OAuth App**.
   *(Đường ngắn: https://github.com/settings/applications/new)*
2. Điền:
   - **Application name:** ví dụ `SDLC Agents 4 Enterprise (Test)`.
   - **Homepage URL:** `http://localhost:48721`.
   - **Authorization callback URL:** `http://localhost:48721/auth/github/callback`.
3. **Register application**.
4. Copy **Client ID**; bấm **Generate a new client secret** → copy giá trị (chỉ hiện 1 lần) → **Client Secret**.

### 5.2. Cấu hình trong ứng dụng

Admin → tab **Auth** → **SSO Providers** → sửa dòng **GitHub**:

| Trường | Giá trị |
|--------|---------|
| Client ID | Client ID từ GitHub |
| Client Secret | Client secret từ GitHub |
| Redirect URI | Để trống (tự suy `http://localhost:48721/auth/github/callback`) |
| Scopes | Để trống → mặc định `read:user user:email` |
| Enabled | ✅ |

Lưu lại.

### 5.3. Lưu ý GitHub

- GitHub **không** phải OIDC: không có `id_token`, không JWKS, không PKCE/nonce. Danh tính lấy từ REST API `/user` + `/user/emails`; CSRF bảo vệ bằng `state`.
- Tài khoản GitHub phải có **email primary + verified** (https://github.com/settings/emails) — nếu không có email verified → từ chối `email_not_verified` (403).
- GitHub không cần cấu hình scopes/consent screen bổ sung.

---

## 6. Đăng nhập & xác minh sau cấu hình

### 6.1. Đăng nhập từ Extension (VS Code / Kiro)

1. Sau khi lưu cấu hình + bật Enabled, nút đăng nhập tương ứng ("Sign in with Microsoft/Google/GitHub") **tự xuất hiện** trên màn hình Login của extension (render động theo `/auth/sso/providers`).
2. Bấm nút → trình duyệt mở trang đăng nhập của provider → sau khi đồng ý, token được trả về extension qua loopback callback.
3. Sidebar hiển thị **đúng tên user** vừa đăng nhập (lấy từ `GET /api/admin/auth/me`).

### 6.2. Đăng nhập từ Web Admin

- Callback trao token cho SPA qua URL param (`?sso_token=...`) để SPA lưu vào localStorage và không bị bật lại màn login.

### 6.3. Cách xác minh login thành công (dành cho admin/kỹ thuật)

Kiểm tra audit log và bảng users trong DB:

```sql
-- Login thành công sẽ có SSO_JIT_PROVISION (lần đầu) rồi SSO_LOGIN_{PROVIDER}
SELECT action, changes, timestamp FROM audit_log
WHERE action LIKE 'SSO%' ORDER BY timestamp DESC LIMIT 10;

-- User SSO được tạo
SELECT user_id, username, email, account_type, external_provider, access_group_id
FROM users WHERE external_provider IS NOT NULL AND external_provider <> '';
```

---

## 7. Xử lý sự cố (Troubleshooting)

| Triệu chứng / Lỗi | Nguyên nhân | Cách xử lý |
|-------------------|-------------|-----------|
| `{"error":"sso_not_configured"}` (400) | Row provider chưa đủ client_id/secret, hoặc sai định dạng (GUID với Entra) | Kiểm tra lại Client ID/Secret/Tenant trong UI |
| `{"error":"internal_error"}` khi callback Entra | (đã fix) trước đây do thiếu `xms_edov` | Đảm bảo đã bật optional claim `xms_edov` (mục 3.2) |
| `SSO_JIT_REJECTED_EMAIL_NOT_VERIFIED` | Email chưa được verified | Entra: bật `xms_edov`; GitHub: đặt email primary+verified |
| `{"error":"provisioning_rejected","message":"Email already linked to another SSO identity"}` | Email đã gắn với provider SSO khác | Dùng email/tài khoản khác, hoặc xoá user cũ nếu chỉ là dữ liệu test |
| `provisioning_rejected` — "Auto-linking SSO to an existing local account is not allowed" | Email trùng tài khoản LOCAL (SEC-01) | Dùng email chưa tồn tại, hoặc liên kết thủ công từ account settings |
| Nút provider không hiện trên màn login | Provider chưa `enabled=1` hoặc thiếu client_id | Bật Enabled + điền Client ID trong UI |
| Callback báo redirect_uri mismatch | URL đăng ký ở IdP khác callback backend | Đăng ký đúng `http://localhost:48721/auth/{provider}/callback` (hoặc theo `SSO_BASE_URL`) |
| Cookie session bị drop trên http://localhost | Cờ `Secure` trên môi trường HTTP | Đặt `ALLOW_INSECURE_COOKIES=true` cho môi trường dev HTTP |

### Endpoint kiểm tra nhanh

```bash
# Danh sách provider đang bật + đã cấu hình
GET http://localhost:48721/auth/sso/providers

# Bắt đầu luồng đăng nhập (redirect sang IdP)
GET http://localhost:48721/auth/{provider}/login

# Thông tin user hiện tại (Bearer token)
GET http://localhost:48721/api/admin/auth/me
```

---

## 8. Tham chiếu kỹ thuật (cho dev)

| Thành phần | Đường dẫn |
|-----------|-----------|
| Entra strategy / config | `backend/src/server/auth/strategies/EntraProviderStrategy.ts`, `backend/src/config/EntraConfig.ts` |
| Google strategy / config | `backend/src/server/auth/strategies/GoogleProviderStrategy.ts`, `GoogleProviderConfig.ts` |
| GitHub strategy | `backend/src/server/auth/strategies/GitHubProviderStrategy.ts` |
| Route login/callback | `backend/src/server/routes/auth/{entra,sso-provider,sso-dynamic}.ts` |
| Callback URL helper | `backend/src/server/auth/utils/callback-url.ts` |
| Config loader (DB-first) | `backend/src/server/auth/utils/sso-config-loader.ts` |
| JIT provisioning + guards | `backend/src/server/services/JitProvisioningService.ts` |
| Extension login panel (render động) | `extension/src/panels/login-panel.ts` |
| Extension auth manager | `extension/src/auth/AuthManager.ts` |

---

*Tài liệu thuộc Epic SA4E-262 — Multi-provider SSO. Cập nhật khi thay đổi cấu hình provider hoặc port deploy.*
