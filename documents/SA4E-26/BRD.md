# Business Requirements Document (BRD)

## SA4E Code Intelligence — SA4E-26: KB Knowledge Base thiếu Project Isolation — Data từ nhiều projects bị trộn lẫn

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-26 |
| Title | KB Knowledge Base thiếu Project Isolation |
| Type | Bug |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-07-09 |
| Status | Draft |
| Related Documents | BRD-v1-SA4E-26.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-09 | BA Agent | Initiate document — auto-generated from Jira ticket SA4E-26 |

---

## 1. Introduction

### 1.1 Scope

Bug fix cho Knowledge Base (KB) memory system trong SA4E Code Intelligence backend. Hiện tại, bảng `knowledge_entries` không có cột `project_id`, dẫn đến dữ liệu từ nhiều projects bị trộn lẫn khi query. Khi một user mở workspace A và search KB, kết quả có thể trả về entries từ workspace B — vi phạm nguyên tắc project isolation.

**Root cause:** `buildScopeClause()` trong `MemoryEngine.ts` chỉ filter theo `user_id` cho USER-scope entries, nhưng không filter PROJECT-scope entries theo project nào sở hữu chúng. Mọi entries có `scope = 'PROJECT'` đều visible cho tất cả users bất kể project.

### 1.2 Out of Scope

- Không thay đổi scope hierarchy logic (USER → PROJECT → SHARED vẫn giữ nguyên)
- Không thay đổi FTS5 index structure
- Không thay đổi vector search / ONNX embedding logic
- Không thay đổi graph edges hoặc graph service
- Không thay đổi UI/frontend
- Không migration dữ liệu cũ (entries đã có sẽ có project_id = NULL, vẫn accessible)

### 1.3 Preliminary Requirements

- Database schema migration phải backward-compatible (column thêm mới có DEFAULT NULL)
- Existing entries (không có project_id) vẫn accessible cho tất cả users (graceful degradation)
- Project identifier phải được truyền từ IDE extension context (workspace path hoặc derived project name)

---

## 2. Business Requirements

### 2.1 High Level Process Map

Khi user mở workspace và sử dụng KB tools (mem_search, mem_ingest, mem_crud), hệ thống cần:

1. Xác định project context (từ workspace path)
2. Gắn project_id vào mọi entry khi ingest
3. Filter theo project_id khi search/list
4. Đảm bảo PROJECT-scope entries chỉ visible trong cùng project

![Business Flow](diagrams/business-flow.png)

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case | Priority | Source Ticket |
|---|-----------------|----------|---------------|
| 1 | As a developer, I want KB search results only from my current project so that I don't see irrelevant data from other projects | MUST HAVE | SA4E-26 |
| 2 | As a developer, I want ingested entries tagged with my project so that they stay isolated | MUST HAVE | SA4E-26 |
| 3 | As a developer, I want entries without project_id to still be accessible so that existing data is not lost | MUST HAVE | SA4E-26 |
| 4 | As a system admin, I want SHARED-scope entries to remain cross-project visible so that global knowledge is preserved | MUST HAVE | SA4E-26 |
| 5 | As a developer, I want the project identifier derived automatically from workspace path so that I don't need manual configuration | SHOULD HAVE | SA4E-26 |

---

### 2.3 Details of User Stories

---

#### Business Flow

**Step 1:** User opens workspace in IDE (e.g., `/projects/my-app`)

**Step 2:** Extension activates → derives project identifier from workspace path (folder name or configurable override)

**Step 3:** Project identifier stored in BackendConfig and passed as part of ScopeContext to every tool call

**Step 4:** On `mem_ingest` — entry saved with `project_id` column populated

**Step 5:** On `mem_search` / `mem_crud` — query includes `project_id` filter in WHERE clause for PROJECT-scope entries

**Step 6:** Results returned only contain entries from the current project (PROJECT scope) + user's own entries (USER scope) + global entries (SHARED scope)

> **Note:** SHARED-scope entries are intentionally cross-project — they represent global knowledge that should be accessible everywhere.

---

#### STORY 1: Project-Isolated KB Search

> As a developer, I want KB search results only from my current project so that I don't see irrelevant data from other projects.

**Requirement Details:**

1. `buildScopeClause()` MUST include `project_id` filter for PROJECT-scope entries
2. The filter logic: `(scope = 'SHARED') OR (scope = 'PROJECT' AND project_id = ?) OR (scope = 'USER' AND user_id = ?)`
3. Entries with `project_id = NULL` (legacy) should be treated as accessible by all projects (backward compatibility)

**Acceptance Criteria:**

1. GIVEN a KB with entries from project-A and project-B, WHEN user in project-A runs `mem_search`, THEN results contain only entries where `project_id = 'project-A'` OR `project_id IS NULL` OR `scope = 'SHARED'`
2. GIVEN a KB with entries from project-A, WHEN user in project-B runs `mem_search`, THEN results do NOT contain project-A's PROJECT-scope entries
3. GIVEN a KB with SHARED-scope entries, WHEN any user from any project runs `mem_search`, THEN SHARED entries are always visible
4. GIVEN a KB with legacy entries (project_id = NULL), WHEN any user runs `mem_search`, THEN legacy entries are visible to all (graceful degradation)

---

#### STORY 2: Project-Tagged Ingestion

> As a developer, I want ingested entries tagged with my project so that they stay isolated.

**Requirement Details:**

1. `MemoryEngine.insert()` MUST accept and store `project_id` from the ScopeContext
2. `MemoryToolDispatcher.handleIngest()` MUST extract `projectId` from ScopeContext and pass to engine
3. The `project_id` column added to `knowledge_entries` table (nullable, TEXT type)

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| project_id | TEXT | No (nullable) | Project identifier derived from workspace | `my-app` |

**Acceptance Criteria:**

1. GIVEN user in workspace `/projects/my-app`, WHEN `mem_ingest` is called, THEN the new entry has `project_id = 'my-app'`
2. GIVEN `mem_ingest` with `scope = 'SHARED'`, WHEN entry is created, THEN `project_id` is still stored (for audit) but entry is visible cross-project
3. GIVEN `mem_ingest` without ScopeContext, WHEN entry is created, THEN `project_id = NULL` (backward compatibility)

---

#### STORY 3: Legacy Entry Backward Compatibility

> As a developer, I want entries without project_id to still be accessible so that existing data is not lost.

**Requirement Details:**

1. Schema migration adds `project_id` column with `DEFAULT NULL`
2. Existing entries retain NULL project_id
3. Query logic: entries with `project_id IS NULL` pass the scope filter (treated as "global/legacy")
4. No data migration needed — entries organically acquire project_id on next update or re-ingest

**Acceptance Criteria:**

1. GIVEN existing entries with `project_id = NULL`, WHEN schema migration runs, THEN all existing entries remain accessible
2. GIVEN a search query with project filter, WHEN entry has `project_id = NULL`, THEN entry is included in results (not filtered out)
3. GIVEN system startup after migration, WHEN `mem_search` runs, THEN no errors from NULL project_id values

---

#### STORY 4: SHARED Scope Cross-Project Visibility

> As a system admin, I want SHARED-scope entries to remain cross-project visible so that global knowledge is preserved.

**Requirement Details:**

1. Entries with `scope = 'SHARED'` are ALWAYS visible regardless of `project_id` filter
2. The scope clause logic explicitly exempts SHARED entries from project filtering
3. Promotion from PROJECT → SHARED does not change the `project_id` value (audit trail preserved)

**Acceptance Criteria:**

1. GIVEN entry with `scope = 'SHARED'` and `project_id = 'project-A'`, WHEN user in project-B searches, THEN entry is visible
2. GIVEN entry promoted from PROJECT to SHARED, WHEN entry is queried, THEN `project_id` still shows original project (audit)

---

#### STORY 5: Automatic Project Identifier Derivation

> As a developer, I want the project identifier derived automatically from workspace path so that I don't need manual configuration.

**Requirement Details:**

1. Default derivation: last segment of workspace path (e.g., `/projects/my-app` → `my-app`)
2. Optional override via BackendConfig: `projectId` field in config
3. Project ID passed through ScopeContext to MemoryEngine on every call

**Acceptance Criteria:**

1. GIVEN workspace path `/home/user/projects/my-app`, WHEN system starts, THEN `projectId = 'my-app'`
2. GIVEN BackendConfig with explicit `projectId = 'custom-name'`, WHEN system starts, THEN `projectId = 'custom-name'` (override wins)
3. GIVEN ScopeContext with projectId set, WHEN `mem_search` is called, THEN project filter uses that projectId

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| SQLite schema migration | System | SA4E-26 | Add `project_id` column to `knowledge_entries` |
| BackendConfig extension | System | SA4E-26 | Add `projectId` config field |
| Extension context passing | System | SA4E-26 | IDE extension must pass workspace-derived project ID |
| better-sqlite3 | External | N/A | ORM/driver for SQLite operations |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility |
|------|-------------|----------------|
| Developer | SA4E Dev Team | Implement fix |
| QA | SA4E QA Team | Verify isolation works correctly |
| Users | All agent users | Affected by data leakage bug |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Legacy entries with NULL project_id confuse users | Low | Medium | Document behavior: NULL = accessible everywhere |
| Performance regression from added WHERE clause | Low | Low | project_id indexed; minimal overhead on indexed column |
| Breaking change if any client depends on cross-project visibility | Medium | Low | Graceful: NULL entries remain accessible |

### 5.2 Assumptions

- Each backend instance serves ONE workspace at a time (single-project per running instance)
- Workspace path is available at startup and does not change during session
- `project_id` is a simple string identifier (not UUID or complex ID)
- Existing `admin.db` files will auto-migrate on next startup (DDL uses `IF NOT EXISTS` + `ALTER TABLE ADD COLUMN`)

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Search latency unchanged | Adding indexed column filter should not measurably increase query time (<5ms overhead) |
| Backward Compatibility | Zero downtime migration | ALTER TABLE ADD COLUMN is online operation in SQLite |
| Data Integrity | No data loss | Existing entries retain NULL project_id, remain queryable |
| Security | Project isolation enforced at data layer | No scope leakage between projects even if frontend bypasses |

---

## 7. Related Tickets

| Ticket Key | Summary | Type | Relationship |
|------------|---------|------|--------------|
| SA4E-26 | KB Knowledge Base thiếu Project Isolation | Bug | Main ticket |

---

## 8. Appendix

### 8.1 Root Cause Analysis

**Current `buildScopeClause` logic:**
```typescript
buildScopeClause(ctx: ScopeContext, tableAlias?: string): string {
    const prefix = tableAlias ? `${tableAlias}.` : '';
    return `(${prefix}scope IN ('PROJECT', 'SHARED') OR (${prefix}scope = 'USER' AND ${prefix}user_id = ?))`;
}
```

**Problem:** `scope IN ('PROJECT', 'SHARED')` returns ALL PROJECT entries from ALL projects — no `project_id` discrimination.

**Expected logic:**
```typescript
buildScopeClause(ctx: ScopeContext, tableAlias?: string): string {
    const prefix = tableAlias ? `${tableAlias}.` : '';
    return `(${prefix}scope = 'SHARED' OR (${prefix}scope = 'PROJECT' AND (${prefix}project_id = ? OR ${prefix}project_id IS NULL)) OR (${prefix}scope = 'USER' AND ${prefix}user_id = ?))`;
}
```

### 8.2 Affected Files

| File | Change Required |
|------|----------------|
| `backend/src/modules/memory/schema.ts` | Add `project_id TEXT DEFAULT NULL` to knowledge_entries |
| `backend/src/modules/memory/MemoryEngine.ts` | Update `buildScopeClause`, `buildScopeParams`, `insert()` |
| `backend/src/modules/memory/MemoryToolDispatcher.ts` | Pass `projectId` from ScopeContext to engine on ingest |
| `backend/src/modules/memory/models.ts` | Ensure `ScopeContext.projectId` is required (not optional) |
| `backend/src/config/BackendConfig.ts` | Add `projectId` field derived from workspace path |

### 8.3 Glossary

| Term | Definition |
|------|------------|
| Knowledge Base (KB) | FTS-indexed SQLite storage for structured knowledge entries |
| Scope | Visibility level: USER (personal), PROJECT (team), SHARED (global) |
| ScopeContext | Request-level context containing userId and projectId for access control |
| Project Isolation | Principle that PROJECT-scope data from one workspace must not leak into another |
| FTS5 | SQLite Full-Text Search extension used for knowledge entry indexing |
| Ingestion | Process of storing a new knowledge entry into the KB |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
