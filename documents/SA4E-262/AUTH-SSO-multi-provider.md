# Auth / SSO — Multi-Provider Reference (Entra + Google + GitHub)

## Document Information
| Field | Value |
|-------|-------|
| Ticket | SA4E-312 (Story S-F — Documentation) |
| Epic | SA4E-262 — Multi-Provider SSO |
| Author | QA Agent |
| Date | 2026-09-20 |
| Version | 1.0 |
| Related | MULTI-PROVIDER-SSO-PLAN.md, SECURITY-REVIEW-multi-provider.md, STP/STC-multi-provider.md |

This document describes the multi-provider SSO subsystem after Stories S-A..S-E (SA4E-307..311). It is the authoritative reference for how the three providers differ, how each is configured, and the account-linking policy after SEC-01.

---

## 1. Overview

SSO is implemented with the **Strategy pattern**: each provider is a `SsoProviderStrategy` registered in the `SsoStrategyRegistry`. Adding a new provider means adding one strategy class + registering it — the core login/callback flow is untouched.

```
Login flow (generic)
  Extension/Login panel → GET /auth/sso/providers            (list enabled providers)
  User selects provider  → authorize URL (strategy.buildAuthorizeUrl)
  IdP consent            → redirect back with ?code&state
  Callback route         → registry.get(provider).handleCallback(...)
                            → NormalizedProfile
                            → JitProvisioningService.provision(profile)
                            → session issued (rotated), token returned to loopback/redirect
```

All strategies normalize their provider-specific payload into a single shape:

```ts
interface NormalizedProfile {
  provider: string;           // 'entra' | 'google' | 'github'
  externalSubjectId: string;  // Entra oid / Google sub / GitHub numeric id (stringified)
  email: string;
  emailVerified: boolean;
  name: string;
  groups?: string[];          // Entra only; ignored for Google/GitHub
}
```

---

## 2. The three providers

| Aspect | Entra (MS AD) | Google | GitHub |
|--------|---------------|--------|--------|
| Protocol | OIDC + PKCE | OIDC + PKCE | OAuth2 (**non-OIDC**) |
| Identity material | `id_token` (JWT RS256) | `id_token` (JWT RS256) | opaque `access_token` |
| Verification | JWKS-by-kid + issuer + audience + exp + **nonce** | Google JWKS + issuer (`https://accounts.google.com`) + audience + exp + **nonce** | Call `GET /user` + `GET /user/emails` (no JWT to verify) |
| PKCE | ✅ S256 | ✅ S256 | ❌ not used |
| Nonce | ✅ | ✅ | ❌ (no id_token to bind) |
| CSRF defense | state (single-use) | state (single-use) | **state only** (compensates for no PKCE/nonce) + client_secret server-side |
| Subject id | `oid` | `sub` | numeric `id` → string |
| Email verified source | `email_verified` claim | `email_verified` claim (boolean or `"true"`) | `verified` field on primary email in `/user/emails` |
| Groups | `groups` claim (mapped) | — | — (ignored even if present) |
| Authorize endpoint | `login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize` | `accounts.google.com/o/oauth2/v2/auth` | `github.com/login/oauth/authorize` |
| Scopes | `openid profile email offline_access` | `openid email profile` | `read:user user:email` |

### 2.1 Why GitHub is different (critical)
GitHub OAuth2 is **not OIDC**: there is no `id_token` and no JWKS. The strategy therefore:
1. Exchanges `code` → opaque `access_token` at `POST /login/oauth/access_token`.
2. Calls `GET https://api.github.com/user` for `id`, `login`, `name` (email may be `null` if private).
3. Calls `GET https://api.github.com/user/emails` and selects the **primary + verified** email.
4. Rejects (`email_not_verified`) if no verified email exists.

Because there is no nonce/PKCE, GitHub relies on **single-use `state`** for CSRF protection and keeps the `client_secret` strictly server-side (never in the browser).

---

## 3. Sequence differences: OIDC vs OAuth2

### 3.1 OIDC (Entra / Google) — id_token path
```
buildAuthorizeUrl: generate state + nonce + PKCE (verifier/challenge S256)
  → authorize URL includes code_challenge, code_challenge_method=S256, nonce, state

callback(code, state):
  1. validate state (single-use), retrieve stored { nonce, codeVerifier }
  2. POST token endpoint with code + code_verifier  → { id_token, access_token }
  3. verify id_token: JWKS-by-kid, RS256, issuer, audience, exp
  4. assert id_token.nonce === stored nonce   (else invalid_nonce)
  5. normalize → NormalizedProfile (sub/oid, email, email_verified, name[, groups])
```

### 3.2 OAuth2 non-OIDC (GitHub) — userinfo path
```
buildAuthorizeUrl: generate state only (no PKCE, no nonce)
  → authorize URL includes scope, state

callback(code, state):
  1. assert state === stored state           (CSRF; else invalid_state — before any network call)
  2. POST /login/oauth/access_token          → { access_token }   (else token_exchange_failed)
  3. GET /user                               → id, login, name (email maybe null)
  4. GET /user/emails                        → pick primary + verified email
  5. reject if no verified email             (email_not_verified)
  6. normalize → NormalizedProfile (id→externalSubjectId, email, verified→emailVerified, name/login)
```

---

## 4. Per-provider configuration (`sso_providers` table)

All providers read their config from the `sso_providers` table (managed via Admin UI), **never from env** for DB-configured providers. Secrets are masked (`***`) in the admin GET response and a PUT will not overwrite with the mask.

| Column | Entra | Google | GitHub |
|--------|-------|--------|--------|
| `provider_type` | `entra` | `google` | `github` |
| `client_id` | app (client) id | `*.apps.googleusercontent.com` | GitHub OAuth app client id |
| `client_secret` | app secret | Google client secret | GitHub client secret |
| `tenant_id` | Entra tenant GUID | — | — |
| `redirect_uri` | `/auth/entra/callback` | `/auth/google/callback` | `/auth/github/callback` |
| `scopes` | `openid profile email offline_access` | `openid email profile` (default if empty) | `read:user user:email` |
| `enabled` | 1 to show at login | 1 | 1 |
| `login_ui_html` | optional custom button markup | optional | optional |

> Note: Entra additionally supports env-based config for the legacy route; DB-backed multi-provider config is the forward path. Google config loading is validated by `loadGoogleConfig` (errors clearly on missing row / empty `client_id` / empty `client_secret`).

---

## 5. PKCE / nonce differences (Google vs GitHub)

| | Google | GitHub |
|--|--------|--------|
| PKCE | **Yes** — `code_verifier` generated, `code_challenge` (S256) in authorize URL, `code_verifier` sent in token exchange | **No** — GitHub OAuth2 does not require PKCE |
| Nonce | **Yes** — random nonce in authorize URL, bound to `id_token.nonce`, mismatch → `invalid_nonce` | **No** — no id_token to bind a nonce to |
| Replay/CSRF defense | state (single-use) + nonce + PKCE | state (single-use) only, plus server-side client_secret |
| Extension PKCE | `PkceService` generates 43-char base64url verifier + S256 challenge (deterministic, unique per call) | Not used |

Practical implication: for GitHub, the **single-use state** is the sole CSRF gate at the protocol level, so it is checked **before any network call** in `handleCallback` (see TC-GH-05).

---

## 6. Account linking policy (after SEC-01)

The linking policy is uniform across all providers and enforced in `JitProvisioningService.provision()`:

1. **Existing external identity** (`external_provider` + `external_subject_id` match) → reuse the user; no create, no link.
2. **No external identity, email matches an existing account:**
   - If `emailVerified === false` → **reject** (`... linking rejected`).
   - If the existing account is `account_type === 'LOCAL'` → **reject** (SEC-01 guard):
     > `Auto-linking SSO to an existing local account is not allowed; link from account settings.`
     The account-seizing `UPDATE` is never executed. Linking a LOCAL account must be an authenticated, explicit action from account settings.
   - If the existing account is `account_type === 'HYBRID'` → **reject** (anti-HYBRID policy).
   - If the existing account is already `account_type === 'SSO'` (no external identity yet) → **link** allowed.
3. **No match** → **create** a new SSO user with default group `grp-viewer`. Entra `groups` are mapped; Google/GitHub groups are ignored.

### SEC-01 rationale
Before the guard, a first SSO login onto a pre-existing LOCAL email silently converted it to `account_type='SSO'` and handed control to the SSO identity — an account-takeover vector across trust domains (a provider asserting `email_verified=true` for an address it doesn't truly own). The guard removes silent auto-absorption of LOCAL accounts. This is a **documented product decision** and the UAT gate for the epic (see STP §9 M-8).

---

## 7. Session & redirect security (summary)
- **Session rotation** on every SSO login (rotate/invalidate before issuing new) — session-fixation defense.
- **Loopback redirect** for the desktop extension is constrained to exactly `http://127.0.0.1:<port>/callback` (rejects https, `localhost`, `::1`, lookalike hosts, non-`/callback` paths). The session token is only ever appended to this narrow shape.
- Cookies: `HttpOnly` set; `Secure` currently gated on `NODE_ENV` (SEC-04 — verify prod config); `SameSite=Lax`.
- See SECURITY-REVIEW-multi-provider.md for the full finding set (0 Critical; SEC-01 resolved).

---

## 8. Extending with a new provider
1. Create `XProviderStrategy implements SsoProviderStrategy` (own file, ≤200 lines).
2. Put provider-specific models (claims/profile) under `auth/models/`.
3. For OIDC: reuse PKCE + nonce + JWKS verify. For non-OIDC: implement a userinfo-based `handleCallback`.
4. Register in `SsoStrategyRegistry`.
5. Add a `sso_providers` row (Admin UI).
6. No change to `sso-dynamic.ts` dispatch, `JitProvisioningService`, session, or UI list logic.
