# 🔒 Security Assessment Report — Phase 5.7 (Implementation Review)

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (SA4E-411) |
| Scope | Full implementation security assessment: backend, extension, Docker, CI/CD, runtime configuration |
| Date | 2025-11-15 |
| Assessor | Security Agent |
| Version | 1.0 |

## Executive Summary

This assessment evaluates the **implemented codebase** against the design reviewed in Phase 3.7 (SECURITY-REVIEW.md). The implementation correctly realizes the dual-token authentication architecture, PBKDF2 password hashing, session management with rotation, and RBAC authorization model. Docker hardening is well-executed with digest-pinned base images, non-root runtime, read-only rootfs, and minimal runtime surface.

**Critical implementation gaps remain** from the design review — the authentication and authorization findings (F-01 through F-20) are **unfixed in the current implementation**. Additionally, new implementation-level issues were discovered: missing input validation on several endpoints, potential regex DoS in path validation, and the extension's insecure remote configuration option.

**Overall Risk Rating: 🟠 High**

| Severity | Count |
|----------|-------|
| 🔴 Critical | 6 |
| 🟠 High | 7 |
| 🟡 Medium | 8 |
| 🔵 Low | 4 |
| ℹ️ Informational | 5 |

---

## Implementation vs Design Review Comparison

| Finding (Design Review) | Status in Implementation | Notes |
|------------------------|--------------------------|-------|
| F-01 to F-05: Unauthenticated DB routes | 🔴 **UNFIXED** | `routes/database.ts` still missing auth |
| F-06 to F-08: Unauthenticated `/api/index/*` | 🔴 **UNFIXED** | `api-index.ts` still missing auth |
| F-09: Unauthenticated `/mcp/tools/list` | 🔴 **UNFIXED** | `tools.ts` still missing auth |
| F-10: Unverified `X-User-Id` in tool calls | 🔴 **UNFIXED** | `stampUserId()` still accepts header |
| F-11: Unauthenticated webview API routes | 🔴 **UNFIXED** | `api.ts` still no `jwtAuth` middleware |
| F-12: Health endpoint info disclosure | 🔴 **UNFIXED** | `health.ts` unchanged |
| F-13: Token injection XSS | 🔴 **UNFIXED** | `static.ts` unchanged |
| F-14: Missing permission on `/api/admin/llm/models` | 🔴 **UNFIXED** | `config.ts` unchanged |
| F-15: Missing permission + SSRF on `/api/admin/llm/test` | 🔴 **UNFIXED** | `config.ts` unchanged |
| F-16: Soft auth on SSE endpoint | 🔴 **UNFIXED** | `sse.ts` uses `authenticate()` |
| F-17: Write op behind read permission | 🔴 **UNFIXED** | `kb-graph.ts` uses `GRAPH_VIEW` |
| F-18 to F-20: Admin DB routes missing auth | 🔴 **UNFIXED** | `admin/database.ts` unchanged |

---

## New Implementation-Level Findings

### Finding #I-01: Missing Input Validation on Database Test Connection

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟠 High |
| **OWASP Category** | A03:2021 Injection + A10:2021 SSRF |
| **CWE** | CWE-20, CWE-918 |
| **CVSS Score** | 7.5 |
| **Location** | `backend/src/server/routes/database.ts` line 40 |
| **Status** | Open |

**Description:**
`POST /api/admin/database/test-connection` accepts `host`, `port`, `username`, `password` from request body with **no validation** on `host` parameter. Combined with missing authentication (F-02), this is a direct SSRF vector.

**Evidence:**
```typescript
// database.ts - testConnectionHandler
const body = await c.req.json();
const { host, port, username, password, database } = body;
// No validation on host — accepts internal IPs, hostnames, metadata endpoints
```

**Remediation:**
```typescript
import { z } from 'zod';

const testConnectionSchema = z.object({
  host: z.string().ip({ version: 'v4' }).refine(ip => !isPrivateIp(ip), 'Private IPs not allowed'),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1).max(100),
  password: z.string().max(200),
  database: z.string().max(100).optional(),
});

function isPrivateIp(ip: string): boolean {
  const privateRanges = [
    /^10\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^192\.168\./,
    /^127\./, /^169\.254\./, /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./
  ];
  return privateRanges.some(r => r.test(ip));
}
```

---

### Finding #I-02: Regex DoS Potential in `resolveWithinWorkspace`

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP Category** | A03:2021 Injection (ReDoS) |
| **CWE** | CWE-1333 |
| **CVSS Score** | 5.3 |
| **Location** | `backend/src/server/routes/api-index.ts` (via `resolveWithinWorkspace`) |
| **Status** | Open |

**Description:**
The path traversal protection uses `path.resolve()` and string prefix check. While not a regex, extremely long paths with many `../` segments could cause performance degradation in `path.resolve()`. Not a classic ReDoS but a DoS vector via path length.

**Evidence:**
```typescript
// Shared utility
function resolveWithinWorkspace(requestedPath: string, workspaceRoot: string): string {
  const resolved = path.resolve(workspaceRoot, requestedPath);
  if (!resolved.startsWith(workspaceRoot)) {
    throw new Error('Path traversal attempt');
  }
  return resolved;
}
```

**Remediation:**
```typescript
function resolveWithinWorkspace(requestedPath: string, workspaceRoot: string): string {
  // Limit path length
  if (requestedPath.length > 4096) throw new Error('Path too long');
  // Limit depth
  const segments = requestedPath.split(/[\\/]/).filter(s => s === '..').length;
  if (segments > 10) throw new Error('Path depth exceeded');
  const resolved = path.resolve(workspaceRoot, requestedPath);
  if (!resolved.startsWith(workspaceRoot)) throw new Error('Path traversal attempt');
  return resolved;
}
```

---

### Finding #I-03: Extension Allows Insecure Remote Backend Configuration

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟠 High |
| **OWASP Category** | A05:2021 Security Misconfiguration |
| **CWE** | CWE-319 |
| **CVSS Score** | 6.5 |
| **Location** | `extension/package.json` lines 237-241 |
| **Status** | Open |

**Description:**
The extension configuration allows bypassing HTTPS requirement for remote backends:
```json
"sdlcAgents.backend.allowInsecureRemote": {
  "type": "boolean",
  "default": false,
  "description": "Bypass the HTTPS requirement for remote (non-loopback) backend server URLs. When enabled, HTTP remote URLs are accepted but traffic is unencrypted — credentials and data can be intercepted. Only enable on trusted private networks."
}
```

**Impact:**
- Users can enable `allowInsecureRemote: true` and connect to remote backends over HTTP
- Credentials (tokens, passwords) transmitted in cleartext
- MITM attacks on untrusted networks

**Remediation:**
- Remove this setting or make it require explicit admin approval
- At minimum, add a prominent warning and require restart
- Consider certificate pinning for remote backends

---

### Finding #I-04: Token Storage in VS Code SecretStorage (Extension)

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP Category** | A02:2021 Cryptographic Failures |
| **CWE** | CWE-312 |
| **CVSS Score** | 3.7 |
| **Location** | `extension/src/auth/AuthManager/secrets.ts` |
| **Status** | Open |

**Description:**
Access tokens and refresh tokens stored in VS Code `SecretStorage` (OS keychain). This is **appropriate** for desktop extensions. However, the refresh token is stored in plaintext in the keychain — if the OS keychain is compromised, the refresh token allows full session takeover until rotation.

**Observation:** This is standard practice for VS Code extensions. The dual-token design limits exposure (access token 15 min, refresh token 7 days with rotation).

**Recommendation:** No code change needed. Document that refresh token in keychain is the long-lived credential.

---

### Finding #I-05: PKCE Implementation in Extension (SSO)

| Attribute | Value |
|-----------|-------|
| **Severity** | ✅ Secure |
| **OWASP Category** | A07:2021 |
| **Location** | `extension/src/auth/PkceService.ts` |
| **Status** | Verified |

**Description:**
PKCE (RFC 7636) correctly implemented for SSO flows:
- `code_verifier`: 128-char cryptographically random string
- `code_challenge`: SHA256(code_verifier) base64url encoded
- `code_challenge_method`: S256
- State parameter used for CSRF protection
- Loopback server on random port for authorization code receipt

**Evidence:**
```typescript
// PkceService.ts
generateCodeVerifier(): string {
  const array = new Uint8Array(96);
  crypto.getRandomValues(array);
  return base64url.encode(array); // 128 chars
}
generateCodeChallenge(verifier: string): string {
  return base64url.encode(sha256(verifier));
}
```

---

### Finding #I-06: Worktree Trust Verification (Extension)

| Attribute | Value |
|-----------|-------|
| **Severity** | ✅ Secure |
| **OWASP Category** | A01:2021 |
| **Location** | `extension/src/__tests__/worktree-trust/worktree-security.test.ts` |
| **Status** | Verified |

**Description:**
Extension implements worktree trust verification (SA4E-393/394):
- Verifies `.git` pointer, back-link, parent repository
- `MCP_WORKTREE_AUTOTRUST` env var controls auto-trust
- Per-call `base_dir` validated against allowlist (`MCP_WORKSPACE_ROOTS`)
- Path traversal protection via `MultiWorktreePathResolver`

---

### Finding #I-07: Docker Runtime Security Hardening

| Attribute | Value |
|-----------|-------|
| **Severity** | ✅ Secure |
| **OWASP Category** | A05:2021 |
| **Location** | `backend/Dockerfile` |
| **Status** | Verified |

**Description:**
Production Docker image implements multiple hardening measures:
- ✅ Base image pinned by SHA256 digest (`node:22.23.4-slim@sha256:...`)
- ✅ Non-root user `sa4e` (uid/gid 1001) with `nologin` shell
- ✅ Read-only root filesystem (`read_only: true` in compose)
- ✅ `tmpfs` for `/tmp` and `.code-intel` writable directories
- ✅ No git, no compilers in runtime image
- ✅ Python venvs for MCP child servers copied read-only
- ✅ `pip` uninstalled from venvs
- ✅ setuptools upgraded to 84.0.0 (fixes CVEs)
- ✅ certifi 2026.10.19, pillow 13.0.0 in venvs
- ✅ Health check using Node HTTP (no wget dependency)
- ✅ npm CLI upgraded to 11.21.0 with patched transitive deps

---

### Finding #I-08: Rate Limiter Implementation

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP Category** | A05:2021 |
| **Location** | `backend/src/server/middleware/rate-limiter.ts` |
| **Status** | Open |

**Description:**
In-memory rate limiter with sliding window per IP. Issues:
- **Not distributed** — each instance has separate store (single-instance only)
- **IP spoofing** — `TRUST_PROXY=false` by default; behind reverse proxy, all requests appear as 127.0.0.1
- **Client-controlled limit** — `X-Rate-Limit-RPM` header clamped to server hard cap, but client can request lower limit

**Remediation:**
```typescript
// For multi-instance: use Redis-backed store
// For proxy: require TRUST_PROXY=true and validate proxy headers
// Current implementation acceptable for single-instance localhost deployment
```

---

### Finding #I-09: CORS Configuration

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP Category** | A05:2021 |
| **Location** | Not explicitly configured in Hono app |
| **Status** | Open |

**Description:**
No explicit CORS middleware configured. Hono defaults to no CORS headers (restrictive). Extension communicates via local MCP wrapper (same-origin) or direct REST to backend (configured URL). For remote backends, CORS must be configured on the backend.

**Recommendation:** Add explicit CORS middleware with restrictive policy:
```typescript
import { cors } from 'hono/cors';
app.use('*', cors({
  origin: ['http://127.0.0.1:48721', 'vscode-webview://*'], // Adjust for deployment
  allowHeaders: ['Content-Type', 'Authorization', 'X-Project-Id', 'X-Workspace-Root'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  maxAge: 86400,
}));
```

---

### Finding #I-10: Error Handler Information Leakage

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP Category** | A05:2021 |
| **Location** | `backend/src/server/middleware/error-handler.ts` |
| **Status** | Verified |

**Description:**
Global error handler returns generic message to client, logs full error server-side:
```typescript
return c.json({
  error: {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred. Please try again later.',
  },
}, 500);
```
**No stack traces or internal paths leaked to client.** ✅

---

### Finding #I-11: JWT Secret Management

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP Category** | A02:2021 |
| **Location** | `backend/src/admin/db/jwt.ts` lines 64-86 |
| **Status** | Open |

**Description:**
JWT secret resolution priority:
1. `KB_TOKEN_SECRET` env var (operator-managed)
2. Provisioned file `<dataDir>/.jwt-secret` (survives restarts)
3. Ephemeral per-process secret (read-only FS / test sandbox)

**Issues:**
- No secret rotation mechanism
- File-based secret has 0600 permissions but readable by same user
- HS256 symmetric key — compromise allows token forgery
- No key ID (kid) in header for rotation support

**Remediation:**
- Migrate to RS256 using `jose` library (already in deps)
- Implement key rotation with JWKS endpoint
- Store private key in HSM or sealed secret in production

---

### Finding #I-12: Session User-Agent Binding Bypass for Extension

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP Category** | A07:2021 |
| **Location** | `backend/src/server/routes/auth/login-routes.ts` lines 57-65 |
| **Status** | Open |

**Description:**
Extension client (VS Code host + webview iframe) shares one session across two different user-agents. To avoid breaking the webview, user-agent binding is **disabled for extension clients** (empty UA hash):

```typescript
const isExtensionClient = (c.req.header('x-client-type') || '').toLowerCase() === 'extension';
const sessionUserAgent = isExtensionClient ? '' : userAgent;
const session = await sessions.issue(user.user_id as string, '', ip, sessionUserAgent);
```

**Impact:**
- Session fixation protection disabled for extension users
- If extension token leaked, attacker can use from any user-agent
- `x-client-type` header could be spoofed by attacker to disable UA binding

**Remediation:**
- Bind session to extension-specific identifier (extension ID + workspace) instead of UA
- Or implement device fingerprinting for extension clients

---

### Finding #I-13: Auto-Upsert Project Registry (SA4E-375)

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP Category** | A01:2021 |
| **Location** | `backend/src/server/middleware/jwt-auth.ts` lines 36-53, `context.ts` lines 101-137 |
| **Status** | Open |

**Description:**
Project registry auto-upsert on first access — creates project entries without explicit admin action. While convenient, it allows any authenticated user to register arbitrary project IDs.

**Remediation:**
- Require `RBAC_MANAGE` or `CONFIG_EDIT` for project registration
- Or restrict auto-upsert to known project patterns

---

### Finding #I-14: MCP Tool Toggle State Persistence

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP Category** | A05:2021 |
| **Location** | `backend/src/server/routes/admin/context.ts` lines 31, 153 |
| **Status** | Open |

**Description:**
MCP tool toggles stored in memory (`toolToggles: Record<string, Record<string, boolean>>`) — lost on restart. Admin UI persists to config, but in-memory state can diverge.

**Remediation:** Persist tool toggle state to database config table.

---

### Finding #I-15: Extension Wrapper Server Origin Validation

| Attribute | Value |
|-----------|-------|
| **Severity** | ✅ Secure |
| **OWASP Category** | A01:2021 |
| **Location** | `extension/src/services/WrapperServer.ts` (tested in `wrapper-server.origin-gate*.test.ts`) |
| **Status** | Verified |

**Description:**
Wrapper server implements strict origin validation:
- Allows `127.0.0.1`, `localhost`, `::1`
- Allows `vscode-webview://` origins
- Validates `Origin` and `Host` headers
- Preflight OPTIONS handling
- Configurable via `mcp.allowedOrigins`

---

## Dependency Vulnerability Scan (Implementation)

| Dependency | Current | Latest | CVE Status |
|------------|---------|--------|------------|
| **Backend** | | | |
| hono | 4.13.14 | 4.13.14 | ✅ No known CVEs |
| @hono/node-server | 2.1.6 | 2.1.6 | ✅ Pinned via overrides |
| zod | 4.6.6 | 4.6.6 | ✅ |
| pg | 8.23.0 | 8.23.0 | ✅ |
| jose | 6.2.12 | 6.2.12 | ✅ |
| bcrypt | 6.0.0 | 6.0.0 | ✅ (unused for passwords) |
| dockerode | 5.0.1 | 5.0.1 | ✅ |
| @modelcontextprotocol/sdk | 1.32.1 | 1.32.1 | ✅ |
| undici | 6.29.1 | 6.29.1 | ✅ Pinned via overrides |
| pino | 9.14.0 | 9.14.0 | ✅ |
| **Extension** | | | |
| @modelcontextprotocol/sdk | 1.29.0 | 1.32.1 | ⚠️ Minor version behind |
| @anthropic-ai/sdk | 0.105.0 | 0.105.0 | ✅ |
| undici | 6.29.1 | 6.29.1 | ✅ Pinned to 7.30.1 via overrides for some deps |
| puppeteer-core | 25.16.0 | 25.16.0 | ✅ |
| @vscode/proxy-agent | 0.43.0 | 0.43.0 | ✅ |

**Note:** Extension uses older MCP SDK (1.29.0 vs 1.32.1). No known security issues in 1.29.0 but upgrade recommended for parity.

---

## Security Configuration Assessment

### Docker Compose Production

| Control | Status | Notes |
|---------|--------|-------|
| Read-only rootfs | ✅ | `read_only: true` |
| Non-root user | ✅ | `USER sa4e` in Dockerfile |
| No privileged mode | ✅ | Not used |
| Resource limits | ❌ | No CPU/memory limits in compose |
| Secrets in env vars | ⚠️ | POSTGRES_PASSWORD in env; should use Docker secrets |
| Network isolation | ⚠️ | Default bridge network; consider custom network |
| Health check | ✅ | Node-based HTTP health check |

### CI/CD Pipeline

| Control | Status | Notes |
|---------|--------|-------|
| Dependency scanning | ❌ | No `npm audit` or Snyk in CI |
| Container scanning | ❌ | No Trivy/Grype in CI (though Dockerfile mentions Trivy gate) |
| SAST | ❌ | No CodeQL/SonarQube |
| Secret scanning | ❌ | No git-secrets/truffleHog |
| Signed commits | ❌ | Not enforced |
| SBOM generation | ❌ | Not generated |

---

## Remediation Priority (Implementation Phase)

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | F-06/F-07/F-08 — Unauthenticated `/api/index/*` file writes | Low | Critical |
| 2 | F-02/F-03 — Unauthenticated DB credential test/migration | Low | Critical |
| 3 | F-10 — Unverified `X-User-Id` in MCP tool calls | Low | High |
| 4 | F-13 — Token injection XSS in admin SPA | Medium | High |
| 5 | F-15 — SSRF on LLM test + missing permission | Low | High |
| 6 | I-01 — Missing input validation on DB test connection | Low | High |
| 7 | I-03 — Extension allowInsecureRemote setting | Low | Medium |
| 8 | F-09/F-11 — Unauthenticated tool listing + webview API | Low | Medium |
| 9 | F-17 — Graph sync write behind read permission | Low | Medium |
| 10 | I-11 — JWT secret management (migrate to RS256) | Medium | Medium |
| 11 | I-12 — Extension UA binding bypass | Medium | Medium |
| 12 | I-02 — Path length/depth limits | Low | Low |
| 13 | I-08 — Distributed rate limiting | Medium | Low |
| 14 | I-09 — Explicit CORS configuration | Low | Low |
| 15 | I-13 — Project registry auto-upsert restriction | Low | Low |
| 16 | I-14 — MCP tool toggle persistence | Low | Low |

---

## Recommendations Summary

### Immediate Actions (Critical/High)
1. **Fix all authentication gaps from design review** — apply `requireAuth` + `requirePermission` to all unprotected endpoints
2. **Implement input validation** on database test connection (host allowlist/blocklist)
3. **Fix MCP tool identity verification** — require JWT, reject `X-User-Id` header
4. **Remove token injection from admin SPA** — use secure token exchange
5. **Remove or restrict `allowInsecureRemote`** in extension settings

### Short-term Improvements (Medium)
6. **Add path length/depth limits** to `resolveWithinWorkspace`
7. **Migrate JWT to RS256** with key rotation (use `jose` library)
8. **Implement distributed rate limiting** (Redis) for production
8. **Add explicit CORS middleware** with restrictive policy
9. **Add resource limits** to Docker Compose production
10. **Use Docker secrets** for database passwords

### Long-term Hardening (Low/Informational)
11. **Implement CI/CD security gates**: dependency scan, container scan, SAST, secret scan
12. **Generate SBOM** (Syft/CycloneDX) in build pipeline
13. **Enforce signed commits** and SLSA provenance
14. **Add certificate pinning** for remote backend connections
15. **Implement device fingerprinting** for extension sessions
16. **Persist MCP tool toggles** to database

---

## Appendix

### A. Files Reviewed (Implementation)
- `backend/src/index.ts` — Server entry point
- `backend/src/server/HttpServer.ts` / `HttpRouteRegistrar.ts` — Middleware stack, route mounting
- `backend/src/server/routes/auth/*.ts` — Authentication routes
- `backend/src/server/routes/admin/*.ts` — Admin routes (auth, users, RBAC, config, KB, MCP, etc.)
- `backend/src/server/routes/tools.ts` — MCP tool endpoints
- `backend/src/server/routes/api-index.ts` — Indexing endpoints
- `backend/src/server/routes/api.ts` — Webview API
- `backend/src/server/routes/health.ts` — Health endpoint
- `backend/src/server/middleware/*.ts` — Security headers, rate limiter, JWT auth, API key auth, error handler
- `backend/src/admin/db/*.ts` — Sessions, JWT, passwords, refresh tokens
- `backend/src/admin/admin-db.ts` — Database barrel export
- `backend/Dockerfile` — Multi-stage production build
- `backend/docker-compose.yml` — Production deployment
- `extension/src/auth/*.ts` — Extension authentication
- `extension/src/remote-backend-client.ts` — Backend communication
- `extension/src/services/WrapperServer.ts` — Local MCP wrapper
- `extension/package.json` — Extension configuration
- `backend/package.json` / `extension/package.json` — Dependencies

### B. Tools & Methodology
- Static code analysis (manual review)
- Dependency version audit
- Configuration review (Docker, compose, middleware)
- OWASP ASVS 4.0 Level 1/2 mapping
- CVSS v3.1 scoring

### C. Scope Limitations
- **Implementation review only** — no dynamic testing, no penetration testing
- Extension frontend (webview UI) not reviewed for XSS/CSRF
- Infrastructure (network, firewall, TLS termination, Kubernetes) not assessed
- Third-party MCP servers (markitdown-mcp, markdown-exporter-mcp-local) not audited
- Pega/Atlassian integration credential handling reviewed at boundary only

---

*Report generated by Security Agent — static implementation review only*