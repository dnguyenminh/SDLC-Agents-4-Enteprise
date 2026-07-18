# Release Notes

## SA4E-45: Refactor engine layer — DatabaseAdapter abstraction

---

## Release Information

| Field | Value |
|-------|-------|
| Version | 1.10.2 |
| Release Date | 2026-07-18 |
| Jira Ticket | SA4E-45 |
| Type | Internal Refactor |
| Breaking Changes | None |
| Migration Required | None |

---

## Summary

Internal refactoring of the engine layer to use the `DatabaseAdapter` interface instead of direct `better-sqlite3` database calls. This enables future multi-database support (PostgreSQL, MySQL) while maintaining 100% backward compatibility with existing SQLite mode.

---

## Changes

### Engine Layer Refactored to DatabaseAdapter

- **IndexingEngine** — now accepts `DatabaseAdapter` instead of raw `Database` object
- **MemoryEngine / MemoryEngineCrud** — adapter-based CRUD with DialectHelper for SQL translation
- **GraphSyncService** — dual-adapter pattern (index + admin) with engine mismatch warning
- **TreeSitterIndexer** — adapter injection via constructor

### New Module: DialectHelper

- SQL dialect translation layer (`now()`, `upsert()`, `insertIgnore()`)
- Supports SQLite, PostgreSQL, and MySQL syntax variants
- Pure function — no side effects, fully testable

### FTS Branching in MemoryEngine

- SQLite: FTS5 `MATCH` queries (existing behavior preserved)
- PostgreSQL: `tsvector` + `plainto_tsquery` with GIN index
- MySQL: `MATCH ... AGAINST` in natural language mode

### Deprecated

- `MemoryEngineCrud.getDb()` — deprecated with `@deprecated` JSDoc, returns `unknown`. Removal in SA4E-47.

---

## What's NOT Changed

- **Public API** — all MCP tools, HTTP endpoints, MCP protocol remain identical
- **Data format** — SQLite database files untouched, no migration needed
- **Configuration** — all environment variables work as before
- **Extension** — VS Code extension unaffected
- **User behavior** — zero user-visible changes

---

## Test Coverage

| Level | Count | Status |
|-------|-------|--------|
| Property-Based (PBT) | 5 | fast-check invariants |
| Unit Tests (UT) | 35 | MockAdapter + real adapter |
| Integration Tests (IT) | 15 | SQLite in-memory |
| E2E API Tests | 6 | Full MCP tool calls |
| System Integration (SIT) | 9 | Testcontainers (PG16 + MySQL8) |
| **Total** | **70** | -- |

Coverage target: >= 90% (lines, branches, functions, statements)

---

## CI/CD

New dedicated CI workflow: `.github/workflows/ci-sa4e-45.yml`

- Matrix unit tests (SQLite + PostgreSQL dialect)
- Testcontainers for SIT (real database containers)
- Coverage threshold enforcement (90%)
- Security scan (no hardcoded imports verification)
- Docker build verification

---

## Known Issues

None.

---

## Upgrade Instructions

No action required. This is a transparent internal refactor:

```bash
npm update sdlc-agent-4-enterprise-server
```

Or rebuild Docker image:

```bash
docker build -t sa4e-backend:v1.10.2 backend/
```

---

## Contributors

- SA Agent — Architecture and TDD
- DEV Agent — Implementation
- QA Agent — Test planning and execution (70 test cases)
- DevOps Agent — CI/CD pipeline setup
- Security Agent — Design review
