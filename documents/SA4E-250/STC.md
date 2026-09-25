# Software Test Cases (STC)

## SA4E-250 — Knowledge graph edges not calculated: entries remain unlinked

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-250 |
| Title | Knowledge graph edges not calculated: entries remain unlinked |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-06 |
| Status | Draft |
| Related STP | STP.md |
| Related FSD | FSD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-06 | QA Agent | Auto-generated from FSD use cases |

---

## Test Case Summary

| Level | Count | Scope |
|-------|-------|-------|
| PBT | 3 | Property based correctness |
| UT | 8 | Unit tests |
| IT | 6 | Integration |
| E2E-API | 12 | API E2E |
| SIT | 5 | Manual exploratory |
| **Total** | **34** | |

---

## 1. Property-Based Tests

### PBT-01: Edge insertion always targets knowledge_graph_edges
| Attribute | Value |
|-----------|-------|
| **ID** | PBT-01 |
| **Priority** | High |
| **Type** | Property |
| **Traces To** | BR-02, BR-07, UC-02 |
| **File** | tests/pbt/edge-table.pbt.test.ts |

**Property:** For all valid ingest payloads, INSERT statement targets `knowledge_graph_edges` never `graph_edges`.

**Test Data:** Random project_id 1-100, content length 10-500 chars.

**Expected:** No rows created in `graph_edges`; rows created in `knowledge_graph_edges`.

---

### PBT-02: source_id and target_id are integers >0
| Attribute | Value |
|-----------|-------|
| **ID** | PBT-02 |
| **Priority** | High |
| **Type** | Property |
| **Traces To** | BR-03, BR-05, BR-08 |
| **File** | tests/pbt/id-type.pbt.test.ts |

**Property:** For all generated node pairs, source_id/target_id are integer >0 and match existing graph_nodes.id.

**Expected:** Validation rejects string IDs; DB FK passes.

---

### PBT-03: Matching score monotonic with content similarity
| Attribute | Value |
|-----------|-------|
| **ID** | PBT-03 |
| **Priority** | Medium |
| **Type** | Property |
| **Traces To** | BR-10, BR-13 |
| **File** | tests/pbt/matching.pbt.test.ts |

**Property:** Increasing content/source/tags overlap increases score.

**Expected:** Score computed using content/source/tags weights 0.5/0.3/0.2, label/summary not used.

---

## 2. Unit Tests

### UT-01: Node upsert returns integer id before edge creation
| Attribute | Value |
|-----------|-------|
| **ID** | UT-01 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | BR-01, UC-01 |
| **File** | backend/src/knowledge/EdgeIngestionService.test.ts |

**Preconditions:** Mock NodeUpsertService returns id 1234.

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call EdgeIngestionService.ingest(payload) | Node upsert called first |
| 2 | Verify edge creation uses returned id | source_id = 1234 integer |

---

### UT-02: Edge creation uses knowledge_graph_edges table name
| Attribute | Value |
|-----------|-------|
| **ID** | UT-02 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | BR-02, BR-07 |
| **File** | backend/src/knowledge/KnowledgeGraphRepository.test.ts |

**Preconditions:** Repository initialized with DB mock.

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call repository.insertEdge(source_id=1,target_id=2) | SQL targets knowledge_graph_edges |
| 2 | Assert no reference to graph_edges | Pass |

---

### UT-03: String doc-id rejected for edge creation
| Attribute | Value |
|-----------|-------|
| **ID** | UT-03 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | BR-08 |
| **File** | backend/src/knowledge/EdgeIngestionService.test.ts |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Pass source_node_id as string "abc" | Validation error 400 VALIDATION_ERROR |
| 2 | Verify error message mentions integer required | Pass |

---

### UT-04: Matching service queries content/source/tags only
| Attribute | Value |
|-----------|-------|
| **ID** | UT-04 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | BR-10, BR-13 |
| **File** | backend/src/knowledge/MatchingService.test.ts |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call findCandidates with node | SQL SELECT includes content,source,tags |
| 2 | Assert SELECT does not reference label/summary for scoring | Pass |

---

### UT-05: Project filter applied to node query
| Attribute | Value |
|-----------|-------|
| **ID** | UT-05 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | BR-11 |
| **File** | backend/src/knowledge/MatchingService.test.ts |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call findCandidates with project_id=123 | WHERE project_id = 123 in SQL |
| 2 | Verify results limited to project | Pass |

---

### UT-06: Pagination uses LIMIT/OFFSET not hard LIMIT 2000
| Attribute | Value |
|-----------|-------|
| **ID** | UT-06 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | BR-12 |
| **File** | backend/src/knowledge/MatchingService.test.ts |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with pageSize=1000 | SQL contains LIMIT ? OFFSET ? |
| 2 | No hardcoded 2000 in query | Pass |

---

### UT-07: Duplicate edge upserts metadata
| Attribute | Value |
|-----------|-------|
| **ID** | UT-07 |
| **Priority** | Medium |
| **Type** | Unit |
| **Requirement** | UC-02 A1 |
| **File** | backend/src/knowledge/KnowledgeGraphRepository.test.ts |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Insert same edge twice | Second insert updates last_seen_at, no duplicate row |
| 2 | Verify unique constraint | Pass |

---

### UT-08: FK violation aborts transaction
| Attribute | Value |
|-----------|-------|
| **ID** | UT-08 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-01 E2 |
| **File** | backend/src/knowledge/EdgeIngestionService.test.ts |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Attempt edge with non-existent node id | Error FK_VIOLATION raised, transaction rolled back |

---

## 3. Integration Tests

### IT-01: Full ingest flow node upsert then edge create
| Attribute | Value |
|-----------|-------|
| **ID** | IT-01 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UC-01 |
| **File** | backend/tests/integration/ingest.it.test.ts |

**Preconditions:** DB seeded with 10 nodes project_id=1.

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/knowledge/ingest with project_id=1 | Returns node_id integer |
| 2 | Query knowledge_graph_edges for source_id=node_id | Edges created |
| 3 | Verify node created before edge | Timestamp order correct |

---

### IT-02: Edge inserted into knowledge_graph_edges with integer FK
| Attribute | Value |
|-----------|-------|
| **ID** | IT-02 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | BR-02, BR-03 |
| **File** | backend/tests/integration/edges.it.test.ts |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/knowledge/graph/edges/create with integer ids | 201 Created |
| 2 | Verify row in knowledge_graph_edges | source_id, target_id are INTEGER |
| 3 | Verify graph_edges table empty | No rows |

---

### IT-03: Matching uses content/source/tags, not label/summary
| Attribute | Value |
|-----------|-------|
| **ID** | IT-03 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | BR-10, BR-13 |
| **File** | backend/tests/integration/matching.it.test.ts |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Seed nodes with same label/summary but different content | Ingest new node similar content |
| 2 | Verify edge created to content-similar node | Edge not created to label-similar only node |

---

### IT-04: Pagination retrieves >2000 nodes
| Attribute | Value |
|-----------|-------|
| **ID** | IT-04 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | BR-12 |
| **File** | backend/tests/integration/pagination.it.test.ts |

**Preconditions:** DB has 2500 nodes project_id=2.

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ingest node project_id=2 | Matching scans all 2500 nodes via pagination |
| 2 | Verify candidates found beyond 2000 | Edge created to node id >2000 |

---

### IT-05: Node creation ordering prevents FK violation
| Attribute | Value |
|-----------|-------|
| **ID** | IT-05 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | BR-01 |
| **File** | backend/tests/integration/ordering.it.test.ts |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mock NodeUpsert delay | Edge creation waits for node_id |
| 2 | Verify no FK violation | Pass |

---

### IT-06: Deadlock retry with exponential backoff
| Attribute | Value |
|-----------|-------|
| **ID** | IT-06 |
| **Priority** | Medium |
| **Type** | Integration |
| **Requirement** | UC-01 E3 |
| **File** | backend/tests/integration/retry.it.test.ts |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Simulate deadlock on INSERT | Retry 3 times with 100ms,200ms,400ms |
| 2 | Verify eventual success | Edge created |

---

## 4. E2E-API Tests

### E2E-API-01: Ingest creates node and edges in knowledge_graph_edges
| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-01 |
| **Priority** | High |
| **Type** | Automated |
| **File** | backend/tests/e2e/ingest.e2e.test.ts |
| **Traces To** | UC-01, BR-01 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/knowledge/ingest with valid payload | 200, node_id returned |
| 2 | GET knowledge_graph_edges where source_id=node_id | edges_created >0 |
| 3 | Verify table is knowledge_graph_edges | Correct |

---

### E2E-API-02: Edge create rejects string IDs
| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-02 |
| **Priority** | High |
| **Type** | Automated |
| **File** | backend/tests/e2e/edges.e2e.test.ts |
| **Traces To** | BR-08 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/knowledge/graph/edges/create with source_node_id="abc" | 400 VALIDATION_ERROR |

---

### E2E-API-03: Edge create enforces integer FK
| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-03 |
| **Priority** | High |
| **Type** | Automated |
| **File** | backend/tests/e2e/edges.e2e.test.ts |
| **Traces To** | BR-03, BR-05 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST with source_node_id=999999 non-existent | 404 NODE_NOT_FOUND |
| 2 | Verify no orphan edge | Pass |

---

### E2E-API-04: Matching uses content/source/tags
| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-04 |
| **Priority** | High |
| **Type** | Automated |
| **File** | backend/tests/e2e/matching.e2e.test.ts |
| **Traces To** | BR-10, BR-13 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ingest node with specific content/tags | Edge created to node with overlapping tags |
| 2 | Verify metadata.match_fields includes content,source,tags | Pass |

---

### E2E-API-05: Project filter applied
| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-05 |
| **Priority** | High |
| **Type** | Automated |
| **File** | backend/tests/e2e/matching.e2e.test.ts |
| **Traces To** | BR-11 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ingest node project_id=10 | Edges only to nodes project_id=10 |
| 2 | Verify no cross-project edges | Pass |

---

### E2E-API-06: Pagination >2000 nodes
| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-06 |
| **Priority** | High |
| **Type** | Automated |
| **File** | backend/tests/e2e/pagination.e2e.test.ts |
| **Traces To** | BR-12 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | DB has 2500 nodes project_id=5 | Ingest new node |
| 2 | Verify matching scans beyond first 2000 | Edge to node with id >2000 created |

---

### E2E-API-07: Node creation ordering enforced
| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-07 |
| **Priority** | High |
| **Type** | Automated |
| **File** | backend/tests/e2e/ingest.e2e.test.ts |
| **Traces To** | BR-01 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST ingest | node_id returned before edges_created count |
| 2 | Verify created_at edge > created_at node | Pass |

---

### E2E-API-08: Duplicate edge upserts
| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-08 |
| **Priority** | Medium |
| **Type** | Automated |
| **File** | backend/tests/e2e/edges.e2e.test.ts |
| **Traces To** | UC-02 A1 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST edge create twice | Second call returns 409 DUPLICATE_EDGE with same edge_id |
| 2 | Verify metadata updated | Pass |

---

### E2E-API-09: Auth scope required
| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-09 |
| **Priority** | Medium |
| **Type** | Automated |
| **File** | backend/tests/e2e/auth.e2e.test.ts |
| **Traces To** | Security |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST without JWT | 401 Unauthorized |
| 2 | POST with wrong scope | 403 Forbidden |

---

### E2E-API-10: Edge creation latency <500ms p95
| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-10 |
| **Priority** | Medium |
| **Type** | Non-Functional |
| **File** | backend/tests/e2e/performance.e2e.test.ts |
| **Traces To** | NFR Performance |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run 100 ingest requests | p95 latency <500ms |
| 2 | Metric knowledge_graph_edges_insert_latency_ms recorded | Pass |

---

### E2E-API-11: No inserts into graph_edges table
| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-11 |
| **Priority** | High |
| **Type** | Automated |
| **File** | backend/tests/e2e/ingest.e2e.test.ts |
| **Traces To** | BR-04 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Perform ingest | graph_edges table remains empty |
| 2 | Verify knowledge_graph_edges has rows | Pass |

---

### E2E-API-12: Matching score threshold skip
| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-12 |
| **Priority** | Medium |
| **Type** | Automated |
| **File** | backend/tests/e2e/matching.e2e.test.ts |
| **Traces To** | UC-01 A3 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ingest node with unrelated content | No edges created |
| 2 | Metric edge_skipped_low_score incremented | Pass |

---

## 5. Manual SIT Tests

### SIT-01: Exploratory pagination UI check
| Field | Value |
|-------|-------|
| **ID** | SIT-01 |
| **Priority** | Medium |
| **Type** | Manual |
| **Requirement** | BR-12 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open knowledge explorer | Nodes list loads with project filter |
| 2 | Scroll beyond 2000 nodes | Data loads without error |

---

### SIT-02: Visual verification of edge table
| Field | Value |
|-------|-------|
| **ID** | SIT-02 |
| **Priority** | Medium |
| **Type** | Manual |
| **Requirement** | BR-02 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Query DB directly | knowledge_graph_edges contains rows, graph_edges empty |

---

### SIT-03: Manual matching review sample
| Field | Value |
|-------|-------|
| **ID** | SIT-03 |
| **Priority** | Medium |
| **Type** | Manual |
| **Requirement** | BR-13 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Review 20 edges created | Matches based on content/source/tags, not label/summary |

---

### SIT-04: Node ordering smoke test
| Field | Value |
|-------|-------|
| **ID** | SIT-04 |
| **Priority** | Medium |
| **Type** | Manual |
| **Requirement** | BR-01 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger ingest via UI | Node appears before edges in logs |

---

### SIT-05: Performance observation
| Field | Value |
|-------|-------|
| **ID** | SIT-05 |
| **Priority** | Low |
| **Type** | Manual |
| **Requirement** | NFR Performance |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ingest large batch | No noticeable UI freeze, latency acceptable |

---

## 6. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-01 Automatic edge creation | FSD 2 | IT-01, E2E-API-01, E2E-API-07, UT-01 | ✅ |
| UC-02 Correct table and ID type | FSD 2 | UT-02, IT-02, E2E-API-03, E2E-API-11 | ✅ |
| UC-03 Improved matching | FSD 2 | UT-04, IT-03, E2E-API-04, PBT-03 | ✅ |
| BR-01 Edge after node upsert | FSD 3 | UT-01, IT-05, E2E-API-07 | ✅ |
| BR-02 Insert into knowledge_graph_edges | FSD 3 | UT-02, IT-02, E2E-API-11 | ✅ |
| BR-03 Integer FK | FSD 3 | PBT-02, UT-03, E2E-API-03 | ✅ |
| BR-04 No graph_edges inserts | FSD 3 | E2E-API-11 | ✅ |
| BR-05 source_id/target_id >0 | FSD 3 | PBT-02 | ✅ |
| BR-07 Edge insert SQL targets knowledge_graph_edges | FSD 3 | UT-02 | ✅ |
| BR-08 Source/target integers not strings | FSD 3 | UT-03, E2E-API-02 | ✅ |
| BR-10 Matching uses content/source/tags | FSD 3 | UT-04, IT-03, E2E-API-04 | ✅ |
| BR-11 Project filter | FSD 3 | UT-05, E2E-API-05 | ✅ |
| BR-12 Pagination not LIMIT 2000 | FSD 3 | UT-06, IT-04, E2E-API-06 | ✅ |
| BR-13 Weight content/source/tags | FSD 3 | PBT-03, UT-04 | ✅ |

**Coverage Summary:**
| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 3 | 3 | 100% |
| Business Rules | 13 | 13 | 100% |
| Acceptance Criteria | 9 | 9 | 100% |
| **Overall** | **25** | **25** | **100%** |

---

## 7. Appendix

### Test Data Setup
Pre-seeded users and nodes CSV files to be created under documents/SA4E-250/testdata/.

### Environment Configuration
SIT environment: http://localhost:3000
DB: SQLite in-memory for unit tests, better-sqlite3 for integration.
