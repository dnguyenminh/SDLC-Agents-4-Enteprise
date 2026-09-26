# Functional Specification Document (FSD)

## SDLC-Agents-4-Enterprise — SA4E-244: Admin Project Scope dropdown shows IDs instead of workspace/project names

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-244 |
| Title | Admin Project Scope dropdown shows IDs instead of workspace/project names |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-09-05 |
| Status | Draft |
| Related BRD | documents/SA4E-244/BRD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-05 | BA Agent | Initiate document — auto-generated from BRD and Jira tickets |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional behavior required to replace project/workspace identifiers with human-readable names in the Admin Project Scope dropdown at `localhost:48721/admin`. It defines use cases, business rules, data mapping, UI behavior, and API contracts needed to fetch and display workspace/project names, while preserving existing selection functionality.

### 1.2 Scope

The functional scope covers:
- Admin sidebar Project Scope dropdown rendering logic
- Data retrieval and mapping of `project_scope_id` → `project_scope_name`
- Display formatting with optional identifier visibility
- Fallback behavior when name is missing

Out of scope items per BRD: project/workspace creation/deletion workflows, backend data model changes, other admin dropdowns, authorization changes.

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| Project Scope | Selector in admin sidebar to filter views by workspace/project |
| Workspace | Logical container for projects in admin UI |
| Project Scope Dropdown | UI component in left sidebar of admin page |
| Display Label | Composite text shown in dropdown option: `Name (ID)` or `Name` |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-244/BRD.md |
| Jira Ticket SA4E-244 | Jira |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

The Admin UI interacts with Backend Admin Service to fetch workspace/project metadata. Admin user triggers dropdown render, backend provides name mapping, UI displays labels.

### 2.2 System Architecture

Components involved:
- **Admin UI Frontend** — `localhost:48721/admin` SPA, left sidebar Project Scope component
- **Backend Admin Service** — API endpoint providing workspace/project list with names
- **Data Source** — Workspace/Project repository containing `id` and `name` mapping

<!-- TA enrichment -->
### 2.3 Technical Architecture Notes [Implements: BRD §2.1]

- **Frontend Implementation Location**: `backend/src/viewer/admin/index.html` — React-in-browser SPA (no build step). Project Scope dropdown implemented in `WorkspaceSelector` component (lines 431-436). Options rendered via `projects.map(p => <option ...>{p.display_name || p.project_id.slice(0,10)}</option>)`. Current code already falls back to `display_name` with ID slice fallback.
- **Backend Endpoint**: `GET /api/admin/projects` in `backend/src/server/routes/admin/index.ts` `createProjectsRoutes`. Returns rows from `project_registry` table (`project_id`, `display_name`, `workspace_path`, `last_seen`). Authentication via `jwtAuth`, RBAC filter for non-admin users (`created_by`).
- **Data Source**: SQLite admin DB table `project_registry`. Schema: `project_id TEXT PRIMARY KEY`, `display_name TEXT NOT NULL DEFAULT ''`, `workspace_path TEXT NOT NULL DEFAULT ''`, `last_seen TEXT`, `created_by TEXT`. Populated by indexer and Pega stream helpers on workspace discovery.
- **Technology Constraints**: TypeScript + Hono backend; frontend React via CDN, Babel transform in-browser. No server-side rendering. Admin token stored in `localStorage`. Project selection persisted via `localStorage.setItem('admin_projectId', pid)` and URL param `projectId`.
- **Caching Strategy**: No server-side caching currently. Project list is small (<100 rows) and changes infrequently. Recommended: in-memory cache with 5 min TTL for `GET /api/admin/projects` to reduce DB hits. Client-side caching not required; UI re-fetches on page load.
- **Integration Point**: Admin UI calls `api('/projects')` which maps to `/api/admin/projects` via `API='/api/admin'` prefix. Request headers: `Authorization: Bearer <token>`, optional `X-Project-Id` and `X-Impersonate`. Response JSON `{ projects: [{ project_id, display_name, workspace_path, last_seen }] }`.

---



## 3. Functional Requirements

### 3.1 Feature: Project Scope dropdown displays human-readable names

**Source:** BRD Story 1

#### 3.1.1 Description

Replace identifier-only display with workspace/project name as primary label in Project Scope dropdown. Maintain selection behavior.

#### 3.1.2 Use Case

**Use Case ID:** UC-1
**Actor:** Admin User
**Preconditions:** User is authenticated and on `localhost:48721/admin`
**Postconditions:** Dropdown options show names; selection filters views correctly

**Main Flow:**
| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Admin User | | Opens admin page |
| 2 | | Admin UI | Renders left sidebar Project Scope dropdown |
| 3 | | Backend API | Returns list of scopes with id and name |
| 4 | Admin UI | | Maps id → name and renders options with name as primary label |
| 5 | Admin User | | Selects a scope |
| 6 | Admin UI | | Filters admin views accordingly |

**Alternative Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Name missing/null | Render ID fallback for that option, log warning |
| AF-2 | 'All (Shared)' option | Preserve existing label unchanged |

**Exception Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | API fetch fails | Show error toast, retain previous selection, display ID fallback |
| EF-2 | Empty name string | Treat as missing → fallback to ID |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-1 | Project Scope dropdown must display `project_scope_name` as primary label | BRD Story 1 |
| BR-2 | If name missing/null/empty, fallback to `project_scope_id` display | BRD Acceptance Criteria 4 |
| BR-3 | Selection behavior unchanged — ID remains key for filtering | BRD Acceptance Criteria 3 |
| BR-4 | 'All (Shared)' option remains unchanged | BRD Note |

#### 3.1.4 Data Specifications

**Input Data:**
| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| project_scope_id | string | Y | Non-empty | Internal identifier |
| project_scope_name | string | N | Max 200 chars | Human-readable name |

**Output Data:**
| Field | Type | Description |
|-------|------|-------------|
| display_label | string | Text shown in dropdown option |
| project_scope_id | string | Value submitted on selection |

#### 3.1.5 UI Specifications

**Screen: Admin Sidebar Project Scope**

![UI Mockup](diagrams/ui-project-scope.png)

| No. | Element | Type | Required | Behavior | Validation |
|-----|---------|------|----------|----------|------------|
| 1 | Project Scope Dropdown | Select | Y | Shows list of scopes with name primary | Must load on page load |
| 2 | Dropdown Option Label | Text | Y | Format: `{name}` or `{name} ({id})` if secondary enabled | Name first |
| 3 | 'All (Shared)' Option | Text | Y | Static label | Do not modify |

#### 3.1.6 API Contract (Functional View)

**Endpoint:** `GET /api/admin/project-scopes`
**Purpose:** Retrieve workspace/project list for dropdown population

**Input Parameters:**
| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| project_id | string | N | - | Filter by project if applicable |

**Output Data:**
| Field | Type | Description |
|-------|------|-------------|
| id | string | project_scope_id |
| name | string | project_scope_name |
| type | string | workspace/project |
| is_shared | boolean | True for 'All (Shared)' |

**Business Error Scenarios:**
| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| Name lookup failure | Options show IDs | Mapping service returns null for name |

<!-- TA enrichment -->
> **TA Note:** Endpoint path correction and technical contract
> - **Actual implementation**: Backend exposes `GET /api/admin/projects` (not `/api/admin/project-scopes`). Frontend calls `api('/projects')`. FSD functional name `project-scopes` maps to physical `projects`.
> - **HTTP Method**: GET
> - **Path**: `/api/admin/projects`
> - **Auth**: `Authorization: Bearer <JWT>` required. Middleware `jwtAuth` validates token and extracts workspaceId.
> - **Headers**:
>   - `Authorization: Bearer <token>` — Required
>   - `X-Project-Id: <id>` — Optional, forwarded for downstream scoping
>   - `X-Impersonate: <userId>` — Optional impersonation
> - **Query Params**: None. Filtering by RBAC is server-side.
> - **Request Body**: None
> - **Success Response 200**:
>   ```json
>   {
>     "projects": [
>       {
>         "project_id": "3e268111b055",
>         "display_name": "Pega Workspace Alpha",
>         "workspace_path": "/workspaces/pega-alpha",
>         "last_seen": "2026-09-04T12:00:00Z"
>       }
>     ]
>   }
>   ```
> - **Error Responses**:
>   - `401 Unauthorized` — Missing/invalid token. Body `{ error: "Unauthorized" }`
>   - `403 Forbidden` — Insufficient permission. Body `{ error: "Access denied" }`
>   - `500 Internal Server Error` — DB failure. Returns `{ projects: [] }` with log warning.
> - **Mapping to UI**: Frontend maps `project_id` → value, `display_name` → option label, fallback to `project_id.slice(0,10)` if `display_name` empty.
> - **Retry Policy**: Client retries once on network error, then fallback to cached selection. No server-side retry needed.
> - **Caching**: Recommend 5 min in-memory cache on backend for `project_registry` query. Client caches selected `projectId` in `localStorage`.
> - **Processing Pseudocode**:
>   ```typescript
>   // Frontend WorkspaceSelector useEffect
>   async function loadProjects() {
>     const res = await api('/projects');
>     if (!res || res.__error) { /* show toast, keep previous */ return; }
>     const projects = res.projects || [];
>     setProjects(projects);
>     if (!selected && projects.length) setSelected(projects[0].project_id);
>   }
>   // Render
>   <option value={p.project_id} title={p.workspace_path}>
>     {p.display_name || p.project_id.slice(0,10)}
>   </option>
>   ```
> - **Security**: Endpoint protected by `jwtAuth` + `localhostOnly`. No PII exposed. `display_name` is public admin metadata.

[Implements: BRD §2.2, BRD §5.1]

---

### 3.2 Feature: Optional identifier visibility for verification

**Source:** BRD Story 2

#### 3.2.1 Description

Allow identifier to be shown as secondary text for traceability when names are ambiguous.

#### 3.2.2 Use Case

**Use Case ID:** UC-2
**Actor:** Admin User
**Preconditions:** Name display enabled
**Postconditions:** Identifier visible in non-intrusive manner

**Main Flow:**
| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Admin UI | Renders option label as `Name (ID)` |
| 2 | Admin User | | Can verify scope by ID |

**Alternative Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Identifier hidden | Render name only |

#### 3.2.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-5 | Identifier may be displayed in parentheses after name or as tooltip | BRD Story 2 |
| BR-6 | Identifier display should not hinder readability | BRD Story 2 |

#### 3.2.4 UI Specifications

| No. | Element | Type | Required | Behavior | Validation |
|-----|---------|------|----------|----------|------------|
| 1 | Option Secondary Label | Text | N | Shows ID in parentheses or tooltip | Optional |

---

## 4. Data Model

### 4.1 Logical Entities

#### Entity: ProjectScope

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| project_scope_id | string | Y | Unique | Internal identifier |
| project_scope_name | string | N | - | Human-readable name |
| type | string | Y | workspace/project | Scope type |
| is_shared | boolean | Y | - | Indicates 'All (Shared)' |

**Relationships:**
| From Entity | To Entity | Cardinality | Description |
|-------------|-----------|-------------|-------------|
| ProjectScope | Workspace | N:1 | Scope belongs to workspace |

---

## 5. Integration Specifications

### 5.1 External System: Backend Admin Service

| Attribute | Value |
|-----------|-------|
| Purpose | Provide workspace/project name mapping |
| Direction | Inbound |
| Data Format | JSON |
| Frequency | On-demand |

**Data Exchange:**
| Our Data | External Data | Direction | Business Rule |
|----------|--------------|-----------|---------------|
| project_scope_id | id | Receive | Key for mapping |
| project_scope_name | name | Receive | Display label |

<!-- TA enrichment -->
#### 5.1.1 Technical Integration Details [Implements: BRD §3]
- **Service**: Backend Admin Hono routes — `backend/src/server/routes/admin/index.ts`
- **Endpoint**: `GET /api/admin/projects`
- **Transport**: HTTPS (localhost)
- **Authentication**: JWT Bearer token validated by `jwtAuth` middleware. Token obtained via `/api/admin/auth/login`.
- **Authorization**: `RBAC_MANAGE` permission grants full list; others filtered by `created_by`.
- **Request Schema**:
  ```
  GET /api/admin/projects
  Headers:
    Authorization: Bearer <jwt>
    X-Project-Id: <optional>
    X-Impersonate: <optional>
  ```
- **Response Schema 200**:
  ```json
  {
    "projects": [
      {
        "project_id": "string",
        "display_name": "string",
        "workspace_path": "string",
        "last_seen": "string (ISO 8601)"
      }
    ]
  }
  ```
- **Error Schema**:
  ```json
  { "error": "string", "__error": true }
  ```
- **Retry Policy**: Client retries once on network failure with exponential backoff 200ms. Server does not implement retries.
- **Circuit Breaker**: Not required for local call.
- **Data Flow**:
  1. Admin UI mounts → `WorkspaceSelector` useEffect triggers `api('/projects')`
  2. Hono route `createProjectsRoutes` queries `project_registry` via `getDbAdapter().allAsync`
  3. Result mapped to JSON and returned
  4. Frontend maps `display_name` to option label, fallback to ID
- **Security**: All data is admin-internal. `display_name` sourced from `project_registry.display_name`, which is set during workspace indexing. No PII.
- **Monitoring**: Log warning if `display_name` empty for >10% of returned rows.

---



## 6. Processing Logic

### 6.1 Project Scope Dropdown Load

**Trigger:** Admin page load
**Input:** API response with id/name pairs
**Output:** Rendered dropdown options

**Processing Steps:**
| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Call GET /api/admin/project-scopes | Retry once, fallback to cached |
| 2 | Map id → name, build display_label | Use id if name missing |
| 3 | Render dropdown | Log warning for missing names |
| 4 | Preserve 'All (Shared)' label | Do not transform |

<!-- TA enrichment -->
#### 6.1.1 Detailed Processing Logic & Pseudocode [Implements: BRD §2.3]

**Backend Query:**
```typescript
// backend/src/server/routes/admin/index.ts
const rows = await adapter.allAsync(
  'SELECT project_id, display_name, workspace_path, last_seen FROM project_registry ORDER BY last_seen DESC LIMIT 100'
);
return c.json({ projects: rows });
```

**Frontend Rendering (React in admin/index.html):**
```javascript
function WorkspaceSelector({onProjectChange}) {
  const [projects, setProjects] = useState([]);
  const [selected, setSelected] = useState(__projectId || '');
  
  useEffect(() => {
    api('/projects').then(d => {
      if (d && !d.__error) {
        const ps = d.projects || [];
        setProjects(ps);
        // Auto-select first if none selected
        if (!selected && ps.length > 0 && !urlPid) {
          const first = ps[0].project_id;
          setSelected(first);
          __projectId = first;
        }
      }
    });
  }, []);

  const handleChange = (e) => {
    const pid = e.target.value;
    setSelected(pid);
    __projectId = pid;
    if (pid) localStorage.setItem('admin_projectId', pid);
    onProjectChange?.(pid);
  };

  return (
    <select value={selected} onChange={handleChange}>
      <option value="">All (Shared)</option>
      {projects.map(p => (
        <option key={p.project_id} value={p.project_id} title={p.workspace_path}>
          {p.display_name || p.project_id.slice(0,10)}
        </option>
      ))}
    </select>
  );
}
```

**Business Rules Applied:**
- If `display_name` is null/empty → fallback to `project_id.slice(0,10)` (current behavior)
- `All (Shared)` option is static and never mapped
- Selection value remains `project_id` to preserve filtering logic
- Identifier visibility for verification can be added via `title` attribute or suffix `(ID)` per Story 2.

**Error Handling Flow:**
1. API returns `__error` → keep previous selection, show toast "Unable to load project scopes"
2. `display_name` missing → log `WARN` with project_id, render ID fallback
3. Empty project list → render only "All (Shared)" option

---



## 7. Security Requirements

### 7.1 Authentication & Authorization
Existing admin authentication unchanged.

---

## 8. Non-Functional Requirements

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
| Performance | Dropdown load | No perceptible delay vs current |
| Availability | Uptime | No impact to admin availability |

<!-- TA enrichment -->
### 8.1 Quantified NFR Targets [Implements: BRD §6]

| Category | Requirement | Target | Measurement |
|----------|-------------|--------|-------------|
| Performance | Dropdown initial load time | p95 < 200ms | Client-side timing from `api('/projects')` request start to render complete |
| Performance | API response time | p95 < 100ms | Backend `GET /api/admin/projects` query execution |
| Performance | Render time | < 50ms | React render of `<select>` options for up to 100 projects |
| Availability | Admin UI uptime | 99.9% during business hours | No additional downtime introduced by name mapping |
| Scalability | Number of scopes supported | Up to 500 projects | Dropdown remains responsive; query limited to 100 rows by default |
| Security | Authentication | JWT validation on every request | No unauthenticated access to project list |
| Maintainability | Code change footprint | < 100 LOC changed in admin UI | Isolated to `WorkspaceSelector` component |
| Logging | Missing name warnings | Logged at WARN level | `display_name` empty → log warning with `project_id` |

**Rationale**: Existing behavior loads IDs only. Adding name mapping adds one DB round-trip. With `project_registry` indexed on `last_seen` and limit 100, query cost is negligible. Frontend fallback ensures zero regression.

---



## 9. Error Handling (User-Facing)

| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
| Name lookup fails | Warning | Option shows ID fallback | Log warning, continue |
| API fails | Error | "Unable to load project scopes" | Show toast, retain previous |

---

## 10. Testing Considerations

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-1 | Valid names present | API returns id+name | Dropdown shows names | High |
| TC-2 | Name missing | API returns id only | Dropdown shows id fallback | High |
| TC-3 | Identifier visible | Config enabled | Label shows Name (ID) | Medium |
| TC-4 | All Shared preserved | API includes shared | Label remains 'All (Shared)' | High |

---

## 11. Appendix

### Diagrams
| Diagram | File |
|---------|------|
| System Context | [system-context.png](diagrams/system-context.png) |
| UI Mockup Project Scope | [ui-project-scope.png](diagrams/ui-project-scope.png) |

### Change Log from BRD
No deviations. FSD adds API contract and UI behavior details derived from BRD stories.

<!-- TA enrichment -->
### 11.1 Open Issues & Technical Decisions Log [Implements: BRD §5]

| ID | Issue/Decision | Description | Owner | Target Date | Status |
|----|----------------|-------------|-------|-------------|--------|
| TA-01 | Endpoint naming mismatch | FSD documents `/api/admin/project-scopes` but implementation uses `/api/admin/projects`. Align documentation or add alias. | TA | 2026-09-06 | Open |
| TA-02 | Identifier visibility toggle | Story 2 requires optional ID display. No UI toggle defined. Decide default: show ID in tooltip via `title` attribute, or `Name (ID)` format. | BA/UX | 2026-09-07 | Open |
| TA-03 | Caching strategy | Backend currently has no cache for project list. Recommend 5 min in-memory cache to reduce DB load. | DevOps | 2026-09-10 | Proposed |
| TA-04 | `display_name` population | Some projects may have empty `display_name`. Determine source of truth for name generation (workspace folder name vs config). | BA | 2026-09-08 | Open |
| TA-05 | Performance baseline | No current p95 measurements for dropdown load. Establish baseline before release. | QA | 2026-09-09 | Open |

**Notes:**
- Issue TA-01 is documentation only; no code change required if FSD updated to reflect actual endpoint.
- All changes confined to `backend/src/viewer/admin/index.html` `WorkspaceSelector` component and optional backend caching.


