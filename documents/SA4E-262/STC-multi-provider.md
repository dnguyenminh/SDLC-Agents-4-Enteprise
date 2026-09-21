# Software Test Cases (STC) — Multi-Provider SSO

## Document Information
| Field | Value |
|-------|-------|
| Ticket | SA4E-312 (Story S-F) |
| Epic | SA4E-262 — Multi-Provider SSO (Entra + Google + GitHub) |
| Author | QA Agent |
| Date | 2026-09-20 |
| Version | 1.0 |
| Related | STP-multi-provider.md, SECURITY-REVIEW-multi-provider.md |

**Legend — Automation status**
- ✅ **Automated** — a real test exists (file:case cited); runs in `npm test`.
- 🟡 **Partial** — logic automated, full flow needs UAT.
- 🧪 **Manual/UAT** — validated by a human during UAT (live IdP / visual / deployment-dependent).

---

## 1. Google OIDC id_token verification

| ID | Description | Preconditions | Steps | Expected result | Status | Evidence |
|----|-------------|---------------|-------|-----------------|--------|----------|
| TC-GOOGLE-01 | Authorize URL has Google endpoint + PKCE S256 | Google config (mocked) enabled | 1. `strategy.buildAuthorizeUrl({state})` | URL origin `accounts.google.com`, path `/o/oauth2/v2/auth`, `code_challenge_method=S256`, `scope=openid email profile`, `state`, `nonce`, `code_challenge` present | ✅ | `GoogleProviderStrategy.test.ts` → "builds authorize URL ... PKCE S256"; `google-oauth.it.test.ts` → same |
| TC-GOOGLE-02 | Random state + fresh challenge per call | — | 1. Call buildAuthorizeUrl twice | states differ, challenges differ | ✅ | `GoogleProviderStrategy.test.ts` → "generates a random state + fresh challenge"; IT → "generates a random state" |
| TC-GOOGLE-03 | **Valid** id_token → NormalizedProfile | Mock token endpoint returns signed id_token, matching nonce | 1. buildAuthorizeUrl 2. handleCallback(code, codeVerifier, nonce) | profile `provider=google`, `externalSubjectId=sub`, email, `emailVerified=true`, name | ✅ | `google-oauth.it.test.ts` → "exchanges code, verifies id_token + nonce"; UT → "normalizes verified Google claims" |
| TC-GOOGLE-04 | **Bad issuer** → reject | Signed token with `iss=evil` | handleCallback | throws `issuer_mismatch` | ✅ | `google-oauth.it.test.ts` → "rejects a token with a wrong issuer" |
| TC-GOOGLE-04b | **Forged/tampered signature** → reject | id_token signed by a non-JWKS key | handleCallback | verification fails (fail-closed) | 🧪 | No dedicated automated case; JWKS-by-kid RS256 verify confirmed in SECURITY-REVIEW. UAT confirm |
| TC-GOOGLE-05 | **Expired** id_token → reject | id_token with `exp` in the past | handleCallback | rejected (`exp` check, fail-closed) | 🧪 | `exp` check confirmed (SEC-08) but no dedicated `it`; UAT/explicit case |
| TC-GOOGLE-06 | **Bad audience** → reject | Signed token `aud=someone-else` | handleCallback | throws `audience_mismatch` | ✅ | `google-oauth.it.test.ts` → "rejects a token with a wrong audience" |
| TC-GOOGLE-07 | **Nonce mismatch** → reject | token nonce ≠ client nonce | handleCallback(nonce=different) | throws `invalid_nonce` | ✅ | `google-oauth.it.test.ts` → "rejects ... mismatched nonce"; UT → "rejects callback when nonce does not match" |
| TC-GOOGLE-08 | `email_verified=false` surfaced for JIT reject | Signed token `email_verified=false` | handleCallback | `profile.emailVerified=false` (JIT then rejects) | ✅ | `google-oauth.it.test.ts` → "surfaces email_verified=false"; UT → string "true"/missing handling |
| TC-GOOGLE-09 | Token endpoint non-2xx → fail | Mock fetch 400 | handleCallback | throws `token_exchange_failed` | ✅ | UT + IT → "token_exchange_failed" |
| TC-GOOGLE-10 | Malformed token response (no id_token) → fail | Mock returns only access_token | handleCallback | throws `token_exchange_failed` | ✅ | `GoogleProviderStrategy.test.ts` → "malformed (no id_token)" |
| TC-GOOGLE-11 | `code_verifier` sent in exchange (PKCE) | — | handleCallback; inspect request body | body has `code_verifier`, `grant_type=authorization_code`, `code` | ✅ | `GoogleProviderStrategy.test.ts` → "sends code_verifier in the token exchange" |
| TC-GOOGLE-UAT | Full interactive Google login | Real Google OAuth client | Browser consent → callback → session | User logged in, `external_provider=google` | 🧪 | UAT M-1 |

## 2. Google config loader (from `sso_providers`, never env)

| ID | Description | Steps | Expected | Status | Evidence |
|----|-------------|-------|----------|--------|----------|
| TC-GCFG-01 | Maps full google row to config | Mock row | `{clientId, clientSecret, redirectUri, scopes[]}` | ✅ | `GoogleProviderConfig.test.ts` → "maps a fully configured google row" |
| TC-GCFG-02 | Defaults scopes when empty | Mock row scopes="" | `['openid','email','profile']` | ✅ | → "defaults scopes ..." |
| TC-GCFG-03 | Query uses `provider_type='google'` + `enabled=1` | Call loader | SQL contains those clauses, args `['google']` | ✅ | → "queries provider_type=google and enabled=1" |
| TC-GCFG-04 | No enabled provider → error | Mock undefined | throws `GoogleConfigError` "no enabled google provider" | ✅ | → "throws when no enabled google provider" |
| TC-GCFG-05 | Empty client_id → specific error | Mock client_id="  " | throws /client_id/ | ✅ | → "throws ... when client_id is empty" |
| TC-GCFG-06 | Empty client_secret → specific error | Mock client_secret="" | throws /client_secret/ | ✅ | → "throws ... when client_secret is empty" |

## 3. GitHub OAuth2 (non-OIDC) userinfo

| ID | Description | Preconditions | Steps | Expected | Status | Evidence |
|----|-------------|---------------|-------|----------|--------|----------|
| TC-GH-01 | Authorize URL: GitHub endpoint, scope, state, **no PKCE/nonce** | github config (mocked) | buildAuthorizeUrl({state}) | origin+path `github.com/login/oauth/authorize`, `scope=read:user user:email`, `state`, no `code_challenge`, `codeVerifier`/`nonce` undefined | ✅ | `GitHubProviderStrategy.test.ts` → "builds authorize URL ... (no PKCE/nonce)" |
| TC-GH-02 | Generates state when none supplied | — | buildAuthorizeUrl() | state length > 0 | ✅ | → "generates a state when the caller does not supply one" |
| TC-GH-03 | `/user` email null → fall back to `/user/emails`, pick primary+verified | fetch seq: token, /user(email null), /user/emails | handleCallback | `provider=github`, `externalSubjectId='4242'`, `email=primary@x.com`, `emailVerified=true`, name→login `octocat` | ✅ | → "normalizes profile using primary+verified email from /user/emails" |
| TC-GH-04 | No verified email → reject | /user/emails all unverified | handleCallback | throws `email_not_verified` | ✅ | → "rejects when no verified email exists" |
| TC-GH-05 | **State/CSRF mismatch** → reject before network | state ≠ storedState.state | handleCallback | throws `invalid_state`, fetch NOT called | ✅ | → "rejects on CSRF state mismatch before any network call" |
| TC-GH-06 | Token endpoint error → fail | fetch token 401 | handleCallback | throws `token_exchange_failed` | ✅ | → "throws token_exchange_failed when ... errors" |
| TC-GH-07 | Uses `/user` name when present | /user has name | handleCallback | `name='Octo Cat'` | ✅ | → "uses name when /user provides one" |
| TC-GH-UAT | Full interactive GitHub login | Real GitHub OAuth app | Browser → callback → session | logged in, `external_provider=github` | 🧪 | UAT M-2 |

## 4. JIT provisioning + account linking (incl. SEC-01)

| ID | Description | Preconditions | Steps | Expected | Status | Evidence |
|----|-------------|---------------|-------|----------|--------|----------|
| TC-JIT-01 | Create new SSO user (Entra claims) | no existing identity/email | provision(entra claims) | created=true, linked=false, INSERT provider=`entra`, subject=`oid123` | ✅ | `JitProvisioningService.test.ts` → "creates new SSO user ... Entra claims" |
| TC-JIT-02 | Create new user (Google profile) | none existing | provision(google profile) | created=true, INSERT provider=`google`, subject=`google-sub-999` | ✅ | → "provisions new user with Google NormalizedProfile" |
| TC-JIT-03 | Create new user (GitHub) + ignore groups | none existing | provision(github profile groups=[Admin]) | group=`grp-viewer`, provider=`github` (Admin group ignored) | ✅ | → "provisions new user with GitHub NormalizedProfile and ignores groups" |
| TC-SEC-01 | **SEC-01: reject auto-link SSO → LOCAL account** | email matches existing `account_type=LOCAL` | provision(google profile, verified) | throws "Auto-linking SSO to an existing local account is not allowed; link from account settings."; UPDATE not run | ✅ | → "rejects auto-link to LOCAL account (SEC-01 account takeover guard)" |
| TC-JIT-04 | Link existing **SSO**-type account (no external identity yet) | account_type=SSO, no external id | provision(google, verified) | created=false, linked=true, UPDATE external_provider=google | ✅ | → "links existing SSO-type account without external identity" |
| TC-JIT-05 | Existing external identity → reuse, no re-create | matching provider+subject | provision(github) | created=false, linked=false, returns existing user | ✅ | → "returns existing SSO identity without re-creating" |
| TC-JIT-06 | Reject create when email not verified (Entra) | none existing, email_verified=false | provision(entra) | throws "Email not verified by Entra ID; JIT provisioning rejected" | ✅ | → "rejects JIT provision when email not verified" |
| TC-JIT-07 | Reject create when email not verified (Google) | none existing, emailVerified=false | provision(google) | throws "Email not verified by google; JIT provisioning rejected" | ✅ | → "rejects Google JIT provision when email not verified" |
| TC-JIT-07b | Reject link when email not verified | existing LOCAL, email_verified=false | provision(entra) | throws "Email not verified by Entra ID; linking rejected" | ✅ | → "rejects linking when email not verified" |
| TC-JIT-08 | Anti-HYBRID: reject linking HYBRID account | existing account_type=HYBRID | provision(entra, verified) | throws "Invalid account_type HYBRID - HYBRID not allowed" | ✅ | → "rejects linking HYBRID account" |
| TC-SEC-01-UAT | SEC-01 user-facing E2E | LOCAL account exists | SSO login onto that email | blocked with clear message; link only via settings | 🧪 | UAT M-8 |

## 5. Entra (regression — flow unchanged)

| ID | Description | Steps | Expected | Status | Evidence |
|----|-------------|-------|----------|--------|----------|
| TC-ENTRA-01 | Authorize URL with PKCE | buildAuthorizeUrl({state}) | Microsoft endpoint, `code_challenge_method=S256`, state, nonce | ✅ | `EntraProviderStrategy.test.ts` → "builds authorize URL with PKCE"; `entra-oauth.it.test.ts` → login URL |
| TC-ENTRA-02 | SSO disabled → throw | delete SSO_ENABLED; buildAuthorizeUrl | throws "SSO not enabled" | ✅ | → "throws error when SSO is not enabled" |
| TC-ENTRA-03 | Callback success → NormalizedProfile | mock token + verifier | profile provider=entra, subject=oid, groups | ✅ | → "handles callback successfully"; `.state.test.ts` → state round-trip |
| TC-ENTRA-04 | SEC-09: string "false" email_verified → NOT verified | claim email_verified="false" | `emailVerified=false` | ✅ | → "treats string \"false\" email_verified as NOT verified" |
| TC-ENTRA-05 | Nonce mismatch / token endpoint fail → reject | mismatched nonce / fetch 400 | `invalid_nonce` / `token_exchange_failed` | ✅ | → "rejects ... invalid_nonce", "throws when token endpoint fails" |
| TC-ENTRA-06 | Callback param validation (route) | missing state/code/unknown state | 400 invalid_request / invalid_state | ✅ | `entra-oauth.it.test.ts` → callback validation suite |
| TC-ENTRA-UAT | Full interactive Entra login | real tenant | logged in | 🧪 | UAT M-3 |

## 6. Strategy registry

| ID | Description | Expected | Status | Evidence |
|----|-------------|----------|--------|----------|
| TC-REG-01 | Register + retrieve case-insensitive | get('google')/get('GOOGLE') same instance | ✅ | `SsoStrategyRegistry.test.ts` → "registers and retrieves ... case-insensitively" |
| TC-REG-02 | Unknown provider → undefined | has/get('unknown') falsy | ✅ | → "returns undefined for unregistered provider" |
| TC-REG-03 | List provider types | contains google, github | ✅ | → "lists registered provider types" |
| TC-REG-04 | Clear all | list empty after clear | ✅ | → "clears all registered strategies" |
| TC-REG-05 | Singleton getInstance | inst1===inst2 | ✅ | → "maintains singleton instance" |

## 7. State / CSRF / nonce (cross-cutting)

| ID | Description | Expected | Status | Evidence |
|----|-------------|----------|--------|----------|
| TC-STATE-01 | GitHub state mismatch rejected pre-network | invalid_state, no fetch | ✅ | TC-GH-05 |
| TC-STATE-02 | Entra route state missing/unknown → 400 | invalid_request / invalid_state | ✅ | TC-ENTRA-06 |
| TC-NONCE-01 | OIDC nonce binding (Google/Entra) | invalid_nonce on mismatch | ✅ | TC-GOOGLE-07, TC-ENTRA-05 |

## 8. Session

| ID | Description | Expected | Status | Evidence |
|----|-------------|----------|--------|----------|
| TC-SESS-01 | Session rotated on every SSO login (fixation defense) | prior session invalidated before new issued | 🧪 | Implementation confirmed in SECURITY-REVIEW (rotate before issue); no dedicated automated SSO test → UAT M-6 |

## 9. Extension PKCE (S256)

| ID | Description | Expected | Status | Evidence |
|----|-------------|----------|--------|----------|
| TC-PKCE-01 | Verifier length 43 | length===43 | ✅ | `pkce-service.test.ts` → "expected length" |
| TC-PKCE-02 | Verifier base64url charset | matches charset (x50) | ✅ | → "only base64url characters" |
| TC-PKCE-03 | Distinct verifiers | 100 unique | ✅ | → "distinct verifiers across calls" |
| TC-PKCE-04 | S256 challenge matches node crypto | equals sha256 base64url | ✅ | → "derives the same S256 challenge" |
| TC-PKCE-05 | 43-char challenge, no padding | length 43, no "=" | ✅ | → "43-char challenge in base64url" |
| TC-PKCE-06 | Deterministic per verifier | same challenge | ✅ | → "is deterministic" |
| TC-PKCE-07 | Different verifiers → different challenges | differ | ✅ | → "produces different challenges" |

## 10. UI provider selection (extension)

| ID | Description | Steps | Expected | Status | Evidence |
|----|-------------|-------|----------|--------|----------|
| TC-UI-01 | List enabled providers from `/auth/sso/providers` | mock 200 providers[] | returns providers array, correct URL called | ✅ | `auth-manager.test.ts` → "returns enabled providers ..." |
| TC-UI-02 | Filter malformed entries (missing provider_type) | mock mixed list | only valid entries returned | ✅ | → "filters out malformed entries missing provider_type" |
| TC-UI-03 | Non-ok / network error → [] (non-fatal) | mock 500 / reject | returns [] | ✅ | → "returns [] on non-ok / network error" |
| TC-UI-04 | Invalid provider key rejected | loginSso("bad/provider") | throws AuthError, state unchanged | ✅ | → "rejects an invalid provider key" |
| TC-UI-05 | `loginEntra` alias → loginSso('entra') | loginEntra() | delegates to loginSso('entra') | ✅ | → "loginEntra delegates to loginSso('entra')" |
| TC-UI-UAT | Buttons render + interactive login completes, errors user-facing | enable providers in Admin → open login panel | buttons shown; login completes; status bar reflects auth | 🧪 | UAT M-4, M-5 |

## 11. Loopback redirect (token exfiltration guard)

| ID | Description | Input | Expected | Status | Evidence |
|----|-------------|-------|----------|--------|----------|
| TC-LOOP-01 | Accept `127.0.0.1:<port>/callback` | `http://127.0.0.1:8765/callback` | true | ✅ | `entra-loopback-redirect.test.ts` → "accepts ... exact extension contract" |
| TC-LOOP-02 | Reject undefined/empty/malformed | `undefined`,``,`not a url` | false | ✅ | → "rejects undefined / empty / malformed" |
| TC-LOOP-03 | Reject https scheme | `https://127.0.0.1:8765/callback` | false | ✅ | → "rejects https scheme" |
| TC-LOOP-04 | Reject localhost / ::1 | `localhost`, `[::1]` | false | ✅ | → "rejects localhost and ::1" |
| TC-LOOP-05 | Reject non-/callback paths | `/`, `/steal` | false | ✅ | → "rejects non-/callback paths" |
| TC-LOOP-06 | Reject non-loopback hosts / lookalikes | `evil.com`, `127.0.0.1.evil.com`, `10.0.0.1`, `/admin` | false | ✅ | → "rejects non-loopback hosts", "internal app paths" |

---

## Summary
| Category | Automated (✅/🟡) | Manual/UAT (🧪) |
|----------|-------------------|-----------------|
| Google OIDC verify | 9 | 3 (forged, expired, full login) |
| Google config | 6 | 0 |
| GitHub OAuth2 | 7 | 1 |
| JIT + SEC-01 | 10 | 1 |
| Entra regression | 6 | 1 |
| Registry | 5 | 0 |
| State/CSRF/nonce | 3 | 0 |
| Session | 0 | 1 |
| PKCE | 7 | 0 |
| UI selection | 5 | 1 |
| Loopback | 6 | 0 |
| **Total** | **64** | **9** |

Manual/UAT cases correspond to STP §9 (M-1..M-10).
