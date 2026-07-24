# Business Requirements Document (BRD)

## Code Intelligence MCP Server — SA4E-55: Security: Fix Authentication/Authorization Vulnerabilities in Backend API

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-55 |
| Title | Security: Fix authentication/authorization vulnerabilities in backend API |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-07-23 |
| Status | Draft |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | BA Agent – Business Analyst | Create document |
| Peer Reviewer | TA Agent – Technical Analyst | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-23 | BA Agent | Initial document — documenting security fix requirements for findings F-01 through F-20 |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |

---

## 1. Introduction

### 1.1 Scope

SA4E-55 is a security hotfix for the **Code Intelligence MCP Server** backend API. A static security audit identified 20 authentication/authorization vulnerabilities (F-01 to F-20) across three categories: unauthenticated endpoints, missing authorization checks, and identity spoofing risks.

This BRD documents the business requirements for all security fixes that were implemented. The fixes address:
- **Critical file write endpoints** (`/api/index/*`) — 3 endpoints with no authentication allowing unauthenticated disk writes
- **Critical database administration endpoints** (`/api/admin/database/*`) — 5 public-facing routes with no auth, enabling DB credential exposure and SSRF
- **MCP tool endpoints** (`/mcp/tools/*`) — tool enumeration with no auth and identity spoofing via unverified header
- **Admin portal XSS** (`GET /admin?token=...`) — unsanitized token injection into HTML
- **Admin LLM endpoints** — missing permission check creating SSRF risk
- **Data isolation** (`GET /api/admin/projects`) — all workspaces returned regardless of caller identity
- **Privilege escalation** (`POST /api/admin/kb/graph/sync`) — write operation gated on read-only permission
- **Admin database routes duplicate** (`/api/admin/database/*` via admin module) — same auth gaps in the admin-module version


### 2.3 Details of User Stories

---

#### Business Flow

The security requirement flow follows this pattern for every protected API endpoint:

**Step 1:** Caller sends HTTP request with `Authorization: Bearer {token}` header (or `X-API-Key` header).

**Step 2:** Authentication middleware validates the token — either as a JWT (HS256-signed, non-expired) or as an opaque admin session token validated against the sessions table.

**Step 3:** If no valid token → return `401 Unauthorized`. Request is rejected.

**Step 4:** If valid token → extract caller identity (`userId`) from the verified token payload. Never accept identity from client-supplied headers like `X-User-Id`.

**Step 5:** Authorization check — verify the caller holds the required permission for the requested operation (e.g., `CONFIG_EDIT` for database admin, `RBAC_MANAGE` for admin-level operations).

**Step 6:** If caller lacks the required permission → return `403 Forbidden`.

**Step 7:** If caller has the required permission → execute the operation with the caller's scoped identity. For data-returning operations, filter results to the caller's own data (e.g., workspaces created by the caller's userId).

**Step 8:** Return the operation result to the caller.

> **Note:** Endpoints accessed by API key (when `CODE_INTEL_API_KEY` env var is set) bypass session/JWT checks but still go through the API key validation. Identity is set to the sentinel `'api-key-user'`.

---

#### STORY 1: Secure File Indexing Endpoints (F-06, F-07, F-08)

> As a security engineer, I want all file-write endpoints to require authentication, so that unauthenticated callers cannot write files to the server's workspace.

**Requirement Details:**

1. `POST /api/index/source`, `POST /api/index/document`, and `POST /api/index/documents` MUST require a valid Bearer token before processing any request body.
2. Token validation MUST use `validateSession()` from `admin/db/sessions.ts`. If the token is missing or invalid, the endpoint returns `401 { "error": "Unauthorized" }`.
3. The `userId` extracted from the validated session MUST be passed to `registerProjectPhase()` as the `createdBy` parameter for audit trail purposes.
4. Path traversal protection via `resolveWithinWorkspace()` remains in place as an additional defense layer.
5. All three endpoints share the same `requireAuth()` helper pattern to ensure consistency.

**Acceptance Criteria:**

1. `POST /api/index/source` without Authorization header → returns HTTP 401
2. `POST /api/index/source` with valid admin session token → writes files and returns `{ written, rejected, reindexTriggered, projectId }`
3. `POST /api/index/document` without Authorization header → returns HTTP 401
4. `POST /api/index/documents` without Authorization header → returns HTTP 401
5. Requests with an expired or invalid token → return HTTP 401
6. Unsafe file paths (e.g., `../../../etc/passwd`) remain rejected regardless of auth status

---

#### STORY 2: Secure Database Administration Endpoints (F-01 to F-05 and F-18 to F-20)

> As a security engineer, I want all database administration endpoints to require authentication + CONFIG_EDIT permission, so that DB credentials and migration operations are protected from unauthorized access and SSRF.

**Requirement Details:**

1. All endpoints under `/api/admin/database/*` (both `routes/database.ts` and `admin/routes/database.ts`) MUST require a valid session token verified via `validateSession()`.
2. After authentication, each endpoint MUST verify the caller holds `CONFIG_EDIT` permission via `ctx.requirePermission()`.
3. `POST /api/admin/database/test-connection` sends user-supplied host/port/credentials to an external DB — this MUST only execute for authenticated, authorized callers to prevent SSRF network scanning.
4. `POST /api/admin/database/migrate` triggers a full database migration SSE stream — MUST require auth + `CONFIG_EDIT` permission before starting the stream.
5. `POST /api/admin/database/validate-schema` (admin module) — MUST require auth + `CONFIG_EDIT`.
6. Input for all database connection endpoints MUST be validated against the `connectionSchema` (zod) before any DB connection attempt.

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| engine | string (enum) | Yes | Database engine | `postgresql` |
| host | string | Yes | DB server hostname | `db.internal.fecredit.com.vn` |
| port | integer (1–65535) | Yes | DB server port | `5432` |
| username | string | Yes | DB user | `sa4e_user` |
| password | string | Yes | DB password | `***` |
| database | string | Yes | Database name | `sa4e_prod` |
| ssl | boolean | No | Enable TLS | `true` |

**Acceptance Criteria:**

1. `GET /api/admin/database/status` without token → returns HTTP 401
2. `POST /api/admin/database/test-connection` with valid token but no `CONFIG_EDIT` → returns HTTP 403
3. `POST /api/admin/database/test-connection` with valid token + `CONFIG_EDIT` → attempts connection and returns result
4. `POST /api/admin/database/migrate` without token → returns HTTP 401 (no SSE stream opened)
5. `POST /api/admin/database/switch-to-sqlite` without token → returns HTTP 401
6. Admin-module `/api/admin/database/*` endpoints mirror the same auth requirements


---

#### STORY 3: Verified Identity in MCP Tool Calls (F-10)

> As a regular user, I want to authenticate with a verified token when calling MCP tools, so that my identity cannot be spoofed by another caller.

**Requirement Details:**

1. `POST /mcp/tools/call` MUST derive caller identity exclusively from a cryptographically verified token (admin session or JWT). The unverified `X-User-Id` header MUST NOT be used as the primary identity source.
2. If the caller presents a valid session token → `userId` from the session record is used.
3. If the caller presents a valid JWT → `sub` claim from the verified payload is used.
4. If neither a valid session nor JWT is present AND API key auth is disabled → `X-User-Id` MAY be accepted as a fallback, but MUST be logged as a warning.
5. When API key auth is enabled (`CODE_INTEL_API_KEY` set), only API-key-authenticated callers are accepted; identity is set to `'api-key-user'`.
6. Reserved scope keys (`__projectId`, `__userId`, `__workspaceRoot`) supplied by the client MUST be stripped before trusted values are stamped.
7. JWT project binding: if a JWT carries `pid`/`pids` claims, the `X-Project-Id` header value MUST be within the granted project list; otherwise return `403 Forbidden`.

**Acceptance Criteria:**

1. `POST /mcp/tools/call` with a valid admin session token → `__userId` is set to the session's `userId` (not from `X-User-Id`)
2. `POST /mcp/tools/call` with a valid JWT bearing `sub=duc.nguyen.10` → `__userId` is set to `duc.nguyen.10`
3. `POST /mcp/tools/call` with `X-User-Id: admin` and no valid token → accepted only in dev/no-auth mode; a warning is logged
4. Client-supplied `__userId` in the request body is stripped before the call is processed
5. `POST /mcp/tools/call` with JWT scoped to `pid=projectA` and `X-Project-Id: projectB` → returns `403 Forbidden`

---

#### STORY 4: Authenticate MCP Tool Listing (F-09)

> As a security engineer, I want the MCP tool list to require authentication, so that internal tool names and schemas are not publicly enumerable.

**Requirement Details:**

1. `GET /mcp/tools/list` MUST require caller authentication using the same `resolveCallerIdentity()` pattern as `POST /mcp/tools/call`.
2. Unauthenticated requests → return `401 { "error": { "code": "UNAUTHORIZED", "message": "Authentication required" } }`.
3. For authenticated session users (not API key), RBAC filtering via `MCP_ACCESS` permission MUST be applied: if the user has no `MCP_ACCESS` permission → return `{ tools: [] }`; if the user has `MCP_ACCESS` with `toolAccess` role data → filter the tool list accordingly.
4. API-key callers receive the full, unfiltered tool list.

**Acceptance Criteria:**

1. `GET /mcp/tools/list` without any token → returns HTTP 401
2. `GET /mcp/tools/list` with valid session but no `MCP_ACCESS` permission → returns `{ tools: [] }`
3. `GET /mcp/tools/list` with valid session + `MCP_ACCESS` + full tool access → returns all tool definitions
4. `GET /mcp/tools/list` with valid API key → returns all tool definitions
5. `GET /mcp/tools/list` with `MCP_ACCESS` and `toolAccess` filter applied → returns only permitted tools

---

#### STORY 5: Sanitize Admin Portal Token Handoff (F-13)

> As a security engineer, I want the admin portal token handoff to sanitize the token before injecting it into HTML, so that XSS attacks via crafted URLs are prevented.

**Requirement Details:**

1. `GET /admin?token=...` — when a `token` query parameter is present, it MUST be sanitized before injection into the HTML `<script>` tag.
2. Sanitization rule: only characters matching `[A-Za-z0-9\-_.]` are permitted. All other characters are stripped.
3. An empty token after sanitization MUST NOT inject any `<script>` block.
4. The sanitized token value is inserted into `localStorage.setItem("admin_token", "{safeToken}")` in the HTML `<head>`.

**Acceptance Criteria:**

1. `GET /admin?token=abc123` → renders HTML containing `localStorage.setItem("admin_token","abc123")`
2. `GET /admin?token=x%22)%3C/script%3E%3Cscript%3Ealert(1)%3C/script%3E` → XSS payload is stripped; no script injection occurs
3. `GET /admin?token=<script>alert(1)</script>` → angle brackets and special chars are stripped
4. `GET /admin` without token param → no localStorage injection script in HTML

---

#### STORY 6: Require CONFIG_EDIT for LLM Endpoints (F-14, F-15)

> As an admin user, I want LLM configuration endpoints to require CONFIG_EDIT permission, so that regular users cannot trigger outbound HTTP requests to arbitrary hosts.

**Requirement Details:**

1. `GET /api/admin/llm/models` MUST require `CONFIG_EDIT` permission because it triggers an outbound HTTP call to the configured LLM server.
2. `POST /api/admin/llm/test` MUST require `CONFIG_EDIT` permission before initiating any outbound connection.
3. For SSRF protection on `POST /api/admin/llm/test`: the configured `llm.baseUrl` MUST be validated against `validateExternalUrl()` when it points to a non-localhost host, blocking private/reserved IP ranges.
4. API key in the LLM config MUST be masked as `'***'` in responses.

**Acceptance Criteria:**

1. `GET /api/admin/llm/models` with valid token but no `CONFIG_EDIT` → returns HTTP 403
2. `GET /api/admin/llm/models` with valid token + `CONFIG_EDIT` → returns `{ models, provider }`
3. `POST /api/admin/llm/test` with valid token but no `CONFIG_EDIT` → returns HTTP 403
4. `POST /api/admin/llm/test` with `llm.baseUrl` pointing to `169.254.169.254` → returns `{ success: false, message: "SSRF blocked: ..." }`
5. `GET /api/admin/config` returns `apiKey: "***"` (not the real value)

---

#### STORY 7: Workspace Data Isolation for Regular Users (F-16)

> As a regular user, I want to see only my own workspaces in `/api/admin/projects`, so that workspace data belonging to other users is not exposed to me.

**Requirement Details:**

1. `GET /api/admin/projects` MUST require authentication. Unauthenticated callers → return `401`.
2. After authentication, the caller's access level determines the data returned:
   - Callers with `RBAC_MANAGE` permission (admins) → receive ALL workspaces from `project_registry` (up to 100 rows, ordered by `last_seen DESC`)
   - Callers without `RBAC_MANAGE` → receive only rows where `created_by` matches the caller's `userId` or `username`
3. Regular users MUST NOT see workspaces registered by admin or other users.
4. The response format is `{ projects: [{ project_id, display_name, workspace_path, last_seen }] }`.

**Acceptance Criteria:**

1. `GET /api/admin/projects` without token → returns HTTP 401
2. Admin user (has `RBAC_MANAGE`) → returns all projects in the registry
3. Regular user `duc.nguyen.10` → returns only projects with `created_by = 'duc.nguyen.10'`
4. No cross-tenant workspace leakage between users who share the same server instance
5. Empty array is returned (not 403) when a regular user has no registered workspaces

---

#### STORY 8: Privilege Check on Graph Sync (F-17)

> As a security engineer, I want graph sync (a destructive write) to require an admin-level permission, so that users with read-only access cannot reset the knowledge graph.

**Requirement Details:**

1. `POST /api/admin/kb/graph/sync` triggers `db.graph.resetGraph()` followed by a full `graphService.fullSync()` — this is a destructive write operation.
2. The permission gate MUST be changed from `GRAPH_VIEW` (read-only) to `RBAC_MANAGE` (admin-only).
3. This ensures that only administrators can trigger a full graph rebuild; regular users with read-only KB access cannot accidentally or intentionally reset the knowledge graph.
4. The operation runs asynchronously in the background — the endpoint returns `{ status: 'sync_started' }` immediately.

**Acceptance Criteria:**

1. `POST /api/admin/kb/graph/sync` with valid token + `GRAPH_VIEW` only (no `RBAC_MANAGE`) → returns HTTP 403
2. `POST /api/admin/kb/graph/sync` with valid token + `RBAC_MANAGE` → returns `{ status: 'sync_started', message: 'Graph sync triggered in background.' }` (HTTP 200)
3. Unauthenticated requests → return HTTP 401

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| SA4E-41 — RBAC & session management | System | SA4E-41 | `validateSession()`, `getUserPermissions()`, permission model must be operational |
| SA4E-30 — JWT authentication | System | SA4E-30 | JWT middleware (`jwtAuth`, `verifyJwtToken`) used by MCP tools routes |
| Admin DB — sessions table | Infrastructure | N/A | `sessions` table must exist and be queryable for `validateSession()` to work |
| KB_TOKEN_SECRET env var | Infrastructure | N/A | Required when JWT auth is enforced in production |
| CODE_INTEL_API_KEY env var | Infrastructure | N/A | When set, enables API key auth mode for MCP tool endpoints |
| url-validator middleware | System | N/A | `validateExternalUrl()` must block private IP ranges for SSRF protection |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility | Source |
|------|-------------|----------------|--------|
| Security Engineer | FE Credit Security Team | Identified and verified security findings F-01 to F-20 | Security audit (SECURITY-AUTH-AUDIT.md) |
| Backend Developer | SA4E Dev Team | Implemented security fixes across 11 backend files | Implementation (STATUS.json) |
| Admin User | FE Credit IT Operations | Manages system via Admin Portal — affected by auth requirement changes | Business context |
| Regular User | duc.nguyen.10@fecredit.com.vn (example) | Uses MCP tools via IDE extension — affected by identity verification changes | Business context |
| Technical Analyst | TA Agent | Reviews and enriches FSD with technical API contracts | SDLC pipeline |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Existing IDE extension calls `/api/index/*` without auth | High — extension breaks after fix | Medium | Extension must be updated to pass `Authorization: Bearer {token}` header; backward compatibility window via `CODE_INTEL_REQUIRE_AUTH` flag |
| Admin users lack `CONFIG_EDIT` permission after deployment | High — LLM/DB admin UI broken | Low | Verify RBAC groups are seeded with `CONFIG_EDIT` permission before deploying |
| JWT `KB_TOKEN_SECRET` not set in production | High — JWT auth silently bypassed | Low | `validateJwtConfig()` throws at startup if `REQUIRE_AUTH=true` and `KB_TOKEN_SECRET` is empty |
| Graph sync permission change breaks existing admin workflows | Medium — admin must be in `RBAC_MANAGE` group | Low | All system admins should already have `RBAC_MANAGE` permission |
| SSRF protection on LLM test blocks legitimate private LLM deployments | Medium — LLM test fails for on-prem setups | Medium | `validateExternalUrl()` must allow RFC-1918 ranges only when explicitly configured |

### 5.2 Assumptions

- The `validateSession()` function is reliable and correctly handles token expiry
- All production admin users have been assigned to an access group with appropriate permissions (`CONFIG_EDIT`, `RBAC_MANAGE`, `MCP_ACCESS`) prior to activating auth
- The IDE extension (thin client) will be updated in a companion ticket to pass session tokens on indexing requests
- `CODE_INTEL_REQUIRE_AUTH=true` will be set in production environments to enforce JWT auth on all API endpoints
- Regular users authenticate via the admin portal to obtain a session token before making API calls

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Security | All mutation endpoints require authentication | No endpoint that writes data to disk, DB, or configuration accepts unauthenticated requests |
| Security | Authorization is role-based (RBAC) | Permissions are verified per-operation using the `GroupPermission` model |
| Security | Identity is cryptographically verified | User identity comes from JWT/session validation, never from client headers |
| Security | SSRF prevention on outbound HTTP | LLM test endpoint validates destination URL against private/reserved IP ranges |
| Security | XSS prevention on HTML injection | Tokens injected into HTML are stripped to `[A-Za-z0-9\-_.]` character set |
| Security | Data isolation per user | `/api/admin/projects` returns only data scoped to the caller's identity |
| Performance | Auth checks add < 5ms per request | `validateSession()` is a lightweight DB lookup; `verifyHs256` is in-process crypto |
| Availability | Auth failures are fail-closed | Errors in `validateSession()` return `null` (deny), not throw (which could bypass auth) |
| Auditability | Privilege escalation attempts are logged | Rejected auth/permission checks are logged with `userId`, route, and reason |

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-55 | Security: Fix authentication/authorization vulnerabilities in backend API | In Progress | Security Hotfix | Main ticket |
| SA4E-41 | Implement RBAC and session management for Admin Portal | Done | Story | Prerequisite — provides `validateSession()`, permission model |
| SA4E-30 | Multi-tenant KB isolation with JWT | Done | Story | Prerequisite — provides `jwtAuth` middleware, `verifyJwtToken()` |
| SA4E-50 | Async admin DB calls | Done | Story | Prerequisite — `validateSession()` is async, must be awaited |
| SA4E-33 | Multi-database support (PostgreSQL/MySQL) | Done | Story | Related — database admin endpoints are the subject of F-01 to F-05, F-18 to F-20 |


---

## 8. Appendix

### Glossary

| Term | Definition |
|------|------------|
| **Authentication** | The process of verifying the identity of a caller — confirming that a session token or JWT is valid, not expired, and was issued by this system. |
| **Authorization** | The process of verifying that an authenticated caller has the required permission to perform a specific operation (e.g., `CONFIG_EDIT` to modify LLM settings). |
| **Session Token** | An opaque hexadecimal string stored in the `sessions` table, issued by the admin portal login. Validated via `validateSession()`. |
| **JWT (JSON Web Token)** | A signed token in `header.payload.signature` format for multi-tenant identity injection. Signed with `KB_TOKEN_SECRET` using HMAC-SHA256. Claims: `sub` (userId), `pid` (projectId), `wid` (workspaceId). |
| **CONFIG_EDIT** | An RBAC permission granting ability to modify system configuration — LLM settings and database settings. Required for LLM/database admin endpoints. |
| **RBAC_MANAGE** | An RBAC permission granting admin-level access — user management, group management, and system-wide write operations like graph sync. |
| **MCP_ACCESS** | An RBAC permission controlling which MCP tools a session user can see and call via `/mcp/tools/*`. |
| **SSRF (Server-Side Request Forgery)** | An attack where a caller tricks the server into making outbound HTTP requests to internal network addresses by supplying a crafted URL. |
| **XSS (Cross-Site Scripting)** | An attack where unsanitized user input is reflected into an HTML page and executed as JavaScript. In this context, a crafted `?token=` value could inject malicious scripts. |
| **Workspace** | A directory path registered in `project_registry` that the Code Intelligence server monitors and indexes, associated with a `project_id` and `created_by` user. |
| **Graph Sync** | The operation `POST /api/admin/kb/graph/sync` that resets and fully rebuilds the knowledge graph — a destructive write operation. |
| **Privilege Escalation** | When a user performs an operation beyond their permission level — e.g., a read-only user triggering a destructive write via misconfigured permission check. |

### Security Findings Summary

| Finding ID | Endpoint | Category | Severity | Fix Applied |
|-----------|----------|----------|----------|-------------|
| F-01 | `GET /api/admin/database/status` | Missing auth | High | `requireDatabaseAuth()` added |
| F-02 | `POST /api/admin/database/test-connection` | Missing auth + SSRF | Critical | `requireDatabaseAuth()` added |
| F-03 | `POST /api/admin/database/migrate` | Missing auth | Critical | `requireDatabaseAuth()` added |
| F-04 | `POST /api/admin/database/migrate/cancel` | Missing auth | High | `requireDatabaseAuth()` added |
| F-05 | `POST /api/admin/database/switch-to-sqlite` | Missing auth | High | `requireDatabaseAuth()` added |
| F-06 | `POST /api/index/source` | Missing auth + file write | Critical | `requireAuth()` added |
| F-07 | `POST /api/index/document` | Missing auth + file write | Critical | `requireAuth()` added |
| F-08 | `POST /api/index/documents` | Missing auth + file write | Critical | `requireAuth()` added |
| F-09 | `GET /mcp/tools/list` | Missing auth (enumeration) | Medium | `resolveCallerIdentity()` check added |
| F-10 | `POST /mcp/tools/call` | Identity spoofing via header | High | `resolveCallerIdentity()` primary; `X-User-Id` fallback with warning only |
| F-13 | `GET /admin?token=...` | XSS via unsanitized injection | High | Regex sanitize `[^A-Za-z0-9\-_.]` applied |
| F-14 | `GET /api/admin/llm/models` | Missing `CONFIG_EDIT` permission | Medium | `requirePermission('CONFIG_EDIT')` added |
| F-15 | `POST /api/admin/llm/test` | Missing `CONFIG_EDIT` + SSRF | High | `requirePermission('CONFIG_EDIT')` + `validateExternalUrl()` added |
| F-16 | `GET /api/admin/projects` | Data leakage (all workspaces) | Medium | RBAC filter: admin sees all, user sees own only |
| F-17 | `POST /api/admin/kb/graph/sync` | Write on read permission | Medium | Permission changed to `RBAC_MANAGE` |
| F-18 | `GET /api/admin/database/status` (admin module) | Missing auth | High | `authGuard()` with `CONFIG_EDIT` added |
| F-19 | `POST /api/admin/database/test-connection` (admin module) | Missing auth | Critical | `authGuard()` with `CONFIG_EDIT` added |
| F-20 | `POST /api/admin/database/validate-schema` (admin module) | Missing auth | Critical | `authGuard()` with `CONFIG_EDIT` added |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow — Authentication & Authorization | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case — Security Actors & Protected Endpoints | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |

### Reference Documents

| Document | Link / Location |
|----------|-----------------|
| Security Audit Report | documents/SECURITY-AUTH-AUDIT.md |
| Architecture Overview | .code-intel/SA4E-ARCHITECTURE.md |
| RBAC Middleware | backend/src/admin/middleware/rbac.middleware.ts |
| JWT Auth Middleware | backend/src/server/middleware/jwt-auth.ts |
