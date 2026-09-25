# Software Test Cases (STC)

## SA4E-254: Advanced RAG for large documents: Query Router + pre-computed Summary Tree

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-254 |
| Title | Advanced RAG for large documents: Query Router + pre-computed Summary Tree |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-09 |
| Status | Draft |
| Related STP | STP-v1.0-SA4E-254 |
| Related FSD | FSD-v1.1-SA4E-254 |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-09 | QA Agent | Initiate document — auto-generated from FSD use cases and business rules |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | TC-001 to TC-099 | 12 | High |
| Functional — Alternative Flows | TC-100 to TC-199 | 2 | High |
| Functional — Exception/Error Flows | TC-200 to TC-299 | 2 | High |
| Business Rule Validation | TC-300 to TC-399 | 5 | High |
| Boundary & Negative Testing | TC-400 to TC-499 | 3 | Medium |
| UI/UX Testing | TC-500 to TC-599 | 2 | Medium |
| Non-Functional (Performance, Security) | TC-600 to TC-699 | 8 | High |
| Integration Testing | TC-700 to TC-799 | 2 | High |
| Regression Testing | TC-800 to TC-899 | 1 | Medium |

---

## 1. Functional Test Cases — Happy Path

### TC-001: Query Router classifies LOCAL intent correctly

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-01, BR-01, Story 1 |
| **Preconditions** | Document ingested with Summary Tree, test user authenticated |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/rag/query with query_text "What is the definition of X in section 3?" doc_id=UUID | Response returned |
| 2 | Verify intent field | intent = LOCAL |
| 3 | Verify confidence >=0.75 | confidence >=0.75 |

**Test Data:** query_text local sample from corpus
**Postconditions:** Answer returned from top-k RAG pipeline

### TC-002: Query Router classifies GLOBAL intent correctly

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-01, BR-01 |
| **Preconditions** | Document ingested |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/rag/query with query_text "Tóm tắt toàn bộ tài liệu" | Response returned |
| 2 | Verify intent | intent = GLOBAL |
| 3 | Verify source_layer | source_layer = document |

**Test Data:** Vietnamese summary query
**Postconditions:** Answer from document-summary

### TC-003: Query Router classifies RELATIONAL intent correctly

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-01 |
| **Preconditions** | Document ingested |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/rag/query with query_text "So sánh chương 2 và chương 5" | Response returned |
| 2 | Verify intent | intent = RELATIONAL |

**Test Data:** Comparison query
**Postconditions:** Multi-query rerank executed

### TC-004: Query Router classifies STRUCTURAL intent correctly

| Field | Value |
|-------|-------|
| **ID** | TC-004 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-01 |
| **Preconditions** | Document ingested |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/rag/query with query_text "Liệt kê mục lục tài liệu" | Response returned |
| 2 | Verify intent | intent = STRUCTURAL |

**Test Data:** Table of contents query

### TC-005: Classification accuracy >=90% on test corpus

| Field | Value |
|-------|-------|
| **ID** | TC-005 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | BR-01, Acceptance Criteria Story 1 AC1 |
| **Preconditions** | Test corpus of 200 labeled queries ready |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run classifier over corpus | Accuracy computed |
| 2 | Verify metric | Accuracy >=0.90 |

**Test Data:** corpus.csv with expected intent
**Postconditions:** Accuracy logged

### TC-006: Ingest builds tier1 chunk summaries

| Field | Value |
|-------|-------|
| **ID** | TC-006 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | FSD 3.2, Story 2 |
| **Preconditions** | Document file ready |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/rag/ingest with 100+ page document | 202 Accepted, doc_id returned |
| 2 | Query pgvector for layer='chunk' where doc_id=... | Count >0, summary_text not empty, embedding exists |

**Test Data:** sample_100page.pdf
**Postconditions:** Summaries stored

### TC-007: Ingest builds tier2 chapter summaries

| Field | Value |
|-------|-------|
| **ID** | TC-007 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | FSD 3.2 |
| **Preconditions** | Document ingested |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Query pgvector for layer='chapter' | Count >0, parent_id links chunk summaries |

**Test Data:** same doc
**Postconditions:** Hierarchy built

### TC-008: Ingest builds tier3 document summary

| Field | Value |
|-------|-------|
| **ID** | TC-008 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | FSD 3.2 |
| **Preconditions** | Document ingested |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Query pgvector for layer='document' | Exactly 1 row, summary_text covers full document |
| 2 | Verify retrieval time <1s | Response time <1000ms |

**Test Data:** sample doc

### TC-009: Global query returns document-summary without Map-Reduce

| Field | Value |
|-------|-------|
| **ID** | TC-009 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | BR-03, Story 1 AC3 |
| **Preconditions** | Document ingested with summary |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/rag/query GLOBAL query | intent GLOBAL, source_layer document |
| 2 | Check logs/metrics | No Map-Reduce job triggered |
| 3 | Verify answer derived from pre-computed summary | Answer matches summary content |

**Test Data:** "tóm tắt tài liệu"
**Postconditions:** Fast response

### TC-010: Semantic Cache hit for repeat GLOBAL query

| Field | Value |
|-------|-------|
| **ID** | TC-010 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | FSD 3.3, Story 3 AC1 |
| **Preconditions** | Cache empty, document ingested |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/rag/query GLOBAL query first time | cache_hit false |
| 2 | POST same query second time | cache_hit true, response <200ms |

**Test Data:** Same normalized query

### TC-011: Semantic Cache invalidation on re-ingest

| Field | Value |
|-------|-------|
| **ID** | TC-011 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | BR-11, Story 3 AC2 |
| **Preconditions** | Cache hit previously |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/rag/ingest same doc_id with updated file | Ingest completes |
| 2 | POST previous GLOBAL query | cache_hit false, new answer returned |

**Test Data:** Updated document

### TC-012: Async Queue processes heavy GLOBAL query

| Field | Value |
|-------|-------|
| **ID** | TC-012 |
| **Priority** | Medium |
| **Type** | Functional |
| **Requirement** | FSD 3.4, Story 4 |
| **Preconditions** | Async mode enabled |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/rag/query with async=true intent GLOBAL | Response 202 with job_id |
| 2 | GET /api/rag/query/status/{job_id} poll | Status progresses to completed |
| 3 | Verify result returned | Answer delivered |

**Test Data:** Heavy query

---

## 2. Functional Test Cases — Alternative Flows

### TC-101: Low confidence fallback to LOCAL

| Field | Value |
|-------|-------|
| **ID** | TC-101 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-01 AF-1 |
| **Preconditions** | Ambiguous query |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST query with ambiguous text | intent LOCAL, low_confidence true, warning flag |

**Test Data:** Unclear query

### TC-102: Async queue returns 429 when full

| Field | Value |
|-------|-------|
| **ID** | TC-102 |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow |
| **Requirement** | FSD 13.4 |
| **Preconditions** | Queue maxed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Flood queue beyond 500 jobs | Response 429 ERR_QUEUE_FULL |

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-201: Query with invalid UUID returns 400

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | TDD 3.2 validation |
| **Preconditions** | None |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/rag/query with doc_id invalid | 400 ERR_VALIDATION |

### TC-202: Query non-existent doc returns 404

| Field | Value |
|-------|-------|
| **ID** | TC-202 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | TDD 3.2 |
| **Preconditions** | None |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST query with random UUID | 404 ERR_DOC_NOT_FOUND |

---

## 4. Business Rule Validation

### TC-301: BR-01 Classification accuracy >=90%

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-01 |
| **Preconditions** | Test corpus |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Compute accuracy | >=0.90 |

### TC-302: BR-02 LOCAL query behavior unchanged

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-02 |
| **Preconditions** | Baseline results |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Compare LOCAL query latency and answer before/after | Latency increase <=10% |

### TC-303: BR-03 GLOBAL uses pre-computed summary

| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-03 |
| **Preconditions** | Document ingested |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger GLOBAL query | No LLM Map-Reduce call, source_layer document |

### TC-304: BR-10 Cache key composition

| Field | Value |
|-------|-------|
| **ID** | TC-304 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-10 |
| **Preconditions** | Cache enabled |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Inspect Redis key | Pattern rag:cache:{doc_id}:{intent}:{hash} |

### TC-305: BR-11 Cache invalidation

| Field | Value |
|-------|-------|
| **ID** | TC-305 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-11 |
| **Preconditions** | Cache populated |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Re-ingest document | Cache keys for doc_id deleted |

---

## 5. Boundary & Negative Testing

### TC-401: Empty query_text validation

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | API validation |
| **Preconditions** | None |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST query_text empty | 400 validation error |

### TC-402: Very long query

| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | API validation |
| **Preconditions** | None |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST query_text 10k chars | Handled gracefully |

### TC-403: Paraphrase stability

| Field | Value |
|-------|-------|
| **ID** | TC-403 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | BR-01 stability |
| **Preconditions** | None |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send paraphrased queries | Same intent classified |

---

## 6. UI/UX Testing

### TC-501: Intent classification badge visible

| Field | Value |
|-------|-------|
| **ID** | TC-501 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FSD 9 |
| **Preconditions** | UI loaded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Submit query | Badge shows LOCAL/GLOBAL etc. |

### TC-502: Cache hit icon displayed

| Field | Value |
|-------|-------|
| **ID** | TC-502 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FSD 9 |
| **Preconditions** | Cache hit |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Repeat query | Cache hit icon shown |

---

## 7. Non-Functional Testing

### TC-601: JWT authentication required

| Field | Value |
|-------|-------|
| **ID** | TC-601 |
| **Priority** | High |
| **Type** | Non-Functional — Security |
| **Requirement** | TDD 7.1 SECURITY-REVIEW |
| **Preconditions** | None |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/rag/query without Authorization header | 401 Unauthorized |

### TC-602: Role authorization for ingest

| Field | Value |
|-------|-------|
| **ID** | TC-602 |
| **Priority** | High |
| **Type** | Non-Functional — Security |
| **Requirement** | TDD 7.2 |
| **Preconditions** | Reader token |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/rag/ingest with Reader role | 403 Forbidden |

### TC-603: IDOR protection for doc_id

| Field | Value |
|-------|-------|
| **ID** | TC-603 |
| **Priority** | High |
| **Type** | Non-Functional — Security |
| **Requirement** | SECURITY-REVIEW condition 3 |
| **Preconditions** | User A doc, User B token |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Query doc_id not owned | 403 or filtered result |

### TC-604: Redis cache key injection mitigation

| Field | Value |
|-------|-------|
| **ID** | TC-604 |
| **Priority** | High |
| **Type** | Non-Functional — Security |
| **Requirement** | SECURITY-REVIEW condition 1 |
| **Preconditions** | None |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send query with special chars /:* in text | Key sanitized, no injection |

### TC-605: Prompt injection prevention

| Field | Value |
|-------|-------|
| **ID** | TC-605 |
| **Priority** | High |
| **Type** | Non-Functional — Security |
| **Requirement** | SECURITY-REVIEW condition 2 |
| **Preconditions** | None |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send query with prompt injection payload | Sanitized, no system prompt leak |

### TC-606: PII logging masking

| Field | Value |
|-------|-------|
| **ID** | TC-606 |
| **Priority** | Medium |
| **Type** | Non-Functional — Security |
| **Requirement** | SECURITY-REVIEW condition 5 |
| **Preconditions** | Logging enabled |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute query with PII in text | Logs mask doc_id and PII |

### TC-607: JWT hardening

| Field | Value |
|-------|-------|
| **ID** | TC-607 |
| **Priority** | High |
| **Type** | Non-Functional — Security |
| **Requirement** | SECURITY-REVIEW condition 4 |
| **Preconditions** | None |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Use expired / tampered token | 401 rejected |

### TC-608: Performance GLOBAL cache hit <200ms p95

| Field | Value |
|-------|-------|
| **ID** | TC-608 |
| **Priority** | High |
| **Type** | Non-Functional — Performance |
| **Requirement** | NFR |
| **Preconditions** | Warm cache |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load test 100 GLOBAL cache hits | p95 <200ms |

### TC-609: 50 concurrent GLOBAL queries no OOM

| Field | Value |
|-------|-------|
| **ID** | TC-609 |
| **Priority** | High |
| **Type** | Non-Functional — Performance |
| **Requirement** | Story 4 AC |
| **Preconditions** | System idle |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Fire 50 concurrent GLOBAL queries | All complete, memory stable |

---

## 8. Integration Testing

### TC-701: Ingest API creates summaries in pgvector

| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 5.1, TDD 4.2 |
| **Preconditions** | pgvector up |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ingest document | Rows inserted in document_summaries for all layers |

### TC-702: Query API routes via router and returns intent

| Field | Value |
|-------|-------|
| **ID** | TC-702 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | TDD 3.2 |
| **Preconditions** | Services up |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST query | Response includes intent, confidence, source_layer, cache_hit |

---

## 9. Regression Testing

### TC-801: Existing LOCAL RAG pipeline unchanged

| Field | Value |
|-------|-------|
| **ID** | TC-801 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | BR-02 |
| **Preconditions** | Baseline data |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run LOCAL query suite | Same answers as before change |

---

## 10. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Status |
|-------------|--------|------------|--------|
| UC-01 Query Router | FSD 3.1 | TC-001, TC-002, TC-003, TC-004, TC-005, TC-101 | Covered |
| BR-01 Accuracy >=90% | FSD 3.1.3 | TC-005, TC-301 | Covered |
| BR-02 LOCAL unchanged | FSD 3.1.3 | TC-302, TC-801 | Covered |
| BR-03 GLOBAL pre-computed | FSD 3.1.3 | TC-009, TC-303 | Covered |
| Summary Tree tier1/2/3 | FSD 3.2 | TC-006, TC-007, TC-008 | Covered |
| Semantic Cache hit/miss | FSD 3.3 | TC-010, TC-011 | Covered |
| BR-10 Cache key | FSD 3.3 | TC-304 | Covered |
| BR-11 Invalidation | FSD 3.3 | TC-011, TC-305 | Covered |
| Async Queue | FSD 3.4 | TC-012, TC-609 | Covered |
| Security JWT | TDD 7.1 | TC-601, TC-607 | Covered |
| Security IDOR | SECURITY-REVIEW | TC-603 | Covered |
| Security Cache Key Injection | SECURITY-REVIEW | TC-604 | Covered |
| Security Prompt Injection | SECURITY-REVIEW | TC-605 | Covered |
| Security PII Logging | SECURITY-REVIEW | TC-606 | Covered |
| NFR GLOBAL <2s cache hit | FSD 7 | TC-608 | Covered |
| NFR 200 concurrent users | FSD 7 | TC-609 | Covered |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 1 | 1 | 100% |
| Business Rules | 5 | 5 | 100% |
| Acceptance Criteria | 8 | 8 | 100% |
| **Overall** | **14** | **14** | **100%** |

---

## 11. Appendix

### Test Data Setup

- Pre-seed 2 documents: doc-100pages, doc-50pages
- Query corpus: 200 labeled queries
- Users: admin-token, reader-token

