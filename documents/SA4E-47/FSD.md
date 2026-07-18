# Functional Specification Document (FSD)

## KB Evolution Memory — SA4E-47: Cải tiến Document Indexing với LLM Context Chain

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-47 |
| Title | Cải tiến Document Indexing với LLM Context Chain |
| Author | TA Agent (Technical Architect) — Enriched from BA BRD v1.0 |
| Version | 1.0 |
| Date | 2026-07-18 |
| Status | Draft |
| Related BRD | documents/SA4E-47/BRD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-18 | TA Agent | Initial FSD — technical enrichment from BRD v1.0 and codebase analysis |

---

## 1. Introduction

### 1.1 Purpose

This Functional Specification Document (FSD) defines the technical implementation specifications for **SA4E-47**: Cải tiến Document Indexing với LLM Context Chain. It enriches the Business Requirements Document (BRD v1.0) with detailed API contracts, data model changes, prompt designs, error handling strategies, pseudocode for complex business logic, and quantified non-functional targets. The FSD is the authoritative technical specification that developers use for implementation.

### 1.2 Scope

The scope is derived from the BRD Section 1.1 with the following technical clarifications:

| BRD Requirement | Technical Scope Clarification |
|----------------|------------------------------|
| Remove 2000-char truncation | Applies to both `handleIngest` (single entry) and `handleIngestFile` (file sections). Both paths create TAG_ENRICHMENT tasks — both must be updated |
| Context Chain | Only applicable in `handleIngestFile` flow (multi-section documents). `handleIngest` creates single entries — no context chain needed |
| Expanded LLM Extraction | Requires changes to interfaces in `analyzer.ts`, prompts in `prompts.ts`, and response parsing in `analyzer.ts:parseResponse()` |
| structured_map storage | Requires new `updateStructuredMap()` method in `MemoryEngineCrud` (engine/crud.ts) — currently only `updateTags()` exists |
| Backward compatibility | Entries with `structured_map = '{}'` or `NULL` must be handled gracefully by all readers |
| Config flags | All new configs live in `TaskWorkerConfig.ts` (extended) and `LLMService.ts` |

**Technical Exclusions (TA Note):**
- `handleIngest` (single entry, non-file) code path currently truncates at 2000 chars (crud.ts:63) — this truncation is removed but NO context chain is added since there is only one entry per ingest
- The `maxTokens` in `LLMConfig` is currently 300 (`LLMService.ts:42`) — this MUST be increased for full-content analysis. A minimum of 2048 tokens is recommended for qwen3-8b
- The FTS trigger `knowledge_fts_au` updates `tags`, `summary`, `content` on UPDATE — structured_map changes do NOT trigger FTS rebuild. This is correct because `structured_map` is NOT in the FTS index

### 1.3 Definitions and Acronyms

| Term | Definition |
|------|------------|
| Context Chain | Technique of passing prior section's summary into the next section's LLM prompt to maintain document-level context |
| structured_map | JSON column in `knowledge_entries` table storing extraction results (tags, summary, entities, actors, rules) |
| TagAnalyzerService | Service in `llm/analyzer.ts` that uses LLM to extract tags/metadata from KB entry content |
| TaskWorker | Background worker processing `pending_tasks` (TAG_ENRICHMENT, VECTOR_EMBEDDING) |
| Chunking | Automatic content splitting when section exceeds LLM context window, with configurable overlap |
| Context Window | Maximum tokens an LLM can process in one request (qwen3-8b: ~32K tokens via LM Studio) |
| LLMService | Facade in `llm/LLMService.ts` providing multi-provider LLM access (Ollama, OpenAI, LM Studio) |
| FTS5 | Full-Text Search v5 — SQLite virtual table used for keyword search across KB entries |
| TAG_ENRICHMENT | Task type in `pending_tasks` for LLM-based tag/entity extraction from entry content |
| PendingTaskRepository | CRUD repository for `pending_tasks` table with claim/mark/retry semantics |
| Graceful Degradation | Fallback to keyword-based extraction when LLM is unavailable or times out |
| MemoryEngineCrud | Base CRUD class in `engine/crud.ts` providing insert/update/delete operations |
| Direct Ingest | Single-entry ingestion via `handleIngest` (no file splitting, no context chain) |
| File Ingest | Multi-section ingestion via `handleIngestFile` (splits by headings, supports context chain) |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-47/BRD.md |
| Code: Analyzer | backend/src/modules/memory/llm/analyzer.ts |
| Code: Prompts | backend/src/modules/memory/llm/prompts.ts |
| Code: LLMService | backend/src/modules/memory/llm/LLMService.ts |
| Code: OpenAI Adapter | backend/src/modules/memory/llm/openai-adapter.ts |
| Code: CRUD Dispatcher | backend/src/modules/memory/dispatchers/crud.ts |
| Code: TaskWorker | backend/src/modules/memory/task-queue/TaskWorker.ts |
| Code: PendingTaskRepo | backend/src/modules/memory/task-queue/PendingTaskRepository.ts |
| Code: Task Models | backend/src/modules/memory/task-queue/models.ts |
| Code: Engine CRUD | backend/src/modules/memory/engine/crud.ts |
| Code: Engine Core | backend/src/modules/memory/engine/core.ts |
| Code: Models | backend/src/modules/memory/models.ts |
| Code: Schema Tables | backend/src/modules/memory/schema/tables.ts |
| Code: Schema Indexes | backend/src/modules/memory/schema/indexes.ts |
| Code: Config | backend/src/modules/memory/task-queue/TaskWorkerConfig.ts |
| FSD Template | documents/templates/FSD-TEMPLATE.md |
| TA Agent Instructions | .opencode/agents/ta-agent.md |

<!-- TA enrichment -->

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)
*[Edit in draw.io](diagrams/system-context.drawio)*

The System Context Diagram illustrates the following actors and systems:
- **User / AI Agent** — invokes `mem_ingest_file` tool to ingest documents
- **MemoryModule** — the subject system, exposing MCP tools for KB operations
- **LLM Backend (LM Studio)** — external LLM service for tag/entity extraction
- **SQLite Database** — persistent storage for `knowledge_entries` and `pending_tasks`
- **TaskWorker** — background polling worker within the MemoryModule

### 2.2 System Architecture

#### 2.2.1 Component Overview

The Document Indexing pipeline involves the following components:

| Component | File | Role |
|-----------|------|------|
| MemoryEngine | `engine/core.ts` | Facade for all KB operations — extends MemoryEngineCrud |
| MemoryEngineCrud | `engine/crud.ts` | Base CRUD — `insert()`, `updateTags()`, `findById()` |
| handleIngestFile | `dispatchers/crud.ts` | File ingestion handler — splits by headings, creates entries + tasks |
| handleIngest | `dispatchers/crud.ts` | Single entry ingestion — creates entry + TAG_ENRICHMENT task |
| PendingTaskRepository | `task-queue/PendingTaskRepository.ts` | Task CRUD — `create()`, `claimNext()`, `markCompleted()` |
| TaskWorker | `task-queue/TaskWorker.ts` | Background worker — polls pending_tasks, processes TAG_ENRICHMENT |
| TagAnalyzerService | `llm/analyzer.ts` | LLM-based extraction — `analyzeTags()` method |
| LLMService | `llm/LLMService.ts` | Multi-provider LLM facade — `complete()`, `ask()` |
| OpenAIAdapter | `llm/openai-adapter.ts` | HTTP client for LM Studio / OpenAI-compatible APIs |

#### 2.2.2 Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Sequential section processing | Required for context chain | Context chain needs summary of section N-1 before processing section N. Current parallel for-loop creates all tasks at once — must be refactored |
| Task payload carries full content | Pass content in `payload.content`, not DB lookup | Avoids DB round-trip in TaskWorker; payload already contains content field |
| structured_map updated by TaskWorker | Direct SQL in processTagEnrichment | Consistent with existing pattern (updateTags uses direct SQL) |
| LLM maxTokens increased to 2048 | Token budget for full content | Current 300 tokens is too low for extended analysis + JSON output |
| Config via TaskWorkerConfig | Extended existing config pattern | Avoids creating new config infrastructure; all memory configs in one place |

<!-- TA enrichment -->

---



---

## 3. Functional Requirements

<!-- TA enrichment: Complete use cases with Alternative/Exception flows, API contracts, pseudocode -->

### 3.1 Feature: Full Content LLM Analysis (Remove 2000-char Truncation)

**Source:** BRD Story 1 — As a Developer, I want full section content sent to LLM (không truncate)

#### 3.1.1 Description

Remove all three 2000-character truncation points in the codebase (crud.ts lines 63, 197; analyzer.ts line 69). The LLM receives the full section content. For sections exceeding the LLM context window, automatic chunking with overlap is applied.

[Implements: BRD Story 1]

#### 3.1.2 Use Case

**Use Case ID:** UC-001
**Actor:** System (Document Indexing Pipeline)
**Preconditions:**
- A file has been split into sections by handleIngestFile
- A section has more than 10 characters of content
- LLM backend (LM Studio) is available

**Postconditions:**
- LLM receives the full section content (untruncated)
- knowledge_entries.tags is updated with extracted tags
- knowledge_entries.structured_map is updated with extraction results

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | handleIngestFile | Splits file into sections by markdown headings |
| 2 | | handleIngestFile | Creates knowledge_entries row for each section with full content |
| 3 | | PendingTaskRepository | Creates TAG_ENRICHMENT task with payload.content = full section content (no slice) |
| 4 | | TaskWorker | Claims task via claimNext() |
| 5 | | TagAnalyzerService | Calls analyzeTags(fullContent) |
| 6 | | TagAnalyzerService | Sends full content + SYSTEM_PROMPT to LLM |
| 7 | | LLM | Returns JSON with tags + summary + entities + actors + rules |
| 8 | | TagAnalyzerService | Parses LLM response via parseResponse() |
| 9 | | TaskWorker | Updates tags column via engine.updateTags() |
| 10 | | TaskWorker | Updates structured_map column via direct SQL |
| 11 | | PendingTaskRepository | Marks task as COMPLETED |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-001 | Section content exceeds LLM context window | Automatically chunk content with overlap; process each chunk; merge results |
| AF-002 | LLM returns partial/malformed JSON | Fallback regex extraction + fallbackUsed = true |
| AF-003 | Content less than 10 characters | Skip LLM analysis; return empty result; fallbackUsed = false |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-001 | LLM timeout (30s) | Catch timeout error; call fallbackKeywordExtraction(); set fallbackUsed = true |
| EF-002 | LLM backend unavailable (connection refused) | Log error; call fallbackKeywordExtraction(); set fallbackUsed = true |
| EF-003 | Chunking fails (out of memory) | Log warning; send content truncated to context window limit |
| EF-004 | DB update fails for structured_map | Log warning; tags update still succeeds (best-effort) |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-001 | Content MUST be non-NULL and length greater than 10 characters for LLM analysis | BRD Validation |
| BR-002 | If content exceeds LLM context window, automatic chunking with 200-char overlap must be applied | BRD Story 1 |
| BR-003 | Chunking overlap is configurable via llmChunkOverlap config (default: 200 characters) | BRD Story 1 |
| BR-004 | Max chunk size is configurable via llmChunkSize config (default: 6000 characters) | FSD TA |
| BR-005 | Chunking results are merged: tags are unioned, summary is from first chunk | FSD TA |
| BR-006 | LLM timeout is 30 seconds (unchanged from baseline) | BRD NFR |
| BR-007 | LLM maxTokens must be at least 2048 for full-content analysis (increased from 300) | FSD TA |

#### 3.1.4 Data Specifications

**Input Data (TAG_ENRICHMENT task payload):**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| entry_id | number | Yes | Must exist in knowledge_entries | ID of the entry to analyze |
| content | string | Yes | Length > 10, within context window | Full section content (no truncation) |
| existing_tags | string | No | Comma-separated tag names | Existing tags to merge with LLM results |
| options | object | No | threshold: 0-1, autoApply: boolean | TagAnalyzer options |
| context_summary | string | No | Length less than 500 chars | Summary of previous section (context chain) |

**Output Data (TagAnalysisResult):**

| Field | Type | Description |
|-------|------|-------------|
| appliedTags | string[] | Tags with confidence >= threshold (max 6) |
| suggestedTags | TagSuggestion[] | Tags with confidence < threshold |
| fallbackUsed | boolean | Whether fallback extraction was used |
| summary | string | 1-3 sentence summary (max 500 chars) |
| business_entities | string[] | Extracted business entities (max 5) |
| actors | string[] | Extracted actors/roles (max 5) |
| business_rules | string[] | Extracted business rules (max 10, each <= 300 chars) |

#### 3.1.5 API Contract (Functional View)

> Note: This is an internal code-level API, not an external HTTP endpoint.

**Internal API:** TagAnalyzerService.analyzeTags(content, options?, context?)
**Purpose:** Analyze entry content for tags + metadata via LLM

**Input Parameters:**

| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| content | string | Yes | BR-001 | Full section content |
| options | TagAnalyzeOptions | No | BR-006, BR-007 | threshold, autoApply |
| context | ContextChainInput | No | BR-003 | Previous section context |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| appliedTags | string[] | Tags above confidence threshold |
| suggestedTags | TagSuggestion[] | Tags below threshold |
| fallbackUsed | boolean | True if keyword extraction fallback was used |
| summary | string | Section summary (may be empty on fallback) |
| business_entities | string[] | Business entities (empty on fallback) |
| actors | string[] | Actors (empty on fallback) |
| business_rules | string[] | Business rules (empty on fallback) |

**Business Error Scenarios:**

| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| LLM timeout | LLM analysis timed out, using keyword fallback | LLM does not respond within 30s |
| Empty content | Content too short for analysis | content.length less than 10 |
| Context too long | Context summary truncated to 500 chars | context_summary.length > 500 |

### 3.2 Feature: Context Chain Between Sections

**Source:** BRD Story 2 — As a Developer, I want context chain between sections

#### 3.2.1 Description

Refactor section processing in handleIngestFile to support context chain. TaskWorker loads previous section summary from DB at processing time. Context chain provides awareness of document structure.

[Implements: BRD Story 2]

#### 3.2.2 Use Case

**Use Case ID:** UC-002
**Actor:** System (File Ingestion Pipeline)
**Preconditions:**
- A file has been split into 2+ sections
- enableContextChain config is true (default)

**Postconditions:**
- Section N prompt contains summary of section N-1 as context
- structured_map.context_chain contains reference to previous section

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | handleIngestFile | Initializes tracking for section context |
| 2 | | handleIngestFile | Inserts section entries and creates tasks (all with context=null initially) |
| 3 | | TaskWorker | Claims section N task |
| 4 | | TaskWorker | Queries DB for previous section in same file |
| 5 | | TaskWorker | If previous section found with structured_map.summary, builds context chain |
| 6 | | TagAnalyzerService | Sends full content + context chain to LLM |
| 7 | | LLM | Returns enriched JSON with previous section awareness |
| 8 | | TaskWorker | Updates structured_map with extraction + context_chain reference |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-010 | enableContextChain = false | Process all sections independently, no context prepended |
| AF-011 | Previous section has no summary (LLM failed) | Context chain empty; process without context; log warning |
| AF-012 | Context summary > 500 chars | Truncate to 500 chars |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-010 | Race condition: previous section not yet processed | No context; process independently; log info |
| EF-011 | Sequential processing total > 60s | Abort file; mark remaining tasks as FAILED |
| EF-012 | DB error reading previous section | No context; continue with current section |

#### 3.2.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-010 | Context chain only applies within the same file | BRD Story 2 |
| BR-011 | Context chain is forward-only (previous to current) | BRD Story 2 |
| BR-012 | Context summary is limited to 500 characters | BRD Story 2 |
| BR-013 | Context chain configurable via enableContextChain (default: true) | BRD Story 2 |
| BR-014 | Context chain format: [Previous section context: {summary}] + newline + {current_content} | BRD Story 2 |
| BR-015 | Empty context chain results in standard prompt | BRD Story 2 |
| BR-016 | Context chain includes previous section entities for continuity | FSD TA |

#### 3.2.4 Pseudocode - Context Chain in TaskWorker

```typescript
// [Implements: BRD Story 2]
// TaskWorker loads previous context at processing time

async function loadPreviousContext(
  entryId: number,
  source: string | null,
): Promise<ContextChainInput | null> {
  if (!source) return null;

  // Find previous section in same file
  const prevEntry = (this.engine.getDb() as any).prepare(
    'SELECT id, structured_map FROM knowledge_entries WHERE source = ? AND id < ? ORDER BY id DESC LIMIT 1'
  ).get(source, entryId);

  if (!prevEntry) return null;

  const map = safeParseStructuredMap(prevEntry.structured_map);
  if (!map.summary && !map.business_entities) return null;

  return {
    previous_section_id: prevEntry.id,
    summary: (map.summary || '').slice(0, 500), // BR-012
    business_entities: (map.business_entities || []).slice(0, 5),
    actors: (map.actors || []).slice(0, 5),
    business_rules: (map.business_rules || []).slice(0, 10),
  };
}
```

### 3.3 Feature: Expanded LLM Extraction

**Source:** BRD Story 3 — As a Developer, I want LLM to extract summary, business_entities, actors, business_rules

#### 3.3.1 Description

Extend TagSuggestion and TagAnalysisResult interfaces with 4 new fields. Update SYSTEM_PROMPT for expanded extraction. Update response parser with graceful fallback.

[Implements: BRD Story 3]

#### 3.3.2 Use Case

**Use Case ID:** UC-003
**Actor:** LLM Backend (LM Studio / qwen3-8b)
**Preconditions:** TagAnalyzerService.analyzeTags() called with content > 10 chars
**Postconditions:** TagAnalysisResult populated with all new fields

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | TagAnalyzerService | Sends ENHANCED_SYSTEM_PROMPT + user content to LLM |
| 2 | | LLM | Returns JSON with tags + summary + entities + actors + rules |
| 3 | | parseEnhancedResponse() | Parses JSON, validates all fields, caps at limits |
| 4 | | TagAnalyzerService | Returns TagAnalysisResult with all fields |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-020 | LLM returns valid JSON missing some new fields | Fill defaults ([] for arrays, empty string for summary); log warning |
| AF-021 | LLM returns old format (tags only) | Extract tags normally; new fields = defaults; fallbackUsed = false |
| AF-022 | Content less than 50 chars | LLM returns empty arrays; accept as-is |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-020 | LLM response not valid JSON | Regex fallback for tags; new fields = defaults; fallbackUsed = true |
| EF-021 | LLM returns more than 5 entities or 10 rules | Truncate to limits; take first N items |
| EF-022 | Summary longer than 500 chars | Truncate to 500 chars |

#### 3.3.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-020 | summary max 500 characters | BRD Story 3 |
| BR-021 | Each business_entity max 100 chars, must be a noun phrase | BRD Story 3 |
| BR-022 | Each actor max 100 characters | BRD Story 3 |
| BR-023 | Each business_rule max 300 characters | BRD Story 3 |
| BR-024 | business_entities max 5 items (truncate if exceeded) | BRD Story 3 |
| BR-025 | actors max 5 items (truncate if exceeded) | BRD Story 3 |
| BR-026 | business_rules max 10 items (truncate if exceeded) | BRD Story 3 |
| BR-027 | Missing fields default to empty array/empty string | BRD Story 3 |
| BR-028 | Old format (tags only) still works; new fields = defaults | BRD Story 3 |
| BR-029 | Unparseable response uses fallbackUsed = true, regex extraction | BRD Story 3 |

### 3.4 Feature: Store Extracted Data in structured_map

**Source:** BRD Story 4 — As a Developer, I want extracted data stored in structured_map column (JSON)

#### 3.4.1 Description

After LLM extraction in processTagEnrichment, persist full result to structured_map JSON column. Implement merge strategy to preserve existing file metadata. Add truncation for oversized structured_map.

[Implements: BRD Story 4]

#### 3.4.2 Use Case

**Use Case ID:** UC-004
**Actor:** TaskWorker
**Preconditions:** TagAnalyzerService returned TagAnalysisResult
**Postconditions:** structured_map column contains merged JSON; tags column updated independently

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | TaskWorker | Receives TagAnalysisResult from TagAnalyzerService |
| 2 | | processTagEnrichment | Updates tags column via engine.updateTags() |
| 3 | | processTagEnrichment | Reads existing structured_map from entry |
| 4 | | processTagEnrichment | Parses existing JSON (handles empty object or invalid) |
| 5 | | processTagEnrichment | Merges: LLM data overwrites, file metadata preserved |
| 6 | | processTagEnrichment | Adds extraction_meta: model, timestamp, fallback_used |
| 7 | | processTagEnrichment | Checks final JSON size less than 100KB; truncates if needed |
| 8 | | processTagEnrichment | Updates structured_map via direct SQL |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-030 | DB error on structured_map update | Log error; tags already updated; task still COMPLETED |
| EF-031 | JSON serialization error | Log error; skip structured_map update; tags still updated |

#### 3.4.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-030 | structured_map MUST be valid JSON | BRD Story 4 |
| BR-031 | structured_map max size: 100KB per entry | BRD Story 4 |
| BR-032 | Merge: LLM fields OVERWRITE; file metadata PRESERVE | BRD Story 4 |
| BR-033 | If larger than 100KB, truncate business_rules first, then actors | BRD Story 4 |
| BR-034 | structured_map failure does NOT block tags update | BRD Story 4 |
| BR-035 | extraction_meta includes: model, timestamp, fallback_used, context_chain_enabled | BRD Story 4 |
| BR-036 | context_chain includes: previous_section_id and previous_summary | BRD Story 4 |

### 3.5 Feature: Backward Compatibility

**Source:** BRD Story 5 — As a System, backward compatibility cho entries khong co structured_map

#### 3.5.1 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-040 | All readers of structured_map MUST handle missing fields with defaults | BRD Story 5 |
| BR-041 | structured_map default is '{}' (empty JSON object) | BRD Story 5 |
| BR-042 | Reading non-existent field returns empty array/empty string | BRD Story 5 |
| BR-043 | Writing uses merge strategy (never overwrites with '{}') | BRD Story 5 |
| BR-044 | Search, read, update operations NOT affected by structured_map format | BRD Story 5 |

### 3.6 Feature: Configurable Context Chain and Chunking

**Source:** BRD Story 6 — As a Developer, configurable context chain

#### 3.6.1 Configuration Schema (Extended TaskWorkerConfig)

```typescript
export interface TaskWorkerConfig {
  // Existing:
  baseInterval: number;       // 2000ms
  maxInterval: number;        // 30000ms
  staleThreshold: number;     // 300000ms
  maxRetries: number;         // 3

  // NEW (SA4E-47):
  enableContextChain: boolean;   // default: true
  contextChainMaxLength: number; // default: 500 (chars)
  llmChunkSize: number;          // default: 6000 (chars)
  llmChunkOverlap: number;       // default: 200 (chars)
  llmTimeout: number;            // default: 30000 (ms)
  structuredMapMaxSize: number;  // default: 102400 (bytes = 100KB)
}
```

#### 3.6.2 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-050 | enableContextChain default is true | BRD Story 6 |
| BR-051 | contextChainMaxLength default is 500 chars | BRD Story 6 |
| BR-052 | llmChunkSize default is 6000 chars | FSD TA |
| BR-053 | llmChunkOverlap default is 200 chars | BRD Story 1 |
| BR-054 | structuredMapMaxSize default is 102400 bytes | BRD Story 4 |

---

## 4. Data Model

<!-- TA enrichment: Verified against actual codebase entities -->

### 4.1 Entity Relationship Diagram

![ER Diagram](diagrams/er-diagram.png)
*[Edit in draw.io](diagrams/er-diagram.drawio)*

### 4.2 Logical Entities

#### Entity: knowledge_entries

The structured_map column already exists (TEXT, NOT NULL, DEFAULT '{}'). No schema changes needed.

| Attribute | Type | Required | Business Rule | Change? |
|-----------|------|----------|---------------|---------|
| id | INTEGER (PK) | Yes | — | No change |
| content | TEXT | Yes | BR-001 | No change |
| summary | TEXT | Yes | BR-020 | No change |
| tags | TEXT | No | — | No change |
| structured_map | TEXT (JSON) | No (default '{}') | BR-030 to BR-036 | Populated with new data |

**Merge Strategy:**
- fileMetadata fields (fileCreatedAt, fileAuthor, fileVersion) are NEVER overwritten
- LLM fields (summary, entities, actors, rules) are overwritten each time
- extraction_meta is always fresh

#### Entity: pending_tasks

| Attribute | Change? |
|-----------|---------|
| id | No change |
| task_type | No change |
| entry_id | No change |
| payload (TEXT JSON) | context field added (optional) |
| status | No change |

**Payload Schema Change:**

```
// CURRENT:
{
  entry_id: number;
  content: string;           // sliced to 2000 chars
  existing_tags: string;
  options: { threshold: 0.7, autoApply: true };
}

// NEW (SA4E-47):
{
  entry_id: number;
  content: string;           // FULL content
  existing_tags: string;
  options: { threshold: 0.7, autoApply: true };
  context?: {
    summary: string;
    business_entities: string[];
    actors: string[];
    business_rules: string[];
    previous_section_id: number;
  };
}
```

### 4.3 Data Migration

| Item | Migration Required? | Details |
|------|-------------------|---------|
| knowledge_entries schema | No | structured_map column already exists |
| pending_tasks schema | No | payload is TEXT JSON - backward compatible |
| Existing TAG_ENRICHMENT tasks | No | Old payloads lack context field - code checks for null |
| FTS triggers | No | structured_map not in FTS index |
| Indexes | No | No new indexes needed |

---

## 5. Integration Specifications

### 5.1 External System: LLM Backend (LM Studio)

| Attribute | Value |
|-----------|-------|
| Purpose | Analyze KB entry content for structured extraction |
| Direction | Outbound |
| Protocol | HTTP REST (OpenAI-compatible chat completions) |
| Data Format | JSON |
| Frequency | On-demand (per TAG_ENRICHMENT task) |
| Host | localhost:1234 (configurable) |
| Model | qwen3-8b (configurable) |

#### 5.1.1 API Contract

**Endpoint:** POST {baseUrl}/chat/completions

**Request Body:**

```json
{
  "model": "qwen3-8b",
  "messages": [
    {
      "role": "system",
      "content": "You analyze knowledge entries and extract structured information..."
    },
    {
      "role": "user",
      "content": "/no_think\n\n[Previous section context: Section summary...]\n\nFull content here..."
    }
  ],
  "temperature": 0.3,
  "max_tokens": 2048,
  "chat_template_kwargs": {
    "enable_thinking": false
  }
}
```

| Field | Current | SA4E-47 | Rationale |
|-------|---------|---------|-----------|
| max_tokens | 300 | 2048 | Full analysis + JSON output needs more budget |
| user content prefix | /no_think\nTag this:... | /no_think\n{context}\n{content} | Context chain + no truncation |

#### 5.1.2 Error Handling

| Error | Detection | Action | Retry? |
|-------|-----------|--------|--------|
| HTTP 4xx | !res.ok | Log, fallback keyword extraction | No |
| HTTP 5xx / Network | !res.ok or fetch throws | Exponential backoff, retry 3x | Yes |
| Timeout | Promise.race 30s | Fallback keyword extraction | Yes |
| Malformed JSON | JSON.parse throws | Regex fallback for tags | No |

### 5.2 Internal System: SQLite Database

**New SQL Operations:**

```sql
-- Update structured_map (in processTagEnrichment)
UPDATE knowledge_entries
SET structured_map = ?, updated_at = datetime('now')
WHERE id = ?;

-- Read previous section for context chain
SELECT id, structured_map
FROM knowledge_entries
WHERE source = ? AND id < ?
ORDER BY id DESC LIMIT 1;
```

---

## 6. Processing Logic

<!-- TA enrichment: Pseudocode, error handling per step, activity diagrams -->

### 6.1 Document Indexing with Context Chain

**Trigger:** mem_ingest_file MCP tool
**Input:** File path (markdown/text)
**Output:** JSON with status, entry count

#### 6.1.1 Processing Steps

| Step | Component | Description | Error Handling |
|------|-----------|-------------|----------------|
| 1 | handleIngestFile | Read file, split by headings | File not found -> return error |
| 2 | handleIngestFile | Delete existing entries with same source | DB error -> abort |
| 3 | handleIngestFile | Load file metadata | Missing -> empty metadata |
| 4 | handleIngestFile | For each section: insert entry, create task | Insert fail -> abort file |
| 5 | TaskWorker | Claim TAG_ENRICHMENT task | No analyzer -> reset for retry |
| 6 | TaskWorker | Fetch entry by ID | Not found -> mark FAILED |
| 7 | TaskWorker | Load previous section context (DB query) | No prev -> no context |
| 8 | TagAnalyzerService | Build prompt + send to LLM | Timeout -> fallback |
| 9 | TagAnalyzerService | Parse LLM response | Parse fail -> regex fallback |
| 10 | TaskWorker | Update tags | DB error -> log, continue |
| 11 | TaskWorker | Merge + update structured_map | DB error -> tags already saved |
| 12 | TaskWorker | Mark task COMPLETED | — |

#### 6.1.2 Activity Diagram

![Process Flow - Document Indexing](diagrams/process-document-indexing.png)
*[Edit in draw.io](diagrams/process-document-indexing.drawio)*

#### 6.1.3 Chunking Strategy

```typescript
// [Implements: BR-002 - Automatic chunking with overlap]

function chunkContent(
  content: string,
  chunkSize: number = 6000,
  overlap: number = 200,
): { chunks: string[]; totalChunks: number } {
  if (content.length <= chunkSize) {
    return { chunks: [content], totalChunks: 1 };
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < content.length) {
    const end = Math.min(start + chunkSize, content.length);
    chunks.push(content.slice(start, end));
    start = end - overlap;
    if (start >= content.length - overlap) break;
  }

  return { chunks, totalChunks: chunks.length };
}

// Merge results (BR-005): tags unioned, summary from first chunk
async function analyzeWithChunking(
  content: string,
  context: ContextChainInput | null,
  chunkSize: number,
  overlap: number,
): Promise<TagAnalysisResult> {
  const { chunks } = chunkContent(content, chunkSize, overlap);
  const results: TagAnalysisResult[] = [];

  for (const chunk of chunks) {
    const result = await analyzeWithLLM(chunk, undefined, context);
    results.push(result);
  }

  return {
    appliedTags: [...new Set(results.flatMap(r => r.appliedTags))].slice(0, 6),
    suggestedTags: results[0]?.suggestedTags ?? [],
    fallbackUsed: results.some(r => r.fallbackUsed),
    summary: results[0]?.summary ?? '',
    business_entities: [...new Set(results.flatMap(r => r.business_entities))].slice(0, 5),
    actors: [...new Set(results.flatMap(r => r.actors))].slice(0, 5),
    business_rules: [...new Set(results.flatMap(r => r.business_rules))].slice(0, 10),
  };
}
```

#### 6.1.4 Revised TagAnalyzerService.analyzeTags()

```typescript
async analyzeTags(
  content: string,
  options?: TagAnalyzeOptions,
  context?: ContextChainInput,
): Promise<TagAnalysisResult> {
  if (!content || content.trim().length < 10) {
    return { appliedTags: [], suggestedTags: [], fallbackUsed: false,
             summary: '', business_entities: [], actors: [], business_rules: [] };
  }

  const threshold = options?.threshold ?? 0.7;
  const autoApply = options?.autoApply ?? true;

  try {
    const maxTokens = this.llmService.getConfig().maxTokens ?? 2048;
    const estimatedTokens = Math.ceil(content.length / 3);
    const chunkSize = this.workerConfig?.llmChunkSize ?? 6000;

    let result: TagAnalysisResult;

    if (estimatedTokens > maxTokens && content.length > chunkSize) {
      result = await this.analyzeWithChunking(
        content, context,
        this.workerConfig?.llmChunkSize ?? 6000,
        this.workerConfig?.llmChunkOverlap ?? 200,
      );
    } else {
      const suggestions = await this.analyzeWithLLM(content, options, context);
      result = this.applyThresholdWithExtended(suggestions, threshold, autoApply);
    }

    return result;
  } catch (err) {
    this.logger?.warn({ err }, 'LLM analysis failed, using fallback');
    return this.fallbackWithExtended(content, threshold);
  }
}
```

<!-- End sections 3-6 -->


## 7. Security Requirements

<!-- TA enrichment: Auth flow details, encryption specs, audit trail implementation -->

### 7.1 Authentication and Authorization

| Role | Permissions | Features |
|------|-------------|----------|
| AI Agent (caller of mem_ingest_file) | Create entries, trigger analysis | Full access through MCP tools |
| TaskWorker (internal) | Read entries, update tags + structured_map | Internal system access — no external auth |
| Developer (maintainer) | Read logs, monitor tasks | Admin visibility via getTaskStats |

**Authentication:**
- MCP tool calls (mem_ingest_file) are authenticated by the MCP framework (external to this feature)
- TaskWorker runs in-process — no API authentication needed
- LLM backend is local (localhost:1234) — no auth required in current setup

### 7.2 Data Sensitivity Classification

| Data Type | Classification | Business Requirement |
|-----------|---------------|---------------------|
| Entry content | Internal | May contain business logic, architecture decisions |
| structured_map fields | Internal | Contains extracted business entities, rules, actors |
| LLM prompts (sent to LM Studio) | Internal | Local LLM — data does not leave the machine |
| File metadata | Public | No sensitive data |

**TA Note:** If LLM backend is ever changed to a cloud provider (OpenAI, Anthropic), ALL data sent in prompts leaves the local machine. A data sensitivity review would be required at that point.

### 7.3 Audit Trail

| Event | Logged Fields | Retention | Business Reason |
|-------|--------------|-----------|-----------------|
| TAG_ENRICHMENT task created | entry_id, task_type, payload size | Indefinite (in pending_tasks) | Debug extraction issues |
| LLM analysis timeout | entry_id, error message | Indefinite (logger) | Monitor LLM health |
| structured_map truncated | entry_id, truncated field, size | Indefinite (logger) | Audit data loss |
| Fallback extraction used | entry_id, fallback reason | Indefinite (in extraction_meta) | Track extraction quality |

---

## 8. Non-Functional Requirements

| Category | Business Requirement | Acceptance Criteria | Measurement |
|----------|---------------------|---------------------|-------------|
| Performance | LLM analysis latency for section <= 5000 chars | Response time <= 10s (p95) for full content | Measure from analyzeTags() call to result return |
| Performance | Context chain overhead | <= 50ms per section (DB query for prev summary) | Measured in TaskWorker.processTagEnrichment |
| Performance | Chunking overhead | <= 200ms per additional chunk (LLM call time excluded) | Measured per chunk |
| Performance | File ingestion throughput | >= 5 sections/second for typical documents | File-level measurement |
| Scalability | Max section content length | Up to 10000 chars before chunking activated | Content length check |
| Scalability | structured_map max size | 100KB per entry, enforced with truncation | JSON.stringify().length check |
| Scalability | Concurrent file processing | TaskWorker processes 1 task at a time (baseInterval = 2s) | TaskWorker is single-threaded |
| Availability | LLM failure handling | 100% graceful degradation (keyword fallback always available) | No crash if LLM is down |
| Availability | structured_map update failure | 0% impact on tags update (isolated DB writes) | Tags always updated even if structured_map fails |
| Reliability | Content integrity | Extraction NEVER modifies original content in DB | Content column is read-only in this flow |
| Configurability | Context chain toggle | enableContextChain: true/false takes effect without restart | Read from TaskWorkerConfig at runtime |
| Configurability | Chunking parameters | llmChunkSize, llmChunkOverlap configurable | Read from TaskWorkerConfig |
| Backward Compatibility | Old entries with '{}' structured_map | 100% operational — no errors, no missing fields | All reads use safeParseStructuredMap |
| Observability | Extraction quality tracking | extraction_meta.fallback_used flag in structured_map | Queryable via structured_map JSON |

### 8.1 Performance Budgets

| Operation | Current (baseline) | Target (SA4E-47) | Budget Delta |
|-----------|-------------------|-------------------|--------------|
| Single TAG_ENRICHMENT (2000 chars) | ~5s | ~5s (no truncation change for short content) | +0s |
| Single TAG_ENRICHMENT (5000 chars) | ~5s (truncated) | ~8s (full content + more tokens) | +3s |
| Context chain prepend | N/A | < 5ms (string operation) | +5ms |
| Previous section DB lookup | N/A | < 10ms (indexed by source + id) | +10ms |
| structured_map JSON merge | N/A | < 2ms (in-memory object merge) | +2ms |
| File with 10 sections | ~55s (parallel-ish) | ~85s (sequential, more tokens) | +30s |

### 8.2 Token Cost Analysis

| Scenario | Avg Input Tokens | Avg Output Tokens | Cost per Section |
|----------|-----------------|-------------------|------------------|
| Current (2000 chars truncated) | ~700 | ~80 | Low |
| Full content (5000 chars, no context) | ~1700 | ~150 | Medium |
| Full content + context chain | ~1900 | ~150 | Medium+ |
| Chunked (10000 chars into 2 chunks) | ~3400 | ~300 | High |

**Note:** Since the LLM is local (LM Studio), token cost is not monetary. The concern is latency.

---

## 9. Error Handling and Logging

### 9.1 Error Scenarios

| ID | Scenario | Severity | User Message / Log Entry | Expected Behavior |
|----|----------|----------|-------------------------|-------------------|
| ERR-001 | Content too short (< 10 chars) | Info | "Content too short for LLM analysis (n chars)" | Return empty result; no LLM call |
| ERR-002 | LLM timeout (30s) | Warning | "LLM analysis timed out after 30s for entry {id}" | Fallback to keyword extraction; fallbackUsed = true |
| ERR-003 | LLM connection refused | Error | "LLM backend unavailable at {url}: connection refused" | Fallback to keyword extraction; fallbackUsed = true |
| ERR-004 | LLM returns HTTP error | Error | "LLM returned HTTP {status} for entry {id}" | Fallback to keyword extraction; fallbackUsed = true |
| ERR-005 | LLM response unparseable | Warning | "LLM response could not be parsed as JSON for entry {id}" | Fallback regex extraction for tags; fallbackUsed = true |
| ERR-006 | LLM response missing all new fields | Info | "LLM returned old format (tags only) for entry {id}" | Fill defaults; fallbackUsed = false |
| ERR-007 | structured_map DB update fails | Warning | "Failed to update structured_map for entry {id}: {error}" | Tags already updated; task still COMPLETED |
| ERR-008 | structured_map > 100KB | Warning | "structured_map for entry {id} exceeds 100KB. Truncated." | Truncate arrays; log which fields truncated |
| ERR-009 | Context chain empty (no prev section) | Info | "No previous section context found for entry {id}" | Process without context; continue normally |
| ERR-010 | Context chain truncated (> 500 chars) | Debug | "Context chain summary truncated from {n} to 500 chars" | Truncate to 500 chars; continue |
| ERR-011 | Chunking fails (unexpected error) | Error | "Chunking failed for entry {id}: {error}" | Send truncated content to context window limit |
| ERR-012 | Entry not found during task processing | Error | "Entry {id} not found for task {taskId}" | Mark task FAILED |
| ERR-013 | Task payload invalid JSON | Error | "Invalid JSON payload for task {taskId}" | Mark task FAILED |

### 9.2 Structured Logging Format

All logs from the SA4E-47 feature follow the existing structured logging pattern (Pino logger):

```typescript
// Standard format:
logger.info({ entry_id: 42, component: 'TagAnalyzerService' }, 'LLM analysis completed');
logger.warn({ entry_id: 42, err, component: 'TaskWorker' }, 'structured_map update failed');
logger.error({ entry_id: 42, err, component: 'TaskWorker' }, 'LLM analysis failed');

// Context chain logs:
logger.debug({
  entry_id: 42,
  prev_section_id: 41,
  context_length: 350,
  component: 'TaskWorker',
}, 'Context chain applied');

// structured_map operations:
logger.debug({
  entry_id: 42,
  structured_map_size: 2048,
  fields: ['summary', 'business_entities', 'actors', 'business_rules'],
  component: 'TaskWorker',
}, 'structured_map updated');

// Fallback tracking:
logger.warn({
  entry_id: 42,
  fallback_reason: 'llm_timeout',
  component: 'TagAnalyzerService',
}, 'Fallback extraction used');
```

---

## 10. Testing Considerations

### 10.1 Test Scenarios

| ID | Scenario | Input | Expected Output | Priority | Type |
|----|----------|-------|-----------------|----------|------|
| TC-001 | Ingest file with single section (full content) | File with 1 section, 3000 chars | LLM receives 3000 chars; result.tags has >= 1 tag | High | Integration |
| TC-002 | Ingest file with 3 sections (context chain) | File with 3 sections | Section 2 prompt contains summary of section 1 | High | Integration |
| TC-003 | Context chain disabled | File with 3 sections, enableContextChain=false | Each section processed independently | High | Integration |
| TC-004 | LLM timeout | Content sent to LLM, simulated hang 35s | Fallback extraction used; fallbackUsed = true | High | Integration |
| TC-005 | LLM unavailable | LM Studio stopped | Fallback extraction used; tags from keywords | High | Integration |
| TC-006 | LLM returns old format (tags only) | LLM returns `{"tags":[...]}` without new fields | parseEnhancedResponse fills defaults; no crash | High | Unit |
| TC-007 | LLM returns invalid JSON | LLM returns "I think the tags are..." | Regex fallback extracts tags; fallbackUsed = true | High | Unit |
| TC-008 | structured_map merge (existing metadata) | Entry with structured_map with fileCreatedAt | fileCreatedAt preserved; new fields added | High | Unit |
| TC-009 | structured_map > 100KB | Existing large map + new data = 120KB | business_rules truncated; log warning | Medium | Unit |
| TC-010 | Backward compat: old entry | Entry with structured_map = '{}' | safeParseStructuredMap returns {}; no errors | High | Integration |
| TC-011 | Content < 10 chars | Empty section | Skip LLM; return empty result | Medium | Unit |
| TC-012 | Context chain: prev section LLM failed | Section 1 LLM timeout; section 2 | Section 2 processed without context; log info | Medium | Integration |
| TC-013 | Chunking activated | Content 15000 chars, chunkSize=6000, overlap=200 | 3 chunks; results merged; tags deduplicated | High | Integration |
| TC-014 | Performance: 5000 chars section | 5000 char content | Response <= 10s (p95) | High | Performance |
| TC-015 | structured_map update fails | Simulate DB error after tags update | Tags updated; task COMPLETED; log warning | High | Integration |
| TC-016 | Safe JSON parse: null input | structured_map = null | Returns {} | Medium | Unit |
| TC-017 | Safe JSON parse: empty string | structured_map = '' | Returns {} | Medium | Unit |
| TC-018 | Safe JSON parse: array (invalid) | structured_map = '["a","b"]' | Returns {} (not array) | Medium | Unit |
| TC-019 | Chunking merge: union tags | Chunk 1: tags=[a,b]; Chunk 2: tags=[b,c] | Applied tags: [a,b,c] | Medium | Unit |
| TC-020 | Full cycle: file -> task -> worker -> structured_map | Complete file ingestion flow | Entry with populated structured_map in DB | High | E2E |

### 10.2 Performance Test Targets

| Test | Target | Method |
|------|--------|--------|
| LLM analysis latency (5000 chars) | < 10s p95 | Run 20 iterations with 5000-char content; measure response time |
| File ingestion (10 sections) | < 90s total | Ingest file with 10 sections; measure from call to last task completion |
| Context chain overhead | < 50ms per section | Measure time to query prev section + prepend context |
| structured_map merge | < 5ms per operation | Measure JSON parse + merge + stringify for 10KB map |
| Memory usage (chunking) | < 50MB additional heap | Process 20000 char content with chunking; measure heap delta |


---

## 11. Appendix

### 11.1 Diagrams

| Diagram | File |
|---------|------|
| System Context | [system-context.png](diagrams/system-context.png) |
| ER Diagram | [er-diagram.png](diagrams/er-diagram.png) |
| Process Flow - Document Indexing | [process-document-indexing.png](diagrams/process-document-indexing.png) |
| Sequence - Context Chain Flow | [sequence-context-chain.png](diagrams/sequence-context-chain.png) |
| State - Task Lifecycle | [state-task-lifecycle.png](diagrams/state-task-lifecycle.png) |

### 11.2 Change Log from BRD

| BRD Item | BRD Section | FSD Clarification / Change |
|----------|-------------|---------------------------|
| handleIngest truncation | BRD Story 1 | Truncation is removed but NO context chain added (single entry) |
| handleIngestFile parallel loop | BRD Story 2 | Context chain requires sequential processing. Simplified approach: TaskWorker loads previous context via SQL at runtime instead of creating tasks sequentially |
| context chain pseudocode | BRD Appendix (Technical Notes) | Simplified: all tasks created at once with context=null; TaskWorker loads previous context via SQL query at processing time |
| maxTokens in LLM config | BRD Technical Notes | BRD did not specify maxTokens increase; FSD specifies from 300 to 2048 |
| Configuration schema | BRD Section 6 (NFR) | BRD listed config requirements; FSD defines exact interface with defaults |
| Token estimation for chunking | BRD Story 1 | BRD did not specify how to detect content exceeding context window; FSD adds char/token estimation (chars / 3) |
| updateStructuredMap() method | BRD Story 4 | BRD did not specify that this new DB method must be added to MemoryEngineCrud |

### 11.3 Open Issues

| ID | Issue | Owner | Target Date | Status |
|----|-------|-------|-------------|--------|
| OI-001 | Determine appropriate maxTokens value for qwen3-8b via LM Studio | SA (Solution Architect) | 2026-07-20 | OPEN - needs benchmarking |
| OI-002 | Decide context chain approach: in-memory Map vs DB query for previous section context | TA (Technical Architect) | 2026-07-19 | OPEN - recommended: DB query |
| OI-003 | Verify MemoryEngineCrud.getDb() removal (SA4E-45) does not conflict with direct SQL in processTagEnrichment | DEV | 2026-07-21 | OPEN - check SA4E-45 branch |
| OI-004 | Benchmark chunking overlap value: 200 chars optimal for 6000-char chunks? | QA | 2026-07-22 | OPEN - needs empirical testing |
| OI-005 | Should extraction_meta include token_count (prompt + completion tokens)? | BA | 2026-07-19 | OPEN - useful for cost tracking |
| OI-006 | Handle race condition: section N task starts before section N-1 summary written | TA | 2026-07-20 | OPEN - DB query resolves it |

### 11.4 Implementation Sequence (Recommended)

**Phase 1 - Core Changes (P0, Day 1-2):**

| Step | File(s) | Change | Effort |
|------|---------|--------|--------|
| 1 | llm/analyzer.ts | Update TagAnalysisResult interface with 4 new fields | 0.5h |
| 2 | llm/prompts.ts | Update SYSTEM_PROMPT to ENHANCED_SYSTEM_PROMPT | 0.5h |
| 3 | llm/analyzer.ts | Modify parseResponse to parse new fields | 1h |
| 4 | llm/analyzer.ts | Remove content.slice(0,2000) in analyzeWithLLM | 0.25h |
| 5 | dispatchers/crud.ts | Remove content.slice(0,2000) in handleIngest (line 63) | 0.25h |
| 6 | dispatchers/crud.ts | Remove sec.trim().slice(0,2000) in handleIngestFile (line 197) | 0.25h |

**Phase 2 - structured_map Storage (P0, Day 2-3):**

| Step | File(s) | Change | Effort |
|------|---------|--------|--------|
| 7 | engine/crud.ts | Add updateStructuredMap() method | 0.5h |
| 8 | task-queue/TaskWorker.ts | Update processTagEnrichment to write structured_map | 1.5h |
| 9 | llm/analyzer.ts | Add fallbackWithExtended() method | 1h |
| 10 | llm/analyzer.ts | Add safeParseStructuredMap helper | 0.5h |

**Phase 3 - Context Chain (P1, Day 3-4):**

| Step | File(s) | Change | Effort |
|------|---------|--------|--------|
| 11 | task-queue/TaskWorker.ts | Add loadPreviousContext() method | 1h |
| 12 | task-queue/TaskWorker.ts | Modify processTagEnrichment to accept context parameter | 1h |
| 13 | llm/prompts.ts | Add context chain instructions to SYSTEM_PROMPT | 0.5h |
| 14 | llm/analyzer.ts | Add context parameter to analyzeTags and analyzeWithLLM | 1h |
| 15 | dispatchers/crud.ts | Pass context in task payload (or let TaskWorker load it) | 0.5h |

**Phase 4 - Config, Chunking, Polish (P1/P2, Day 4-5):**

| Step | File(s) | Change | Effort |
|------|---------|--------|--------|
| 16 | task-queue/TaskWorkerConfig.ts | Add new config fields with defaults | 0.5h |
| 17 | llm/analyzer.ts | Add chunkContent() and analyzeWithChunking() | 2h |
| 18 | llm/analyzer.ts | Add estimateTokenCount() helper | 0.5h |
| 19 | llm/LLMService.ts | Increase default maxTokens to 2048 | 0.25h |
| 20 | All affected files | Backward compatibility testing + edge case hardening | 2h |

### 11.5 Affected Files Summary

| File | Lines | Change Type | Impact |
|------|-------|-------------|--------|
| llm/analyzer.ts | 11-22, 65-83, 85-118, 137-162 | Modify (interface + methods) | High |
| llm/prompts.ts | 56-71 | Modify (SYSTEM_PROMPT) | High |
| llm/types.ts | No changes needed | None | None |
| llm/LLMService.ts | 42 | Minor (maxTokens default 300 -> 2048) | Low |
| dispatchers/crud.ts | 63, 197 | Modify (remove .slice(0,2000)) | Medium |
| task-queue/TaskWorker.ts | 181-199 | Modify (processTagEnrichment enhanced) | High |
| task-queue/models.ts | No changes needed | None | None |
| task-queue/TaskWorkerConfig.ts | 6-15, 17-22 | Modify (add new config fields) | Low |
| engine/crud.ts | 48-52 (new method) | Add (updateStructuredMap) | Medium |
| models.ts | No changes needed | None | None |

### 11.6 Sample Payloads

**TAG_ENRICHMENT Task Payload (with context chain):**

```json
{
  "entry_id": 101,
  "content": "## User Management\n\nAdministrators can create, edit, and delete users... (5000 chars)",
  "existing_tags": "auth,security",
  "options": {
    "threshold": 0.7,
    "autoApply": true
  },
  "context": {
    "summary": "Describes JWT-based authentication with password validation requiring 8+ characters and session expiry after 24 hours",
    "business_entities": ["User", "Session", "JWT"],
    "actors": ["User", "System"],
    "business_rules": ["Password must be at least 8 characters with one special character", "Session expires after 24 hours of inactivity"],
    "previous_section_id": 100
  }
}
```

**structured_map After Processing (Section 2 of 3-section file):**

```json
{
  "summary": "Describes user management with role-based access control for Admin, Editor, and Viewer roles",
  "business_entities": ["User", "Admin", "Editor", "Viewer"],
  "actors": ["Administrator", "End User"],
  "business_rules": ["Only Administrators can delete users", "Role-based access control determines feature access"],
  "context_chain": {
    "previous_section_id": 100,
    "previous_summary": "Describes JWT-based authentication with password validation requiring 8+ characters and session expiry after 24 hours"
  },
  "extraction_meta": {
    "model": "qwen3-8b",
    "timestamp": "2026-07-18T10:05:00Z",
    "fallback_used": false,
    "context_chain_enabled": true
  },
  "fileCreatedAt": "2026-07-17",
  "fileAuthor": "developer",
  "fileVersion": "1.0"
}
```

### 11.7 Draw.io Diagrams XML

#### System Context Diagram

```xml
<mxGraphModel adaptiveColors="auto"><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="User / AI Agent" style="shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;" vertex="1" parent="1"><mxGeometry x="40" y="200" width="40" height="60" as="geometry"/></mxCell><mxCell id="3" value="&lt;b&gt;MemoryModule&lt;/b&gt;&lt;br&gt;Document Indexing&lt;br&gt;+ Context Chain" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1"><mxGeometry x="240" y="170" width="180" height="120" as="geometry"/></mxCell><mxCell id="4" value="LLM Backend&lt;br&gt;(LM Studio)" style="shape=cylinder;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;" vertex="1" parent="1"><mxGeometry x="540" y="50" width="120" height="80" as="geometry"/></mxCell><mxCell id="5" value="SQLite&lt;br&gt;Database" style="shape=cylinder;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1"><mxGeometry x="540" y="200" width="120" height="80" as="geometry"/></mxCell><mxCell id="6" value="mem_ingest_file" style="html=1;edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="2" target="3"><mxGeometry relative="1" as="geometry"><mxPoint x="80" y="230" as="sourcePoint"/><mxPoint x="240" y="230" as="targetPoint"/></mxGeometry></mxCell><mxCell id="7" value="LLM API (HTTP)" style="html=1;edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="3" target="4"><mxGeometry relative="1" as="geometry"><mxPoint x="420" y="190" as="sourcePoint"/><mxPoint x="540" y="90" as="targetPoint"/></mxGeometry></mxCell><mxCell id="8" value="SQL queries" style="html=1;edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="3" target="5"><mxGeometry relative="1" as="geometry"><mxPoint x="420" y="260" as="sourcePoint"/><mxPoint x="540" y="240" as="targetPoint"/></mxGeometry></mxCell></root></mxGraphModel>
```

#### Sequence Diagram - Context Chain Flow

```xml
<mxGraphModel adaptiveColors="auto"><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="Agent" style="shape=umlLifeline;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="20" y="80" width="80" height="400" as="geometry"/></mxCell><mxCell id="3" value="handleIngestFile" style="shape=umlLifeline;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="140" y="80" width="80" height="400" as="geometry"/></mxCell><mxCell id="4" value="DB" style="shape=umlLifeline;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="260" y="80" width="80" height="400" as="geometry"/></mxCell><mxCell id="5" value="TaskWorker" style="shape=umlLifeline;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="380" y="80" width="80" height="400" as="geometry"/></mxCell><mxCell id="6" value="LLM" style="shape=umlLifeline;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="500" y="80" width="80" height="400" as="geometry"/></mxCell><mxCell id="7" value="mem_ingest_file" style="html=1;edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="2" target="3"><mxGeometry relative="1" as="geometry"><mxPoint x="100" y="110" as="sourcePoint"/><mxPoint x="140" y="110" as="targetPoint"/></mxGeometry></mxCell><mxCell id="9" value="split by headings" style="html=1;" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="180" y="150" as="sourcePoint"/><mxPoint x="180" y="180" as="targetPoint"/><Array as="points"><mxPoint x="230" y="150"/><mxPoint x="230" y="180"/></Array></mxGeometry></mxCell><mxCell id="10" value="INSERT Section 1" style="html=1;edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="3" target="4"><mxGeometry relative="1" as="geometry"><mxPoint x="220" y="210" as="sourcePoint"/><mxPoint x="260" y="210" as="targetPoint"/></mxGeometry></mxCell><mxCell id="11" value="CREATE TAG_ENRICHMENT (full content)" style="html=1;edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="3" target="4"><mxGeometry relative="1" as="geometry"><mxPoint x="220" y="250" as="sourcePoint"/><mxPoint x="260" y="250" as="targetPoint"/></mxGeometry></mxCell><mxCell id="12" value="claim task" style="html=1;edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="5" target="4"><mxGeometry relative="1" as="geometry"><mxPoint x="380" y="290" as="sourcePoint"/><mxPoint x="340" y="290" as="targetPoint"/></mxGeometry></mxCell><mxCell id="13" value="analyzeTags(content, context=null)" style="html=1;edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="5" target="6"><mxGeometry relative="1" as="geometry"><mxPoint x="420" y="330" as="sourcePoint"/><mxPoint x="500" y="330" as="targetPoint"/></mxGeometry></mxCell><mxCell id="14" value="extraction result" style="html=1;edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="6" target="5"><mxGeometry relative="1" as="geometry"><mxPoint x="500" y="370" as="sourcePoint"/><mxPoint x="460" y="370" as="targetPoint"/></mxGeometry></mxCell><mxCell id="15" value="UPDATE tags + structured_map" style="html=1;edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="5" target="4"><mxGeometry relative="1" as="geometry"><mxPoint x="380" y="410" as="sourcePoint"/><mxPoint x="340" y="410" as="targetPoint"/></mxGeometry></mxCell></root></mxGraphModel>
```

#### State Diagram - Task Lifecycle

```xml
<mxGraphModel adaptiveColors="auto"><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="PENDING" style="ellipse;whiteSpace=wrap;html=1;fillColor=#dae8fc;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="100" height="50" as="geometry"/></mxCell><mxCell id="3" value="PROCESSING" style="ellipse;whiteSpace=wrap;html=1;fillColor=#fff2cc;" vertex="1" parent="1"><mxGeometry x="200" y="40" width="100" height="50" as="geometry"/></mxCell><mxCell id="4" value="COMPLETED" style="ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;" vertex="1" parent="1"><mxGeometry x="360" y="40" width="100" height="50" as="geometry"/></mxCell><mxCell id="5" value="FAILED" style="ellipse;whiteSpace=wrap;html=1;fillColor=#f8cecc;" vertex="1" parent="1"><mxGeometry x="360" y="160" width="100" height="50" as="geometry"/></mxCell><mxCell id="6" value="claimNext()" style="html=1;" edge="1" parent="1" source="2" target="3"><mxGeometry relative="1" as="geometry"><mxPoint x="140" y="65" as="sourcePoint"/><mxPoint x="200" y="65" as="targetPoint"/></mxGeometry></mxCell><mxCell id="7" value="markCompleted()" style="html=1;" edge="1" parent="1" source="3" target="4"><mxGeometry relative="1" as="geometry"><mxPoint x="300" y="65" as="sourcePoint"/><mxPoint x="360" y="65" as="targetPoint"/></mxGeometry></mxCell><mxCell id="8" value="markFailed()" style="html=1;" edge="1" parent="1" source="3" target="5"><mxGeometry relative="1" as="geometry"><mxPoint x="250" y="90" as="sourcePoint"/><mxPoint x="360" y="185" as="targetPoint"/></mxGeometry></mxCell><mxCell id="9" value="resetForRetry()" style="html=1;edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="5" target="2"><mxGeometry relative="1" as="geometry"><mxPoint x="410" y="160" as="sourcePoint"/><mxPoint x="90" y="90" as="targetPoint"/></mxGeometry></mxCell></root></mxGraphModel>
```

<!-- TA enrichment: End of document -->
