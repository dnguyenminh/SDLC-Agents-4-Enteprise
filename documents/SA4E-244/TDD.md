# Technical Design Document (TDD)

## SA4E-244 — Admin Project Scope dropdown shows IDs instead of workspace/project names

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-244 |
| Title | Admin Project Scope dropdown shows IDs instead of workspace/project names |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2026-09-05 |
| Status | Draft |
| Related BRD | documents/SA4E-244/BRD.md v1.0 |
| Related FSD | documents/SA4E-244/FSD.md v1.1 |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | SA Agent – Solution Architect | Create document |
| Peer Reviewer | TBD – TBD | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-05 | SA Agent | Initial TDD from BRD v1.0 and FSD v1.1 |

---

## 1. Introduction

### 1.1 Purpose
Define the technical design for replacing project/workspace identifiers with human-readable names in the Admin Project Scope dropdown at `localhost:48721/admin`. The design specifies how the existing backend endpoint `GET /api/admin/projects` and `project_registry` table are leveraged, and how the frontend `WorkspaceSelector` component renders names as primary labels with optional ID visibility.

### 1.2 Scope
Technical scope covers:
- Admin UI frontend rendering logic for Project Scope dropdown in `backend/src/viewer/admin/index.html`
- Backend API contract for `GET /api/admin/projects` returning `project_id` and `display_name`
- Data mapping from `project_registry.display_name` to UI label
- Fallback behavior when name missing
- Optional identifier visibility via tooltip / suffix

Out of scope: project/workspace CRUD, data model changes, other admin dropdowns, auth changes.

### 1.3 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript | ES2022 |
| Framework | Hono | latest |
| Frontend | React via CDN + Babel in-browser | 18 |
| Database | SQLite better-sqlite3 | latest |
| Auth | JWT jwtAuth middleware |  |
| Logging | Pino |  |

### 1.4 Design Principles
- Reuse existing endpoint and table — no new data model
- Minimal UI change footprint <100 LOC
- Fail-safe fallback to ID if name missing
- ID remains as value key for filtering

### 1.5 Constraints
- Frontend is single HTML file with in-browser React, no build step
- `project_registry` populated by indexer, display_name may be empty
- Admin token stored in localStorage, protected by jwtAuth

### 1.6 References
| Document | Location |
|----------|----------|
| BRD | documents/SA4E-244/BRD.md |
| FSD | documents/SA4E-244/FSD.md |

---

## 2. System Architecture

### 2.1 Architecture Overview
Admin UI SPA loads Project Scope dropdown. On mount, `WorkspaceSelector` calls `api('/projects')` which maps to `GET /api/admin/projects`. Backend queries `project_registry` and returns list with `project_id`, `display_name`, `workspace_path`, `last_seen`. Frontend maps `display_name` to option label, fallback to `project_id.slice(0,10)`.

### 2.2 Component Diagram
| Component | Responsibility | Technology |
|-----------|---------------|------------|
| Admin UI `WorkspaceSelector` | Render dropdown with name labels | React in-browser |
| Backend Admin Service `createProjectsRoutes` | Expose GET /api/admin/projects, query project_registry | Hono + SQLite |
| project_registry table | Store project_id → display_name mapping | SQLite |

### 2.3 Communication Patterns
| From | To | Protocol | Pattern | Description |
|------|----|----------|---------|-------------|
| Admin UI | Backend Admin Service | HTTP GET | Sync | Fetch project list with JWT bearer |
| Backend | SQLite | JDBC | Sync | Query project_registry |

---

## 3. API Design

### 3.1 API Overview
| # | Endpoint | Method | Description | Source |
|---|----------|--------|-------------|--------|
| 1 | /api/admin/projects | GET | Retrieve workspace/project list for dropdown | UC-1 |

### 3.2 API: Get Admin Projects
Implements UC-1, BR-1, BR-3

| Attribute | Value |
|-----------|-------|
| Method | GET |
| Path | /api/admin/projects |
| Auth | Bearer JWT via jwtAuth |
| Rate Limit | Default admin limit |

**Request Headers:**
| Header | Required | Description |
|--------|----------|-------------|
| Authorization | Yes | Bearer <token> |
| X-Project-Id | No | Optional scoping |
| X-Impersonate | No | Optional impersonation |

**Response 200 OK:**
```json
{
  "projects": [
    {
      "project_id": "3e268111b055",
      "display_name": "Pega Workspace Alpha",
      "workspace_path": "/workspaces/pega-alpha",
      "last_seen": "2026-09-04T12:00:00Z"
    }
  ]
}
```

**Error Responses:**
| Status | Code | Message | Description |
|--------|------|---------|-------------|
| 401 | Unauthorized | Missing/invalid token |
| 403 | Forbidden | Insufficient permission |
| 500 | Internal Server Error | DB failure, returns empty list |

**Mapping to UI:** Frontend maps `project_id` → value, `display_name` → option label, fallback to `project_id.slice(0,10)` if empty.

---

## 4. Database Design

### 4.1 Schema Overview
`project_registry` is existing table. No schema changes required.

**Physical columns from FSD:**
- `project_id TEXT PRIMARY KEY`
- `display_name TEXT NOT NULL DEFAULT ''`
- `workspace_path TEXT NOT NULL DEFAULT ''`
- `last_seen TEXT`
- `created_by TEXT`

### 4.2 DDL Script (reference)
```sql
CREATE TABLE IF NOT EXISTS project_registry (
    project_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    workspace_path TEXT NOT NULL DEFAULT '',
    last_seen TEXT,
    created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_project_registry_last_seen ON project_registry(last_seen DESC);
```

### 4.3 Migration Plan
No migration required for this feature. Optional future improvement: in-memory cache with 5 min TTL for GET /api/admin/projects.

### 4.4 Query Patterns
| Operation | Query Pattern | Expected Performance |
|-----------|--------------|---------------------|
| Load project list | SELECT project_id, display_name, workspace_path, last_seen FROM project_registry ORDER BY last_seen DESC LIMIT 100 | p95 < 100ms |

---

## 5. Class / Module Design

### 5.1 Package Structure
```
backend/src/viewer/admin/
└── index.html          # WorkspaceSelector component lines 431-436

backend/src/server/routes/admin/
└── index.ts            # createProjectsRoutes, GET /api/admin/projects
```

### 5.2 Frontend Rendering Logic
Current code already uses `p.display_name || p.project_id.slice(0,10)`. 
Enhancement for Story 2 optional ID visibility:
- Option 1: Tooltip via `title={p.workspace_path}` and `title={p.project_id}` 
- Option 2: Suffix format `{display_name} ({project_id.slice(0,8)})` configurable via feature flag

### 5.3 Design Patterns
| Pattern | Where Used | Rationale |
|---------|-----------|-----------|
| Repository | Backend route queries project_registry | Separation of data access |
| Fallback Strategy | Frontend label rendering | Graceful degradation when name missing |

### 5.4 Error Handling
| Exception | HTTP Status | When Thrown |
|-----------|-------------|------------|
| UnauthorizedError | 401 | Missing/invalid JWT |
| ForbiddenError | 403 | RBAC filter denies access |
| DBError | 500 | SQLite query failure |

---

## 6. Integration Design

### 6.1 External System: Backend Admin Service
| Attribute | Value |
|-----------|-------|
| Protocol | HTTP/HTTPS |
| Endpoint | GET /api/admin/projects |
| Authentication | JWT Bearer |
| Timeout | 5s |
| Retry Policy | Client retries once on network error with 200ms backoff |
| Circuit Breaker | Not required |

**Data Mapping:**
| Source Field | Target Field | Transformation |
|-------------|-------------|----------------|
| project_id | value | Direct |
| display_name | option label | Direct, fallback to project_id.slice(0,10) |

---

## 7. Security Design

### 7.1 Authentication
JWT validation via `jwtAuth` middleware. Token obtained via `/api/admin/auth/login`.

### 7.2 Authorization
RBAC filter: `created_by` field used to filter list for non-admin users.

### 7.3 Data Protection
`display_name` is public admin metadata, no PII. Transport via HTTPS localhost.

### 7.4 Input Validation
No request body. Path/query parameters none. Response fields validated for type.

---

## 8. Performance & Scalability

### 8.1 Caching Strategy
| Cache | What | TTL | Technology |
|-------|------|-----|------------|
| In-memory backend cache | project_registry query result | 5 min | Node.js Map |

### 8.2 Performance Targets per FSD §8.1
- Dropdown initial load p95 < 200ms
- API response p95 < 100ms
- Render < 50ms for up to 100 projects

---

## 9. Monitoring & Observability

### 9.1 Logging
- WARN when `display_name` empty for >10% of rows
- WARN on API fetch failure
- INFO on project list cache hit/miss

### 9.2 Metrics
- `admin_projects_api_latency_ms`
- `admin_projects_list_size`
- `admin_projects_missing_name_ratio`

---

## 10. Deployment Considerations

### 10.1 Feature Flags
`ADMIN_PROJECT_SCOPE_SHOW_ID` — toggles optional ID visibility. Default false for now.

### 10.2 Rollback Strategy
Revert frontend label rendering to ID-only by removing name mapping line. No DB changes required.

---

## 11. Design Decisions, Assumptions, Risks

### Design Decisions
1. **No backend schema change** — reuse existing `project_registry.display_name`
2. **Frontend-only label change** — ID remains as value to preserve filtering logic
3. **Fallback to ID** — ensures UI never blank
4. **Optional ID visibility via tooltip** — non-intrusive per Story 2

### Assumptions
- `display_name` populated for majority of projects
- Endpoint `/api/admin/projects` remains stable
- No localization required

### Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| display_name missing for some IDs | Medium | Fallback to ID, log warning |
| Name changes cause confusion | Low | ID remains key, name display only |
| Performance impact | Low | Optional 5 min cache |

---

## 12. E2E Test Architecture

### 12.1 Framework
vitest for API E2E, Playwright for UI E2E. Tests in `backend/tests/e2e/`.

### 12.2 Test Design
- API E2E: Verify GET /api/admin/projects returns project_id and display_name
- UI E2E: Verify dropdown options render display_name, fallback to ID when empty, All (Shared) preserved

---

**End of TDD**
