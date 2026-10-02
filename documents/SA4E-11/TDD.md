# Technical Design Document (TDD)

## SA4E-11 Production Infrastructure

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-11 |
| Title | Production Infrastructure Technical Design |
| Author | SA Agent |
| Version | 1.1 |
| Date | 2026-09-28 |
| Status | Draft |
| Related BRD | documents/SA4E-11/BRD.md |
| Related FSD | documents/SA4E-11/FSD.md (v1.1) |

---

## 0. Discrepancy Resolution Summary (FSD v1.1)

| DISC | Status | Resolution Summary |
|------|--------|--------------------|
| DISC-1 | ✅ Resolved | FSD v1.1 updated TA Note to clarify production checkpointer is NEW PostgreSQL table `checkpoints` with `checkpoint_id UUID`, `workflow_id VARCHAR`, `payload JSONB`, `created_at TIMESTAMP`. Verified against `backend/src/knowledge/schema.ts` — Knowledge checkpoints use `thread_id TEXT PRIMARY KEY`, etc. Tables are separate; no reuse. |
| DISC-2 | ⚠️ Documented | Docker image tag mismatch: codebase uses `pgvector/pgvector:pg16` vs FSD target `pgvector/pg16:16`. FSD v1.1 documents decision to retain `pgvector/pg16:16` as standard; DevOps to align compose or update FSD. TDD reflects FSD standard with note. |
| DISC-3 | ✅ Accepted | Health endpoints `/healthz` and `/ready` not implemented in codebase. FSD v1.1 notes implementation pending DEV. TDD design confirms scope for new implementation; no FSD change required. |

---

## 1. Architecture Overview

### 1.1 Purpose & Scope
This TDD translates BRD/FSD SA4E-11 into implementable technical design for production infrastructure:
- Docker Compose orchestration for nginx, PostgreSQL, backend
- nginx reverse proxy with TLS termination and load balancing
- PostgreSQL persistent checkpointer replacing JSON files
- Health check endpoints `/healthz` and `/ready`
- CORS/CSRF protection

Reference: DeerFlow production infra https://github.com/bytedance/deer-flow

### 1.2 High-Level Architecture
The system is deployed via Docker Compose. External traffic enters via nginx reverse proxy which terminates TLS and routes to backend. Backend persists workflow state via PostgreSQL checkpointer. Monitoring system polls health endpoints via nginx.

```mermaid
graph TB
    User[External User] --> Nginx[Nginx Reverse Proxy<br/>TLS Termination]
    Monitoring[Monitoring System] --> Nginx
    Nginx --> Backend[Backend Service<br/>Hono + TypeScript]
    Backend --> Postgres[(PostgreSQL<br/>Checkpoints)]
    Backend --> CORS[CORS/CSRF Middleware]
    DevOps[DevOps Engineer] --> Compose[Docker Compose]
    Compose --> Nginx
    Compose --> Postgres
    Compose --> Backend
```

![Architecture](diagrams/architecture.png)
*[Edit in draw.io](diagrams/architecture.drawio)*

### 1.3 Design Principles
- Twelve-Factor App: config via env vars, stateless backend
- Health-first: liveness/readiness probes for auto-restart
- Security by default: TLS 1.2+, CORS whitelist, CSRF tokens
- Observability: structured logs, health metrics, audit trail

### 1.4 Technology Stack
- Orchestration: Docker Compose v3.9
- Reverse Proxy: nginx:alpine
- Database: pgvector/pg16:16 PostgreSQL
  > **Note (DISC-2):** Existing `backend/docker-compose.yml` uses `pgvector/pgvector:pg16`. FSD v1.1 retains `pgvector/pg16:16` as target standard. DevOps alignment required.
- Runtime: Node.js 20, Hono framework, TypeScript
- Client libraries: `pg` for PostgreSQL, `better-sqlite3` for knowledge DB (unchanged)

---

## 2. Component Design

### 2.1 Docker Compose Orchestration
Service definitions, networks, volumes, restart policies.

**Services:**
- `postgres`: pgvector/pg16:16, healthcheck `pg_isready`
- `backend`: build context `.`, port 48721, depends_on postgres healthy
- `nginx`: nginx:alpine, ports 80/443, depends_on backend

Network: `sa4e-network` bridge
Volumes: `postgres_data`, `code_intel_data`, TLS cert volume

![Component](diagrams/component.png)
*[Edit in draw.io](diagrams/component.drawio)*

### 2.2 nginx Reverse Proxy
- HTTP → HTTPS redirect 301
- TLS 1.2/1.3 with cert/key mounted
- Proxy headers: Host, X-Real-IP, X-Forwarded-Proto
- Static caching optional
- Security headers: HSTS, X-Content-Type-Options, X-Frame-Options

Location blocks:
- `/` → `http://backend:48721`
- `/healthz` → backend health
- `/ready` → backend readiness

### 2.3 PostgreSQL Checkpointer
Replaces JSON file checkpointer with durable table `checkpoints`.
Connection pool: `pg.Pool` max 20, idleTimeout 30s
Retry: 3 attempts exponential backoff

### 2.4 Health Endpoints (DISC-3)
- `GET /healthz`: liveness, returns 200 `{"status":"ok","timestamp",...}`
- `GET /ready`: readiness, checks DB connectivity, returns 200 or 503
> **Implementation Status:** Code search confirms no existing routes for `/healthz` or `/ready`. FSD v1.1 documents implementation pending DEV. TDD design defines new routes to be implemented.

### 2.5 CORS/CSRF Middleware
- CORS origin whitelist via `CORS_ORIGIN` env
- CSRF secret `CSRF_SECRET` min 32 chars
- Tokens required for POST/PUT/DELETE

---

## 3. Module Design

### 3.1 Package Structure
```
backend/
  src/
    server/
      HttpServer.ts
    modules/
      checkpointer/
        PostgresCheckpointer.ts
        CheckpointerRepository.ts
    middleware/
      cors.ts
      csrf.ts
      health.ts
    config/
      env.ts
docker-compose.yml
nginx/
  nginx.conf
  conf.d/
```

### 3.2 Key Interfaces
**CheckpointerRepository**
```ts
interface CheckpointerRepository {
  save(checkpoint: CheckpointInput): Promise<void>;
  get(checkpointId: string): Promise<Checkpoint | null>;
  migrateFromJson(files: string[]): Promise<MigrationResult>;
}
```

**HealthService**
```ts
interface HealthService {
  liveness(): HealthResponse;
  readiness(db: Pool): Promise<ReadinessResponse>;
}
```

### 3.3 Design Patterns
- Repository pattern for data access
- Middleware composition for CORS/CSRF
- Factory for HttpServer module registration
- Event sourcing remains in Knowledge Module (SQLite)

### 3.4 Dependency Injection
ModuleFactory registers modules. Environment validation at startup via Zod schema.

---

## 4. Database Schema

### 4.1 PostgreSQL Checkpointer Table
```sql
CREATE TABLE IF NOT EXISTS checkpoints (
  checkpoint_id UUID PRIMARY KEY,
  workflow_id VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_checkpoints_workflow ON checkpoints(workflow_id);
CREATE INDEX idx_checkpoints_created ON checkpoints(created_at DESC);
```

**Migration from JSON:**
```ts
for file of jsonFiles {
  validate UUID and JSONB
  INSERT ... ON CONFLICT DO NOTHING
}
```

### 4.2 Existing Knowledge Schema Note (DISC-1 Resolved)
Knowledge Module uses SQLite `knowledge.db` with `checkpoints(thread_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, checkpoint TEXT, metadata TEXT, ...)`. Verified in `backend/src/knowledge/schema.ts`. This is separate from production checkpointer PostgreSQL table `checkpoints(checkpoint_id UUID PRIMARY KEY, workflow_id VARCHAR, payload JSONB, created_at TIMESTAMP)`. No reuse, no conflict. FSD v1.1 clarifies new table creation.

### 4.3 Data Model Diagram
![Database Schema](diagrams/db-schema.png)
*[Edit in draw.io](diagrams/db-schema.drawio)*

---

## 5. API Design

### 5.1 Health API
**GET /healthz**
- 200 `{status:"ok",timestamp,version}`
- 500 service error

**GET /ready**
- 200 `{status:"ready",db:"connected"}`
- 503 `{status:"not_ready",reason:"db_connection_failed"}`

### 5.2 Checkpointer API (internal)
No public REST; used via `PostgresCheckpointer` class.
Methods: `save`, `get`, `migrate`

### 5.3 Environment Schema
| Name | Type | Required | Default | Validation |
|------|------|----------|---------|------------|
| NODE_ENV | string | Y | production | enum |
| PORT | integer | Y | 48721 | 1024-65535 |
| DATABASE_URL | string | Y | - | PostgreSQL URI |
| CORS_ORIGIN | string | Y | * | URL pattern |
| CSRF_SECRET | string | Y | - | minLength 32 |
| NGINX_TLS_CERT | string | Y | - | file exists |
| NGINX_TLS_KEY | string | Y | - | file exists |

### 5.4 Error Responses
- 403 CORS violation
- 403 CSRF missing
- 502 Upstream unavailable via nginx
- 503 /ready DB down

---

## 6. Security Design

### 6.1 Authentication/Authorization
Role based config access:
- DevOps Engineer: compose, nginx config
- System Administrator: TLS
- Security Engineer: CORS/CSRF policy

### 6.2 Data Sensitivity
- Checkpoint payload: Internal
- TLS certificates: Confidential

### 6.3 Transport Security
- TLS 1.2+ enforced, HTTP redirect
- HSTS max-age 31536000
- Security headers via nginx

### 6.4 Input Validation
- checkpoint_id UUID format
- payload valid JSONB
- Origin whitelist enforced
- CSRF token validation

### 6.5 Audit Trail
Events logged: service start/stop, health check failure. Retention 90 days.

---

## 7. Deployment Architecture

### 7.1 Docker Compose Manifest
```yaml
services:
  postgres:
    image: pgvector/pg16:16
    environment:
      POSTGRES_DB: sa4e_db
      POSTGRES_USER: sa4e_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL","pg_isready -U sa4e_user -d sa4e_db"]
  backend:
    build: .
    environment:
      DATABASE_URL: postgresql://sa4e_user:${POSTGRES_PASSWORD}@postgres:5432/sa4e_db
    depends_on:
      postgres:
        condition: service_healthy
  nginx:
    image: nginx:alpine
    ports: ["80:80","443:443"]
    depends_on: [backend]
```

### 7.2 Deployment Steps
1. Validate `docker compose config`
2. Start postgres → wait healthy
3. Validate TLS certs
4. Start backend → poll `/ready`
5. Start nginx
6. Health check via monitoring

### 7.3 Rollback
`docker compose down` → restore previous compose version. JSON backup preserved pre-migration.

### 7.4 Observability
- Logs: docker compose logs
- Metrics: health endpoint latency, DB query latency
- Alerts: 5xx >0.1%, uptime <99.5%

![Deployment](diagrams/deployment.png)
*[Edit in draw.io](diagrams/deployment.drawio)*

---

## 8. Implementation Checklist

- [ ] Create `docker-compose.yml` with postgres, backend, nginx services
- [ ] Configure nginx.conf with TLS termination and proxy
- [ ] Implement `PostgresCheckpointer` with `pg` pool
- [ ] Create migration script JSON → PostgreSQL
- [ ] Add `/healthz` and `/ready` endpoints in Hono
- [ ] Implement CORS middleware using `CORS_ORIGIN`
- [ ] Implement CSRF middleware using `CSRF_SECRET`
- [ ] Add healthcheck definitions in compose
- [ ] Add indexes `idx_checkpoints_workflow`, `idx_checkpoints_created`
- [ ] Document environment variables
- [ ] Test `docker compose up -d` startup <30s
- [ ] Validate TLS 1.2+ enforcement
- [ ] Security review CORS whitelist

---

## 9. E2E Test Architecture

### 9.1 Framework
- vitest for API E2E
- Playwright for UI if applicable

### 9.2 Test Structure
- Unit: `backend/src/**/*.test.ts`
- Integration: `backend/tests/integration/*.it.test.ts`
- E2E-API: `backend/tests/e2e/*.e2e.test.ts`

### 9.3 E2E-API Test Design
File: `ProductionInfra.e2e.test.ts`
Cases:
- TC-01 docker compose up
- TC-02 nginx TLS redirect
- TC-03 checkpoint write/read
- TC-04 health check ready when DB down
- TC-05 CORS unauthorized origin

Auth: none for health, jwt for API

---

*End of TDD v1.1*
