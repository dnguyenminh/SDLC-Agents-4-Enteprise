# Functional Specification Document (FSD)

## SA4E — F9-AUTH-SSO: Auth & SSO

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F9-AUTH-SSO |
| Title | Authentication & Single Sign-On |
| Author | BA Agent + TA Agent |
| Version | 1.0 |
| Date | 2025-07-04 |
| Status | Draft |
| Related BRD | BRD-v1-F9-AUTH-SSO.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-04 | BA + TA Agent | Initial FSD — functional specs + technical enrichment |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional behavior of the Auth & SSO module within the SA4E VS Code Extension. It defines use cases, business rules, data models, integration contracts, and UI specifications that enable developers to authenticate against the SA4E backend using username/password or OAuth2 PKCE SSO.

### 1.2 Scope

- Authentication state machine (UNAUTHENTICATED, AUTHENTICATING, AUTHENTICATED)
- Username/password login flow
- OAuth2 PKCE authorization code flow with multi-provider support
- Token lifecycle (acquire, store, refresh, revoke)
- VS Code SecretStorage integration
- Status bar UX indicator
- Extension settings for provider configuration

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| PKCE | Proof Key for Code Exchange (RFC 7636) |
| S256 | SHA-256 code challenge method |
| SecretStorage | VS Code API backed by OS keychain |
| code_verifier | Random 43-128 char string for PKCE |
| code_challenge | base64url(SHA-256(code_verifier)) |
| IdP | Identity Provider (SSO server) |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-F9-AUTH-SSO.docx |
| OAuth2 RFC 6749 | https://tools.ietf.org/html/rfc6749 |
| PKCE RFC 7636 | https://tools.ietf.org/html/rfc7636 |
| VS Code SecretStorage API | https://code.visualstudio.com/api/references/vscode-api#SecretStorage |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

The Auth module sits within the VS Code extension and interacts with:
- **Developer** — triggers login/logout, views auth status
- **SA4E Backend** — authenticates credentials, issues/refreshes tokens
- **SSO Identity Provider** — handles OAuth2 authorization (via browser)
- **VS Code Host** — provides SecretStorage, status bar, commands
- **OS Keychain** — underlying secret storage (via VS Code SecretStorage)

### 2.2 Auth State Machine

![State Diagram](diagrams/state-auth.png)

| State | Description | Allowed Transitions |
|-------|-------------|---------------------|
| UNAUTHENTICATED | No valid token, user must login | -> AUTHENTICATING |
| AUTHENTICATING | Login in progress (network call or browser flow) | -> AUTHENTICATED, -> UNAUTHENTICATED |
| AUTHENTICATED | Valid token, backend accessible | -> UNAUTHENTICATED |

---

## 3. Functional Requirements

### 3.1 Feature: Username/Password Login

**Source:** BRD Story 1

#### 3.1.1 Description

Developer authenticates using username and password credentials sent to the SA4E backend REST API. Backend validates and returns an access token with expiry metadata.

#### 3.1.2 Use Case

**Use Case ID:** UC-01
**Actor:** Developer
**Preconditions:** Extension activated, no valid session exists
**Postconditions:** Developer is AUTHENTICATED, token stored in SecretStorage

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Runs "SA4E: Login" command | | Developer opens Command Palette |
| 2 | | Shows login input box | Extension presents sequential input boxes |
| 3 | Enters username | | Developer types username |
| 4 | Enters password | | Developer types password (masked) |
| 5 | | Validates inputs non-empty | Client-side validation |
| 6 | | POST /api/admin/auth/login | Sends { username, password } to backend |
| 7 | | Receives { token, user, expiresAt } | Backend returns JWT |
| 8 | | Stores token in SecretStorage | Secure OS keychain storage |
| 9 | | Transitions to AUTHENTICATED | State machine update |
| 10 | | Starts TokenRefreshTimer | Background refresh loop begins |
| 11 | | Updates status bar to "Connected" | Visual confirmation |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01-1 | User cancels input box | Return to UNAUTHENTICATED, no error shown |
| AF-01-2 | User enters empty username | Show validation error "Username is required", re-prompt |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01-1 | Backend returns 401 | Show "Invalid credentials", remain UNAUTHENTICATED |
| EF-01-2 | Backend returns 429 | Show "Too many attempts, wait N minutes", remain UNAUTHENTICATED |
| EF-01-3 | Network timeout (>10s) | Show "Cannot reach backend", remain UNAUTHENTICATED |
| EF-01-4 | Backend returns 5xx | Show "Server error, try again later", remain UNAUTHENTICATED |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-01 | Password must be transmitted over HTTPS only | BRD NFR Security |
| BR-02 | Failed login attempt does not store any credential data | BRD Story 1 AC3 |
| BR-03 | Token expiry defaults to 1 hour if backend omits expiresAt | BRD Story 4 |
| BR-04 | Login command available only when UNAUTHENTICATED or AUTHENTICATING fails | BRD Story 1 |

#### 3.1.4 Data Specifications

**Input Data:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| username | string | Yes | Non-empty, max 255 chars | Backend username |
| password | string | Yes | Non-empty | Backend password (not stored) |

**Output Data (from backend):**

| Field | Type | Description |
|-------|------|-------------|
| token | string | JWT access token |
| user | object | User profile metadata |
| expiresAt | string (ISO 8601) | Token expiration timestamp |

#### 3.1.5 UI Specifications

**Screen: Login Input Boxes (Sequential VS Code InputBox)**

| No. | Element | Type | Required | Behavior | Validation |
|-----|---------|------|----------|----------|------------|
| 1 | Username prompt | InputBox | Yes | placeholder: "Enter your SA4E username" | Non-empty |
| 2 | Password prompt | InputBox (password=true) | Yes | placeholder: "Enter your password", masked input | Non-empty |
| 3 | Progress notification | ProgressNotification | N/A | "Logging in..." shown during network call | Auto-dismiss on complete |

#### 3.1.6 API Contract (Functional View)

**Endpoint:** `POST /api/admin/auth/login`
**Purpose:** Authenticate user with username/password

**Input Parameters:**

| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| username | string | Yes | BR-01 | User's login name |
| password | string | Yes | BR-01 | User's password |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| token | string | JWT access token for API calls |
| user | object | { id, username, email, roles } |
| expiresAt | string | ISO 8601 expiration timestamp |

**Business Error Scenarios:**

| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| Invalid credentials | "Login failed: Invalid credentials" | Backend 401 |
| Account locked | "Account locked. Contact admin." | Backend 423 |
| Rate limited | "Too many attempts. Wait {N} minutes." | Backend 429 |

---

### 3.2 Feature: SSO Login (OAuth2 PKCE)

**Source:** BRD Story 2

#### 3.2.1 Description

Developer authenticates using corporate SSO via OAuth2 Authorization Code flow with PKCE. The extension opens the system browser for IdP authentication, captures the authorization code via redirect, and exchanges it for an access token.

#### 3.2.2 Use Case

**Use Case ID:** UC-02
**Actor:** Developer
**Preconditions:** At least one SSO provider configured in extension settings
**Postconditions:** Developer is AUTHENTICATED, token stored in SecretStorage

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Runs "SA4E: Login with SSO" | | Command Palette |
| 2 | | Shows provider QuickPick (if multiple) | Provider selection |
| 3 | Selects provider | | Developer picks IdP |
| 4 | | Generates code_verifier (32 random bytes, base64url) | Crypto operation |
| 5 | | Generates code_challenge = base64url(SHA-256(verifier)) | S256 method |
| 6 | | Opens browser with auth URL + code_challenge + state | System browser launch |
| 7 | Authenticates in browser | | User enters SSO credentials |
| 8 | | Captures authorization code from redirect | Localhost callback server or URI handler |
| 9 | | Validates state parameter matches | Anti-CSRF check |
| 10 | | POST token endpoint with code + code_verifier | Token exchange |
| 11 | | Receives access_token + refresh_token | From IdP/backend |
| 12 | | Stores tokens in SecretStorage | Secure storage |
| 13 | | Transitions to AUTHENTICATED | State update |
| 14 | | Starts TokenRefreshTimer | Background refresh |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-02-1 | Only one provider configured | Skip QuickPick (step 2-3), use default |
| AF-02-2 | User cancels provider selection | Return to UNAUTHENTICATED |
| AF-02-3 | Browser flow timeout (120s) | Show "SSO timeout. Please try again." |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-02-1 | State parameter mismatch | Abort flow, show "Security error: state mismatch" |
| EF-02-2 | Token exchange fails | Show "SSO authentication failed", remain UNAUTHENTICATED |
| EF-02-3 | Invalid provider config | Show "SSO provider misconfigured: {detail}" |
| EF-02-4 | Browser cannot be opened | Show "Cannot open browser. Ensure default browser is set." |

#### 3.2.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-05 | code_verifier MUST be 43-128 chars (RFC 7636) | BRD NFR |
| BR-06 | ONLY S256 challenge method allowed (no plain) | BRD NFR |
| BR-07 | state parameter MUST be validated on callback | OWASP |
| BR-08 | code_verifier MUST NEVER appear in logs | BRD Risk |
| BR-09 | Browser flow has 120-second timeout | BRD Story 2 |
| BR-10 | Redirect URI uses localhost with ephemeral port or vscode:// URI scheme | VS Code pattern |

#### 3.2.4 Data Specifications

**PKCE Parameters:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| code_verifier | string | Yes | 43-128 chars, base64url charset | Random secret |
| code_challenge | string | Yes | base64url(SHA-256(verifier)) | Sent in auth request |
| code_challenge_method | string | Yes | Must be "S256" | Challenge method |
| state | string | Yes | 32+ random chars | Anti-CSRF token |

**Authorization Request Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| client_id | string | Yes | From provider config |
| response_type | string | Yes | "code" |
| redirect_uri | string | Yes | Localhost callback or vscode:// URI |
| scope | string | Yes | From provider config |
| code_challenge | string | Yes | PKCE challenge |
| code_challenge_method | string | Yes | "S256" |
| state | string | Yes | Random state for CSRF |

---

### 3.3 Feature: Session Persistence

**Source:** BRD Story 3

#### 3.3.1 Use Case

**Use Case ID:** UC-03
**Actor:** System (on extension activation)
**Preconditions:** Extension is activating
**Postconditions:** Session restored if valid token exists

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Extension activates | VS Code lifecycle |
| 2 | | Read token from SecretStorage | Check for existing session |
| 3 | | Check token expiry | Compare expiresAt vs now |
| 4 | | If valid: transition to AUTHENTICATED | Silent restore |
| 5 | | Start TokenRefreshTimer | Resume refresh cycle |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-03-1 | Token expired, refresh possible | Call refreshToken(), if success -> AUTHENTICATED |
| AF-03-2 | No token in SecretStorage | Remain UNAUTHENTICATED, no UI prompt |
| AF-03-3 | Refresh fails | Remain UNAUTHENTICATED, show notification |

#### 3.3.2 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-11 | Session restore MUST NOT show any UI on success | BRD Story 3 AC1 |
| BR-12 | Session restore MUST complete within 2 seconds | BRD NFR |
| BR-13 | If no expiresAt stored, assume 1-hour TTL from acquisition | Implementation note |

---

### 3.4 Feature: Token Auto-Refresh

**Source:** BRD Story 4

#### 3.4.1 Use Case

**Use Case ID:** UC-04
**Actor:** System (TokenRefreshTimer)
**Preconditions:** State is AUTHENTICATED, timer running
**Postconditions:** Token refreshed or session expired

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Timer fires (every 5 min) | Interval check |
| 2 | | Check if token within 1 min of expiry | Proactive threshold |
| 3 | | POST /api/auth/refresh | Send current token |
| 4 | | Receive new token | Updated JWT |
| 5 | | Update SecretStorage | Replace old token |
| 6 | | Update in-memory cache | Sync cache |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-04-1 | Refresh returns 401/403/400/404 | Transition to UNAUTHENTICATED |
| EF-04-2 | Network error | Keep current token, retry next interval |

#### 3.4.2 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-14 | Refresh interval = 5 minutes (CHECK_INTERVAL_MS) | Source code |
| BR-15 | Proactive refresh when token within 60 seconds of expiry | Source code |
| BR-16 | Network errors do NOT invalidate current session | BRD Story 4 AC3 |
| BR-17 | Timer stops when state is not AUTHENTICATED | Source code |

#### 3.4.3 API Contract (Functional View)

**Endpoint:** `POST /api/auth/refresh`
**Purpose:** Refresh an access token before it expires

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| refresh_token | string | Yes | Current access token (used as refresh) |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| token | string | New JWT access token |
| expiresAt | string | New expiration timestamp (optional) |

---

### 3.5 Feature: Secure Logout

**Source:** BRD Story 5

#### 3.5.1 Use Case

**Use Case ID:** UC-05
**Actor:** Developer
**Preconditions:** State is AUTHENTICATED
**Postconditions:** All credentials cleared, state UNAUTHENTICATED

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Runs "SA4E: Logout" | | Command Palette |
| 2 | | POST /api/auth/logout (best-effort) | Notify backend |
| 3 | | Delete token from SecretStorage | Remove from keychain |
| 4 | | Clear in-memory cachedToken | Zero memory |
| 5 | | Stop TokenRefreshTimer | Cancel timer |
| 6 | | Transition to UNAUTHENTICATED | State update |
| 7 | | Update status bar to "Not connected" | UI feedback |

#### 3.5.2 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-18 | Backend logout is best-effort (don't block on failure) | BRD Story 5 AC2 |
| BR-19 | Local cleanup MUST succeed even if backend unreachable | BRD Story 5 AC2 |
| BR-20 | All token references (storage + memory) cleared on logout | BRD Story 5 |

---

### 3.6 Feature: Multi-Provider Configuration

**Source:** BRD Story 7

#### 3.6.1 Use Case

**Use Case ID:** UC-06
**Actor:** Admin
**Preconditions:** Extension installed
**Postconditions:** SSO providers configured and validated

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Opens VS Code settings | | Settings UI or JSON |
| 2 | Adds provider to `sa4e.auth.ssoProviders` array | | Configuration |
| 3 | | Validates provider config on change | Real-time validation |
| 4 | | Shows warning if config invalid | Notification |

#### 3.6.2 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-21 | Provider config requires: name, clientId, authorizationUrl, tokenUrl | BRD Story 7 |
| BR-22 | If only one provider configured, it becomes default automatically | BRD Story 7 AC2 |
| BR-23 | Invalid providers shown as warning but don't block extension | BRD Story 7 AC3 |

---

## 4. Data Model

### 4.1 Entity Relationship

**Entities (in-memory / VS Code state):**

#### Entity: AuthSession

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| state | AuthState enum | Yes | BR-04 | Current auth state |
| accessToken | string | When authenticated | BR-01 | JWT access token (cached) |
| tokenExpiresAt | number (epoch ms) | No | BR-03, BR-13 | Token expiration time |
| tokenAcquiredAt | number (epoch ms) | No | BR-13 | When token was obtained |

#### Entity: SsoProvider

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| name | string | Yes | BR-21 | Display name |
| clientId | string | Yes | BR-21 | OAuth2 client identifier |
| authorizationUrl | string | Yes | BR-21 | IdP authorization endpoint |
| tokenUrl | string | Yes | BR-21 | IdP token endpoint |
| scopes | string[] | No | — | OAuth2 scopes to request |
| isDefault | boolean | No | BR-22 | Default provider flag |

#### Entity: PkceChallenge (transient, per-flow)

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| codeVerifier | string | Yes | BR-05, BR-08 | Secret random string (never logged) |
| codeChallenge | string | Yes | BR-06 | SHA-256 hash, base64url encoded |
| state | string | Yes | BR-07 | Random anti-CSRF parameter |

---

## 5. Integration Specifications

### 5.1 SA4E Backend — Auth API

| Attribute | Value |
|-----------|-------|
| Purpose | User authentication, token issuance and refresh |
| Direction | Outbound (extension calls backend) |
| Data Format | JSON over HTTPS |
| Frequency | On-demand (login) + periodic (refresh every 5 min) |

**Data Exchange:**

| Our Data | External Data | Direction | Business Rule |
|----------|--------------|-----------|---------------|
| username + password | token + user + expiresAt | Send/Receive | BR-01, BR-02 |
| refresh_token | new token + expiresAt | Send/Receive | BR-14, BR-16 |
| refresh_token | (logout acknowledgment) | Send | BR-18 |

### 5.2 OAuth2 Identity Provider

| Attribute | Value |
|-----------|-------|
| Purpose | SSO authentication via OAuth2 PKCE |
| Direction | Outbound (extension initiates, browser mediates) |
| Data Format | URL parameters (auth) + JSON (token exchange) |
| Frequency | On-demand (login only) |

**Data Exchange:**

| Our Data | External Data | Direction | Business Rule |
|----------|--------------|-----------|---------------|
| client_id, code_challenge, state, scopes | authorization_code | Send/Receive | BR-05, BR-06 |
| authorization_code + code_verifier | access_token + refresh_token | Send/Receive | BR-07 |

### 5.3 VS Code SecretStorage

| Attribute | Value |
|-----------|-------|
| Purpose | Secure token persistence across sessions |
| Direction | Bidirectional (store/retrieve) |
| Data Format | Key-value strings |
| Frequency | On login, refresh, logout, activation |

---

## 6. Processing Logic

### 6.1 PKCE Challenge Generation

**Trigger:** SSO login initiated
**Input:** None (random generation)
**Output:** { codeVerifier, codeChallenge }

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Generate 32 random bytes via crypto.randomBytes | Throw if crypto unavailable |
| 2 | Base64url encode -> code_verifier (43 chars) | N/A (deterministic) |
| 3 | SHA-256 hash the code_verifier | N/A (deterministic) |
| 4 | Base64url encode hash -> code_challenge | N/A (deterministic) |

### 6.2 Token Expiry Check

**Trigger:** getAccessToken() called, or timer fires
**Input:** tokenExpiresAt, tokenAcquiredAt
**Output:** boolean (expired or not)

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | If tokenExpiresAt is set: expired if now > (expiresAt - 60s) | — |
| 2 | If tokenExpiresAt is null but tokenAcquiredAt set: expired if now > (acquiredAt + 3600000ms) | Default 1-hour TTL |
| 3 | If neither set: not expired | Conservative |

---

## 7. Security Requirements

### 7.1 Authentication & Authorization

| Role | Permissions | Features |
|------|-------------|----------|
| Developer (any) | Login, Logout, View Status | All auth features |
| Admin | Configure SSO providers | Settings modification |

### 7.2 Data Sensitivity Classification

| Data Type | Classification | Business Requirement |
|-----------|---------------|---------------------|
| Access Token (JWT) | Confidential | OS keychain only, never plaintext |
| Password | Restricted | Never stored, transmitted over HTTPS only |
| code_verifier | Restricted | Never logged, exists only in memory during flow |
| Provider clientId | Internal | Stored in settings (not secret) |

### 7.3 Audit Trail

| Event | Logged Fields | Retention | Business Reason |
|-------|--------------|-----------|-----------------|
| Login success | timestamp, username (no token) | Session | Debugging |
| Login failure | timestamp, error type (no credentials) | Session | Security monitoring |
| Token refresh | timestamp, success/fail | Session | Health monitoring |
| Logout | timestamp | Session | Audit |

---

## 8. Non-Functional Requirements

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
| Performance | Login < 3 seconds | Time from submit to AUTHENTICATED |
| Performance | Session restore < 2 seconds | Time from activation to AUTHENTICATED |
| Performance | Refresh timer overhead < 1ms CPU | No impact on IDE performance |
| Security | Zero plaintext credentials at rest | Verified via SecretStorage API usage |
| Security | PKCE S256 only (no downgrade) | Verified in code review |
| Reliability | Auto-refresh 99%+ success rate | Under stable network |
| Compatibility | VS Code 1.80+ on Windows, macOS, Linux | CI matrix testing |
| Compatibility | VS Code Remote (SSH, Container, WSL) | Manual + automated tests |

---

## 9. Error Handling (User-Facing)

### 9.1 Error Scenarios

| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
| Invalid credentials | Warning | "Login failed: Invalid credentials" | Stay on login, can retry |
| Network timeout | Warning | "Cannot reach backend at {url}" | Show retry option |
| Token refresh failed (auth) | Critical | "Session expired. Please login again." | Transition to UNAUTHENTICATED |
| Token refresh failed (network) | Info | (silent) | Retry next interval |
| SSO timeout (120s) | Warning | "SSO login timed out. Please try again." | Cancel flow |
| SSO state mismatch | Critical | "Security error during SSO. Please retry." | Abort, security log |
| Invalid provider config | Warning | "SSO provider '{name}' is misconfigured" | Show on activation |
| SecretStorage unavailable | Warning | "Cannot access secure storage" | Fallback to in-memory |

---

## 10. Testing Considerations

### 10.1 Test Scenarios

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-01 | Valid username/password login | correct creds | AUTHENTICATED state | High |
| TC-02 | Invalid credentials | wrong password | Error message, UNAUTHENTICATED | High |
| TC-03 | SSO PKCE full flow | valid auth code | AUTHENTICATED state | High |
| TC-04 | PKCE verifier length | generated | 43 <= len <= 128 | High |
| TC-05 | Token refresh success | valid token | New token stored | High |
| TC-06 | Token refresh 401 | expired token | UNAUTHENTICATED | High |
| TC-07 | Session restore on activation | stored valid token | Auto-AUTHENTICATED | High |
| TC-08 | Logout clears all data | authenticated | SecretStorage empty, UNAUTHENTICATED | High |
| TC-09 | Status bar updates | state changes | Correct icon/text | Medium |
| TC-10 | Multi-provider QuickPick | 2+ providers | Shows all, user selects | Medium |
| TC-11 | Network timeout handling | unreachable server | Error within 10s | Medium |
| TC-12 | SSO browser timeout | no callback 120s | Timeout error | Medium |

---

## 11. Appendix

### Sequence Diagram — Login Flow

![Sequence Login](diagrams/sequence-login.png)

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Auth State Machine | [state-auth.png](diagrams/state-auth.png) | [state-auth.drawio](diagrams/state-auth.drawio) |
| 3 | Sequence — Login Flow | [sequence-login.png](diagrams/sequence-login.png) | [sequence-login.drawio](diagrams/sequence-login.drawio) |
