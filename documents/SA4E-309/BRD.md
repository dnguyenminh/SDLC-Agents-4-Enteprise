# Business Requirements Document (BRD)

## SDLC Agents 4 Enterprise — SA4E-309: [Backend] GitHub SSO (OAuth2, non-OIDC) provider strategy

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-309 |
| Title | [Backend] GitHub SSO (OAuth2, non-OIDC) provider strategy |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-09-22 |
| Status | Draft |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | BA Agent – Business Analyst | Create document |
| Peer Reviewer | – | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-22 | BA Agent | Rewrite complete BRD based on code review: GitHubProviderStrategy.ts, SsoProviderStrategy.ts, JitProvisioningService.ts |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |

---

## 1. Introduction

### 1.1 Scope

Implement GitHub SSO provider using OAuth2 non-OIDC flow within the multi-provider SSO strategy pattern. The feature enables users to sign in with GitHub, obtains an opaque access_token via client_secret exchange, fetches identity from GitHub REST API `/user` and `/user/emails`, selects a primary verified email, normalizes the profile to `NormalizedProfile`, and performs JIT provisioning/linking via `JitProvisioningService`. CSRF protection is provided by `state` parameter; GitHub does not support PKCE/nonce.

Source code: `backend/src/server/auth/strategies/GitHubProviderStrategy.ts`, `backend/src/server/auth/strategies/SsoProviderStrategy.ts`, `backend/src/server/services/JitProvisioningService.ts`.

### 1.2 Out of Scope

- OIDC / id_token verification, JWKS, nonce, PKCE support for GitHub.
- UI changes for sign-in page design.
- Email linking for unverified GitHub emails.
- Auto-linking SSO to existing LOCAL password accounts via JIT.

### 1.3 Preliminary Requirement

- SSO provider configuration table `sso_providers` contains entry for providerType `github` with clientId, clientSecret, redirectUri.
- `SsoProviderStrategy` interface and registry exist from SA4E-307.
- `JitProvisioningService` supports `NormalizedProfile` input.
- GitHub OAuth App approved with scopes `read:user user:email`.

---

## 2. Business Requirements

### 2.1 High Level Process Map

User initiates GitHub sign-in → Backend builds authorize URL with state → Redirect to `https://github.com/login/oauth/authorize` → User authenticates → GitHub redirects to callback with code+state → Backend verifies state → Exchanges code for access_token → Calls GitHub API `/user` and `/user/emails` → Selects primary verified email → Normalizes profile → JIT Provisioning creates/links user → Session established.

![Authorize Callback Verify JIT](diagrams/authorize_callback_verify_jit.png)
*[Edit in draw.io](diagrams/authorize_callback_verify_jit.drawio)*

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case / Epic | Priority | Source Ticket |
|---|-------------------------|----------|---------------|
| 1 | As a user, I want to sign in with GitHub so that I can access the system without creating a local password | MUST HAVE | SA4E-309 |
| 2 | As a system, I want CSRF protection via state so that sign-in callbacks cannot be forged | MUST HAVE | SA4E-309 |
| 3 | As a system, I want email verification enforced so that only verified GitHub emails can be provisioned/linked | MUST HAVE | SA4E-309 |

---

### 2.3 Details of User Stories

#### Business Flow

**Step 1:** User clicks Sign in with GitHub.
**Step 2:** Backend `GitHubProviderStrategy.buildAuthorizeUrl` builds URL to `https://github.com/login/oauth/authorize` with `client_id`, `redirect_uri`, `scope=read:user user:email`, `state`, `response_type=code`.
**Step 3:** User redirected to GitHub, authenticates and authorizes.
**Step 4:** GitHub redirects to callback with `code` and `state`.
**Step 5:** Backend `assertState` compares returned state with stored state.
**Step 6:** Backend exchanges code for access_token via POST `https://github.com/login/oauth/access_token` with client credentials.
**Step 7:** Backend GET `https://api.github.com/user` and `https://api.github.com/user/emails` using Bearer token and User-Agent.
**Step 8:** Select primary verified email, fallback to first verified.
**Step 9:** Normalize to `NormalizedProvider` with provider='github', externalSubjectId=user.id, email, emailVerified.
**Step 10:** `JitProvisioningService.provision` creates new SSO user or links existing user by email/external id, rejecting unverified email and local account auto-link.

> **Note:** GitHub OAuth2 does NOT support PKCE/nonce. CSRF mitigated by state and server-side client_secret.

#### STORY 1: Sign in with GitHub

> As a user, I want to sign in with GitHub so that I can access the system without creating a local password

**Requirement Details:**
1. `buildAuthorizeUrl` must use `AUTHORIZE_URL = https://github.com/login/oauth/authorize`
2. Scopes default to `read:user user:email`, configurable per provider config.
3. State generated via `generateState` if not provided.
4. No code_verifier/nonce added.

**Data Fields:**
| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| client_id | string | Yes | GitHub OAuth App client id | abc123 |
| redirect_uri | string | Yes | Callback URL | https://app/callback |
| scope | string | Yes | Space separated scopes | read:user user:email |
| state | string | Yes | CSRF token | random |

**Acceptance Criteria:**
1. Sign in with GitHub → callback → JIT creates user with external_provider='github'
2. Normalized profile contains provider, externalSubjectId, email, emailVerified, name
3. Integration test mocks `/login/oauth/access_token`, `/user`, `/user/emails`

**Validation Rules:**
- State must match stored state.
- Email must be verified.

**Error Handling:**
- invalid_state → 401
- email_not_verified → 403
- token_exchange_failed → 502

#### STORY 2: CSRF Protection

> As a system, I want CSRF protection via state

**Requirement Details:**
1. `assertState` compares `params.state` with `params.storedState?.state ?? params.state`
2. Mismatch throws `invalid_state` 401

**Acceptance Criteria:**
1. State mismatch → reject with 401 invalid_state

#### STORY 3: Email Verification Enforcement

> As a system, I want email verification enforced

**Requirement Details:**
1. `resolvePrimaryVerifiedEmail` prefers email where primary && verified, else first verified.
2. If none, fail `email_not_verified` 403.

**Acceptance Criteria:**
1. Email not verified → reject link/JIT
2. `/user` email omitted → fallback to `/user/emails`

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| Multi-provider SSO foundation | System | SA4E-307 | Strategy interface, registry, refactor Entra |
| JitProvisioningService | System | – | JIT create/link with NormalizedProfile |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility | Source |
|------|-------------|----------------|--------|
| Reporter | Duc Nguyen Minh | Requirement owner | SA4E-309 |
| BA | BA Agent | BRD author | – |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| GitHub changes OAuth scopes | Medium | Low | Configurable scopes |
| Email privacy → no email in /user | Medium | Medium | Always call /user/emails |
| State storage loss | High | Low | Server-side session store |

### 5.2 Assumptions

- GitHub OAuth App has correct redirect URI registered.
- `sso_providers` config loaded correctly.

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Security | CSRF via state | No PKCE/nonce per GitHub limits |
| Security | Email verification mandatory | Reject unverified |
| Performance | Token exchange < 2s | External call |
| Audit | Provision/link events audited | `recordAudit` |

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-309 | [Backend] GitHub SSO (OAuth2, non-OIDC) provider strategy | To Do | Story | Main ticket |
| SA4E-307 | [Backend] SSO Provider Strategy abstraction + registry + refactor Entra | To Do | Story | Depends on |
| SA4E-262 | [SSO] Tích hợp Microsoft Entra ID... | In Progress | Epic | Parent |

---

## 8. Appendix

### Diagram Index

| Diagram | File |
|---------|------|
| Authorize Callback Verify JIT | [authorize_callback_verify_jit.png](diagrams/authorize_callback_verify_jit.png) |

### Glossary

| Term | Definition |
|------|------------|
| NormalizedProfile | Provider-agnostic identity object |
| JIT Provisioning | Just-In-Time user creation on first login |

### Reference Documents

| Document | Link / Location |
|----------|-----------------|
| Code | backend/src/server/auth/strategies/GitHubProviderStrategy.ts |
| Code | backend/src/server/services/JitProvisioningService.ts |
