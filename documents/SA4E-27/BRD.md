# Business Requirements Document (BRD)

## SA4E Code Intelligence — SA4E-27: Redesign Multi-Tenant Project Isolation cho KB

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-27 |
| Title | Redesign Multi-Tenant Project Isolation cho KB |
| Type | Story (Redesign) |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-07-10 |
| Status | Draft |
| Related Documents | BRD-v1-SA4E-27.docx |
| Supersedes | SA4E-26 (failed patch approach) |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | BA Agent - Business Analyst | Create document |
| Peer Reviewer | SA Agent - Solution Architect | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-10 | BA Agent | Initiate document - redesign from scratch based on SA4E-26 lessons learned |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |

---

## 1. Introduction

### 1.1 Scope

**Full redesign** of multi-tenant project isolation for the Knowledge Base (KB) memory system in SA4E Code Intelligence backend. SA4E-26 attempted an incremental patch approach (add column, modify WHERE clause, pass projectId) which **failed** because scattered changes across many files without holistic design led to incomplete context threading, fragile migrations, and untestable isolation logic.

SA4E-27 takes a fundamentally different approach: design the isolation layer as a **cohesive module** from the ground up, ensuring:

1. **Single source of truth** for all scope filtering logic (centralized, not scattered)
2. **End-to-end context threading** from extension startup through every KB operation
3. **Proper versioned schema migration** (not try/catch ALTER TABLE)
4. **Full backward compatibility** with existing NULL project_id entries
5. **Comprehensive testability** with clear isolation boundaries

**What this achieves:** When a user opens workspace A, all KB operations (search, ingest, list, update, delete) correctly scope PROJECT-level entries to workspace A only, while SHARED entries remain cross-project and USER entries remain personal.

### 1.2 Out of Scope

- FTS5 virtual table internal structure (project_id filter is applied at JOIN level, not within FTS5)
- Vector search / ONNX embedding logic
- Graph edges or graph service
- UI/frontend changes
- Cross-machine synchronization (each machine has its own SQLite DB)
- Multi-user concurrent access (SQLite is single-writer)
- Data migration of existing entries (legacy entries stay NULL, accessible everywhere)

### 1.3 Preliminary Requirements

| # | Prerequisite | Description |
|---|-------------|-------------|
| 1 | SA4E-26 code reverted or unused | The failed patch approach must not interfere with the redesign |
| 2 | SQLite schema migration framework | A proper versioned migration system must be designed (not ad-hoc try/catch) |
| 3 | Workspace path available at startup | Extension context must provide workspace root path |
| 4 | Existing tests pass | All current tests green before redesign begins |

---

## 2. Business Requirements

### 2.1 High Level Process Map

The redesigned isolation layer operates as a cohesive middleware that intercepts all KB operations and enforces project boundaries:

![Business Flow](diagrams/business-flow.png)

![Use Case Diagram](diagrams/use-case.png)

**High-level flow:**

1. IDE Extension activates - derives projectId from workspace path
2. ProjectContext is created once and injected into the IsolationLayer module
3. Every KB operation passes through the IsolationLayer which:
   - On **write** (ingest): stamps entries with project_id
   - On **read** (search/list): adds scope-aware project filter to queries
   - On **update/delete**: validates ownership before allowing mutation
4. The IsolationLayer centralizes ALL scope logic in one place

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case | Priority | Source |
|---|-----------------|----------|--------|
| 1 | As a developer, I want a centralized isolation layer that handles ALL project scoping in one module so that scope logic is not scattered across files | MUST HAVE | SA4E-27 |
| 2 | As a developer, I want project context threaded E2E from extension startup through every KB operation so that no code path can bypass isolation | MUST HAVE | SA4E-27 |
| 3 | As a developer, I want a versioned schema migration system so that DB changes are tracked, repeatable, and not fragile try/catch hacks | MUST HAVE | SA4E-27 |
| 4 | As a developer, I want PROJECT-scope entries filtered by project_id so that I only see my project data | MUST HAVE | SA4E-27 |
| 5 | As a developer, I want SHARED-scope entries to remain cross-project so that global knowledge is always accessible | MUST HAVE | SA4E-27 |
| 6 | As a developer, I want legacy entries (NULL project_id) to remain accessible everywhere so that existing data is not lost | MUST HAVE | SA4E-27 |
| 7 | As a developer, I want USER-scope entries filtered by user_id only (unchanged) so that personal entries remain personal regardless of project | MUST HAVE | SA4E-27 |
| 8 | As a developer, I want comprehensive test coverage for all isolation scenarios so that regressions are caught immediately | MUST HAVE | SA4E-27 |

---
### 2.3 Details of User Stories

---

#### Business Flow

**Step 1:** IDE Extension activates when user opens a workspace (e.g., /projects/my-app)

**Step 2:** Extension derives projectId from workspace path (last segment: my-app) or reads explicit override from settings

**Step 3:** Extension establishes MCP connection to backend, passing projectId as session-level context

**Step 4:** Backend creates a ProjectContext object holding { projectId, userId } and injects it into the IsolationLayer singleton for this session

**Step 5:** All KB tool calls (mem_search, mem_ingest, mem_list, mem_update, mem_delete) route through IsolationLayer which:
- Decorates write operations with project_id
- Decorates read operations with project-aware WHERE clauses
- Validates mutation operations against ownership

**Step 6:** IsolationLayer constructs the scope clause centrally:
- SHARED: always visible (no project filter)
- PROJECT: visible only if project_id = current OR project_id IS NULL (legacy)
- USER: visible only if user_id = current (unchanged)

**Step 7:** Results returned to user contain only entries matching the isolation rules

> **Note:** The key difference from SA4E-26 is that Steps 4-6 happen in ONE module (IsolationLayer), not scattered across MemoryEngine, MemoryToolDispatcher, BackendConfig, and schema.ts separately.

---

#### STORY 1: Centralized Isolation Layer Module

> As a developer, I want a centralized isolation layer that handles ALL project scoping in one module so that scope logic is not scattered across files.

**Requirement Details:**

1. A new IsolationLayer module must be created as the SINGLE place where all scope/project filtering logic lives
2. This module encapsulates: scope clause construction, scope parameter binding, project_id stamping on write, and ownership validation on mutation
3. No other file in the codebase should contain scope filtering logic - MemoryEngine delegates to IsolationLayer
4. The module must be stateless per-call (receives ProjectContext as parameter) but holds no mutable state itself
5. The module must expose a clean interface that MemoryEngine calls for every operation type (read, write, update, delete)

**Acceptance Criteria:**

1. GIVEN the codebase, WHEN searching for scope filtering logic (WHERE clauses involving scope/project_id), THEN it exists in exactly ONE file/module (IsolationLayer)
2. GIVEN MemoryEngine, WHEN it needs to filter by project, THEN it calls IsolationLayer methods - it does NOT construct WHERE clauses itself
3. GIVEN a new developer reading the code, WHEN they need to understand isolation rules, THEN they only need to read ONE file
4. GIVEN IsolationLayer, WHEN its interface is examined, THEN it exposes methods for: buildReadFilter(), buildWriteDecorator(), validateMutationOwnership()

---

#### STORY 2: End-to-End Context Threading

> As a developer, I want project context threaded E2E from extension startup through every KB operation so that no code path can bypass isolation.

**Requirement Details:**

1. ProjectContext (containing projectId + userId) must be established ONCE at session/connection init
2. The context must be available to EVERY KB operation without requiring callers to manually pass it each time
3. No KB operation should be executable without a valid ProjectContext (fail-safe: if context missing, reject the operation or fall back to permissive mode with warning)
4. The threading must be explicit and traceable - not hidden in global state or singletons that could be stale

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| projectId | string | Yes (after init) | Derived from workspace path or config override | my-app |
| userId | string | Yes | User identifier from extension auth | user-123 |
| sessionId | string | Optional | Unique session identifier for audit | sess-abc |

**Acceptance Criteria:**

1. GIVEN extension startup with workspace /projects/my-app, WHEN MCP connection is established, THEN backend receives and stores projectId = 'my-app' for the session
2. GIVEN an active session, WHEN ANY KB tool is called (search, ingest, list, update, delete), THEN ProjectContext is available without the caller passing it explicitly
3. GIVEN a KB operation WITHOUT valid ProjectContext, WHEN the operation executes, THEN the system either rejects with clear error OR falls back to permissive mode (all PROJECT entries visible) with a logged warning
4. GIVEN multiple workspaces opened simultaneously (separate backend instances), WHEN each performs KB operations, THEN each uses its own ProjectContext independently

---

#### STORY 3: Versioned Schema Migration

> As a developer, I want a versioned schema migration system so that DB changes are tracked, repeatable, and not fragile try/catch hacks.

**Requirement Details:**

1. A migration tracking table (schema_migrations) must record which migrations have been applied
2. Each migration has a version number, timestamp, and description
3. Migrations run in order on startup - only unapplied migrations execute
4. The project_id column addition is migration version 1 (or next available)
5. Migrations are idempotent - running them again on an already-migrated DB is a no-op (not an error)
6. Migration failures are reported clearly with the specific migration that failed

**Data Fields (schema_migrations table):**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| version | INTEGER | Yes | Sequential migration number | 1 |
| name | TEXT | Yes | Human-readable migration description | add_project_id_column |
| applied_at | TEXT | Yes | ISO timestamp when migration was applied | 2026-07-10T15:00:00Z |
| checksum | TEXT | Optional | Hash of migration SQL for drift detection | sha256:abc... |

**Acceptance Criteria:**

1. GIVEN a fresh database, WHEN backend starts, THEN all migrations run in order and schema_migrations records each one
2. GIVEN a database with migration v1 already applied, WHEN backend starts, THEN migration v1 is SKIPPED (no error, no duplicate)
3. GIVEN a migration that fails (e.g., invalid SQL), WHEN backend starts, THEN the error message includes: which migration failed, the SQL that failed, and the error from SQLite
4. GIVEN the old SA4E-26 approach (try/catch ALTER TABLE), WHEN comparing with new approach, THEN the new approach does NOT use try/catch for migration logic - it uses version tracking
5. GIVEN schema_migrations table, WHEN queried, THEN it shows a clear history of all applied migrations with timestamps

**Validation Rules:**

- Migration versions must be sequential (no gaps)
- Migration SQL must be deterministic (same result every time)
- Migrations must NOT be modified after being applied to any database (append-only)

---

#### STORY 4: PROJECT Scope Isolation

> As a developer, I want PROJECT-scope entries filtered by project_id so that I only see my project data.

**Requirement Details:**

1. When scope = PROJECT and the entry has a project_id matching the current session projectId, the entry IS visible
2. When scope = PROJECT and the entry has a project_id NOT matching, the entry is NOT visible
3. When scope = PROJECT and the entry has project_id = NULL (legacy), the entry IS visible (backward compat)
4. The filter applies to: search (FTS + semantic), list, and get-by-id operations

**Acceptance Criteria:**

1. GIVEN entries from project-A and project-B in DB, WHEN user in project-A runs mem_search, THEN results contain ONLY project-A entries (and NULL/SHARED entries)
2. GIVEN entries from project-A, WHEN user in project-B runs mem_search, THEN results do NOT contain project-A PROJECT-scope entries
3. GIVEN mem_ingest called in project-A context, WHEN entry is stored, THEN project_id = 'project-A' is saved
4. GIVEN mem_list called in project-A context, WHEN listing PROJECT entries, THEN only project-A and NULL entries appear

---

#### STORY 5: SHARED Scope Cross-Project Visibility

> As a developer, I want SHARED-scope entries to remain cross-project so that global knowledge is always accessible.

**Requirement Details:**

1. Entries with scope = SHARED are ALWAYS visible regardless of current projectId
2. The IsolationLayer explicitly exempts SHARED entries from project filtering
3. SHARED entries still store project_id (the project that created them) for audit, but this does NOT restrict visibility

**Acceptance Criteria:**

1. GIVEN a SHARED entry created in project-A, WHEN user in project-B searches, THEN the SHARED entry IS visible
2. GIVEN a SHARED entry, WHEN project_id is queried for audit, THEN it shows the originating project
3. GIVEN the IsolationLayer scope clause, WHEN scope = SHARED, THEN NO project_id filter is applied

---

#### STORY 6: Legacy Entry Backward Compatibility

> As a developer, I want legacy entries (NULL project_id) to remain accessible everywhere so that existing data is not lost.

**Requirement Details:**

1. After migration, existing entries have project_id = NULL
2. NULL entries pass ALL project filters (treated as "available everywhere")
3. No bulk data migration is needed - entries organically acquire project_id on next re-ingest or update
4. The system gracefully handles the gradual transition from NULL to populated project_id

**Acceptance Criteria:**

1. GIVEN existing entries with project_id = NULL, WHEN migration runs, THEN all entries remain accessible from any project
2. GIVEN a search in project-A, WHEN entries have project_id = NULL, THEN those entries ARE included in results
3. GIVEN a legacy entry is updated/re-ingested in project-A context, WHEN the update completes, THEN project_id is set to project-A (organic migration)
4. GIVEN system startup after migration, WHEN operations execute, THEN no errors from NULL project_id values

---

#### STORY 7: USER Scope Unchanged

> As a developer, I want USER-scope entries filtered by user_id only (unchanged) so that personal entries remain personal regardless of project.

**Requirement Details:**

1. USER-scope entries are filtered by user_id only - project_id is NOT applied as additional filter
2. A USER-scope entry created in project-A is visible in project-B IF same user
3. This preserves existing behavior - USER scope is personal across all projects

**Acceptance Criteria:**

1. GIVEN a USER-scope entry created by user-X in project-A, WHEN user-X searches in project-B, THEN the entry IS visible
2. GIVEN a USER-scope entry created by user-X, WHEN user-Y searches (any project), THEN the entry is NOT visible
3. GIVEN the IsolationLayer scope clause for USER scope, WHEN examined, THEN it filters by user_id only (no project_id)

---

#### STORY 8: Comprehensive Test Coverage

> As a developer, I want comprehensive test coverage for all isolation scenarios so that regressions are caught immediately.

**Requirement Details:**

1. Test suite must cover the FULL isolation matrix (all scope x project_id combinations)
2. Tests must verify E2E behavior (from tool call through to DB query results)
3. Tests must cover: positive cases (visible), negative cases (not visible), edge cases (NULL, empty string, special chars)
4. Tests must verify the migration system works correctly (fresh DB, already-migrated DB, failed migration)
5. Tests must be runnable in CI without external dependencies

**Acceptance Criteria:**

1. GIVEN the test suite, WHEN examining coverage, THEN ALL rows of the Scope Truth Table (see Appendix) have at least one test
2. GIVEN a code change to IsolationLayer, WHEN tests run, THEN any scope leakage is detected immediately
3. GIVEN the migration tests, WHEN run on fresh DB, THEN migrations apply successfully
4. GIVEN the migration tests, WHEN run on already-migrated DB, THEN no errors (idempotent)
5. GIVEN test execution, WHEN all tests pass, THEN we have confidence the isolation works E2E

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| SA4E-26 revert/cleanup | System | SA4E-26 | Any partial patches from SA4E-26 must be cleaned up before redesign |
| SQLite better-sqlite3 | External | N/A | Database driver - must support ALTER TABLE ADD COLUMN |
| Workspace path from extension | System | N/A | IDE extension must provide workspace root path at connection init |
| MCP session context | System | N/A | MCP protocol must support session-level metadata (projectId) |
| Existing test infrastructure | System | N/A | Test framework (vitest/jest) must be available for new isolation tests |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility | Source |
|------|-------------|----------------|--------|
| Developer | SA4E Dev Team | Implement the redesigned isolation layer | SA4E-27 assignee |
| Architect | SA Agent | Design the cohesive module architecture | SA4E-27 |
| QA | SA4E QA Team | Verify isolation matrix coverage | SA4E-27 |
| Users | All extension users | Affected by project data isolation | SA4E-27 |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| SA4E-26 partial patches interfere with redesign | High | Medium | Fully revert SA4E-26 changes before starting |
| Breaking existing queries by modifying MemoryEngine | High | Low | Comprehensive test suite + backward compat with NULL entries |
| Migration system adds startup latency | Low | Low | Migrations are O(1) for already-migrated DBs (version check only) |
| ProjectId derivation conflicts (same folder name in different paths) | Medium | Low | Use full path hash or configurable override |
| Scope filtering adds query performance overhead | Low | Low | Composite index on (scope, project_id) covers the query pattern |

### 5.2 Assumptions

- Each backend instance serves ONE workspace at a time (single-project per running process)
- Workspace path is available at startup and does not change during session
- project_id is a simple string identifier derived from workspace folder name
- Existing admin.db / index.db files will auto-migrate on next startup via the new migration system
- better-sqlite3 synchronous operations mean no async migration complexity
- The test framework (vitest or equivalent) is available in the project

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Search latency increase < 5ms | Composite index ensures scope + project_id filter is fast |
| Performance | Startup migration check < 10ms | Version lookup is a single indexed query on schema_migrations |
| Backward Compatibility | Zero data loss | Existing entries retain NULL project_id, remain accessible |
| Backward Compatibility | Zero downtime migration | ALTER TABLE ADD COLUMN is instant in SQLite |
| Testability | 100% isolation matrix coverage | Every scope x project_id combination has a test |
| Maintainability | Single module for scope logic | All isolation rules in IsolationLayer - no scatter |
| Security | Project isolation at data layer | Enforced in WHERE clause - cannot be bypassed by API tricks |
| Reliability | Migration idempotency | Re-running migrations never fails or duplicates changes |

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-27 | Redesign Multi-Tenant Project Isolation cho KB | To Do | Story | Main ticket |
| SA4E-26 | KB Knowledge Base thieu Project Isolation - patch approach (FAILED) | Closed | Bug | Superseded by SA4E-27 |

---

## 8. Appendix

### 8.1 Why SA4E-26 Failed - Lessons Learned

| Problem in SA4E-26 | Impact | SA4E-27 Solution |
|-------------------|--------|------------------|
| Scope logic scattered across 5+ files | Changes in one file missed in another - incomplete isolation | Centralized IsolationLayer module |
| ScopeContext not properly threaded | Some code paths bypassed project filtering | E2E context threading with fail-safe |
| try/catch ALTER TABLE for migration | Fragile, no version tracking, silent failures | Versioned migration system with tracking table |
| No comprehensive test matrix | No way to verify all scope combinations work | Full isolation matrix test suite |
| Incremental patches without E2E design | Each patch fixed one symptom but introduced another gap | Ground-up redesign as cohesive module |

### 8.2 Scope Clause Truth Table (Complete)

| # | Entry Scope | Entry project_id | Query projectId | Query userId | Visible? | Rule |
|---|-------------|-----------------|-----------------|--------------|----------|------|
| 1 | SHARED | project-A | project-A | any | YES | SHARED always visible |
| 2 | SHARED | project-A | project-B | any | YES | SHARED always visible |
| 3 | SHARED | NULL | any | any | YES | SHARED always visible |
| 4 | PROJECT | project-A | project-A | any | YES | project_id matches |
| 5 | PROJECT | project-A | project-B | any | NO | project_id mismatch |
| 6 | PROJECT | NULL | project-A | any | YES | Legacy entry - accessible everywhere |
| 7 | PROJECT | NULL | project-B | any | YES | Legacy entry - accessible everywhere |
| 8 | USER | any | any | user-X (owner) | YES | user_id matches |
| 9 | USER | any | any | user-Y (not owner) | NO | user_id mismatch |
| 10 | PROJECT | project-A | NULL (no ctx) | any | YES | Backward compat - no project filter |

### 8.3 Module Design Principles (for SA/TDD)

The redesigned isolation layer should follow these design principles:

1. **Single Responsibility**: IsolationLayer only handles scope filtering - nothing else
2. **Open/Closed**: New scope types can be added without modifying existing logic (strategy pattern)
3. **Dependency Inversion**: MemoryEngine depends on IsolationLayer interface, not implementation
4. **Testability**: IsolationLayer can be unit-tested in isolation with mock DB
5. **Immutability**: ProjectContext is immutable once created - no mutation during session

### 8.4 Glossary

| Term | Definition |
|------|------------|
| Knowledge Base (KB) | FTS-indexed SQLite storage for structured knowledge entries |
| Scope | Visibility level: USER (personal), PROJECT (team/workspace), SHARED (global) |
| IsolationLayer | New centralized module responsible for ALL scope/project filtering logic |
| ProjectContext | Session-level context containing projectId and userId for access control |
| Project Isolation | Principle that PROJECT-scope data from one workspace must not leak into another |
| Migration | Versioned schema change tracked in schema_migrations table |
| Legacy Entry | Existing entry with project_id = NULL (pre-isolation), accessible everywhere |
| FTS5 | SQLite Full-Text Search extension used for knowledge entry indexing |
| E2E Threading | End-to-end passing of context from extension to backend to DB layer without gaps |

### 8.5 Reference Documents

| Document | Link / Location |
|----------|-----------------|
| SA4E-26 BRD (superseded) | documents/SA4E-26/BRD.md |
| SA4E-26 TDD (lessons learned) | documents/SA4E-26/TDD.md |
| SA4E Architecture | .code-intel/SA4E-ARCHITECTURE.md |
| Memory Module Schema | backend/src/modules/memory/schema.ts |
| Memory Engine | backend/src/modules/memory/MemoryEngine.ts |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
