# Business Requirements Document (BRD)

## Code Intelligence System — SA4E-45: Refactor engine layer — DatabaseAdapter abstraction cho IndexingEngine, MemoryEngine, GraphSync

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-45 |
| Title | Refactor engine layer — DatabaseAdapter abstraction cho IndexingEngine, MemoryEngine, GraphSync |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-07-18 |
| Status | Draft |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | BA Agent – Business Analyst | Create document |
| Peer Reviewer | TA Agent – Technical Architect | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-18 | BA Agent | Initiate document — auto-generated from Jira ticket SA4E-45 and linked tickets |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |

---

## 1. Introduction

### 1.1 Scope

SA4E-44 đã implement multi-DB support cho admin portal (users, sessions, config tables) thông qua DatabaseAdapter pattern. Tuy nhiên, engine layer (IndexingEngine, MemoryEngine, GraphSyncService, TreeSitterIndexer, QueryLayer) vẫn hardcode better-sqlite3 trực tiếp.

Ticket SA4E-45 yêu cầu refactor TẤT CẢ engine layer modules để sử dụng DatabaseAdapter interface, đảm bảo khi user switch database engine (SQLite ↔ PostgreSQL ↔ MySQL), toàn bộ dữ liệu (admin + engine) đều đi qua cùng một DB engine. Migration tool cũng cần update để copy ALL tables khi chuyển đổi.

### 1.2 Out of Scope

- Tạo mới DatabaseAdapter interface (đã tồn tại từ SA4E-44)
- Thay đổi Admin Portal UI (đã hoạt động đúng)
- Hỗ trợ thêm database engine mới ngoài SQLite/PostgreSQL/MySQL
- Thay đổi schema/structure của engine tables
- Performance optimization (chỉ refactor abstraction, không thay đổi logic)

### 1.3 Preliminary Requirement

- SA4E-44 (Multi-DB support for admin portal) — PHẢI hoàn thành trước
- DatabaseAdapter interface đã tồn tại và stable
- DatabaseAdapterFactory đã hỗ trợ tạo adapter cho SQLite, PostgreSQL, MySQL
- SqliteDbAdapter bridge pattern đã được implement tại `modules/memory/task-queue/SqliteDbAdapter.ts`

---

## 2. Business Requirements

### 2.1 High Level Process Map

Hệ thống Code Intelligence hiện tại có hai luồng dữ liệu song song:
1. **Admin flow**: Admin Portal → DatabaseAdapter → SQLite/PostgreSQL (✅ đã đúng)
2. **Engine flow**: Engine modules → better-sqlite3 trực tiếp → SQLite ONLY (❌ vấn đề)

Sau refactor, cả hai luồng sẽ merge thành một luồng duy nhất đi qua DatabaseAdapter, đảm bảo consistency khi user switch database engine.

Xem chi tiết tại **Business Flow Diagram** (Section 2.3).

![Business Flow](diagrams/business-flow.png)

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case / Epic | Priority | Source Ticket |
|---|-------------------------|----------|---------------|
| 1 | As a System Admin, I want ALL data to go to PostgreSQL when I switch DB engine, so that there's no data split between SQLite and PG | MUST HAVE | SA4E-45 |
| 2 | As a Developer, I want engine modules to use DatabaseAdapter interface, so that the code is consistent and maintainable | MUST HAVE | SA4E-45 |
| 3 | As a System Admin, I want the migration tool to copy ALL tables (admin + engine), so that no data is lost when switching DB | MUST HAVE | SA4E-45 |
| 4 | As a Developer, I want SQLite mode to work exactly as before, so that backward compatibility is maintained (zero regression) | MUST HAVE | SA4E-45 |
| 5 | As a QA Engineer, I want existing unit tests to pass without modification, so that the refactor doesn't break current functionality | MUST HAVE | SA4E-45 |
| 6 | As a Developer, I want no hardcoded better-sqlite3 imports in engine layer, so that modules are properly decoupled from the DB implementation | SHOULD HAVE | SA4E-45 |

---

### 2.3 Details of User Stories

---

#### Business Flow

**Current State (AS-IS):**

**Step 1:** User mở Admin Portal và switch database engine từ SQLite sang PostgreSQL.

**Step 2:** DatabaseAdapterFactory tạo PostgresAdapter mới dựa trên config.

**Step 3:** Admin tables (users, sessions, config) bắt đầu sử dụng PostgreSQL. ✅

**Step 4:** Engine modules (IndexingEngine, MemoryEngine, GraphSyncService) KHÔNG nhận biết DB switch — vẫn dùng better-sqlite3 hardcoded. ❌

**Step 5:** Dữ liệu bị split: admin data ở PG, engine data (files, symbols, knowledge_entries, graph_nodes) ở SQLite. ❌

**Step 6:** User thấy data inconsistency, confusion, và potential data loss khi backup/restore.

---

**Target State (TO-BE):**

**Step 1:** User mở Admin Portal và switch database engine từ SQLite sang PostgreSQL.

**Step 2:** DatabaseAdapterFactory tạo adapter mới cho selected engine.

**Step 3:** Migration Tool copies ALL tables (admin + engine) từ SQLite sang PostgreSQL.

**Step 4:** Tất cả modules (Admin Portal + Engine Layer) nhận DatabaseAdapter instance mới qua constructor injection.

**Step 5:** Toàn bộ dữ liệu (admin + engine) đi qua DatabaseAdapter → PostgreSQL. ✅

**Step 6:** Data consistency đảm bảo — một DB engine duy nhất cho toàn bộ system.

> **Note:** Khi ở SQLite mode (default), hệ thống hoạt động chính xác như trước — zero regression.

---

#### STORY 1: Unified Database Engine Switch

> As a System Admin, I want ALL data to go to PostgreSQL when I switch DB engine, so that there's no data split between SQLite and PG.

**Requirement Details:**

1. Khi user switch database engine qua Admin UI, TẤT CẢ DB operations (admin + engine) phải đi qua adapter mới
2. Engine tables affected: `files`, `symbols`, `knowledge_entries`, `memory_sessions`, `mcp_tools`, `graph_nodes`, `graph_edges`, `knowledge_graph_edges`, `tool_usage`, `memory_audit`, `consolidation_log`
3. Không có dữ liệu nào được ghi vào DB engine cũ sau khi switch hoàn tất
4. Switch phải atomic — hoặc chuyển hết hoặc rollback

**Acceptance Criteria:**

1. AC-1: Switch to PostgreSQL → ALL data goes to PG — not just admin tables
2. AC-4: Migration tool copies ALL tables when switching between SQLite ↔ PostgreSQL

**Validation Rules:**

- Sau khi switch, query `SELECT count(*) FROM files` trên DB mới phải trả về đúng số lượng rows trước switch
- Không có orphaned data trên DB cũ sau migration thành công

**Error Handling:**

- Migration fails mid-way: Rollback toàn bộ, giữ DB cũ, thông báo user
- Target DB unreachable: Hiển thị connection error, không switch

---

#### STORY 2: Engine Modules Use DatabaseAdapter

> As a Developer, I want engine modules to use DatabaseAdapter interface, so that the code is consistent and maintainable.

**Requirement Details:**

1. **IndexingEngine** (`engine/indexer/indexing-engine.ts`): Thay thế `this.db: Database.Database` bằng `DatabaseAdapter`. Tất cả `db.prepare()`, `db.transaction()` calls phải đi qua adapter methods.
2. **MemoryEngine** (`modules/memory/engine/core.ts` + `crud.ts`): Constructor nhận `DatabaseAdapter` thay vì `Database.Database`. Tất cả `this.db.prepare()` calls phải refactor sang `adapter.prepare()`, `adapter.run()`, `adapter.all()`, `adapter.get()`.
3. **GraphSyncService** (`engine/graph/graph-sync-service.ts`): Nhận `DatabaseAdapter` cho cả `indexDb` và `adminDb` thay vì `Database.Database`.
4. **TreeSitterIndexer**: Nhận `DatabaseAdapter` thay vì trực tiếp `Database.Database`.
5. **QueryLayer**: Tất cả read queries phải qua DatabaseAdapter.

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| DatabaseAdapter | Interface | Yes | Unified DB access interface | `SqliteAdapter`, `PostgresAdapter` |
| DatabaseEngine | Enum | Yes | Engine type identifier | `'sqlite'`, `'postgresql'`, `'mysql'` |
| PreparedStatement | Interface | Yes | Cross-engine prepared statement | `adapter.prepare(sql)` |

**Acceptance Criteria:**

1. AC-3: No hardcoded `better-sqlite3` imports remain in engine layer modules
2. AC-2: SQLite mode still works exactly as before (backward compatible, zero regression)

---

#### STORY 3: Migration Tool Update

> As a System Admin, I want the migration tool to copy ALL tables (admin + engine), so that no data is lost when switching DB.

**Requirement Details:**

1. Migration tool hiện chỉ copy admin tables (users, sessions, config). Cần extend để copy engine tables.
2. Tables cần migrate thêm:
   - `files` — indexed file metadata
   - `symbols` — code symbols (functions, classes, etc.)
   - `knowledge_entries` — KB entries
   - `memory_sessions` — memory session tracking
   - `mcp_tools` — registered MCP tools
   - `graph_nodes` — KB graph visualization nodes
   - `graph_edges` — KB graph edges
   - `knowledge_graph_edges` — knowledge relationship edges
   - `tool_usage` — tool usage statistics
   - `memory_audit` — audit log
   - `consolidation_log` — tier consolidation history
   - `decay_config` — scoring configuration
3. Migration phải preserve data integrity (foreign keys, timestamps, IDs)
4. Migration phải handle large datasets (1000+ files, 50000+ symbols) efficiently

**Acceptance Criteria:**

1. AC-4: Migration tool copies ALL tables when switching between SQLite ↔ PostgreSQL
2. Row counts match between source and target DB after migration
3. Data integrity preserved (no corruption, no orphaned records)

---

#### STORY 4: Backward Compatibility (SQLite Mode)

> As a Developer, I want SQLite mode to work exactly as before, so that backward compatibility is maintained (zero regression).

**Requirement Details:**

1. Default mode vẫn là SQLite — không có breaking change cho existing deployments
2. All existing APIs, method signatures phải compatible (hoặc have adapter wrapper)
3. Performance trong SQLite mode không degrade (adapter overhead phải minimal)
4. Existing database files (index.db, admin.db) phải compatible — không cần re-index

**Acceptance Criteria:**

1. AC-2: SQLite mode still works exactly as before (backward compatible, zero regression)
2. AC-5: Existing unit tests pass without modification (or with minimal adapter mock changes)

---

#### STORY 5: Integration Testing cho DB Switch

> As a QA Engineer, I want existing unit tests to pass without modification, so that the refactor doesn't break current functionality.

**Requirement Details:**

1. Unit tests hiện tại sử dụng better-sqlite3 in-memory hoặc file-based — adapter phải transparent cho tests
2. Integration tests mới cần verify end-to-end data flow sau khi switch DB
3. Test scenarios: SQLite → PG migration, PG → SQLite fallback, concurrent access
4. Mock adapter pattern cho unit tests — tests không cần real PG connection

**Acceptance Criteria:**

1. AC-5: Existing unit tests pass without modification (or with minimal adapter mock changes)
2. AC-6: Integration tests verify data flows to correct DB engine after switch

---

#### STORY 6: Remove Hardcoded Imports

> As a Developer, I want no hardcoded better-sqlite3 imports in engine layer, so that modules are properly decoupled from the DB implementation.

**Requirement Details:**

1. Scan tất cả files trong `engine/` và `modules/memory/engine/` cho `import Database from 'better-sqlite3'`
2. Thay thế bằng `import type { DatabaseAdapter } from '...'`
3. Constructor parameters thay đổi từ `Database.Database` sang `DatabaseAdapter`
4. Ngoại lệ: `SqliteAdapter` implementation file (cần import better-sqlite3 để wrap)

**Acceptance Criteria:**

1. AC-3: No hardcoded better-sqlite3 imports remain in engine layer modules (except adapter implementations)
2. `grep -r "from 'better-sqlite3'" backend/src/engine/` trả về 0 results
3. `grep -r "from 'better-sqlite3'" backend/src/modules/memory/engine/` trả về 0 results

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| SA4E-44 (Multi-DB Admin) | System | SA4E-44 | DatabaseAdapter interface, Factory, và adapter implementations phải tồn tại |
| DatabaseAdapter Interface | System | SA4E-44 | Interface methods: connect, disconnect, run, get, all, exec, transaction, prepare |
| SqliteDbAdapter Bridge | System | SA4E-44 | Existing bridge pattern tại `modules/memory/task-queue/SqliteDbAdapter.ts` |
| better-sqlite3 | External | N/A | Vẫn cần cho SqliteAdapter implementation — chỉ remove khỏi engine layer |
| PostgreSQL Client (pg) | External | SA4E-44 | Đã có cho PostgresAdapter |
| MySQL Client | External | SA4E-44 | Đã có cho MysqlAdapter |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility | Source |
|------|-------------|----------------|--------|
| Developer | Development Team | Implement refactor | Ticket assignee |
| QA Engineer | QA Team | Verify backward compatibility and integration tests | Ticket watchers |
| System Admin | Operations | Validate DB switching works end-to-end | End user |
| Solution Architect | SA Agent | Design adapter injection strategy | Reviewer |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| SQL dialect differences (SQLite vs PostgreSQL) gây runtime errors | High | High | Implement dialect abstraction layer; test ALL queries trên cả hai engines |
| Performance regression do adapter overhead | Medium | Low | Benchmark trước/sau refactor; adapter là thin wrapper, overhead minimal |
| Breaking existing tests | High | Medium | Chạy full test suite sau mỗi module refactor; minimal mock changes only |
| Migration data loss cho large datasets | High | Low | Implement batch migration với checkpoints; verify row counts sau migration |
| Concurrent access issues khi switch DB mid-operation | High | Medium | Implement graceful shutdown/restart cycle khi switch DB engine |
| FTS (Full-Text Search) syntax khác giữa SQLite và PostgreSQL | High | High | SQLite FTS5 vs PostgreSQL tsvector — cần abstraction riêng cho FTS queries |

### 5.2 Assumptions

- DatabaseAdapter interface từ SA4E-44 đã stable và không cần thay đổi breaking changes
- Engine modules hiện tại sử dụng synchronous DB operations (better-sqlite3 là sync) — adapter cũng phải support sync operations
- PostgreSQL connection đã được test và working cho admin tables
- Existing SqliteDbAdapter bridge pattern có thể reuse/extend cho engine modules
- FTS queries sẽ cần dialect-specific implementation (SQLite FTS5 vs PG full-text)

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | No observable performance regression in SQLite mode | Adapter overhead < 1ms per query; benchmark against current direct calls |
| Performance | Migration completes within reasonable time | < 5 minutes for typical dataset (10,000 files, 100,000 symbols) |
| Compatibility | Zero breaking changes for existing deployments | Default SQLite mode unchanged; existing DB files compatible |
| Reliability | Atomic DB switch | Either complete switch or full rollback — no partial state |
| Maintainability | Single abstraction layer | All DB access through one interface — no mixed patterns |
| Testability | All modules testable with mock adapter | No real DB connection needed for unit tests |
| Security | Connection credentials managed securely | PostgreSQL credentials via environment variables, not hardcoded |

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-45 | Refactor engine layer — DatabaseAdapter abstraction | To Do | Story | Main ticket |
| SA4E-44 | Multi-DB support for admin portal | Done | Story | Prerequisite (provides DatabaseAdapter interface) |

---

## 8. Appendix

### Glossary

| Term | Definition |
|------|------------|
| DatabaseAdapter | Interface abstraction cung cấp unified DB access API cho multiple database engines (SQLite, PostgreSQL, MySQL) |
| Engine Layer | Các module xử lý core operations: IndexingEngine (file indexing), MemoryEngine (KB storage), GraphSyncService (graph projection) |
| better-sqlite3 | Node.js library cho SQLite database — synchronous API, hiện đang được hardcode trực tiếp trong engine layer |
| DatabaseAdapterFactory | Factory class tạo adapter instances dựa trên configuration (engine type, connection params) |
| Migration Tool | Utility copy data giữa database engines khi user switch configuration |
| DI (Dependency Injection) | Pattern inject dependencies qua constructor thay vì hardcode — cho phép swap implementations |
| Dialect Abstraction | Layer xử lý syntax differences giữa các DB engines (e.g., SQLite `datetime('now')` vs PG `NOW()`) |

### Affected Modules Summary

| Module | File Path | Tables | Current State | Target State |
|--------|-----------|--------|---------------|--------------|
| IndexingEngine | `engine/indexer/indexing-engine.ts` | files, symbols | Direct better-sqlite3 (`db.prepare()`) | Via DatabaseAdapter |
| MemoryEngine | `modules/memory/engine/core.ts` + `crud.ts` | knowledge_entries, memory_sessions, mcp_tools, tool_usage, memory_audit | Direct better-sqlite3 (`this.db.prepare()`) | Via DatabaseAdapter |
| GraphSyncService | `engine/graph/graph-sync-service.ts` | graph_nodes, graph_edges | Direct better-sqlite3 (indexDb + adminDb) | Via DatabaseAdapter |
| TreeSitterIndexer | `engine/parsers/tree-sitter-indexer.ts` | symbols (insert) | Direct better-sqlite3 | Via DatabaseAdapter |
| QueryLayer | Various read operations | All tables | Direct better-sqlite3 | Via DatabaseAdapter |

### DatabaseAdapter Interface (Existing)

```typescript
export interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getStatus(): ConnectionStatus;
  run(sql: string, params?: unknown[]): RunResult;
  get<T = unknown>(sql: string, params?: unknown[]): T | undefined;
  all<T = unknown>(sql: string, params?: unknown[]): T[];
  exec(sql: string): void;
  transaction<T>(fn: () => T): T;
  prepare(sql: string): PreparedStatement;
  getEngine(): DatabaseEngine;
  getVersion(): Promise<string>;
  getTableNames(): Promise<string[]>;
  getRowCount(table: string): Promise<number>;
}
```

### Use Case Diagram

![Use Case Diagram](diagrams/use-case.png)

### Reference Documents

| Document | Link / Location |
|----------|-----------------|
| SA4E-44 Implementation | SA4E-44 Jira ticket |
| DatabaseAdapter Source | `backend/src/database/adapters/DatabaseAdapter.ts` |
| SqliteDbAdapter Bridge | `backend/src/modules/memory/task-queue/SqliteDbAdapter.ts` |
| DatabaseAdapterFactory | `backend/src/database/factory/DatabaseAdapterFactory.ts` |
| SA4E Architecture | `.code-intel/SA4E-ARCHITECTURE.md` |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow (Current vs Target State) | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case Diagram | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
