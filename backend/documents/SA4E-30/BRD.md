# Business Requirements Document (BRD)

## Ticket: SA4E-30 — KB Multi-Tenant Auth: Replace MCP with REST API + JWT + Hard Data Isolation

## 1. Executive Summary

The Knowledge Base (KB) backend operates as a shared server for the development team but currently lacks user identity awareness. The MCP protocol transport does not support authentication headers, making it impossible to enforce data isolation between users. This feature replaces MCP with a REST API transport that carries OAuth/SSO JWT tokens, enabling hard multi-tenant data isolation across a four-level scope hierarchy.

## 2. Problem Statement

- KB backend runs as a **shared server** for the entire team
- Current MCP protocol has **no mechanism to transmit user identity**
- All KB data is accessible by anyone who can reach the server
- Cannot implement per-user, per-workspace, or per-project data boundaries
- Violates data privacy and isolation requirements for enterprise use

## 3. Business Objectives

| # | Objective | Success Metric |
|---|-----------|---------------|
| BO-1 | Hard data isolation between users | Zero cross-user data leakage in security audit |
| BO-2 | Multi-tenant support on shared server | Multiple teams sharing server without data conflicts |
| BO-3 | Standards-compliant authentication | JWT/OAuth2 tokens verified on every request |
| BO-4 | Backward compatibility | Existing KB data remains accessible after migration |
| BO-5 | Transparent to end users | No manual auth configuration required in extension |

## 4. Scope

### In Scope
- Replace MCP transport with REST API (Hono routes)
- JWT authentication middleware
- Four-level scope hierarchy (USER, WORKSPACE, PROJECT, SHARED)
- Hard isolation via SQL WHERE clauses
- VSCode extension REST client with auto-token management
- Database migration for existing data
- Legacy data backward compatibility
- Complete removal of MCP endpoint

### Out of Scope
- OAuth/SSO provider setup (assume existing provider)
- User management / registration system
- Role-based access control (RBAC) — future feature
- Audit logging — future feature
- Rate limiting — future feature

## 5. Stakeholders

| Role | Interest |
|------|----------|
| Developer (Extension User) | Seamless KB access with automatic isolation |
| Team Lead | Data not leaking between team members |
| System Administrator | Configurable auth, easy deployment |
| Security Officer | Hard isolation, JWT validation, no unauthenticated access |

## 6. User Stories

### US-1: Authenticated KB Access
**As a** developer using the VSCode extension,
**I want** my KB queries to automatically include my identity,
**so that** I only see data I'm authorized to access.

**Acceptance Criteria:**
- Extension retrieves JWT from OAuth/SSO automatically
- Every REST API call includes `Authorization: Bearer <token>` header
- No manual configuration needed
- Token refreshes automatically before expiry

### US-2: Private Knowledge Storage
**As a** developer,
**I want** to store knowledge entries that only I can see (USER scope),
**so that** my personal notes and decisions are private.

**Acceptance Criteria:**
- Entries with scope=USER visible only to the creating user
- Other users on same server cannot search/read my USER entries
- USER entries tied to my user_id from JWT

### US-3: Project-Scoped Knowledge
**As a** team member working on a specific project,
**I want** project knowledge shared among all team members on that project,
**so that** we build collective project intelligence.

**Acceptance Criteria:**
- Entries with scope=PROJECT visible to anyone with same project_id
- project_id derived from git repo URL hash
- Different repos = different project scope

### US-4: Workspace-Level Sharing
**As a** developer with multiple workspaces,
**I want** workspace-level knowledge shared with my team,
**so that** people in the same workspace context see the same data.

**Acceptance Criteria:**
- Entries with scope=WORKSPACE visible to users with same workspace_id
- workspace_id identifies the VSCode workspace folder context

### US-5: Company-Wide Knowledge
**As a** team lead,
**I want** certain knowledge entries (architecture decisions, standards) visible to everyone,
**so that** best practices propagate across the organization.

**Acceptance Criteria:**
- Entries with scope=SHARED visible to all authenticated users in same workspace
- Any authenticated user in the workspace can create SHARED entries

### US-6: Legacy Data Access
**As a** developer upgrading from the old system,
**I want** my existing KB entries to remain accessible,
**so that** no knowledge is lost during the migration.

**Acceptance Criteria:**
- Existing entries (pre-migration) remain searchable
- Legacy entries without workspace_id accessible by matching project_id
- Admin can run migration to assign workspace_id to legacy entries

### US-7: Secure Server Operation
**As a** system administrator,
**I want** to require authentication on the shared server,
**so that** no unauthenticated access to KB data is possible.

**Acceptance Criteria:**
- `CODE_INTEL_REQUIRE_AUTH=true` enforces JWT on all requests
- Missing/invalid token returns HTTP 401
- MCP endpoint completely removed
- Token signing configured via environment variables

### US-8: Scope Promotion
**As a** developer,
**I want** to promote my private knowledge to project or company level,
**so that** useful insights benefit the wider team.

**Acceptance Criteria:**
- USER to PROJECT promotion preserves workspace_id
- PROJECT to SHARED promotion preserves workspace_id
- Cannot promote across workspace boundaries

## 7. Business Flow

```
Developer opens VSCode workspace
    |
    v
Extension detects workspace + git repo
    |
    v
Extension requests JWT from OAuth/SSO provider
(claims: user_id, workspace_id, project_id)
    |
    v
Extension calls REST API with Bearer token
    |
    v
Auth Middleware validates JWT, creates ProjectContext
    |
    v
Tool logic executes (search/ingest/etc.)
    |
    v
IsolationLayer filters results by scope
    |
    v
Only authorized data returned to developer
```

![Business Flow](diagrams/business-flow.png)

## 8. Use Cases

### UC-1: Authenticated Search
- **Actor:** Developer
- **Precondition:** Extension has valid JWT
- **Main Flow:** Extension calls `POST /api/v1/memory/search` with Bearer token. Auth Middleware validates. IsolationLayer applies scope filters. Results returned.
- **Alternative:** Token expired. Extension refreshes token. Retry.
- **Exception:** Invalid token. HTTP 401. Extension prompts re-auth.

### UC-2: Scoped Ingestion
- **Actor:** Developer
- **Precondition:** Extension has valid JWT
- **Main Flow:** Extension calls `POST /api/v1/memory/ingest` with scope parameter. Auth Middleware validates. Entry stamped with caller identity fields. Stored.
- **Exception:** Missing required scope fields. HTTP 400.

### UC-3: Cross-Scope Mutation Denied
- **Actor:** Developer
- **Precondition:** Developer attempts to modify another user's entry
- **Main Flow:** Extension calls update/delete. IsolationLayer checks ownership. Mismatch. HTTP 403.

### UC-4: Anonymous Backward Compatibility
- **Actor:** Legacy client (no JWT)
- **Precondition:** `CODE_INTEL_REQUIRE_AUTH=false`
- **Main Flow:** Request without token. Anonymous ProjectContext. Only SHARED+PROJECT entries visible.
- **Exception:** `CODE_INTEL_REQUIRE_AUTH=true`. HTTP 401.

### UC-5: Token Auto-Refresh
- **Actor:** Extension (automated)
- **Precondition:** Token near expiry (less than 5 min)
- **Main Flow:** Extension detects expiry. Calls OAuth/SSO refresh endpoint. Gets new JWT. Continues.
- **Exception:** Refresh fails. Prompt user to re-authenticate.

### UC-6: Legacy Data Migration
- **Actor:** System Administrator
- **Precondition:** Existing KB data without workspace_id
- **Main Flow:** Admin calls `POST /api/v1/admin/migrate-scope` with mapping. Entries assigned workspace_id.
- **Exception:** Conflict. Skip entry, log warning.

![Use Case Diagram](diagrams/use-case.png)

## 9. Non-Functional Requirements

| # | Category | Requirement |
|---|----------|-------------|
| NFR-1 | Security | JWT validation on every request (no bypass) |
| NFR-2 | Security | Token secrets never in source code or logs |
| NFR-3 | Performance | Auth middleware adds less than 5ms per request |
| NFR-4 | Availability | Token refresh transparent to user |
| NFR-5 | Compatibility | Existing tools (mem_search, etc.) keep same parameters |
| NFR-6 | Migration | Zero data loss during schema migration |
| NFR-7 | Scalability | Scope filter efficient with index on (scope, user_id, workspace_id, project_id) |

## 10. Dependencies

| # | Dependency | Type | Notes |
|---|-----------|------|-------|
| DEP-1 | OAuth/SSO Provider | External | Must support JWT token issuance |
| DEP-2 | Hono framework | Internal | Already in use, add auth middleware |
| DEP-3 | jose / jsonwebtoken NPM package | Internal | For JWT verification |
| DEP-4 | VSCode SecretStorage API | Internal | For storing refresh tokens |
| DEP-5 | Better-SQLite3 | Internal | Already in use, add workspace_id column |

## 11. Constraints

- Must work with existing SQLite database (no switch to PostgreSQL)
- Must support both HS256 and RS256 JWT algorithms
- Extension must work offline (cache token, fallback gracefully)
- REST API must be versioned (`/api/v1/`)

## 12. Assumptions

- OAuth/SSO provider already exists and issues JWT tokens
- Users have one active VSCode workspace at a time per extension instance
- Git remote URL is stable and unique per project
- Team size less than 100 users per shared server (SQLite can handle)

## 13. Risks

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| R-1 | Token secret leak | High | Environment variables only, never in code |
| R-2 | SQLite contention with many users | Medium | WAL mode + connection pooling |
| R-3 | Extension token refresh fails | Low | Graceful degradation + user prompt |
| R-4 | Legacy data orphaned after migration | Medium | Conservative migration (skip conflicts) |
| R-5 | Breaking change for existing clients | High | Backward compat mode when auth not required |

## 14. Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
