# Technical Design Document (TDD)

## Smart KB Ingest — SA4E-38: Local LLM Semantic Evaluation

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-38 |
| Title | Smart KB Ingest — Local LLM Semantic Evaluation |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2026-07-15 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-38.docx |
| Related FSD | FSD-v1-SA4E-38.docx |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | SA Agent – Solution Architect | Create document |
| Peer Reviewer | BA Agent – Business Analyst | Review completeness against FSD |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-15 | SA Agent | Initial TDD — auto-generated from FSD and code intelligence |

---

## 1. Introduction

### 1.1 Purpose

This TDD specifies the technical implementation for `mem_smart_ingest` and `mem_smart_ingest_cleanup` MCP tools. These tools use the existing local Ollama LLM infrastructure to semantically evaluate user messages before KB ingestion, replacing the inline chat LLM evaluation that consumed cloud tokens.

### 1.2 Scope

- Two new MCP tools registered in the Memory module
- New handler file implementing classification and batch cleanup logic
- New ClassifyService using Strategy pattern for LLM-based evaluation
- Integration with existing `OllamaAdapter`, `LLMService`, `MemoryEngine`
- Hook update (stream-user-prompt) — minimal trigger code

### 1.3 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript (strict mode) | 5.x |
| Runtime | Node.js | >=18.14 |
| Framework | Hono + MCP SDK | latest |
| Database | better-sqlite3 | latest |
| LLM | Ollama (local) | latest |
| Build | tsc + esbuild | latest |
| Test | Vitest | latest |
| CI/CD | GitHub Actions | latest |

### 1.4 Design Principles

- SOLID principles — Single Responsibility per file/class
- Strategy pattern for LLM classification (swappable)
- Graceful degradation — never crash, always return valid response
- Fire-and-forget — hook must not block user interaction
- Code standards: file ≤ 200 lines, function ≤ 20 lines

### 1.5 Constraints

- MUST use existing `OllamaAdapter` — no new adapter creation
- MUST follow tool-definitions.ts + dispatcher.ts + handler pattern
- Ollama availability check timeout: 3 seconds
- Summary max: 200 characters
- Fallback raw message max: 500 characters
- Batch cleanup max: 100 entries per run (default 50)
- No cloud API calls — all LLM inference local

### 1.6 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-SA4E-38.docx |
| FSD | FSD-v1-SA4E-38.docx |
| OllamaAdapter | backend/src/modules/memory/llm/ollama-adapter.ts |
| LLMService | backend/src/modules/memory/llm/LLMService.ts |
| Tool Definitions | backend/src/modules/memory/tool-definitions.ts |
| Dispatcher | backend/src/modules/memory/dispatchers/dispatcher.ts |

---

## 2. System Architecture

### 2.1 Architecture Overview

The Smart Ingest feature integrates into the existing Memory module as two additional MCP tools. It reuses the OllamaAdapter and LLMService already available in the `llm/` layer, and delegates storage to the existing `handleIngest` pipeline.

![Architecture Diagram](diagrams/architecture.png)

**Data flow:**
1. Hook (stream-user-prompt) fires `execute_dynamic_tool("mem_smart_ingest", { message })`
2. MCP Server receives call → ModuleRegistry → MemoryModule
3. MemoryToolDispatcher routes to `handleSmartIngest`
4. SmartIngestHandler calls ClassifyService
5. ClassifyService uses LLMService (OllamaAdapter) for evaluation
6. On verdict "ingest" → delegates to existing `handleIngest` pipeline
7. Returns structured JSON response to hook

### 2.2 Component Diagram

![Component Diagram](diagrams/component.png)

| Component | Responsibility | Technology |
|-----------|---------------|------------|
| tool-definitions.ts | Schema declaration for mem_smart_ingest + cleanup | TypeScript |
| dispatcher.ts | Route tool calls to handler functions | TypeScript |
| smart-ingest.ts | Handler: orchestrate classify + ingest/cleanup | TypeScript |
| ClassifyService | Strategy-based LLM evaluation with fallback | TypeScript |
| LLMService | Facade for multi-provider LLM access | TypeScript (existing) |
| OllamaAdapter | REST client for Ollama local inference | TypeScript (existing) |
| MemoryEngine | KB storage (insert, query, update, delete) | TypeScript (existing) |

### 2.3 Deployment Architecture

No deployment changes. The feature is compiled into the existing backend bundle. Ollama must be running locally on `localhost:11434` for LLM evaluation; the feature degrades gracefully when unavailable.

### 2.4 Communication Patterns

| From | To | Protocol | Pattern | Description |
|------|----|----------|---------|-------------|
| Hook | Backend MCP Server | JSON-RPC (stdio) | Fire-and-forget | Tool invocation |
| SmartIngestHandler | LLMService | In-process | Sync (await) | Classification request |
| LLMService | Ollama | HTTP REST | Sync with 3s timeout | LLM inference |
| SmartIngestHandler | MemoryEngine | In-process | Sync | KB insert/query/update/delete |

---

## 3. API Design

### 3.1 API Overview

| # | Tool | Description | Source |
|---|------|-------------|--------|
| 1 | mem_smart_ingest | Evaluate message + auto-ingest if valuable | UC-01, UC-02 |
| 2 | mem_smart_ingest_cleanup | Re-evaluate unfiltered entries batch | UC-03 |

---

### 3.2 Tool: mem_smart_ingest

**Implements:** UC-01, UC-02, BR-01 through BR-09, BR-13, BR-14, BR-15

| Attribute | Value |
|-----------|-------|
| Name | mem_smart_ingest |
| Category | memory |
| Auth | None (internal MCP tool) |
| Rate Limit | None (fire-and-forget, 1 call per user message) |

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "message": {
      "type": "string",
      "description": "User message content to evaluate for KB value"
    }
  },
  "required": ["message"]
}
```

**Response — Success (ingest):**

```json
{
  "action": "ingest",
  "summary": "Architecture decision: use Strategy pattern for transport layer"
}
```

**Response — Success (skip):**

```json
{
  "action": "skip",
  "reason": "no business/technical value"
}
```

**Response — Fallback (unfiltered):**

```json
{
  "action": "ingest_unfiltered",
  "reason": "llm_unavailable"
}
```

**Response — Error:**

```json
{
  "action": "error",
  "reason": "ingest_failed"
}
```

**Validation Rules:**

| Field | Validation | Error Response |
|-------|-----------|----------------|
| message | Non-empty, trimmed whitespace check | `{ action: "skip", reason: "empty_message" }` |
| message | Max 10000 chars (truncate, don't reject) | Truncate to 10000 before processing |

---

### 3.3 Tool: mem_smart_ingest_cleanup

**Implements:** UC-03, BR-10, BR-11

| Attribute | Value |
|-----------|-------|
| Name | mem_smart_ingest_cleanup |
| Category | memory |
| Auth | None (internal MCP tool) |
| Rate Limit | None (manual trigger) |

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "batch_size": {
      "type": "number",
      "description": "Max entries to process (1-100, default 50)"
    },
    "dry_run": {
      "type": "boolean",
      "description": "Preview mode — no actual changes"
    }
  }
}
```

**Response — Success:**

```json
{
  "processed": 5,
  "ingested": 3,
  "deleted": 2,
  "remaining": 10,
  "dry_run": false
}
```

**Response — LLM Unavailable:**

```json
{
  "processed": 0,
  "reason": "llm_unavailable"
}
```

**Response — Partial (LLM failed mid-batch):**

```json
{
  "processed": 3,
  "ingested": 2,
  "deleted": 1,
  "remaining": 7,
  "reason": "llm_unavailable_mid_batch"
}
```

---

## 4. Database Design

### 4.1 Schema Overview

No new tables. The feature uses the existing `knowledge_entries` table. Unfiltered entries are identified by the tag `unfiltered` in the `tags` column.

### 4.2 Query Patterns

| Operation | Query Pattern | Expected Performance |
|-----------|--------------|---------------------|
| Find unfiltered entries | `SELECT * FROM knowledge_entries WHERE tags LIKE '%unfiltered%' LIMIT ?` | < 10ms (SQLite, small dataset) |
| Update entry (cleanup) | `UPDATE knowledge_entries SET content=?, tags=? WHERE id=?` | < 1ms |
| Delete entry (cleanup) | `DELETE FROM knowledge_entries WHERE id=?` | < 1ms |
| Dedup check | `SELECT id FROM knowledge_entries WHERE content=? AND source='/chat-prompt' LIMIT 1` | < 5ms |

### 4.3 Index Considerations

Existing indexes on `knowledge_entries` are sufficient. The `tags LIKE '%unfiltered%'` query operates on a small subset (only fallback entries). If volume grows beyond 1000 unfiltered entries, consider adding a boolean column `is_unfiltered` with index — but this is unlikely given batch cleanup.

---

## 5. Class / Module Design

### 5.1 Package Structure

```
backend/src/modules/memory/
├── dispatchers/
│   ├── dispatcher.ts          # ADD: route mem_smart_ingest + cleanup
│   └── smart-ingest.ts        # NEW: handler functions
├── llm/
│   ├── ollama-adapter.ts      # EXISTING (unchanged)
│   ├── LLMService.ts          # EXISTING (unchanged)
│   ├── types.ts               # EXISTING (unchanged)
│   └── classify-service.ts    # NEW: Strategy-based classify
├── tool-definitions.ts        # ADD: 2 new tool schemas
└── __tests__/
    ├── SmartIngest.test.ts    # NEW: unit tests
    └── ClassifyService.test.ts # NEW: unit tests
```

### 5.2 Key Interfaces

```typescript
// classify-service.ts
export interface ClassifyResult {
  verdict: 'ingest' | 'skip';
  summary?: string;
}

export interface ClassifyStrategy {
  classify(message: string): Promise<ClassifyResult>;
  isAvailable(): Promise<boolean>;
}

export interface SmartIngestResult {
  action: 'ingest' | 'skip' | 'ingest_unfiltered' | 'error';
  summary?: string;
  reason?: string;
}

export interface CleanupResult {
  processed: number;
  ingested: number;
  deleted: number;
  remaining: number;
  dry_run: boolean;
  reason?: string;
}
```

### 5.3 Class: ClassifyService

**File:** `backend/src/modules/memory/llm/classify-service.ts`
**Responsibility:** Evaluate message value using LLM (Strategy pattern)
**Lines:** ~80

```typescript
export class ClassifyService implements ClassifyStrategy {
  constructor(private readonly llmService: LLMService) {}

  async isAvailable(): Promise<boolean> {
    return this.llmService.isAvailable();
  }

  async classify(message: string): Promise<ClassifyResult> {
    const messages = this.buildPrompt(message);
    const response = await this.llmService.complete(messages);
    return this.parseResponse(response.content);
  }

  private buildPrompt(message: string): LLMMessage[] { /* ... */ }
  private parseResponse(content: string): ClassifyResult { /* ... */ }
}
```

### 5.4 Handler: smart-ingest.ts

**File:** `backend/src/modules/memory/dispatchers/smart-ingest.ts`
**Responsibility:** Orchestrate classify + ingest logic for both tools
**Lines:** ~150

```typescript
export async function handleSmartIngest(
  engine: MemoryEngine,
  scopeCtx: ScopeContext | undefined,
  classifyService: ClassifyService,
  args: Args
): Promise<string> { /* ... */ }

export async function handleSmartIngestCleanup(
  engine: MemoryEngine,
  scopeCtx: ScopeContext | undefined,
  classifyService: ClassifyService,
  args: Args
): Promise<string> { /* ... */ }
```

**Internal functions (each ≤20 lines):**
- `validateMessage(message: string): SmartIngestResult | null`
- `isDuplicate(engine: MemoryEngine, content: string): boolean`
- `ingestWithSummary(engine: MemoryEngine, scopeCtx, summary: string): number`
- `ingestUnfiltered(engine: MemoryEngine, scopeCtx, message: string): number`
- `processCleanupEntry(engine, classifyService, entry, dryRun): 'ingested' | 'deleted'`

### 5.5 Design Patterns

| Pattern | Where Used | Rationale |
|---------|-----------|-----------|
| Strategy | ClassifyService implements ClassifyStrategy | Swap LLM provider without changing handler logic |
| Facade | LLMService wraps adapter selection | Single entry point for LLM operations |
| Fire-and-Forget | Hook → tool call | Non-blocking user interaction |
| Graceful Degradation | Fallback to raw ingest | System remains functional without Ollama |

### 5.6 Dispatcher Integration

**Changes to `dispatcher.ts`:**

```typescript
// Add import
import { handleSmartIngest, handleSmartIngestCleanup } from './smart-ingest.js';

// Add ClassifyService field
private classifyService: ClassifyService | undefined;

// Add setter
setClassifyService(svc: ClassifyService): void {
  this.classifyService = svc;
}

// Add cases in dispatch switch
case 'mem_smart_ingest':
  return handleSmartIngest(this.engine, this.scopeCtx, this.classifyService!, merged);
case 'mem_smart_ingest_cleanup':
  return handleSmartIngestCleanup(this.engine, this.scopeCtx, this.classifyService!, merged);
```

---

## 6. Integration Design

### 6.1 External System: Ollama Server

| Attribute | Value |
|-----------|-------|
| Protocol | HTTP REST |
| Endpoint | `http://localhost:11434/api/chat` |
| Authentication | None (localhost only) |
| Timeout | 3000ms (availability check) |
| Timeout | 30000ms (inference — existing LLMService default) |
| Retry Policy | No retry — fallback to raw ingest on failure |
| Circuit Breaker | Not needed — fallback is designed behavior |

**Evaluation Request:**

| Field | Value |
|-------|-------|
| model | Configured model (e.g., "qwen3:1.7b") |
| messages | [system prompt, user message] |
| stream | false |
| options.temperature | 0.3 |
| options.num_predict | 200 |

**Expected Response:**

```json
{
  "message": {
    "content": "{\"verdict\": \"ingest\", \"summary\": \"...\"}"
  }
}
```

### 6.2 Internal System: MemoryEngine

| Attribute | Value |
|-----------|-------|
| Protocol | In-process function call |
| Operations Used | insert(), findFiltered(), updateEntry(), deleteEntry(), auditLog() |
| Error Handling | Catch errors, return `{ action: "error" }` — never throw |

**Data Mapping — Ingest:**

| Smart Ingest Field | MemoryEngine Field | Value |
|---|---|---|
| summary (LLM) | content | Max 200 chars |
| — | type | "CONTEXT" |
| — | source | "/chat-prompt" |
| — | tags | "chat,stream,user,smart-ingest" |
| — | tier | "T1" (via tierForType) |
| — | scope | "USER" |

**Data Mapping — Fallback:**

| Smart Ingest Field | MemoryEngine Field | Value |
|---|---|---|
| raw message (truncated) | content | Max 500 chars |
| — | type | "CONTEXT" |
| — | source | "/chat-prompt" |
| — | tags | "chat,stream,user,unfiltered" |
| — | tier | "T1" |
| — | scope | "USER" |

---

## 7. Security Design

### 7.1 Authentication

No additional authentication. Tools operate within the backend MCP server boundary, accessible only to connected IDE clients via stdio/StreamableHTTP. The hook invokes tools through the same authenticated MCP session.

### 7.2 Authorization

| Role | Tools | Permissions |
|------|-------|-------------|
| System (Hook) | mem_smart_ingest | Execute per user message |
| Admin/Developer | mem_smart_ingest_cleanup | Execute on demand |

No additional RBAC needed — existing MCP tool access model applies.

### 7.3 Data Protection

| Data Type | At Rest | In Transit | In Logs |
|-----------|---------|------------|---------|
| User messages | SQLite (local disk) | localhost only (Ollama) | Hash only (not full content) |
| LLM prompts | Not persisted | localhost only | Not logged |
| KB entries | SQLite (encrypted optional) | N/A (local) | Summary only |

**Key security properties:**
- All LLM inference is LOCAL (Ollama on localhost:11434)
- No user data leaves the machine
- No cloud API calls for classification
- Message content logged only as hash for audit

### 7.4 Input Validation

| Field | Validation | Sanitization |
|-------|-----------|--------------|
| message | Non-empty after trim, max 10000 chars | Truncate to 10000, trim whitespace |
| batch_size | Integer, clamp to 1-100 range | Math.min(100, Math.max(1, value)) |
| dry_run | Boolean (default false) | `Boolean(value)` |

### 7.5 Prompt Injection Mitigation

The evaluation prompt is structured with a clear system/user separation. The system prompt instructs the LLM to respond ONLY in JSON format. User message is passed as-is in the user role — the LLM should not execute instructions within it. Since this is a classification task (not code generation), prompt injection risk is low: worst case is a wrong verdict, which only affects whether a message is stored in KB.

---

## 8. Performance & Scalability

### 8.1 Performance Targets

| Operation | Target | Measurement |
|-----------|--------|-------------|
| Smart ingest (Ollama available) | < 3s p95 | End-to-end tool call duration |
| Smart ingest (fallback) | < 100ms | No LLM call, direct insert |
| Batch cleanup (50 entries) | < 5 min | Sequential LLM calls |
| Dedup check | < 5ms | SQLite query |

### 8.2 Caching Strategy

No caching needed. Each message is unique; classification results are not reusable.

### 8.3 Connection Pooling

| Resource | Min | Max | Timeout | Idle Timeout |
|----------|-----|-----|---------|-------------|
| Ollama HTTP | 1 | 1 | 3000ms (avail) / 30000ms (infer) | N/A (per-request) |
| SQLite | 1 | 1 | N/A (in-process) | N/A |

### 8.4 Scalability Considerations

- Fire-and-forget pattern means no backpressure on user interaction
- Ollama handles one inference at a time (single GPU) — messages queue naturally
- Batch cleanup is sequential (one entry at a time) to avoid Ollama overload
- 100+ messages/hour at ~3s each = ~5% Ollama utilization

---

## 9. Monitoring & Observability

### 9.1 Logging

| Log Event | Level | Fields | Destination |
|-----------|-------|--------|-------------|
| Smart ingest called | DEBUG | message_hash, message_length | pino (stdout) |
| LLM classify result | INFO | verdict, summary_length, duration_ms | pino (stdout) |
| Fallback triggered | WARN | reason (unavailable/timeout/parse_error) | pino (stdout) |
| Ingest success | DEBUG | entry_id, action | pino (stdout) |
| Ingest error | ERROR | error_message, stack | pino (stdout) |
| Cleanup started | INFO | batch_size, dry_run | pino (stdout) |
| Cleanup result | INFO | processed, ingested, deleted, remaining | pino (stdout) |
| Consecutive fallbacks > 10 | ERROR | count, window_minutes | pino (stdout) |

### 9.2 Metrics

| Metric | Type | Description | Alert Threshold |
|--------|------|-------------|-----------------|
| smart_ingest_total | Counter | Total tool invocations | — |
| smart_ingest_verdict | Counter (labeled) | ingest/skip/unfiltered/error | unfiltered > 10 in 30min |
| smart_ingest_duration_ms | Histogram | Classification latency | p95 > 5000ms |
| cleanup_processed | Counter | Entries processed in cleanup | — |

### 9.3 Health Checks

Ollama availability is checked per-call (not via health endpoint). If 10+ consecutive fallbacks occur within 30 minutes, log at ERROR level to alert developer.

---

## 10. Deployment Considerations

### 10.1 Environment Configuration

| Property | DEV | PROD |
|----------|-----|------|
| LLM_PROVIDER | ollama | ollama |
| LLM_BASE_URL | http://localhost:11434 | http://localhost:11434 |
| LLM_MODEL | qwen3:1.7b | qwen3:1.7b |
| SMART_INGEST_ENABLED | true | true |
| SMART_INGEST_MAX_BATCH | 50 | 50 |

### 10.2 Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| SMART_INGEST_ENABLED | true | Enable/disable smart ingest evaluation |

When disabled, `mem_smart_ingest` immediately returns `{ action: "skip", reason: "feature_disabled" }`.

### 10.3 Rollback Strategy

1. Set `SMART_INGEST_ENABLED=false` — immediate disable, no code change
2. Revert commit if needed — tool definitions removed, dispatcher routes removed
3. Unfiltered entries remain in KB — no data loss on rollback
4. Hook can be reverted independently (single file change)

---

## 11. Error Handling

### 11.1 Error Classification

| Error Type | Handler Action | User Impact |
|-----------|---------------|-------------|
| Empty message | Return skip result | None (invisible) |
| Ollama unavailable | Fallback ingest with "unfiltered" tag | None (invisible) |
| LLM timeout (>3s avail check) | Treat as unavailable → fallback | None (invisible) |
| LLM inference timeout | Fallback ingest | None (invisible) |
| LLM malformed JSON | Fallback ingest with "llm_parse_error" reason | None (invisible) |
| Duplicate message | Return skip with "duplicate" reason | None (invisible) |
| MemoryEngine insert fails | Return error result (no throw) | None (invisible) |
| Cleanup — LLM fails mid-batch | Return partial result, stop processing | Admin sees partial report |

### 11.2 Error Handling Strategy

**Rule: NEVER throw from handler functions.** All errors caught and returned as structured response.

```typescript
// Pattern used in all handler functions:
try {
  // ... operation
} catch (err) {
  logger.error({ err }, 'Smart ingest error');
  return JSON.stringify({ action: 'error', reason: 'ingest_failed' });
}
```

### 11.3 Fallback Decision Tree

```
message received
  → empty? → skip (empty_message)
  → check Ollama available (3s timeout)
    → unavailable → fallback ingest (llm_unavailable)
    → available → call LLM
      → timeout → fallback ingest (llm_timeout)
      → response received → parse JSON
        → parse fails → fallback ingest (llm_parse_error)
        → parsed → check verdict
          → "skip" → return skip
          → "ingest" → check duplicate
            → duplicate → skip (duplicate)
            → unique → ingest with summary → return ingest
```

---

## 12. Implementation Checklist

| # | Task | File | Estimated Lines | Priority |
|---|------|------|-----------------|----------|
| 1 | Create ClassifyService | llm/classify-service.ts | ~80 | P0 |
| 2 | Create SmartIngest handler | dispatchers/smart-ingest.ts | ~150 | P0 |
| 3 | Add tool definitions | tool-definitions.ts | +20 | P0 |
| 4 | Update dispatcher routing | dispatchers/dispatcher.ts | +15 | P0 |
| 5 | Wire ClassifyService in MemoryModule | MemoryModule.ts | +10 | P0 |
| 6 | Update hook (stream-user-prompt) | .kiro/hooks/ or .agents/hooks.json | ~10 | P1 |
| 7 | Unit tests — ClassifyService | __tests__/ClassifyService.test.ts | ~100 | P0 |
| 8 | Unit tests — SmartIngest handler | __tests__/SmartIngest.test.ts | ~150 | P0 |
| 9 | Integration test — full flow | __tests__/SmartIngest.it.test.ts | ~80 | P1 |

---

## 13. Appendix

### Glossary

| Term | Definition |
|------|------------|
| Smart Ingest | LLM-evaluated KB ingestion — only valuable messages stored |
| Unfiltered | Entry stored without LLM evaluation (Ollama unavailable) |
| Verdict | LLM classification result: "ingest" or "skip" |
| Fire-and-Forget | Hook pattern — call tool without blocking on result |
| ClassifyStrategy | Interface enabling swappable LLM evaluation implementations |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture Overview | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component Diagram | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |

### Open Questions

| # | Question | Status | Answer |
|---|----------|--------|--------|
| 1 | Should dedup use content hash or full content comparison? | Resolved | Content hash (SHA-256 of first 500 chars) for performance |
| 2 | Should batch cleanup run automatically on a schedule? | Resolved | No — manual trigger only (per FSD UC-03) |
| 3 | Model for classification — qwen3:1.7b vs larger? | Open | Start with configured model; tunable via LLM_MODEL env |
