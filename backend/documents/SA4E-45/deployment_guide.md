# Deployment Guide (DPG)

## SA4E-45: Refactor engine layer — DatabaseAdapter abstraction

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-45 |
| Author | DevOps Agent |
| Version | 1.0 |
| Date | 2026-07-18 |
| Branch | SA4E-45 |
| Type | Internal Refactor (zero user-facing changes) |

---

## 1. Deployment Summary

SA4E-45 is an **internal refactor** — no new features, no API changes, no schema migrations needed. The engine layer (IndexingEngine, MemoryEngine, GraphSync) is refactored to use the `DatabaseAdapter` abstraction instead of direct `better-sqlite3` calls.

**Risk Level:** Low (same behavior, different internal wiring)

---

## 2. Pre-Deployment Checklist

| # | Check | Command/Action | Expected |
|---|-------|---------------|----------|
| 1 | CI pipeline green | Check GitHub Actions for branch SA4E-45 | All 8 jobs pass |
| 2 | Coverage >= 90% | CI artifact: coverage-unit-sqlite | Lines/branches/functions >= 90% |
| 3 | No hardcoded better-sqlite3 in engine | `grep -r "from 'better-sqlite3'" backend/src/engine/` | 0 results |
| 4 | PBT tests pass (fast-check) | `npm run test:unit` | All PBT-01..PBT-05 pass |
| 5 | SIT tests pass (Testcontainers) | CI job: test-sit | PG16 + MySQL8 pass |
| 6 | Docker build succeeds | CI job: docker | Image builds without error |
| 7 | Security scan clean | CI job: security | No HIGH vulnerabilities |
| 8 | Code review approved | PR review on GitHub | >= 1 approval |

---

## 3. Deployment Steps

### 3.1 Merge to Main

```bash
git checkout SA4E-45
git pull origin SA4E-45
git fetch origin main
git rebase origin/main

cd backend
npm run build
npm run test:unit
npm run test:integration

git checkout main
git merge --no-ff SA4E-45 -m "SA4E-45: Refactor engine layer — DatabaseAdapter abstraction"
git push origin main
```

### 3.2 Tag Release

```bash
git tag -a v1.10.2 -m "SA4E-45: DatabaseAdapter engine refactor"
git push origin v1.10.2
```

### 3.3 Deploy Backend

Since this is a Node.js MCP server (used as local process), deployment = npm publish:

```bash
cd backend
npm run build
npm publish
```

For Docker-based deployments:

```bash
docker build -t sa4e-backend:v1.10.2 .
docker tag sa4e-backend:v1.10.2 sa4e-backend:latest
```

### 3.4 Verify Deployment

```bash
node dist/index.js
curl http://localhost:48721/health
# Expected: {"status":"ok"}
```

---

## 4. Rollback Plan

### 4.1 Trigger Conditions

- Server fails to start after deploy
- Indexing produces different results (verified by row count check)
- FTS search returns empty for known-good queries
- Memory CRUD operations fail

### 4.2 Rollback Steps

```bash
# Revert merge commit
git revert HEAD
git push origin main

# Or: deploy previous Docker tag
docker pull sa4e-backend:v1.10.1

# Or: npm install previous version
npm install sdlc-agent-4-enterprise-server@1.10.1
```

### 4.3 Rollback Verification

```bash
curl http://localhost:48721/health
# Trigger full re-index, compare symbol counts with pre-deploy baseline
```

**Rollback time estimate:** < 5 minutes (no schema migration to reverse)

---

## 5. Post-Deployment Verification

| # | Check | How | Expected |
|---|-------|-----|----------|
| 1 | Server starts | `node dist/index.js` | No errors in log |
| 2 | Health check | `curl /health` | `{"status":"ok"}` |
| 3 | MCP tools available | Client calls `tools/list` | All tools present |
| 4 | Index run succeeds | Trigger project indexing | Same file/symbol counts |
| 5 | FTS search works | Search known term | Returns matching entries |
| 6 | Memory CRUD | Insert + find + delete | All operations succeed |
| 7 | GraphSync | Trigger graph sync | graph_nodes populated |
| 8 | No new errors | Monitor pino logs for 10 min | Zero ERROR level entries |

---

## 6. Environment Configuration

### No new environment variables required

| Variable | Purpose | Default |
|----------|---------|---------|
| `DATABASE_ADAPTER` | Active adapter (`sqlite` or `postgresql`) | `sqlite` |
| `DATABASE_URL` | PostgreSQL connection string | -- |
| `PORT` | HTTP server port | `48721` |

### Docker Compose (unchanged)

```bash
docker compose up -d
docker compose -f docker-compose.yml -f docker-compose.test.yml up -d
```

---

## 7. CI/CD Pipeline Configuration

### New workflow: `.github/workflows/ci-sa4e-45.yml`

Pipeline stages:

```
lint -> build -> test-unit(sqlite) + test-unit(postgresql) [matrix]
             -> test-integration-sqlite
             -> test-sit(postgresql) + test-sit(mysql) [matrix + Testcontainers]
             -> test-e2e-api
             -> security
             -> docker
             -> ci-gate (final aggregator)
```

Key features:
- Matrix testing: unit+PBT for SQLite and PostgreSQL dialects
- Testcontainers: SIT tests spin up real PG16 + MySQL8
- Coverage enforcement: 90% threshold
- Security gate: verifies zero `better-sqlite3` imports in engine layer
- Docker build verification

---

## 8. Monitoring

### Signals to watch after SA4E-45:

| Signal | Meaning | Action |
|--------|---------|--------|
| `DatabaseNotConnectedError` | Adapter not initialized | Check bootstrap |
| `DialectError` | Wrong SQL for engine | Check DialectHelper |
| FTS search empty | FTS branching issue | Check engine detection |
| GraphSync zero nodes | Adapter mismatch | Check dual-adapter |

---

## 9. Dependencies

No new runtime dependencies. SA4E-45 reuses existing:
- `better-sqlite3` (existing) via SqliteDbAdapter
- `pg` (existing) via PostgresAdapter
- `vitest` ^4.1.9 (dev)
- `fast-check` ^4.9.0 (dev)
