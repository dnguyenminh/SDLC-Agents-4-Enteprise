# Software Test Cases (STC)

## SA4E Code Intelligence — SA4E-26: KB Knowledge Base thiếu Project Isolation

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-26 |
| Title | KB Knowledge Base thiếu Project Isolation — Data từ nhiều projects bị trộn lẫn |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-07-09 |
| Status | Draft |
| Related STP | STP-v1-SA4E-26.docx |
| Related FSD | FSD-v1-SA4E-26.docx |
| Related TDD | TDD-v1-SA4E-26.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-09 | QA Agent | Initiate document — 42 test cases across 5 levels |

---

## Test Case Summary

| Level | ID Range | Count | Automation |
|-------|----------|-------|------------|
| Property-Based Testing (PBT) | PBT-01 to PBT-04 | 4 | 100% |
| Unit Testing (UT) | UT-01 to UT-14 | 14 | 100% |
| Integration Testing (IT) | IT-01 to IT-12 | 12 | 100% |
| E2E-API Testing | E2E-API-01 to E2E-API-08 | 8 | 100% |
| System Integration Testing (SIT) | SIT-01 to SIT-04 | 4 | 90% |
| **Total** | | **42** | **~100%** |

---

## 1. Property-Based Testing (PBT)

### PBT-01: Scope clause always includes SHARED visibility

| Field | Value |
|-------|-------|
| **ID** | PBT-01 |
| **Priority** | Critical |
| **Type** | Property-Based |
| **Requirement** | BR-02, UC-01 |
| **Preconditions** | MemoryEngine instantiated |

**Property:** For ANY ScopeContext (arbitrary userId, arbitrary projectId including undefined), the generated scope clause ALWAYS contains `scope = 'SHARED'`.

**Generator:**
```typescript
fc.record({
  userId: fc.string({ minLength: 1, maxLength: 50 }),
  projectId: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined })
})
```

**Invariant:** `buildScopeClause(ctx).includes("scope = 'SHARED'")`

**Samples:** 100

---

### PBT-02: Scope clause with projectId always filters PROJECT by project_id

| Field | Value |
|-------|-------|
| **ID** | PBT-02 |
| **Priority** | Critical |
| **Type** | Property-Based |
| **Requirement** | BR-01 |
| **Preconditions** | MemoryEngine instantiated |

**Property:** For ANY ScopeContext where projectId is non-empty, the clause contains `project_id = ?` (parameterized filter).

**Generator:**
```typescript
fc.record({
  userId: fc.string({ minLength: 1, maxLength: 50 }),
  projectId: fc.string({ minLength: 1, maxLength: 100 })
})
```

**Invariant:** `buildScopeClause(ctx).includes("project_id = ?")`

**Samples:** 100

---

### PBT-03: Scope params count matches SQL placeholders

| Field | Value |
|-------|-------|
| **ID** | PBT-03 |
| **Priority** | Critical |
| **Type** | Property-Based |
| **Requirement** | UC-01 (correctness) |
| **Preconditions** | MemoryEngine instantiated |

**Property:** For ANY ScopeContext, the number of params returned by `buildScopeParams()` equals the number of `?` placeholders in `buildScopeClause()`.

**Generator:**
```typescript
fc.record({
  userId: fc.string({ minLength: 1, maxLength: 50 }),
  projectId: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined })
})
```

**Invariant:** `buildScopeParams(ctx).length === (buildScopeClause(ctx).match(/\?/g) || []).length`

**Samples:** 100

---

### PBT-04: Insert always stores project_id from context

| Field | Value |
|-------|-------|
| **ID** | PBT-04 |
| **Priority** | Critical |
| **Type** | Property-Based |
| **Requirement** | BR-06, BR-08 |
| **Preconditions** | In-memory SQLite DB with schema applied |

**Property:** For ANY entry with arbitrary project_id (string or null), after insert(), SELECT returns the exact same project_id value.

**Generator:**
```typescript
fc.record({
  content: fc.string({ minLength: 1, maxLength: 500 }),
  project_id: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null })
})
```

**Invariant:** `db.get("SELECT project_id FROM knowledge_entries WHERE id = ?", id).project_id === entry.project_id`

**Samples:** 100

---

## 2. Unit Testing (UT)

### UT-01: buildScopeClause with projectId returns project filter clause

| Field | Value |
|-------|-------|
| **ID** | UT-01 |
| **Priority** | Critical |
| **Type** | Unit |
| **Requirement** | BR-01, UC-01 |
| **Preconditions** | MemoryEngine instance |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `buildScopeClause({ userId: 'user-1', projectId: 'app-A' })` | Returns string containing `scope = 'SHARED'` |
| 2 | Check result | Contains `scope = 'PROJECT' AND (project_id = ? OR project_id IS NULL)` |
| 3 | Check result | Contains `scope = 'USER' AND user_id = ?` |

**Test Data:** `{ userId: 'user-1', projectId: 'app-A' }`

---

### UT-02: buildScopeClause without projectId returns backward-compat clause

| Field | Value |
|-------|-------|
| **ID** | UT-02 |
| **Priority** | Critical |
| **Type** | Unit |
| **Requirement** | BR-05 |
| **Preconditions** | MemoryEngine instance |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `buildScopeClause({ userId: 'user-1' })` | Returns string containing `scope IN ('PROJECT', 'SHARED')` |
| 2 | Check result | Does NOT contain `project_id = ?` |

**Test Data:** `{ userId: 'user-1' }` (no projectId)

---

### UT-03: buildScopeClause with tableAlias prefixes columns

| Field | Value |
|-------|-------|
| **ID** | UT-03 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-01 |
| **Preconditions** | MemoryEngine instance |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `buildScopeClause({ userId: 'u1', projectId: 'p1' }, 'ke')` | All column refs prefixed: `ke.scope`, `ke.project_id`, `ke.user_id` |

**Test Data:** `{ userId: 'u1', projectId: 'p1' }`, alias = `'ke'`

---

### UT-04: buildScopeClause with empty string projectId uses backward-compat

| Field | Value |
|-------|-------|
| **ID** | UT-04 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | BR-05 |
| **Preconditions** | MemoryEngine instance |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `buildScopeClause({ userId: 'user-1', projectId: '' })` | Returns backward-compat clause (empty string is falsy) |
| 2 | Check result | Does NOT contain `project_id = ?` |

**Test Data:** `{ userId: 'user-1', projectId: '' }`

---

### UT-05: buildScopeParams with projectId returns [projectId, userId]

| Field | Value |
|-------|-------|
| **ID** | UT-05 |
| **Priority** | Critical |
| **Type** | Unit |
| **Requirement** | UC-01 |
| **Preconditions** | MemoryEngine instance |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `buildScopeParams({ userId: 'user-1', projectId: 'app-A' })` | Returns `['app-A', 'user-1']` |

**Test Data:** `{ userId: 'user-1', projectId: 'app-A' }`

---

### UT-06: buildScopeParams without projectId returns [userId]

| Field | Value |
|-------|-------|
| **ID** | UT-06 |
| **Priority** | Critical |
| **Type** | Unit |
| **Requirement** | BR-05 |
| **Preconditions** | MemoryEngine instance |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `buildScopeParams({ userId: 'user-1' })` | Returns `['user-1']` |

**Test Data:** `{ userId: 'user-1' }`

---

### UT-07: insert with project_id stores value in DB

| Field | Value |
|-------|-------|
| **ID** | UT-07 |
| **Priority** | Critical |
| **Type** | Unit |
| **Requirement** | BR-06 |
| **Preconditions** | MemoryEngine with in-memory SQLite, schema applied |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `insert({ content: 'test', summary: 'test', type: 'CONTEXT', project_id: 'app-A' })` | Returns entry ID > 0 |
| 2 | SELECT from DB where id = returned ID | `project_id = 'app-A'` |

**Test Data:** `{ content: 'test content', summary: 'test', type: 'CONTEXT', project_id: 'app-A' }`

---

### UT-08: insert without project_id stores NULL

| Field | Value |
|-------|-------|
| **ID** | UT-08 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | BR-08 |
| **Preconditions** | MemoryEngine with in-memory SQLite, schema applied |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `insert({ content: 'test', summary: 'test', type: 'CONTEXT' })` | Returns entry ID > 0 |
| 2 | SELECT from DB where id = returned ID | `project_id IS NULL` |

**Test Data:** `{ content: 'test content', summary: 'test', type: 'CONTEXT' }` (no project_id)

---

### UT-09: deriveProjectId from Unix path

| Field | Value |
|-------|-------|
| **ID** | UT-09 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | BR-09 |
| **Preconditions** | BackendConfig module available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `deriveProjectId('/projects/my-app')` | Returns `'my-app'` |

**Test Data:** `/projects/my-app`

---

### UT-10: deriveProjectId from Windows path

| Field | Value |
|-------|-------|
| **ID** | UT-10 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | BR-09 |
| **Preconditions** | BackendConfig module available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `deriveProjectId('C:\\projects\\my-app')` | Returns `'my-app'` |

**Test Data:** `C:\projects\my-app`

---

### UT-11: deriveProjectId from root path returns default

| Field | Value |
|-------|-------|
| **ID** | UT-11 |
| **Priority** | Medium |
| **Type** | Unit |
| **Requirement** | BR-09 (edge case) |
| **Preconditions** | BackendConfig module available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `deriveProjectId('/')` | Returns `'default'` |

**Test Data:** `/`

---

### UT-12: deriveProjectId from empty string returns default

| Field | Value |
|-------|-------|
| **ID** | UT-12 |
| **Priority** | Medium |
| **Type** | Unit |
| **Requirement** | BR-09 (edge case) |
| **Preconditions** | BackendConfig module available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `deriveProjectId('')` | Returns `'default'` |

**Test Data:** `''`

---

### UT-13: deriveProjectId with config override

| Field | Value |
|-------|-------|
| **ID** | UT-13 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | BR-10 |
| **Preconditions** | BackendConfig with override |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `deriveProjectId('/projects/my-app', { projectId: 'custom-name' })` | Returns `'custom-name'` (override wins) |

**Test Data:** workspace = `/projects/my-app`, override = `'custom-name'`

---

### UT-14: deriveProjectId with environment variable

| Field | Value |
|-------|-------|
| **ID** | UT-14 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | BR-10 |
| **Preconditions** | `process.env.CODE_INTEL_PROJECT_ID` set |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set env `CODE_INTEL_PROJECT_ID=env-project` | — |
| 2 | Call `deriveProjectId('/projects/my-app')` | Returns `'env-project'` (env wins over path) |
| 3 | Cleanup: unset env variable | — |

**Test Data:** env = `CODE_INTEL_PROJECT_ID=env-project`, workspace = `/projects/my-app`

---

## 3. Integration Testing (IT)

### IT-01: Search with projectId filters PROJECT entries

| Field | Value |
|-------|-------|
| **ID** | IT-01 |
| **Priority** | Critical |
| **Type** | Integration |
| **Requirement** | BR-01, UC-01 |
| **Preconditions** | SQLite DB with seed data: entries from app-A, app-B, SHARED, NULL |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Insert seed entries: PROJECT/app-A, PROJECT/app-B, SHARED, PROJECT/NULL | All entries in DB |
| 2 | Call `engine.search('pattern', 20, null, null, { userId: 'u1', projectId: 'app-A' })` | Results include app-A PROJECT entries |
| 3 | Verify results | Do NOT include app-B PROJECT entries |
| 4 | Verify results | DO include SHARED entries |
| 5 | Verify results | DO include NULL project_id entries |

**Test Data:** See seed data in STP §6.1

---

### IT-02: Search without projectId shows all PROJECT entries (backward compat)

| Field | Value |
|-------|-------|
| **ID** | IT-02 |
| **Priority** | Critical |
| **Type** | Integration |
| **Requirement** | BR-05, UC-04 |
| **Preconditions** | SQLite DB with seed data from multiple projects |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `engine.search('pattern', 20, null, null, { userId: 'u1' })` (no projectId) | Results include ALL PROJECT entries (app-A AND app-B) |
| 2 | Verify results | Include SHARED entries |
| 3 | Verify results | Include NULL project_id entries |

**Test Data:** Seed entries with project_id = 'app-A', 'app-B', NULL

---

### IT-03: SHARED entries visible regardless of projectId

| Field | Value |
|-------|-------|
| **ID** | IT-03 |
| **Priority** | Critical |
| **Type** | Integration |
| **Requirement** | BR-02, UC-01 AF-02 |
| **Preconditions** | SQLite DB with SHARED entry from app-A |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Insert SHARED entry with project_id='app-A' | Entry stored |
| 2 | Search with projectId='app-B' | SHARED entry IS in results (cross-project visible) |
| 3 | Search with projectId='app-A' | SHARED entry IS in results |
| 4 | Search without projectId | SHARED entry IS in results |

**Test Data:** SHARED entry: `{ content: 'shared knowledge', scope: 'SHARED', project_id: 'app-A' }`

---

### IT-04: Legacy entries (NULL project_id) visible to all projects

| Field | Value |
|-------|-------|
| **ID** | IT-04 |
| **Priority** | Critical |
| **Type** | Integration |
| **Requirement** | BR-03, BR-13, UC-04 |
| **Preconditions** | SQLite DB with legacy entry (project_id = NULL, scope = PROJECT) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Insert PROJECT entry with project_id = NULL | Entry stored |
| 2 | Search with projectId='app-A' | Legacy entry IS in results |
| 3 | Search with projectId='app-B' | Legacy entry IS in results |
| 4 | Search with projectId='any-project' | Legacy entry IS in results |

**Test Data:** `{ content: 'legacy data', scope: 'PROJECT', project_id: null }`

---

### IT-05: USER entries filtered by user_id only (unchanged behavior)

| Field | Value |
|-------|-------|
| **ID** | IT-05 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | BR-04 |
| **Preconditions** | DB with USER entries from user-1 and user-2 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Search as user-1 with projectId='app-A' | Only user-1 USER entries visible |
| 2 | Verify | user-2 USER entries NOT in results |

**Test Data:** user-1 entry + user-2 entry, both scope=USER

---

### IT-06: Cross-project isolation — project-A entries invisible from project-B

| Field | Value |
|-------|-------|
| **ID** | IT-06 |
| **Priority** | Critical |
| **Type** | Integration |
| **Requirement** | BR-01 (negative test) |
| **Preconditions** | DB with PROJECT entries from app-A |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Insert PROJECT entry with project_id='app-A', content='secret-A' | Entry stored |
| 2 | Search with projectId='app-B', query='secret' | Result is EMPTY (no app-A entries) |
| 3 | Search with projectId='app-A', query='secret' | Result contains the entry |

**Test Data:** `{ content: 'secret-A pattern', scope: 'PROJECT', project_id: 'app-A' }`

---

### IT-07: Ingest stores project_id from ScopeContext

| Field | Value |
|-------|-------|
| **ID** | IT-07 |
| **Priority** | Critical |
| **Type** | Integration |
| **Requirement** | BR-06, UC-02 |
| **Preconditions** | MemoryEngine with real SQLite |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `engine.insert({ content: 'new entry', summary: 'new', type: 'CONTEXT', scope: 'PROJECT', project_id: 'app-A' })` | Returns ID |
| 2 | SELECT from knowledge_entries WHERE id = ID | `project_id = 'app-A'` |

**Test Data:** `{ content: 'new entry', scope: 'PROJECT', project_id: 'app-A' }`

---

### IT-08: Ingest without projectId stores NULL

| Field | Value |
|-------|-------|
| **ID** | IT-08 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | BR-08, UC-02 AF-01 |
| **Preconditions** | MemoryEngine with real SQLite |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `engine.insert({ content: 'legacy entry', summary: 'legacy', type: 'CONTEXT', scope: 'PROJECT' })` | Returns ID |
| 2 | SELECT from knowledge_entries WHERE id = ID | `project_id IS NULL` |

**Test Data:** `{ content: 'legacy entry', scope: 'PROJECT' }` (no project_id)

---

### IT-09: Schema migration creates project_id column

| Field | Value |
|-------|-------|
| **ID** | IT-09 |
| **Priority** | Critical |
| **Type** | Integration |
| **Requirement** | BR-12 |
| **Preconditions** | Fresh SQLite DB WITHOUT project_id column |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create knowledge_entries table WITHOUT project_id | Table exists, no project_id |
| 2 | Run schema migration (ALTER TABLE ADD COLUMN) | No error |
| 3 | PRAGMA table_info(knowledge_entries) | project_id column exists, type=TEXT, default=NULL |

---

### IT-10: Schema migration is idempotent (no error on re-run)

| Field | Value |
|-------|-------|
| **ID** | IT-10 |
| **Priority** | Critical |
| **Type** | Integration |
| **Requirement** | BR-12 |
| **Preconditions** | DB with project_id column already present |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run migration first time | Success |
| 2 | Run migration second time | No error (duplicate column caught) |
| 3 | Verify DB state unchanged | project_id column still present, data intact |

---

### IT-11: Index creation succeeds

| Field | Value |
|-------|-------|
| **ID** | IT-11 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | TDD §4.1 |
| **Preconditions** | DB with project_id column |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run CREATE INDEX IF NOT EXISTS idx_ke_project_id | No error |
| 2 | Run CREATE INDEX IF NOT EXISTS idx_ke_scope_project | No error |
| 3 | Query sqlite_master for indexes | Both indexes exist |

---

### IT-12: Mixed scope query returns correct entries

| Field | Value |
|-------|-------|
| **ID** | IT-12 |
| **Priority** | Critical |
| **Type** | Integration |
| **Requirement** | BR-01, BR-02, BR-03, BR-04, BR-13 |
| **Preconditions** | DB with all entry types: SHARED, PROJECT/app-A, PROJECT/app-B, PROJECT/NULL, USER/u1, USER/u2 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Insert 7 seed entries (see STP §6.1) | All stored |
| 2 | Search as user-1 from project app-A | Returns: seed-1 (PROJECT/app-A), seed-3 (SHARED), seed-4 (PROJECT/NULL), seed-5 (USER/u1), seed-7 (PROJECT/app-A) |
| 3 | Verify NOT returned | seed-2 (PROJECT/app-B), seed-6 (USER/u2) |

**Test Data:** Full seed data set from STP §6.1

---

## 4. E2E-API Testing

### E2E-API-01: mem_search with projectId returns only current project entries

| Field | Value |
|-------|-------|
| **ID** | E2E-API-01 |
| **Priority** | Critical |
| **Type** | E2E-API |
| **Requirement** | BR-01, UC-01 |
| **Preconditions** | Backend running, ScopeContext set with projectId='app-A', seed data ingested |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set ScopeContext: `{ userId: 'u1', projectId: 'app-A' }` | Context set |
| 2 | Call MCP tool: `mem_search({ query: 'pattern' })` | Response contains app-A entries |
| 3 | Verify response | Does NOT contain app-B entries |
| 4 | Verify response | Contains SHARED entries |
| 5 | Verify response | Contains legacy (NULL) entries |

---

### E2E-API-02: mem_search without projectId shows all (backward compat)

| Field | Value |
|-------|-------|
| **ID** | E2E-API-02 |
| **Priority** | Critical |
| **Type** | E2E-API |
| **Requirement** | BR-05, UC-01 AF-01 |
| **Preconditions** | Backend running, ScopeContext without projectId |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set ScopeContext: `{ userId: 'u1' }` (no projectId) | Context set |
| 2 | Call MCP tool: `mem_search({ query: 'pattern' })` | Response contains ALL PROJECT entries (app-A + app-B + NULL) |

---

### E2E-API-03: SHARED entry from another project is visible

| Field | Value |
|-------|-------|
| **ID** | E2E-API-03 |
| **Priority** | Critical |
| **Type** | E2E-API |
| **Requirement** | BR-02, UC-01 AF-02 |
| **Preconditions** | Backend running, SHARED entry exists from project app-A |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set ScopeContext: `{ userId: 'u1', projectId: 'app-B' }` | Searching from B |
| 2 | Call MCP tool: `mem_search({ query: 'shared knowledge' })` | SHARED entry from app-A IS in response |

---

### E2E-API-04: mem_ingest with projectId tags entry correctly

| Field | Value |
|-------|-------|
| **ID** | E2E-API-04 |
| **Priority** | Critical |
| **Type** | E2E-API |
| **Requirement** | BR-06, UC-02 |
| **Preconditions** | Backend running, ScopeContext with projectId='app-A' |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set ScopeContext: `{ userId: 'u1', projectId: 'app-A' }` | Context set |
| 2 | Call: `mem_ingest({ content: 'new knowledge', type: 'CONTEXT', scope: 'PROJECT' })` | Returns success with entry ID |
| 3 | Query DB: SELECT project_id WHERE id = returned ID | `project_id = 'app-A'` |

---

### E2E-API-05: mem_ingest without projectId stores NULL

| Field | Value |
|-------|-------|
| **ID** | E2E-API-05 |
| **Priority** | High |
| **Type** | E2E-API |
| **Requirement** | BR-08, UC-02 AF-01 |
| **Preconditions** | Backend running, ScopeContext without projectId |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set ScopeContext: `{ userId: 'u1' }` (no projectId) | Context set |
| 2 | Call: `mem_ingest({ content: 'legacy ingest', type: 'CONTEXT', scope: 'PROJECT' })` | Returns success |
| 3 | Query DB: SELECT project_id WHERE id = returned ID | `project_id IS NULL` |

---

### E2E-API-06: SHARED ingest stores project_id for audit but remains cross-project

| Field | Value |
|-------|-------|
| **ID** | E2E-API-06 |
| **Priority** | High |
| **Type** | E2E-API |
| **Requirement** | BR-07, UC-02 AF-02 |
| **Preconditions** | Backend running, ScopeContext with projectId='app-A' |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set ScopeContext: `{ userId: 'u1', projectId: 'app-A' }` | Context set |
| 2 | Call: `mem_ingest({ content: 'shared info', type: 'CONTEXT', scope: 'SHARED' })` | Returns success |
| 3 | Query DB: SELECT project_id, scope WHERE id = returned ID | `project_id = 'app-A'`, `scope = 'SHARED'` |
| 4 | Search from project 'app-B' | Entry IS visible (SHARED overrides project filter) |

---

### E2E-API-07: mem_search with empty query returns error

| Field | Value |
|-------|-------|
| **ID** | E2E-API-07 |
| **Priority** | Medium |
| **Type** | E2E-API |
| **Requirement** | UC-01 EF-01 |
| **Preconditions** | Backend running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call: `mem_search({ query: '' })` | Returns error: "query required" or empty result |

---

### E2E-API-08: mem_list with projectId filter

| Field | Value |
|-------|-------|
| **ID** | E2E-API-08 |
| **Priority** | High |
| **Type** | E2E-API |
| **Requirement** | BR-01, BR-03 |
| **Preconditions** | Backend running, seed data, ScopeContext with projectId |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set ScopeContext: `{ userId: 'u1', projectId: 'app-A' }` | Context set |
| 2 | Call: `mem_list({})` (list all entries) | Returns only app-A + SHARED + NULL entries |
| 3 | Verify | No app-B entries in result |

---

## 5. System Integration Testing (SIT)

### SIT-01: Two backend instances with different workspace paths

| Field | Value |
|-------|-------|
| **ID** | SIT-01 |
| **Priority** | High |
| **Type** | System Integration |
| **Requirement** | BR-01, BR-09, BR-11 |
| **Preconditions** | Same SQLite DB file, two backend instances |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start backend instance A with workspace='/projects/app-A' | projectId='app-A' derived |
| 2 | Start backend instance B with workspace='/projects/app-B' | projectId='app-B' derived |
| 3 | Ingest entry from instance A: scope=PROJECT | Entry has project_id='app-A' |
| 4 | Search from instance B | Does NOT see instance A's PROJECT entry |
| 5 | Search from instance A | DOES see its own entry |

**Automation:** Process spawn with different config

---

### SIT-02: Backend restart with existing DB preserves data

| Field | Value |
|-------|-------|
| **ID** | SIT-02 |
| **Priority** | High |
| **Type** | System Integration |
| **Requirement** | BR-12, BR-14 |
| **Preconditions** | Existing DB with entries (some with project_id, some NULL) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create DB with pre-migration entries (no project_id column) | Legacy DB state |
| 2 | Start backend (triggers migration) | Migration succeeds, column added |
| 3 | Verify existing entries | All have project_id = NULL, content intact |
| 4 | Stop and restart backend | Second startup succeeds (idempotent migration) |
| 5 | Verify entries unchanged | Same data, no corruption |

**Automation:** Automated with file-based SQLite

---

### SIT-03: Project ID override via config takes precedence

| Field | Value |
|-------|-------|
| **ID** | SIT-03 |
| **Priority** | High |
| **Type** | System Integration |
| **Requirement** | BR-10 |
| **Preconditions** | Backend with workspace path AND explicit config override |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start backend: workspace='/projects/my-app', config.projectId='custom-override' | — |
| 2 | Ingest entry scope=PROJECT | Entry stored with project_id='custom-override' (NOT 'my-app') |
| 3 | Search with projectId='custom-override' | Entry found |
| 4 | Search with projectId='my-app' | Entry NOT found |

**Automation:** Config file manipulation + assertions

---

### SIT-04: Performance benchmark — search with project filter on 10k entries

| Field | Value |
|-------|-------|
| **ID** | SIT-04 |
| **Priority** | Medium |
| **Type** | System Integration (Performance) |
| **Requirement** | FSD §8 NFR: < 5ms additional overhead |
| **Preconditions** | DB with 10,000 entries across 10 projects |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate 10k entries: 1k per project (10 projects) | All inserted |
| 2 | Baseline: search WITHOUT project filter, measure time | T_baseline |
| 3 | Test: search WITH project filter (projectId='proj-5'), measure time | T_filtered |
| 4 | Calculate overhead: T_filtered - T_baseline | < 5ms |
| 5 | Run 100 iterations, calculate p95 | p95 overhead < 5ms |

**Automation:** 90% automated (threshold review manual)

---

## 6. Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| BR-01 | FSD §3.1.3 | PBT-02, UT-01, IT-01, IT-06, IT-12, E2E-API-01, E2E-API-08, SIT-01 | ✅ Covered |
| BR-02 | FSD §3.1.3 | PBT-01, IT-03, E2E-API-03 | ✅ Covered |
| BR-03 | FSD §3.4.3 | IT-04, IT-12, E2E-API-01 | ✅ Covered |
| BR-04 | FSD §3.1.3 | IT-05, IT-12 | ✅ Covered |
| BR-05 | FSD §3.1.3 | UT-02, UT-04, IT-02, E2E-API-02 | ✅ Covered |
| BR-06 | FSD §3.2.3 | PBT-04, UT-07, IT-07, E2E-API-04 | ✅ Covered |
| BR-07 | FSD §3.2.3 | E2E-API-06 | ✅ Covered |
| BR-08 | FSD §3.2.3 | UT-08, IT-08, E2E-API-05 | ✅ Covered |
| BR-09 | FSD §3.3.3 | UT-09, UT-10, UT-11, UT-12, SIT-01 | ✅ Covered |
| BR-10 | FSD §3.3.3 | UT-13, UT-14, SIT-03 | ✅ Covered |
| BR-11 | FSD §3.3.3 | E2E-API-01, E2E-API-04, SIT-01 | ✅ Covered |
| BR-12 | FSD §3.4.3 | IT-09, IT-10, SIT-02 | ✅ Covered |
| BR-13 | FSD §3.4.3 | IT-04, IT-12 | ✅ Covered |
| BR-14 | FSD §3.4.3 | IT-04, SIT-02 | ✅ Covered |
| UC-01 | FSD §3.1.2 | PBT-01-03, UT-01-06, IT-01-06, IT-12, E2E-API-01-03 | ✅ Covered |
| UC-02 | FSD §3.2.2 | PBT-04, UT-07-08, IT-07-08, E2E-API-04-06 | ✅ Covered |
| UC-03 | FSD §3.3.2 | UT-09-14, SIT-01, SIT-03 | ✅ Covered |
| UC-04 | FSD §3.4.2 | IT-04, IT-12, E2E-API-02, SIT-02 | ✅ Covered |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Business Rules | 14 | 14 | 100% |
| Use Cases | 4 | 4 | 100% |
| Alternative Flows | 5 | 5 | 100% |
| Exception Flows | 2 | 2 | 100% |
| **Overall** | **25** | **25** | **100%** |

---

## 7. Test Data Files

| File | Content | Records |
|------|---------|---------|
| testdata/seed-entries.csv | 7 seed entries for IT/E2E tests | 7 |
| testdata/scope-context-variations.csv | ScopeContext permutations | 8 |
| testdata/projectid-derivation.csv | Path to projectId mapping | 6 |

---

## 8. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Test Coverage Overview | [test-coverage.png](diagrams/test-coverage.png) | [test-coverage.drawio](diagrams/test-coverage.drawio) |
| 2 | Test Execution Flow | [test-execution-flow.png](diagrams/test-execution-flow.png) | [test-execution-flow.drawio](diagrams/test-execution-flow.drawio) |
