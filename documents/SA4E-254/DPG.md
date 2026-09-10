# Deployment Guide (DPG)

## SA4E-254 — Advanced RAG for large documents: Query Router + pre-computed Summary Tree

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-254 |
| Title | Advanced RAG for large documents: Query Router + pre-computed Summary Tree |
| Author | DevOps Agent |
| Version | 1.0 |
| Date | 2026-09-09 |
| Status | Draft |
| Related TDD | TDD-v1.0-SA4E-254 |
| Related FSD | FSD-v1.1-SA4E-254 |
| Related BRD | BRD-v1.0-SA4E-254 |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-09 | DevOps Agent | Initial DPG for SA4E-254 Advanced RAG components |

---

## Sign-Off

| Name | Role | Signature |
|------|------|-----------|
| | Dev Lead | ☐ Approved |
| | QA Lead | ☐ Testing completed |
| | Ops Lead | ☐ Infrastructure ready |

---

## 1. Overview

### 1.1 Feature Summary
Nâng cấp RAG pipeline hiện tại để xử lý query LOCAL và GLOBAL trên tài liệu lớn 100+ trang. Thêm Query Router phân loại intent, Summary Tree pre-computed lúc ingest, Semantic Cache cho query GLOBAL, và Async Queue cho query nặng.

### 1.2 Deployment Scope

| Item | Type | Description |
|------|------|-------------|
| Query Router Service | Modified | Intent classification LOCAL/GLOBAL/RELATIONAL/STRUCTURAL |
| Summary Tree Builder Worker | New | Ingest-time 3-tier summary generation |
| Semantic Cache Service | Modified | Redis cache + invalidation hooks |
| Async Queue Worker | New | BullMQ worker for heavy queries |
| document_summaries table | New | pgvector store with layer index |
| Backend Hono API | Modified | /api/rag/query, /api/rag/ingest |

### 1.3 Target Environments

| Environment | URL | Deploy Order | Approval Required |
|-------------|-----|-------------|-------------------|
| DEV | http://localhost:48721 | 1st | No |
| SIT | http://sit.rag.company | 2nd | No |
| UAT | https://uat.rag.company | 3rd | QA Sign-off |
| PROD | https://api.rag.company | 4th | PM + Business Sign-off |

---

## 2. Prerequisites

### 2.1 Infrastructure

| Requirement | Status | Notes |
|-------------|--------|-------|
| PostgreSQL 15+ pgvector | Ready/Pending | HNSW index per layer |
| Redis 7.x cluster | Ready/Pending | Cache + BullMQ backend |
| Node.js 20 runtime | Ready/Pending | Hono backend |
| Network ACL for DB/Redis | Ready/Pending | Private subnet |

### 2.2 Software Dependencies

| Dependency | Version | Status |
|-----------|---------|--------|
| TypeScript | 5.x | Installed |
| Hono | 4.x | Installed |
| PostgreSQL + pgvector | 15+ | Available |
| Redis | 7.x | Available |
| BullMQ | 5.x | Installed |
| ONNX Runtime | existing | Available |

### 2.3 Access Requirements

| Access | Type | Who Needs It |
|--------|------|-------------|
| SSH to k8s/docker host | Key-based | DevOps |
| Database admin | Credentials | DBA |
| Redis CLI | Credentials | DevOps |
| CI/CD pipeline | Service account | Automated |

### 2.4 Backup Requirements
- [ ] Database backup completed before migration
- [ ] Redis RDB snapshot
- [ ] Application artifact saved

---

## 3. Pre-Deployment Checklist

| # | Item | Responsible | Status |
|---|------|-------------|--------|
| 1 | Code merged to release branch | Developer | ☐ |
| 2 | Unit tests passed >=90% | Developer | ☐ |
| 3 | Integration tests passed | QA | ☐ |
| 4 | SIT/UAT sign-off | QA + BA | ☐ |
| 5 | Database backup completed | DBA | ☐ |
| 6 | Configuration files prepared | DevOps | ☐ |
| 7 | Feature flags configured | Developer | ☐ |
| 8 | Monitoring/alerting configured | DevOps | ☐ |
| 9 | Rollback plan reviewed | Team | ☐ |
| 10 | Deployment window confirmed | PM | ☐ |

---

## 4. Database Migration

### 4.1 Migration Scripts
Create table document_summaries with HNSW indexes per layer.

### 4.2 Execution Steps
```bash
# Backup
pg_dump -h $DB_HOST -U $DB_USER sa4e_db > backup_$(date +%F).sql

# Run migration
psql $DATABASE_URL -f migrations/V1__document_summaries.sql

# Verify
psql $DATABASE_URL -c "\d document_summaries"
```

### 4.3 Verification Queries
```sql
SELECT layer, COUNT(*) FROM document_summaries GROUP BY layer;
SELECT * FROM pg_indexes WHERE tablename='document_summaries';
```

### 4.4 Rollback Scripts
```sql
DROP INDEX IF EXISTS idx_summaries_embedding_chunk;
DROP INDEX IF EXISTS idx_summaries_embedding_chapter;
DROP INDEX IF EXISTS idx_summaries_embedding_document;
DROP TABLE IF EXISTS document_summaries;
```

---

## 5. Application Deployment

### 5.1 CI/CD Pipeline Steps
1. `build`: npm ci, tsc, vitest unit
2. `test`: integration tests, property-based tests
3. `docker-build`: build image `sa4e/rag-advanced:${GIT_SHA}`
4. `scan`: security scan, dependency check
5. `deploy-dev`: push to DEV, run migration, health check
6. `deploy-sit`: manual approval, deploy, smoke test
7. `deploy-uat`: QA approval, deploy
8. `deploy-prod`: PM approval, blue/green deploy

### 5.2 Docker Compose Example
```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: sa4e_db
      POSTGRES_USER: sa4e_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports: ["5432:5432"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  backend:
    build: .
    environment:
      NODE_ENV: production
      PORT: 48721
      DATABASE_URL: postgresql://sa4e_user:${POSTGRES_PASSWORD}@postgres:5432/sa4e_db
      REDIS_URL: redis://redis:6379
      BULLMQ_QUEUE_PREFIX: rag
      RAG_ADVANCED_ROUTER_ENABLED: "true"
      RAG_ADVANCED_ASYNC_ENABLED: "true"
      JWT_SECRET: ${JWT_SECRET}
    depends_on: [postgres, redis]
    ports: ["48721:48721"]

  summary-worker:
    build: .
    command: npm run worker:summary
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://...
      REDIS_URL: redis://redis:6379
    depends_on: [postgres, redis]
```

### 5.3 Deployment Steps
1. Stop existing backend containers
2. Pull new image `sa4e/rag-advanced:v1.0`
3. Update env vars: RAG_ADVANCED_ROUTER_ENABLED, REDIS_URL, JWT_SECRET
4. Start backend, summary-worker, async-worker
5. Run health check `GET /health/rag`
6. Verify `/api/rag/query` returns intent classification

---

## 6. Configuration Changes

### 6.1 New Environment Variables
| Variable | Description | DEV | SIT | UAT | PROD |
|----------|-------------|-----|-----|-----|------|
| RAG_ADVANCED_ROUTER_ENABLED | Enable Query Router | true | true | true | true |
| RAG_ADVANCED_ASYNC_ENABLED | Enable async queue | true | true | true | true |
| REDIS_URL | Redis connection | redis://redis:6379 | ... | ... | ${REDIS_URL} |
| DATABASE_URL | Postgres pgvector | postgresql://... | ... | ... | ${DB_URL} |
| JWT_SECRET | Auth secret | dev-secret | ... | ... | ${JWT_SECRET} |
| CACHE_TTL_GLOBAL | Semantic cache TTL | 86400 | 86400 | 86400 | 86400 |

### 6.2 Feature Flags
| Flag | DEV | SIT | UAT | PROD |
|------|-----|-----|-----|------|
| rag.advanced.router.enabled | true | true | true | true |
| rag.advanced.async.enabled | true | true | true | false — enable after verification |

---

## 7. Post-Deployment Verification

### 7.1 Health Checks
| Check | Endpoint | Expected |
|-------|----------|----------|
| App health | GET /health/rag | 200 UP, DB ok, Redis ok |
| Router | POST /api/rag/query | intent returned |
| Cache | GET /health/redis | connected |

### 7.2 Smoke Tests
1. Ingest 100-page doc → verify 3 layers created
2. Query "tóm tắt toàn bộ tài liệu" → intent GLOBAL, source_layer document, cache_hit false then true
3. Query LOCAL → latency increase <=10%

### 7.3 Log Verification
- INFO Application started
- INFO SummaryTreeBuilder initialized
- INFO QueryRouter classifier loaded

### 7.4 Monitoring
- Metrics: intent_classification_accuracy, cache_hit_ratio, query_latency_seconds
- Dashboard: Grafana RAG Advanced
- Alerts: error rate >5%, latency p95 >2s

---

## 8. Rollback Plan

### 8.1 Rollback Decision Criteria
| Condition | Action |
|-----------|--------|
| Health check fail | Immediate rollback |
| Classification accuracy <90% | Rollback router flag |
| Cache key injection detected | Disable cache |
| Performance degradation >50% | Rollback to previous image |

### 8.2 Rollback Steps
1. Set feature flag rag.advanced.router.enabled=false
2. Stop summary-worker and async-worker
3. Rollback database if migration failed: restore backup
4. Deploy previous image tag
5. Verify health check passes

### 8.3 Rollback Time Estimate
Database rollback: 10 min, Application rollback: 5 min, Verification: 5 min

---

## 9. Monitoring & Observability

Logging structured JSON via Pino.
Metrics via Prometheus:
- intent_classification_accuracy
- cache_hit_ratio
- query_latency_seconds
- queue_length

Health endpoint GET /health/rag checks DB, Redis, Queue.

---

## 10. Security Hardening per SECURITY-REVIEW

Conditions APPROVED-WITH-CONDITIONS:
1. Redis cache key injection mitigation: normalize query, hash with SHA256, sanitize special chars
2. Prompt injection prevention: input validation Zod, LLM prompt sanitization, deny list
3. IDOR protection for doc_id: JWT auth + ownership check per document
4. JWT hardening: strong secret, expiry 15m, refresh token rotation, RS256
5. PII logging policy: mask doc_id, query_text truncated, no PII in logs

Implement middleware jwtAuth, input validation, cache key builder with sanitization.

---

## 11. Release Checklist

- [ ] TDD approved
- [ ] Security conditions remediated
- [ ] Database migration tested in SIT
- [ ] Feature flags configured per environment
- [ ] Monitoring dashboards ready
- [ ] Rollback plan tested
- [ ] DevOps runbook updated
- [ ] Release notes prepared

---

## 12. Appendix

### Contacts
DevOps Lead, DBA, On-Call Dev

Related Tickets: SA4E-254
