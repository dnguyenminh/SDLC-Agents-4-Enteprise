# SA4E — Backlog: Tích hợp SSO Microsoft Entra ID (OIDC) + JIT Provisioning + Local song song

> **✅ Trạng thái tạo ticket:** ĐÃ TẠO THẬT trên Jira project SA4E (`jiraassist.atlassian.net`) qua Jira tools in-process của extension. Epic + 12 ticket (S1–S12) đã tạo, tất cả ở trạng thái **To Do**, đã link vào Epic qua field `parent` (team-managed project). Không transition (đúng yêu cầu planning-only).
>
> **Dedup:** Đã query `project = SA4E AND (summary ~ "SSO" OR summary ~ "Entra" OR summary ~ "OIDC")` trước khi tạo → không có ticket trùng. (Có 1 Epic bị tạo lặp do lỗi prompt xác nhận của shell — đã xoá ngay, chỉ giữ 1 Epic.)

## Bản đồ Jira Key (thực tế)

| Mã tạm | Jira Key | Type | Summary | Depends on |
|--------|----------|------|---------|-----------|
| EPIC | **SA4E-262** | Epic | [SSO] Tích hợp Microsoft Entra ID (OIDC + PKCE)… | — |
| S1 | **SA4E-264** | Task | [Config] Cấu hình Entra ID + env + validation | — |
| S2 | **SA4E-265** | Task | [DB] Migration account type + external subject id | — |
| S3 | **SA4E-266** | Story | [Backend] Verify RS256 + JWKS + discovery | SA4E-264 |
| S4 | **SA4E-267** | Story | [Backend] OAuth2 Auth Code + PKCE callback | SA4E-264, SA4E-266 |
| S5 | **SA4E-268** | Story | [Backend] JIT Provisioning Service | SA4E-265, SA4E-267 |
| S6 | **SA4E-269** | Story | [Backend] Hợp nhất về single UserRepository | SA4E-265 |
| S7 | **SA4E-270** | Story | [Extension] Wire PKCE vào AuthManager | SA4E-267 |
| S8 | **SA4E-272** | Story | [Security] Hardening | SA4E-266,267,268,270 |
| S9 | **SA4E-273** | Story | [Extension] UI Sign in with Microsoft | SA4E-270 |
| S10 | **SA4E-274** | Task | [QA] Test Planning STP/STC | SA4E-266,267,268,269,270 |
| S11 | **SA4E-275** | Task | [Docs] Cập nhật auth-sso | SA4E-264…273 (S1–S9) |
| S12 | **SA4E-271** | Task | [Config/DevOps] Đăng ký App Entra | SA4E-264 |

> **Epic link:** Đã gán tự động qua `custom_fields.parent = { key: "SA4E-262" }` — verify OK cho cả 12 ticket. Không cần link thủ công.
> **Lưu ý accent:** Nội dung ticket được tạo không dấu để tránh lỗi encoding khi POST qua terminal; ý nghĩa giữ nguyên. Có thể chỉnh lại có dấu trong Jira nếu muốn.

---

## 0. Phạm vi & nguyên tắc

- **Auth flow:** OpenID Connect / OAuth2 **Authorization Code + PKCE (S256)** với Microsoft Entra ID.
- **Signup:** **JIT provisioning** — tạo user nội bộ lần đầu login SSO (map `oid`/`sub`/`email`/`name` → `users`, gán `access_group` mặc định).
- **Local account** (email/password PBKDF2) **chạy song song** với SSO.
- **No-workaround:** hợp nhất 2 auth entry hiện có (`admin/auth.ts` dùng username + `sa4e-215/auth.ts` dùng email) về **single UserRepository** — bắt buộc, không patch tạm.
- Ticket này chỉ **planning**; implement do AI khác thực hiện theo backlog.

### Nhãn (labels) dùng chung
`sso`, `entra-id`, `auth`, `oidc`, `backend`, `extension`, `security`, `db`, `docs`

---

## 1. EPIC — `SA4E-262`

| Field | Value |
|-------|-------|
| **Jira Key** | **SA4E-262** |
| **Type** | Epic |
| **Summary** | [SSO] Tích hợp Microsoft Entra ID (OIDC + PKCE) với JIT provisioning, giữ local account song song |
| **Labels** | `sso`, `entra-id`, `auth`, `oidc` |
| **Description** | Cho phép user đăng nhập SA4E bằng Microsoft Entra ID qua OAuth2 Authorization Code + PKCE. Backend verify token Entra bằng RS256 + JWKS, validate issuer/nonce/state. Lần đầu login SSO sẽ **JIT provisioning** tạo user nội bộ và gán access_group mặc định. Vẫn hỗ trợ local email/password. Hợp nhất 2 auth entry hiện tại về single source of truth. Bao gồm extension UI "Sign in with Microsoft", security hardening, test planning và cập nhật docs. |
| **Acceptance Criteria** | (1) User login được bằng tài khoản Entra ID; (2) User mới tự động được tạo qua JIT với access_group mặc định; (3) Local login vẫn hoạt động; (4) Chỉ còn 1 UserRepository/1 auth code path; (5) Token Entra verify bằng RS256+JWKS thành công, token giả/expired bị từ chối; (6) Có STP/STC và docs cập nhật. |

---

## 2. STORIES / TASKS (thứ tự đề xuất theo dependency)

> Ước lượng dependency ghi theo **mã tạm** S1..S12 (user thay bằng key Jira thật sau khi tạo). Tất cả Story link vào Epic ở mục 1.

### S1 — [Config] Cấu hình Entra ID + env + validation — `SA4E-264`
| Field | Value |
|-------|-------|
| **Jira Key** | **SA4E-264** |
| **Type** | Task |
| **Labels** | `sso`, `entra-id`, `backend`, `config` |
| **Depends on** | — (nền tảng) |
| **Description** | Thêm cấu hình Entra: `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_REDIRECT_URI`, `ENTRA_AUTHORITY`, `ENTRA_ISSUER`, `ENTRA_JWKS_URI`, `ENTRA_SCOPES` (mặc định `openid profile email offline_access`). Bổ sung layer validation (zod) fail-fast khi thiếu/không hợp lệ. Cập nhật `.env.example`. KHÔNG commit secret thật. |
| **Acceptance Criteria** | Khởi động fail rõ ràng nếu thiếu config bắt buộc khi bật SSO; có schema zod cho toàn bộ env Entra; document trong `.env.example`. |

### S2 — [DB] Migration: account type (LOCAL/SSO) + external subject id + account linking — `SA4E-265`
| Field | Value |
|-------|-------|
| **Jira Key** | **SA4E-265** |
| **Type** | Task |
| **Labels** | `sso`, `db`, `backend`, `auth` |
| **Depends on** | — (song song S1) |
| **Description** | Migration cho `users` (SQLite + PostgreSQL): thêm `account_type` (**LOCAL \| SSO** — KHÔNG có HYBRID theo quyết định), `external_provider` (vd `entra`), `external_subject_id` (Entra `oid`/`sub`), unique index `(external_provider, external_subject_id)`; đảm bảo `email` linking rule (chống tạo trùng). `password_hash` nullable cho SSO-only user. Cập nhật `backend/src/admin/db/schema.ts`. |
| **Acceptance Criteria** | Migration chạy được trên cả SQLite & PostgreSQL; user SSO không cần password_hash; `account_type` chỉ nhận LOCAL hoặc SSO (không HYBRID); không thể tạo 2 user cùng external subject; có rollback. |

### S3 — [Backend] Verify RS256 + JWKS + discovery/issuer/nonce/state (mở rộng jwt-auth) — `SA4E-266`
| Field | Value |
|-------|-------|
| **Jira Key** | **SA4E-266** |
| **Type** | Story |
| **Labels** | `sso`, `oidc`, `backend`, `security` |
| **Depends on** | S1 |
| **Description** | Mở rộng `backend/src/server/middleware/jwt-auth.ts`: hỗ trợ verify **RS256** dùng **JWKS** của Entra (cache + rotation), OIDC **discovery** (`.well-known/openid-configuration`), validate `iss`/`aud`/`exp`/`nonce`. Giữ nguyên đường HS256 + opaque session cho local. Tách logic verifier theo Strategy (LocalHS256 vs EntraRS256). |
| **Acceptance Criteria** | Token Entra hợp lệ pass; token sai chữ ký/issuer/aud/expired bị reject; JWKS cache có refresh khi key rotate; local HS256 không bị ảnh hưởng. |

### S4 — [Backend] Endpoint OAuth2 Authorization Code + PKCE callback — `SA4E-267`
| Field | Value |
|-------|-------|
| **Jira Key** | **SA4E-267** |
| **Type** | Story |
| **Labels** | `sso`, `oidc`, `backend`, `auth` |
| **Depends on** | S1, S3 |
| **Description** | Thêm endpoints: khởi tạo authorize (sinh `state`+`nonce`, lưu tạm), và `/callback` nhận `code`, đổi `code`→token tại Entra token endpoint (kèm `code_verifier` PKCE), verify id_token (dùng S3), tạo/refresh opaque session nội bộ. Chống CSRF bằng state, chống replay bằng nonce. |
| **Acceptance Criteria** | Flow authorize→callback→session hoạt động end-to-end; state/nonce mismatch bị từ chối; code chỉ dùng 1 lần; trả session giống local login. |

### S5 — [Backend] JIT Provisioning Service — `SA4E-268`
| Field | Value |
|-------|-------|
| **Jira Key** | **SA4E-268** |
| **Type** | Story |
| **Labels** | `sso`, `backend`, `auth`, `jit` |
| **Depends on** | S2, S4 |
| **Description** | Service tạo user từ claims lần đầu (`oid`→external_subject_id, `email`, `name`), gán `access_group` mặc định = **`grp-viewer`** (config qua env, quyết định của user), set `account_type=SSO`. **Account linking policy (CHỐT):** chỉ link local↔SSO khi Entra trả `email_verified=true`; nếu email trùng nhưng `email_verified=false` → từ chối, KHÔNG auto-link. **KHÔNG tạo user HYBRID** — user đã là LOCAL thì login SSO chỉ được link (không đổi loại), không tồn tại account vừa LOCAL vừa SSO độc lập. Cập nhật `last_login`, ghi `audit_log`. Đặt logic ở `services/`, tách khỏi route (SRP). |
| **Acceptance Criteria** | Login SSO lần đầu tạo đúng user + group `grp-viewer` + audit; login lần sau reuse user; email trùng + `email_verified=true` → link; email trùng + `email_verified=false` → reject rõ ràng; không tạo được HYBRID; có unit test. |

### S6 — [Backend] Hợp nhất 2 auth entry về single UserRepository — `SA4E-269`
| Field | Value |
|-------|-------|
| **Jira Key** | **SA4E-269** |
| **Type** | Story |
| **Labels** | `auth`, `backend`, `refactor`, `no-workaround` |
| **Depends on** | S2 |
| **Description** | Hợp nhất `backend/src/server/routes/admin/auth.ts` (username) và `backend/src/server/routes/sa4e-215/auth.ts` (email + /register) về **single UserRepository** + 1 bộ login/logout/refresh/me. Chuẩn hóa identity (email làm chính, username tùy chọn). Không để 2 code path song song. Cập nhật session lifecycle dùng chung. |
| **Acceptance Criteria** | Chỉ còn 1 UserRepository; local login (email & username cũ) vẫn chạy; /register vẫn hoạt động; không còn duplicate route; regression tests pass. |

### S7 — [Extension] Wire PKCE vào AuthManager + browser redirect + loopback capture — `SA4E-270`
| Field | Value |
|-------|-------|
| **Jira Key** | **SA4E-270** |
| **Type** | Story |
| **Labels** | `sso`, `extension`, `auth`, `oidc` |
| **Depends on** | S4 |
| **Description** | Nối `extension/src/auth/PkceService.ts` (S256 đã có) vào `AuthManager.ts`: mở browser tới authorize URL, capture redirect qua loopback listener, gửi `code`+`verifier` tới backend `/callback`, lưu token vào SecretStorage, khởi động TokenRefreshTimer. Tham chiếu thiết kế client-side PKCE trong `documents/F9-auth-sso/`. |
| **Acceptance Criteria** | Bấm đăng nhập → mở browser Entra → quay lại extension đăng nhập thành công; verifier không rời máy client trừ khi gửi backend; refresh token hoạt động. |

### S8 — [Security] Hardening: token handling, PKCE, session fixation, account linking, group mapping — `SA4E-272`
| Field | Value |
|-------|-------|
| **Jira Key** | **SA4E-272** |
| **Type** | Story |
| **Labels** | `security`, `sso`, `auth` |
| **Depends on** | S3, S4, S5, S7 |
| **Description** | Rà soát: không log `code_verifier`/token/secret; bắt buộc PKCE S256; chống session fixation (rotate session sau login); policy chống lạm dụng account linking (chỉ link khi email verified từ Entra); rule map group mặc định + chặn privilege escalation; rate limit callback. Output SECURITY-REVIEW findings. |
| **Acceptance Criteria** | Có checklist findings + severity; không có secret trong log; PKCE bắt buộc; session rotate sau auth; linking chỉ với email verified; test cho các vector. |

### S9 — [Extension] UI: "Sign in with Microsoft" + provider selection + status bar + error handling — `SA4E-273`
| Field | Value |
|-------|-------|
| **Jira Key** | **SA4E-273** |
| **Type** | Story |
| **Labels** | `sso`, `extension`, `ui` |
| **Depends on** | S7 |
| **Description** | Thêm nút "Sign in with Microsoft", màn chọn provider (Local vs Entra), hiển thị trạng thái đăng nhập ở status bar, xử lý & hiển thị lỗi (user-facing, không nuốt exception). Tuân thủ code-standards (tách UI/logic). |
| **Acceptance Criteria** | User chọn được provider; status bar phản ánh đúng trạng thái; lỗi hiển thị rõ cho user; không hardcode text nhạy cảm. |

### S10 — [QA] Test Planning: STP/STC cho SSO + JIT + local song song — `SA4E-274`
| Field | Value |
|-------|-------|
| **Jira Key** | **SA4E-274** |
| **Type** | Task |
| **Labels** | `sso`, `qa`, `docs` |
| **Depends on** | S3, S4, S5, S6, S7 |
| **Description** | STP/STC phủ: RS256/JWKS verify (valid/invalid/rotated), PKCE flow, state/nonce, JIT tạo user + group, account linking, local login song song, unified repo regression, error paths. RTM map tới AC của Epic/Stories. Test data CSV. |
| **Acceptance Criteria** | 6 test levels; RTM coverage 100% AC; case cho token giả/expired/issuer sai; case JIT lần đầu vs reuse; case local song song. |

### S11 — [Docs] Cập nhật/kế thừa tài liệu auth-sso (backend Entra + JIT + local) — `SA4E-275`
| Field | Value |
|-------|-------|
| **Jira Key** | **SA4E-275** |
| **Type** | Task |
| **Labels** | `docs`, `sso` |
| **Depends on** | S1–S9 |
| **Description** | Cập nhật docs phản ánh scope mới (backend OIDC + JIT + local song song), kế thừa phần client PKCE từ `documents/F9-auth-sso/`. Bao gồm sequence flow Entra, config reference env, JIT/linking policy, security notes. |
| **Acceptance Criteria** | Docs mô tả đúng flow backend Entra; có config reference; có sequence/diagram; nêu rõ khác biệt với F9-auth-sso cũ. |

### S12 — [Config/DevOps] Đăng ký App Entra + redirect URI + secrets management (môi trường) — `SA4E-271`
| Field | Value |
|-------|-------|
| **Jira Key** | **SA4E-271** |
| **Type** | Task |
| **Labels** | `sso`, `entra-id`, `devops`, `security` |
| **Depends on** | S1 |
| **Description** | Hướng dẫn đăng ký App Registration trên Entra (redirect URIs cho loopback/extension, scopes, expose API/aud), quản lý client secret qua secrets store (không hardcode), phân biệt env dev/staging/prod. |
| **Acceptance Criteria** | Có runbook đăng ký app; redirect URIs khớp S4/S7; secret không nằm trong repo; tài liệu env per-environment. |

---

## 3. Sơ đồ phụ thuộc (tóm tắt)

```
Epic
├─ S1 Config env ─────────────┐
│                             ├─ S3 RS256/JWKS ── S4 Callback+PKCE ──┐
├─ S2 DB migration ──┐        │                                      ├─ S5 JIT ──┐
│                    ├────────┘                                      │           ├─ S8 Security
│                    └─ S6 Unify UserRepository                      │           │
├─ S7 Extension PKCE wire (cần S4) ── S9 Extension UI                │           │
├─ S12 Entra app registration (cần S1)                              │           │
├─ S10 Test planning (cần S3,S4,S5,S6,S7)                           │           │
└─ S11 Docs (cần S1–S9)                                             ┘           ┘
```

---

## 4. Quyết định đã CHỐT

1. **Access group mặc định** cho user JIT signup qua SSO: **`grp-viewer`**.
2. **Account linking:** chỉ link local↔SSO khi Entra trả **`email_verified=true`**; nếu `email_verified=false` → từ chối, không auto-link.
3. **HYBRID:** **KHÔNG cho phép** — mỗi user chỉ là LOCAL hoặc SSO. User LOCAL login SSO chỉ được link (giữ nguyên loại), không tạo account song song.

## 5. Ghi chú hạ tầng (đã giải quyết)

- **Jira tools chạy in-process trong extension** (`extension/src/mcp/atlassian/`), đăng ký như local tools vào WrapperServer (MCP endpoint `http://127.0.0.1:9181/mcp`), gọi trực tiếp theo tên (`jira_create_issue`, `jira_search`, …) hoặc qua `execute_dynamic_tool`. Không cần Jira MCP child server riêng.
- **Blocker ban đầu:** `Atlassian credentials not configured` — credentials (baseUrl/email/apiToken) lưu trong VS Code SecretStorage, nạp qua **Settings → Atlassian Connection**. Sau khi user cấu hình, `jira_get_myself` xác nhận "Connected as Duc Nguyen Minh" (`jiraassist.atlassian.net`) và toàn bộ ticket được tạo thật.
- **Issue types thực tế** của SA4E: Epic (10378), Task (10379), Story (10380), Bug, Feature, Subtask. Project là team-managed (software, simplified) → epic link dùng field `parent`.
- **Trạng thái:** tất cả ticket giữ **To Do** (không transition — đúng planning-only).
