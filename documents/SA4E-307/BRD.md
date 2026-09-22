# Business Requirements Document (BRD)
## SA4E-307 — SSO Provider Strategy Abstraction + Registry + Refactor Entra

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-307 |
| Title | SSO Provider Strategy Abstraction + Registry + Refactor Entra |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-09-22 |
| Status | Draft |

---

## 1. Introduction

### 1.1 Mục tiêu
Triển khai Strategy pattern cho SSO đa provider, tách biệt interface và triển khai cụ thể, đảm bảo Entra ID giữ nguyên hành vi PKCE / nonce / verify JWT trong khi cho phép mở rộng Google, GitHub và provider khác qua registry singleton.

### 1.2 Scope thực tế

Phạm vi được xác định từ code review thực tế, KHÔNG bịa đặt:

- `backend/src/server/auth/strategies/SsoProviderStrategy.ts` — Interface `SsoProviderStrategy` với `providerType`, `buildAuthorizeUrl(options?: AuthorizeOptions): Promise<AuthorizeResult> | AuthorizeResult`, `handleCallback(params: CallbackParams): Promise<NormalizedProfile>`
- `backend/src/server/auth/strategies/SsoProviderStrategy.ts` — Types `AuthorizeOptions`, `AuthorizeResult {url, state, nonce?, codeVerifier?}`, `StoredSsoState`, `CallbackParams`
- `backend/src/server/auth/strategies/SsoStrategyRegistry.ts` — Singleton `SsoStrategyRegistry` với `register`, `get`, `has`, `list`, `clear`, `resetInstance`
- `backend/src/server/auth/strategies/EntraProviderStrategy.ts` — Triển khai Entra: `buildAuthorizeUrl` load config từ `loadEntraConfigAsync`, tạo state/nonce/verifier, challenge S256, URL `/oauth2/v2.0/authorize`
- `backend/src/server/auth/strategies/EntraProviderStrategy.ts` — `handleCallback` exchange code lấy id_token, verify RS256 qua `getEntraVerifierAsync`, validate nonce khớp payload, map email từ `claims.email` fallback `preferred_username`/`upn`, emailVerified qua `xms_edov`/`email_verified`, trả `NormalizedProfile` với `provider='entra'`, `externalSubjectId` = oid/sub, `groups` từ payload
- `backend/src/server/auth/strategies/index.ts` — Đăng ký mặc định `EntraProviderStrategy`, `GoogleProviderStrategy`, `GitHubProviderStrategy` vào `ssoStrategyRegistry`
- `backend/src/server/services/JitProvisioningService.ts` — `provision(claims, defaultGroup?)` nhận `NormalizedProfile | EntraClaims`, provider động, kiểm tra `email` + `oid`, chặn auto-link tài khoản LOCAL, chặn HYBRID, yêu cầu `emailVerified`, map group Entra qua `ENTRA_GROUP_MAPPING`, default group `grp-viewer`, audit provision/link/reject
- `backend/src/server/routes/auth/sso-dynamic.ts` — `createSsoDynamicRoutes` cung cấp `GET /sso/providers` từ DB `sso_providers` enabled + client_id, `GET /:provider/login` kiểm tra `ssoStrategyRegistry.has(provider)` để redirect, trả 501 nếu provider known nhưng chưa implemented

### 1.3 Out of Scope
- Thay đổi UI login page, thay đổi schema DB `sso_providers`
- Triển khai provider mới ngoài Entra/Google/GitHub
- Thay đổi thuật toán hash password

### 1.4 Preliminary Requirement
- Bảng `sso_providers` phải chứa record `provider_type='entra'` với `client_id`, `client_secret`, `redirect_uri`, `scopes`, `authority`
- Env `ENTRA_GROUP_MAPPING` tùy chọn
- Verifier Entra phải khả dụng qua `getEntraVerifierAsync`

---

## 2. Business Requirements

### 2.1 High Level Process Map
User → Request authorize → Strategy.buildAuthorizeUrl → IdP → Callback → Strategy.handleCallback → Verify JWT/Nonce → NormalizeProfile → JitProvisioningService.provision → Create/Link User → Session

Diagram tham chiếu:
![Authorize -> Callback -> Verify -> JIT](diagrams/authorize_callback_verify_jit.png)
*[Edit in draw.io](diagrams/authorize_callback_verify_jit.drawio)*

### 2.2 List of User Stories

| # | Story | Priority | Source |
|---|-------|----------|--------|
| 1 | As a Developer, I want SSO provider abstraction via Strategy interface so that new providers can be added without changing routes | MUST HAVE | SA4E-307 |
| 2 | As a Security Auditor, I want Entra PKCE + nonce verification preserved so that SSO login remains secure | MUST HAVE | Code EntraProviderStrategy |
| 3 | As an Admin, I want JIT provisioning with email verification and anti-takeover rules so that users are onboarded safely | MUST HAVE | JitProvisioningService |

### 2.3 Details

#### STORY 1: SSO Strategy Abstraction
**Requirement Details:**
1. Interface `SsoProviderStrategy` định nghĩa `providerType`, `buildAuthorizeUrl`, `handleCallback`
2. Registry singleton quản lý đăng ký và lookup theo `providerType` lowercase
3. `sso-dynamic.ts` dispatch dựa trên `registry.has(provider)`

**Acceptance Criteria từ code:**
- `SsoProviderStrategy.ts:39-40` method signatures tồn tại
- `SsoStrategyRegistry.ts:14-20` register/get/has hoạt động
- `index.ts:13-15` 3 strategy mặc định được register

#### STORY 2: Entra PKCE + Verify
**Requirement Details:**
1. `buildAuthorizeUrl` tạo state, verifier, challenge S256, nonce
2. `handleCallback` exchange code với `code_verifier`, verify id_token qua JWKS, kiểm tra nonce
3. Email verified được xác định qua `xms_edov` fallback `email_verified`

**Acceptance Criteria từ code:**
- `EntraProviderStrategy.ts:22-50` params `code_challenge_method='S256'`, `nonce` được gửi
- `EntraProviderStrategy.ts:99-103` nonce mismatch ném `invalid_nonce` status 401
- `EntraProviderStrategy.ts:122` `emailVerified` dùng `isEntraEmailVerified`
- `EntraProviderStrategy.ts:124` `groups` lấy từ payload

**Validation Rules:**
- `code_verifier` bắt buộc khi exchange
- `nonce` phải khớp payload id_token
- `email` không rỗng và `oid/sub` không rỗng

**Error Handling:**
- `SSO not enabled` nếu config null
- `token_exchange_failed` nếu token endpoint lỗi
- `verifier_unavailable` nếu JWKS load lỗi
- `invalid_nonce` nếu nonce không khớp

#### STORY 3: JIT Provisioning & Anti-Takeover
**Requirement Details:**
1. `provision` nhận claims, xác định provider, chuẩn hoá email/oid
2. Ưu tiên tìm user theo `external_provider + external_subject_id`
3. Nếu match email, yêu cầu `emailVerified`, cấm link vào `account_type=LOCAL`, cấm HYBRID
4. Tạo user mới nếu chưa tồn tại và email verified

**Acceptance Criteria từ code:**
- `JitProvisioningService.ts:72-75` lookup external identity
- `JitProvisioningService.ts:86-113` email match flow với các reject rules
- `JitProvisioningService.ts:129-142` JIT create với `userId = 'user-' + uuid`, `account_type='SSO'`, `password_hash=null`
- `JitProvisioningService.ts:149-157` `mapGroup` dựa trên `ENTRA_GROUP_MAPPING`

**Validation Rules:**
- `email` và `oid` bắt buộc
- `emailVerified` bắt buộc cho link và JIT
- Không auto-link vào tài khoản LOCAL

**Error Handling:**
- `Missing required entra id claims: email and oid/sub`
- `Email not verified by Entra ID; linking rejected`
- `Auto-linking SSO to an existing local account is not allowed`
- `Email already linked to another SSO identity`

---

## 3. Dependencies

| Dependency | Type | Related | Description |
|------------|------|---------|-------------|
| `sso_providers` table | Data | - | Cấu hình client_id/secret/redirect_uri |
| `getEntraVerifierAsync` | Integration | - | Verify JWT RS256 |
| `DatabaseAdapter` | Infrastructure | - | Truy vấn users, audit |

---

## 4. Stakeholders
| Role | Team | Responsibility |
|------|------|----------------|
| BA | - | BRD/FSD |
| Backend Dev | - | Triển khai Strategy |
| Security | - | Review nonce/PKCE |

---

## 5. Risks and Assumptions

### 5.1 Risks
| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Regression Entra login | High | Medium | Giữ nguyên logic EntraProviderStrategy, test 58/58 |
| Sai mapping emailVerified | High | Low | Dùng `isEntraEmailVerified` với `xms_edov` |
| Auto-link tài khoản LOCAL | High | Low | Kiểm tra `account_type === 'LOCAL'` reject |

### 5.2 Assumptions
- `loadEntraConfigAsync` đọc từ DB `sso_providers` trước, fallback env
- `NormalizedProfile` shape ổn định

---

## 6. Non-Functional Requirements
| Category | Requirement | Details |
|----------|-------------|---------|
| Security | PKCE S256, nonce validation, RS256 verify | Code EntraProviderStrategy |
| Security | Anti-account-takeover | JitProvisioningService reject LOCAL auto-link |
| Maintainability | SOLID, ≤200 dòng/file | Theo code thực tế |
| Audit | Mọi provision/link/reject ghi audit | `recordAudit` |

---

## 7. Related Tickets
| Ticket | Summary | Relationship |
|--------|---------|--------------|
| SA4E-307 | SSO Strategy Abstraction | Main |

---

## 8. Appendix

### Diagram Index
| Diagram | File |
|---------|------|
| Authorize Callback Verify JIT Flow | [authorize_callback_verify_jit.png](diagrams/authorize_callback_verify_jit.png) |

### Reference Documents
| Document | Location |
|----------|----------|
| SsoProviderStrategy | backend/src/server/auth/strategies/SsoProviderStrategy.ts |
| EntraProviderStrategy | backend/src/server/auth/strategies/EntraProviderStrategy.ts |
| JitProvisioningService | backend/src/server/services/JitProvisioningService.ts |
| sso-dynamic routes | backend/src/server/routes/auth/sso-dynamic.ts |
