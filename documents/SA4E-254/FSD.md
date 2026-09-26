# Functional Specification Document (FSD)

## Advanced RAG for large documents: Query Router + pre-computed Summary Tree — SA4E-254: Advanced RAG for large documents: Query Router + pre-computed Summary Tree

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-254 |
| Title | Advanced RAG for large documents: Query Router + pre-computed Summary Tree |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-09-09 |
| Status | Draft |
| Related BRD | documents/SA4E-254/BRD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-09 | BA Agent | Initiate FSD draft v1.0 from BRD SA4E-254 |

---

## 1. Introduction

### 1.1 Purpose

Tài liệu này mô tả chi tiết chức năng của hệ thống RAG nâng cao cho tài liệu lớn 100+ trang. Mục tiêu là phân loại intent query và sử dụng Summary Tree pre-computed để tránh Map-Reduce tại query-time, đồng thời hỗ trợ semantic cache và xử lý async cho query nặng.

### 1.2 Scope

Phạm vi kỹ thuật kế thừa từ BRD:
- Nâng cấp RAG pipeline hiện tại để xử lý query LOCAL và GLOBAL trên tài liệu lớn
- Query Router phân loại intent; Summary Tree 3 tầng pre-computed tại ingest
- Semantic Cache cho query GLOBAL lặp lại
- Async Queue cho query nặng
Ngoài phạm vi: thay đổi embedding model, fine-tuning LLM, multi-modal, thay đổi chunk size nền.

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| Summary Tree | Cây tóm tắt 3 tầng: chunk -> chapter -> document, pre-computed lúc ingest |
| Query Router | Module phân loại intent query thành LOCAL/GLOBAL/RELATIONAL/STRUCTURAL |
| Semantic Cache | Cache kết quả query GLOBAL dựa trên hash intent + normalized query |
| Async Queue | Hàng đợi BullMQ tương đương cho query nặng |
| Map-Reduce | Tóm tắt on-demand tại query-time |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-254/BRD.md |
| Code Intelligence | .analysis/code-intelligence/ |

---

## 2. System Overview

### 2.1 System Context

System hiện tại gồm RAG pipeline, pgvector store, ONNX embedding service. Advanced RAG thêm Query Router, Summary Tree Builder, Semantic Cache Service, Async Queue Worker.

### 2.2 System Architecture

Các thành phần:
- Ingest Service: chunk 512 tokens overlap 128 -> build Summary Tree
- Vector Store: pgvector với index riêng theo summary_layer
- Query Router: classification model/rule-based
- RAG Pipeline: top-k retrieval, multi-query rerank, hierarchical summary
- Semantic Cache: key-value store
- Async Queue: BullMQ tương đương

---

## 3. Functional Requirements

### 3.1 Feature: Query Router phân loại intent

**Source:** BRD Story 1, Priority MUST HAVE → P0

#### 3.1.1 Description

Router phân loại mỗi query thành 4 nhóm: LOCAL, GLOBAL, RELATIONAL, STRUCTURAL. Định tuyến tới pipeline phù hợp.

#### 3.1.2 Use Case

**Use Case ID:** UC-01
**Actor:** End User
**Preconditions:** Document đã ingest với Summary Tree
**Postconditions:** Query được định tuyến đúng pipeline

**Main Flow:**
| Step | Actor | System | Description |
|------|-------|--------|-------------|
|1|User| |Nhập query|
|2||Router|Phân loại intent|
|3||Router|Định tuyến tới pipeline tương ứng|
|4||System|Trả kết quả|

**Alternative Flows:**
| AF-1 | Confidence thấp | Fallback sang LOCAL với cảnh báo |

**Exception Flows:**
| EF-1 | Router lỗi | Trả lỗi, log |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
|BR-01|Classification accuracy >=90% trên tập test|BRD 2.3 STORY1|
|BR-02|LOCAL query không thay đổi hành vi so với hiện tại|BRD|
|BR-03|GLOBAL query sử dụng document-summary pre-computed, không Map-Reduce tại query|BRD|

#### 3.1.4 Data Specifications

**Input:**
| Field | Type | Required | Validation | Description |
|---|---|---|---|---|
|query_text|string|Y|Non-empty|Nội dung query|
|doc_id|UUID|N|Valid UUID|Nếu query scope cụ thể|

**Output:**
| Field | Type | Description |
|---|---|---|
|intent|enum|LOCAL/GLOBAL/RELATIONAL/STRUCTURAL|
|confidence|float|0-1|

### 3.2 Feature: Summary Tree pre-computed lúc ingest

**Source:** BRD Story 2, Priority MUST HAVE → P0

#### 3.2.1 Description

Tại ingest, build summary phân tầng: chunk -> chapter summary -> document summary. Lưu 3 tầng vào pgvector với index riêng.

**Summary Tree 3 tiers:**
- Tier 1 Chunk Summary: tóm tắt mỗi chunk 512 tokens
- Tier 2 Chapter Summary: tổng hợp chunk summaries trong chapter
- Tier 3 Document Summary: tổng hợp chapter summaries

#### 3.2.2 Processing Logic

**Trigger:** Document upload & ingest
**Steps:**
1. Chunk document 512/128
2. Generate chunk summary via LLM
3. Group chunks to chapters -> generate chapter summary
4. Generate document summary
5. Embed each summary 384-dim ONNX
6. Store to pgvector with summary_layer tag

**Data Specifications:**
| Field | Type | Required | Description |
|---|---|---|---|
|doc_id|UUID|Yes|Identifier tài liệu|
|summary_layer|ENUM|Yes|chunk/chapter/document|
|summary_text|TEXT|Yes|Nội dung summary|
|embedding|VECTOR|Yes|384-dim|

**Acceptance Criteria:**
- Document summary phản ánh toàn bộ nội dung, không chỉ 1.3%
- Truy xuất document summary <1s
- Ingest cost hằng số theo số tài liệu

### 3.3 Feature: Semantic Cache cho query GLOBAL

**Source:** BRD Story 3, Priority SHOULD HAVE → P1

#### 3.3.1 Description

Cache kết quả query GLOBAL theo key = hash(doc_id + query_intent + normalized query). Cache hit trả kết quả không gọi LLM. Invalidate khi tài liệu re-ingest.

**Flow:**
1. Router classify GLOBAL
2. Check semantic cache
3. Hit -> return cached result
4. Miss -> process via summary tree -> store cache

**Business Rules:**
|BR-10|Cache key bao gồm doc_id, intent, normalized query|
|BR-11|Invalidation khi re-ingest|

### 3.4 Feature: Async Queue cho query nặng

**Source:** BRD Story 4, Priority COULD HAVE → P2

#### 3.4.1 Description

Query nặng GLOBAL/STRUCTURAL đẩy vào queue, trả kết quả qua polling/notification.

**Flow:**
1. Router detect nặng
2. Push job vào Async Queue
3. Trả job_id ngay
4. Worker xử lý async
5. Client poll kết quả

**Acceptance Criteria:** 50 query GLOBAL đồng thời không OOM

---

## 4. Data Model

### 4.1 Logical Entities

**Entity: document_summary**
| Attribute | Type | Required | Business Rule |
|-----------|------|----------|---------------|
|doc_id|UUID|Y|Primary key|
|summary_layer|ENUM|Y|chunk/chapter/document|
|summary_text|TEXT|Y||
|embedding|VECTOR 384|Y||
|created_at|TIMESTAMP|Y||

**Relationships:** document_summary → Document 1:N

---

## 5. Integration Specifications

### 5.1 pgvector store
Purpose: Lưu embeddings và summary tree
Direction: Read/Write
Data Format: PostgreSQL + pgvector

### 5.2 ONNX embedding service
Purpose: Tạo embedding 384-dim
Direction: Outbound
Frequency: On-demand ingest/query

---

## 6. Processing Logic

### 6.1 Ingest with Summary Tree Build

**Trigger:** Document upload
**Steps:**
1. Parse document
2. Chunk 512/128
3. Generate summaries tier 1-3
4. Embed & store
**Error Handling:** Lưu lỗi ingest log, retry

### 6.2 Query Processing

**Trigger:** User query
**Steps:**
1. Classify intent
2. Check semantic cache
3. Route to pipeline
4. Retrieve from summary layer phù hợp
5. Return answer

---

## 7. Non-Functional Requirements

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
|Performance|Query GLOBAL <2s khi cache hit|Đọc thẳng document-summary|
|Performance|Query LOCAL latency tăng <=10%|Pipeline không đổi|
|Scalability|Hỗ trợ 200 users đồng thời|Ingest-time cost không phụ thuộc user|
|Availability|Uptime >=99.5%|Không thay đổi hạ tầng chính|

---

## 8. System Interfaces

**Query API:** POST /api/rag/query
Input: query_text, doc_id optional
Output: answer, intent, source_layer, cache_hit

**Ingest API:** POST /api/rag/ingest
Input: document file
Output: doc_id, status

---

## 9. UI/UX Considerations

Business parts Vietnamese. Technical specs English.
UI hiện tại không thay đổi. Thêm indicator:
- Intent classification badge
- Cache hit icon
- Async job status polling UI cho query nặng

---

## 10. Data Flow

Upload -> Ingest Service -> Chunk -> Summary Tree Build -> pgvector
Query -> Router -> Cache Check -> Pipeline -> Summary Layer Retrieval -> Response

---

## 11. Acceptance Criteria Mapping to BRD P0/P1/P2

| BRD Story | Priority | FSD Feature | Acceptance Criteria Mapping |
|-----------|----------|-------------|------------------------------|
|Story 1 Query Router|MUST HAVE P0|3.1|>=90% accuracy; LOCAL unchanged; GLOBAL dùng pre-computed summary|
|Story 2 Summary Tree|MUST HAVE P0|3.2|Document summary full coverage; <1s retrieval; ingest cost constant|
|Story 3 Semantic Cache|SHOULD HAVE P1|3.3|Cache hit for repeat query; invalidation on re-ingest|
|Story 4 Async Queue|COULD HAVE P2|3.4|50 concurrent GLOBAL no OOM|

---

## 12. Appendix

**Change Log from BRD:** FSD v1.0 draft chuyển yêu cầu business sang functional spec chi tiết cho Query Router, Summary Tree 3 tiers, Semantic Cache, Async Queue. Chưa enrich TA.

---
<!-- TA enrichment -->
## 13. Technical Architecture Enrichment

> **TA Note:** Section added by Technical Architect to provide implementation-ready technical specifications, architecture decisions, API contracts, and constraints. Preserves BA content in sections 1-12.

### 13.1 Technology Stack & Constraints

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Backend API | TypeScript + Hono | Existing project stack, lightweight, typed |
| Vector Store | PostgreSQL + pgvector | Already in use for RAG embeddings |
| Embeddings | ONNX Runtime + 384-dim model | BRD constraint: no model change |
| Queue | BullMQ (Redis backend) | Async job processing with priorities |
| Cache | Redis | Semantic cache, low latency |
| Orchestration | Existing LangGraph / Hono services | Aligns with codebase |

**Constraints:**
- No embedding model change
- Chunk size fixed 512/128
- Must preserve existing LOCAL query latency +10%
- 200 concurrent users peak

### 13.2 Architecture Decisions

**AD-01 Query Router Classification**
- Hybrid heuristic + lightweight classifier
- Heuristic rules first: keyword lists for GLOBAL (tóm tắt, tổng hợp, đếm, so sánh, mâu thuẫn), STRUCTURAL (mục lục, chương, phần), RELATIONAL (liên quan, so sánh giữa)
- Lightweight classifier: logistic regression over embedding + TF-IDF features, ~<5ms inference
- Confidence threshold: 0.75
- Fallback: confidence <0.75 → LOCAL with warning flag `low_confidence:true`
- [Implements: BRD STORY 1]

**AD-02 Summary Tree Generation Pipeline**
- Ingest-time pipeline, cost amortized per document
- Tier1 Chunk Summary: LLM prompt compress 512 tokens → ~80 tokens summary
- Tier2 Chapter Summary: aggregate 8-12 chunk summaries → chapter summary
- Tier3 Document Summary: aggregate chapter summaries → document summary
- Cost estimation: tokens_in ≈ 1.5× document tokens for summaries, fixed per doc
- Storage schema `document_summaries`:
  - `doc_id UUID`
  - `layer ENUM('chunk','chapter','document')`
  - `parent_id UUID NULL` — parent summary id for hierarchy
  - `summary_text TEXT`
  - `embedding vector(384)`
  - `metadata JSONB` — {chunk_index, chapter_title, token_count}
  - `created_at TIMESTAMPTZ`
- Indexes: HNSW on embedding per layer, B-tree on doc_id+layer
- [Implements: BRD STORY 2]

**AD-03 Semantic Cache**
- Redis key design: `rag:cache:{doc_id}:{intent}:{hash(normalized_query)}`
- Value: JSON {answer, source_layer, created_at, ttl}
- TTL: 24h for GLOBAL, 1h for STRUCTURAL
- Invalidation hooks: on re-ingest, publish `invalidate:doc:{doc_id}` → delete keys pattern `rag:cache:{doc_id}:*`
- Cache hit target: >=60% for repeated GLOBAL queries
- [Implements: BRD STORY 3]

**AD-04 Async Queue**
- BullMQ queues: `rag:heavy` priority high/medium/low
- Job schema: {jobId, doc_id, query_text, intent, user_id, priority, ttl}
- Worker scaling: 2 workers per CPU core, max 10 concurrent jobs
- Priority: STRUCTURAL > GLOBAL > RELATIONAL
- Result delivery via job status endpoint polling
- [Implements: BRD STORY 4]

### 13.3 API Contracts

#### POST /api/rag/query
```yaml
openapi: 3.0.3
paths:
  /api/rag/query:
    post:
      summary: Query RAG with intent routing
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [query_text]
              properties:
                query_text: {type: string, minLength:1}
                doc_id: {type: string, format: uuid}
                async: {type: boolean, default: false}
      responses:
        '200':
          description: Synchronous response
          content:
            application/json:
              schema:
                type: object
                properties:
                  answer: {type: string}
                  intent: {type: string, enum: [LOCAL,GLOBAL,RELATIONAL,STRUCTURAL]}
                  confidence: {type: number, minimum:0, maximum:1}
                  source_layer: {type: string, enum: [chunk,chapter,document]}
                  cache_hit: {type: boolean}
                  low_confidence: {type: boolean}
        '202':
          description: Accepted for async processing
          content:
            application/json:
              schema:
                type: object
                properties:
                  job_id: {type: string}
                  status_url: {type: string}
        '400': {description: Validation error}
```

#### POST /api/rag/ingest
```yaml
paths:
  /api/rag/ingest:
    post:
      summary: Ingest document and build Summary Tree
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              required: [file]
              properties:
                file: {type: string, format: binary}
                doc_id: {type: string, format: uuid}
      responses:
        '202':
          description: Ingest started
          content:
            application/json:
              schema:
                type: object
                properties:
                  doc_id: {type: string, format: uuid}
                  status: {type: string, enum: [queued,processing]}
                  summary_cost_estimate_tokens: {type: integer}
        '400': {description: Invalid file}
```

### 13.4 Non-Functional Trade-offs

| Trade-off | Decision | Impact |
|-----------|----------|--------|
| Latency vs Cost | Pre-compute summaries at ingest | Ingest cost +30%, query GLOBAL <500ms p95 |
| Cache hit ratio target | 60% for GLOBAL | Reduces LLM calls ~40% |
| DB index strategy | HNSW ef_construction=200, m=16 | Recall >0.95, query <100ms |
| Async queue depth | Max 500 jobs | Prevents OOM, backpressure 429 |

**Performance Targets:**
- Query GLOBAL cache hit <200ms p95
- Query GLOBAL cache miss <2s p95
- Query LOCAL latency increase <=10%
- Concurrent users 200 sustained

### 13.5 Integration Points Detail

**pgvector store**
- Table `document_summaries` with partition by layer
- HNSW indexes per layer, separate for each summary layer
- Migration: add columns parent_id, metadata, create indexes

**Redis Semantic Cache**
- Cluster mode enabled, eviction allkeys-lru
- Hook on ingest complete event → invalidate doc cache

**BullMQ Workers**
- Separate worker pool for summary generation during ingest
- Health check endpoint `/health/queue`

### 13.6 Open Issues

| Issue ID | Description | Owner | Target |
|----------|-------------|-------|--------|
| TA-01 | Validate classifier accuracy >=90% on Vietnamese paraphrase set | TA + QA | 2026-09-20 |
| TA-02 | pgvector HNSW index tuning for 384-dim | DevOps | 2026-09-22 |
| TA-03 | Redis cache invalidation race condition test | DEV | 2026-09-25 |

<!-- TA enrichment end -->
