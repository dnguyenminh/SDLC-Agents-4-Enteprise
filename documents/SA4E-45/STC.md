# System Test Cases (STC)

## Code Intelligence System - SA4E-45: Refactor engine layer - DatabaseAdapter abstraction

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-45 |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-07-18 |
| Related STP | STP-v1-SA4E-45.docx |

---

## 1. Property-Based Tests (PBT)

### PBT-01: DialectHelper.now() returns valid SQL for any engine

| Attribute | Value |
|-----------|-------|
| **ID** | PBT-01 |
| **Level** | PBT |
| **Module** | DialectHelper |
| **Priority** | P1 |
| **Data** | test-data/dialect-inputs.csv |

**Property:** For any engine in {sqlite, postgresql, mysql}, `now()` returns a non-empty string that is valid SQL timestamp expression.

**Generator:** `fc.constantFrom('sqlite','postgresql','mysql')`

**Assertions:**
1. Result is non-empty string
2. Result does not contain user input (no injection vector)
3. SQLite: contains `datetime`; PG/MySQL: contains `NOW`

---

### PBT-02: DialectHelper.upsert() generates syntactically valid SQL

| Attribute | Value |
|-----------|-------|
| **ID** | PBT-02 |
| **Level** | PBT |
| **Module** | DialectHelper |
| **Priority** | P1 |
| **Data** | test-data/dialect-inputs.csv |

**Property:** For any valid identifier table name, column array, and engine, `upsert()` returns SQL with correct placeholder count and conflict resolution.

**Generator:** table: valid identifiers; columns: 1-10 valid identifiers; engine: one of 3

**Assertions:**
1. SQLite: starts with `INSERT OR REPLACE INTO`
2. PostgreSQL: contains `ON CONFLICT` + `DO UPDATE SET`
3. Placeholder count (`?`) equals column count
4. No unescaped user data in result

---

### PBT-03: FTS sanitization strips all dangerous characters

| Attribute | Value |
|-----------|-------|
| **ID** | PBT-03 |
| **Level** | PBT |
| **Module** | MemoryEngine.search |
| **Priority** | P1 |
| **Data** | test-data/security-inputs.csv |

**Property:** For any arbitrary string, sanitized output contains ONLY alphanumeric, spaces, `*`, `"`.

**Generator:** `fc.string({minLength:0, maxLength:500})`

**Assertions:**
1. Output matches `/^[\w\s*"]*$/`
2. No `:` character (FTS column filter)
3. No `(`, `)`, `{`, `}`, `;` characters
4. Empty input yields empty or `*`

---

### PBT-04: Identifier validation rejects injection attempts

| Attribute | Value |
|-----------|-------|
| **ID** | PBT-04 |
| **Level** | PBT |
| **Module** | DialectHelper |
| **Priority** | P1 |
| **Data** | test-data/security-inputs.csv |

**Property:** `assertValidIdentifier()` accepts only `[a-zA-Z_][a-zA-Z0-9_]*` strings.

**Generator:** `fc.string({minLength:1, maxLength:100})`

**Assertions:**
1. Strings with `;`, `'`, `"`, `--`, `/*` throw
2. Valid identifiers pass without error
3. Empty string throws

---

### PBT-05: Parameterized queries never interpolate params

| Attribute | Value |
|-----------|-------|
| **ID** | PBT-05 |
| **Level** | PBT |
| **Module** | SqliteDbAdapter |
| **Priority** | P1 |
| **Data** | test-data/security-inputs.csv |

**Property:** Adapter sends params separately; malicious strings in params cannot alter SQL structure.

**Generator:** params: random strings including `'; DROP TABLE--`

**Assertions:**
1. No param value in executed SQL text
2. Malicious params do not cause syntax error or structural change
3. Data stored/retrieved correctly with special characters

---

## 2. Unit Tests (UT)

### UT-01: DialectHelper.now() - SQLite

| ID | Module | Priority | Precondition |
|----|--------|----------|--------------|
| UT-01 | DialectHelper | P1 | engine='sqlite' |

**Steps:** Create DialectHelper('sqlite'), call now()
**Expected:** Returns `"datetime('now')"`

---

### UT-02: DialectHelper.now() - PostgreSQL

| ID | Module | Priority | Precondition |
|----|--------|----------|--------------|
| UT-02 | DialectHelper | P1 | engine='postgresql' |

**Steps:** Create DialectHelper('postgresql'), call now()
**Expected:** Returns `"NOW()"`

---

### UT-03: DialectHelper.now() - MySQL

| ID | Module | Priority | Precondition |
|----|--------|----------|--------------|
| UT-03 | DialectHelper | P1 | engine='mysql' |

**Steps:** Create DialectHelper('mysql'), call now()
**Expected:** Returns `"NOW()"`

---

### UT-04: DialectHelper.upsert() - SQLite INSERT OR REPLACE

| ID | Module | Priority | Data |
|----|--------|----------|------|
| UT-04 | DialectHelper | P1 | dialect-inputs.csv row 1 |

**Steps:** upsert('knowledge_entries', ['id','content','tags'], 'id', ['content','tags'])
**Expected:** `INSERT OR REPLACE INTO knowledge_entries (id, content, tags) VALUES (?, ?, ?)`

---

### UT-05: DialectHelper.upsert() - PostgreSQL ON CONFLICT

| ID | Module | Priority | Data |
|----|--------|----------|------|
| UT-05 | DialectHelper | P1 | dialect-inputs.csv row 2 |

**Steps:** upsert('knowledge_entries', ['id','content','tags'], 'id', ['content','tags']) with PG engine
**Expected:** `INSERT INTO knowledge_entries (id, content, tags) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, tags = EXCLUDED.tags`

---

### UT-06: DialectHelper.insertIgnore() - both engines

| ID | Module | Priority | Data |
|----|--------|----------|------|
| UT-06 | DialectHelper | P1 | dialect-inputs.csv rows 3-4 |

**Steps:** insertIgnore('graph_nodes', ['entry_id','label'], 'entry_id') for SQLite and PG
**Expected:**
- SQLite: `INSERT OR IGNORE INTO graph_nodes (entry_id, label) VALUES (?, ?)`
- PG: `INSERT INTO graph_nodes (entry_id, label) VALUES (?, ?) ON CONFLICT (entry_id) DO NOTHING`

---

### UT-07: MemoryEngineCrud.insert() calls adapter.run with correct SQL

| ID | Module | Priority | Data |
|----|--------|----------|------|
| UT-07 | MemoryEngineCrud | P1 | knowledge-entries.csv row 1 |

**Steps:**
1. Create MockAdapter(engine='sqlite')
2. Create MemoryEngineCrud(mockAdapter)
3. Call insert({content:'test', type:'NOTE', tier:'WORKING'})

**Expected:**
- mockAdapter.calls[0].sql contains `INSERT INTO knowledge_entries`
- mockAdapter.calls[0].params includes 'test', 'NOTE', 'WORKING'
- Returns numeric lastInsertRowid

---

### UT-08: MemoryEngineCrud.findById() calls adapter.get

| ID | Module | Priority |
|----|--------|----------|
| UT-08 | MemoryEngineCrud | P1 |

**Steps:**
1. Configure mockAdapter.get() to return {id:1, content:'hello'}
2. Call findById(1)

**Expected:**
- adapter.get called with `SELECT * FROM knowledge_entries WHERE id = ?` and [1]
- Returns the configured entry object

---

### UT-09: MemoryEngineCrud.deleteEntry() calls adapter.run DELETE

| ID | Module | Priority |
|----|--------|----------|
| UT-09 | MemoryEngineCrud | P1 |

**Steps:** Call deleteEntry(42)
**Expected:** adapter.run called with `DELETE FROM knowledge_entries WHERE id = ?` and [42]

---

### UT-10: MemoryEngineCrud.updateTags() uses dialect.now()

| ID | Module | Priority |
|----|--------|----------|
| UT-10 | MemoryEngineCrud | P1 |

**Steps:** Call updateTags(1, 'tag1,tag2') with sqlite engine
**Expected:** SQL contains `updated_at = datetime('now')` and params = ['tag1,tag2', 1]

---

### UT-11: MemoryEngineCrud.updateTags() uses NOW() for PostgreSQL

| ID | Module | Priority |
|----|--------|----------|
| UT-11 | MemoryEngineCrud | P1 |

**Steps:** Call updateTags(1, 'tag1') with postgresql engine MockAdapter
**Expected:** SQL contains `updated_at = NOW()`

---

### UT-12: MemoryEngineCrud.getDb() returns adapter (deprecated)

| ID | Module | Priority |
|----|--------|----------|
| UT-12 | MemoryEngineCrud | P2 |

**Steps:** Call getDb()
**Expected:** Returns something (adapter or underlying db) without crashing. TypeScript shows deprecation warning.

---

### UT-13: MemoryEngine.search() - SQLite FTS5 path

| ID | Module | Priority | Data |
|----|--------|----------|------|
| UT-13 | MemoryEngine | P1 | fts-queries.csv row 1 |

**Steps:**
1. MockAdapter with engine='sqlite'
2. Call search('typescript class', 10)

**Expected:**
- SQL contains `knowledge_fts WHERE knowledge_fts MATCH ?`
- Query sanitized before MATCH
- LIMIT parameter present

---

### UT-14: MemoryEngine.search() - PostgreSQL tsvector path

| ID | Module | Priority | Data |
|----|--------|----------|------|
| UT-14 | MemoryEngine | P1 | fts-queries.csv row 2 |

**Steps:**
1. MockAdapter with engine='postgresql'
2. Call search('typescript class', 10)

**Expected:**
- SQL contains `plainto_tsquery('english', ?)`
- SQL contains `tsvector_content @@`
- No FTS5 MATCH syntax

---

### UT-15: MemoryEngine.search() - empty query returns all

| ID | Module | Priority | Data |
|----|--------|----------|------|
| UT-15 | MemoryEngine | P1 | fts-queries.csv row 3 |

**Steps:** Call search('', 10) on SQLite engine
**Expected:** FTS query uses `*` wildcard or returns all entries ordered by created_at

---

### UT-16: MemoryEngine.search() - MySQL MATCH AGAINST path

| ID | Module | Priority | Data |
|----|--------|----------|------|
| UT-16 | MemoryEngine | P2 | fts-queries.csv row 4 |

**Steps:** MockAdapter with engine='mysql', call search('test', 5)
**Expected:** SQL contains `MATCH(content, summary) AGAINST(? IN NATURAL LANGUAGE MODE)`

---

### UT-17: GraphSyncService constructor accepts dual adapters

| ID | Module | Priority |
|----|--------|----------|
| UT-17 | GraphSyncService | P1 |

**Steps:** new GraphSyncService(mockIndexAdapter, mockAdminAdapter, logger)
**Expected:** Instance created without error; no immediate DB calls

---

### UT-18: GraphSyncService.syncProjectSymbols() reads from indexAdapter

| ID | Module | Priority | Data |
|----|--------|----------|------|
| UT-18 | GraphSyncService | P1 | graph-symbols.csv |

**Steps:**
1. Configure mockIndexAdapter.all() to return 5 symbol rows
2. Call syncProjectSymbols('project-1')

**Expected:**
- indexAdapter.all called with SELECT containing `symbols s JOIN files f`
- adminAdapter.transaction called once
- adminAdapter.run called with DELETE (stale nodes)

---

### UT-19: GraphSyncService logs warning on engine mismatch

| ID | Module | Priority |
|----|--------|----------|
| UT-19 | GraphSyncService | P2 |

**Steps:**
1. indexAdapter.getEngine() = 'sqlite'
2. adminAdapter.getEngine() = 'postgresql'
3. Construct GraphSyncService

**Expected:** logger.warn called with message containing 'different engines'

---

### UT-20: GraphSyncService.syncProjectSymbols() - empty projectId

| ID | Module | Priority |
|----|--------|----------|
| UT-20 | GraphSyncService | P1 |

**Steps:** Call syncProjectSymbols('')
**Expected:** Returns immediately; no DB calls made (fail-closed)

---

### UT-21: TreeSitterIndexer accepts DatabaseAdapter

| ID | Module | Priority |
|----|--------|----------|
| UT-21 | TreeSitterIndexer | P1 |

**Steps:** new TreeSitterIndexer(registry, mockAdapter, 1048576)
**Expected:** Instance created; adapter stored internally

---

### UT-22: TreeSitterIndexer.indexFile() stores symbols via adapter

| ID | Module | Priority | Data |
|----|--------|----------|------|
| UT-22 | TreeSitterIndexer | P1 | graph-symbols.csv |

**Steps:**
1. Create indexer with MockAdapter
2. Call indexFile('test.ts', 'src/test.ts', 'proj-1')

**Expected:**
- adapter.prepare called with DELETE FROM symbols (cleanup)
- adapter.prepare called with INSERT INTO symbols
- adapter.transaction wraps batch insert

---

### UT-23: IndexingEngine constructor accepts DatabaseAdapter

| ID | Module | Priority |
|----|--------|----------|
| UT-23 | IndexingEngine | P1 |

**Steps:** new IndexingEngine(mockAdapter, config)
**Expected:** Instance created; adapter stored; TreeSitterIndexer initialized with same adapter

---

### UT-24: IndexingEngine file upsert uses adapter.run

| ID | Module | Priority |
|----|--------|----------|
| UT-24 | IndexingEngine | P1 |

**Steps:**
1. Create IndexingEngine with MockAdapter
2. Trigger file indexing for a single file

**Expected:** adapter.run called with INSERT/UPSERT into `files` table

---

### UT-25: IndexingEngine batch indexing uses adapter.transaction

| ID | Module | Priority |
|----|--------|----------|
| UT-25 | IndexingEngine | P1 |

**Steps:** Trigger indexing for 50 files
**Expected:** adapter.transaction called to wrap batch operations

---

### UT-26: IndexingEngine.syncGraphNodes() creates GraphSyncService with adapter

| ID | Module | Priority |
|----|--------|----------|
| UT-26 | IndexingEngine | P2 |

**Steps:** Trigger syncGraphNodes('project-1') internally
**Expected:** GraphSyncService created with this.adapter as indexAdapter

---

### UT-27: CodeIntelModule creates IndexingEngine with SqliteDbAdapter

| ID | Module | Priority |
|----|--------|----------|
| UT-27 | CodeIntelModule (caller) | P1 |

**Steps:** Inspect CodeIntelModule initialization code
**Expected:** `new SqliteDbAdapter(dbManager.getDb())` passed to IndexingEngine constructor

---

### UT-28: MemoryModule creates MemoryEngine with SqliteDbAdapter

| ID | Module | Priority |
|----|--------|----------|
| UT-28 | MemoryModule (caller) | P1 |

**Steps:** Inspect MemoryModule initialization code
**Expected:** `new SqliteDbAdapter(dbManager.getDb())` passed to MemoryEngine constructor

---

### UT-29: CompositeScorer accepts DatabaseAdapter

| ID | Module | Priority |
|----|--------|----------|
| UT-29 | CompositeScorer | P2 |

**Steps:** new CompositeScorer(mockAdapter)
**Expected:** Instance created; scoring logic uses adapter for DB reads

---

### UT-30: No hardcoded better-sqlite3 imports in engine layer

| ID | Module | Priority |
|----|--------|----------|
| UT-30 | All engine modules | P1 |

**Steps:**
1. `grep -r "from 'better-sqlite3'" backend/src/engine/`
2. `grep -r "from 'better-sqlite3'" backend/src/modules/memory/engine/`

**Expected:** Both commands return 0 results (exit code 1 = no match)

---

### UT-31: Existing test suite passes without modification

| ID | Module | Priority |
|----|--------|----------|
| UT-31 | Full test suite | P1 |

**Steps:** Run `npm test` or `vitest run`
**Expected:** All pre-existing tests pass; zero failures introduced by refactor

---

### UT-SEC-01: Table name injection rejected by getRowCount

| ID | Module | Priority | Data |
|----|--------|----------|------|
| UT-SEC-01 | DatabaseAdapter | P1 | security-inputs.csv |

**Steps:** Call adapter.getRowCount('users; DROP TABLE files--')
**Expected:** Throws error (assertValidIdentifier rejects); no SQL executed

---

### UT-SEC-02: DialectHelper rejects malicious identifiers

| ID | Module | Priority | Data |
|----|--------|----------|------|
| UT-SEC-02 | DialectHelper | P1 | security-inputs.csv |

**Steps:** Call upsert with table="users'); DROP TABLE--"
**Expected:** Throws DialectError; no SQL generated

---

### UT-SEC-03: FTS sanitization removes colon character

| ID | Module | Priority | Data |
|----|--------|----------|------|
| UT-SEC-03 | MemoryEngine | P1 | security-inputs.csv |

**Steps:** Call search('content:malicious') on SQLite
**Expected:** Query sent to FTS is 'content malicious' (colon stripped)

---

### UT-SEC-04: Migration queries use parameterized LIMIT/OFFSET

| ID | Module | Priority |
|----|--------|----------|
| UT-SEC-04 | MigrationService | P2 |

**Steps:** Inspect migration batch query SQL
**Expected:** LIMIT and OFFSET use `?` placeholders, not template literals

---

## 3. Integration Tests (IT)

### IT-01: MemoryEngineCrud full CRUD cycle on real SQLite

| ID | Module | Priority | Data |
|----|--------|----------|------|
| IT-01 | MemoryEngineCrud | P1 | knowledge-entries.csv |

**Steps:**
1. Create SqliteDbAdapter with :memory: DB
2. Create schema (knowledge_entries table)
3. Insert entry via crud.insert()
4. Read via crud.findById()
5. Update tags via crud.updateTags()
6. Delete via crud.deleteEntry()
7. Verify findById returns undefined

**Expected:** Full lifecycle works; data persisted and removed correctly

---

### IT-02: MemoryEngine FTS search on SQLite returns ranked results

| ID | Module | Priority | Data |
|----|--------|----------|------|
| IT-02 | MemoryEngine | P1 | fts-queries.csv |

**Steps:**
1. SqliteDbAdapter :memory: with FTS5 table created
2. Insert 10 knowledge entries with various content
3. Call search('typescript', 5)

**Expected:** Results ranked by FTS5 relevance; limit respected; entries with 'typescript' in content ranked higher

---

### IT-03: MemoryEngine FTS empty query returns all entries

| ID | Module | Priority |
|----|--------|----------|
| IT-03 | MemoryEngine | P1 |

**Steps:** Insert 5 entries, call search('', 10)
**Expected:** All 5 entries returned

---

### IT-04: MemoryEngine session start/end lifecycle

| ID | Module | Priority |
|----|--------|----------|
| IT-04 | MemoryEngine | P1 |

**Steps:**
1. Create MemoryEngine with real SqliteDbAdapter
2. startSession('test-agent')
3. Verify memory_sessions has row with status='active'
4. endSession()
5. Verify ended_at populated, status='ended'

**Expected:** Session lifecycle tracked correctly in DB

---

### IT-05: MemoryEngine tool usage tracking

| ID | Module | Priority |
|----|--------|----------|
| IT-05 | MemoryEngine | P2 |

**Steps:**
1. Call recordToolUsage('mem_search')
2. Call recordToolUsage('mem_search')
3. Query tool_usage table

**Expected:** tool_usage row with tool_name='mem_search', call_count=2

---

### IT-06: MemoryEngine insert + search round-trip

| ID | Module | Priority | Data |
|----|--------|----------|------|
| IT-06 | MemoryEngine | P1 | knowledge-entries.csv |

**Steps:**
1. Insert entry with content='DatabaseAdapter pattern for Node.js'
2. Search for 'DatabaseAdapter'

**Expected:** Inserted entry appears in search results

---

### IT-07: GraphSyncService syncs symbols to graph_nodes

| ID | Module | Priority | Data |
|----|--------|----------|------|
| IT-07 | GraphSyncService | P1 | graph-symbols.csv |

**Steps:**
1. Create two SqliteDbAdapter instances (indexDb + adminDb)
2. Insert files + symbols into indexDb
3. Create graph_nodes table in adminDb
4. Call syncProjectSymbols('test-project')

**Expected:**
- graph_nodes populated with code:* entries
- Count matches symbol count (up to limit 2000)
- 3D positions (x,y,z) calculated

---

### IT-08: GraphSyncService replaces stale nodes on re-sync

| ID | Module | Priority |
|----|--------|----------|
| IT-08 | GraphSyncService | P1 |

**Steps:**
1. Sync with 5 symbols
2. Delete 2 symbols from indexDb
3. Re-sync

**Expected:** graph_nodes now has 3 entries (stale deleted, new inserted)

---

### IT-09: GraphSyncService handles empty project gracefully

| ID | Module | Priority |
|----|--------|----------|
| IT-09 | GraphSyncService | P2 |

**Steps:** Call syncProjectSymbols('nonexistent-project')
**Expected:** No crash; graph_nodes empty for that project

---

### IT-10: TreeSitterIndexer parses and stores via adapter

| ID | Module | Priority |
|----|--------|----------|
| IT-10 | TreeSitterIndexer | P1 |

**Steps:**
1. Create SqliteDbAdapter + schema
2. Create TreeSitterIndexer with adapter
3. Index a real .ts file

**Expected:** symbols table populated with parsed functions/classes

---

### IT-11: IndexingEngine full index run via adapter

| ID | Module | Priority |
|----|--------|----------|
| IT-11 | IndexingEngine | P1 |

**Steps:**
1. Create SqliteDbAdapter with :memory:
2. Create IndexingEngine(adapter, config)
3. Run full index on test workspace (5 files)

**Expected:**
- files table: 5 rows
- symbols table: populated with parsed symbols
- No better-sqlite3 direct calls (only adapter)

---

### IT-12: IndexingEngine incremental re-index (unchanged file skipped)

| ID | Module | Priority |
|----|--------|----------|
| IT-12 | IndexingEngine | P1 |

**Steps:**
1. Full index run
2. Re-run without file changes

**Expected:** content_hash check skips unchanged files; symbols not re-inserted

---

### IT-13: IndexingEngine handles file deletion

| ID | Module | Priority |
|----|--------|----------|
| IT-13 | IndexingEngine | P2 |

**Steps:**
1. Index 5 files
2. Delete 1 file from workspace
3. Run incremental index

**Expected:** Deleted file removed from `files` table; associated symbols removed

---

### IT-14: Transaction rollback on error

| ID | Module | Priority |
|----|--------|----------|
| IT-14 | MemoryEngine | P1 |

**Steps:**
1. Start transaction via adapter.transaction()
2. Insert valid entry
3. Throw error mid-transaction

**Expected:** Transaction rolled back; no partial data in DB

---

### IT-15: Concurrent read during write (WAL mode)

| ID | Module | Priority |
|----|--------|----------|
| IT-15 | IndexingEngine + MemoryEngine | P3 |

**Steps:**
1. Start indexing (write)
2. Simultaneously search (read)

**Expected:** Both operations complete without SQLITE_BUSY error (WAL mode)

---

## 4. E2E API Tests (E2E-API)

### E2E-01: MCP mem_store + mem_search round-trip via adapter

| ID | Module | Priority |
|----|--------|----------|
| E2E-01 | MCP Memory Tools | P1 |

**Steps:**
1. Start server with refactored engine (SqliteDbAdapter)
2. Call MCP tool `mem_store` with content='Test knowledge entry'
3. Call MCP tool `mem_search` with query='Test knowledge'

**Expected:**
- mem_store returns success with entry ID
- mem_search returns the stored entry in results
- No behavioral change from pre-refactor

---

### E2E-02: Full file indexing via MCP triggers adapter path

| ID | Module | Priority |
|----|--------|----------|
| E2E-02 | MCP Code Intel Tools | P1 |

**Steps:**
1. Start server
2. Trigger workspace indexing via MCP tool
3. Query symbols via MCP tool

**Expected:**
- Indexing completes without error
- Symbols queryable after indexing
- All DB operations went through adapter (verified via logs)

---

### E2E-03: Memory session lifecycle via MCP

| ID | Module | Priority |
|----|--------|----------|
| E2E-03 | MCP Memory Tools | P1 |

**Steps:**
1. Start new session via MCP
2. Store entries during session
3. End session

**Expected:**
- Session created with unique ID
- Entries linked to session
- Session end updates status

---

### E2E-04: Search with special characters handled safely

| ID | Module | Priority | Data |
|----|--------|----------|------|
| E2E-04 | MCP Memory Tools | P1 | security-inputs.csv |

**Steps:**
1. Call mem_search with query containing SQL injection: `'; DROP TABLE knowledge_entries--`

**Expected:**
- No crash, no data loss
- Returns empty results or sanitized search
- knowledge_entries table still intact

---

### E2E-05: GraphSync triggered after index completes

| ID | Module | Priority |
|----|--------|----------|
| E2E-05 | IndexingEngine + GraphSync | P2 |

**Steps:**
1. Index workspace with project_id
2. Query graph_nodes for that project

**Expected:** graph_nodes populated with code symbols from indexed files

---

### E2E-06: Adapter error handling - disconnected adapter

| ID | Module | Priority |
|----|--------|----------|
| E2E-06 | System-wide | P2 |

**Steps:**
1. Start server normally
2. Simulate adapter disconnect (corrupt DB path)
3. Attempt mem_store

**Expected:**
- Error returned to MCP client (not crash)
- Error message indicates DB connection issue
- Server remains running (graceful degradation)

---

## 5. E2E UI Tests (E2E-UI)

> **N/A** - SA4E-45 is an internal engine refactor with no UI changes.
> Admin Portal UI remains unchanged (tested in SA4E-44).

---

## 6. System Integration Tests (SIT)

### SIT-01: Full migration SQLite to PostgreSQL - all engine tables

| ID | Module | Priority | Data |
|----|--------|----------|------|
| SIT-01 | MigrationService | P1 | migration-tables.csv |

**Steps:**
1. Start with SQLite containing: 100 files, 500 symbols, 50 knowledge_entries, 10 graph_nodes
2. Start PostgreSQL via Testcontainers
3. Trigger migration SQLite -> PostgreSQL
4. Verify ALL tables exist in PG
5. Verify row counts match for every table

**Expected:**
- All 13+ engine tables created in PG
- Row counts match exactly
- No data in SQLite remains orphaned

---

### SIT-02: Post-migration engine operations work on PostgreSQL

| ID | Module | Priority |
|----|--------|----------|
| SIT-02 | All engines | P1 |

**Steps:**
1. Complete SIT-01 migration
2. Reinitialize engines with PostgresAdapter
3. Insert new knowledge entry
4. Search for it
5. Index a new file
6. Sync graph nodes

**Expected:** All operations work on PG after migration; no SQLite fallback

---

### SIT-03: Migration rollback on failure

| ID | Module | Priority |
|----|--------|----------|
| SIT-03 | MigrationService | P1 |

**Steps:**
1. Start migration
2. Simulate failure mid-batch (kill PG connection after 3rd table)
3. Verify rollback

**Expected:**
- Target PG tables dropped (rollback)
- Source SQLite unchanged
- Config reverted to SQLite
- Error reported to caller

---

### SIT-04: Migration copies ALL tables (completeness check)

| ID | Module | Priority | Data |
|----|--------|----------|------|
| SIT-04 | MigrationService | P1 | migration-tables.csv |

**Steps:**
1. Populate SQLite with data in ALL known tables (from migration-tables.csv)
2. Run migration
3. Check PG has all tables

**Expected:** Every table from migration-tables.csv exists in PG with correct row counts

---

### SIT-05: Migration skips FTS virtual tables

| ID | Module | Priority |
|----|--------|----------|
| SIT-05 | MigrationService | P1 |

**Steps:**
1. SQLite source has knowledge_fts and symbols_fts virtual tables
2. Run migration

**Expected:**
- FTS virtual tables NOT copied (filtered by _fts suffix)
- PG creates tsvector column + GIN index instead
- No error from attempting to copy virtual table

---

### SIT-06: Migration preserves data integrity (FK relationships)

| ID | Module | Priority |
|----|--------|----------|
| SIT-06 | MigrationService | P1 |

**Steps:**
1. Source has symbols referencing files (file_id FK)
2. Migrate
3. Verify symbols.file_id still references correct files.id in PG

**Expected:** FK relationships preserved; JOIN queries work on PG

---

### SIT-07: Migration handles large dataset (benchmark)

| ID | Module | Priority |
|----|--------|----------|
| SIT-07 | MigrationService | P2 |

**Steps:**
1. Generate 10,000 files + 100,000 symbols in SQLite
2. Run migration
3. Measure time

**Expected:**
- Completes in < 5 minutes
- Row counts match
- Batch processing (500 rows) confirmed via progress callbacks

---

### SIT-08: Module reinitialization after DB switch (hot-swap)

| ID | Module | Priority |
|----|--------|----------|
| SIT-08 | System | P1 |

**Steps:**
1. Running on SQLite, insert data
2. Migrate to PG
3. Reinitialize all engine modules with new adapter
4. Verify new operations go to PG
5. Verify old SQLite adapter disconnected

**Expected:**
- New operations stored in PG (not SQLite)
- Old adapter disconnect called
- No data written to SQLite after switch

---

### SIT-SEC-01: PostgreSQL connection uses TLS with cert validation

| ID | Module | Priority |
|----|--------|----------|
| SIT-SEC-01 | PostgresAdapter | P1 |

**Steps:**
1. Configure PG connection with ssl=true
2. Verify rejectUnauthorized is true (or configurable)
3. Attempt connection with invalid cert

**Expected:**
- Connection with invalid cert REJECTED
- rejectUnauthorized defaults to true in production mode
- Connection succeeds with valid cert

---

## 7. Appendix

### Test Case Cross-Reference to BRD Stories

| BRD Story | Test Cases Covering |
|-----------|-------------------|
| Story 1 | SIT-01, SIT-02, SIT-03, SIT-08 |
| Story 2 | UT-07..UT-29, IT-01..IT-13, E2E-01..E2E-06 |
| Story 3 | SIT-04, SIT-05, SIT-06, SIT-07 |
| Story 4 | UT-31, IT-01..IT-15, E2E-01..E2E-06 |
| Story 5 | UT-31, IT-14, IT-15 |
| Story 6 | UT-30 |

### Test Data Files Location

All CSV test data files at: `documents/SA4E-45/test-data/`
