# Business Requirements Document (BRD)

## Smart KB Ingest — SA4E-38: Local LLM Semantic Evaluation

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-38 |
| Title | Smart KB Ingest — Local LLM Semantic Evaluation |
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
| 1.0 | 2026-07-15 | BA Agent | Initiate document — auto-generated from Jira ticket SA4E-38 and approved DECISION |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |

---

## 1. Introduction

### 1.1 Scope

Chuyển đổi cơ chế đánh giá semantic value của user messages trong hook `stream-user-prompt` từ **chat LLM (cloud, tốn token, ô nhiễm context window)** sang **local LLM (Ollama)** thông qua backend MCP tool mới `mem_smart_ingest`.

Hiện tại, hook `stream-user-prompt` dùng `askAgent` để gọi chat LLM inline đánh giá xem message có giá trị business/technical hay không trước khi ingest vào KB. Cách này:
- Tiêu tốn cloud tokens cho mỗi user message
- Ô nhiễm context window của session hiện tại
- Phụ thuộc vào chat LLM availability

Giải pháp mới: Tạo MCP tool `mem_smart_ingest` chạy trên backend, sử dụng local Ollama LLM đã có sẵn (`OllamaAdapter`) để classify message → auto-ingest nếu có value, skip nếu không.

### 1.2 Out of Scope

- Thay đổi Ollama adapter hiện tại (sử dụng nguyên trạng)
- Tạo LLM adapter mới
- Thay đổi KB schema hoặc storage engine
- UI cho việc review/manage "unfiltered" entries
- Training hoặc fine-tune local model
- Thay đổi logic của các MCP tools khác (mem_search, mem_ingest, etc.)

### 1.3 Preliminary Requirement

- Ollama server đang chạy local với model phù hợp (ví dụ: qwen3:1.7b hoặc tương đương)
- Backend Ollama adapter đã hoạt động tại `src/modules/memory/llm/ollama-adapter.ts`
- Hook `stream-user-prompt` đã tồn tại và hoạt động
- MCP tool pattern đã chuẩn hóa (tool-definitions.ts, dispatcher.ts)

---

## 2. Business Requirements

### 2.1 High Level Process Map

Khi user gửi message trong chat session:

1. Hook `stream-user-prompt` được trigger
2. Hook gọi `execute_dynamic_tool` → `mem_smart_ingest` (thay vì inline LLM eval)
3. Backend nhận message, gọi local Ollama LLM để classify
4. LLM trả về "ingest" (kèm summary) hoặc "skip"
5. Nếu "ingest" → tự động lưu entry vào KB với summary
6. Nếu "skip" → không làm gì
7. Nếu Ollama unavailable → fallback: ingest với tag "unfiltered"

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case | Priority | Source Ticket |
|---|-----------------|----------|---------------|
| 1 | As a system, I want to evaluate user messages using local LLM so that I save cloud token costs and avoid context window pollution | MUST HAVE | SA4E-38 |
| 2 | As a system, I want to auto-ingest valuable messages with LLM-generated summaries so that KB captures business/technical decisions | MUST HAVE | SA4E-38 |
| 3 | As a system, I want a fallback strategy when local LLM is unavailable so that no valuable messages are lost | MUST HAVE | SA4E-38 |
| 4 | As a system, I want a batch cleanup job for "unfiltered" entries so that KB quality is maintained after LLM recovery | SHOULD HAVE | SA4E-38 |
| 5 | As a developer, I want the hook updated to call backend tool instead of inline eval so that architecture is clean and consistent | MUST HAVE | SA4E-38 |
| 6 | As a developer, I want unit tests for classify logic and fallback so that correctness is verified | MUST HAVE | SA4E-38 |

---

### 2.3 Details of User Stories

---

#### Business Flow

![Business Flow](diagrams/business-flow.png)

**Step 1:** User submits message trong chat session

**Step 2:** Hook `stream-user-prompt` triggers, gọi `execute_dynamic_tool("mem_smart_ingest", { message: <content> })`

**Step 3:** Backend `mem_smart_ingest` handler nhận message

**Step 4:** Handler kiểm tra Ollama availability via `OllamaAdapter.isAvailable()`

**Step 5a (Ollama available):** Gửi message tới local LLM với evaluation prompt:
> "If I read this entry 3 days later in a different session, would it help me understand a decision, requirement, architecture choice, bug context, or workflow?"

**Step 5b (Ollama unavailable):** Fallback — ingest message với tag "unfiltered", return result

**Step 6:** LLM trả về structured response: `{ verdict: "ingest" | "skip", summary?: string }`

**Step 7a (verdict = "ingest"):** Gọi internal `mem_ingest` với `content = summary`, `tags = "chat,stream,user,smart-ingest"`, `source = "/chat-prompt"`

**Step 7b (verdict = "skip"):** Return `{ action: "skip", reason: "no business/technical value" }`

**Step 8:** Hook nhận response, không cần xử lý thêm (fire-and-forget)

> **Note:** Batch cleanup job chạy riêng biệt, kiểm tra entries tagged "unfiltered" khi Ollama recover.

---

#### STORY 1: Local LLM Semantic Evaluation

> As a system, I want to evaluate user messages using local LLM so that I save cloud token costs and avoid context window pollution.

**Requirement Details:**

1. Tạo MCP tool mới `mem_smart_ingest` trong memory module
2. Tool nhận parameter `message` (string) — nội dung user message cần evaluate
3. Tool gọi `OllamaAdapter.complete()` với system prompt chứa evaluation criteria
4. Evaluation criteria: "If I read this entry 3 days later in a different session, would it help me understand a decision, requirement, architecture choice, bug context, or workflow?"
5. LLM response phải được parse thành structured format: verdict + optional summary
6. Tool PHẢI sử dụng `OllamaAdapter` hiện có, KHÔNG tạo adapter mới
7. Ollama config (baseUrl, model) đọc từ config hiện tại

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| message | string | Yes | User message content to evaluate | "Quyết định dùng Strategy pattern cho transport layer" |

**Acceptance Criteria:**

1. GIVEN user message "Chúng ta quyết định dùng Ollama thay vì OpenAI cho local eval" WHEN `mem_smart_ingest` called THEN LLM returns verdict "ingest" với summary
2. GIVEN user message "ok" WHEN `mem_smart_ingest` called THEN LLM returns verdict "skip"
3. GIVEN Ollama server running WHEN tool called THEN response latency < 3 giây (local inference)
4. GIVEN tool called THEN chat LLM context window KHÔNG bị ảnh hưởng (zero token cost cho cloud)
5. Tool registered trong `tool-definitions.ts` theo pattern hiện có

---

#### STORY 2: Auto-Ingest with LLM Summary

> As a system, I want to auto-ingest valuable messages with LLM-generated summaries so that KB captures business/technical decisions.

**Requirement Details:**

1. Khi LLM verdict = "ingest", tool tự động gọi internal ingest pipeline
2. Content được ingest là LLM-generated summary (max 200 chars), KHÔNG phải raw message
3. Entry metadata: `type = "CONTEXT"`, `source = "/chat-prompt"`, `tags = "chat,stream,user,smart-ingest"`
4. Summary phải capture business/technical essence của message gốc
5. Ingest operation non-blocking — tool return ngay kết quả, ingest chạy async nếu cần

**Acceptance Criteria:**

1. GIVEN verdict "ingest" với summary "Decided: Ollama for local LLM eval to save tokens" THEN KB entry created với content = summary
2. GIVEN entry ingested THEN entry có tags chứa "smart-ingest" (phân biệt với manual ingest)
3. GIVEN entry ingested THEN entry source = "/chat-prompt"
4. Summary PHẢI ≤ 200 characters
5. GIVEN same message ingested twice THEN dedup logic prevent duplicate entries

---

#### STORY 3: Fallback Strategy — Ollama Unavailable

> As a system, I want a fallback strategy when local LLM is unavailable so that no valuable messages are lost.

**Requirement Details:**

1. Trước khi gọi LLM, tool PHẢI check `OllamaAdapter.isAvailable()` (3s timeout)
2. Nếu Ollama unavailable (connection refused, timeout, error):
   - Ingest message nguyên văn (truncate 500 chars) vào KB
   - Tag entry với "unfiltered" (đánh dấu chưa qua LLM evaluation)
   - Return `{ action: "ingest_unfiltered", reason: "llm_unavailable" }`
3. KHÔNG throw error — graceful degradation
4. Log warning "Ollama unavailable, using unfiltered ingest fallback"

**Acceptance Criteria:**

1. GIVEN Ollama server down WHEN `mem_smart_ingest` called THEN message ingested with tag "unfiltered"
2. GIVEN Ollama timeout (>3s) THEN fallback triggers, entry tagged "unfiltered"
3. GIVEN fallback active THEN tool KHÔNG throw exception — returns graceful response
4. GIVEN unfiltered entry THEN entry content = raw message (truncated 500 chars)
5. GIVEN multiple messages during outage THEN all ingested with "unfiltered" tag

---

#### STORY 4: Batch Cleanup Job

> As a system, I want a batch cleanup job for "unfiltered" entries so that KB quality is maintained after LLM recovery.

**Requirement Details:**

1. Background job kiểm tra entries tagged "unfiltered" khi Ollama recover
2. Job re-evaluate mỗi unfiltered entry qua local LLM
3. Nếu verdict "ingest" → update entry: replace content với summary, remove "unfiltered" tag, add "smart-ingest" tag
4. Nếu verdict "skip" → delete entry (hoặc archive)
5. Job trigger: manual (admin command) hoặc automatic (detect Ollama recovery)
6. Batch size: xử lý tối đa 50 entries per run (tránh overwhelm local LLM)

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| batch_size | number | No | Max entries to process per run (default 50) | 50 |
| dry_run | boolean | No | Preview mode — show what would be cleaned | false |

**Acceptance Criteria:**

1. GIVEN 10 entries tagged "unfiltered" AND Ollama available WHEN cleanup job runs THEN all 10 re-evaluated
2. GIVEN entry re-evaluated as "ingest" THEN entry updated with summary, tag changed to "smart-ingest"
3. GIVEN entry re-evaluated as "skip" THEN entry deleted/archived
4. GIVEN batch_size = 5 AND 20 unfiltered entries THEN job processes only 5 in one run
5. GIVEN Ollama unavailable during cleanup THEN job stops gracefully, reports "LLM still unavailable"
6. GIVEN dry_run = true THEN no actual changes, only report what would happen

---

#### STORY 5: Hook Update

> As a developer, I want the hook updated to call backend tool instead of inline eval so that architecture is clean and consistent.

**Requirement Details:**

1. Update `stream-user-prompt.kiro.hook` để gọi `mem_smart_ingest` thay vì inline LLM prompt
2. Hook type chuyển từ `askAgent` (re-invoke AI) sang gọi tool trực tiếp
3. Toàn bộ evaluation logic nằm ở backend — hook chỉ là trigger
4. Hook configuration đơn giản: chỉ forward message content tới tool
5. Backward compatible: nếu tool unavailable, behavior degrade gracefully

**Acceptance Criteria:**

1. GIVEN user submits prompt WHEN hook triggers THEN `mem_smart_ingest` tool called (NOT inline LLM eval)
2. GIVEN hook updated THEN chat LLM context window KHÔNG chứa evaluation prompt/response
3. GIVEN `mem_smart_ingest` tool unavailable THEN hook fails silently (no error to user)
4. Hook file ≤ 20 lines (simple trigger, no logic)

---

#### STORY 6: Unit Tests

> As a developer, I want unit tests for classify logic and fallback so that correctness is verified.

**Requirement Details:**

1. Unit tests cho classify function (mock Ollama response)
2. Unit tests cho fallback logic (mock Ollama unavailable)
3. Unit tests cho batch cleanup job
4. Tests verify structured parsing of LLM response
5. Tests verify tag assignment logic
6. Tests follow project code standards (≤ 200 lines/file, ≤ 20 lines/function)

**Acceptance Criteria:**

1. Test: message với business value → verdict "ingest" + summary extracted
2. Test: message social/confirmatory → verdict "skip"
3. Test: Ollama unavailable → fallback ingest with "unfiltered" tag
4. Test: Ollama returns malformed response → graceful error handling
5. Test: batch cleanup re-evaluates and updates entries correctly
6. Test: batch cleanup với Ollama unavailable → stops gracefully
7. All tests pass trong CI pipeline

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| OllamaAdapter | System | N/A | Existing adapter tại `src/modules/memory/llm/ollama-adapter.ts` — PHẢI dùng, KHÔNG tạo mới |
| Ollama Server | Infrastructure | N/A | Local Ollama instance chạy model qwen3 hoặc tương đương |
| MCP Tool Framework | System | N/A | Tool registration pattern (tool-definitions.ts, dispatcher.ts) |
| Hook System | System | N/A | `.kiro/hooks/stream-user-prompt.kiro.hook` — cần update |
| mem_ingest pipeline | System | N/A | Internal ingest logic đã có — smart_ingest gọi internally |
| LLM Types | System | N/A | `src/modules/memory/llm/types.ts` — LLMAdapter interface |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility | Source |
|------|-------------|----------------|--------|
| AI Agents (all) | Agent Team | Benefit from cleaner context window, no token waste | System consumers |
| Developer Team | Maintainers | Implement and maintain smart ingest module | Implementors |
| Technical Architect | TA Agent | Review technical design and adapter usage | Reviewer |
| End Users | Affected Users | Faster responses (no LLM eval delay in context) | Indirect stakeholders |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Ollama server down/unstable → all messages go "unfiltered" | Medium | Medium | Fallback strategy + batch cleanup job recovers quality |
| Local LLM quality thấp hơn cloud LLM → classify sai | Medium | Medium | Tunable prompt, outcome monitoring, có thể switch model |
| Batch cleanup job chạy quá lâu trên large backlog | Low | Low | Batch size limit (50), incremental processing |
| Message lost nếu cả tool call lẫn fallback đều fail | High | Low | Defensive coding: multiple fallback layers, logging |
| Local LLM latency cao (>3s) → hook timeout | Medium | Low | Async fire-and-forget pattern, timeout config |

### 5.2 Assumptions

- Ollama server chạy stable phần lớn thời gian (>95% uptime)
- Local model (qwen3:1.7b hoặc tương đương) đủ capable để classify message value
- Inference time cho classify task < 3 giây trên hardware hiện tại
- Message volume không quá 100 messages/giờ (single developer workflow)
- Backend MCP server đã handle concurrent requests properly

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Tool response < 3s | Local LLM inference latency acceptable cho fire-and-forget |
| Performance | Fallback response < 100ms | Khi Ollama unavailable, ingest raw ngay lập tức |
| Performance | Batch cleanup < 5 min per 50 entries | Background job không block main operations |
| Reliability | Zero message loss | Fallback ensures every potentially-valuable message captured |
| Reliability | Graceful degradation | Tool never crashes hook — always returns valid response |
| Scalability | Support 100+ messages/hour | Single developer intense session |
| Security | No sensitive data leaked | Messages stay local (Ollama = localhost) |
| Maintainability | File ≤ 200 lines | Code standards compliance |
| Maintainability | Function ≤ 20 lines | Code standards compliance |
| Compatibility | MCP tool pattern | Follows existing tool-definitions.ts + dispatcher.ts architecture |
| Observability | Log classify decisions | For debugging and tuning prompt |

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-38 | Smart KB Ingest — Local LLM Semantic Evaluation | To Do | Story | Main ticket |
| SA4E-36 | KB Evolution Memory — Temporal Versioning | In Progress | Story | Related (KB quality improvement) |
| SA4E-31 | KB Scope Isolation | Done | Story | Prerequisite (scope context for ingest) |

---

## 8. Appendix

### Use Case Diagram

![Use Case Diagram](diagrams/use-case.png)

### Glossary

| Term | Definition |
|------|------------|
| Smart Ingest | Quá trình dùng local LLM đánh giá message value trước khi ingest vào KB |
| Unfiltered Entry | KB entry được ingest mà chưa qua LLM evaluation (do Ollama unavailable) |
| Semantic Evaluation | Đánh giá ý nghĩa business/technical của message bằng LLM |
| Verdict | Kết quả classify từ LLM: "ingest" (có value) hoặc "skip" (không value) |
| Batch Cleanup | Job xử lý lại unfiltered entries khi Ollama recover |
| Context Window Pollution | Việc evaluation prompt/response chiếm chỗ trong chat context, giảm effective context |
| Fire-and-Forget | Pattern gọi tool mà không đợi result ảnh hưởng flow chính |
| OllamaAdapter | Class xử lý communication với Ollama REST API tại backend |

### Architecture Overview

```
Hook (stream-user-prompt)
  │
  ▼ execute_dynamic_tool("mem_smart_ingest", {message})
  │
Backend MCP Server
  │
  ├── mem_smart_ingest handler
  │     ├── Check OllamaAdapter.isAvailable()
  │     │     ├── YES → OllamaAdapter.complete(eval_prompt + message)
  │     │     │         ├── verdict: "ingest" → internal mem_ingest(summary)
  │     │     │         └── verdict: "skip"  → return {action: "skip"}
  │     │     └── NO  → fallback: mem_ingest(raw_message, tags="unfiltered")
  │     └── return result
  │
  └── Batch Cleanup Job (separate trigger)
        ├── Find entries WHERE tags LIKE "%unfiltered%"
        ├── Re-evaluate each via OllamaAdapter
        └── Update/delete based on verdict
```

### Evaluation Prompt Template

```
System: You are a knowledge base filter. Evaluate whether the following user message 
carries business or technical value worth preserving for cross-session reference.

Criteria: "If I read this entry 3 days later in a different session, would it help me 
understand a decision, requirement, architecture choice, bug context, or workflow?"

Respond ONLY in JSON format:
- If valuable: {"verdict": "ingest", "summary": "<max 200 char summary>"}
- If not valuable: {"verdict": "skip"}

Messages that are social, confirmatory ("ok", "thanks"), emotional, repetitive, 
or meta-commentary about the conversation itself are NOT valuable.

User message: {message}
```

### Reference Documents

| Document | Link / Location |
|----------|-----------------|
| Ollama Adapter | backend/src/modules/memory/llm/ollama-adapter.ts |
| LLM Types | backend/src/modules/memory/llm/types.ts |
| Tool Definitions | backend/src/modules/memory/tool-definitions.ts |
| Dispatcher | backend/src/modules/memory/dispatchers/dispatcher.ts |
| Current Hook | .kiro/hooks/stream-user-prompt.kiro.hook |
| DECISION (approved) | SA4E-38 context — approved architecture |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
