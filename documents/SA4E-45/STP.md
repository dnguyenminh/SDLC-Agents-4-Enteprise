# System Test Plan (STP)

## Code Intelligence System — SA4E-45: Refactor engine layer — DatabaseAdapter abstraction cho IndexingEngine, MemoryEngine, GraphSync

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-45 |
| Title | Refactor engine layer — DatabaseAdapter abstraction |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-07-18 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-45.docx |
| Related FSD | FSD-v1-SA4E-45.docx |
| Related TDD | TDD-v1-SA4E-45.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-18 | QA Agent | Initial STP |

---

## 1. Test Objectives

### 1.1 Primary Goals

1. **Zero Regression** — Verify that SQLite mode works identically before and after refactor
2. **Adapter Compliance** — Verify all engine modules use DatabaseAdapter interface (no direct better-sqlite3 imports)
3. **Dialect Correctness** — Verify DialectHelper generates correct SQL for all 3 engines
4. **Migration Integrity** — Verify all tables (admin + engine) migrated completely with no data loss
5. **Security** — Verify parameterized queries, FTS sanitization, and atomic rollback

### 1.2 Scope

**In Scope:**
- DialectHelper unit testing (now(), upsert(), insertIgnore() for sqlite/postgresql/mysql)
- MemoryEngineCrud CRUD via adapter
- MemoryEngine FTS branching (sqlite vs postgresql path)
- GraphSyncService dual-adapter sync
- TreeSitterIndexer adapter injection
- IndexingEngine full index run via adapter
- Migration data integrity, FTS recreation, rollback
- Caller injection points (CodeIntelModule, MemoryModule)
- Security findings from SECURITY-REVIEW.md

**Out of Scope:**
- Admin Portal UI (already working, SA4E-44)
- New database engine support beyond SQLite/PostgreSQL/MySQL
- Performance optimization (measured but not optimized)
- PostgresAdapter async bridge (deferred to SA4E-46)

---

## 2. Test Strategy

### 2.1 Test Levels

| Level | Abbreviation | Description | Tool/Framework | Coverage Target |
|-------|-------------|-------------|----------------|-----------------|
| Property-Based Testing | PBT | Verify invariants hold across random inputs | fast-check | DialectHelper, FTS sanitization |
| Unit Testing | UT | Isolated module testing with mock adapter | vitest + MockAdapter | All modules (>=90% branch coverage) |
| Integration Testing | IT | Module + real SQLite adapter | vitest + SqliteDbAdapter + :memory: | CRUD flows, FTS, GraphSync |
| E2E API Testing | E2E-API | Full system via MCP tool calls | vitest + supertest/MCP client | Index + Search + Memory workflows |
| E2E UI Testing | E2E-UI | N/A (no UI changes in SA4E-45) | -- | -- |
| System Integration Testing | SIT | Full migration workflow, hot-swap, multi-engine | vitest + Testcontainers (PG) | Migration, reinit, rollback |

> **Note:** E2E-UI is marked N/A because SA4E-45 is an internal refactor with no Admin Portal UI changes.

### 2.2 Test Approach

| Approach | When Applied |
|----------|-------------|
| White-box | DialectHelper methods, FTS branching logic, adapter call translation |
| Black-box | Migration end-to-end, CRUD cycle, search results |
| Regression | Existing test suite must pass without modification |
| Security | SQL injection vectors, FTS injection, credential handling |
| Boundary | Large datasets (10k files), empty inputs, special characters |

### 2.3 Test Environment

| Environment | Configuration |
|-------------|---------------|
| Unit/PBT | In-memory MockAdapter |
| Integration | SqliteDbAdapter wrapping `:memory:` Database |
| SIT (PostgreSQL) | Testcontainers: `postgres:16-alpine` |
| SIT (MySQL) | Testcontainers: `mysql:8.0` |
| CI | GitHub Actions -- Node 20 + Docker |

### 2.4 Entry/Exit Criteria

**Entry Criteria:**
- TDD.md finalized and approved
- DatabaseAdapter interface unchanged from SA4E-44
- SqliteDbAdapter bridge exists and tested
- DialectHelper module implemented

**Exit Criteria:**
- All PBT + UT + IT + E2E-API + SIT tests pass
- Zero Critical/High defects open
- Code coverage >= 90% for refactored modules
- `grep -r "from 'better-sqlite3'" backend/src/engine/` returns 0 results
- `grep -r "from 'better-sqlite3'" backend/src/modules/memory/engine/` returns 0 results
- Migration benchmark < 5 minutes for 10k files dataset

---

## 3. Requirements Traceability Matrix (RTM)

| BRD Story | Acceptance Criteria | Test Level | Test Case IDs | Status |
|-----------|--------------------|-----------:|---------------|--------|
| Story 1: Unified DB Switch | AC-1: ALL data goes to PG after switch | SIT | SIT-01, SIT-02, SIT-03 | Planned |
| Story 1: Unified DB Switch | AC-4: Migration copies ALL tables | SIT | SIT-04, SIT-05, SIT-06, SIT-07 | Planned |
| Story 2: Engine Uses Adapter | AC-3: No hardcoded better-sqlite3 imports | UT | UT-30 | Planned |
| Story 2: Engine Uses Adapter | AC-2: SQLite mode zero regression | IT, E2E-API | IT-01..IT-15, E2E-01..E2E-06 | Planned |
| Story 3: Migration All Tables | AC-4: Row counts match post-migration | SIT | SIT-04, SIT-05 | Planned |
| Story 3: Migration All Tables | Data integrity preserved | SIT | SIT-06, SIT-07 | Planned |
| Story 4: Backward Compat | AC-2: SQLite mode unchanged | IT, E2E-API | IT-01..IT-15, E2E-01..E2E-06 | Planned |
| Story 4: Backward Compat | AC-5: Existing tests pass | UT | UT-31 | Planned |
| Story 5: Integration Testing | AC-5: Tests pass without modification | UT | UT-31 | Planned |
| Story 5: Integration Testing | AC-6: Data flows to correct engine | SIT | SIT-01, SIT-02, SIT-08 | Planned |
| Story 6: Remove Hardcoded Imports | AC-3: grep returns 0 results | UT | UT-30 | Planned |
| SECURITY #1 | TLS cert validation | SIT | SIT-SEC-01 | Planned |
| SECURITY #3 | Table name injection prevention | UT | UT-SEC-01 | Planned |
| SECURITY #5 | DialectHelper identifier safety | PBT, UT | PBT-04, UT-SEC-02 | Planned |
| SECURITY #6 | FTS colon injection prevention | PBT, UT | PBT-03, UT-SEC-03 | Planned |
| SECURITY #7 | Migration BATCH_SIZE parameterized | UT | UT-SEC-04 | Planned |

---

## 4. Test Coverage Diagram

![Test Coverage](diagrams/test-coverage.png)

---

## 5. Test Execution Flow

![Test Execution Flow](diagrams/test-execution-flow.png)

---

## 6. Risk-Based Testing Priority

| Risk | Impact | Likelihood | Test Priority | Mitigation |
|------|--------|------------|---------------|------------|
| SQL dialect generates wrong SQL | High | High | P1 | PBT + UT all engines |
| FTS search broken after refactor | High | Medium | P1 | IT + E2E-API |
| Migration data loss | High | Low | P1 | Row count verification + data sampling |
| Breaking existing tests | High | Medium | P1 | Full regression suite |
| Transaction nesting crashes SQLite | High | Low | P2 | Explicit nesting attempt test |
| Adapter overhead > 1ms | Medium | Low | P3 | Benchmark adapter vs direct calls |
| GraphSync dual-adapter engine mismatch | Medium | Low | P2 | Warning log verified |
| Concurrent index + search conflict | Medium | Low | P3 | Parallel read/write test |
| INSERT OR REPLACE semantics differ | High | High | P1 | PBT random upsert both engines |

---

## 7. Test Data Strategy

### 7.1 CSV Test Data Files

| File | Purpose | Used By |
|------|---------|---------|
| `test-data/dialect-inputs.csv` | DialectHelper inputs (table, columns, engine) | PBT-01..PBT-04, UT-01..UT-06 |
| `test-data/knowledge-entries.csv` | Sample knowledge entries for CRUD | UT-07..UT-12, IT-01..IT-06 |
| `test-data/fts-queries.csv` | FTS search queries with expected behavior | PBT-03, UT-13..UT-16, IT-07..IT-10 |
| `test-data/migration-tables.csv` | Table definitions for migration testing | SIT-04..SIT-07 |
| `test-data/graph-symbols.csv` | Code symbols for GraphSync testing | UT-17..UT-20, IT-11..IT-13 |
| `test-data/security-inputs.csv` | SQL injection payloads, FTS injection strings | PBT-03, PBT-04, UT-SEC-01..04 |

### 7.2 Mock Adapter Strategy

```typescript
class MockDatabaseAdapter implements DatabaseAdapter {
  calls: { method: string; sql: string; params: unknown[] }[] = [];
  engine: DatabaseEngine = 'sqlite';
  // Track all calls for assertion
  // Configurable return values per test
}
```

---

## 8. Automation Strategy

| Test Level | Automation % | Runner | CI Integration |
|-----------|-------------|--------|----------------|
| PBT | 100% | vitest + fast-check | Every PR |
| UT | 100% | vitest | Every PR |
| IT | 100% | vitest + SqliteDbAdapter(:memory:) | Every PR |
| E2E-API | 100% | vitest + MCP client | Every PR |
| E2E-UI | N/A | -- | -- |
| SIT | 100% | vitest + Testcontainers | Nightly + Release |

---

## 9. Defect Management

| Severity | Response Time | Resolution Time |
|----------|--------------|-----------------|
| Critical (data loss, crash) | Immediate | Same day |
| High (feature broken) | 4 hours | 1 day |
| Medium (degraded) | 1 day | 3 days |
| Low (cosmetic) | 3 days | Next sprint |

---

## 10. Test Schedule

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| PBT + UT Development | 2 days | DialectHelper + modules implemented |
| IT Development | 2 days | Engine modules refactored |
| E2E-API Development | 1 day | Full system wired |
| SIT Development | 2 days | Testcontainers setup + migration service |
| Test Execution | 1 day | All code merged |
| Regression Verification | 0.5 day | Test execution complete |

---

## 11. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Test Coverage Matrix | [test-coverage.png](diagrams/test-coverage.png) | [test-coverage.drawio](diagrams/test-coverage.drawio) |
| 2 | Test Execution Flow | [test-execution-flow.png](diagrams/test-execution-flow.png) | [test-execution-flow.drawio](diagrams/test-execution-flow.drawio) |

### Test Case Summary

| Level | Count | IDs Range |
|-------|-------|-----------|
| PBT | 5 | PBT-01 to PBT-05 |
| UT | 31 + 4 SEC | UT-01 to UT-31, UT-SEC-01 to UT-SEC-04 |
| IT | 15 | IT-01 to IT-15 |
| E2E-API | 6 | E2E-01 to E2E-06 |
| E2E-UI | 0 (N/A) | -- |
| SIT | 8 + 1 SEC | SIT-01 to SIT-08, SIT-SEC-01 |

**Total: 70 test cases**
