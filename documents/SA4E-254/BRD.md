# Business Requirements Document (BRD)

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

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | BA Agent – Business Analyst | Create document |
| Peer Reviewer | TBD – Product Owner | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-09 | BA Agent | Initiate document — auto-generated from Jira ticket SA4E-254 |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |

---

## 1. Introduction

### 1.1 Scope
Nâng cấp RAG pipeline hiện tại để xử lý đúng cả query local (tra cứu chi tiết) và query global (tóm tắt/đếm/so sánh/tìm mâu thuẫn) trên tài liệu lớn 100+ trang. Kiến trúc mới gồm Query Router phân loại intent và Summary Tree pre-computed lúc ingest. Hệ thống phải giữ chi phí LLM không bùng nổ khi 200 users đồng thời.

### 1.2 Out of Scope
* Thay đổi embedding model
* Fine-tuning LLM
* Multi-modal (hình ảnh trong tài liệu)
* Thay đổi chunk size hiện tại ngoài phạm vi ingest-time optimization

### 1.3 Preliminary Requirement
* RAG pipeline hiện tại hoạt động với top-k retrieval, pgvector, ONNX 384-dim embeddings + BM25
* Chunk hiện tại: 512 tokens, overlap 128 tokens
* Lưu trữ pgvector sẵn có
* Không có thay đổi về mô hình embedding

---

## 2. Business Requirements

### 2.1 High Level Process Map
Tài liệu được ingest -> chunk -> build Summary Tree 3 tầng: chunk -> chapter summary -> document summary -> lưu pgvector với index riêng theo tầng. Khi user query, Query Router phân loại intent thành LOCAL / GLOBAL / RELATIONAL / STRUCTURAL -> định tuyến tới pipeline phù hợp: top-k RAG, summary tree, multi-query rerank, hoặc hierarchical summary. Kết quả trả về với semantic cache hỗ trợ cho query GLOBAL lặp lại.

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case / Epic | Priority | Source Ticket |
|---|-------------------------|----------|---------------|
| 1 | As a end user, I want query được định tuyến đúng intent để nhận câu trả lời đầy đủ cho cả tra cứu và tóm tắt toàn bộ tài liệu | MUST HAVE | SA4E-254 |
| 2 | As a system, I want Summary Tree pre-computed lúc ingest để tránh Map-Reduce tại query-time | MUST HAVE | SA4E-254 |
| 3 | As a user, I want kết quả query GLOBAL được cache để truy cập nhanh hơn | SHOULD HAVE | SA4E-254 |
| 4 | As a system admin, I want query nặng được xử lý async để tránh OOM khi burst | COULD HAVE | SA4E-254 |

---

### 2.3 Details of User Stories

#### Business Flow

**Step 1:** Tài liệu được upload và ingest
**Step 2:** Hệ thống chunk tài liệu 512 tokens overlap 128
**Step 3:** Build Summary Tree: chunk -> chapter summary -> document summary
**Step 4:** Lưu 3 tầng vào pgvector với index riêng
**Step 5:** User gửi query
**Step 6:** Query Router phân loại intent thành 4 nhóm
**Step 7:** Định tuyến tới pipeline phù hợp
**Step 8:** Trả kết quả, kiểm tra semantic cache cho GLOBAL

> **Note:** Chi phí Map-Reduce chuyển từ query-time sang ingest-time

#### STORY 1: Query Router phân loại intent

> As a end user, I want query được định tuyến đúng intent để nhận câu trả lời đầy đủ cho cả tra cứu và tóm tắt toàn bộ tài liệu so that tôi không nhận câu trả lời thiếu do chỉ đọc 1.3% tài liệu

**Requirement Details:**
1. Router phân loại mỗi query thành 1 trong 4 nhóm: LOCAL / GLOBAL / RELATIONAL / STRUCTURAL
2. Query LOCAL -> pipeline top-k RAG hiện tại không đổi
3. Query GLOBAL -> đọc document-summary có sẵn
4. Query RELATIONAL -> multi-query + rerank
5. Query STRUCTURAL -> hierarchical summary tree

**Acceptance Criteria:**
1. >=90% query được định tuyến đúng nhóm trên tập test
2. Query LOCAL không thay đổi hành vi so với hiện tại
3. Query GLOBAL trả lời dựa trên document-summary pre-computed, không chạy Map-Reduce lúc query

**Validation Rules:**
- Intent classification phải ổn định với paraphrase

**Error Handling:**
- Phân loại không chắc chắn -> fallback sang LOCAL với cảnh báo

#### STORY 2: Summary Tree pre-computed lúc ingest

> As a system, I want Summary Tree pre-computed lúc ingest để tránh Map-Reduce tại query-time so that chi phí LLM không bùng nổ với 200 users đồng thời

**Requirement Details:**
1. Khi ingest tài liệu, hệ thống build summary phân tầng: chunk -> chapter summary -> document summary
2. Cả 3 tầng được lưu vào pgvector với index riêng theo tầng
3. Query "tóm tắt toàn bộ tài liệu" đọc thẳng document-summary có sẵn, KHÔNG chạy Map-Reduce lúc query
4. Chi phí Map-Reduce chuyển từ query-time sang ingest-time

**Data Fields:**
| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| doc_id | UUID | Yes | Identifier tài liệu | 550e8400-e29b-41d4-a716-446655440000 |
| summary_layer | ENUM | Yes | chunk/chapter/document | document |
| summary_text | TEXT | Yes | Nội dung summary | "Tài liệu nói về..." |
| embedding | VECTOR | Yes | 384-dim ONNX | [...] |

**Acceptance Criteria:**
1. Tóm tắt tài liệu 100+ trang phản ánh đúng nội dung toàn bộ tài liệu, không chỉ 1.3%
2. Document summary có sẵn trong <1s truy xuất
3. Ingest-time cost là hằng số theo số tài liệu, không theo số user query

**Validation Rules:**
- Summary phải cover toàn bộ chunk cha

#### STORY 3: Semantic Cache cho query GLOBAL

> As a user, I want kết quả query GLOBAL được cache để truy cập nhanh hơn so that tôi không phải chờ LLM mỗi lần hỏi lại

**Requirement Details:**
1. Cache kết quả query GLOBAL theo key = hash(doc_id + query_intent + normalized query)
2. Cache hit trả kết quả mà không gọi lại LLM
3. Cache invalidation khi tài liệu được re-ingest

**Acceptance Criteria:**
1. 2 user hỏi cùng "tóm tắt tài liệu X" -> user thứ 2 nhận cache hit
2. Re-ingest tài liệu -> cache cho doc_id đó bị xóa

#### STORY 4: Async Queue cho query nặng

> As a system admin, I want query nặng được xử lý async để tránh OOM khi burst so that server ổn định với 50 query đồng thời

**Requirement Details:**
1. Query nặng GLOBAL/STRUCTURAL đẩy vào queue BullMQ tương đương
2. Trả kết quả qua polling/notification, không block realtime

**Acceptance Criteria:**
1. Gửi 50 query GLOBAL đồng thời -> server không OOM, tất cả hoàn thành

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| pgvector store | System | N/A | Lưu trữ embeddings và summary tree |
| ONNX embedding service | System | N/A | 384-dim embeddings hiện tại |
| RAG pipeline hiện tại | System | N/A | Top-k retrieval pipeline |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility | Source |
|------|-------------|----------------|--------|
| Reporter | Duc Nguyen Minh | Yêu cầu nâng cấp RAG | SA4E-254 |
| BA | BA Agent | Viết BRD | SA4E-254 |
| Developer | TBD | Triển khai Query Router & Summary Tree | SA4E-254 |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Router phân loại sai intent | High | Medium | Tập test lớn, fallback sang LOCAL, đo accuracy >=90% |
| Summary tree chất lượng kém | High | Medium | Đánh giá chất lượng summary trên sample tài liệu |
| Tăng dung lượng pgvector | Medium | High | Index riêng theo tầng, nén embedding nếu cần |

### 5.2 Assumptions
- Tài liệu ingest là text thuần túy
- Chi phí ingest chấp nhận được do là hằng số theo số tài liệu
- 200 users đồng thời là kịch bản peak

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Query GLOBAL trả kết quả trong <2s khi cache hit | Đọc thẳng document-summary |
| Performance | Query LOCAL không tăng latency >10% so với hiện tại | Pipeline không đổi |
| Scalability | Hỗ trợ 200 users đồng thời | Ingest-time cost không phụ thuộc user |
| Availability | System uptime >=99.5% | Không thay đổi hạ tầng chính |

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-254 | Advanced RAG for large documents: Query Router + pre-computed Summary Tree | To Do | Story | Main ticket |

---

## 8. Appendix

### Glossary

| Term | Definition |
|------|------------|
| Summary Tree | Cây tóm tắt 3 tầng: chunk -> chapter -> document, pre-computed lúc ingest |
| Query Router | Module phân loại intent query thành LOCAL/GLOBAL/RELATIONAL/STRUCTURAL |
| Map-Reduce | Kỹ thuật tóm tắt on-demand tại query-time, chuyển sang ingest-time |

### Reference Documents
| Document | Link / Location |
|----------|-----------------|
| Jira Ticket SA4E-254 | https://jiraassist.atlassian.net/browse/SA4E-254 |
