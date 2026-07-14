# Functional Specification Document (FSD)

## Ticket: SA4E-30 — KB Multi-Tenant Auth: Replace MCP with REST API + JWT + Hard Data Isolation

## 5. API Specifications

### 5.1 Common Headers

| Header | Required | Description |
|--------|----------|-------------|
| Authorization | Conditional | `Bearer <JWT>` — required when `CODE_INTEL_REQUIRE_AUTH=true` |
| Content-Type | Yes | `application/json` |

### 5.2 Response Envelope

```json
// Success
{"data": { ... }, "error": null}
// Error
{"data": null, "error": {"code": "ERROR_CODE", "message": "Human-readable message"}}
```

### 5.3 POST /api/v1/memory/search

**Request Body:**
```json
{
  "query": "string (required)",
  "limit": 10,
  "scope": "USER|WORKSPACE|PROJECT|SHARED (optional filter)",
  "type": "DECISION|ERROR_PATTERN|... (optional)",
  "detail": false
}
```

**Response 200:** Array of matching entries with scores.

### 5.4 POST /api/v1/memory/ingest

**Request Body:**
```json
{
  "content": "string (required)",
  "summary": "string (optional, auto-generated)",
  "type": "DECISION|ERROR_PATTERN|ARCHITECTURE|... (required)",
  "scope": "USER|WORKSPACE|PROJECT|SHARED (required)",
  "source": "string (optional)",
  "tags": "string (optional, comma-separated)"
}
```

**Response 201:** Created entry with id and scope.

### 5.5 POST /api/v1/memory/ingest-file

**Request Body:**
```json
{
  "file_path": "string (required)",
  "type": "CONTEXT (default)",
  "scope": "USER (default)",
  "format": "markdown (default)"
}
```

**Response 201:** Chunk count and scope.

### 5.6 POST /api/v1/code/search

**Request Body:**
```json
{
  "query": "string (required)",
  "limit": 20
}
```

**Response 200:** Array of code symbols with file, line, type.

### 5.7 POST /api/v1/context/curated

**Request Body:**
```json
{
  "query": "string (required)",
  "max_tokens": 4000,
  "include_source": true,
  "include_memory": true,
  "include_graph": true
}
```

**Response 200:** Curated context string with sources and token count.

### 5.8 GET /api/v1/admin/status

**Response 200:** Server health, version, entry counts.

### 5.9 POST /api/v1/admin/migrate-scope

**Request Body:**
```json
{
  "mapping": {"project_id_1": "workspace_id_1"},
  "dry_run": false
}
```

**Response 200:** Migration result with counts.

## 6. Data Model

### 6.1 knowledge_entries table

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | No | Primary key |
| content | TEXT | No | Full content |
| summary | TEXT | Yes | Brief summary |
| type | TEXT | No | Entry type |
| scope | TEXT | No | USER/WORKSPACE/PROJECT/SHARED |
| user_id | TEXT | Yes | Owner user |
| workspace_id | TEXT | Yes | Workspace identifier (NEW) |
| project_id | TEXT | Yes | Project identifier |
| source | TEXT | Yes | Origin |
| tags | TEXT | Yes | Tags |
| tier | TEXT | No | Knowledge tier |
| created_at | TEXT | No | Timestamp |
| updated_at | TEXT | No | Timestamp |

### 6.2 Required Indexes

```sql
CREATE INDEX idx_scope_isolation ON knowledge_entries(scope, user_id, workspace_id, project_id);
CREATE INDEX idx_workspace ON knowledge_entries(workspace_id);
CREATE INDEX idx_project ON knowledge_entries(project_id);
```

## 7. Error Handling

| HTTP | Code | Message | Trigger |
|------|------|---------|---------|
| 401 | AUTH_REQUIRED | Authentication required | No token + auth required |
| 401 | TOKEN_INVALID | Invalid or expired token | Bad JWT |
| 403 | ACCESS_DENIED | Access denied: entry belongs to a different scope | Ownership fail |
| 400 | INVALID_REQUEST | {field} is required | Missing field |
| 400 | INVALID_SCOPE | Invalid scope value | Bad scope |
| 404 | NOT_FOUND | Entry not found | Missing entry |
| 500 | INTERNAL_ERROR | Internal server error | Unexpected |

## 8. Token Lifecycle States

```
[No Token] --OAuth Login--> [Valid Token]
[Valid Token] --Time--> [Near Expiry <5min]
[Near Expiry] --Refresh OK--> [Valid Token]
[Near Expiry] --Refresh Fail--> [Expired]
[Expired] --Re-auth--> [Valid Token]
[Valid Token] --Logout--> [No Token]
```

## 9. Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Auth Sequence | [sequence-auth.png](diagrams/sequence-auth.png) | [sequence-auth.drawio](diagrams/sequence-auth.drawio) |
| 3 | Token Lifecycle | [state-token.png](diagrams/state-token.png) | [state-token.drawio](diagrams/state-token.drawio) |
