# Technical Design Document (TDD)

## SA4E — F9-AUTH-SSO: Auth & SSO

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F9-AUTH-SSO |
| Title | Authentication & Single Sign-On |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2025-07-04 |
| Status | Draft |
| Related BRD | BRD-v1-F9-AUTH-SSO.docx |
| Related FSD | FSD-v1-F9-AUTH-SSO.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-04 | SA Agent | Initial TDD — technical design for Auth & SSO |

---

## 1. Introduction

### 1.1 Purpose

This TDD specifies HOW to implement the Auth & SSO module for the SA4E VS Code Extension. It covers architecture decisions, class design, token handling patterns, PKCE implementation details, and integration with VS Code host APIs.

### 1.2 Scope

- AuthManager state machine implementation
- PkceService cryptographic operations
- TokenRefreshTimer background scheduling
- VS Code SecretStorage integration layer
- OAuth2 PKCE redirect handling (URI handler vs localhost server)
- Extension commands and status bar integration
- Error handling and resilience patterns

### 1.3 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript | 5.x |
| Runtime | Node.js (VS Code) | 18+ |
| Host | VS Code Extension API | 1.80+ |
| Crypto | Node.js crypto module | Built-in |
| HTTP | Fetch API (global) | Built-in |
| Build | esbuild | Project-configured |
| Test | vitest | Project-configured |

### 1.4 Design Principles

- **Single Responsibility** — Each class has one clear purpose (AuthManager = state, PkceService = crypto, TokenRefreshTimer = scheduling)
- **Dependency Inversion** — AuthManager depends on SecretStorage interface, not concrete OS keychain
- **Fail-Safe** — Network failures do not corrupt local auth state
- **Security by Default** — Secrets never in plaintext, code_verifier never logged
- **VS Code Idioms** — Use Disposable pattern, EventEmitter, Command registration

### 1.5 Constraints

- Must use VS Code SecretStorage API (no direct OS keychain access)
- Must support Remote Development (SSH, Container, WSL)
- Extension activation must complete within 100ms (auth init is async, non-blocking)
- No external npm dependencies for crypto (use Node.js built-in)
- File limit: 200 lines per file, 20 lines per function

### 1.6 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-F9-AUTH-SSO.docx |
| FSD | FSD-v1-F9-AUTH-SSO.docx |

---

## 2. System Architecture

### 2.1 Architecture Overview

The Auth module follows a **layered plugin architecture** within the VS Code extension:

![Architecture Diagram](diagrams/architecture.png)

**Layers:**
1. **Commands Layer** — VS Code commands (login, logout, status) registered in extension.ts
2. **Manager Layer** — AuthManager orchestrates auth flows, manages state machine
3. **Services Layer** — PkceService (crypto), TokenRefreshTimer (scheduling)
4. **Storage Layer** — VS Code SecretStorage abstraction
5. **UI Layer** — Status bar item, input boxes, notifications

### 2.2 Component Diagram

![Component Diagram](diagrams/component.png)

| Component | Responsibility | Technology |
|-----------|---------------|------------|
| AuthManager | State machine, login/logout/refresh orchestration | TypeScript class, EventEmitter |
| PkceService | PKCE code_verifier/challenge generation | Node.js crypto |
| TokenRefreshTimer | Periodic token refresh scheduling | setInterval |
| AuthCommands | VS Code command handlers (login, logout, switch) | vscode.commands |
| AuthStatusBar | Status bar item rendering and click handling | vscode.StatusBarItem |
| SsoCallbackHandler | OAuth2 redirect capture (URI handler) | vscode.UriHandler |
| AuthConfigProvider | Read/validate SSO provider settings | vscode.workspace.getConfiguration |

### 2.3 Deployment Architecture

This is a VS Code extension — deployment is via VSIX package:
- Bundled with esbuild into single JS file
- Distributed via VS Code Marketplace or internal registry
- No separate server deployment (extension runs in VS Code process)

### 2.4 Communication Patterns

| From | To | Protocol | Pattern | Description |
|------|----|----------|---------|-------------|
| AuthManager | SA4E Backend | HTTPS REST | Sync (async/await) | Login, refresh, logout |
| AuthManager | SSO IdP | HTTPS REST | Sync (async/await) | Token exchange |
| AuthManager | SecretStorage | VS Code API | Async | Store/retrieve tokens |
| AuthManager | StatusBar | Event | Observer | State change updates |
| TokenRefreshTimer | AuthManager | Method call | Timer | Periodic refresh trigger |
| SsoCallbackHandler | AuthManager | Callback | Async | Auth code delivery |

---

## 3. API Design

### 3.1 API Overview (Backend Endpoints Consumed)

| # | Endpoint | Method | Description | Source |
|---|----------|--------|-------------|--------|
| 1 | /api/admin/auth/login | POST | Username/password authentication | UC-01 |
| 2 | /api/auth/refresh | POST | Token refresh | UC-04 |
| 3 | /api/auth/logout | POST | Server-side session invalidation | UC-05 |

### 3.2 API: Login

**Implements:** UC-01, BR-01, BR-02

| Attribute | Value |
|-----------|-------|
| Method | POST |
| Path | /api/admin/auth/login |
| Auth | None (this is the auth endpoint) |
| Timeout | 10 seconds |

**Request Body:**

```json
{
  "username": "string",
  "password": "string"
}
```

**Response — 200 OK:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "id": "uuid", "username": "string", "email": "string" },
  "expiresAt": "2025-07-04T11:00:00Z"
}
```

**Error Responses:**

| Status | Meaning | Action |
|--------|---------|--------|
| 401 | Invalid credentials | Show error, stay UNAUTHENTICATED |
| 423 | Account locked | Show error with admin contact |
| 429 | Rate limited | Show retry-after message |
| 5xx | Server error | Show generic error |

### 3.3 API: Token Refresh

**Implements:** UC-04, BR-14, BR-16

| Attribute | Value |
|-----------|-------|
| Method | POST |
| Path | /api/auth/refresh |
| Auth | Current token in body |
| Timeout | 5 seconds |

**Request Body:**

```json
{
  "refresh_token": "current_access_token"
}
```

**Response — 200 OK:**

```json
{
  "token": "new_jwt_token",
  "expiresAt": "2025-07-04T12:00:00Z"
}
```

**Error Handling:**

| Status | Action |
|--------|--------|
| 401/403/400/404 | Transition to UNAUTHENTICATED |
| Network error | Keep current token, retry next interval |

### 3.4 API: Logout

**Implements:** UC-05, BR-18

| Attribute | Value |
|-----------|-------|
| Method | POST |
| Path | /api/auth/logout |
| Auth | Current token in body |
| Timeout | 5 seconds |

**Request Body:**

```json
{
  "refresh_token": "current_access_token"
}
```

**Note:** This is best-effort. Failures are logged but do not block local cleanup.

---

## 4. Database Design

**N/A** — This module does not have a database. Token storage uses VS Code SecretStorage (OS keychain). Configuration uses VS Code settings.json.

### 4.1 Storage Keys

| Key | Storage | Content | Encryption |
|-----|---------|---------|------------|
| `kiroSdlc.accessToken` | SecretStorage (OS keychain) | JWT access token | OS-level encryption |
| `sa4e.auth.ssoProviders` | VS Code settings.json | Provider config array | Plaintext (not secret) |
| `sa4e.auth.backendUrl` | VS Code settings.json | Backend base URL | Plaintext |

---

## 5. Class / Module Design

### 5.1 Package Structure

```
extension/src/auth/
+-- AuthManager.ts          # State machine + login/logout/refresh orchestration
+-- PkceService.ts          # PKCE crypto operations
+-- TokenRefreshTimer.ts    # Background refresh scheduling
+-- SsoCallbackHandler.ts   # NEW: OAuth2 redirect URI handler
+-- AuthCommands.ts         # NEW: VS Code command registrations
+-- AuthStatusBar.ts        # NEW: Status bar item management
+-- AuthConfigProvider.ts   # NEW: Settings validation for SSO providers
+-- types.ts                # NEW: Shared types (AuthState, SsoProvider, etc.)
```

### 5.2 Key Interfaces

```typescript
// types.ts
export type AuthState = "UNAUTHENTICATED" | "AUTHENTICATING" | "AUTHENTICATED";

export interface SsoProvider {
  name: string;
  clientId: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes?: string[];
  isDefault?: boolean;
}

export interface PkceChallenge {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

export interface TokenResponse {
  token: string;
  user?: unknown;
  expiresAt?: string;
}

export interface AuthStateChangeEvent {
  oldState: AuthState;
  newState: AuthState;
}
```

### 5.3 Class: AuthManager (existing — refactored)

```typescript
export class AuthManager implements vscode.Disposable {
  // State
  private state: AuthState = "UNAUTHENTICATED";
  private cachedToken: string | null = null;
  private tokenExpiresAt: number | null = null;
  private tokenAcquiredAt: number | null = null;

  // Dependencies (injected)
  private readonly secrets: vscode.SecretStorage;
  private readonly baseUrl: string;
  private readonly refreshTimer: TokenRefreshTimer;
  private readonly pkceService: PkceService;

  // Events
  private _onStateChange: vscode.EventEmitter<AuthState>;
  readonly onStateChange: vscode.Event<AuthState>;

  // Public API
  async initialize(): Promise<void>;       // Restore session from storage
  async login(username: string, password: string): Promise<void>;
  async loginWithSso(provider: SsoProvider): Promise<void>;  // NEW
  async refreshToken(): Promise<void>;
  async logout(): Promise<void>;
  async getAccessToken(): Promise<string | null>;
  getTokenSync(): string;
  get currentState(): AuthState;
  get isAuthenticated(): boolean;
  dispose(): void;

  // Private
  private isExpired(): boolean;
  private transitionTo(newState: AuthState): void;
}
```

### 5.4 Class: PkceService (existing — unchanged)

```typescript
export class PkceService {
  generateCodeVerifier(): string;              // 32 random bytes -> base64url (43 chars)
  generateCodeChallenge(verifier: string): string;  // SHA-256 -> base64url
  generateState(): string;                     // NEW: 32 random bytes for CSRF protection
  private base64UrlEncode(buffer: Buffer): string;
}
```

### 5.5 Class: TokenRefreshTimer (existing — unchanged)

```typescript
export class TokenRefreshTimer {
  constructor(authManager: AuthManager);
  start(): void;   // setInterval(5 min)
  stop(): void;    // clearInterval
  private check(): Promise<void>;  // if authenticated, call refreshToken
}
```

### 5.6 Class: SsoCallbackHandler (NEW)

```typescript
export class SsoCallbackHandler implements vscode.UriHandler, vscode.Disposable {
  private pendingChallenge: PkceChallenge | null = null;
  private resolveCallback: ((code: string) => void) | null = null;
  private timeoutTimer: NodeJS.Timeout | null = null;

  // Start OAuth2 flow — returns auth code when callback received
  async startFlow(provider: SsoProvider, challenge: PkceChallenge): Promise<string>;

  // VS Code UriHandler implementation
  handleUri(uri: vscode.Uri): void;  // Captures redirect with auth code

  dispose(): void;
}
```

### 5.7 Class: AuthCommands (NEW)

```typescript
export class AuthCommands implements vscode.Disposable {
  constructor(authManager: AuthManager, configProvider: AuthConfigProvider);

  register(context: vscode.ExtensionContext): void;

  // Command handlers
  private handleLogin(): Promise<void>;
  private handleLoginSso(): Promise<void>;
  private handleLogout(): Promise<void>;
  private handleSwitchAccount(): Promise<void>;

  dispose(): void;
}
```

### 5.8 Class: AuthStatusBar (NEW)

```typescript
export class AuthStatusBar implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;

  constructor(authManager: AuthManager);

  private updateDisplay(state: AuthState): void;
  // AUTHENTICATED -> "$(key) Connected"
  // UNAUTHENTICATED -> "$(circle-slash) Not connected"
  // AUTHENTICATING -> "$(loading~spin) Authenticating..."

  dispose(): void;
}
```

### 5.9 Class: AuthConfigProvider (NEW)

```typescript
export class AuthConfigProvider implements vscode.Disposable {
  getProviders(): SsoProvider[];
  getDefaultProvider(): SsoProvider | undefined;
  getBackendUrl(): string;
  validateProviders(): ValidationResult[];

  private onConfigChange(): void;  // Watch settings changes
  dispose(): void;
}
```

### 5.10 Design Patterns

| Pattern | Where Used | Rationale |
|---------|-----------|-----------|
| State Machine | AuthManager | Explicit state transitions prevent invalid states |
| Observer | onStateChange event | Decoupled UI updates from auth logic |
| Strategy | Login method selection | Password vs SSO flows share same lifecycle |
| Facade | AuthCommands | Simplifies command registration |
| Disposable | All classes | VS Code resource cleanup pattern |
| Template Method | loginWithSso flow | Common pre/post steps, strategy-specific middle |

### 5.11 Error Handling

| Exception | Context | Action |
|-----------|---------|--------|
| AuthError (custom) | Login failures | Show user message, log sanitized error |
| Network timeout | Any fetch call | Show timeout message, keep current state |
| JSON parse error | Unexpected response | Show "Unexpected server response" |
| SecretStorage error | Keychain locked | Fallback to in-memory, show warning |
| PKCE generation error | crypto unavailable | Show "Crypto module unavailable" (fatal) |

---

## 6. Integration Design

### 6.1 VS Code URI Handler (OAuth2 Callback)

| Attribute | Value |
|-----------|-------|
| Protocol | vscode:// URI scheme |
| Registration | `vscode.window.registerUriHandler(handler)` |
| Redirect URI | `vscode://sa4e.auth/callback` |
| Timeout | 120 seconds |
| Retry Policy | No retry — user must reinitiate |

**Flow:**
1. Extension registers URI handler on activation
2. On SSO login: generate PKCE, open browser with `redirect_uri=vscode://sa4e.auth/callback`
3. After IdP auth: browser redirects to `vscode://sa4e.auth/callback?code=xxx&state=yyy`
4. VS Code routes URI to handler
5. Handler validates state, extracts code, resolves Promise

**Fallback (if URI handler unavailable):**
- Start localhost HTTP server on ephemeral port
- Use `http://localhost:{port}/callback` as redirect_uri
- Capture code from HTTP request, then close server

### 6.2 VS Code SecretStorage

| Attribute | Value |
|-----------|-------|
| Protocol | VS Code API (in-process) |
| Key | `kiroSdlc.accessToken` |
| Encryption | OS-provided (Keychain/Credential Manager/Secret Service) |
| Availability | Always available in Desktop VS Code; limited in web/remote |

**API Usage:**
```typescript
// Store
await secrets.store("kiroSdlc.accessToken", token);

// Retrieve
const token = await secrets.get("kiroSdlc.accessToken");

// Delete
await secrets.delete("kiroSdlc.accessToken");
```

---

## 7. Security Design

### 7.1 Authentication Flow Security

| Concern | Mitigation |
|---------|-----------|
| Password in transit | HTTPS only (enforced by fetch to https:// URLs) |
| Password in memory | Cleared after POST, never stored |
| Token at rest | VS Code SecretStorage (OS keychain encryption) |
| Token in memory | Single `cachedToken` field, cleared on logout |
| code_verifier exposure | Never logged, exists only in function scope during flow |
| CSRF on callback | Random `state` parameter validated on receipt |
| Token in logs | All auth-related logging sanitizes token values |
| Replay attack | Token has expiry + single-use refresh |

### 7.2 PKCE Security

| Requirement | Implementation |
|-------------|---------------|
| code_verifier: 43-128 chars | 32 random bytes -> base64url = 43 chars |
| S256 only (no plain) | Hardcoded `code_challenge_method: "S256"` |
| Cryptographic randomness | `crypto.randomBytes(32)` |
| No verifier logging | Log statements explicitly exclude verifier |

### 7.3 Input Validation

| Field | Validation | Sanitization |
|-------|-----------|--------------|
| username | Non-empty, max 255 chars | Trimmed, no HTML encode needed (sent as JSON) |
| password | Non-empty | Never logged, never stored |
| auth_code | Non-empty, URL-safe chars | Validated before use in token exchange |
| state | Must match stored state exactly | Strict string equality |
| provider URLs | Must be valid HTTPS URLs | URL parsing validation |

---

## 8. Performance & Scalability

### 8.1 Performance Targets

| Operation | Target | Measurement |
|-----------|--------|-------------|
| Extension activation (auth init) | < 100ms | No blocking I/O in activate() |
| Login (password) | < 3s total | From submit to AUTHENTICATED |
| Login (SSO) | < 5s (excl. browser time) | Token exchange after callback |
| Token refresh | < 2s | Background, no UI block |
| Session restore | < 500ms | SecretStorage read + expiry check |

### 8.2 Resource Usage

| Resource | Target | Strategy |
|----------|--------|----------|
| Memory | < 1MB | Only cache single token string |
| CPU (idle) | ~0% | Timer fires every 5 min, single check |
| CPU (refresh) | < 10ms | Single HTTP call |
| Network | 1 request / 5 min | Token refresh only |

### 8.3 Timer Efficiency

- TokenRefreshTimer uses `setInterval(5 * 60 * 1000)`
- Check is O(1): compare timestamps
- Refresh only triggered if within 60s of expiry
- Timer automatically stops when not AUTHENTICATED

---

## 9. Monitoring & Observability

### 9.1 Logging

| Log Event | Level | Fields | Note |
|-----------|-------|--------|------|
| Login attempt | INFO | method (password/sso), provider name | No credentials |
| Login success | INFO | method, username | No token |
| Login failure | WARN | method, error type, status code | No credentials |
| Token refresh success | DEBUG | (none) | Minimal noise |
| Token refresh failure | WARN | error type, status code | No token |
| Logout | INFO | (none) | |
| State transition | DEBUG | oldState, newState | |
| SSO timeout | WARN | provider name, timeout duration | |
| Config validation error | WARN | provider name, missing fields | |

### 9.2 Telemetry (optional, if extension has telemetry)

| Metric | Type | Description |
|--------|------|-------------|
| auth.login.count | Counter | Total login attempts |
| auth.login.method | Counter (by label) | password vs sso breakdown |
| auth.refresh.success_rate | Gauge | % successful refreshes |
| auth.session.duration | Histogram | Time between login and logout |

---

## 10. Deployment Considerations

### 10.1 Extension Configuration (contributes)

```json
{
  "contributes": {
    "commands": [
      { "command": "sa4e.auth.login", "title": "SA4E: Login" },
      { "command": "sa4e.auth.loginSso", "title": "SA4E: Login with SSO" },
      { "command": "sa4e.auth.logout", "title": "SA4E: Logout" },
      { "command": "sa4e.auth.switchAccount", "title": "SA4E: Switch Account" }
    ],
    "configuration": {
      "title": "SA4E Auth",
      "properties": {
        "sa4e.auth.backendUrl": {
          "type": "string",
          "default": "",
          "description": "SA4E backend base URL"
        },
        "sa4e.auth.ssoProviders": {
          "type": "array",
          "default": [],
          "description": "OAuth2 SSO provider configurations",
          "items": {
            "type": "object",
            "properties": {
              "name": { "type": "string" },
              "clientId": { "type": "string" },
              "authorizationUrl": { "type": "string" },
              "tokenUrl": { "type": "string" },
              "scopes": { "type": "array", "items": { "type": "string" } },
              "isDefault": { "type": "boolean" }
            },
            "required": ["name", "clientId", "authorizationUrl", "tokenUrl"]
          }
        }
      }
    }
  }
}
```

### 10.2 Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| sa4e.auth.enableSso | true | Enable/disable SSO login option |
| sa4e.auth.refreshInterval | 300000 | Token refresh interval in ms (5 min) |
| sa4e.auth.ssoTimeout | 120000 | SSO browser flow timeout in ms |

### 10.3 Rollback Strategy

- Auth module is self-contained in `extension/src/auth/`
- Rollback = revert to previous extension version (VSIX)
- Stored tokens in SecretStorage remain valid across versions
- No database migration needed

---

## 11. Implementation Checklist

### Files to Create/Modify

| # | File | Action | Lines (est.) | Priority |
|---|------|--------|-------------|----------|
| 1 | `auth/types.ts` | CREATE | ~40 | P0 |
| 2 | `auth/AuthManager.ts` | MODIFY (add SSO support) | ~180 | P0 |
| 3 | `auth/PkceService.ts` | MODIFY (add generateState) | ~40 | P0 |
| 4 | `auth/TokenRefreshTimer.ts` | NO CHANGE | ~35 | — |
| 5 | `auth/SsoCallbackHandler.ts` | CREATE | ~90 | P0 |
| 6 | `auth/AuthCommands.ts` | CREATE | ~100 | P1 |
| 7 | `auth/AuthStatusBar.ts` | CREATE | ~60 | P1 |
| 8 | `auth/AuthConfigProvider.ts` | CREATE | ~80 | P1 |
| 9 | `extension.ts` | MODIFY (register auth components) | +20 lines | P0 |
| 10 | `package.json` | MODIFY (add commands, config) | +50 lines | P0 |

### Implementation Order

1. **types.ts** — Define shared interfaces
2. **PkceService** — Add `generateState()` method
3. **SsoCallbackHandler** — URI handler + timeout
4. **AuthManager** — Add `loginWithSso()` method
5. **AuthConfigProvider** — Settings validation
6. **AuthCommands** — Command registration
7. **AuthStatusBar** — Status bar UI
8. **extension.ts** — Wire everything together
9. **Tests** — Unit tests for each class

---

## 12. Appendix

### Open Questions

| # | Question | Status | Answer |
|---|----------|--------|--------|
| 1 | Should we support VS Code web (vscode.dev)? | Open | SecretStorage works, but URI handler may not |
| 2 | Multiple simultaneous sessions (multi-window)? | Resolved | No — single session shared via SecretStorage |
| 3 | Token format validation (JWT decode)? | Resolved | No — treat as opaque string, trust backend |

### Glossary

| Term | Definition |
|------|------------|
| URI Handler | VS Code API that captures `vscode://` protocol URIs |
| SecretStorage | VS Code API backed by OS credential manager |
| PKCE | Proof Key for Code Exchange (RFC 7636) |
| Disposable | VS Code pattern for resource cleanup |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture Overview | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component Diagram | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
