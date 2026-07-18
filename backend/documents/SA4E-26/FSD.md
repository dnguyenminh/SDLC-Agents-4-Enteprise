# Functional Specification Document (FSD)

## SA4E Code Intelligence - SA4E-26: KB Knowledge Base thieu Project Isolation - Data tu nhieu projects bi tron lan

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-26 |
| Title | KB Knowledge Base thieu Project Isolation |
| Type | Bug |
| Author | BA Agent + TA Agent |
| Version | 1.0 |
| Date | 2026-07-09 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-26.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-09 | BA Agent | Initial draft - use cases, business rules, data specs |
| 1.0 | 2026-07-09 | TA Agent | Technical enrichment - API contracts, pseudocode, integration specs |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional behavior for adding project isolation to the Knowledge Base (KB) memory system. It defines how the `project_id` column will be used to filter PROJECT-scope entries, ensuring data from different workspaces does not leak across project boundaries.

### 1.2 Scope

**In Scope:**
- Adding `project_id` column to `knowledge_entries` table
- Modifying scope filtering logic in `MemoryEngine.buildScopeClause()`
- Passing `projectId` through `ScopeContext` on ingestion and search
- Deriving project identifier from workspace path in `BackendConfig`

**Out of Scope:**
- Scope hierarchy changes (USER/PROJECT/SHARED remains)
- FTS5 index restructuring
- Vector search algorithm changes
- Graph edge modifications
- Frontend/UI changes
- Data migration for legacy entries

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| KB | Knowledge Base - FTS-indexed SQLite storage for structured knowledge entries |
| Scope | Visibility level: USER (personal), PROJECT (team), SHARED (global) |
| ScopeContext | Request-level context containing userId and projectId for access control |
| Project Isolation | Principle that PROJECT-scope data from one workspace must not leak into another |
| FTS5 | SQLite Full-Text Search extension used for knowledge entry indexing |
| BM25 | Best Matching 25 - ranking function used by FTS5 |
| MCP | Model Context Protocol - communication protocol between agents and backend |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-SA4E-26.docx |
| SA4E Architecture | .code-intel/SA4E-ARCHITECTURE.md |
| Memory Module Schema | backend/src/modules/memory/schema.ts |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

The KB Memory subsystem sits within the SA4E Backend Server. It receives tool calls (mem_search, mem_ingest, mem_crud) from the MCP Bridge which routes agent requests. The Extension derives the project identifier from the workspace path and passes it as part of every ScopeContext.

### 2.2 System Architecture (Affected Components)

The fix touches a vertical slice through the Memory Module:

1. **BackendConfig** (config layer) - Derives and stores `projectId`
2. **MemoryToolDispatcher** (tool handler layer) - Extracts `projectId` from ScopeContext, passes to engine
3. **MemoryEngine** (data access layer) - Uses `projectId` in scope clause for filtering
4. **Schema** (database layer) - New `project_id` column on `knowledge_entries`

---

## 3. Functional Requirements

### 3.1 Feature: Project-Isolated KB Search

**Source:** BRD Story 1

#### 3.1.1 Description

When a user searches the KB, results must be filtered by the current project. PROJECT-scope entries from other projects must not appear. SHARED-scope entries remain visible to all. Legacy entries (project_id = NULL) remain accessible for backward compatibility.

#### 3.1.2 Use Case

**Use Case ID:** UC-01
**Actor:** Developer (via AI Agent)
**Preconditions:**
- Backend server running with valid ScopeContext
- KB contains entries from multiple projects
**Postconditions:**
- Search results contain only authorized entries per scope rules

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Agent | | Calls `mem_search` with query and ScopeContext (userId, projectId) |
| 2 | | MemoryToolDispatcher | Validates ScopeContext, extracts projectId |
| 3 | | MemoryEngine | Builds WHERE clause with project filter |
| 4 | | SQLite | Executes FTS5 + scope filter query |
| 5 | | MemoryEngine | Applies vector re-ranking (if enabled) |
| 6 | | MemoryToolDispatcher | Returns filtered SearchResult[] |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | ScopeContext has no projectId (legacy client) | System treats as `projectId = NULL`, returns all PROJECT entries (backward compat) |
| AF-02 | Query matches only SHARED entries | SHARED entries returned regardless of project filter |
| AF-03 | Entry has project_id = NULL (legacy entry) | Included in results for any project (graceful degradation) |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | Empty query string | Return empty result set with validation error |
| EF-02 | Invalid ScopeContext (missing userId) | Return 400 error: "userId required in ScopeContext" |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-01 | PROJECT-scope entries are only visible within the same project (matching project_id) | BRD Story 1, AC 1-2 |
| BR-02 | SHARED-scope entries are always visible regardless of project_id filter | BRD Story 4, AC 1 |
| BR-03 | Legacy entries (project_id = NULL) are accessible by all projects | BRD Story 3, AC 2 |
| BR-04 | USER-scope entries are only visible to the owning user (existing behavior, unchanged) | Existing system |
| BR-05 | When ScopeContext.projectId is absent, all PROJECT entries are visible (backward compat) | BRD Story 3 |

#### 3.1.4 Data Specifications

**Input Data (mem_search):**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| query | string | Yes | Non-empty, max 1000 chars | Search query text |
| scope | ScopeContext | Yes | userId required, projectId optional | Access control context |
| limit | number | No | 1-100, default 20 | Max results |
| type | string | No | Valid entry type | Filter by entry type |
| tier | string | No | WORKING/REFERENCE/ARCHIVE | Filter by tier |

**Output Data (SearchResult):**

| Field | Type | Description |
|-------|------|-------------|
| id | number | Entry ID |
| content | string | Full entry content |
| summary | string | Entry summary |
| score | number | Relevance score (BM25 + vector) |
| type | string | Entry type |
| scope | string | USER/PROJECT/SHARED |
| project_id | string | null | Project that owns the entry |
| tags | string | Comma-separated tags |

#### 3.1.5 API Contract (Functional View)

**Tool:** `mem_search`
**Purpose:** Search KB entries with project isolation

**Input Parameters:**

| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| query | string | Yes | — | Search text |
| scopeContext.userId | string | Yes | BR-04 | Current user ID |
| scopeContext.projectId | string | No | BR-01, BR-05 | Current project ID (derived from workspace) |
| limit | number | No | — | Max results (default: 20) |
| type | string | No | — | Filter by entry type |

**Business Error Scenarios:**

| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| Missing userId | "ScopeContext requires userId" | ScopeContext.userId is empty/null |
| Empty query | "Query must not be empty" | query is empty string |

---

### 3.2 Feature: Project-Tagged Ingestion

**Source:** BRD Story 2

#### 3.2.1 Description

When a new entry is ingested into the KB, it must be tagged with the current project's identifier. This ensures future searches can correctly filter by project.

#### 3.2.2 Use Case

**Use Case ID:** UC-02
**Actor:** Developer (via AI Agent)
**Preconditions:**
- Backend running with valid ScopeContext containing projectId
- Agent has content to ingest
**Postconditions:**
- New entry stored with project_id column populated

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Agent | | Calls `mem_ingest` with content, metadata, and ScopeContext |
| 2 | | MemoryToolDispatcher | Extracts projectId from ScopeContext |
| 3 | | MemoryEngine.insert() | Stores entry with project_id = ScopeContext.projectId |
| 4 | | SQLite | INSERT with project_id column value |
| 5 | | VectorEngine | Generates embedding, stores in knowledge_vectors |
| 6 | | MemoryToolDispatcher | Returns new entry ID |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | ScopeContext has no projectId | Entry stored with project_id = NULL (backward compat) |
| AF-02 | scope = 'SHARED' | project_id still stored (for audit trail) but entry visible cross-project |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | Content is empty | Return validation error |
| EF-02 | Database write fails | Return 500 error, log details |

#### 3.2.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-06 | Every new entry ingested with ScopeContext MUST have project_id populated | BRD Story 2, AC 1 |
| BR-07 | SHARED-scope entries store project_id (audit) but remain visible cross-project | BRD Story 4, AC 2 |
| BR-08 | Entries ingested without ScopeContext.projectId get project_id = NULL | BRD Story 2, AC 3 |

#### 3.2.4 Data Specifications

**Input Data (mem_ingest):**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| content | string | Yes | Non-empty, max 50000 chars | Entry content |
| summary | string | No | Auto-generated if absent | Brief summary |
| type | string | Yes | Valid type enum | Entry type classification |
| scope | string | No | USER/PROJECT/SHARED, default USER | Visibility scope |
| tags | string | No | Comma-separated | Tags for categorization |
| source | string | No | — | Source reference |
| scopeContext.projectId | string | No | — | Project to tag entry with |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| id | number | Newly created entry ID |
| success | boolean | Whether ingestion succeeded |

#### 3.2.5 API Contract (Functional View)

**Tool:** `mem_ingest`
**Purpose:** Store new KB entry with project tagging

**Input Parameters:**

| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| content | string | Yes | — | Entry content to store |
| type | string | Yes | — | Entry classification |
| scope | string | No | — | Visibility (default: USER) |
| scopeContext.projectId | string | No | BR-06, BR-08 | Project identifier to tag |

**Business Error Scenarios:**

| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| Empty content | "Content must not be empty" | content is empty/null |
| Invalid scope | "Scope must be USER, PROJECT, or SHARED" | scope not in allowed values |

---

### 3.3 Feature: Automatic Project Identifier Derivation

**Source:** BRD Story 5

#### 3.3.1 Description

The project identifier is automatically derived from the workspace path when the backend starts. This avoids requiring manual configuration from the user.

#### 3.3.2 Use Case

**Use Case ID:** UC-03
**Actor:** System (automatic on startup)
**Preconditions:**
- Extension activated in a workspace
- Workspace path available
**Postconditions:**
- projectId stored in BackendConfig and passed in every ScopeContext

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Extension | Activates in workspace |
| 2 | | Extension | Reads workspace root path (e.g., `/projects/my-app`) |
| 3 | | Extension | Extracts last path segment as projectId (e.g., `my-app`) |
| 4 | | Extension | Stores projectId in config, passes to backend on connection |
| 5 | | Backend | Stores projectId in BackendConfig for session |
| 6 | | Backend | Includes projectId in every ScopeContext constructed for tool calls |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | BackendConfig has explicit projectId override | Use configured value instead of derived |
| AF-02 | Workspace path is root (/) or empty | Use "default" as projectId |

#### 3.3.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-09 | Default derivation: last segment of workspace path | BRD Story 5, AC 1 |
| BR-10 | Explicit BackendConfig.projectId overrides derived value | BRD Story 5, AC 2 |
| BR-11 | projectId is passed in every ScopeContext for tool calls | BRD Story 5, AC 3 |

---

### 3.4 Feature: Legacy Entry Backward Compatibility

**Source:** BRD Story 3

#### 3.4.1 Description

Existing entries that do not have a project_id (pre-migration) must remain accessible to all projects. The system must not break when encountering NULL project_id values.

#### 3.4.2 Use Case

**Use Case ID:** UC-04
**Actor:** Developer (via AI Agent)
**Preconditions:**
- KB contains entries created before migration (project_id = NULL)
- User searches from any project
**Postconditions:**
- Legacy entries appear in search results alongside project-specific entries

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Agent | | Calls `mem_search` with ScopeContext (projectId = 'my-app') |
| 2 | | MemoryEngine | Builds scope clause |
| 3 | | SQLite | WHERE clause includes: `project_id = 'my-app' OR project_id IS NULL` |
| 4 | | MemoryEngine | Legacy entries with NULL project_id included in results |

#### 3.4.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-12 | Schema migration adds project_id with DEFAULT NULL (no data loss) | BRD Story 3, AC 1 |
| BR-13 | Entries with project_id = NULL pass scope filter for any project | BRD Story 3, AC 2 |
| BR-14 | No data migration required - entries get project_id on next update/re-ingest | BRD Assumptions |

---

## 4. Data Model

### 4.1 Entity Relationship

#### Entity: knowledge_entries (modified)

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| id | INTEGER | Yes (PK) | — | Auto-increment primary key |
| project_id | TEXT | No | BR-06, BR-12 | **NEW** - Project identifier for isolation |
| content | TEXT | Yes | — | Entry content |
| summary | TEXT | Yes | — | Brief summary |
| type | TEXT | Yes | — | Entry type classification |
| scope | TEXT | Yes | — | USER/PROJECT/SHARED |
| user_id | TEXT | No | BR-04 | Owner user ID |
| ... | ... | ... | ... | (other existing columns unchanged) |

**New Index:**

| Index | Columns | Purpose |
|-------|---------|---------|
| idx_ke_project_id | project_id | Fast filtering by project |
| idx_ke_scope_project | scope, project_id | Composite for scope clause |

---

## 5. Integration Specifications

### 5.1 External System: IDE Extension (Kiro/VS Code)

| Attribute | Value |
|-----------|-------|
| Purpose | Derives projectId from workspace path, passes to backend |
| Direction | Outbound (Extension -> Backend) |
| Data Format | JSON (ScopeContext in every MCP tool call) |
| Frequency | Every tool invocation |

**Data Exchange:**

| Our Data | External Data | Direction | Business Rule |
|----------|--------------|-----------|---------------|
| ScopeContext.projectId | workspace.rootPath (last segment) | Receive | BR-09, BR-10 |
| ScopeContext.userId | Extension auth context | Receive | BR-04 |

### 5.2 Internal Integration: MCP Tool Bridge

| Attribute | Value |
|-----------|-------|
| Purpose | Routes mem_* tool calls from agents to MemoryModule |
| Direction | Bidirectional |
| Data Format | MCP JSON-RPC |
| Frequency | Per agent tool call |

---

## 6. Processing Logic

### 6.1 Scope Clause Construction

**Trigger:** Every KB query (search, list, filter)
**Input:** ScopeContext { userId, projectId }
**Output:** SQL WHERE clause string + parameters array

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Check if ScopeContext.projectId is present | If absent, use permissive clause (all PROJECT visible) |
| 2 | Build SHARED clause: `scope = 'SHARED'` | Always included |
| 3 | Build PROJECT clause: `scope = 'PROJECT' AND (project_id = ? OR project_id IS NULL)` | Include NULL for backward compat |
| 4 | Build USER clause: `scope = 'USER' AND user_id = ?` | Existing behavior |
| 5 | Combine with OR: `(SHARED) OR (PROJECT with filter) OR (USER)` | — |

**Pseudocode:**

```typescript
buildScopeClause(ctx: ScopeContext, tableAlias?: string): string {
  const p = tableAlias ? `${tableAlias}.` : '';
  if (ctx.projectId) {
    return `(${p}scope = 'SHARED' OR (${p}scope = 'PROJECT' AND (${p}project_id = ? OR ${p}project_id IS NULL)) OR (${p}scope = 'USER' AND ${p}user_id = ?))`;
  }
  // Backward compat: no projectId means all PROJECT entries visible
  return `(${p}scope IN ('PROJECT', 'SHARED') OR (${p}scope = 'USER' AND ${p}user_id = ?))`;
}

buildScopeParams(ctx: ScopeContext): unknown[] {
  if (ctx.projectId) {
    return [ctx.projectId, ctx.userId];
  }
  return [ctx.userId];
}
```

### 6.2 Entry Ingestion with Project Tagging

**Trigger:** `mem_ingest` tool call
**Input:** Content + metadata + ScopeContext
**Output:** New entry ID

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Extract projectId from ScopeContext | If absent, use NULL |
| 2 | Validate content is non-empty | Return validation error |
| 3 | Call MemoryEngine.insert() with project_id parameter | DB error -> 500 |
| 4 | Generate embedding vector | Embedding failure -> store entry without vector, log warning |
| 5 | Return new entry ID | — |

### 6.3 Project ID Derivation

**Trigger:** Backend startup / Extension activation
**Input:** Workspace root path
**Output:** projectId string

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Read workspace.rootPath from config | If unavailable, use "default" |
| 2 | Check BackendConfig.projectId override | If set, use override value |
| 3 | Extract last path segment: `path.split('/').pop()` or `path.split('\\').pop()` | If empty after split, use "default" |
| 4 | Store in BackendConfig.projectId | — |

---

## 7. Security Requirements

### 7.1 Authentication & Authorization

| Role | Permissions | Screens/Features |
|------|-------------|-------------------|
| Developer (Agent) | Read/Write KB entries within own project | mem_search, mem_ingest, mem_crud |
| System Admin | Read/Write all entries, promote scope | mem_promote |

### 7.2 Data Sensitivity Classification

| Data Type | Classification | Business Requirement |
|-----------|---------------|---------------------|
| project_id | Internal | Project isolation boundary - prevents data leakage |
| KB entry content | Internal | May contain code snippets, architecture details |
| user_id | Internal | User identification for USER-scope filtering |

### 7.3 Audit Trail

| Event | Logged Fields | Retention | Business Reason |
|-------|--------------|-----------|-----------------|
| Entry created | entry_id, project_id, scope, user_id | Indefinite | Track which project owns data |
| Scope promoted | entry_id, from_scope, to_scope | Indefinite | Audit scope changes |

---

## 8. Non-Functional Requirements

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
| Performance | Search latency unchanged after adding project filter | < 5ms additional overhead on indexed column |
| Backward Compatibility | Zero downtime migration | ALTER TABLE ADD COLUMN is online in SQLite |
| Data Integrity | No data loss on migration | Existing entries get NULL project_id, remain queryable |
| Scalability | Support thousands of entries per project | Indexed column supports efficient filtering |

---

## 9. Error Handling (User-Facing)

### 9.1 Error Scenarios

| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
| Missing userId in ScopeContext | Warning | "ScopeContext requires userId for scope filtering" | Fallback to showing all non-USER entries |
| Schema migration fails | Critical | "Database migration failed. Please restart." | Server logs error, exits gracefully |
| Invalid projectId format | Info | (none - sanitized internally) | Strip special chars, use as-is |

### 9.2 Notification Requirements

| Event | Who is Notified | Channel | Timing |
|-------|----------------|---------|--------|
| Migration applied | Developer (log) | Server console log | On startup |
| Scope filter applied with NULL projectId | Developer (debug log) | Debug log | Per query |

---

## 10. Testing Considerations

### 10.1 Test Scenarios

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-01 | Search with projectId filters PROJECT entries | query="test", projectId="app-A" | Only app-A PROJECT entries + all SHARED + user's USER entries | High |
| TC-02 | Search without projectId shows all PROJECT entries | query="test", no projectId | All PROJECT + SHARED + user's USER entries (backward compat) | High |
| TC-03 | Ingest tags entry with projectId | content="...", projectId="app-A" | New entry has project_id = "app-A" | High |
| TC-04 | Ingest without projectId stores NULL | content="...", no projectId | New entry has project_id = NULL | High |
| TC-05 | Legacy entries (NULL project_id) visible to all | Pre-existing entries with NULL | Included in search results for any project | High |
| TC-06 | SHARED entries visible cross-project | SHARED entry from project-A | Visible when searching from project-B | High |
| TC-07 | ProjectId derived from workspace path | workspace="/projects/my-app" | projectId = "my-app" | Medium |
| TC-08 | ProjectId override from config | config.projectId = "custom" | projectId = "custom" (override wins) | Medium |

---

## 11. Appendix

### 11.1 Scope Clause Truth Table

| Entry Scope | Entry project_id | Query projectId | Visible? | Rule |
|-------------|-----------------|-----------------|----------|------|
| SHARED | any | any | YES | BR-02 |
| PROJECT | "app-A" | "app-A" | YES | BR-01 (match) |
| PROJECT | "app-A" | "app-B" | NO | BR-01 (mismatch) |
| PROJECT | NULL | "app-A" | YES | BR-03 (legacy) |
| PROJECT | "app-A" | NULL (no ctx) | YES | BR-05 (backward compat) |
| USER | any | any | Only if user_id matches | BR-04 |

### 11.2 Affected Files Summary

| File | Change | Complexity |
|------|--------|-----------|
| schema.ts | Add `project_id TEXT DEFAULT NULL` column + index | Low |
| MemoryEngine.ts | Modify `buildScopeClause()`, `buildScopeParams()`, `insert()` | Medium |
| MemoryToolDispatcher.ts | Extract `projectId` from ScopeContext, pass to insert | Low |
| models.ts | Make `ScopeContext.projectId` explicitly documented (already optional) | Low |
| BackendConfig.ts | Add `projectId` derivation from workspace path | Low |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Scope Filter Sequence | [sequence-scope-filter.png](diagrams/sequence-scope-filter.png) | [sequence-scope-filter.drawio](diagrams/sequence-scope-filter.drawio) |
| 3 | Entry Lifecycle State | [state-entry-lifecycle.png](diagrams/state-entry-lifecycle.png) | [state-entry-lifecycle.drawio](diagrams/state-entry-lifecycle.drawio) |

---

## TA REVIEW — Technical Enrichment

> **Reviewed by:** TA Agent | **Date:** 2026-07-09
> **Scope:** API contracts, pseudocode, integration specs, NFR quantification

---

## 12. Technical API Contracts (TA Addition)

### 12.1 Internal Tool: mem_search — Enhanced Contract

**MCP Tool Name:** `mem_search`
**Transport:** JSON-RPC over MCP StreamableHTTP

**Request Schema:**

```json
{
  "name": "mem_search",
  "arguments": {
    "query": "string (required, 1-1000 chars)",
    "limit": "number (optional, 1-100, default: 20)",
    "tier": "string (optional: WORKING|REFERENCE|ARCHIVE)",
    "type": "string (optional: CONTEXT|DECISION|PATTERN|...)",
    "scope": "string (optional: 'all' bypasses scope filter)",
    "detail": "boolean (optional: include full content in response)"
  }
}
```

**ScopeContext (injected per-request via `setScopeContext()`):**

```typescript
interface ScopeContext {
  userId: string;    // Required — identifies current user
  projectId?: string; // Optional — derived from workspace path
}
```

**Response Schema (success):**

```
Found {N} results:

[{type}] {summary}
  ID: {id} | Tier: {tier} | Scope: {scope} | Score: {score}
  Content: {content_first_500_chars}  // only if detail=true
```

**Response Schema (error):**

```
Error: query required
```

**Behavioral Changes for SA4E-26:**
1. When `scope !== 'all'` AND `scopeCtx.projectId` is present:
   - PROJECT entries filtered by `project_id = ctx.projectId OR project_id IS NULL`
2. When `scope !== 'all'` AND `scopeCtx.projectId` is absent:
   - Fallback to current behavior (all PROJECT entries visible)
3. `scope = 'all'` continues to bypass all scope filtering (admin/debug use)

---

### 12.2 Internal Tool: mem_ingest — Enhanced Contract

**MCP Tool Name:** `mem_ingest`

**Request Schema:**

```json
{
  "name": "mem_ingest",
  "arguments": {
    "content": "string (required, 1-50000 chars)",
    "summary": "string (optional, auto-generated from first 120 chars)",
    "title": "string (optional, alias for summary)",
    "type": "string (optional, default: 'CONTEXT')",
    "scope": "string (optional, default: 'USER', values: USER|PROJECT|SHARED)",
    "tags": "string|string[] (optional, comma-separated or array)",
    "source": "string (optional, source reference)",
    "user_id": "string (optional, override scopeCtx.userId)",
    "agent_name": "string (optional, which agent created this)"
  }
}
```

**Behavioral Changes for SA4E-26:**
1. After `insert()` call, the `project_id` column is populated from `this.scopeCtx?.projectId`
2. If `scopeCtx` is undefined or `projectId` is absent, `project_id = NULL` (backward compat)
3. The `project_id` value is stored regardless of `scope` value (audit trail for SHARED entries)

**Response Schema (success):**

```
Knowledge entry created: id={id}, type={type}, scope={scope}, tier={tier} - "{summary}"
```

---

### 12.3 BackendConfig API — Project ID Resolution

**Resolution Order (highest priority first):**

| Priority | Source | Example |
|----------|--------|---------|
| 1 | Explicit override in config | `loadConfig({ projectId: 'custom-name' })` |
| 2 | Environment variable | `CODE_INTEL_PROJECT_ID=my-project` |
| 3 | Derived from workspace path | `/projects/my-app` → `my-app` |
| 4 | Fallback | `'default'` |

**Derivation Algorithm:**

```typescript
function deriveProjectId(workspace: string): string {
  // Use last non-empty path segment
  const segments = workspace.replace(/\\/g, '/').split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : 'default';
}
```

---

## 13. Integration Architecture (TA Addition)

### 13.1 ScopeContext Lifecycle

```
Extension Activates
  → reads workspace.rootPath
  → derives projectId (last path segment)
  → passes to Backend on MCP connection init

Backend receives connection
  → stores projectId in session config
  → on each tool call:
    → constructs ScopeContext { userId, projectId }
    → calls dispatcher.setScopeContext(ctx)
    → dispatcher passes ctx to engine methods
```

### 13.2 Data Flow for Project-Filtered Search

```
Agent: mem_search("find auth patterns")
  → MCP Bridge routes to MemoryModule
    → MemoryToolDispatcher.handleSearch()
      → checks this.scopeCtx (set per-request)
      → calls engine.search(query, limit, tier, type, scopeCtx)
        → MemoryEngine.buildScopeClause(scopeCtx)
          → IF projectId present:
              "(scope = 'SHARED'
               OR (scope = 'PROJECT' AND (project_id = ? OR project_id IS NULL))
               OR (scope = 'USER' AND user_id = ?))"
          → ELSE (no projectId, backward compat):
              "(scope IN ('PROJECT', 'SHARED')
               OR (scope = 'USER' AND user_id = ?))"
        → MemoryEngine.buildScopeParams(scopeCtx)
          → IF projectId: [projectId, userId]
          → ELSE: [userId]
        → SQLite FTS5 query with scope WHERE clause
      → returns SearchResult[]
    → formats response string
  → Agent receives filtered results
```

### 13.3 Data Flow for Project-Tagged Ingestion

```
Agent: mem_ingest({ content: "...", scope: "PROJECT" })
  → MCP Bridge routes to MemoryModule
    → MemoryToolDispatcher.handleIngest()
      → extracts fields from arguments
      → calls engine.insert({ ..., project_id: this.scopeCtx?.projectId ?? null })
        → INSERT INTO knowledge_entries (..., project_id) VALUES (..., ?)
      → triggers async tag analysis (unchanged)
      → returns success response with entry ID
```

---

## 14. Detailed Pseudocode (TA Addition)

### 14.1 Modified MemoryEngine.insert()

```typescript
insert(entry: Partial<KnowledgeEntry>): number {
  const stmt = this.db.prepare(`
    INSERT INTO knowledge_entries
    (content, summary, type, tier, scope, user_id, project_id, source, source_ref, tags, confidence, agent_name, owner)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    entry.content, entry.summary, entry.type,
    entry.tier ?? 'WORKING', entry.scope ?? 'USER',
    entry.user_id ?? null,
    entry.project_id ?? null,  // NEW: project isolation
    entry.source ?? null,
    entry.source_ref ?? null, entry.tags ?? '',
    entry.confidence ?? 1.0, entry.agent_name ?? null,
    entry.owner ?? null,
  );
  return result.lastInsertRowid as number;
}
```

### 14.2 Modified buildScopeClause()

```typescript
buildScopeClause(ctx: ScopeContext, tableAlias?: string): string {
  const p = tableAlias ? `${tableAlias}.` : '';
  
  if (ctx.projectId) {
    // Full project isolation: only same-project or legacy entries visible
    return `(${p}scope = 'SHARED' ` +
           `OR (${p}scope = 'PROJECT' AND (${p}project_id = ? OR ${p}project_id IS NULL)) ` +
           `OR (${p}scope = 'USER' AND ${p}user_id = ?))`;
  }
  
  // Backward compatibility: no projectId = legacy behavior (all PROJECT visible)
  return `(${p}scope IN ('PROJECT', 'SHARED') OR (${p}scope = 'USER' AND ${p}user_id = ?))`;
}
```

### 14.3 Modified buildScopeParams()

```typescript
buildScopeParams(ctx: ScopeContext): unknown[] {
  if (ctx.projectId) {
    return [ctx.projectId, ctx.userId];
  }
  return [ctx.userId];
}
```

### 14.4 Modified handleIngest() — Project ID Passthrough

```typescript
private handleIngest(a: Args): string {
  // ... existing validation ...
  
  const id = this.engine.insert({
    content, summary, type,
    tier: this.tierForType(type),
    scope, user_id: userId,
    project_id: this.scopeCtx?.projectId ?? null,  // NEW
    source, tags,
    agent_name: agentName,
    owner: this.inferOwner(source),
  });
  
  // ... rest unchanged ...
}
```

### 14.5 Schema Migration DDL

```sql
-- Safe migration: ADD COLUMN is online operation in SQLite
ALTER TABLE knowledge_entries ADD COLUMN project_id TEXT DEFAULT NULL;

-- New indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_ke_project_id ON knowledge_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_ke_scope_project ON knowledge_entries(scope, project_id);
```

### 14.6 BackendConfig Extension

```typescript
const BackendConfigSchema = z.object({
  // ... existing fields ...
  projectId: z.string().optional(),  // NEW: explicit override
});

export type BackendConfig = z.infer<typeof BackendConfigSchema> & {
  workspace: string;
  resolvedProjectId: string;  // NEW: final resolved value
};

export function loadConfig(overrides?: Partial<BackendConfig>): BackendConfig {
  const raw = { /* ... existing ... */ };
  const parsed = BackendConfigSchema.parse(raw);
  
  return {
    ...parsed,
    workspace: raw.workspace,
    resolvedProjectId: parsed.projectId 
      ?? process.env.CODE_INTEL_PROJECT_ID
      ?? deriveProjectId(raw.workspace),
  };
}

function deriveProjectId(workspace: string): string {
  const segments = workspace.replace(/\\/g, '/').split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : 'default';
}
```

---

## 15. Non-Functional Requirements — Quantified (TA Addition)

| Category | Requirement | Target | Measurement |
|----------|-------------|--------|-------------|
| Query Latency | Adding project_id filter must not degrade search | < 5ms overhead | Benchmark: 1000 queries with/without filter |
| Index Size | New index overhead acceptable | < 1% of DB size | Compare admin.db size before/after |
| Migration Time | Schema migration on startup | < 100ms for 100K entries | SQLite ALTER TABLE is O(1) for ADD COLUMN |
| Memory | No additional memory for filter logic | 0 additional allocation | Pure SQL clause construction |
| Backward Compat | Zero-downtime upgrade | 0 errors on first query after upgrade | Integration test |

---

## 16. Open Issues (TA Addition)

| # | Issue | Impact | Decision Needed By | Options |
|---|-------|--------|-------------------|---------|
| 1 | Should `projectId` be required (not optional) in ScopeContext going forward? | Medium — affects API contract | v2.0 release | A) Keep optional (backward compat) B) Make required with deprecation warning |
| 2 | Should there be a migration tool to retroactively tag existing entries? | Low — entries get tagged on re-ingest | Nice-to-have, post-fix | A) Build tool B) Organic acquisition on next ingest |
| 3 | Should `deriveProjectId` normalize the name (lowercase, strip special chars)? | Low — cosmetic | Implementation time | A) Raw path segment B) Normalized (lowercase, alphanumeric+hyphen) |

---

## 17. TA Review Summary

### Changes Validated Against Codebase

| File | Current State | Change Required | Complexity |
|------|---------------|-----------------|-----------|
| `schema.ts` | No `project_id` column | Add column + 2 indexes | Low |
| `MemoryEngine.ts` | `buildScopeClause` returns all PROJECT entries | Add projectId condition | Low-Medium |
| `MemoryToolDispatcher.ts` | `handleIngest` doesn't pass projectId | Add `project_id` to insert call | Low |
| `models.ts` | `ScopeContext.projectId` already optional | No change needed (interface correct) | None |
| `BackendConfig.ts` | Has `workspace` but no `projectId` | Add derivation logic | Low |

### Technical Risks Identified

1. **Parameter ordering in buildScopeParams**: When projectId is present, params array becomes `[projectId, userId]` instead of `[userId]`. All callers must account for this change in parameter count.
2. **FTS5 join queries**: The `search()` method uses table alias `ke` in scope clause. Verify alias usage is consistent.
3. **Schema migration ordering**: `ALTER TABLE ADD COLUMN` must run BEFORE any query that references `project_id`.

### Recommendation

- Complexity: **Low** — minimal code changes, well-isolated to Memory module
- Risk: **Low** — backward compatible by design, NULL handling prevents breakage
- Implementation time estimate: **2-4 hours** for a developer familiar with the codebase
