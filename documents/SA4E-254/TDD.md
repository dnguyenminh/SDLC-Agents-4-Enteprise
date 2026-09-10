# Technical Design Document (TDD)

## Advanced RAG for large documents: Query Router + pre-computed Summary Tree — SA4E-254: Advanced RAG for large documents: Query Router + pre-computed Summary Tree

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-254 |
| Title | Advanced RAG for large documents: Query Router + pre-computed Summary Tree |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2026-09-09 |
| Status | Draft |
| Related BRD | BRD-v1.0-SA4E-254 |
| Related FSD | FSD-v1.1-SA4E-254 |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | SA Agent – Solution Architect | Create document |
| Peer Reviewer | TBD – Product Owner | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-09 | SA Agent | Initiate document — auto-generated from BRD and FSD |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm the technical design in this TDD |
| | ☐ I agree and confirm the technical design in this TDD |

---

## 1. Introduction

### 1.1 Purpose

Design technical implementation for advanced RAG pipeline supporting large documents 100+ pages with Query Router intent classification, pre-computed Summary Tree at ingest, semantic cache for GLOBAL queries, and async queue for heavy queries.

### 1.2 Scope

Components: Query Router, Summary Tree Builder, Semantic Cache, Async Queue Worker, API Gateway, Vector Store.

### 1.3 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript | 5.x |
| Framework | Hono | 4.x |
| Database | PostgreSQL + pgvector | 15+ |
| Cache / Queue | Redis + BullMQ | 7.x |
| Embeddings | ONNX Runtime 384-dim | existing |

### 1.4 Design Principles

- SOLID, DRY, KISS, Fail-safe, Cost amortization

### 1.5 Constraints

- No embedding model change; chunk 512/128
- LOCAL latency increase ≤10%
- 200 concurrent users
- Code size: 200 lines/file, 20 lines/function

### 1.6 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-254/BRD.md |
| FSD | documents/SA4E-254/FSD.md |

---

## 2. System Architecture

### 2.1 Architecture Overview

API Gateway → Query Router → Semantic Cache → route to RAG Pipeline / Summary Tree / Async Worker. Ingest builds Summary Tree.

![Architecture Diagram](diagrams/architecture.png)

### 2.2 Component Diagram

![Component Diagram](diagrams/component.png)

| Component | Responsibility | Technology |
|-----------|---------------|------------|
| QueryRouter | Intent classification | TypeScript |
| SummaryTreeBuilder | 3-tier summary generation | TypeScript + LLM |
| SemanticCacheService | Cache get/set/invalidate | Redis |
| AsyncQueueWorker | Heavy job processing | BullMQ |
| RagOrchestrator | Routing | TypeScript |
| VectorRepository | pgvector access | pg-promise |

### 2.3 Deployment Architecture

![Deployment Diagram](diagrams/deployment.png)

### 2.4 Communication Patterns

| From | To | Protocol | Pattern |
|------|----|----------|---------|
| API Gateway | QueryRouter | In-process | Sync |
| QueryRouter | SemanticCache | Redis | Sync |
| SummaryTreeBuilder | VectorRepository | SQL | Async |

---

## 3. API Design

### 3.1 API Overview

| # | Endpoint | Method | Description |
|---|----------|--------|-------------|
| 1 | /api/rag/query | POST | Query with routing |
| 2 | /api/rag/ingest | POST | Ingest document |

### 3.2 POST /api/rag/query

**Implements:** UC-01

Request:
```json
{"query_text":"tóm tắt tài liệu","doc_id":"uuid","async":false}
```

Response 200:
```json
{"answer":"...","intent":"GLOBAL","confidence":0.92,"source_layer":"document","cache_hit":true}
```

Response 202:
```json
{"job_id":"uuid","status_url":"/api/rag/query/status/uuid"}
```

Errors: 400 ERR_VALIDATION, 404 ERR_DOC_NOT_FOUND, 503 ERR_QUEUE_FULL

### 3.3 POST /api/rag/ingest

Response 202:
```json
{"doc_id":"uuid","status":"queued","summary_cost_estimate_tokens":45000}
```

---

## 4. Database Design

### 4.1 Schema Overview

![Database Schema](diagrams/db-schema.png)

### 4.2 DDL

```sql
CREATE TABLE document_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id UUID NOT NULL,
    layer ENUM('chunk','chapter','document') NOT NULL,
    parent_id UUID NULL REFERENCES document_summaries(id),
    summary_text TEXT NOT NULL,
    embedding vector(384) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_doc_layer ON document_summaries(doc_id, layer);
CREATE INDEX idx_summaries_embedding_chunk ON document_summaries USING hnsw (embedding vector_cosine_ops) WHERE layer='chunk';
CREATE INDEX idx_summaries_embedding_chapter ON document_summaries USING hnsw (embedding vector_cosine_ops) WHERE layer='chapter';
CREATE INDEX idx_summaries_embedding_document ON document_summaries USING hnsw (embedding vector_cosine_ops) WHERE layer='document';
```

### 4.4 Query Patterns

Document summary retrieval <50ms. Vector search <100ms.

---

## 5. Class / Module Design

### 5.1 Package Structure

```
rag-advanced/
├── controller/RagController.ts
├── service/query-router/IIntentClassifier.ts
├── service/summary-tree/SummaryTreeBuilder.ts
├── service/cache/SemanticCacheService.ts
├── service/queue/AsyncQueryWorker.ts
├── repository/VectorRepository.ts
```

### 5.2 Key Interfaces

```typescript
export interface IIntentClassifier {
  classify(query:string, docId?:string): Promise<{intent:Intent; confidence:number}>
}
```

### 5.3 Design Patterns

Strategy for classifier, Repository for vector, Factory for builder.

### 5.4 Error Handling

ClassificationError → 500 ERR_ROUTER

SOLID enforced, 200 lines/file, 20 lines/function.

---

## 6. Integration Design

pgvector: PostgreSQL, timeout 5s, retry 3.

Redis: timeout 1s, retry 2.

---

## 7. Security Design

### 7.1 Authentication

JWT Bearer token via jwtAuth middleware.

### 7.2 Authorization

User READ query, Admin WRITE ingest.

### 7.3 Data Protection

TLS 1.2+, DB at-rest encryption, logs mask doc_id.

### 7.4 Input Validation

Zod validation for query_text length and UUID.

---

## 8. Performance & Scalability

### 8.1 Caching

SemanticCache TTL 24h GLOBAL, 1h STRUCTURAL. Eviction LRU.

### 8.2 Connection Pooling

PostgreSQL min 5 max 20.

### 8.3 Performance Targets

GLOBAL cache hit <200ms p95, cache miss <2s p95, LOCAL latency +≤10%.

### 8.4 Scalability

Workers 2 per CPU core, max 10 concurrent, queue max 500.

---

## 9. Monitoring & Observability

Logging structured JSON via Pino.

Metrics: intent_classification_accuracy, cache_hit_ratio, query_latency_seconds.

Health: GET /health/rag checks DB, Redis, queue.

---

## 10. Deployment Considerations

Feature flags: rag.advanced.router.enabled, rag.advanced.async.enabled.

Rollback via flags to legacy pipeline.

---

## 11. Appendix

Testability notes: unit tests for classifier, integration tests for summary build, E2E-API tests for query endpoints, performance tests 200 concurrent.

SOLID and size constraints noted.

