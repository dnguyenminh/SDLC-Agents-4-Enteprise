# Software Test Plan (STP) — Multi-Provider SSO

## Document Information
| Field | Value |
|-------|-------|
| Ticket | SA4E-312 (Story S-F — QA Test Planning) |
| Epic | SA4E-262 — Multi-Provider SSO (Entra + Google + GitHub) |
| Stories covered | SA4E-307 (S-A), SA4E-308 (S-B), SA4E-309 (S-C), SA4E-310 (S-D), SA4E-311 (S-E) |
| Phase | Test Planning — last gate before UAT |
| Author | QA Agent |
| Date | 2026-09-20 |
| Version | 1.0 |
| Related docs | MULTI-PROVIDER-SSO-PLAN.md, SECURITY-REVIEW-multi-provider.md, STC-multi-provider.md |

> **Evidence-based:** This plan's RTM maps every acceptance criterion to a **real** test that exists in the repo (verified by reading the test files on 2026-09-20). Where an AC has no automated test, it is explicitly marked **manual/UAT**. No coverage is invented.

---

## 1. Introduction & Objective

The multi-provider SSO feature extends the SSO subsystem from a single Entra (Microsoft AD) provider to **three providers** using the Strategy pattern:

| Provider | Protocol | Identity token | Verify method |
|----------|----------|----------------|---------------|
| **Entra (MS AD)** | OIDC + PKCE (S256) | `id_token` (JWT RS256) | JWKS + issuer + audience + exp + nonce |
| **Google** | OIDC + PKCE (S256) | `id_token` (JWT RS256) | Google JWKS + issuer + audience + exp + nonce |
| **GitHub** | OAuth2 (**non-OIDC**) | opaque `access_token` | `GET /user` + `GET /user/emails` (userinfo API) |

**Objective of this test cycle:** validate that all three provider login flows, JIT provisioning, the SEC-01 account-linking policy, session handling, and UI provider selection behave per the acceptance criteria of SA4E-307..311, and confirm which items are automated vs. must be validated manually during UAT.

---

## 2. Scope

### 2.1 In Scope
- **Login flows** for Entra, Google (OIDC + PKCE) and GitHub (OAuth2, non-OIDC): authorize URL generation, code exchange, token/profile verification, callback handling.
- **Token/profile verification**: Google `id_token` (valid / forged signature / bad issuer / bad audience / expired / nonce mismatch); GitHub userinfo (`/user` + `/user/emails`), email verified vs. unverified resolution.
- **JIT provisioning**: create new SSO user, reuse existing external identity, default group `grp-viewer`, provider-agnostic (`entra`/`google`/`github`), GitHub groups ignored.
- **Account linking policy incl. SEC-01**: reject auto-link of an SSO login onto a pre-existing **LOCAL** account (account-takeover guard); allow link only for already-SSO accounts; email-verified gate; anti-HYBRID.
- **State / CSRF**: single-use state; GitHub state mismatch rejection; nonce binding for OIDC providers.
- **Session**: session rotation on every SSO login (session-fixation defense).
- **Loopback redirect**: constrained accepted shape (`http://127.0.0.1:<port>/callback`) and exfiltration/open-redirect rejection.
- **UI provider selection**: extension lists enabled providers from `/auth/sso/providers`, filters malformed entries, renders provider buttons; invalid provider key rejected.
- **PKCE mechanics**: verifier/challenge generation (S256) on the extension side.
- **Documentation**: multi-provider auth-sso doc (sequence differences, per-provider config, PKCE/nonce differences, linking policy after SEC-01).

### 2.2 Out of Scope
- Live end-to-end against real Google/GitHub/Entra tenants with real credentials (belongs to UAT — see §9).
- Dynamic penetration testing against a running instance (covered separately; static security review = SECURITY-REVIEW-multi-provider.md).
- Dependency CVE scan (`npm audit`) — tracked as a separate gate per SECURITY-REVIEW §Scope Limitations.
- Admin UI CRUD for `sso_providers` beyond config loading (pre-existing, not part of this epic's new ACs).
- Non-blocking hardening items SEC-02..SEC-10 remediation verification (tracked post-UAT).

---

## 3. Test Levels Applied

| Level | Applied? | Where | Tooling |
|-------|----------|-------|---------|
| **Unit (UT)** | ✅ Yes | `backend/src/server/auth/strategies/__tests__/`, `backend/src/server/services/__tests__/`, `backend/tests/unit/`, `extension/src/auth/__tests__/` | Vitest |
| **Integration (IT)** | ✅ Yes | `backend/tests/integration/` (`google-oauth.it.test.ts`, `entra-oauth.it.test.ts`) | Vitest + `jose` (real RSA keypair + in-memory JWKS) |
| **E2E-API** | ⚠️ Partial | `entra-oauth.it.test.ts` drives the Entra routes end-to-end through Hono; Google/GitHub route-level E2E is exercised via strategy-through-registry integration | Vitest + Hono `app.request` |
| **E2E-UI** | ❌ Manual | Provider button render + full interactive login flow → **UAT** | Manual (VS Code/Kiro extension) |
| **SIT (system integration)** | ❌ Manual | Real provider tenants, live redirect + session cookie in browser | Manual → UAT |

**Rationale:** Because the OAuth2/OIDC flows require live IdP interaction (real browser redirect + provider consent), full E2E-UI/SIT cannot be automated without live credentials and are therefore assigned to UAT. All deterministic logic (URL building, token/profile verification, JIT policy, state/nonce, session rotation, loopback gating) is covered by automated UT/IT.

---

## 4. Test Environment

| Component | Configuration |
|-----------|---------------|
| Runtime | Node.js (backend) / VS Code Extension Host (extension) |
| Test runner | Vitest (`npm test` in `backend/` and `extension/`) |
| DB | Mocked (`vi.mock` on config/admin-db) for UT; in-memory / adapter stub for JIT tests — **no live DB required** |
| Crypto | Integration tests generate a local RSA keypair via `jose.generateKeyPair('RS256')` and serve an in-memory JWKS (no network) |
| Network | All `fetch` calls stubbed (`vi.stubGlobal('fetch', ...)`) — token endpoints, `/user`, `/user/emails`, JWKS mocked |
| Secrets | Provider client_id/secret/redirect loaded from mocked `sso_providers` rows; extension secrets via in-memory `SecretStorage` mock |
| UAT env | Staging deployment with real Entra tenant + Google OAuth client + GitHub OAuth app, `NODE_ENV=production`, TLS terminated |

---

## 5. Entry Criteria

- SA4E-307..311 implemented, TA-approved, and merged to the feature branch.
- Security static review complete (SECURITY-REVIEW-multi-provider.md): **0 Critical**, SEC-01 (High) resolved via the "no auto-link to LOCAL" guard.
- Backend + extension build succeeds.
- Existing SSO regression suite green (Entra flow unchanged).

## 6. Exit Criteria

- **100% of new ACs (SA4E-307..311) traced** in the RTM to either an automated test (pass) or an explicit manual/UAT case.
- All automated SSO tests pass (per the reported 157 backend + 38 extension tests green).
- No open Critical/High security finding without a documented decision (SEC-01 resolved & documented).
- Manual/UAT case list (§9) reviewed and scheduled for UAT.
- Documentation updated (auth-sso multi-provider section) and BA-approved.

---

## 7. Requirements Traceability Matrix (RTM)

> Each AC below is taken from MULTI-PROVIDER-SSO-PLAN.md §4 (Stories S-A..S-E). "Test evidence" cites the **actual** test file + the specific `it(...)` case verified on 2026-09-20. STC IDs cross-reference STC-multi-provider.md.

### 7.1 SA4E-307 (S-A) — Strategy abstraction + registry + Entra refactor

| AC | Description | STC ID | Test evidence (real file → case) | Level | Status |
|----|-------------|--------|----------------------------------|-------|--------|
| S-A/1 | Entra login/callback works as before (regression) | TC-ENTRA-01..05 | `strategies/__tests__/EntraProviderStrategy.test.ts` → "builds authorize URL with PKCE", "handles callback successfully", "invalid_nonce", "token endpoint fails"; `EntraProviderStrategy.state.test.ts` → "accepts callback with state and storedState"; `integration/entra-oauth.it.test.ts` → login URL + callback validation (invalid_request/invalid_state) | UT + IT | ✅ Automated |
| S-A/2 | `JitProvisioningService` not hardcoded to `entra`; unit test for google/github (mock profile) | TC-JIT-02, TC-JIT-03 | `services/__tests__/JitProvisioningService.test.ts` → "provisions new user with Google NormalizedProfile" (asserts provider=`google`), "provisions new user with GitHub NormalizedProfile and ignores groups" (provider=`github`, group=`grp-viewer`) | UT | ✅ Automated |
| S-A/3 | New provider = add 1 strategy + register, no core flow change | TC-REG-01..05 | `strategies/__tests__/SsoStrategyRegistry.test.ts` → register/retrieve case-insensitive, undefined for unknown, list types, clear, singleton | UT | ✅ Automated |
| S-A/4 | Code standards (≤200 lines/file, 1 strategy/file, models separate) | — | Static/standards review (RUN-LOG) — no dedicated runtime test | Review | ⚠️ Manual (review) |

### 7.2 SA4E-308 (S-B) — Google SSO (OIDC + PKCE)

| AC | Description | STC ID | Test evidence (real file → case) | Level | Status |
|----|-------------|--------|----------------------------------|-------|--------|
| S-B/1 | Google login → authorize → callback → JIT create/link, `account_type=SSO`, `external_provider='google'` | TC-GOOGLE-01, TC-GOOGLE-07, TC-JIT-02 | `strategies/__tests__/GoogleProviderStrategy.test.ts` → "builds authorize URL ... PKCE S256", "normalizes verified Google claims"; `integration/google-oauth.it.test.ts` → "exchanges code, verifies id_token + nonce, returns NormalizedProfile"; `JitProvisioningService.test.ts` → Google profile → `external_provider='google'` | UT + IT | ✅ Automated |
| S-B/2 | Forged / bad issuer / bad audience / expired / nonce mismatch → reject | TC-GOOGLE-03..06 | `integration/google-oauth.it.test.ts` → "rejects ... mismatched nonce", "wrong issuer" (`issuer_mismatch`), "wrong audience" (`audience_mismatch`), "token_exchange_failed on non-2xx"; `GoogleProviderStrategy.test.ts` → "rejects callback when nonce does not match", "token_exchange_failed ... non-2xx", "malformed (no id_token)" | UT + IT | ✅ Automated (see §7.6 note on expired/forged-signature) |
| S-B/3 | `email_verified=false` → reject link | TC-GOOGLE-08, TC-JIT-07 | `google-oauth.it.test.ts` → "surfaces email_verified=false so the JIT policy can reject"; `JitProvisioningService.test.ts` → "rejects Google JIT provision when email not verified" | UT + IT | ✅ Automated |
| S-B/4 | Integration test for login URL + callback (mock token endpoint + JWKS) | TC-GOOGLE-01,02,07 | `integration/google-oauth.it.test.ts` (whole suite: real jose verify against in-memory JWKS) | IT | ✅ Automated |

### 7.3 SA4E-309 (S-C) — GitHub SSO (OAuth2, non-OIDC)

| AC | Description | STC ID | Test evidence (real file → case) | Level | Status |
|----|-------------|--------|----------------------------------|-------|--------|
| S-C/1 | GitHub login → authorize → callback → JIT create/link, `external_provider='github'` | TC-GH-01, TC-GH-03, TC-JIT-03 | `strategies/__tests__/GitHubProviderStrategy.test.ts` → "builds authorize URL ... state (no PKCE/nonce)", "normalizes profile using primary+verified email"; `JitProvisioningService.test.ts` → GitHub profile → `external_provider='github'` | UT | ✅ Automated |
| S-C/2 | State mismatch → reject (CSRF) | TC-GH-05 | `GitHubProviderStrategy.test.ts` → "rejects on CSRF state mismatch before any network call" (asserts fetch not called) | UT | ✅ Automated |
| S-C/3 | Email not verified at GitHub → reject link | TC-GH-04, TC-JIT-07 | `GitHubProviderStrategy.test.ts` → "rejects when no verified email exists (email_not_verified)" | UT | ✅ Automated |
| S-C/4 | Integration test (mock `/login/oauth/access_token`, `/user`, `/user/emails`) | TC-GH-03,04,06,07 | `GitHubProviderStrategy.test.ts` → fetch sequence mocks the 3 endpoints ("primary+verified email", "uses name when /user provides one", "token_exchange_failed") | UT (sequenced fetch = integration-style) | ✅ Automated |
| S-C/5 | Docs: GitHub not PKCE/nonce → state + client_secret backend-side | — | Documentation (auth-sso multi-provider section, this cycle) | Doc | ✅ This cycle |

### 7.4 SA4E-310 (S-D) — Extension UI provider selection

| AC | Description | STC ID | Test evidence (real file → case) | Level | Status |
|----|-------------|--------|----------------------------------|-------|--------|
| S-D/1 | Provider enabled in Admin → button shown at login | TC-UI-01, TC-UI-02 | `extension/src/auth/__tests__/auth-manager.test.ts` → "returns enabled providers from /auth/sso/providers", "filters out malformed entries missing provider_type" | UT | ⚠️ Partial (data layer automated; **visual render → UAT**) |
| S-D/2 | Select provider → completes login, status reflected, errors user-facing | TC-UI-03, TC-UI-04 | `auth-manager.test.ts` → "rejects an invalid provider key without changing state", "loginEntra delegates to loginSso('entra')", `listSsoProviders` returns [] on non-ok/network error (non-fatal) | UT | ⚠️ Partial (logic automated; **full interactive login → UAT**) |

### 7.5 SA4E-311 (S-E) — Security multi-provider hardening

| AC | Description | STC ID | Test evidence (real file → case) | Level | Status |
|----|-------------|--------|----------------------------------|-------|--------|
| S-E/1a | No Critical findings | — | SECURITY-REVIEW-multi-provider.md → 0 Critical | Review | ✅ Done |
| S-E/1b | **SEC-01** reject auto-link SSO → pre-existing LOCAL account | TC-SEC-01 | `JitProvisioningService.test.ts` → "rejects auto-link to LOCAL account (SEC-01 account takeover guard)" (asserts UPDATE not run) + "links existing SSO-type account without external identity" | UT | ✅ Automated |
| S-E/2 | State mismatch vector | TC-GH-05 | `GitHubProviderStrategy.test.ts` → "CSRF state mismatch"; `entra-oauth.it.test.ts` → "invalid_state" | UT + IT | ✅ Automated |
| S-E/3 | Email unverified vector | TC-GOOGLE-08, TC-GH-04, TC-JIT-07 | `JitProvisioningService.test.ts` → "rejects ... email not verified" (Entra + Google), GitHub `email_not_verified` | UT + IT | ✅ Automated |
| S-E/4 | Forged/invalid token vector | TC-GOOGLE-03..06 | `google-oauth.it.test.ts` → issuer/audience/nonce/token_exchange rejections (real jose verify) | IT | ✅ Automated |
| S-E/5 | Anti-HYBRID policy | TC-JIT-08 | `JitProvisioningService.test.ts` → "rejects linking HYBRID account per anti-HYBRID policy" | UT | ✅ Automated |
| S-E/6 | Loopback redirect allowlist (no token exfiltration) | TC-LOOP-01..06 | `backend/tests/unit/entra-loopback-redirect.test.ts` → accepts `127.0.0.1:<port>/callback`; rejects https, localhost, `::1`, non-/callback, non-loopback hosts, `127.0.0.1.evil.com`, internal paths | UT | ✅ Automated |
| S-E/7 | Session rotation on every SSO login (session-fixation) | TC-SESS-01 | Implementation verified in SECURITY-REVIEW (rotate before issue); **no dedicated automated SSO-session-rotation test found** | — | ⚠️ Manual/UAT |
| S-E/8 | PKCE S256 verifier/challenge correctness (extension) | TC-PKCE-01..07 | `extension/src/auth/__tests__/pkce-service.test.ts` → verifier length/charset/uniqueness, S256 challenge matches node crypto, deterministic | UT | ✅ Automated |

### 7.6 Notes on partial verification (honesty flags)
- **Google "expired" and "forged-signature" rejection:** The integration suite proves fail-closed rejection for **issuer / audience / nonce mismatch** and **token_exchange_failed**. A dedicated `exp`-in-the-past id_token case and a tampered-signature case are **not** present as separate `it(...)` blocks; SECURITY-REVIEW confirms `exp` is checked (SEC-08: no clock-skew leeway) and RS256 JWKS-by-kid verification is fail-closed. → Marked **manual/UAT** for explicit expired + forged-signature confirmation (TC-GOOGLE-05, TC-GOOGLE-04b).
- **Entra full callback with real crypto:** `entra-oauth.it.test.ts` validates login URL + state handling + token-exchange request shape, but the final signature-verified redirect is deferred to unit tests (documented in the test file itself). Strategy-level callback is covered by `EntraProviderStrategy.test.ts`.
- **UI visual rendering (S-D):** only the data/logic layer (`listSsoProviders`, provider-key validation) is automated. The actual button rendering and click-through login are **manual/UAT**.

---

## 8. RTM Coverage Summary

| Story | ACs | Fully automated | Partial (auto + UAT) | Manual/UAT only | Traced |
|-------|-----|-----------------|----------------------|-----------------|--------|
| SA4E-307 (S-A) | 4 | 3 | 0 | 1 (standards review) | 4/4 |
| SA4E-308 (S-B) | 4 | 3 | 1 (expired/forged → UAT) | 0 | 4/4 |
| SA4E-309 (S-C) | 5 | 4 | 0 | 1 (docs — this cycle) | 5/5 |
| SA4E-310 (S-D) | 2 | 0 | 2 | 0 | 2/2 |
| SA4E-311 (S-E) | 8 | 6 | 0 | 2 (session rotation, one review) | 8/8 |
| **Total** | **23** | **16 (70%)** | **3 (13%)** | **4 (17%)** | **23/23 (100%)** |

- **Traceability coverage: 100%** — every AC maps to a real test or an explicit manual/UAT case.
- **Automated AC coverage: ~83%** (fully + partial automated = 19/23).
- **Manual/UAT-only: 4 ACs** (see §9).

---

## 9. Manual / UAT Case List (must be validated during UAT)

| # | Item | Origin AC | Why manual | STC ID |
|---|------|-----------|------------|--------|
| M-1 | Full interactive **Google** login against a real Google OAuth client (browser consent → callback → session) | S-B/1 | Requires live IdP + browser | TC-GOOGLE-UAT |
| M-2 | Full interactive **GitHub** login against a real GitHub OAuth app | S-C/1 | Requires live IdP + browser | TC-GH-UAT |
| M-3 | Full interactive **Entra** login regression against real tenant | S-A/1 | Requires live tenant | TC-ENTRA-UAT |
| M-4 | **Provider buttons render** in the extension login panel when providers enabled in Admin | S-D/1 | Visual/UX render | TC-UI-UAT |
| M-5 | **Provider selection → login completes**, status bar reflects auth, errors shown user-facing | S-D/2 | Interactive flow | TC-UI-UAT |
| M-6 | **Session rotation** observable on repeat SSO login (old session invalidated) | S-E/7 | No automated SSO-session-rotation test | TC-SESS-01 |
| M-7 | **Expired id_token** (Google) rejected; **tampered-signature** id_token rejected | S-B/2 | Not covered by a dedicated automated case | TC-GOOGLE-05, TC-GOOGLE-04b |
| M-8 | **SEC-01** end-to-end: attempt SSO login onto an existing LOCAL email → blocked with clear message; link only via account settings | S-E/1b | Confirm user-facing behavior (unit proves the guard) | TC-SEC-01-UAT |
| M-9 | Code standards review (file/function size, models separated) | S-A/4 | Static review, not runtime | — |
| M-10 | Deployment-dependent security config: cookie `Secure` on in prod, `TRUST_PROXY` correctness (SEC-03/04) | S-E hardening | Depends on deploy env | — |

---

## 10. Risks & Assumptions
- **Live-IdP items (M-1..M-3, M-8)** cannot be automated in CI without shared credentials; UAT is the correct gate.
- **SEC-01 is resolved in code** (auto-link to LOCAL rejected) and unit-tested; UAT confirms the user-facing message and the "link from settings" path.
- Non-blocking hardening (SEC-02..SEC-10) is tracked for post-UAT; none blocks this cycle.
- The reported **157 backend + 38 extension** passing tests is the regression baseline; any new failure blocks exit.

---

## 11. Deliverables
- `documents/SA4E-262/STP-multi-provider.md` (this document)
- `documents/SA4E-262/STC-multi-provider.md` (detailed test cases)
- Updated auth-sso multi-provider documentation section

---

## Appendix A — Test Files Verified (2026-09-20)
| File | Cases (`it`) | Role |
|------|-------------|------|
| `backend/src/server/auth/strategies/__tests__/EntraProviderStrategy.test.ts` | 6 | Entra strategy UT |
| `backend/src/server/auth/strategies/__tests__/EntraProviderStrategy.state.test.ts` | 1 | Entra callback state round-trip |
| `backend/src/server/auth/strategies/__tests__/GoogleProviderStrategy.test.ts` | 8 | Google strategy UT |
| `backend/src/server/auth/strategies/__tests__/GoogleProviderConfig.test.ts` | 6 | Google config loader UT |
| `backend/src/server/auth/strategies/__tests__/GitHubProviderStrategy.test.ts` | 7 | GitHub strategy UT |
| `backend/src/server/auth/strategies/__tests__/SsoStrategyRegistry.test.ts` | 5 | Registry UT |
| `backend/src/server/services/__tests__/JitProvisioningService.test.ts` | 11 | JIT provisioning + SEC-01 UT |
| `backend/tests/integration/google-oauth.it.test.ts` | 8 | Google OIDC integration (real jose/JWKS) |
| `backend/tests/integration/entra-oauth.it.test.ts` | 7 | Entra route integration |
| `backend/tests/unit/entra-loopback-redirect.test.ts` | 6 | Loopback redirect gate UT |
| `extension/src/auth/__tests__/auth-manager.test.ts` | 28 | AuthManager + listSsoProviders + loginSso UT |
| `extension/src/auth/__tests__/pkce-service.test.ts` | 7 | PKCE S256 UT |
