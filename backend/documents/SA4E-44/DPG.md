# Deployment Guide (DPG)

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

## 1. Deployment Architecture

### 1.1 Components

| Component | Image / Runtime | Port | Purpose |
|-----------|----------------|------|---------|
| Backend Server | Node.js 20 / Hono | 48721 | MCP Server, Task Worker, Code Intel API |
| PostgreSQL 15 | postgres:15-alpine | 5432 | Persistent storage (tasks, code intel, KB) |
| ONNX Runtime (optional) | onnxruntime/server | 8080 | Vector embeddings for semantic search |

### 1.2 Network Topology

- Backend to PostgreSQL: Internal Docker network (sa4e-network)
- Extension to Backend: localhost:48721 (MCP StreamableHTTP)
- ONNX sidecar: Only enabled with --profile embeddings

---

## 2. Pre-Deployment Checklist

| # | Item | Command / Action | Expected |
|---|------|-----------------|----------|
| 1 | Docker installed | docker --version | >= 24.x |
| 2 | Docker Compose installed | docker compose version | >= 2.20 |
| 3 | Node.js 20+ | node --version | >= 20.0.0 |
| 4 | Git branch correct | git branch --show-current | SA4E-44 |
| 5 | Dependencies installed | cd backend and npm ci | Exit 0 |
| 6 | Build succeeds | npm run build | Exit 0 |
| 7 | Type check passes | npm run typecheck | Exit 0 |
| 8 | .env configured | Check .env exists | All vars set |

---

## 3. Deployment Steps

### 3.1 Local Development

1. Start infrastructure: `docker compose up -d`
2. Wait for PostgreSQL: `docker compose exec postgres pg_isready -U sa4e_user`
3. Run migrations: `npm run db:migrate`
4. Verify migrations: `npm run db:verify`
5. Start dev server: `npm run dev`

### 3.2 CI/CD Pipeline (GitHub Actions)

Pipeline triggers on push to SA4E-44 branch or PR to main/master.

Stages: lint -> build -> test-unit (PBT + UT) -> test-integration (Testcontainers) -> security -> docker

### 3.3 Production Deployment

1. Build image: `docker build -t sa4e-backend:latest --target production .`
2. Start stack: `docker compose up -d`
3. Run migrations: `docker compose exec backend npx tsx scripts/run-migrations.ts`
4. Verify health: `curl http://localhost:48721/health`
5. Verify worker: `curl http://localhost:48721/internal/tasks/stats`

---

## 4. Database Migration Procedure

### 4.1 Migration Order

| # | Migration | Description |
|---|-----------|-------------|
| 001 | add-scope-columns | Scope + project_id on knowledge_entries |
| 002 | add-evolution-columns | Evolution tracking fields |
| 003 | pending-tasks | Task queue table + indexes |
| 004 | code-intel-files | Code files registry |
| 005 | code-intel-symbols | Symbol index (functions, classes) |
| 006 | code-intel-imports | Import tracking |
| 007 | code-intel-dependencies | File dependency graph |
| 008 | code-intel-call-graph | Call graph relationships |

### 4.2 Migration Safety

- Each migration runs in a transaction (auto-rollback on failure)
- Idempotent: IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
- Tracked in _migrations table (never re-applied)

---

## 5. Rollback Plan

### 5.1 Application Rollback

1. docker compose down
2. git checkout main
3. docker compose up -d --build

### 5.2 Database Rollback

Migrations are additive. Rollback requires manual DROP TABLE statements in reverse order (008 -> 003).

### 5.3 Rollback Decision Matrix

| Symptom | Action |
|---------|--------|
| Backend won't start | Check logs: docker compose logs backend |
| Migration failed | Auto-rolled back per transaction; fix SQL and retry |
| Task Worker crash loop | Set TASK_WORKER_ENABLED=false, restart |
| Code Intel upload errors | Set CODE_INTEL_ENABLED=false, restart |

---

## 6. Post-Deployment Verification

| # | Check | Command | Expected |
|---|-------|---------|----------|
| 1 | Server healthy | curl localhost:48721/health | status: ok |
| 2 | Task worker running | curl localhost:48721/internal/tasks/stats | JSON with worker stats |
| 3 | DB connected | Check server startup logs | Connected to PostgreSQL |
| 4 | Migrations applied | npm run db:verify | Exit 0 |
| 5 | MCP tools available | Send tools/list JSON-RPC | Includes mem_ingest, code_search |

---

## 7. Environment Variables Reference

See .env.example for full reference.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| DATABASE_URL | Yes | - | PostgreSQL connection string |
| DATABASE_ADAPTER | Yes | postgresql | Database adapter type |
| PORT | No | 48721 | Server listen port |
| TASK_WORKER_ENABLED | No | true | Enable background task worker |
| CODE_INTEL_ENABLED | No | true | Enable code intelligence module |
| API_KEY | No | - | API key for SEC-01 auth |

---

## 8. Monitoring

### 8.1 Health Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| /health | GET | Basic liveness check |
| /internal/tasks/stats | GET | Task queue metrics |
| /internal/tasks/failed | GET | Dead-lettered tasks |

---

## 9. Troubleshooting

| Issue | Cause | Resolution |
|-------|-------|------------|
| Port 48721 in use | Another instance running | docker compose down or kill process |
| PostgreSQL connection refused | Container not started | docker compose up postgres -d |
| Migration relation already exists | Partial previous run | Safe (IF NOT EXISTS) |
| Worker stuck in claiming | Stale claimed tasks | Restart worker (auto-recovery) |
