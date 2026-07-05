# Business Requirements Document (BRD)

## SA4E — F9-AUTH-SSO: Auth & SSO

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F9-AUTH-SSO |
| Title | Authentication & Single Sign-On |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2025-07-04 |
| Status | Draft |
| Architecture Pattern | Plugin (VS Code Extension) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-04 | BA Agent | Initial document — F9 Auth & SSO feature |

---

## 1. Introduction

### 1.1 Scope

This document defines the business requirements for the Authentication & Single Sign-On (SSO) feature of the SA4E VS Code Extension. The feature provides secure user authentication using PKCE-based OAuth2 flows, token lifecycle management, session persistence via VS Code SecretStorage, and multi-provider SSO support.

The extension operates as a **plugin** within the VS Code host system, leveraging VS Code SecretStorage API for secure credential management and its authentication provider extensibility model.

### 1.2 Out of Scope

- Backend authentication server implementation (consumed, not built)
- User registration / account creation flows
- Role-based access control (RBAC) policies on backend
- Two-factor authentication (2FA) hardware tokens
- Enterprise directory integration (LDAP/AD) — handled by SSO provider

### 1.3 Preliminary Requirements

- VS Code version >= 1.80 (SecretStorage API stable)
- Backend exposes OAuth2-compliant `/api/admin/auth/login` and `/api/auth/refresh` endpoints
- At least one OAuth2/OIDC provider configured (e.g., corporate SSO)
- Network access to authentication endpoints from developer workstations

---

## 2. Business Requirements

### 2.1 High Level Process Map

The authentication flow follows this high-level process:

**Step 1:** User activates SA4E extension -> extension checks stored credentials in SecretStorage

**Step 2:** If valid token exists and not expired -> auto-authenticate silently (restore session)

**Step 3:** If no token or expired -> prompt login UI (username/password OR SSO provider selection)

**Step 4:** For SSO: initiate PKCE OAuth2 code flow -> open browser -> receive auth code -> exchange for token

**Step 5:** For username/password: POST to `/api/admin/auth/login` -> receive token

**Step 6:** Store token securely in VS Code SecretStorage (OS keychain)

**Step 7:** Start token refresh timer -> periodically refresh before expiry

**Step 8:** On logout: clear stored credentials, notify backend, stop refresh timer

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case | Priority | Source |
|---|------------------|----------|--------|
| 1 | As a developer, I want to login with username/password so that I can access SA4E backend services | MUST HAVE | F9 |
| 2 | As a developer, I want to login via SSO (OAuth2 PKCE) so that I can use my corporate credentials | MUST HAVE | F9 |
| 3 | As a developer, I want my session to persist across VS Code restarts so that I don't re-login daily | MUST HAVE | F9 |
| 4 | As a developer, I want tokens to auto-refresh so that my session never expires mid-work | MUST HAVE | F9 |
| 5 | As a developer, I want to logout securely so that my credentials are cleared from the machine | MUST HAVE | F9 |
| 6 | As a developer, I want to see my authentication status in the status bar so that I know if I'm connected | SHOULD HAVE | F9 |
| 7 | As an admin, I want to configure multiple SSO providers so that teams can use their preferred identity provider | SHOULD HAVE | F9 |
| 8 | As a developer, I want clear error messages when auth fails so that I can troubleshoot connectivity issues | MUST HAVE | F9 |

---

### 2.3 Details of User Stories

---

#### Business Flow

![Business Flow](diagrams/business-flow.png)

---

#### STORY 1: Username/Password Login

> As a developer, I want to login with username/password so that I can access SA4E backend services.

**Requirement Details:**

1. Extension provides a login command (`SA4E: Login`) accessible via Command Palette
2. Login UI collects username and password fields
3. Credentials are sent to backend `/api/admin/auth/login` endpoint
4. On success: token stored in SecretStorage, state transitions to AUTHENTICATED
5. On failure: clear error message displayed, state remains UNAUTHENTICATED

**Acceptance Criteria:**

1. GIVEN I am not authenticated, WHEN I run "SA4E: Login" command, THEN a login form appears asking for username and password
2. GIVEN I enter valid credentials, WHEN I submit the form, THEN I am authenticated and can access backend services within 3 seconds
3. GIVEN I enter invalid credentials, WHEN I submit, THEN I see an error message "Login failed: Invalid credentials" and can retry
4. GIVEN the backend is unreachable, WHEN I submit, THEN I see "Cannot reach backend: connection timeout" within 10 seconds

---

#### STORY 2: SSO Login (OAuth2 PKCE)

> As a developer, I want to login via SSO (OAuth2 PKCE) so that I can use my corporate credentials.

**Requirement Details:**

1. Extension supports OAuth2 Authorization Code flow with PKCE (S256 challenge method)
2. User selects SSO provider from configured list (or default if only one)
3. Extension generates code_verifier (43-128 chars, cryptographically random) and code_challenge (SHA-256)
4. Extension opens system browser with authorization URL containing code_challenge
5. After user authenticates in browser, callback delivers auth code to extension
6. Extension exchanges auth code + code_verifier for access token
7. Token stored in SecretStorage, state transitions to AUTHENTICATED

**Acceptance Criteria:**

1. GIVEN SSO is configured, WHEN I select "Login with SSO", THEN my default browser opens to the identity provider login page
2. GIVEN I authenticate in the browser, WHEN the callback completes, THEN VS Code regains focus and shows "Authenticated successfully"
3. GIVEN the PKCE challenge uses S256, WHEN tokens are exchanged, THEN the code_verifier is never transmitted before the token exchange step
4. GIVEN multiple SSO providers are configured, WHEN I select "Login with SSO", THEN I see a QuickPick list of available providers

---

#### STORY 3: Session Persistence

> As a developer, I want my session to persist across VS Code restarts so that I don't re-login daily.

**Requirement Details:**

1. Access token stored in VS Code SecretStorage (backed by OS keychain)
2. On extension activation: check SecretStorage for existing token
3. If token exists and not expired: auto-restore session silently (no UI prompt)
4. If token expired but refresh possible: attempt silent refresh
5. If refresh fails: prompt re-login

**Acceptance Criteria:**

1. GIVEN I was authenticated before closing VS Code, WHEN I reopen VS Code, THEN I am automatically authenticated without any login prompt
2. GIVEN my token has expired (>1 hour), WHEN VS Code reopens, THEN extension attempts silent refresh before prompting login
3. GIVEN the OS keychain is locked/unavailable, WHEN the extension activates, THEN it gracefully falls back to UNAUTHENTICATED state with a notification

---

#### STORY 4: Token Auto-Refresh

> As a developer, I want tokens to auto-refresh so that my session never expires mid-work.

**Requirement Details:**

1. Token refresh timer runs every 5 minutes when authenticated
2. If token expiry is within 1 minute: trigger proactive refresh
3. Refresh calls `/api/auth/refresh` with current token
4. On success: update stored token in SecretStorage
5. On failure (401/403): transition to UNAUTHENTICATED, notify user
6. On network error: keep current token, retry on next interval

**Acceptance Criteria:**

1. GIVEN I am authenticated with a token expiring in 30 minutes, WHEN 25 minutes pass, THEN the token is refreshed automatically without user intervention
2. GIVEN a token refresh fails with 401, WHEN the next action requires auth, THEN I am prompted to re-login
3. GIVEN a temporary network outage, WHEN token refresh fails, THEN the current session continues and refresh retries on next interval

---

#### STORY 5: Secure Logout

> As a developer, I want to logout securely so that my credentials are cleared from the machine.

**Requirement Details:**

1. Extension provides "SA4E: Logout" command
2. On logout: notify backend via `/api/auth/logout` (best-effort, don't block on failure)
3. Delete access token from SecretStorage
4. Clear in-memory cached token
5. Stop token refresh timer
6. Transition state to UNAUTHENTICATED
7. Update status bar indicator

**Acceptance Criteria:**

1. GIVEN I am authenticated, WHEN I run "SA4E: Logout", THEN all credentials are removed from SecretStorage within 1 second
2. GIVEN the backend is unreachable during logout, WHEN I logout, THEN local cleanup still completes successfully
3. GIVEN I have logged out, WHEN I check the status bar, THEN it shows "Not connected"

---

#### STORY 6: Authentication Status Indicator

> As a developer, I want to see my authentication status in the status bar so that I know if I'm connected.

**Requirement Details:**

1. VS Code status bar item shows current auth state
2. States: "$(key) Connected" (AUTHENTICATED), "$(circle-slash) Not connected" (UNAUTHENTICATED), "$(loading~spin) Authenticating..." (AUTHENTICATING)
3. Clicking the status bar item opens a quick action menu (Login/Logout/Switch Account)

**Acceptance Criteria:**

1. GIVEN I am authenticated, WHEN I look at the status bar, THEN I see a key icon with "Connected"
2. GIVEN my session expires, WHEN the state changes, THEN the status bar updates within 2 seconds
3. GIVEN I click the status bar, WHEN I am authenticated, THEN I see options "Logout" and "Switch Account"

---

#### STORY 7: Multi-Provider SSO Configuration

> As an admin, I want to configure multiple SSO providers so that teams can use their preferred identity provider.

**Requirement Details:**

1. Extension settings allow configuring multiple OAuth2 providers
2. Each provider has: name, clientId, authorizationUrl, tokenUrl, scopes
3. Configuration stored in VS Code settings (workspace or user level)
4. At least one default provider can be designated
5. Provider list shown in QuickPick during SSO login

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| name | string | Yes | Display name for provider | "Corporate SSO" |
| clientId | string | Yes | OAuth2 client ID | "sa4e-vscode-client" |
| authorizationUrl | string | Yes | OAuth2 authorize endpoint | "https://sso.corp.com/authorize" |
| tokenUrl | string | Yes | OAuth2 token endpoint | "https://sso.corp.com/token" |
| scopes | string[] | No | Requested scopes | ["openid", "profile"] |
| isDefault | boolean | No | Default provider flag | true |

**Acceptance Criteria:**

1. GIVEN I have configured 2 SSO providers in settings, WHEN I select "Login with SSO", THEN both appear in the QuickPick list
2. GIVEN a provider is marked as default, WHEN only one provider is configured, THEN SSO login skips the provider selection step
3. GIVEN an invalid provider configuration (missing clientId), WHEN the extension activates, THEN a warning notification appears

---

#### STORY 8: Authentication Error Handling

> As a developer, I want clear error messages when auth fails so that I can troubleshoot connectivity issues.

**Acceptance Criteria:**

1. GIVEN the backend returns 401, WHEN I try to login, THEN I see "Invalid credentials. Please check your username and password."
2. GIVEN the backend returns 429, WHEN I try to login, THEN I see "Too many login attempts. Please wait before retrying."
3. GIVEN a network timeout, WHEN I try to login, THEN I see "Cannot reach backend at {url}. Check your network connection."
4. GIVEN an SSL certificate error, WHEN I try to login, THEN I see "SSL certificate verification failed. Contact your IT administrator."

---

## 3. Dependencies

| Dependency | Type | Description |
|------------|------|-------------|
| VS Code SecretStorage API | System | OS keychain integration for secure token storage |
| VS Code Authentication Provider API | System | Extension point for auth provider registration |
| Backend Auth Endpoints | External | `/api/admin/auth/login`, `/api/auth/refresh`, `/api/auth/logout` |
| OAuth2/OIDC Provider | External | Corporate SSO identity provider(s) |
| System Browser | System | For OAuth2 redirect flow (PKCE) |
| Node.js crypto module | System | PKCE code_verifier/challenge generation |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility |
|------|-------------|----------------|
| Product Owner | SA4E Team Lead | Approve requirements, UAT |
| Developer | Extension Dev Team | Implement auth module |
| Security | InfoSec Team | Review token handling, PKCE implementation |
| UX Designer | UX Team | Login UI/UX flows |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| OS keychain unavailable (headless/remote) | High | Medium | Fallback to in-memory session with warning |
| SSO provider configuration errors | Medium | High | Validate config on extension activation |
| Token refresh race conditions | Medium | Low | Use mutex/lock around refresh operations |
| PKCE code leakage in logs | High | Low | Never log code_verifier, sanitize auth logs |
| Browser redirect not captured | Medium | Medium | Timeout with manual code entry fallback |

### 5.2 Assumptions

- Backend auth endpoints are OAuth2/OIDC compliant
- VS Code SecretStorage is available on all supported platforms
- Network latency to auth endpoints < 5 seconds
- Token TTL is at least 30 minutes
- Only one active session per VS Code window

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Login completes < 3s | From button click to AUTHENTICATED (excl. browser SSO time) |
| Performance | Token refresh < 2s | Background, no IDE impact |
| Performance | Extension activation < 100ms | Auth init must not delay startup |
| Security | Tokens never in plaintext | Must use VS Code SecretStorage |
| Security | PKCE S256 mandatory | code_verifier never transmitted unprotected |
| Security | code_verifier min 43 chars | Per RFC 7636 |
| Reliability | Silent refresh success > 99% | Under normal network conditions |
| Availability | Graceful degradation | Extension functional when auth fails |
| Compatibility | VS Code >= 1.80 | SecretStorage API requirement |
| Compatibility | Remote Development support | SSH, Container, WSL remotes |

---

## 7. Use Case Diagram

![Use Case Diagram](diagrams/use-case.png)

---

## 8. Appendix

### Glossary

| Term | Definition |
|------|------------|
| PKCE | Proof Key for Code Exchange — OAuth2 extension for public clients |
| S256 | SHA-256 based code challenge method |
| SecretStorage | VS Code API for secure credential storage backed by OS keychain |
| code_verifier | Random string used in PKCE flow, proven during token exchange |
| code_challenge | SHA-256 hash of code_verifier, sent in authorization request |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case Diagram | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
