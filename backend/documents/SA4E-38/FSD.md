# Functional Specification Document (FSD)

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
| Related BRD | BRD-v1-SA4E-38.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-15 | BA Agent | Initiate document — auto-generated from BRD and Jira ticket SA4E-38 |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies functional behavior of the `mem_smart_ingest` MCP tool — a backend service that evaluates user messages via local Ollama LLM to determine KB ingest worthiness, replacing the current inline chat LLM evaluation in the `stream-user-prompt` hook.

### 1.2 Scope

- New MCP tool `mem_smart_ingest` registered in memory module
- Hook `stream-user-prompt` updated to call backend tool
- Fallback strategy when Ollama unavailable
- Batch cleanup job for "unfiltered" entries
- Unit tests for classify and fallback logic

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| Smart Ingest | Process using local LLM to evaluate message value before KB ingest |
| Unfiltered Entry | KB entry ingested without LLM evaluation (Ollama unavailable) |
| Verdict | LLM classification result: "ingest" or "skip" |
| Batch Cleanup | Background job re-evaluating unfiltered entries after LLM recovery |
| OllamaAdapter | Backend class communicating with Ollama REST API |
| Fire-and-Forget | Pattern where hook calls tool without blocking on result |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-SA4E-38.docx |
| OllamaAdapter Source | backend/src/modules/memory/llm/ollama-adapter.ts |
| LLM Types | backend/src/modules/memory/llm/types.ts |
| Tool Definitions | backend/src/modules/memory/tool-definitions.ts |
| Dispatcher | backend/src/modules/memory/dispatchers/dispatcher.ts |
---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

The `mem_smart_ingest` tool operates within the backend MCP server. External actors:
- **Hook (stream-user-prompt):** Triggers evaluation via `execute_dynamic_tool`
- **Ollama Server:** Local LLM providing semantic classification (localhost:11434)
- **KB Storage:** SQLite database storing knowledge entries
- **Admin/Developer:** Triggers batch cleanup manually

### 2.2 System Architecture

The tool follows the existing MCP tool pattern:
1. **Registration:** `tool-definitions.ts` — declares tool schema
2. **Dispatch:** `dispatcher.ts` — routes `mem_smart_ingest` to handler
3. **Handler:** `smart-ingest.ts` — orchestrates classify + ingest logic
4. **LLM Layer:** `OllamaAdapter` — sends evaluation prompt to local Ollama
5. **Storage Layer:** Internal `mem_ingest` pipeline — persists entries to KB

---

## 3. Functional Requirements

### 3.1 Feature: Local LLM Semantic Evaluation (mem_smart_ingest)

**Source:** BRD Story 1, Story 2

#### 3.1.1 Description

MCP tool `mem_smart_ingest` receives a user message, evaluates its business/technical value using local Ollama LLM, and either auto-ingests a summary into KB or skips the message. This replaces inline chat LLM evaluation, saving cloud tokens and preserving context window.

#### 3.1.2 Use Cases

---

**Use Case ID:** UC-01
**Name:** Evaluate and Auto-Ingest Valuable Message
**Actor:** Hook (stream-user-prompt)
**Preconditions:**
- Ollama server running and accessible
- `mem_smart_ingest` tool registered in tool-definitions
- User has submitted a message in chat session

**Postconditions:**
- Valuable message ingested into KB with LLM-generated summary
- Entry tagged with "chat,stream,user,smart-ingest"

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Hook | | Calls `execute_dynamic_tool("mem_smart_ingest", { message })` |
| 2 | | Handler | Receives message, checks OllamaAdapter.isAvailable() |
| 3 | | OllamaAdapter | Returns available = true |
| 4 | | Handler | Constructs evaluation prompt with message content |
| 5 | | OllamaAdapter | Sends prompt to local LLM, receives JSON response |
| 6 | | Handler | Parses response: verdict = "ingest", summary extracted |
| 7 | | Handler | Calls internal mem_ingest with summary as content |
| 8 | | Handler | Returns `{ action: "ingest", summary: "..." }` to hook |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | LLM returns verdict "skip" | Step 6: verdict = "skip" -> Step 8: return `{ action: "skip", reason: "no business/technical value" }` |
| AF-02 | LLM returns summary > 200 chars | Step 6: truncate summary to 200 chars before ingest |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | LLM returns malformed JSON | Log warning, treat as fallback (ingest raw with "unfiltered" tag) |
| EF-02 | LLM response timeout (>3s) | Treat as Ollama unavailable, trigger fallback flow (UC-02) |
| EF-03 | Duplicate message detected | Skip ingest, return `{ action: "skip", reason: "duplicate" }` |

---

**Use Case ID:** UC-02
**Name:** Fallback Ingest — Ollama Unavailable
**Actor:** Hook (stream-user-prompt)
**Preconditions:**
- Ollama server NOT accessible (down, timeout, error)
- User has submitted a message

**Postconditions:**
- Message ingested raw (truncated 500 chars) with "unfiltered" tag
- Warning logged

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Hook | | Calls `execute_dynamic_tool("mem_smart_ingest", { message })` |
| 2 | | Handler | Checks OllamaAdapter.isAvailable() with 3s timeout |
| 3 | | OllamaAdapter | Returns available = false (connection refused/timeout) |
| 4 | | Handler | Logs warning: "Ollama unavailable, using unfiltered ingest fallback" |
| 5 | | Handler | Truncates message to 500 chars |
| 6 | | Handler | Calls internal mem_ingest with raw content, tags = "chat,stream,user,unfiltered" |
| 7 | | Handler | Returns `{ action: "ingest_unfiltered", reason: "llm_unavailable" }` |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-03 | Message shorter than 500 chars | Step 5: use full message without truncation |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-04 | Internal mem_ingest fails | Log error, return `{ action: "error", reason: "ingest_failed" }` — NO throw |

---

**Use Case ID:** UC-03
**Name:** Batch Cleanup of Unfiltered Entries
**Actor:** Admin/Developer (manual trigger)
**Preconditions:**
- Ollama server recovered and accessible
- KB contains entries tagged "unfiltered"

**Postconditions:**
- Entries re-evaluated: valuable ones updated with summary, non-valuable deleted
- "unfiltered" tag removed from processed entries

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Admin | | Triggers batch cleanup (tool call or command) |
| 2 | | Handler | Checks OllamaAdapter.isAvailable() |
| 3 | | Handler | Queries KB for entries tagged "unfiltered" (limit = batch_size) |
| 4 | | Handler | For each entry: sends content to LLM for evaluation |
| 5 | | OllamaAdapter | Returns verdict per entry |
| 6a | | Handler | verdict "ingest": update entry content with summary, replace "unfiltered" with "smart-ingest" tag |
| 6b | | Handler | verdict "skip": delete entry from KB |
| 7 | | Handler | Returns summary: `{ processed: N, ingested: X, deleted: Y }` |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-04 | dry_run = true | Steps 6a/6b: no actual changes, only report what would happen |
| AF-05 | batch_size specified | Step 3: limit query to batch_size (default 50) |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-05 | Ollama becomes unavailable mid-batch | Stop processing, return partial results: `{ processed: N, remaining: M, reason: "llm_unavailable" }` |
| EF-06 | No unfiltered entries found | Return `{ processed: 0, message: "no unfiltered entries" }` |

---

**Use Case ID:** UC-04
**Name:** Hook Triggers Smart Ingest
**Actor:** User (indirect — via chat message)
**Preconditions:**
- Hook `stream-user-prompt` configured and active
- Backend MCP server running

**Postconditions:**
- Message evaluated (or fallback applied)
- Hook completes without blocking user interaction

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | User | | Submits message in chat session |
| 2 | | Hook | Triggers on stream-user-prompt event |
| 3 | | Hook | Calls `execute_dynamic_tool("mem_smart_ingest", { message: content })` |
| 4 | | Backend | Processes via UC-01 or UC-02 |
| 5 | | Hook | Receives response, no further action needed (fire-and-forget) |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-07 | `mem_smart_ingest` tool unavailable | Hook fails silently — no error shown to user |
| EF-08 | Backend MCP server unreachable | Hook fails silently — no disruption to user |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-01 | Messages evaluated using criteria: "If I read this entry 3 days later in a different session, would it help me understand a decision, requirement, architecture choice, bug context, or workflow?" | BRD Story 1 |
| BR-02 | LLM response MUST be structured JSON: `{ verdict: "ingest"|"skip", summary?: string }` | BRD Story 1 |
| BR-03 | Summary content MUST NOT exceed 200 characters | BRD Story 2 |
| BR-04 | Ingested entries MUST have type = "CONTEXT", source = "/chat-prompt" | BRD Story 2 |
| BR-05 | Ingested entries MUST have tags = "chat,stream,user,smart-ingest" | BRD Story 2 |
| BR-06 | Ollama availability check MUST timeout at 3 seconds | BRD Story 3 |
| BR-07 | Fallback entries MUST be tagged "unfiltered" | BRD Story 3 |
| BR-08 | Fallback raw message MUST be truncated to 500 characters max | BRD Story 3 |
| BR-09 | Tool MUST NOT throw exceptions — always return valid response | BRD Story 3 |
| BR-10 | Batch cleanup processes max 50 entries per run (configurable) | BRD Story 4 |
| BR-11 | Batch cleanup MUST stop gracefully if Ollama becomes unavailable mid-run | BRD Story 4 |
| BR-12 | Hook file MUST be ≤20 lines — simple trigger only | BRD Story 5 |
| BR-13 | Duplicate messages MUST NOT create duplicate KB entries | BRD Story 2 |
| BR-14 | Social/confirmatory messages ("ok", "thanks", etc.) MUST be classified as "skip" | BRD Story 1 |
| BR-15 | MUST use existing OllamaAdapter — NO new adapter creation | BRD Dependencies |

#### 3.1.4 Data Specifications

**Input Data — mem_smart_ingest:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| message | string | Yes | Non-empty, max 10000 chars | User message content to evaluate |

**Input Data — mem_smart_ingest_cleanup (batch):**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| batch_size | number | No | 1-100, default 50 | Max entries to process per run |
| dry_run | boolean | No | default false | Preview mode — no actual changes |

**Output Data — mem_smart_ingest:**

| Field | Type | Description |
|-------|------|-------------|
| action | string | "ingest" / "skip" / "ingest_unfiltered" / "error" |
| summary | string? | LLM-generated summary (when action = "ingest") |
| reason | string? | Explanation (when action = "skip" or "ingest_unfiltered") |

**Output Data — mem_smart_ingest_cleanup:**

| Field | Type | Description |
|-------|------|-------------|
| processed | number | Total entries processed |
| ingested | number | Entries updated with summary |
| deleted | number | Entries removed (no value) |
| remaining | number | Unfiltered entries still pending |
| dry_run | boolean | Whether this was a preview run |

#### 3.1.5 UI Specifications

No UI components. This feature operates entirely in the backend via MCP tool calls. The hook is invisible to the user — fire-and-forget pattern.

#### 3.1.6 API Contract (Functional View)

> **Note:** This section defines the functional MCP tool contract. Technical details (retry policies, connection pooling) are specified in the TDD.

**Tool:** `mem_smart_ingest`
**Purpose:** Evaluate user message semantic value and auto-ingest if valuable

**Input Parameters:**

| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| message | string | Yes | BR-01 | User message content to evaluate for business/technical value |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| action | string | Classification result action taken |
| summary | string? | LLM-generated summary (max 200 chars per BR-03) |
| reason | string? | Human-readable explanation of decision |

**Business Error Scenarios:**

| Scenario | Response | Trigger Condition |
|----------|----------|-------------------|
| Empty message | `{ action: "skip", reason: "empty_message" }` | message is empty or whitespace only |
| Ollama unavailable | `{ action: "ingest_unfiltered", reason: "llm_unavailable" }` | OllamaAdapter.isAvailable() returns false (BR-06) |
| Malformed LLM response | `{ action: "ingest_unfiltered", reason: "llm_parse_error" }` | LLM output cannot be parsed as valid verdict JSON |
| Ingest pipeline error | `{ action: "error", reason: "ingest_failed" }` | Internal mem_ingest call fails |

---

**Tool:** `mem_smart_ingest_cleanup`
**Purpose:** Re-evaluate "unfiltered" KB entries after Ollama recovery

**Input Parameters:**

| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| batch_size | number | No | BR-10 | Max entries per run (default 50, max 100) |
| dry_run | boolean | No | — | If true, report only — no mutations |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| processed | number | Entries evaluated this run |
| ingested | number | Entries updated with LLM summary |
| deleted | number | Entries removed (no value) |
| remaining | number | Unfiltered entries still in KB |
| dry_run | boolean | Whether mutations were applied |

**Business Error Scenarios:**

| Scenario | Response | Trigger Condition |
|----------|----------|-------------------|
| Ollama unavailable | `{ processed: 0, reason: "llm_unavailable" }` | Cannot start cleanup without LLM |
| LLM fails mid-batch | Partial result with remaining count | Ollama becomes unavailable during processing |
| No unfiltered entries | `{ processed: 0, message: "no unfiltered entries" }` | No entries with "unfiltered" tag exist |

---

## 4. Data Model

> **Note:** Logical data model. Physical implementation (DDL, indexes) specified in TDD.

### 4.1 Entity Relationship Diagram

Not applicable — this feature uses the existing KB entry schema. No new tables or entities created.

### 4.2 Logical Entities

#### Entity: KBEntry (existing — used by smart ingest)

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| id | integer | Yes | — | Auto-generated primary key |
| content | string | Yes | BR-03, BR-08 | Entry content (summary or raw message) |
| type | string | Yes | BR-04 | Entry type — "CONTEXT" for smart ingest |
| source | string | Yes | BR-04 | Origin path — "/chat-prompt" |
| tags | string | Yes | BR-05, BR-07 | Comma-separated tags |
| created_at | datetime | Yes | — | Creation timestamp |
| scope | string | No | — | KB scope (PROJECT/GLOBAL) |

**Tag Taxonomy for Smart Ingest:**

| Tag Set | When Applied | Meaning |
|---------|-------------|---------|
| chat,stream,user,smart-ingest | LLM verdict = "ingest" | Evaluated and confirmed valuable |
| chat,stream,user,unfiltered | Ollama unavailable (fallback) | Not yet evaluated by LLM |

---

## 5. Integration Specifications

> **Note:** Business-level integration view. Technical details (timeout, retry, circuit breaker) in TDD.

### 5.1 External System: Ollama Server

| Attribute | Value |
|-----------|-------|
| Purpose | Local LLM inference for semantic classification |
| Direction | Outbound (backend → Ollama) |
| Data Format | JSON (REST API) |
| Frequency | Real-time (per user message) |
| Endpoint | `http://localhost:11434/api/chat` |

**Data Exchange:**

| Our Data | External Data | Direction | Business Rule |
|----------|--------------|-----------|---------------|
| Evaluation prompt + message | LLM completion response | Send/Receive | BR-01, BR-02 |
| Availability check | Server tag list | Send/Receive | BR-06 |

### 5.2 Internal System: mem_ingest Pipeline

| Attribute | Value |
|-----------|-------|
| Purpose | Persist evaluated entries into KB |
| Direction | Internal call (handler → engine) |
| Data Format | Function call (TypeScript) |
| Frequency | Per valuable message or fallback |

**Data Exchange:**

| Our Data | Pipeline Input | Direction | Business Rule |
|----------|---------------|-----------|---------------|
| summary (200 chars max) | content field | Send | BR-03, BR-04 |
| "chat,stream,user,smart-ingest" | tags field | Send | BR-05 |
| "/chat-prompt" | source field | Send | BR-04 |

---

## 6. Processing Logic

### 6.1 Smart Ingest Classification

**Trigger:** `mem_smart_ingest` tool called with message parameter
**Schedule:** Real-time (on each user message via hook)
**Input:** User message string
**Output:** Classification result with action taken

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Validate input: message non-empty | Return `{ action: "skip", reason: "empty_message" }` |
| 2 | Check OllamaAdapter.isAvailable(config) with 3s timeout | If false → jump to fallback flow |
| 3 | Construct evaluation prompt (system + user message) | — |
| 4 | Call OllamaAdapter.complete(messages, config) | If error → fallback flow |
| 5 | Parse LLM response as JSON `{ verdict, summary? }` | If parse fails → fallback with "llm_parse_error" |
| 6 | If verdict = "skip" → return skip result | — |
| 7 | If verdict = "ingest" → truncate summary to 200 chars | — |
| 8 | Call internal mem_ingest(content=summary, tags, source, type) | If fails → return error result |
| 9 | Return `{ action: "ingest", summary }` | — |

**Fallback Flow (from Step 2/4/5):**

| Step | Description | Error Handling |
|------|-------------|----------------|
| F1 | Log warning with reason | — |
| F2 | Truncate raw message to 500 chars | — |
| F3 | Call internal mem_ingest(content=raw, tags="...unfiltered", source, type) | If fails → return error |
| F4 | Return `{ action: "ingest_unfiltered", reason }` | — |

### 6.2 Batch Cleanup Process

**Trigger:** Manual tool call `mem_smart_ingest_cleanup`
**Schedule:** On-demand (admin/developer triggers when Ollama recovers)
**Input:** batch_size (default 50), dry_run (default false)
**Output:** Processing summary with counts

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Check OllamaAdapter.isAvailable() | If false → return `{ processed: 0, reason: "llm_unavailable" }` |
| 2 | Query KB entries WHERE tags CONTAINS "unfiltered" LIMIT batch_size | If none → return "no unfiltered entries" |
| 3 | For each entry (loop): | — |
| 3a | Extract entry content | — |
| 3b | Send to LLM for evaluation (same prompt as smart ingest) | If LLM fails → stop loop, return partial |
| 3c | If verdict "ingest": update entry (content=summary, remove "unfiltered", add "smart-ingest") | Log error, continue to next |
| 3d | If verdict "skip": delete entry | Log error, continue to next |
| 4 | Return summary `{ processed, ingested, deleted, remaining }` | — |

### 6.3 Evaluation Prompt Construction

**System Prompt (constant):**

`
You are a knowledge base filter. Evaluate whether the following user message
carries business or technical value worth preserving for cross-session reference.

Criteria: "If I read this entry 3 days later in a different session, would it help me
understand a decision, requirement, architecture choice, bug context, or workflow?"

Respond ONLY in JSON format:
- If valuable: {"verdict": "ingest", "summary": "<max 200 char summary>"}
- If not valuable: {"verdict": "skip"}

Messages that are social, confirmatory ("ok", "thanks"), emotional, repetitive,
or meta-commentary about the conversation itself are NOT valuable.
`

**User Message:** The raw message content from the user.

**LLM Config:**
- model: from existing config (e.g., "qwen3:1.7b")
- temperature: 0.3 (deterministic classification)
- maxTokens: 200 (sufficient for JSON response)

---

## 7. Security Requirements

> **Note:** Business-level security. Technical implementation in TDD.

### 7.1 Authentication & Authorization

| Role | Permissions | Features |
|------|-------------|----------|
| System (Hook) | Execute mem_smart_ingest | Automatic classification |
| Admin/Developer | Execute mem_smart_ingest_cleanup | Batch cleanup trigger |

No user-facing authentication required — tool operates within backend MCP server boundary.

### 7.2 Data Sensitivity Classification

| Data Type | Classification | Business Requirement |
|-----------|---------------|---------------------|
| User messages | Internal | Messages stay on localhost (Ollama = local) |
| KB entries | Internal | Standard KB access controls apply |
| LLM prompts | Internal | No sensitive data in evaluation prompt template |

### 7.3 Audit Trail

| Event | Logged Fields | Retention | Business Reason |
|-------|--------------|-----------|-----------------|
| Smart ingest classify | message_hash, verdict, timestamp | 30 days | Debugging classification decisions |
| Fallback trigger | reason, timestamp | 30 days | Monitoring Ollama availability |
| Batch cleanup run | processed, ingested, deleted, timestamp | 90 days | Audit of KB mutations |

---

## 8. Non-Functional Requirements

> **Note:** Business-level NFR targets. Technical implementation in TDD.

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
| Performance | Tool response fast enough for fire-and-forget | Smart ingest < 3s (local LLM inference) |
| Performance | Fallback instant | Fallback response < 100ms |
| Performance | Batch cleanup reasonable | < 5 min per 50 entries |
| Reliability | No message loss | Every message either classified or fallback-ingested |
| Reliability | Graceful degradation | Tool NEVER crashes hook — always returns valid response |
| Scalability | Developer workflow volume | Support 100+ messages/hour |
| Security | Data locality | All LLM inference on localhost — no cloud data leak |
| Maintainability | Code standards | File ≤ 200 lines, function ≤ 20 lines |
| Compatibility | MCP pattern | Follows tool-definitions.ts + dispatcher.ts architecture |
| Observability | Decision logging | Log classify decisions for debugging and prompt tuning |

---

## 9. Error Handling (User-Facing)

> **Note:** User-facing error scenarios. Technical logging in TDD.

### 9.1 Error Scenarios

| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
| Ollama server down | Warning | None (invisible to user) | Fallback ingest with "unfiltered" tag |
| LLM returns garbage | Warning | None (invisible to user) | Fallback ingest with "unfiltered" tag |
| Backend MCP unreachable | Info | None (invisible to user) | Hook fails silently, no disruption |
| Batch cleanup — LLM unavailable | Warning | "LLM still unavailable" (in tool response) | Admin informed, no entries modified |
| mem_ingest internal failure | Warning | None (invisible to user) | Error logged, tool returns error result |

### 9.2 Notification Requirements

| Event | Who is Notified | Channel | Timing |
|-------|----------------|---------|--------|
| Ollama unavailable (first occurrence) | Developer | Log file (warn level) | Immediate |
| Batch cleanup complete | Admin who triggered | Tool response | Immediate |
| Multiple consecutive fallbacks (>10) | Developer | Log file (error level) | On threshold breach |

---

## 10. Testing Considerations

### 10.1 Test Scenarios

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-01 | Message with business value classified as "ingest" | "We decided to use Strategy pattern for transport layer" | `{ action: "ingest", summary: "..." }` | High |
| TC-02 | Social message classified as "skip" | "ok" | `{ action: "skip", reason: "no business/technical value" }` | High |
| TC-03 | Ollama unavailable triggers fallback | Any message + Ollama down | `{ action: "ingest_unfiltered", reason: "llm_unavailable" }` | High |
| TC-04 | Malformed LLM response triggers fallback | Message + LLM returns "hello" | `{ action: "ingest_unfiltered", reason: "llm_parse_error" }` | High |
| TC-05 | Summary truncated to 200 chars | Message producing long summary | summary.length <= 200 | Medium |
| TC-06 | Raw message truncated to 500 chars on fallback | 1000-char message + Ollama down | ingested content.length <= 500 | Medium |
| TC-07 | Empty message returns skip | "" | `{ action: "skip", reason: "empty_message" }` | Medium |
| TC-08 | Batch cleanup re-evaluates entries | 5 unfiltered entries + Ollama up | `{ processed: 5, ingested: X, deleted: Y }` | High |
| TC-09 | Batch cleanup stops when LLM fails | 10 entries + Ollama dies at entry 3 | `{ processed: 3, remaining: 7 }` | High |
| TC-10 | Batch dry_run makes no changes | dry_run=true + 5 entries | `{ dry_run: true, processed: 5 }` + entries unchanged | Medium |
| TC-11 | Hook fails silently when tool unavailable | Tool not registered | No error to user, hook completes | High |
| TC-12 | Dedup prevents duplicate entries | Same message sent twice | Second call returns skip or no duplicate entry | Medium |

---

## 11. Sequence Diagrams

### 11.1 Main Flow — Smart Ingest (Ollama Available)

![Sequence — Main Flow](diagrams/sequence-main-flow.png)

### 11.2 Fallback Flow — Ollama Unavailable

![Sequence — Fallback](diagrams/sequence-fallback.png)

---

## 12. State Diagram — Message Lifecycle

![State — Message Lifecycle](diagrams/state-message-lifecycle.png)

**States:**

| State | Description |
|-------|-------------|
| RECEIVED | Message received by hook |
| EVALUATING | LLM processing classification |
| INGESTED | Entry stored in KB with smart-ingest tag |
| SKIPPED | Message determined not valuable — no KB entry |
| UNFILTERED | Fallback: stored raw with "unfiltered" tag |
| CLEANED_UP | Unfiltered entry re-evaluated and updated/deleted |

**Transitions:**

| From | To | Trigger |
|------|-----|---------|
| RECEIVED | EVALUATING | Ollama available, LLM called |
| RECEIVED | UNFILTERED | Ollama unavailable (fallback) |
| EVALUATING | INGESTED | verdict = "ingest" |
| EVALUATING | SKIPPED | verdict = "skip" |
| EVALUATING | UNFILTERED | LLM error / parse failure |
| UNFILTERED | INGESTED | Batch cleanup, verdict = "ingest" |
| UNFILTERED | SKIPPED (deleted) | Batch cleanup, verdict = "skip" |

---

## 13. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Sequence — Main Flow | [sequence-main-flow.png](diagrams/sequence-main-flow.png) | [sequence-main-flow.drawio](diagrams/sequence-main-flow.drawio) |
| 3 | Sequence — Fallback | [sequence-fallback.png](diagrams/sequence-fallback.png) | [sequence-fallback.drawio](diagrams/sequence-fallback.drawio) |
| 4 | State — Message Lifecycle | [state-message-lifecycle.png](diagrams/state-message-lifecycle.png) | [state-message-lifecycle.drawio](diagrams/state-message-lifecycle.drawio) |

### Change Log from BRD

- No deviations from BRD. All 6 user stories mapped to use cases UC-01 through UC-04.
- Story 5 (Hook Update) covered by UC-04.
- Story 6 (Unit Tests) covered by Section 10 (Testing Considerations).
- Added `mem_smart_ingest_cleanup` as separate tool (derived from Story 4 batch cleanup requirement).
