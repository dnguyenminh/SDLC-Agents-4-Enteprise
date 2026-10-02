# Functional Specification Document (FSD)

## SDLC Agents 4 Enterprise — SA4E-11: Production Infrastructure

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-11 |
| Title | Production Infrastructure |
| Author | BA Agent |
| Version | 1.1 |
| Date | 2026-09-28 |
| Status | Draft |
| Related BRD | documents/SA4E-11/BRD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-28 | BA Agent | Initiate document — auto-generated from BRD and Jira tickets |
| 1.1 | 2026-09-28 | BA Agent | Updated per SA discrepancy report: corrected TA Note on knowledge/schema.ts schema mismatch, clarified production checkpointer is new PostgreSQL table; added note on Docker image tag mismatch; documented health endpoints pending implementation |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional behavior of the Production Infrastructure for SDLC Agents 4 Enterprise, covering Docker Compose orchestration, nginx reverse proxy, PostgreSQL checkpointer migration, health checks, and CORS/CSRF protection. It translates business requirements from BRD SA4E-11 into detailed use cases, business rules, data specifications, and error handling for implementation.

### 1.2 Scope

Reference BRD scope: Docker Compose manifest, nginx reverse proxy with TLS termination, PostgreSQL persistent checkpointer replacing JSON, health check endpoints `/healthz` and `/ready`, CORS/CSRF middleware. Technical scope clarified: define functional flows, data fields for checkpointer, business rules for service startup dependencies, health response contracts, security policy enforcement. Out of scope: CI/CD pipeline definition, Kubernetes migration, application business logic changes beyond checkpointer persistence.

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| Checkpointer | Component persisting workflow execution state |
| Reverse Proxy | Intermediary server forwarding requests to backend |
| TLS | Transport Layer Security |
| CORS | Cross-Origin Resource Sharing |
| CSRF | Cross-Site Request Forgery |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-11/BRD.md |
| DeerFlow Production Infra | https://github.com/bytedance/deer-flow |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)
*[Edit in draw.io](diagrams/system-context.drawio)*

The system interacts with DevOps Engineer for deployment, System Administrator for nginx config, Monitoring System for health polling, and External Users via nginx. Internal components: Docker Compose orchestrates nginx, PostgreSQL, Application. Application persists state to PostgreSQL; nginx provides TLS termination and routing; health endpoints expose status for monitoring.

### 2.2 System Architecture

High-level components:
- Docker Compose: service definition, network, volumes, restart policies
- nginx Reverse Proxy: TLS termination, HTTP→HTTPS redirect, static caching, upstream routing
- PostgreSQL: persistent checkpointer storage
- Application: consumes checkpointer interface, exposes `/healthz` and `/ready`
- CORS/CSRF Middleware: API security layer

---

## 3. Functional Requirements

### 3.1 Feature: Docker Compose Orchestration

**Source:** BRD Story 1

#### 3.1.1 Description
Provide docker-compose.yml defining nginx, postgres, app services with networks, volumes, environment injection, and health dependencies.

#### 3.1.2 Use Case

**Use Case ID:** UC-01  
**Actor:** DevOps Engineer  
**Preconditions:** Docker Engine installed, compose file validated  
**Postconditions:** All services running

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | DevOps Engineer | | Executes `docker compose up -d` |
| 2 | | Docker Compose | Validates compose config |
| 3 | | Docker Compose | Starts postgres, nginx, app in dependency order |
| 4 | | Docker Compose | Reports healthy status |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Port conflict | System reports error with suggested alternative ports |
| AF-2 | Service unhealthy | Compose restarts service per restart policy |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Invalid compose file | `docker compose config` fails, error logged |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-01 | Compose file must pass `docker compose config` validation | BRD 1.1 |
| BR-02 | Services must have unique names and restart policy | BRD 1.1 |

#### 3.1.4 Data Specifications

**Input Data:** docker-compose.yml fields: services, networks, volumes, environment

**Output Data:** container IDs, health status

#### 3.1.5 UI Specifications

Not applicable

<!-- TA enrichment -->
#### 3.1.6 API Contract & Config Schema (TA Enriched)
**[Implements: BRD Story 1]**

**Environment Variables Schema**
| Name | Type | Required | Default | Validation | Description |
|------|------|----------|---------|------------|-------------|
| `NODE_ENV` | string | Y | `production` | enum production/development | Runtime mode |
| `PORT` | integer | Y | `48721` | 1024-65535 | Backend listen port |
| `DATABASE_URL` | string | Y | - | PostgreSQL URI regex | Postgres connection |
| `DATABASE_ADAPTER` | string | N | `postgresql` | enum | Adapter selection |
| `CORS_ORIGIN` | string | Y | `*` | URL pattern | Allowed origins whitelist |
| `CSRF_SECRET` | string | Y | - | minLength 32 | Secret for CSRF token |
| `NGINX_TLS_CERT` | string | Y | - | file path exists | TLS certificate path |
| `NGINX_TLS_KEY` | string | Y | - | file path exists | TLS private key path |
| `CHECKPOINT_TABLE` | string | N | `checkpoints` | identifier | DB table name |

**docker-compose.yml Service Contract (excerpt)**
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
      interval: 5s
      timeout: 3s
      retries: 5
  nginx:
    image: nginx:alpine
    depends_on:
      - backend
      - postgres
    ports:
      - "80:80"
      - "443:443"
  backend:
    build: .
    environment:
      DATABASE_URL: postgresql://sa4e_user:${POSTGRES_PASSWORD}@postgres:5432/sa4e_db
    depends_on:
      postgres:
        condition: service_healthy
```

**Validation Rules:**
- Compose file must pass `docker compose config` (BR-01)
- Service names unique (BR-02)
- Environment variables validated at startup, fail-fast on missing required vars

### 3.2 Feature: nginx Reverse Proxy

**Source:** BRD Story 2

#### 3.2.1 Description
nginx acts as reverse proxy with TLS termination, HTTPS redirect, proxy headers.

#### 3.2.2 Use Case

**Use Case ID:** UC-02  
**Actor:** System Administrator  
**Preconditions:** TLS certificates available  
**Postconditions:** External traffic routed securely

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | External User | nginx | Sends HTTP request |
| 2 | | nginx | Redirects to HTTPS |
| 3 | | nginx | Terminates TLS |
| 4 | | nginx | Forwards to Application |
| 5 | Application | nginx | Returns response |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Upstream down | Return 502 with retry |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Invalid certificate | Startup fails fast |

#### 3.2.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-03 | HTTPS enforced, HTTP redirect mandatory | BRD 2 |
| BR-04 | TLS 1.2+ enforced | NFR |

#### 3.2.4 Data Specifications

**Input Data:** Client request, TLS cert

**Output Data:** Proxied response

### 3.3 Feature: PostgreSQL Persistent Checkpointer

**Source:** BRD Story 3

#### 3.3.1 Description
Replace JSON file checkpointer with PostgreSQL table storing workflow state.

#### 3.3.2 Use Case

**Use Case ID:** UC-03  
**Actor:** Developer  
**Preconditions:** PostgreSQL reachable  
**Postconditions:** Checkpoint persisted durably

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Application | PostgreSQL | INSERT checkpoint record |
| 2 | PostgreSQL | | Persists record |
| 3 | Application | PostgreSQL | SELECT checkpoint by ID |

**Alternative Flows:**

| AF-1 | Migration | Run migration script from JSON to DB |

**Exception Flows:**

| EF-1 | DB connection loss | Fallback to in-memory with warning |
| EF-2 | Migration failure | Rollback and alert |

#### 3.3.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-05 | checkpoint_id must be UUID format | BRD 3 |
| BR-06 | payload must be valid JSON | BRD 3 |

#### 3.3.4 Data Specifications

**Entity: checkpoint**

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| checkpoint_id | UUID | Y | BR-05 | Unique identifier |
| workflow_id | VARCHAR | Y | | Workflow reference |
| payload | JSONB | Y | BR-06 | State payload |
| created_at | TIMESTAMP | Y | | Creation time |

### 3.4 Feature: Health Check Endpoints

**Source:** BRD Story 4

#### 3.4.1 Description
Expose `/healthz` and `/ready` for monitoring.

> **Implementation Note — DISC-3:** Code search finds no implementation of `/healthz` or `/ready` in backend source. Functional requirements remain valid per BRD; implementation is pending DEV. TDD should confirm scope before development.

#### 3.4.2 Use Case

**Use Case ID:** UC-04  
**Actor:** Monitoring Engineer  
**Preconditions:** Service running  
**Postconditions:** Health status returned

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Monitoring System | Application | GET /healthz |
| 2 | Application | | Returns {"status":"ok"} 200 |
| 3 | Monitoring System | Application | GET /ready |
| 4 | Application | PostgreSQL | Verify DB connection |
| 5 | Application | Monitoring System | Returns 200 if ready, 503 otherwise |

**Alternative Flows:**

| AF-1 | DB down | /ready returns 503 |

**Exception Flows:**

| EF-1 | Response time >200ms | Log warning |

#### 3.4.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-07 | /healthz returns 200 when service up | BRD 4 |
| BR-08 | /ready requires DB connection | BRD 4 |

<!-- TA enrichment -->
#### 3.4.6 API Contract (TA Enriched)
**[Implements: BRD Story 4]**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/healthz` | GET | Liveness probe — service process running |
| `/ready` | GET | Readiness probe — dependencies ready |

**Endpoint: GET /healthz**
- **Purpose:** Verify application process is alive
- **Headers:** `Accept: application/json`
- **Path Params:** none
- **Query Params:** none
- **Request Body:** none
- **Success Response 200:**
```json
{
  "status": "ok",
  "timestamp": "2026-09-28T12:00:00Z",
  "version": "1.0.0"
}
```
- **Error Response 500:**
```json
{
  "status": "error",
  "message": "Service unavailable"
}
```
- **Auth:** None (internal/monitoring)

**Endpoint: GET /ready**
- **Purpose:** Verify DB connectivity and critical dependencies
- **Success Response 200:** `{"status":"ready","db":"connected"}`
- **Error Response 503:** `{"status":"not_ready","reason":"db_connection_failed"}`
- **Business Rule:** [Implements: BR-08]

**Error Codes:**
| Code | Meaning | Handling |
|------|---------|----------|
| 200 | OK | Return health payload |
| 503 | Service Unavailable | DB down, retry with backoff |
| 500 | Internal Error | Log and alert |

### 3.5 Feature: CORS/CSRF Protection

**Source:** BRD Story 5

#### 3.5.1 Description
Enforce CORS policy and CSRF tokens for state-changing operations.

#### 3.5.2 Use Case

**Use Case ID:** UC-05  
**Actor:** Security Engineer  
**Preconditions:** API configured  
**Postconditions:** Requests validated

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Client | API | Sends request with Origin |
| 2 | API | | Validates Origin against whitelist |
| 3 | API | | For POST/PUT/DELETE validates CSRF token |
| 4 | API | | Processes or rejects |

**Alternative Flows:**

| AF-1 | Unauthorized origin | Return 403 |

**Exception Flows:**

| EF-1 | Missing CSRF token | Return 403 |

#### 3.5.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-09 | Origin whitelist enforced | BRD 5 |
| BR-10 | CSRF token required for state-changing ops | BRD 5 |

---

## 4. Data Model

### 4.1 Entity Relationship Diagram

Logical model focused on checkpoint entity.

### 4.2 Logical Entities

#### Entity: checkpoint

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| checkpoint_id | UUID | Y | BR-05 | Unique identifier |
| workflow_id | VARCHAR | Y | | Workflow reference |
| payload | JSONB | Y | BR-06 | State payload |
| created_at | TIMESTAMP | Y | | Creation time |

**Relationships:** None defined in BRD

<!-- TA enrichment -->
> **TA Note:** Data Model Consistency Review - UPDATED per DISC-1
> - Code Intelligence review of `backend/src/knowledge/schema.ts` shows existing `checkpoints` table for Knowledge SQLite has columns: `thread_id TEXT PRIMARY KEY`, `workspace_id TEXT NOT NULL`, `checkpoint TEXT`, `metadata TEXT`, `channel_versions TEXT`, `pending_writes TEXT`, `version INTEGER`, `updated_at TEXT`. **No** `checkpoint_id`/`workflow_id`/`payload` columns.
> - Therefore the existing Knowledge checkpoints table is **NOT reusable** for production checkpointer.
> - Production checkpointer is a **NEW PostgreSQL table** `checkpoints` with columns `checkpoint_id UUID`, `workflow_id VARCHAR`, `payload JSONB`, `created_at TIMESTAMP`. This table is separate from Knowledge Module SQLite and must be created via migration.
> - Recommend adding index `CREATE INDEX idx_checkpoints_workflow ON checkpoints(workflow_id);` for query performance.
> - Codebase uses `better-sqlite3` for Knowledge DB; Production Infrastructure requires PostgreSQL adapter `pg`.
> - No foreign key constraint defined; acceptable for initial release per out-of-scope clause.

---

## 5. Integration Specifications

### 5.1 External System: PostgreSQL

| Attribute | Value |
|-----------|-------|
| Purpose | Persistent checkpointer storage |
| Direction | Bidirectional |
| Data Format | JSONB |
| Frequency | Real-time |

**Data Exchange:**

| Our Data | External Data | Direction | Business Rule |
|----------|--------------|-----------|---------------|
| checkpoint_id | checkpoint_id | Send/Receive | BR-05 |

<!-- TA enrichment -->
**PostgreSQL Connection Specification (TA Enriched)**
| Attribute | Value |
|-----------|-------|
| Host | `postgres` (Docker service name) |
| Port | 5432 |
| Database | `${POSTGRES_DB}` |
| User | `${POSTGRES_USER}` |
| Password | Env var `POSTGRES_PASSWORD` (never commit) |
| SSL Mode | `disable` (internal network) / `require` for production external |
| Connection Pool | `pg.Pool` with `max: 20`, `idleTimeoutMillis: 30000` |
| Retry Policy | 3 attempts with exponential backoff 100ms → 400ms → 1600ms |
| Timeout | Connection timeout 5s, query timeout 30s |
| Health Check | `pg_isready -U sa4e_user -d sa4e_db` every 5s |

**SQL Schema**
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

**Request/Response Contract**
- **Insert:** `INSERT INTO checkpoints (...) VALUES (...)` → returns `void` or error code
- **Select:** `SELECT payload FROM checkpoints WHERE checkpoint_id=$1` → returns JSONB or null
- **Error Handling:** Connection loss → fallback to in-memory, log WARN, emit metric `db_connection_errors_total`

### 5.2 External System: Monitoring System

| Attribute | Value |
|-----------|-------|
| Purpose | Service availability polling |
| Direction | Inbound |
| Data Format | JSON |
| Frequency | Every 30s |

<!-- TA enrichment -->
### 5.3 External System: nginx Reverse Proxy (TA Enriched)
| Attribute | Value |
|-----------|-------|
| Purpose | TLS termination, routing, static caching |
| Direction | Inbound/Outbound |
| Protocol | HTTP/1.1, HTTP/2, TLS 1.2+ |
| Data Format | HTTP |

**nginx Configuration Contract**
```nginx
server {
  listen 80;
  server_name _;
  return 301 https://$host$request_uri;
}
server {
  listen 443 ssl http2;
  ssl_certificate /etc/nginx/certs/cert.pem;
  ssl_certificate_key /etc/nginx/certs/key.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  location / {
    proxy_pass http://backend:48721;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  location /healthz { proxy_pass http://backend:48721/healthz; }
  location /ready  { proxy_pass http://backend:48721/ready; }
}
```

**Retry & Circuit Breaker:**
- Upstream failure → return 502, retry 3 times with 100ms backoff
- Circuit opens after 5 consecutive failures, half-open after 30s

**Security Headers:**
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`

### 5.4 External System: Docker Compose Service Definitions (TA Enriched)
| Service | Image | Ports | Depends On | Restart |
|---------|-------|-------|------------|---------|
| postgres | pgvector/pg16:16 | 5432 | - | unless-stopped |
| backend | sa4e-backend:latest (build) | 48721 | postgres | unless-stopped |
| nginx | nginx:alpine | 80,443 | backend | unless-stopped |

> **Note on Docker Image Tag — DISC-2:** Actual codebase `backend/docker-compose.yml` uses image `pgvector/pgvector:pg16`. FSD specifies `pgvector/pg16:16` per reference implementation. Decision: Retain `pgvector/pg16:16` in FSD as target standard; DevOps to align compose file to FSD specification or update FSD if org standard differs.

**Health Dependencies:**
- `backend` depends_on `postgres` condition `service_healthy`
- `nginx` depends_on `backend` condition `service_started`

---

## 6. Processing Logic

### 6.1 Deploy Workflow

**Trigger:** DevOps Engineer runs `docker compose up -d`  
**Input:** docker-compose.yml  
**Output:** Running services

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Validate compose config | Fail with error message |
| 2 | Start postgres | Retry with restart policy |
| 3 | Start nginx | Fail fast on TLS error |
| 4 | Start application | Wait for DB ready |
| 5 | Health check | Return 503 if not ready |

**Activity Diagram:** Sequence shown in sequence-deploy

<!-- TA enrichment -->
**Pseudocode for Deploy Workflow (TA Enriched)**
```typescript
// Pseudocode for UC-01 Deploy Production Infrastructure
function deployProduction(composeFile: string): DeployResult {
  // Step 1: Validate compose config
  if (!validateCompose(composeFile)) {
    throw new Error('Invalid compose config');
  }

  // Step 2: Start postgres with health dependency
  const postgres = startService('postgres', { restart: 'unless-stopped' });
  await waitForHealth(postgres, { timeoutMs: 30000 });

  // Step 3: Start nginx with TLS validation
  const tlsValid = validateTlsCert(process.env.NGINX_TLS_CERT, process.env.NGINX_TLS_KEY);
  if (!tlsValid) {
    failFast('Invalid TLS certificate');
  }
  const nginx = startService('nginx', { dependsOn: ['backend'] });

  // Step 4: Start application, wait for DB ready
  const backend = startService('backend', { env: buildEnv(), dependsOn: ['postgres'] });
  const ready = await pollHealth('/ready', { intervalMs: 2000, timeoutMs: 60000 });
  if (!ready) {
    logWarning('Application not ready');
    return { status: 'degraded' };
  }

  return { status: 'healthy', services: [postgres, nginx, backend] };
}
```

**Pseudocode for Checkpointer Migration (TA Enriched)**
```typescript
function migrateJsonToPostgres(jsonFiles: string[]): MigrationResult {
  const db = getPostgresPool();
  for (const file of jsonFiles) {
    try {
      const data = readJson(file);
      // Validate business rule BR-05, BR-06
      if (!isUuid(data.checkpoint_id) || !isValidJson(data.payload)) {
        logError(`Invalid checkpoint in ${file}`);
        continue;
      }
      await db.query(
        'INSERT INTO checkpoints (checkpoint_id, workflow_id, payload, created_at) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [data.checkpoint_id, data.workflow_id, JSON.stringify(data.payload), data.created_at]
      );
    } catch (e) {
      // Rollback on failure
      await db.rollback();
      alertOps(`Migration failed for ${file}: ${e.message}`);
      throw e;
    }
  }
  return { migrated: jsonFiles.length };
}
```

---

## 7. Security Requirements

### 7.1 Authentication & Authorization

Role based access for config changes:
- DevOps Engineer: compose, nginx config
- System Administrator: nginx TLS
- Security Engineer: CORS/CSRF policy

### 7.2 Data Sensitivity Classification

| Data Type | Classification | Business Requirement |
|-----------|----------------|----------------------|
| Checkpoint payload | Internal | Workflow state confidentiality |
| TLS certificates | Confidential | Protect private keys |

### 7.3 Audit Trail

| Event | Logged Fields | Retention | Business Reason |
|-------|--------------|-----------|-----------------|
| Service start/stop | timestamp, service | 90 days | Operational audit |
| Health check failure | timestamp, service | 90 days | Incident investigation |

---

## 8. Non-Functional Requirements

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
| Performance | Container startup <30s | Measured via compose logs |
| Security | TLS 1.2+ enforced | nginx config validation |
| Scalability | Horizontal scaling via replicas | Compose replicas supported |
| Availability | Uptime >99% | Health checks enable auto-restart |

<!-- TA enrichment -->
**TA Quantified NFR Targets (TA Enriched)**
| Category | Metric | Target | Measurement |
|----------|--------|--------|-------------|
| Performance | Container cold start p95 | < 30s | `docker compose logs` timestamps |
| Performance | Health endpoint latency p95 | < 100ms | Prometheus histogram `/healthz` duration |
| Performance | PostgreSQL query latency p95 | < 50ms for checkpoint SELECT/INSERT | `pg_stat_statements` |
| Security | TLS protocol minimum | TLS 1.2+ enforced, TLS 1.0/1.1 rejected | nginx config test + SSL Labs scan |
| Security | CORS preflight latency | < 50ms | Browser dev tools |
| Scalability | Concurrent requests | 1000 RPS per backend replica | k6 load test |
| Scalability | PostgreSQL connection pool | max 20 connections per backend instance | `pg_stat_activity` |
| Availability | Service uptime | > 99.5% monthly | Health check success rate |
| Availability | Mean Time To Recovery (MTTR) | < 2 minutes | Auto-restart via compose |
| Observability | Log retention | 90 days for audit logs | Logrotate config |
| Observability | Error rate threshold | < 0.1% 5xx responses | Alert on breach |

---

## 9. Error Handling

### 9.1 Error Scenarios

| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
| Service start failure | Critical | Service X failed to start. Check logs | docker compose logs exposed |
| Port conflict | Warning | Port Y in use. Use alternative | Suggest alternative ports |
| DB connection loss | Warning | Checkpoint fallback to memory | Log warning, continue |
| CORS violation | Info | Access denied from origin | Return 403 |
| Missing CSRF token | Info | CSRF token missing | Return 403 |

---

## 10. Testing Considerations

### 10.1 Test Scenarios

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-01 | docker compose up | Valid compose file | All services up | High |
| TC-02 | nginx TLS redirect | HTTP request | 301 to HTTPS | High |
| TC-03 | Checkpoint write/read | Valid checkpoint payload | Persisted and retrieved | High |
| TC-04 | Health check ready | DB down | /ready 503 | Medium |
| TC-05 | CORS unauthorized origin | Request from blocked origin | 403 | Medium |

---

## 11. Appendix

### Diagrams

| Diagram | File |
|---------|------|
| System Context | [system-context.png](diagrams/system-context.png) |
| Sequence Deploy | [sequence-deploy.png](diagrams/sequence-deploy.png) |
| State Service | [state-service.png](diagrams/state-service.png) |

### Change Log from BRD

FSD adds detailed use case flows, business rules BR-01 to BR-10, data specifications for checkpoint entity, error handling scenarios, and sequence/state diagrams. API contracts omitted per request for TA enrichment.

<!-- TA enrichment -->
### Open Issues (TA Enriched)
| Issue ID | Description | Owner | Target Date | Severity |
|----------|-------------|-------|-------------|----------|
| OI-01 | PostgreSQL migration script not yet tested with production-sized JSON checkpoint files (>100MB) | DevOps Engineer | 2026-10-05 | High |
| OI-02 | nginx TLS certificate auto-renewal not implemented — manual reload required | System Administrator | 2026-10-12 | Medium |
| OI-03 | CORS whitelist currently allows `*` in dev; production requires explicit origin list | Security Engineer | 2026-10-08 | High |
| OI-04 | Health check endpoint `/ready` does not verify external dependencies beyond DB (e.g., external APIs) | Developer | 2026-10-15 | Medium |
| OI-05 | Docker Compose replicas scaling not validated against PostgreSQL connection pool limits | DevOps Engineer | 2026-10-20 | Medium |
| OI-06 | Checkpointer fallback to in-memory on DB loss may cause data loss — need persistent queue | Developer | 2026-10-25 | High |

**Assumptions to Validate:**
- Application supports PostgreSQL checkpointer interface without code changes beyond config (pending SA review)
- DeerFlow reference nginx config is compatible with Hono backend headers

---

*Generated from BRD SA4E-11 on 2026-09-28*
