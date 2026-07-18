# Technical Design Document (TDD)

## Ticket: SA4E-30 — KB Multi-Tenant Auth

## 1. Architecture Overview

### 1.1 Target Architecture
```
Extension (fetch + Bearer JWT)
  -> Hono REST API (/api/v1/*)
    -> Auth Middleware (JWT validate -> ProjectContext)
      -> Route Handler (request parsing)
        -> Service Layer (business logic - unchanged)
          -> IsolationLayer (scope WHERE clauses)
            -> SQLite DB (Better-SQLite3, WAL mode)
```

### 1.2 Module Boundaries

| Module | Responsibility | Files |
|--------|---------------|-------|
| Auth | JWT validation, ProjectContext creation | src/auth/ |
| Routes | HTTP endpoint handlers | src/routes/ |
| Services | Business logic (existing) | src/services/ |
| Isolation | Scope filtering, ownership validation | src/isolation/ |
| Migration | Schema + data migration | src/migration/ |
| Client | Extension REST client + token mgmt | extension/src/kb-client/ |

## 2. Auth Module (src/auth/)

### 2.1 src/auth/config.ts
- Loads: CODE_INTEL_REQUIRE_AUTH, KB_TOKEN_SECRET, KB_TOKEN_ALGORITHM, KB_TOKEN_PUBLIC_KEY
- Validates config on startup (refuses to start if auth required but no secret)

### 2.2 src/auth/middleware.ts
- Hono middleware: extracts Bearer token from Authorization header
- Validates JWT using jose library (HS256 or RS256)
- Creates ProjectContext from claims (sub->userId, wid->workspaceId, pid->projectId)
- Anonymous fallback when auth not required
- Returns 401 on missing/invalid token

### 2.3 src/auth/context.ts
- ProjectContext interface: { userId, workspaceId, projectId } (all string|null)
- createProjectContext() with Object.freeze
- createAnonymousContext() for backward compat

## 3. Routes Module (src/routes/)

### 3.1 Endpoint Map

| Method | Path | Handler | Replaces |
|--------|------|---------|----------|
| POST | /api/v1/memory/search | memoryRoutes.search | mem_search |
| POST | /api/v1/memory/ingest | memoryRoutes.ingest | mem_ingest |
| POST | /api/v1/memory/ingest-file | memoryRoutes.ingestFile | mem_ingest_file |
| PUT | /api/v1/memory/:id | memoryRoutes.update | (new) |
| DELETE | /api/v1/memory/:id | memoryRoutes.delete | (new) |
| POST | /api/v1/code/search | codeRoutes.search | code_search |
| POST | /api/v1/context/curated | contextRoutes.curated | get_curated_context |
| GET | /api/v1/admin/status | adminRoutes.status | orchestration_status |
| POST | /api/v1/admin/migrate-scope | adminRoutes.migrate | (new) |
| ALL | /mcp | 404 handler | (removed) |

### 3.2 Response Envelope
```json
{"data": {...}, "error": null}
{"data": null, "error": {"code": "ERROR_CODE", "message": "..."}}
```

## 4. IsolationLayer (src/isolation/)

### 4.1 scope-filter.ts — buildScopeFilter(ctx, scopeFilter?)
Builds SQL WHERE clause with OR conditions per scope level.
Uses parameterized queries (no SQL injection risk).

### 4.2 ownership.ts — validateOwnership(entry, ctx)
Checks entry ownership based on scope before mutations.
Returns boolean. Caller returns 403 on false.

### 4.3 stamp.ts — stampEntry(scope, ctx)
Returns fields to stamp on new entries based on scope level.

## 5. Migration (src/migration/)

### 5.1 Schema Migration
```sql
ALTER TABLE knowledge_entries ADD COLUMN workspace_id TEXT;
CREATE INDEX idx_scope_isolation ON knowledge_entries(scope, user_id, workspace_id, project_id);
CREATE INDEX idx_workspace ON knowledge_entries(workspace_id);
```

### 5.2 Data Migration
POST /api/v1/admin/migrate-scope accepts {mapping: {projectId: workspaceId}, dry_run: bool}
Assigns workspace_id to legacy entries based on project_id mapping.

## 6. Extension Client (extension/src/kb-client/)

### 6.1 KBClient class
- Constructor: baseUrl, TokenService
- Methods: search(), ingest(), ingestFile(), codeSearch(), curatedContext()
- All methods attach Bearer token via TokenService.getValidToken()

### 6.2 TokenService class
- getValidToken(): returns cached token or refreshes if near expiry (<5 min)
- refreshToken(): calls OAuth/SSO refresh endpoint
- getProjectId(): SHA-256 hash of git remote URL
- Stores refresh_token in VSCode SecretStorage

## 7. Security Design

- JWT verified with jose (HS256/RS256)
- Token secret from env var only
- Hard isolation via SQL WHERE (no client-side filtering)
- Ownership check before every mutation
- No secrets in logs or error responses
- SecretStorage for refresh tokens in extension

## 8. Dependencies

| Package | Purpose | Action |
|---------|---------|--------|
| jose ^5.x | JWT verification | ADD |
| @modelcontextprotocol/sdk | MCP protocol | REMOVE |
| hono ^4.x | HTTP framework | KEEP |
| better-sqlite3 ^9.x | SQLite | KEEP |

## 9. Implementation Checklist

| # | Task | Priority |
|---|------|----------|
| 1 | Create src/auth/config.ts | P0 |
| 2 | Create src/auth/middleware.ts | P0 |
| 3 | Enhance src/auth/context.ts (add workspaceId) | P0 |
| 4 | Create src/routes/index.ts (Hono router) | P0 |
| 5 | Create src/routes/memory.ts | P0 |
| 6 | Create src/routes/code.ts | P1 |
| 7 | Create src/routes/admin.ts | P1 |
| 8 | Enhance src/isolation/scope-filter.ts | P0 |
| 9 | Create src/isolation/ownership.ts | P0 |
| 10 | Create src/isolation/stamp.ts | P0 |
| 11 | Create src/migration/schema.ts | P0 |
| 12 | Create src/migration/scope-migration.ts | P1 |
| 13 | Create extension/src/kb-client/client.ts | P0 |
| 14 | Create extension/src/kb-client/token-service.ts | P0 |
| 15 | Remove /mcp endpoint + MCP SDK | P0 |
| 16 | Update package.json (add jose, remove MCP) | P0 |

## 10. Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
