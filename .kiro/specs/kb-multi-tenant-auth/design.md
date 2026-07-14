# Design Document

## Overview

KB Multi-Tenant Auth replaces the MCP protocol transport with a REST API protected by JWT authentication, enabling hard multi-tenant data isolation on a shared server.

## Architecture

```
Extension (fetch + Bearer JWT via AuthManager)
  -> Hono REST API (/api/v1/*)
    -> jwt-auth middleware (validate JWT, create ProjectContext)
      -> Route handlers (kb-api.ts)
        -> Existing service layer (unchanged)
          -> IsolationLayer (4-level scope WHERE clauses)
            -> SQLite DB (workspace_id column added)
```

## Key Components

### Backend Changes

| Component | File | Change |
|-----------|------|--------|
| JWT Middleware | backend/src/server/middleware/jwt-auth.ts | NEW |
| REST Routes | backend/src/server/routes/kb-api.ts | NEW |
| HttpServer | backend/src/server/HttpServer.ts | MODIFIED |
| ProjectContext | backend/src/modules/memory/ProjectContext.ts | MODIFIED |
| KBScope | backend/src/modules/memory/models.ts | MODIFIED |
| IsolationLayer | backend/src/modules/memory/IsolationLayer.ts | MODIFIED |
| MigrationRunner | backend/src/modules/memory/MigrationRunner.ts | MODIFIED |

### Extension Changes

| Component | File | Change |
|-----------|------|--------|
| KBClient | extension/src/services/KBClient.ts | NEW |

## REST API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/v1/memory/search | Search knowledge entries |
| POST | /api/v1/memory/ingest | Store new entry |
| POST | /api/v1/memory/ingest-file | Ingest file |
| POST | /api/v1/code/search | Code symbol search |
| POST | /api/v1/context/curated | Curated context |
| GET | /api/v1/admin/status | Server status |
| POST | /api/v1/admin/migrate-scope | Legacy data migration |

## Scope Hierarchy

| Scope | Visibility | Stamped Fields |
|-------|-----------|---------------|
| USER | Only creating user | user_id, workspace_id, project_id |
| WORKSPACE | All users in workspace | user_id, workspace_id, project_id |
| PROJECT | All users in project | workspace_id, project_id |
| SHARED | All users in workspace | workspace_id |

## Security

- JWT HS256 validation (built-in crypto, no external dep)
- Token secret from KB_TOKEN_SECRET env var
- Anonymous mode when CODE_INTEL_REQUIRE_AUTH != true
- Hard isolation via SQL WHERE clauses
- Ownership check before mutations (HTTP 403)

## Migration

- Schema v2: ALTER TABLE knowledge_entries ADD COLUMN workspace_id TEXT
- Indexes for scope filtering performance
- Legacy entries accessible via project_id match
- Admin endpoint for bulk workspace_id assignment
