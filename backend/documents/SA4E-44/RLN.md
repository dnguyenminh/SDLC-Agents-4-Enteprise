# Release Notes (RLN)

## SA4E-44: Persistent Task Queue & Code Intelligence Migration

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-44 |
| Author | DevOps Agent |
| Version | 1.0 |
| Date | 2026-07-17 |
| Status | Draft |

---

## Release Summary

This release introduces two major architectural changes:

1. **Persistent Task Queue** - Database-backed async task processing with crash recovery, exponential backoff, and dead letter queue
2. **Code Intelligence Migration** - Move code parsing from backend to VS Code extension; backend becomes storage + query layer

---

## What's New

### Part 1: Persistent Task Queue

| Feature | Description |
|---------|-------------|
| Atomic Ingest | KB entries + tasks created in single DB transaction |
| Background Worker | Polling-based task processor with setTimeout backoff |
| Crash Recovery | Stale claimed tasks auto-recovered on worker start |
| Task Monitor | REST API for stats, failed tasks, manual retry |
| Dead Letter Queue | Tasks exceeding max_retries moved to DLQ |
| Exponential Backoff | Configurable base * 2^retry delay between attempts |

### Part 2: Code Intelligence Migration

| Feature | Description |
|---------|-------------|
| Extension Scanner | Tree-sitter WASM parsing in VS Code extension |
| Batch Upload | Extension uploads symbols/imports/deps to backend |
| DB Storage | PostgreSQL tables for files, symbols, imports, deps, call graph |
| Query Service | code_search, code_symbols, code_modules, code_traverse via DB |
| Incremental Re-index | File save triggers hash-based dedup + re-upload |
| Enrichment Tasks | CALL_GRAPH_BUILD and IMPACT_ANALYSIS as background tasks |

---

## Breaking Changes

| Change | Impact | Migration |
|--------|--------|-----------|
| CodeIntelModule removed from backend | Backend no longer parses files directly | Extension must scan and upload |
| chokidar removed from backend | No more filesystem watching in backend | Extension FileChangeWatcher handles this |
| Tree-sitter removed from backend | No WASM parsing in backend | Extension uses Tree-sitter WASM |
| New DB tables required | 5 new tables (004-008) | Run npm run db:migrate |

---

## Infrastructure Changes

### New Files

| File | Purpose |
|------|---------|
| backend/Dockerfile | Multi-stage Docker build (Node.js 20) |
| backend/docker-compose.yml | Full dev environment (backend + PostgreSQL + ONNX) |
| backend/docker-compose.test.yml | Test environment override |
| .github/workflows/ci-sa4e-44.yml | CI pipeline for SA4E-44 branch |
| backend/.env.example | Environment variable reference |
| backend/scripts/run-migrations.ts | PostgreSQL migration runner |
| backend/scripts/verify-migrations.ts | Migration verification script |
| backend/scripts/db/init.sql | PostgreSQL initialization |
| backend/.dockerignore | Docker build exclusions |
| backend/.huskyrc.json | Pre-commit hook config |
| backend/.lintstagedrc.json | Lint-staged config |

### New package.json Scripts

| Script | Description |
|--------|-------------|
| test:e2e | Run E2E API tests |
| test:all | Run full test suite (unit + integration + e2e) |
| typecheck | TypeScript type checking (tsc --noEmit) |
| lint / lint:fix | ESLint with auto-fix |
| db:migrate | Run pending database migrations |
| db:verify | Verify all migrations applied |
| docker:up / docker:down | Docker compose lifecycle |
| docker:test | Start test environment |

---

## Database Migrations

8 migrations total (001-008). Run with:

`npm run db:migrate`

New tables: pending_tasks, code_files, code_symbols, code_imports, code_dependencies, code_call_graph

---

## CI/CD Pipeline

GitHub Actions workflow (ci-sa4e-44.yml):

| Job | Description | Depends On |
|-----|-------------|------------|
| lint | TypeScript type check + ESLint | - |
| build | Compile TypeScript | lint |
| test-unit | Unit tests + PBT (fast-check) | build |
| test-integration | Testcontainers PostgreSQL tests | build |
| security | npm audit + vulnerability scan | build |
| docker | Docker image build verification | lint |

---

## Test Coverage

| Level | Tool | Scope |
|-------|------|-------|
| PBT | fast-check + Vitest | Invariants (FIFO, backoff, hash dedup) |
| Unit | Vitest | All modules in isolation |
| Integration | Vitest + Testcontainers | Real PostgreSQL interactions |
| E2E API | Vitest + Supertest | Full JSON-RPC request/response |
| E2E UI | Mocha + VS Code Test Host | Extension commands |
| SIT | Full stack Docker | End-to-end workflows |

---

## Configuration

### Environment Variables (Key)

| Variable | Default | Description |
|----------|---------|-------------|
| DATABASE_URL | (required) | PostgreSQL connection string |
| TASK_WORKER_POLL_INTERVAL_MS | 5000 | Worker polling interval |
| TASK_WORKER_MAX_RETRIES | 3 | Max retry before dead letter |
| CODE_INTEL_MAX_BATCH_SIZE | 100 | Max files per upload batch |
| API_KEY_REQUIRED | false | Enforce API key auth (SEC-01) |

---

## Security

| ID | Feature | Implementation |
|----|---------|---------------|
| SEC-01 | API Key Authentication | Mandatory header validation |
| SEC-02 | Payload Schema Validation | Zod schemas on all inputs |
| SEC-03 | Path Traversal Prevention | PayloadValidator rejects .. and absolute paths |
| SEC-07 | Git Command Injection | execFile (not exec), metacharacter validation |

---

## Known Issues

- ONNX Runtime sidecar requires separate Docker profile (optional)
- Extension must be installed and connected for code intelligence to work
- First scan of large workspaces (>1000 files) may take 30-60s

---

## Upgrade Instructions

1. Pull latest code: `git pull origin SA4E-44`
2. Install deps: `cd backend && npm ci`
3. Run migrations: `npm run db:migrate`
4. Restart server: `npm run dev` or `docker compose up -d --build`
5. Update VS Code extension to latest version
6. Extension will auto-scan workspace on first activation