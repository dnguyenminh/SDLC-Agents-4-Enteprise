# 🔒 Security Assessment Report — Multi-Provider SSO Hardening

## Document Information
| Field | Value |
|-------|-------|
| Ticket | SA4E-311 (Story S-E) |
| Epic | SA4E-262 — Multi-Provider SSO (Entra + Google + GitHub) |
| Scope | Static security review of the multi-provider SSO implementation (Stories S-A..S-D, tickets 307–310) |
| Date | 2026-09-20 |
| Assessor | Security Agent |
| Methodology | Static code review (OWASP ASVS / Testing Guide), OAuth2/OIDC threat modelling (RFC 6749 §10, RFC 6819, OAuth 2.0 Security BCP) |
| Version | 1.0 |

---

## Executive Summary

The multi-provider SSO implementation refactors the original Entra flow into a clean Strategy pattern (`SsoProviderStrategy` + `SsoStrategyRegistry`) and adds Google (OIDC + PKCE) and GitHub (OAuth2, non-OIDC). Overall the security posture is **good**: PKCE S256 is enforced for OIDC providers, OIDC id_tokens are verified fail-closed (JWKS + issuer + audience + exp + nonce), state is single-use via `SsoStateStore.take()`, secrets are masked in the admin API and never read from env for DB-configured providers, GitHub email verification is enforced, sessions are rotated on every SSO login, and the loopback redirect surface is tightly constrained to `http://127.0.0.1/callback`.

The review found **no Critical vulnerabilities**. There is **1 High** finding that should be resolved or explicitly risk-accepted before UAT (cross-provider account linking / potential takeover surface), plus the previously-flagged loopback **any-port** acceptance which is assessed as **Medium** (adequately compensated). The remaining items are Medium/Low hardening improvements and defense-in-depth.

**Overall Risk Rating:** **Medium** (driven by account-linking policy + loopback any-port; both have compensating controls).

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 1 |
| 🟡 Medium | 4 |
| 🔵 Low | 4 |
| ℹ️ Informational | 3 |

**BLOCK before UAT:** SEC-01 (must be a documented, explicit product decision — not silently shipped). All others are non-blocking with the risk acceptance recorded below.

---

## Vector Checklist (per request)

| # | Vector | Result | Finding |
|---|--------|--------|---------|
| 1 | State/CSRF per provider; single-use | ✅ Pass (Google/Entra); ⚠️ GitHub defensive check weak | SEC-07 (Low) |
| 2 | PKCE S256 for OIDC; verifier not leaked | ✅ Pass | — |
| 3 | No token/secret logging; secret masked in API | ✅ Pass; ⚠️ error `detail` passthrough | SEC-05 (Medium) |
| 4 | Google id_token verify (JWKS+iss+aud+exp+nonce), fail-closed | ✅ Pass | SEC-08 (Low — exp clock skew) |
| 5 | GitHub email verification enforced | ✅ Pass | — |
| 6 | Account linking / takeover across providers | ⚠️ **Weak policy** | **SEC-01 (High)** |
| 7 | Redirect allowlist / loopback (open-redirect / token exfil) | ✅ Loopback tight; ⚠️ any-port | SEC-02 (Medium) |
| 8 | Rate limit callback per provider | ⚠️ Partial (per-IP only, in-memory) | SEC-03 (Medium) |
| 9 | Session fixation — rotate session on every login | ✅ Pass | — |
| 10 | Loopback any-port risk | ⚠️ Accepted risk | SEC-02 (Medium) |
| 11 | Extension loopback host/origin/state validation | ✅ Pass | SEC-06 (Low) |

---

## Findings by OWASP Top 10 (2021)

### A01:2021 — Broken Access Control
- SEC-01 (cross-provider account linking / takeover surface)

### A02:2021 — Cryptographic Failures
- SEC-08 (id_token exp has no clock-skew leeway — minor)

### A03:2021 — Injection
No issues found ✅ (all external payloads validated with zod `safeParse`; login panel escapes provider names via `escapeHtml`; DB access parameterized).

### A04:2021 — Insecure Design
- SEC-02 (loopback any-port), SEC-03 (rate-limit design — in-memory/per-IP only)

### A05:2021 — Security Misconfiguration
- SEC-04 (session cookie `Secure` gated on `NODE_ENV`, `SameSite=Lax` on token-bearing redirect)

### A06:2021 — Vulnerable and Outdated Components
No issues found in scope ✅ (uses `jose` for JWT verify; `fetch` native). Dependency CVE scan was out of static scope — see Scope Limitations.

### A07:2021 — Identification and Authentication Failures
- SEC-01, SEC-07 (GitHub state defensive check), SEC-09 (Entra `email_verified` trust)

### A08:2021 — Software and Data Integrity Failures
- SEC-05 (upstream error `detail` reflected to client)

### A09:2021 — Security Logging and Monitoring Failures
- SEC-10 (audit failures are swallowed to warn; no alerting on repeated rejects)

### A10:2021 — Server-Side Request Forgery (SSRF)
No issues found ✅ (token/JWKS/userinfo endpoints are fixed constants per provider; not user-controlled).

---

## Detailed Findings

### 🟠 SEC-01 — Cross-provider account linking may enable account takeover
| Attribute | Value |
|-----------|-------|
| **Severity** | High |
| **OWASP** | A01 / A07 |
| **CWE** | CWE-287 (Improper Authentication), CWE-863 (Incorrect Authorization) |
| **CVSS (est.)** | 6.5 |
| **Location** | `backend/src/server/services/JitProvisioningService.ts` (email-match branch, step 2) |
| **Status** | Open — **BLOCK before UAT (requires explicit product decision)** |

**Description:**
When no existing external identity matches, the service falls back to matching on **email** and links the incoming SSO identity to that account if `emailVerified === true`. The linking decision trusts the *incoming provider's* `email_verified` claim only. This creates a takeover path across trust domains:

- A LOCAL account `alice@gmail.com` exists (password-based). Alice's Google is the real owner of that mailbox — fine.
- But consider an attacker who controls a provider tenant or an account whose email equals a victim's, and where the provider asserts `email_verified=true` for an address it does not truly own. Historically several IdPs (and misconfigured custom/Entra tenants) have allowed unverified or attacker-settable emails. The linking policy has **no notion of which providers are trusted to assert which email domains**, so any enabled provider that returns `email_verified=true` for `victim@corp.com` will auto-link to the victim's existing account and inherit its `access_group_id`.

The `isAlreadyLinked` guard only blocks a *second* external identity once one is linked; the **first** link to a pre-existing LOCAL account is the exposure. Because login is "link-only, no HYBRID", the first SSO login onto a LOCAL email silently converts it to `account_type='SSO'` and grants the SSO identity full control of that account.

**Evidence:**
```ts
// JitProvisioningService.provision() — step 2 (email match)
user = await this.db.getAsync('SELECT * FROM users WHERE LOWER(email) = ?', [email]);
if (user) {
  if (!emailVerified) { /* reject */ }
  // ... no check on WHICH provider, no domain allowlist, no admin approval
  await this.db.runAsync(
    `UPDATE users SET external_provider = ?, external_subject_id = ?, ... account_type = 'SSO' WHERE user_id = ?`,
    [provider, oid, ...]);
  return { user, created: false, linked: true };
}
```

**Impact:**
Cross-provider / SSO-to-LOCAL account takeover if any enabled provider can assert a `email_verified=true` claim for an address it does not legitimately own. Attacker gains the victim's group/permissions.

**Remediation (pick one, product decision):**
1. **Preferred:** Do NOT auto-link SSO identities to pre-existing LOCAL accounts. Require an authenticated "link account" action (user logs in with the existing credential first, then links SSO), or admin approval. Auto-JIT should only *create* new users, never silently absorb an existing account.
2. If auto-link must stay, gate it with a **provider→email-domain trust allowlist** (e.g. only `@corp.com` may be linked via Entra tenant X), configured in `sso_providers`, and log/alert on every cross-account link.
3. At minimum, restrict auto-link to accounts that are **already SSO** (never LOCAL) and same-domain, and require explicit opt-in per provider.

```ts
// Example guard (option 3 minimal):
if (user.account_type === 'LOCAL') {
  await this.auditReject(user.user_id, 'SSO_LINK_REJECTED_LOCAL_NO_AUTOLINK', { email, provider });
  throw new Error('Auto-linking SSO to an existing local account is not allowed; link from account settings.');
}
```

**Note:** The plan (§6) already flags this as an open policy question for Security. This finding formalizes it: **ship a documented decision before UAT.**

---

### 🟡 SEC-02 — Loopback redirect accepts any port on 127.0.0.1
| Attribute | Value |
|-----------|-------|
| **Severity** | Medium (accepted risk) |
| **OWASP** | A04 |
| **CWE** | CWE-601 (Open Redirect) — constrained |
| **CVSS (est.)** | 4.2 |
| **Location** | `backend/src/server/routes/auth/sso-http-helpers.ts` → `isLoopbackRedirect()`, `buildPostLoginRedirect()` |
| **Status** | Open — **NOT a UAT blocker; record risk acceptance** |

**Description:**
`isLoopbackRedirect` correctly restricts scheme (`http:`), host (`127.0.0.1` exactly — rejects `localhost`, `::1`, `127.0.0.1.evil.com`) and path (`/callback`), but allows **any port**. Since `buildPostLoginRedirect` appends the real `token` + `expiresAt` to this URL, a malicious local process listening on another loopback port could receive a token **if** it can also supply the matching `state` (which it cannot, because state is client-generated by the extension and single-use).

**Impact:** A hostile local process could receive a session token only by winning a race and knowing the victim's unguessable `state`. Compensating controls: (a) client-initiated 128-bit `state` verified end-to-end, (b) single-use state via `store.take`, (c) random client port, (d) short 5-min TTL. Residual risk is a co-located malicious process on the same host — a high bar.

**Remediation (optional hardening):** Have the extension register its exact chosen port with the backend at authorize time (already sends `redirect_to` with the port) and pin the callback to that exact `redirect_to` stored in state, rather than re-deriving from the inbound request. This is effectively already the case (redirect_to is stored in `entry.redirectTo`), so document it and add a test asserting the callback only ever redirects to the stored port. **Accept as-is for UAT.**

---

### 🟡 SEC-03 — Callback rate limiting is per-IP and in-memory only
| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP** | A04 |
| **CWE** | CWE-307 (Improper Restriction of Excessive Auth Attempts) |
| **CVSS (est.)** | 4.0 |
| **Location** | `sso-http-helpers.ts` → `CallbackRateLimiter`, `getClientIp` |
| **Status** | Open — non-blocking |

**Description:**
Rate limiting (5 / 60s) is per-IP, in-memory, per-process. Three gaps: (1) resets on restart and is not shared across instances (multi-instance deploy bypasses it); (2) `getClientIp` trusts `X-Forwarded-For` when `TRUST_PROXY!=='true'` **as long as the header is present** — `if (trustProxy || xff)` means an attacker can spoof `X-Forwarded-For` to rotate the rate-limit key even without proxy trust; (3) it limits callbacks but not authorize starts.

**Evidence:**
```ts
export function getClientIp(c: Context): string {
  const trustProxy = process.env.TRUST_PROXY === 'true';
  const xff = c.req.header('x-forwarded-for');
  if (trustProxy || xff) {              // ← spoofable when NOT behind trusted proxy
    return xff?.split(',')[0]?.trim() || xri || '127.0.0.1';
  }
  ...
}
```

**Impact:** Rate-limit evasion via spoofed `X-Forwarded-For`; limited value in HA deployments. The state/PKCE checks still protect the actual auth, so this is defense-in-depth, not a direct auth bypass.

**Remediation:** Only honor `X-Forwarded-For` when `TRUST_PROXY==='true'`; otherwise use the socket remote address. For multi-instance, back the limiter with a shared store (Redis) or accept single-instance scope explicitly.
```ts
if (trustProxy) return xff?.split(',')[0]?.trim() || xri || socketIp;
return socketIp; // ignore client-supplied XFF when not behind a trusted proxy
```

---

### 🟡 SEC-04 — Session cookie `Secure` gated on NODE_ENV; `SameSite=Lax` on token-bearing flow
| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP** | A05 |
| **CWE** | CWE-614 (Sensitive Cookie Without Secure), CWE-1275 (SameSite) |
| **CVSS (est.)** | 4.3 |
| **Location** | `sso-http-helpers.ts` → `issueSessionCookie` |
| **Status** | Open — non-blocking (verify prod config) |

**Description:**
`Secure` is only set when `NODE_ENV==='production'`. If a staging/prod deployment runs without `NODE_ENV=production`, the session cookie is sent over plaintext HTTP. `SameSite=Lax` is acceptable for the web redirect, but note the loopback flow additionally returns the token in the URL query (necessary for the native client) — ensure those URLs are never logged server-side (they aren't currently).

**Remediation:** Default `Secure` on unless an explicit `ALLOW_INSECURE_COOKIES=true` dev flag is set (fail-secure rather than fail-open on a missing env var). Consider `SameSite=Strict` for the admin web session.
```ts
const secureFlag = process.env.ALLOW_INSECURE_COOKIES === 'true' ? '' : '; Secure';
```

---

### 🟡 SEC-05 — Upstream token-exchange error body reflected to client via `detail`
| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP** | A08 / A09 |
| **CWE** | CWE-209 (Information Exposure Through an Error Message) |
| **CVSS (est.)** | 3.7 |
| **Location** | `GoogleProviderStrategy.readIdToken`, `GitHubProviderStrategy.exchangeCode`, `entra.ts`/`sso-provider.ts` `*Error()` → `detail` |
| **Status** | Open — non-blocking |

**Description:**
On a failed token exchange the raw provider response text is attached as `err.detail` and returned to the caller: `return c.json({ error: 'token_exchange_failed', detail: e.detail }, ...)`. Provider error bodies can include the `redirect_uri`, `client_id`, and diagnostic hints useful to an attacker probing the flow. No token/secret is logged (good), but the reflected detail is more than the client needs.

**Remediation:** Log `detail` server-side (Pino) and return a generic message to the client (`{ error: 'token_exchange_failed' }`). Never echo upstream OAuth error bodies to the browser.

---

### 🔵 SEC-06 — Extension loopback: robust, but binds any-port and 120s open port
| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP** | A07 |
| **CWE** | CWE-1327 (Binding to an Unrestricted IP) — mitigated |
| **Location** | `extension/src/auth/AuthManager.ts` → `loginSso()` |
| **Status** | Open — non-blocking |

**Description:**
The loopback server validates `Host` header, `remoteAddress` (127.0.0.1/::1), `url.origin`, path `/callback`, and `state` before accepting a token — this is solid CSRF/leak protection. Minor residuals: the temporary HTTP server binds to `127.0.0.1` (good, not `0.0.0.0`) on a random port and stays open up to 120s; a co-located process could attempt to hit it but must present the correct `state`. `providerType` is validated with `/^[a-z0-9_-]+$/i` (good — prevents path injection into the authorize URL).

**Remediation:** Reduce the timeout (e.g. 60s), and close the server on the first valid callback (already does via `cleanup()`). Acceptable as-is.

---

### 🔵 SEC-07 — GitHub `assertState` defensive check can degrade to self-comparison
| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP** | A07 |
| **CWE** | CWE-352 (CSRF) — mitigated at route layer |
| **Location** | `GitHubProviderStrategy.assertState` |
| **Status** | Open — non-blocking |

**Description:**
```ts
const expected = params.storedState?.state ?? params.state;   // falls back to self
if (!params.state || !expected || params.state !== expected) fail('invalid_state', 401);
```
If `storedState.state` is ever undefined, `expected` becomes `params.state`, so the comparison is `state === state` (always passes). Today the generic route always populates `storedState.state`, and the authoritative CSRF check is the route-level `store.take(state)` (single-use), so this is not exploitable. But the in-strategy check gives a false sense of a second layer.

**Remediation:** Make the defensive check strict — if `storedState?.state` is absent, treat as failure rather than comparing to self:
```ts
const expected = params.storedState?.state;
if (!expected || params.state !== expected) fail('invalid_state', 401);
```

---

### 🔵 SEC-08 — id_token `exp` checked with no clock-skew leeway
| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP** | A02 |
| **CWE** | CWE-672 (Operation on Expired Resource) — inverse (over-strict) |
| **Location** | `GoogleIdTokenVerifier.assertClaims` (`claims.exp <= now`); Entra strategy nonce/exp via verifier |
| **Status** | Open — non-blocking |

**Description:**
`exp` is compared to `Date.now()` with no `nbf`/`iat` validation and no small leeway. This is fail-closed (good) but a slightly fast server clock can reject valid tokens. More notably, `nbf`/`iat` are not asserted, and `jwtVerify` is called without `issuer`/`audience` options (those are checked manually afterward, which is fine). No security downgrade, just robustness.

**Remediation:** Add a small leeway (e.g. 60s) and optionally assert `iat` is not in the future. Low priority.

---

### 🔵 SEC-09 — Entra `email_verified` coerced with `Boolean()` (string "false" → true risk pattern)
| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP** | A07 |
| **CWE** | CWE-704 (Incorrect Type Conversion) |
| **Location** | `EntraProviderStrategy.handleCallback` → `emailVerified: Boolean((claims as any).email_verified)` |
| **Status** | Open — non-blocking |

**Description:**
Google normalizes `email_verified` safely via `isEmailVerified()` (handles boolean or `"true"` string). Entra uses `Boolean(claims.email_verified)`, which for a string `"false"` yields `true` (non-empty string is truthy). If Entra ever returns the claim as a string, an unverified email could be treated as verified. Entra typically returns a real boolean, so exposure is conditional.

**Remediation:** Reuse the shared `isEmailVerified()` helper for all providers:
```ts
emailVerified: isEmailVerified((claims as any).email_verified),
```

---

### ℹ️ SEC-10 — Audit failures swallowed; no alerting on repeated link rejections
| Attribute | Value |
|-----------|-------|
| **Severity** | Informational |
| **OWASP** | A09 |
| **Location** | `JitProvisioningService.auditReject/auditLink/auditProvision` (catch → `logger.warn`) |

**Description:** Security-relevant events (link rejected: not verified / duplicate email / HYBRID) are audited, which is good. However audit write failures are downgraded to `warn` and the flow continues, and there is no alerting/threshold on repeated `SSO_LINK_REJECTED_*`. For takeover attempts (SEC-01) these rejects are the key signal.

**Remediation:** Emit a metric/alert on repeated `SSO_LINK_REJECTED_DUPLICATE_EMAIL` / `_EMAIL_NOT_VERIFIED` per email/IP. Ensure audit-write failure for security events is at least `error` level.

---

### ℹ️ SEC-11 — `sso-dynamic.ts` still returns 501 for known-but-unregistered providers (info leak minor)
| Attribute | Value |
|-----------|-------|
| **Severity** | Informational |
| **Location** | `sso-dynamic.ts` → `KNOWN_PROVIDERS` 501 branch |

**Description:** Enumerating `/sso/x/login` reveals which provider types are "known" vs "unknown" (501 vs 404). Minor fingerprinting only. No action required.

---

### ℹ️ SEC-12 — `provision()` still accepts legacy `EntraClaims` shape (loose typing)
| Attribute | Value |
|-----------|-------|
| **Severity** | Informational |
| **Location** | `JitProvisioningService.provision(claims: NormalizedProfile | EntraClaims)` |

**Description:** The union type + `(claims as any)` fallbacks keep backward compatibility but weaken type safety around the `emailVerified`/`oid` extraction. All current callers pass a `NormalizedProfile`. Consider dropping the `EntraClaims` union now that Entra also routes through `EntraProviderStrategy` → `NormalizedProfile`, to remove the `as any` casts. No security impact today.

---

## Security Headers Assessment (SSO endpoints)
| Header | Status | Recommendation |
|--------|--------|----------------|
| Set-Cookie `HttpOnly` | ✅ | Present on session cookie |
| Set-Cookie `Secure` | ⚠️ | Gated on NODE_ENV — see SEC-04 |
| Set-Cookie `SameSite` | ✅/⚠️ | `Lax`; consider `Strict` for admin web |
| Cache-Control (loopback token page, extension) | ✅ | `no-store` set on token-bearing responses |
| CSP (login webview) | ✅ | `default-src 'none'; script-src 'nonce-…'` — no inline script |

## What the implementation does well ✅
- PKCE **S256 enforced** for both OIDC providers; `code_verifier` stored server-side in TTL state, never sent to the browser.
- OIDC id_token verification is **fail-closed**: JWKS-by-kid, RS256-only, issuer + audience + exp, plus **nonce binding** to the authorize request. zod `safeParse` on every external payload.
- **State single-use** (`store.take` deletes on read) with 5-min TTL and size cap.
- **GitHub email verification enforced** — only primary+verified (or verified) email is accepted; unverified → 403.
- **Session rotation** on every SSO login (`UPDATE sessions SET is_active = 0` before issuing new) — session-fixation defense, ordering is correct (rotate before issue).
- **Secrets:** masked (`***`) in admin GET; PUT refuses to overwrite with the mask; DB-configured providers never read env; no token/secret written to logs.
- **Loopback redirect tightly constrained** (scheme+host+path) with 7 negative unit tests; extension validates host/origin/remoteAddr/state.
- **Login panel** escapes provider-supplied names (`escapeHtml`) and uses a nonce-based CSP (no XSS via provider name).

---

## Remediation Priority
| Priority | Finding | Severity | Effort | UAT Blocker |
|----------|---------|----------|--------|-------------|
| 1 | SEC-01 cross-provider auto-link policy | High | Medium | **YES — decision required** |
| 2 | SEC-03 XFF spoofing in rate-limit key | Medium | Low | No |
| 3 | SEC-04 cookie Secure fail-secure default | Medium | Low | No |
| 4 | SEC-05 stop reflecting upstream error detail | Medium | Low | No |
| 5 | SEC-02 loopback any-port (pin to stored port) | Medium | Low | No (accept) |
| 6 | SEC-09 Entra email_verified coercion | Low | Low | No |
| 7 | SEC-07 GitHub state strict check | Low | Low | No |
| 8 | SEC-08 exp leeway / iat check | Low | Low | No |

---

## Verdict

**PASS with conditions.**

- **No Critical findings.** The AC for S-E ("no Critical") is met.
- **1 High (SEC-01)** — cross-provider / SSO-to-LOCAL auto-linking. This is the one item that must be **explicitly decided and documented before UAT**: either disable auto-linking of SSO identities onto pre-existing LOCAL accounts (recommended), or gate it behind a provider→domain trust allowlist + alerting. Shipping the current silent auto-link without a recorded product decision is not acceptable; hence it is marked **BLOCK before UAT** as a decision gate (a one-line policy change satisfies it).
- **Medium/Low** findings are hardening and can be scheduled post-UAT, except they should be tracked. SEC-02 (loopback any-port) is **assessed as an accepted risk** given the compensating controls (client-initiated single-use 128-bit state, random port, 5-min TTL, tight host/path/scheme validation).

**Recommended gate for UAT:** resolve/decide SEC-01; apply the quick wins SEC-03, SEC-04, SEC-05 (all low-effort, high-value); track the rest.

---

## Appendix

### A. Files Reviewed
- `backend/src/server/auth/strategies/{SsoProviderStrategy,SsoStrategyRegistry,EntraProviderStrategy,GoogleProviderStrategy,GitHubProviderStrategy,GoogleProviderConfig,index}.ts`
- `backend/src/server/auth/models/{NormalizedProfile,GoogleClaims,GitHubProfile,SsoProviderConfig}.ts`
- `backend/src/server/auth/utils/{pkce-helper,sso-config-loader}.ts`
- `backend/src/server/middleware/verifiers/GoogleIdTokenVerifier.ts`
- `backend/src/server/routes/auth/{entra,sso-provider,sso-http-helpers,sso-dynamic,unified}.ts`
- `backend/src/server/routes/admin/sso-providers.ts`
- `backend/src/server/services/{JitProvisioningService,SessionService}.ts`
- `extension/src/auth/AuthManager.ts`, `extension/src/panels/login-panel.ts`

### B. Scope Limitations
- **Static analysis only** — no dynamic/penetration testing against a running instance, no live token forgery.
- **Dependency CVE scan out of scope** — recommend `npm audit` on `backend/` + `extension/` as a separate gate (verifies `jose`, `hono`, `zod`, drivers).
- Actual `sso_providers` DB contents, real provider tenant configuration, and reverse-proxy/TLS termination config were not inspected (SEC-04/SEC-03 depend on deployment).
- Session store internals (`createSession`/`refreshSession`) reviewed only at the SSO integration boundary.

### C. Glossary
- **PKCE** — Proof Key for Code Exchange (RFC 7636). **JWKS** — JSON Web Key Set. **IdP** — Identity Provider. **JIT** — Just-In-Time provisioning. **CVSS/CWE/OWASP** — standard vuln scoring/enumeration/taxonomy.
