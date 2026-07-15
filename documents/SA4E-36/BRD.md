# Business Requirements Document (BRD)

## KB Evolution Memory — SA4E-36: Nâng cấp Memory Backend với Temporal Versioning

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-36 |
| Title | KB Evolution Memory — Temporal Versioning & Outcome Tracking |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-07-15 |
| Status | Draft |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | BA Agent – Business Analyst | Create document |
| Peer Reviewer | TA Agent – Technical Architect | Review FSD enrichment |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-15 | BA Agent | Initiate document — auto-generated from Jira ticket SA4E-36 |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |

---

## 1. Introduction

### 1.1 Scope

Nâng cấp module **Knowledge Base Memory** (`backend/src/modules/memory/`) để giải quyết vấn đề hallucination do knowledge lỗi thời. Hệ thống hiện tại lưu trữ knowledge entries với các trường temporal (`created_at`, `updated_at`, `expires_at`, `confidence`) nhưng **không sử dụng chúng** trong search ranking. Feature này bổ sung:

- **Temporal decay** trong search ranking (exponential half-life 30 ngày)
- **Expire enforcement** (loại bỏ entries hết hạn khỏi search results)
- **Outcome tracking** (ghi nhận success/fail cho mỗi entry được sử dụng)
- **Version chain** (liên kết entries supersede nhau)
- **Stagnation detection** (phát hiện queries lặp lại thất bại)
- **Confidence decay** (giảm confidence định kỳ cho entries cũ không được validate)
- **Epoch boundary** (đánh dấu entries cần verification khi code thay đổi lớn)
- **Predictive scoring** (dự đoán usefulness dựa trên usage patterns)

### 1.2 Out of Scope

- Thay đổi kiến trúc tổng thể backend (Hono, routing, MCP tools)
- Migration sang database khác (vẫn dùng better-sqlite3)
- Thay đổi FTS5 tokenizer hoặc indexing strategy
- UI/Admin Portal cho evolution memory (sẽ là ticket riêng)
- Integration với EvoMap/evolver GEP protocol (xem Solution-1, Solution-2)
- Vector search / ONNX embedding changes

### 1.3 Preliminary Requirement

- Schema hiện tại đã có các trường `created_at`, `updated_at`, `expires_at`, `confidence` — chỉ cần activate logic
- `search_log` table đã tồn tại — dùng cho stagnation detection
- `knowledge_graph_edges` table hỗ trợ `relation` field — dùng cho version chain
- Node.js runtime, better-sqlite3, FTS5 đã sẵn sàng

---

## 2. Business Requirements

### 2.1 High Level Process Map

Khi AI Agent gọi `mem_search(query)`, hệ thống cần:

1. Thực hiện FTS5 match (hiện tại)
2. **[MỚI]** Exclude entries có `expires_at < now`
3. **[MỚI]** Tính temporal decay weight dựa trên tuổi entry
4. **[MỚI]** Factor outcome score (success rate) vào ranking
5. **[MỚI]** Factor confidence score (có thể đã decay) vào ranking
6. Trả về kết quả sorted theo composite score thay vì chỉ FTS rank

Ngoài search, hệ thống cần background jobs:
- Confidence decay job (chạy định kỳ)
- Epoch boundary detection (trigger khi code thay đổi lớn)
- Stagnation detection (phân tích search_log patterns)

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case | Priority | Source Ticket |
|---|-----------------|----------|---------------|
| 1 | As an AI Agent, I want expired KB entries excluded from search results so that I never receive outdated knowledge | MUST HAVE (P0) | SA4E-36 |
| 2 | As an AI Agent, I want search results ranked with temporal decay so that newer knowledge appears higher | MUST HAVE (P0) | SA4E-36 |
| 3 | As an AI Agent, I want to report whether a KB entry was useful so that the system learns which entries work | SHOULD HAVE (P1) | SA4E-36 |
| 4 | As an AI Agent, I want superseded entries hidden/deprioritized so that I don't get conflicting guidance | SHOULD HAVE (P1) | SA4E-36 |
| 5 | As the System, I want to detect repeated failed queries so that stale knowledge areas are flagged | SHOULD HAVE (P1) | SA4E-36 |
| 6 | As the System, I want confidence to decay over time for unvalidated entries so that old untouched knowledge loses ranking weight | COULD HAVE (P2) | SA4E-36 |
| 7 | As the System, I want to mark entries as needs_verification when major code changes occur so that KB stays synchronized with codebase | COULD HAVE (P2) | SA4E-36 |
| 8 | As the System, I want predictive scoring based on usage trajectory so that trending-down entries are proactively deprioritized | NICE TO HAVE (P3) | SA4E-36 |

---

### 2.3 Details of User Stories

---

#### Business Flow

![Business Flow](diagrams/business-flow.png)

**Step 1:** AI Agent gọi `mem_search(query, options)`

**Step 2:** Engine nhận query, thực hiện FTS5 MATCH trên `knowledge_fts`

**Step 3:** Engine filter kết quả: exclude `expires_at < datetime('now')` AND exclude `archived = 1`

**Step 4:** Engine tính composite score cho mỗi entry:
```
composite_score = fts_rank × temporal_weight × confidence × outcome_factor
```
Trong đó:
- `temporal_weight = 0.5^(ageDays / 30)` (half-life 30 ngày)
- `confidence` = giá trị hiện tại trong DB (có thể đã decay)
- `outcome_factor = (successes + 1) / (successes + failures + 2)` (Laplace smoothing)

**Step 5:** Engine sort results theo `composite_score` DESC

**Step 6:** Trả về top N kết quả kèm metadata (score breakdown, age, outcome stats)

**Step 7:** Agent sử dụng knowledge, sau đó report outcome (success/fail) qua `mem_outcome(entry_id, result)`

> **Note:** Background jobs (confidence decay, stagnation detection, epoch boundary) chạy independently, không ảnh hưởng latency của search.

---

#### STORY 1: Expire Enforcement

> As an AI Agent, I want expired KB entries excluded from search results so that I never receive outdated knowledge.

**Requirement Details:**

1. Entries với `expires_at` IS NOT NULL AND `expires_at < datetime('now')` PHẢI bị exclude khỏi tất cả search results
2. Expire check áp dụng cho cả FTS search và filtered search (`findFiltered`)
3. Entries expired vẫn tồn tại trong DB (không bị xóa) — chỉ bị ẩn khỏi search
4. Admin có thể query expired entries riêng (cho audit)

**Acceptance Criteria:**

1. GIVEN entry có `expires_at = '2026-01-01'` WHEN agent gọi `mem_search` vào ngày 2026-07-15 THEN entry KHÔNG xuất hiện trong kết quả
2. GIVEN entry có `expires_at = NULL` THEN entry luôn eligible (không bao giờ expire)
3. GIVEN entry có `expires_at = '2027-01-01'` WHEN agent gọi `mem_search` vào ngày 2026-07-15 THEN entry vẫn xuất hiện bình thường
4. Latency overhead của expire check < 1ms trên dataset 10,000 entries

---

#### STORY 2: Temporal Decay in Search Ranking

> As an AI Agent, I want search results ranked with temporal decay so that newer knowledge appears higher.

**Requirement Details:**

1. Temporal decay dùng exponential half-life formula: `weight = 0.5^(ageDays / halfLifeDays)`
2. Default half-life = 30 ngày (configurable)
3. Age tính từ `updated_at` (không phải `created_at`) — entry được update reset decay
4. Composite score = `(-fts_rank) × temporal_weight × confidence × outcome_factor`
5. Pinned entries (`pinned = 1`) bypass temporal decay (weight luôn = 1.0)

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| halfLifeDays | INTEGER | No | Configurable half-life (default 30) | 30 |
| temporal_weight | REAL (computed) | N/A | Calculated at query time | 0.707 (15 ngày tuổi) |

**Acceptance Criteria:**

1. GIVEN 2 entries match cùng query, FTS rank giống nhau, entry A updated 5 ngày trước, entry B updated 60 ngày trước THEN entry A ranked higher
2. GIVEN entry updated hôm nay THEN temporal_weight ≈ 1.0
3. GIVEN entry updated 30 ngày trước THEN temporal_weight ≈ 0.5
4. GIVEN entry updated 60 ngày trước THEN temporal_weight ≈ 0.25
5. GIVEN entry có `pinned = 1` THEN temporal_weight luôn = 1.0 bất kể tuổi
6. Performance: search latency tăng không quá 5ms so với hiện tại trên dataset 10,000 entries

---

#### STORY 3: Outcome Tracking

> As an AI Agent, I want to report whether a KB entry was useful so that the system learns which entries work.

**Requirement Details:**

1. Mỗi khi agent sử dụng KB entry, agent có thể gọi outcome feedback
2. Outcome được ghi vào table mới `entry_outcomes`
3. Outcome types: `success`, `fail`, `partial`
4. Outcome factor tính bằng Bayesian smoothing: `(successes + 1) / (total + 2)`
5. Entry chưa có outcome nào → outcome_factor = 0.5 (neutral)
6. Outcome factor được include vào composite search score

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| entry_id | INTEGER | Yes | FK to knowledge_entries | 42 |
| outcome | TEXT | Yes | success / fail / partial | "success" |
| agent_name | TEXT | No | Agent reporting outcome | "dev-agent" |
| context | TEXT | No | What task the entry was used for | "implement auth module" |
| created_at | TEXT | Yes | When outcome was recorded | "2026-07-15T10:00:00Z" |

**Acceptance Criteria:**

1. GIVEN agent calls `mem_outcome(entry_id=42, outcome='success')` THEN outcome stored in DB
2. GIVEN entry has 8 successes and 2 failures THEN outcome_factor = (8+1)/(10+2) = 0.75
3. GIVEN entry has 0 successes and 5 failures THEN outcome_factor = (0+1)/(5+2) ≈ 0.14
4. GIVEN entry has no outcomes THEN outcome_factor = 0.5 (neutral prior)
5. Outcome reporting MUST be non-blocking (async, fire-and-forget from agent perspective)

---

#### STORY 4: Version Chain (Supersedes Linking)

> As an AI Agent, I want superseded entries hidden/deprioritized so that I don't get conflicting guidance.

**Requirement Details:**

1. Khi tạo entry mới thay thế entry cũ, link bằng `supersedes_id`
2. Entry bị supersede → giảm ranking weight (×0.1) hoặc exclude hoàn toàn
3. Version chain cho phép trace lịch sử: entry C supersedes B supersedes A
4. Sử dụng `knowledge_graph_edges` table với `relation = 'SUPERSEDES'`

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| supersedes_id | INTEGER | No | Entry mà entry mới thay thế | 41 |

**Acceptance Criteria:**

1. GIVEN entry B created with `supersedes_id = A.id` THEN entry A bị deprioritized trong search
2. GIVEN chain A→B→C (C supersedes B supersedes A) THEN chỉ C xuất hiện ở top results
3. GIVEN entry A bị supersede NHƯNG query explicitly request `include_superseded=true` THEN A vẫn xuất hiện
4. Edge case: circular supersession MUST be detected và rejected

---

#### STORY 5: Stagnation Detection

> As the System, I want to detect repeated failed queries so that stale knowledge areas are flagged.

**Requirement Details:**

1. Analyze `search_log` table: queries có `result_count = 0` lặp lại ≥ 3 lần trong 7 ngày
2. Stagnant queries → flag liên quan entries (matching tags/type) là "stagnant area"
3. Report stagnation patterns qua admin endpoint hoặc alert
4. Stagnant areas gợi ý cần tạo knowledge mới hoặc update entries hiện có

**Acceptance Criteria:**

1. GIVEN query "deploy kubernetes pod" fails 3 lần trong 7 ngày THEN hệ thống detect stagnation
2. GIVEN stagnation detected THEN system logs warning với query pattern và suggestion
3. Stagnation check chạy async (background job), không ảnh hưởng search latency
4. False positive rate < 10% (queries fail vì typo không nên trigger stagnation)

---

#### STORY 6: Confidence Decay

> As the System, I want confidence to decay over time for unvalidated entries so that old untouched knowledge loses ranking weight.

**Requirement Details:**

1. Background job chạy daily (hoặc configurable interval)
2. Entries với `last_accessed_at` > 60 ngày hoặc NULL → giảm confidence 5% mỗi chu kỳ
3. Confidence floor = 0.1 (không bao giờ giảm về 0)
4. Khi entry được access (search hit) → reset confidence decay timer
5. Khi entry nhận outcome "success" → boost confidence +10% (cap tại 1.0)
6. Pinned entries exempt khỏi confidence decay

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| confidence | REAL | Yes | Current confidence score (0.1 - 1.0) | 0.85 |
| last_accessed_at | TEXT | No | Last time entry appeared in search results | "2026-07-10T14:30:00Z" |

**Acceptance Criteria:**

1. GIVEN entry chưa accessed 90 ngày, confidence ban đầu 1.0 THEN sau 1 decay cycle confidence = 0.95
2. GIVEN entry confidence = 0.1 THEN decay KHÔNG giảm thêm (floor)
3. GIVEN entry vừa accessed (search result hit) THEN decay timer reset
4. GIVEN entry `pinned = 1` THEN confidence KHÔNG bị decay
5. Decay job execution time < 5 giây trên 10,000 entries

---

#### STORY 7: Epoch Boundary

> As the System, I want to mark entries as needs_verification when major code changes occur so that KB stays synchronized with codebase.

**Requirement Details:**

1. Khi một code commit lớn xảy ra (ví dụ: > 500 lines changed, major refactor) → trigger epoch boundary
2. Entries liên quan (matching source_ref hoặc tags) → set status `needs_verification`
3. Entries `needs_verification` vẫn xuất hiện trong search nhưng với warning flag
4. Agent hoặc human verify entry → clear flag, reset confidence to 1.0
5. Epoch trigger có thể manual (admin) hoặc automated (git hook integration)

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| needs_verification | INTEGER | No | Flag 0/1 cho entries cần verify | 1 |
| epoch_id | TEXT | No | ID của epoch trigger event | "epoch-2026-07-15-refactor" |

**Acceptance Criteria:**

1. GIVEN epoch triggered for module "auth" THEN entries with tags containing "auth" → needs_verification = 1
2. GIVEN entry needs_verification = 1 THEN search result includes `warning: "needs_verification"` in metadata
3. GIVEN admin calls `mem_verify(entry_id)` THEN needs_verification = 0, confidence = 1.0
4. Epoch trigger MUST NOT modify entry content — chỉ flag status

---

#### STORY 8: Predictive Scoring

> As the System, I want predictive scoring based on usage trajectory so that trending-down entries are proactively deprioritized.

**Requirement Details:**

1. Analyze outcome history + access patterns qua 30-day sliding window
2. Entries với trajectory declining (outcome fail rate tăng, access giảm) → giảm predictive score
3. Entries trending up (outcome success rate tăng, access tăng) → boost predictive score
4. Predictive score range: 0.5 (declining) → 1.0 (neutral) → 1.5 (rising)
5. Predictive score = optional multiplier trong composite score (chỉ khi enabled)

**Acceptance Criteria:**

1. GIVEN entry có 5 successes tuần trước nhưng 3 failures tuần này THEN predictive_score < 1.0
2. GIVEN entry mới tạo, access increasing THEN predictive_score > 1.0
3. GIVEN entry stable usage THEN predictive_score ≈ 1.0
4. Predictive scoring disabled by default — opt-in qua config

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| better-sqlite3 | System | N/A | Database engine — no version change required |
| FTS5 extension | System | N/A | Full-text search — used by current search, no change needed |
| Existing schema fields | System | N/A | `created_at`, `updated_at`, `expires_at`, `confidence` already exist |
| search_log table | System | N/A | Already tracks queries — used for stagnation detection |
| knowledge_graph_edges | System | N/A | Existing table for version chain via `relation` field |
| EvoMap/evolver decayWeight | Reference | N/A | Reference algorithm for exponential half-life decay formula |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility | Source |
|------|-------------|----------------|--------|
| AI Agents (BA, SA, DEV, QA, DevOps) | Agent Team | Primary consumers — use KB search for context | System consumers |
| Developer Team | Maintainers | Implement and maintain the memory module | Implementors |
| End Users | Affected Users | Receive output quality influenced by KB freshness | Indirect stakeholders |
| Technical Architect | TA Agent | Review technical feasibility | Reviewer |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Temporal decay quá aggressive → entries hữu ích bị ẩn | High | Medium | Configurable half-life, pinned entries bypass, monitoring |
| Composite scoring phức tạp → tăng search latency | Medium | Low | SQLite computed columns, pre-calculate weights where possible |
| Outcome tracking spam (agent report nhiều outcomes giả) | Medium | Low | Rate limiting, validation, chỉ accept từ authenticated agents |
| Confidence decay job lock DB → block searches | High | Low | WAL mode đã active, job batch size limit, transaction chunking |
| Version chain cycles (A→B→A) | Medium | Low | Validate no cycles on insert, reject circular supersession |
| Epoch boundary false positives | Low | Medium | Threshold configurable, manual trigger option |

### 5.2 Assumptions

- Database WAL mode đã enabled (hiện tại đã có) — background jobs không block reads
- Agent framework đã hỗ trợ gọi multiple tools per turn (outcome reporting)
- `search_log` table đang được populated actively bởi search operations
- Half-life 30 ngày là hợp lý cho software knowledge domain (có thể tune sau)
- Entries không quá 100,000 total (SQLite performance boundary)

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Search latency overhead < 5ms | Composite scoring computed at query time, must not degrade UX |
| Performance | Confidence decay job < 5s per run | For up to 10,000 entries |
| Performance | Outcome recording < 1ms | Non-blocking, fire-and-forget pattern |
| Scalability | Support up to 100,000 KB entries | SQLite with proper indexes |
| Reliability | Background jobs idempotent | Can re-run without side effects |
| Reliability | Graceful degradation | If decay calculation fails, fall back to FTS-only ranking |
| Data Integrity | No data loss on schema migration | Additive changes only, no destructive migrations |
| Configuration | All parameters configurable | half-life, decay rate, confidence floor via config/env |
| Observability | Log composite score breakdown | For debugging ranking issues |
| Backward Compatibility | Existing `mem_search` API unchanged | New parameters optional, old calls work as before |

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-36 | KB Evolution Memory | To Do | Story | Main ticket |
| SA4E-31 | KB Scope Isolation | Done | Story | Prerequisite (scope filter in search) |
| SA4E-18 | Tool Usage Tracking | Done | Story | Related (usage patterns) |

---

## 8. Appendix

### Use Case Diagram

![Use Case Diagram](diagrams/use-case.png)

### Glossary

| Term | Definition |
|------|------------|
| Temporal Decay | Giảm ranking weight theo thời gian — entry cũ hơn có weight thấp hơn |
| Half-life | Thời gian (ngày) để weight giảm còn 50% — default 30 ngày |
| Outcome | Kết quả sử dụng KB entry: success (hữu ích), fail (gây sai), partial |
| Supersedes | Quan hệ giữa entry mới thay thế entry cũ — entry cũ bị deprioritize |
| Stagnation | Pattern queries lặp lại thất bại — gợi ý knowledge gap |
| Confidence Decay | Giảm confidence score định kỳ cho entries không được access/validate |
| Epoch Boundary | Sự kiện lớn (major code change) trigger re-verification cho related entries |
| Composite Score | Score tổng hợp: FTS rank × temporal × confidence × outcome × predictive |
| Pinned Entry | Entry được ghim — bypass temporal decay và confidence decay |

### Reference Documents

| Document | Link / Location |
|----------|-----------------|
| EvoMap/evolver memoryGraph.js | Reference decay formula |
| Solution-1-Deepseek.md | documents/evolution-memory/Solution-1-Deepseek.md |
| Solution-2-Grok.md | documents/evolution-memory/Solution-2-Grok.md |
| Solution-3-GPT.md | documents/evolution-memory/Soliution-3-GPT.md |
| Current Schema | backend/src/modules/memory/schema/tables.ts |
| Current Search Engine | backend/src/modules/memory/engine/core.ts |

### Composite Score Formula

```
composite_score = normalize(fts_rank) × temporal_weight × confidence × outcome_factor × predictive_score

Where:
  temporal_weight = pinned ? 1.0 : 0.5^(ageDays / halfLifeDays)
  ageDays = (now - updated_at) / 86400000
  confidence = DB field (0.1 ~ 1.0), decayed by background job
  outcome_factor = (successes + 1) / (successes + failures + 2)  [Laplace smoothing]
  predictive_score = trend_multiplier (0.5 ~ 1.5), default 1.0 if disabled
```

### Priority Matrix

| Priority | Features | Effort Estimate | Business Value |
|----------|----------|-----------------|----------------|
| P0 (CRITICAL) | Temporal decay + Expire enforcement | 2-3 days | Eliminates primary hallucination source |
| P1 (HIGH) | Outcome tracking + Version chain + Stagnation | 3-4 days | Enables learning loop, prevents conflicts |
| P2 (MEDIUM) | Confidence decay + Epoch boundary | 2-3 days | Proactive freshness maintenance |
| P3 (LOWER) | Predictive scoring | 2 days | Advanced optimization, nice-to-have |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
