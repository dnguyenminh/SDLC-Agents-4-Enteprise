# Technical Design Document (TDD)

## KB Evolution Memory — SA4E-47: Cải tiến Document Indexing với LLM Context Chain

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-47 |
| Title | Cải tiến Document Indexing với LLM Context Chain |
| Author | SA Agent — Solution Architect |
| Version | 1.0 |
| Date | 2026-07-18 |
| Status | Draft |
| Related BRD | documents/SA4E-47/BRD.md |
| Related FSD | documents/SA4E-47/FSD.md |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | SA Agent – Solution Architect | Create document |
| Peer Reviewer | TA Agent – Technical Architect | Review technical feasibility |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-18 | SA Agent | Initiate document — auto-generated from BRD v1.0, FSD v1.0, and codebase analysis |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm the technical design in this TDD |
| | ☐ I agree and confirm the technical design in this TDD |

---

## 1. Introduction

### 1.1 Purpose

This Technical Design Document (TDD) specifies the **HOW** for implementing SA4E-47: Cải tiến Document Indexing với LLM Context Chain. It translates the functional requirements from FSD v1.0 into concrete technical designs: architecture decisions, algorithm designs, class/module changes, database interactions, prompt templates, and implementation sequence.

The feature addresses four key improvements to the Knowledge Base (KB) document indexing pipeline:
1. **Full content LLM analysis** — Remove the 2000-character truncation that causes context loss
2. **Context chain** — Pass previous section summary to current section's LLM prompt for document-level awareness
3. **Expanded LLM extraction** — Extract `summary`, `business_entities`, `actors`, `business_rules` in addition to `tags`
4. **structured_map storage** — Persist expanded extraction results into the existing `structured_map` JSON column

### 1.2 Scope

| Component | Scope | Changes |
|-----------|-------|---------|
| `dispatchers/crud.ts` | handleIngest, handleIngestFile | Remove truncation, no context chain for single ingest |
| `llm/analyzer.ts` | TagAnalyzerService | New interfaces, chunking, context param, enhanced parsing |
| `llm/prompts.ts` | SYSTEM_PROMPT | ENHANCED_SYSTEM_PROMPT for expanded extraction + context |
| `llm/LLMService.ts` | LLMService config | Increase maxTokens from 300 to 2048 |
| `task-queue/TaskWorker.ts` | processTagEnrichment | structured_map update, loadPreviousContext |
| `task-queue/TaskWorkerConfig.ts` | Config interface | Add enableContextChain, chunkSize, overlap, etc. |
| `engine/crud.ts` | MemoryEngineCrud | Add updateStructuredMap() method |

**Out of Scope:**
- Schema changes (structured_map and pending_tasks schemas unchanged)
- FTS5 indexing changes (structured_map NOT in FTS index)
- UI/Admin Portal for structured_map visualization
- Search on structured_map fields (separate ticket)
- Backend architecture changes (Hono routing, MCP tools, DatabaseAdapter)

### 1.3 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript | 5.x |
| Runtime | Node.js | 20.x |
| Framework | Hono | 4.x |
| Database | SQLite (better-sqlite3) | 11.x |
| LLM Backend | LM Studio (qwen3-8b) | latest |
| LLM Protocol | OpenAI-compatible Chat Completions | v1 |
| Logger | Pino | 9.x |
| Build | TypeScript Compiler (tsc) | 5.x |

### 1.4 Design Principles

- **SOLID**: Each class has single responsibility; interfaces are focused and segregated
- **Graceful Degradation**: LLM failure never blocks ingestion; keyword fallback always available
- **Backward Compatibility**: All existing entries with `structured_map = '{}'` remain fully operational
- **Configurability**: Context chain, chunking parameters, and timeouts are configurable
- **Merge over Overwrite**: structured_map merge strategy preserves existing file metadata
- **Sequential over Parallel**: Context chain requires ordered section processing via runtime DB lookup

### 1.5 Constraints

| Constraint | Details |
|------------|---------|
| LLM Context Window | qwen3-8b via LM Studio: ~32K tokens. Must handle sections up to 10K chars before chunking |
| TaskWorker is single-threaded | Processes 1 task at a time; polling interval 2s base |
| SQLite WAL mode | Background tasks don't block reads; but writes are sequential |
| No schema migration | structured_map already exists (DEFAULT '{}'); zero migration needed |
| LLM maxTokens increased to 2048 | From 300; supports full analysis + JSON output |
| No new npm dependencies | All changes use existing libraries (Pino, better-sqlite3, Hono) |

### 1.6 References

| Document | Location |
|----------|----------|
| BRD v1.0 | documents/SA4E-47/BRD.md |
| FSD v1.0 | documents/SA4E-47/FSD.md |
| Code: Analyzer | backend/src/modules/memory/llm/analyzer.ts |
| Code: Prompts | backend/src/modules/memory/llm/prompts.ts |
| Code: CRUD Dispatcher | backend/src/modules/memory/dispatchers/crud.ts |
| Code: TaskWorker | backend/src/modules/memory/task-queue/TaskWorker.ts |
| Code: TaskWorkerConfig | backend/src/modules/memory/task-queue/TaskWorkerConfig.ts |
| Code: PendingTaskRepo | backend/src/modules/memory/task-queue/PendingTaskRepository.ts |
| Code: Models | backend/src/modules/memory/task-queue/models.ts |
| Code: LLMService | backend/src/modules/memory/llm/LLMService.ts |
| Code: OpenAIAdapter | backend/src/modules/memory/llm/openai-adapter.ts |
| Code: Engine CRUD | backend/src/modules/memory/engine/crud.ts |
| Code: Memory Models | backend/src/modules/memory/models.ts |

---

## 2. System Architecture

### 2.1 Architecture Overview

The Document Indexing pipeline is a sequential flow through 5 components: user/AI agent invokes `mem_ingest_file`, `handleIngestFile` sections and creates tasks, `TaskWorker` processes the tasks with context chain, `TagAnalyzerService` sends full content + context to LLM, and results are persisted to SQLite.

![Architecture Diagram](diagrams/architecture.png)
*[Edit in draw.io](diagrams/architecture.drawio)*

**Key Architectural Decision (AD-001): Context Chain via Runtime DB Query at Processing Time**

Instead of creating tasks sequentially (which would add latency to `handleIngestFile`), we create ALL tasks at once with `context=null`. At processing time, `TaskWorker.loadPreviousContext()` queries the DB for the previous section in the same file using `WHERE source=? AND id < ? ORDER BY id DESC LIMIT 1`. This decouples task creation from context resolution.

**Rationale:**
- `handleIngestFile` remains fast (no sequential waiting)
- Context chain is resolved lazily at processing time
- Handles race conditions naturally (if prev section not yet processed, returns null)
- Avoids complex state management in the dispatcher

### 2.2 Component Diagram

![Component Diagram](diagrams/component.png)
*[Edit in draw.io](diagrams/component.drawio)*

| Component | File | Responsibility | SA4E-47 Changes |
|-----------|------|----------------|-----------------|
| MemoryToolDispatcher | `dispatchers/dispatcher.ts` | Routes mem_* tool calls | No changes |
| handleIngestFile | `dispatchers/crud.ts` | File ingestion — split, insert, create tasks | Remove truncation (L63, L197); pass full content |
| TagAnalyzerService | `llm/analyzer.ts` | LLM-based extraction with context chain | New fields in result; chunking; context param |
| LLMService + OpenAIAdapter | `llm/LLMService.ts` | Multi-provider LLM facade | maxTokens 300 → 2048 |
| TaskWorker | `task-queue/TaskWorker.ts` | Background task processor | structured_map update; loadPreviousContext |
| PendingTaskRepository | `task-queue/PendingTaskRepository.ts` | Task CRUD | No changes |
| MemoryEngine | `engine/core.ts` | KB facade | No changes |
| MemoryEngineCrud | `engine/crud.ts` | Base CRUD | Add updateStructuredMap() |

### 2.3 Deployment Architecture

![Deployment Diagram](diagrams/deployment.png)
*[Edit in draw.io](diagrams/deployment.drawio)*

All components run on the same developer machine:
- **Backend Server**: Node.js process with Hono framework, hosts MemoryModule + TaskWorker
- **LM Studio**: Separate process on localhost:1234, hosts qwen3-8b model
- **SQLite**: File-based database (WAL mode), accessed in-process via better-sqlite3
- **MCP**: Communication protocol between client (VS Code Extension) and backend

### 2.4 Communication Patterns

| From | To | Protocol | Pattern | Description |
|------|----|----------|---------|-------------|
| Client/Agent | MemoryToolDispatcher | MCP (stdio) | Sync req/resp | `mem_ingest_file` tool call |
| MemoryToolDispatcher | SQLite DB | better-sqlite3 API | Sync | Insert entries, create tasks |
| TaskWorker | TagAnalyzerService | In-memory method call | Async/await | `analyzeTags(content, options, context)` |
| TagAnalyzerService | LM Studio | HTTP REST (OpenAI) | Async with 30s timeout | POST /chat/completions |
| TaskWorker | SQLite DB | better-sqlite3 API | Sync | Update tags + structured_map |

---

## 3. Internal API Design

> **Note:** This feature DOES NOT expose new external HTTP endpoints or MCP tools. All APIs are internal TypeScript method calls within the `memory/` module. The existing MCP tool `mem_ingest_file` remains the only entry point — its behavior is enhanced.

### 3.1 TagAnalyzerService.analyzeTags()

**Implements:** FSD UC-001, UC-003; BRD Stories 1, 3

| Attribute | Value |
|-----------|-------|
| Method | `TagAnalyzerService.analyzeTags()` |
| Location | `llm/analyzer.ts` |
| Access | Internal (called by TaskWorker) |

**Signature (NEW):**

```typescript
async analyzeTags(
  content: string,
  options?: TagAnalyzeOptions,
  context?: ContextChainInput,
): Promise<TagAnalysisResult>
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| content | string | Yes | Full section content (no truncation) |
| options | TagAnalyzeOptions | No | threshold (default 0.7), autoApply (default true) |
| context | ContextChainInput | No | Previous section context for chain |

**Response — TagAnalysisResult (UPDATED with new fields):**

```typescript
interface TagAnalysisResult {
  appliedTags: string[];       // Tags with confidence >= threshold (max 6)
  suggestedTags: TagSuggestion[]; // Tags below threshold
  fallbackUsed: boolean;       // True if keyword fallback was used
  summary: string;             // NEW: 1-3 sentence summary (max 500 chars)
  business_entities: string[]; // NEW: extracted business entities (max 5)
  actors: string[];            // NEW: extracted actors/roles (max 5)
  business_rules: string[];    // NEW: extracted business rules (max 10)
}
```

**ContextChainInput (NEW interface):**

```typescript
interface ContextChainInput {
  previous_section_id: number;
  summary: string;              // Truncated to 500 chars
  business_entities: string[];  // Max 5
  actors: string[];             // Max 5
  business_rules: string[];     // Max 10
}
```

**Processing Flow:**

```typescript
// Pseudocode for analyzeTags with chunking support (FSD §6.1.4)
async analyzeTags(content, options?, context?): TagAnalysisResult {
  if (!content || content.trim().length < 10)
    return empty result with defaults

  const threshold = options?.threshold ?? 0.7
  const maxTokens = this.llmService.getConfig().maxTokens ?? 2048
  const estimatedTokens = Math.ceil(content.length / 3)
  const chunkSize = this.workerConfig?.llmChunkSize ?? 6000

  if (estimatedTokens > maxTokens && content.length > chunkSize) {
    return await this.analyzeWithChunking(content, context, chunkSize, overlap)
  }

  const suggestions = await this.analyzeWithLLM(content, options, context)
  return this.applyThresholdWithExtended(suggestions, threshold, autoApply)
}
```

**Error Scenarios:**

| Scenario | Behavior | fallbackUsed |
|----------|----------|--------------|
| Content < 10 chars | Return empty result (no LLM call) | false |
| LLM timeout (30s) | Fallback to keyword extraction | true |
| LLM unavailable | Fallback to keyword extraction | true |
| LLM response unparseable | Regex fallback for tags | true |
| LLM returns old format (tags only) | Fill defaults for new fields | false |

### 3.2 TaskWorker.loadPreviousContext()

**Implements:** FSD UC-002; BRD Story 2

| Attribute | Value |
|-----------|-------|
| Method | `TaskWorker.loadPreviousContext()` |
| Location | `task-queue/TaskWorker.ts` |
| Access | Private (called within processTagEnrichment) |

**Signature:**

```typescript
private async loadPreviousContext(
  entryId: number,
  source: string | null,
): Promise<ContextChainInput | null>
```

**Algorithm (FSD §3.2.4):**

```typescript
async loadPreviousContext(entryId, source): ContextChainInput | null {
  if (!source) return null  // No context for non-file entries

  // Find the previous section in the same file (same source path)
  // using SQL: WHERE source = ? AND id < ? ORDER BY id DESC LIMIT 1
  const prevEntry = this.engine.findByIdWithSource(entryId, source)
  if (!prevEntry) return null

  // Parse structured_map safely (handles '{}', null, invalid JSON)
  const map = safeParseStructuredMap(prevEntry.structured_map)
  if (!map.summary && !map.business_entities?.length) return null

  return {
    previous_section_id: prevEntry.id,
    summary: (map.summary || '').slice(0, 500),  // BR-012
    business_entities: (map.business_entities || []).slice(0, 5),
    actors: (map.actors || []).slice(0, 5),
    business_rules: (map.business_rules || []).slice(0, 10),
  }
}
```

**SQL Query for Previous Section:**

```sql
SELECT id, structured_map
FROM knowledge_entries
WHERE source = ? AND id < ?
ORDER BY id DESC LIMIT 1;
```

**Error Handling:**

| Scenario | Return | Log |
|----------|--------|-----|
| source is null | null | — (expected for single ingest) |
| No previous entry found | null | debug: "No previous section found" |
| Previous entry has empty structured_map | null | debug: "Previous section has no extractable data" |
| DB error | null | warn: "Failed to load previous context" |

### 3.3 TaskWorker.processTagEnrichment() — UPDATED

**Implements:** FSD UC-004; BRD Story 4

| Attribute | Value |
|-----------|-------|
| Method | `TaskWorker.processTagEnrichment()` |
| Location | `task-queue/TaskWorker.ts:181-199` |
| Access | Private |

**Current Flow (lines 181-199):**
1. Check tagAnalyzer exists
2. Call `tagAnalyzer.analyzeTags(content, options)` — NO context param
3. Merge appliedTags with existing_tags
4. Call `engine.updateTags(id, merged.join(','))` — ONLY updates tags column
5. Mark task COMPLETED

**NEW Flow (SA4E-47):**

```typescript
private async processTagEnrichment(task: PendingTask, payload: any): Promise<void> {
  if (!this.tagAnalyzer) {
    this.repo.resetForRetry(task.id)
    return
  }

  // STEP 1: Load previous section context (NEW)
  const context = this.config.enableContextChain
    ? await this.loadPreviousContext(task.entry_id, payload.source)
    : null

  if (context) {
    this.logger.debug({ entry_id: task.entry_id, prev_section_id: context.previous_section_id },
      'Context chain applied')
  }

  // STEP 2: Analyze with context (UPDATED signature)
  const result = await this.tagAnalyzer.analyzeTags(
    payload.content,
    payload.options,
    context,  // NEW: pass context chain
  )

  // STEP 3: Update tags column (same as before)
  if (result.appliedTags.length > 0) {
    const existing = payload.existing_tags
      ? payload.existing_tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : []
    const merged = [...new Set([...existing, ...result.appliedTags])]
    this.engine.updateTags(task.entry_id, merged.join(','))
  }

  // STEP 4: Update structured_map (NEW)
  await this.updateEntryStructuredMap(task.entry_id, result, context)

  this.repo.markCompleted(task.id)
}
```

**NEW method: updateEntryStructuredMap():**

```typescript
private async updateEntryStructuredMap(
  entryId: number,
  result: TagAnalysisResult,
  context: ContextChainInput | null,
): Promise<void> {
  try {
    const entry = this.engine.findById(entryId)
    if (!entry) return

    // Parse existing structured_map (safe — handles null, '{}', invalid)
    const existing = safeParseStructuredMap(entry.structured_map)

    // Build new structured_map data (merge strategy)
    const structuredMap: StructuredMapData = {
      // LLM fields — OVERWRITE
      tags: result.appliedTags,
      summary: result.summary || existing.summary || '',
      business_entities: result.business_entities || [],
      actors: result.actors || [],
      business_rules: result.business_rules || [],

      // File metadata — PRESERVE (never overwrite)
      fileCreatedAt: existing.fileCreatedAt,
      fileAuthor: existing.fileAuthor,
      fileVersion: existing.fileVersion,

      // Context chain reference
      context_chain: context ? {
        previous_section_id: context.previous_section_id,
        previous_summary: context.summary,
      } : undefined,

      // Extraction metadata
      extraction_meta: {
        model: this.llmService?.getConfig()?.model || 'unknown',
        timestamp: new Date().toISOString(),
        fallback_used: result.fallbackUsed,
        context_chain_enabled: this.config.enableContextChain,
      },
    }

    const jsonStr = JSON.stringify(structuredMap)

    // Enforce 100KB max (BR-033)
    if (jsonStr.length > (this.config.structuredMapMaxSize ?? 102400)) {
      structuredMap.business_rules = (structuredMap.business_rules || []).slice(0, 5)
      structuredMap.actors = (structuredMap.actors || []).slice(0, 3)
      this.logger.warn({ entry_id: entryId, size: jsonStr.length },
        'structured_map truncated due to size limit')
    }

    const finalJson = JSON.stringify(structuredMap)
    this.engine.updateStructuredMap(entryId, finalJson)
  } catch (err) {
    // structured_map failure does NOT block tags update (BR-034)
    this.logger.warn({ entry_id: entryId, err }, 'structured_map update failed')
  }
}
```

### 3.4 handleIngestFile() Changes

**Implements:** FSD UC-001; BRD Story 1

**Changes to existing code (crud.ts lines 190-203):**

| Line | Current Code | New Code |
|------|--------------|----------|
| 190 | `for (const sec of ...)` | Same loop (no change needed) |
| 192 | `engine.insert(...)` | Same (no change to insert) |
| 197 | `content: sec.trim().slice(0, 2000)` | `content: sec.trim()` (FULL content) |

**Simplified approach:** The file-level context chain loop originally described in BRD's Appendix (pseudocode that tracks `previousSummary` in-memory during insertion) is REPLACED by the TaskWorker runtime DB query approach (FSD §3.2.4). This means:

- `handleIngestFile` does NOT need to be refactored to sequential
- All sections are inserted in the same loop
- All tasks are created with full content (no truncation)
- Context chain is resolved at processing time by TaskWorker
- The only change to `handleIngestFile` is removing `slice(0, 2000)` at line 197

---

## 4. Database Design

### 4.1 Schema Overview

**No schema changes are required** for SA4E-47. The `structured_map` column already exists on `knowledge_entries` (TEXT NOT NULL DEFAULT '{}'). The `pending_tasks` payload column is TEXT JSON — backward compatible with new optional context fields.

![Database Schema](diagrams/db-schema.png)
*[Edit in draw.io](diagrams/db-schema.drawio)*

### 4.2 Existing Schema (No Changes)

#### Table: knowledge_entries

| Column | Type | Nullable | Default | SA4E-47 Change |
|--------|------|----------|---------|----------------|
| id | INTEGER | NOT NULL | PK AUTOINCREMENT | — |
| content | TEXT | NOT NULL | — | — |
| summary | TEXT | NOT NULL | — | — |
| tags | TEXT | YES | NULL | Updated by worker |
| structured_map | TEXT | YES | '{}' | **Populated with new JSON data** |
| source | TEXT | YES | NULL | Used for context chain lookup |
| ... | ... | ... | ... | — |

#### Table: pending_tasks

| Column | Type | Change |
|--------|------|--------|
| id | INTEGER | — |
| task_type | TEXT | — (TAG_ENRICHMENT unchanged) |
| entry_id | INTEGER | — |
| payload | TEXT (JSON) | **Optional `context` field added** (backward compatible) |
| status | TEXT | — |

### 4.3 Query Patterns

| Operation | SQL | Index Used | Expected Latency |
|-----------|-----|------------|------------------|
| Find previous section (context chain) | `SELECT id, structured_map FROM knowledge_entries WHERE source = ? AND id < ? ORDER BY id DESC LIMIT 1` | PK on source (existing) + PK on id | < 10ms |
| Update tags | `UPDATE knowledge_entries SET tags = ?, updated_at = datetime('now') WHERE id = ?` | PK on id | < 5ms |
| Update structured_map | `UPDATE knowledge_entries SET structured_map = ?, updated_at = datetime('now') WHERE id = ?` | PK on id | < 5ms |
| Find entry by ID | `SELECT * FROM knowledge_entries WHERE id = ?` | PK on id | < 3ms |

**Existing index on `source` column** (from schema/tables.ts) is sufficient for the context chain query. No new indexes needed.

### 4.4 structured_map JSON Schema (BR-030 to BR-036)

```typescript
interface StructuredMapData {
  // LLM extraction fields (overwritten each time)
  tags?: string[];                    // applied tags
  summary?: string;                   // max 500 chars
  business_entities?: string[];       // max 5 items
  actors?: string[];                  // max 5 items
  business_rules?: string[];          // max 10 items

  // File metadata (preserved on merge — never overwritten)
  fileCreatedAt?: string;
  fileAuthor?: string;
  fileVersion?: string;

  // Context chain reference
  context_chain?: {
    previous_section_id: number;
    previous_summary?: string;        // max 500 chars
  };

  // Extraction metadata
  extraction_meta?: {
    model: string;
    timestamp: string;                // ISO 8601
    fallback_used: boolean;
    context_chain_enabled: boolean;
  };
}
```

**Merge Strategy:**

| Operation | Behavior |
|-----------|----------|
| `tags` | Overwritten by LLM result |
| `summary` | Overwritten by LLM result |
| `business_entities` | Overwritten by LLM result |
| `actors` | Overwritten by LLM result |
| `business_rules` | Overwritten by LLM result |
| `fileCreatedAt` | **PRESERVED** — never overwritten |
| `fileAuthor` | **PRESERVED** — never overwritten |
| `fileVersion` | **PRESERVED** — never overwritten |
| `context_chain` | Set by TaskWorker at processing time |
| `extraction_meta` | Always fresh |

**Size Enforcement (BR-033):**
- If JSON.stringify(structuredMap).length > 100KB (102400 bytes):
  1. Truncate `business_rules` to 5 items (from 10)
  2. If still > 100KB, truncate `actors` to 3 items (from 5)
  3. Log warning with entry_id and truncated fields
  4. STRINGIFY again and persist

---

## 5. Class / Module Design

### 5.1 Package Structure

```
backend/src/modules/memory/
├── dispatchers/
│   ├── crud.ts              ← MODIFIED (lines 63, 197)
│   └── dispatcher.ts        ← No change
├── llm/
│   ├── analyzer.ts           ← MODIFIED (lines 11-22, 65-83, 85-118)
│   ├── prompts.ts            ← MODIFIED (line 56-71: SYSTEM_PROMPT)
│   ├── LLMService.ts         ← MODIFIED (line 42: maxTokens)
│   ├── openai-adapter.ts     ← No change
│   └── types.ts              ← No change
├── task-queue/
│   ├── TaskWorker.ts         ← MODIFIED (lines 181-199: processTagEnrichment)
│   ├── TaskWorkerConfig.ts   ← MODIFIED (add new config fields)
│   ├── PendingTaskRepository.ts ← No change
│   └── models.ts             ← No change
├── engine/
│   ├── core.ts               ← No change
│   └── crud.ts               ← MODIFIED (add updateStructuredMap())
└── models.ts                 ← No change (KnowledgeEntry already has structured_map)
```

### 5.2 Key Interfaces (NEW and MODIFIED)

**NEW: ContextChainInput** — placed in `llm/analyzer.ts` or extracted to `llm/types.ts`:

```typescript
export interface ContextChainInput {
  previous_section_id: number;
  summary: string;
  business_entities: string[];
  actors: string[];
  business_rules: string[];
}
```

**MODIFIED: TagAnalysisResult** — new fields added in `llm/analyzer.ts`:

```typescript
export interface TagAnalysisResult {
  appliedTags: string[];
  suggestedTags: TagSuggestion[];
  fallbackUsed: boolean;
  // NEW FIELDS:
  summary: string;
  business_entities: string[];
  actors: string[];
  business_rules: string[];
}
```

**MODIFIED: TagAnalyzerOptions** — no change needed (threshold, autoApply sufficient).

**NEW: MemoryEngineCrud.updateStructuredMap()** — in `engine/crud.ts`:

```typescript
updateStructuredMap(id: number, structuredMap: string): void {
  this.adapter.run(
    `UPDATE knowledge_entries SET structured_map = ?, updated_at = ${this.dialect.now()} WHERE id = ?`,
    [structuredMap, id],
  );
}
```

**NEW: structured_map related types** — in `llm/types.ts` or `task-queue/types.ts`:

```typescript
export interface StructuredMapData {
  tags?: string[];
  summary?: string;
  business_entities?: string[];
  actors?: string[];
  business_rules?: string[];
  fileCreatedAt?: string;
  fileAuthor?: string;
  fileVersion?: string;
  context_chain?: {
    previous_section_id: number;
    previous_summary?: string;
  };
  extraction_meta?: {
    model: string;
    timestamp: string;
    fallback_used: boolean;
    context_chain_enabled: boolean;
  };
}

export function safeParseStructuredMap(json: string | null | undefined): StructuredMapData {
  if (!json || json === '' || json === '{}') return {};
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as StructuredMapData;
  } catch {
    return {};
  }
}
```

### 5.3 Algorithm Designs

#### Algorithm 1: Content Chunking with Overlap (FSD §6.1.3)

**Purpose:** Split content exceeding LLM context window into manageable chunks with configurable overlap.

```typescript
function chunkContent(
  content: string,
  chunkSize: number = 6000,
  overlap: number = 200,
): { chunks: string[]; totalChunks: number } {
  if (content.length <= chunkSize) {
    return { chunks: [content], totalChunks: 1 }
  }

  const chunks: string[] = []
  let start = 0

  while (start < content.length) {
    const end = Math.min(start + chunkSize, content.length)
    chunks.push(content.slice(start, end))
    start = end - overlap
    if (start >= content.length - overlap) break
  }

  return { chunks, totalChunks: chunks.length }
}
```

**Example:** Content = 15000 chars, chunkSize = 6000, overlap = 200
- Chunk 1: chars 0-6000
- Chunk 2: chars 5800-11800
- Chunk 3: chars 11600-15000
- Total: 3 chunks

#### Algorithm 2: Chunked Analysis with Merge (FSD §6.1.3)

```typescript
async function analyzeWithChunking(
  content: string,
  context: ContextChainInput | null,
  chunkSize: number,
  overlap: number,
): Promise<TagAnalysisResult> {
  const { chunks } = chunkContent(content, chunkSize, overlap)
  const results: TagAnalysisResult[] = []

  for (const chunk of chunks) {
    // Each chunk gets context from previous section (first chunk) or is independent
    const ctx = results.length === 0 ? context : null
    const result = await analyzeWithLLM(chunk, undefined, ctx)
    results.push(result)
  }

  return {
    appliedTags: [...new Set(results.flatMap(r => r.appliedTags))].slice(0, 6),
    suggestedTags: results[0]?.suggestedTags ?? [],
    fallbackUsed: results.some(r => r.fallbackUsed),
    summary: results[0]?.summary ?? '',            // Summary from first chunk only
    business_entities: [...new Set(results.flatMap(r => r.business_entities))].slice(0, 5),
    actors: [...new Set(results.flatMap(r => r.actors))].slice(0, 5),
    business_rules: [...new Set(results.flatMap(r => r.business_rules))].slice(0, 10),
  }
}
```

**Merge Rules (BR-005):**
| Field | Strategy |
|-------|----------|
| `appliedTags` | Union across all chunks, deduplicated, cap at 6 |
| `suggestedTags` | From first chunk only |
| `summary` | From first chunk only |
| `business_entities` | Union, deduplicated, cap at 5 |
| `actors` | Union, deduplicated, cap at 5 |
| `business_rules` | Union, deduplicated, cap at 10 |
| `fallbackUsed` | true if ANY chunk used fallback |

#### Algorithm 3: Context Chain Construction

```typescript
function buildContextPrompt(context: ContextChainInput | null, content: string): string {
  if (!context) return `/no_think\n\n${content}`  // No context, standard format

  const contextBlock = `[Previous section context]\nSummary: ${context.summary || ''}`
    + (context.business_entities?.length ? `\nBusiness entities: ${context.business_entities.join(', ')}` : '')
    + (context.actors?.length ? `\nActors: ${context.actors.join(', ')}` : '')
    + (context.business_rules?.length ? `\nBusiness rules: ${context.business_rules.slice(0, 3).join('; ')}` : '')

  return `/no_think\n\n${contextBlock}\n\n---\n\n${content}`
}
```

**Context Block Format (BR-014):**
```
[Previous section context]
Summary: Section describes authentication flow...
Business entities: User, Session
Actors: End User, System Admin
Business rules: Password must be 8+ characters

---

{current section content}
```

#### Algorithm 4: Enhanced LLM Response Parsing

```typescript
function parseEnhancedResponse(llmOutput: string): {
  suggestions: TagSuggestion[];
  summary: string;
  business_entities: string[];
  actors: string[];
  business_rules: string[];
} {
  const result = {
    suggestions: [] as TagSuggestion[],
    summary: '',
    business_entities: [] as string[],
    actors: [] as string[],
    business_rules: [] as string[],
  }

  if (!llmOutput || llmOutput.trim().length === 0) return result

  // Try JSON parse first
  const jsonMatch = llmOutput.match(/\{[\s\S]*"tags"[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      // Parse tags (existing logic)
      result.suggestions = (parsed.tags || parsed.suggestions || [])
        .filter((t: any) => t.tag && t.confidence !== undefined)
        .map((t: any) => ({
          tag: String(t.tag).toLowerCase().trim().replace(/\s+/g, '-'),
          category: String(t.category || 'feature'),
          confidence: Number(t.confidence),
          reason: String(t.reason || ''),
        }))
        .filter((t: TagSuggestion) => t.tag.length >= 3 && t.tag.length <= 50)

      // Parse new fields (with defaults for backward compat)
      result.summary = String(parsed.summary || '').slice(0, 500)
      result.business_entities = (parsed.business_entities || [])
        .filter((e: any) => typeof e === 'string' && e.length <= 100)
        .slice(0, 5)
      result.actors = (parsed.actors || [])
        .filter((a: any) => typeof a === 'string' && a.length <= 100)
        .slice(0, 5)
      result.business_rules = (parsed.business_rules || [])
        .filter((r: any) => typeof r === 'string' && r.length <= 300)
        .slice(0, 10)

      return result
    } catch { /* fall through to regex */ }
  }

  // Fallback: regex extraction for tags only (new fields = defaults)
  const tagPattern = /["']([a-z][a-z0-9-]{4,40}[a-z0-9])["']/g
  const found: string[] = []
  let m
  while ((m = tagPattern.exec(llmOutput)) !== null) {
    const tag = m[1]
    if (tag.includes('-') && !['let-me', 'wait-the', 'so-maybe', 'that-s'].includes(tag)) {
      found.push(tag)
    }
  }
  result.suggestions = [...new Set(found)].slice(-3).map(tag => ({
    tag, category: 'feature', confidence: 0.85, reason: 'extracted from reasoning',
  }))

  return result
}
```

### 5.4 Design Patterns

| Pattern | Where Used | Rationale |
|---------|-----------|-----------|
| **Strategy** | Chunking vs direct analysis in `analyzeTags()` | Different processing approaches based on content length |
| **Template Method** | `processTagEnrichment()` with `loadPreviousContext()`, `analyzeTags()`, `updateEntryStructuredMap()` | Common process with customizable steps |
| **Facade** | `MemoryEngineCrud.updateStructuredMap()` wraps SQL | Simplifies DB access for structured_map writes |
| **Merge Pattern** | structured_map merge in `updateEntryStructuredMap()` | Preserves existing file metadata while overwriting LLM fields |
| **Safe Parse Pattern** | `safeParseStructuredMap()` | Gracefully handles null, '{}', or invalid JSON without crashing |

### 5.5 Error Handling Strategy

**Exception Hierarchy (existing — extended for SA4E-47):**

| Error Scenario | Detection | Action | Severity |
|---------------|-----------|--------|----------|
| Content < 10 chars | `content.trim().length < 10` | Return empty result, no LLM call | Info |
| LLM timeout | `Promise.race` with 30s timeout | Fallback to keyword extraction, `fallbackUsed=true` | Warning |
| LLM connection refused | `fetch` throws | Fallback to keyword extraction, `fallbackUsed=true` | Error |
| LLM HTTP error | `!res.ok` | Fallback to keyword extraction, `fallbackUsed=true` | Error |
| LLM response unparseable | `JSON.parse` throws | Regex fallback for tags, `fallbackUsed=true` | Warning |
| LLM response old format (tags only) | Missing fields in parsed JSON | Fill defaults, `fallbackUsed=false` | Info |
| structured_map DB update fails | `adapter.run` throws | Log warning, tags already updated, task still COMPLETED | Warning |
| structured_map > 100KB | `JSON.stringify().length > 102400` | Truncate arrays, log warning | Warning |
| Context chain — no prev section | `loadPreviousContext()` returns null | Process without context, continue normally | Debug |
| Context summary > 500 chars | `summary.length > 500` | Truncate to 500 chars | Debug |
| Chunking engine error | Catch in `analyzeWithChunking()` | Send truncated content to window limit | Error |

**Graceful Degradation Priority:**
1. LLM with context chain → best quality
2. LLM without context chain → good quality
3. LLM with chunked content → acceptable quality for long docs
4. Keyword extraction fallback → basic tags only
5. Empty result → no tags, no structured data

---

## 6. Integration Design

### 6.1 External System: LLM Backend (LM Studio)

| Attribute | Current | SA4E-47 Target |
|-----------|---------|----------------|
| Endpoint | POST {baseUrl}/chat/completions | Same |
| Model | qwen3-8b | Same |
| max_tokens | 300 | **2048** |
| User prompt format | `/no_think\nTag this:\n{truncated content}` | `/no_think\n\n{context_block}\n\n---\n\n{full content}` |
| Timeout | 30s | Same |

**Request Body (NEW):**

```json
{
  "model": "qwen3-8b",
  "messages": [
    {
      "role": "system",
      "content": "[ENHANCED_SYSTEM_PROMPT — see §5.6]"
    },
    {
      "role": "user",
      "content": "/no_think\n\n[Previous section context]\nSummary: Section 1 describes the authentication flow...\nBusiness entities: User, Session\n\n---\n\n## Section 2: Authorization\nFull section content here..."
    }
  ],
  "temperature": 0.3,
  "max_tokens": 2048,
  "chat_template_kwargs": {
    "enable_thinking": false
  }
}
```

**Retry Policy:**

| Error Type | Retry Count | Backoff | Fallback |
|-----------|-------------|---------|----------|
| HTTP 4xx | 0 (no retry) | — | Keyword extraction |
| HTTP 5xx | 3 | Exponential (2s, 4s, 8s) | Keyword extraction |
| Network error | 3 | Exponential | Keyword extraction |
| Timeout | 3 | Exponential | Keyword extraction |

### 6.2 Internal System: SQLite Database

**New SQL Operations:**

```sql
-- Update structured_map (in updateEntryStructuredMap)
UPDATE knowledge_entries
SET structured_map = ?, updated_at = datetime('now')
WHERE id = ?;

-- Read previous section for context chain
SELECT id, structured_map
FROM knowledge_entries
WHERE source = ? AND id < ?
ORDER BY id DESC LIMIT 1;
```

**Transactional Guarantees:**
- `tags` update and `structured_map` update are separate SQL statements
- `tags` update happens FIRST; if `structured_map` update fails, `tags` is already saved
- No cross-table transaction needed (single table, independent writes)

---

## 7. Security Design

### 7.1 Authentication

| Actor | Auth Mechanism | Change |
|-------|---------------|--------|
| User/AI Agent calling mem_ingest_file | MCP framework auth (external) | No change |
| TaskWorker (internal) | In-process — no external API auth | No change |
| LLM Backend (LM Studio) | Localhost — no auth configured | No change (local LLM) |

**Security Note:** If LLM backend is changed to a cloud provider (OpenAI, Anthropic) in the future, ALL content sent in prompts leaves the local machine. A data sensitivity review would be required. The extraction_meta field in structured_map tracks which model was used for traceability.

### 7.2 Data Protection

| Data Type | Sensitivity | Protection |
|-----------|-------------|------------|
| Section content | Internal (may contain business logic) | Stays in local DB; sent to local LLM only |
| structured_map fields | Internal (entities, rules, actors) | Same as content — local only |
| LLM prompts | Internal | Sent to localhost:1234 only; NOT to external APIs |
| Extraction metadata | Public | No sensitive data |

### 7.3 Input Validation

| Field | Validation | Sanitization |
|-------|-----------|--------------|
| content (in task payload) | Length > 10 for LLM analysis | None (full content preserved) |
| summary (from LLM) | Max 500 chars | Truncate if exceeded |
| business_entities | Max 5 items, each ≤ 100 chars, noun phrase filter | Truncate, filter |
| actors | Max 5 items, each ≤ 100 chars | Truncate |
| business_rules | Max 10 items, each ≤ 300 chars | Truncate |
| structured_map | Valid JSON, ≤ 100KB | Truncation strategy |

---

## 8. Performance & Scalability

### 8.1 Performance Budgets (from FSD §8.1)

| Operation | Baseline | Target (SA4E-47) | Budget Delta |
|-----------|----------|------------------|--------------|
| Single TAG_ENRICHMENT (2000 chars) | ~5s | ~5s (no change for short content) | +0s |
| Single TAG_ENRICHMENT (5000 chars) | ~5s (truncated) | ~8s (full content + more tokens) | +3s |
| Context chain prepend | N/A | < 5ms (string operation) | +5ms |
| Previous section DB lookup | N/A | < 10ms (indexed query) | +10ms |
| structured_map JSON merge | N/A | < 2ms (in-memory merge) | +2ms |
| File with 10 sections | ~55s | ~85s (sequential, more tokens) | +30s |

### 8.2 Configurable Performance Parameters

| Parameter | Config Key | Default | Range | Effect |
|-----------|-----------|---------|-------|--------|
| Context chain toggle | enableContextChain | true | true/false | Controls context prepend |
| Context chain max length | contextChainMaxLength | 500 | 100-2000 chars | Controls prompt overhead |
| LLM chunk size | llmChunkSize | 6000 | 2000-20000 chars | Controls chunking threshold |
| LLM chunk overlap | llmChunkOverlap | 200 | 50-1000 chars | Controls context continuity |
| LLM timeout | llmTimeout | 30000 | 5000-120000 ms | Controls wait before fallback |
| structured_map max size | structuredMapMaxSize | 102400 | 10240-512000 bytes | Controls per-entry storage |
| LLM max tokens | maxTokens (LLMConfig) | 2048 | 512-8192 tokens | Controls response quality |

### 8.3 Caching

No caching is required for this feature. The context chain DB query (<10ms) and JSON merge (<2ms) are already sub-millisecond operations. LLM responses are inherently non-cacheable (unique per content).

---

## 9. Monitoring & Observability

### 9.1 Logging Standards

All logs follow the existing Pino structured logging pattern:

| Event | Level | Key Fields | Component |
|-------|-------|------------|-----------|
| Context chain applied | debug | entry_id, prev_section_id, context_length | TaskWorker |
| No context available | debug | entry_id, reason | TaskWorker |
| structured_map updated | debug | entry_id, size, fields | TaskWorker |
| structured_map truncated | warn | entry_id, size, truncated_fields | TaskWorker |
| structured_map update failed | warn | entry_id, err | TaskWorker |
| LLM analysis completed | info | entry_id, tokens_used | TagAnalyzerService |
| LLM analysis fallback | warn | entry_id, fallback_reason | TagAnalyzerService |
| LLM analysis failed | error | entry_id, err | TagAnalyzerService |
| Chunking activated | info | entry_id, total_chunks, chunk_size | TagAnalyzerService |

**Example:**
```typescript
logger.info({
  entry_id: 42,
  prev_section_id: 41,
  context_length: 350,
  component: 'TaskWorker',
}, 'Context chain applied')
```

### 9.2 Metrics

| Metric | Type | Description | Collection |
|--------|------|-------------|------------|
| task.tag_enrichment.duration | Histogram | Time to process one TAG_ENRICHMENT task | Pino log → ELK/Grafana |
| llm.analysis.tokens | Histogram | Tokens consumed per LLM call | LLM response metadata |
| llm.fallback.count | Counter | Number of fallback extractions | Pino log count |
| structured_map.size | Histogram | Size of structured_map JSON per entry | Logged on update |
| chunking.count | Counter | Number of chunked analyses | Pino log count |

### 9.3 Health Checks

| Check | Method | Expected |
|-------|--------|----------|
| LLM available | `LLMService.isAvailable()` | HTTP 200 from LM Studio `/models` |
| DB writable | `adapter.run('SELECT 1')` | Returns 1 |
| TaskWorker running | `TaskWorker.getStats().isRunning` | true |

---

## 10. Deployment Considerations

### 10.1 Configuration (TaskWorkerConfig — EXTENDED)

```typescript
export interface TaskWorkerConfig {
  // Existing (SA4E-44):
  baseInterval: number;       // default: 2000
  maxInterval: number;        // default: 30000
  staleThreshold: number;     // default: 300000
  maxRetries: number;         // default: 3

  // NEW (SA4E-47):
  enableContextChain: boolean;   // default: true
  contextChainMaxLength: number; // default: 500
  llmChunkSize: number;          // default: 6000
  llmChunkOverlap: number;       // default: 200
  llmTimeout: number;            // default: 30000
  structuredMapMaxSize: number;  // default: 102400
}

export const DEFAULT_TASK_WORKER_CONFIG: TaskWorkerConfig = {
  baseInterval: 2000,
  maxInterval: 30000,
  staleThreshold: 300000,
  maxRetries: 3,
  enableContextChain: true,
  contextChainMaxLength: 500,
  llmChunkSize: 6000,
  llmChunkOverlap: 200,
  llmTimeout: 30000,
  structuredMapMaxSize: 102400,
};
```

### 10.2 LLMService Default Config Change

In `llm/LLMService.ts`, line 42:
```typescript
// CURRENT:
maxTokens: config?.maxTokens ?? defaults.maxTokens ?? 300,
// NEW:
maxTokens: config?.maxTokens ?? defaults.maxTokens ?? 2048,
```

### 10.3 Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| enableContextChain | true | Toggle context chain on/off without restart |
| (chunk size param) | 6000 | Read from TaskWorkerConfig at runtime |

### 10.4 Rollback Strategy

| Scenario | Rollback Action |
|----------|----------------|
| LLM latency too high for full content | Revert `content.slice(0, 2000)` truncation removal in crud.ts:63,197 and analyzer.ts:69 |
| Context chain degrades quality | Set `enableContextChain = false` in config (no code change) |
| structured_map corrupts existing data | Revert TaskWorker.ts structured_map update code |
| Full rollback | Git revert: `git revert <commit-hash>` |

### 10.5 Zero Migration Deployment

This feature requires ZERO database migrations:
- `structured_map` column already exists (DEFAULT '{}')
- `pending_tasks.payload` is TEXT JSON — adding optional `context` field is backward compatible
- No new indexes, triggers, or views needed
- Existing entries with `structured_map = '{}'` remain fully operational

---

## 11. LLM Prompt Design

### 11.1 ENHANCED_SYSTEM_PROMPT

```typescript
export const ENHANCED_SYSTEM_PROMPT = `You are a knowledge entry analyzer. Extract structured information from the provided content.

## Task
Analyze the given knowledge entry content and extract the following fields in JSON format.

## Output Format
ONLY return a valid JSON object (no markdown, no explanations, no code fences):

{
  "tags": [
    {"tag": "specific-feature-name", "category": "feature", "confidence": 0.95, "reason": "why this tag"}
  ],
  "summary": "1-3 sentence summary of the section content",
  "business_entities": ["EntityName1", "EntityName2"],
  "actors": ["Role1", "Role2"],
  "business_rules": ["Business rule or constraint 1", "Business rule 2"]
}

## Rules
1. Tags: Max 3 tags. Be SPECIFIC (use 3-6 word hyphenated names like "admin-panel-routing-fix"). NOT generic like "testing", "bugfix".
2. Tags confidence: 0.0 to 1.0. Only high confidence (>0.7) should be applied.
3. Summary: 1-3 sentences, max 500 characters. Capture the key purpose and content.
4. Business entities: Max 5. These are NOUN PHRASES representing business concepts (e.g., "User", "Invoice", "Authentication Token").
5. Actors: Max 5. These are ROLES or PEOPLE involved (e.g., "System Admin", "End User", "Customer Support").
6. Business rules: Max 10. These are CONSTRAINTS, CONDITIONS, or RULES (e.g., "Password must be 8+ characters", "Session expires after 24h").
7. Each business entity max 100 chars, each actor max 100 chars, each rule max 300 chars.
8. If the content is very short (< 50 chars), return empty arrays for all fields.
9. If a field is not applicable, use empty array [] or empty string "".

## Context Chain
If a previous section context is provided between [Previous section context] markers, use it to understand the document flow. The current section is CONTINUING from where the previous section left off.

## Examples

Content: "## Login Flow\nThe user enters credentials on the login page. System validates against the database. If valid, a JWT token is created with 24h expiry. Admin can reset passwords."

Output: {"tags":[{"tag":"user-login-authentication","category":"feature","confidence":0.95,"reason":"describes login flow with JWT"}],"summary":"Describes user login flow with credential validation, JWT token creation (24h expiry), and admin password reset capability.","business_entities":["User Credentials","JWT Token","Database"],"actors":["End User","System Admin"],"business_rules":["JWT token expires after 24 hours","Admin can reset passwords"]}`;
```

### 11.2 Context Chain Instruction in User Prompt

When context chain is active, the user prompt format changes from:
```
/no_think\nTag this:\n{content}
```

To:
```
/no_think

[Previous section context]
Summary: {previous_summary}
Business entities: {previous_entities}
Actors: {previous_actors}

---

{current_section_content}
```

### 11.3 Placeholder Replacement for ENHANCED_SYSTEM_PROMPT in prompts.ts

```typescript
// REPLACE current SYSTEM_PROMPT with:
export const SYSTEM_PROMPT = ENHANCED_SYSTEM_PROMPT;  // Reference the full prompt above
// OR inline the full prompt directly (preferred for clarity)
```

---

## 12. Implementation Plan

### 12.1 Implementation Phases

**Phase 1 (P0) — Core Extraction Improvement (Day 1):**

| Step | File(s) | Change | Effort |
|------|---------|--------|--------|
| 1.1 | `llm/analyzer.ts:11-22` | Update TagSuggestion interface (no change needed — it's already correct). **Update TagAnalysisResult** with 4 new fields (summary, business_entities, actors, business_rules) | 0.5h |
| 1.2 | `llm/analyzer.ts:65-83` | Remove `content.slice(0, 2000)` at line 69. Add context parameter to `analyzeWithLLM()`. Build context prompt | 0.5h |
| 1.3 | `llm/analyzer.ts:85-118` | Replace `parseResponse()` with `parseEnhancedResponse()` that handles new fields + old format + regex fallback | 1h |
| 1.4 | `llm/prompts.ts:56-71` | Replace SYSTEM_PROMPT with ENHANCED_SYSTEM_PROMPT | 0.5h |
| 1.5 | `dispatchers/crud.ts:63` | Remove `content.slice(0, 2000)` in handleIngest | 0.25h |
| 1.6 | `dispatchers/crud.ts:197` | Remove `sec.trim().slice(0, 2000)` in handleIngestFile | 0.25h |
| 1.7 | `llm/analyzer.ts` | Add `applyThresholdWithExtended()` method (same as applyThreshold but passes through new fields) | 0.25h |

**Phase 2 (P0) — structured_map Storage (Day 2):**

| Step | File(s) | Change | Effort |
|------|---------|--------|--------|
| 2.1 | `engine/crud.ts` | Add `updateStructuredMap(id, structuredMap)` method | 0.5h |
| 2.2 | `task-queue/TaskWorker.ts:181-199` | Rewrite `processTagEnrichment` to call `analyzeTags()` with context, update tags, then call `updateEntryStructuredMap()` | 1.5h |
| 2.3 | `task-queue/TaskWorker.ts` | Add private `loadPreviousContext()` method | 1h |
| 2.4 | `task-queue/TaskWorker.ts` | Add private `updateEntryStructuredMap()` with merge + truncation | 1h |
| 2.5 | `llm/analyzer.ts` or `llm/types.ts` | Add `safeParseStructuredMap()` utility function | 0.5h |
| 2.6 | `llm/analyzer.ts` | Add `fallbackWithExtended()` method (uses keyword extraction but returns extended result format) | 0.5h |

**Phase 3 (P1) — Context Chain (Day 3):**

| Step | File(s) | Change | Effort |
|------|---------|--------|--------|
| 3.1 | `task-queue/TaskWorker.ts` | Add import for ContextChainInput type | 0.25h |
| 3.2 | `llm/llm/types.ts` | Add ContextChainInput interface | 0.25h |
| 3.3 | `llm/analyzer.ts:45-63` | Update `analyzeTags()` signature to include `context?: ContextChainInput` parameter | 0.5h |
| 3.4 | `llm/prompts.ts` | Ensure ENHANCED_SYSTEM_PROMPT includes context chain instructions | 0.25h |
| 3.5 | `task-queue/TaskWorker.ts` | Wire `enableContextChain` config flag | 0.25h |

**Phase 4 (P1/P2) — Configuration & Polish (Day 4):**

| Step | File(s) | Change | Effort |
|------|---------|--------|--------|
| 4.1 | `task-queue/TaskWorkerConfig.ts` | Add 6 new config fields with defaults | 0.5h |
| 4.2 | `llm/analyzer.ts` | Add `chunkContent()` utility function | 0.5h |
| 4.3 | `llm/analyzer.ts` | Add `analyzeWithChunking()` method | 1h |
| 4.4 | `llm/analyzer.ts` | Add `estimateTokenCount()` helper | 0.25h |
| 4.5 | `llm/LLMService.ts:42` | Change default maxTokens from 300 to 2048 | 0.25h |
| 4.6 | All affected files | Unit tests + backward compatibility testing | 2h |
| 4.7 | `llm/analyzer.ts` | Connect chunking logic in `analyzeTags()` entry point | 0.5h |

### 12.2 Resource Estimates

| Resource | Estimate |
|----------|----------|
| Total development effort | 4-5 days |
| Files modified | 6 files |
| New interfaces | 2 (ContextChainInput, StructuredMapData) |
| New functions | 6 (chunkContent, analyzeWithChunking, loadPreviousContext, updateEntryStructuredMap, safeParseStructuredMap, parseEnhancedResponse) |
| Tests needed | 20+ (see §14) |

---

## 13. File-by-File Change List

### 13.1 `backend/src/modules/memory/dispatchers/crud.ts`

| Line(s) | Change Type | Current Code | New Code | Rationale |
|---------|-------------|--------------|----------|-----------|
| 63 | **REMOVE truncation** | `content: content.slice(0, 2000)` | `content: content` | Send full content in task payload (BRD Story 1) |
| 197 | **REMOVE truncation** | `content: sec.trim().slice(0, 2000)` | `content: sec.trim()` | Send full section content in task payload (BRD Story 1) |

**No other changes needed** in crud.ts. Context chain is handled by TaskWorker at processing time (FSD AD-001).

### 13.2 `backend/src/modules/memory/llm/analyzer.ts`

| Line(s) | Change Type | Description |
|---------|-------------|-------------|
| 11-22 | **UPDATE interface** | Add 4 new fields to `TagAnalysisResult`: `summary: string; business_entities: string[]; actors: string[]; business_rules: string[]` |
| 18-28 | **ADD interface** | Add `ContextChainInput` interface |
| 30-43 | **UPDATE class** | Add `workerConfig?: TaskWorkerConfig` parameter to constructor |
| 45-63 | **UPDATE method** | Update `analyzeTags()` signature: add `context?: ContextChainInput` parameter. Add chunking logic: if content exceeds context window, call `analyzeWithChunking()`. Update try-catch to call `fallbackWithExtended()` |
| 65-83 | **UPDATE method** | Update `analyzeWithLLM()`: remove `content.slice(0, 2000)` at line 69. Add `context?: ContextChainInput` parameter. Build context prompt using `buildContextPrompt()`. Increase timeout handling |
| 85-118 | **REPLACE method** | Replace `parseResponse()` with `parseEnhancedResponse()` that handles tags + summary + entities + actors + rules |
| 120-135 | **ADD method** | Add `applyThresholdWithExtended()` — same as applyThreshold but passes through new fields |
| 137-162 | **ADD method** | Add `fallbackWithExtended()` — keyword extraction with extended result format (empty arrays for new fields) |
| 164-179 | **ADD methods** | Add `chunkContent()`, `analyzeWithChunking()`, `estimateTokenCount()` |
| (new) | **ADD utility** | Add `safeParseStructuredMap()` as static method or standalone export |

### 13.3 `backend/src/modules/memory/llm/prompts.ts`

| Line(s) | Change Type | Description |
|---------|-------------|-------------|
| 56-71 | **REPLACE** | Replace current `SYSTEM_PROMPT` with `ENHANCED_SYSTEM_PROMPT` (see §11.1). Include extraction rules for summary, entities, actors, rules. Include context chain instructions. |

### 13.4 `backend/src/modules/memory/llm/LLMService.ts`

| Line(s) | Change Type | Current Code | New Code |
|---------|-------------|--------------|----------|
| 42 | **UPDATE default** | `maxTokens: config?.maxTokens ?? defaults.maxTokens ?? 300` | `maxTokens: config?.maxTokens ?? defaults.maxTokens ?? 2048` |

### 13.5 `backend/src/modules/memory/task-queue/TaskWorker.ts`

| Line(s) | Change Type | Description |
|---------|-------------|-------------|
| 14 | **ADD import** | Import `TaskWorkerConfig` type updates, `ContextChainInput` |
| 181-199 | **REWRITE** | Replace `processTagEnrichment()` with new implementation that: (1) loads previous context, (2) calls `analyzeTags()` with context, (3) updates tags, (4) calls `updateEntryStructuredMap()` |
| (new) | **ADD method** | Add `loadPreviousContext(entryId, source): Promise<ContextChainInput | null>` |
| (new) | **ADD method** | Add `updateEntryStructuredMap(entryId, result, context): Promise<void>` with merge + truncation + error handling |

### 13.6 `backend/src/modules/memory/task-queue/TaskWorkerConfig.ts`

| Line(s) | Change Type | Description |
|---------|-------------|-------------|
| 6-15 | **UPDATE interface** | Add 6 new fields: `enableContextChain`, `contextChainMaxLength`, `llmChunkSize`, `llmChunkOverlap`, `llmTimeout`, `structuredMapMaxSize` |
| 17-22 | **UPDATE defaults** | Add defaults for all 6 new fields in `DEFAULT_TASK_WORKER_CONFIG` |

### 13.7 `backend/src/modules/memory/engine/crud.ts`

| Line(s) | Change Type | Description |
|---------|-------------|-------------|
| (new) | **ADD method** | Add `updateStructuredMap(id: number, structuredMap: string): void` — direct SQL update with `updated_at = datetime('now')` |

---

## 14. Testing Strategy

### 14.1 Test Levels

| Level | Scope | Responsibility | Tool |
|-------|-------|----------------|------|
| Unit | Individual functions (chunkContent, safeParseStructuredMap, parseEnhancedResponse, mergeStructuredMap) | DEV | Jest |
| Unit | TagAnalyzerService.analyzeTags() with mocked LLM | DEV | Jest |
| Unit | processTagEnrichment() with mocked dependencies | DEV | Jest |
| Integration | Full flow: memory -> task -> worker -> DB | QA | Integration test |
| Integration | LLM integration with LM Studio (real LLM) | QA | Integration test |
| E2E | mem_ingest_file -> check structured_map in DB | QA | E2E test |

### 14.2 Key Test Cases

| ID | Test | Type | Priority |
|----|------|------|----------|
| T-01 | Full content sent to LLM (5000 chars, no truncation) | Integration | P0 |
| T-02 | Context chain: section 2 receives section 1 summary | Integration | P0 |
| T-03 | Expanded extraction: all 4 new fields populated | Integration | P0 |
| T-04 | structured_map persisted with correct merge | Integration | P0 |
| T-05 | Content > context window triggers chunking | Integration | P0 |
| T-06 | LLM timeout triggers fallback | Integration | P0 |
| T-07 | LLM unavailable triggers fallback | Integration | P0 |
| T-08 | LLM returns old format (tags only) — fills defaults | Unit | P0 |
| T-09 | LLM returns invalid JSON — regex fallback | Unit | P0 |
| T-10 | structured_map > 100KB truncation | Unit | P1 |
| T-11 | structured_map update fails — tags still updated | Integration | P1 |
| T-12 | Backward compat: old entry with structured_map='{}' | Integration | P1 |
| T-13 | Content < 10 chars — skip LLM | Unit | P1 |
| T-14 | Context chain disabled — no context prepended | Integration | P1 |
| T-15 | Context chain: prev section LLM failed | Integration | P1 |
| T-16 | Chunking merge: union tags across chunks | Unit | P1 |
| T-17 | safeParseStructuredMap: null, '', '{}', invalid JSON | Unit | P1 |
| T-18 | Context summary > 500 chars truncated | Unit | P2 |
| T-19 | Performance: 5000 chars section < 10s p95 | Performance | P1 |
| T-20 | Full cycle: file -> task -> worker -> structured_map | E2E | P0 |

### 14.3 Mock Strategy

For unit tests, mock the following:

```typescript
// Mock LLM call (TagAnalyzerService)
jest.mock('../llm/LLMService')
const mockComplete = jest.fn()
LLMService.prototype.complete = mockComplete

// Mock DB operations (engine)
const mockUpdateTags = jest.fn()
const mockUpdateStructuredMap = jest.fn()
const mockFindById = jest.fn()
```

---

## 15. Glossary

| Term | Definition |
|------|------------|
| Context Chain | Technique of passing prior section's summary into the next section's LLM prompt to maintain document-level context |
| structured_map | JSON column in `knowledge_entries` table storing extraction results (tags, summary, entities, actors, rules) |
| TagAnalyzerService | Service in `llm/analyzer.ts` that uses LLM to extract tags/metadata from KB entry content |
| TaskWorker | Background worker processing `pending_tasks` (TAG_ENRICHMENT, VECTOR_EMBEDDING) |
| Chunking | Automatic content splitting when section exceeds LLM context window, with configurable overlap |
| Context Window | Maximum tokens an LLM can process in one request (qwen3-8b: ~32K tokens via LM Studio) |
| Graceful Degradation | Fallback to keyword-based extraction when LLM is unavailable or times out |
| TAG_ENRICHMENT | Task type in `pending_tasks` for LLM-based tag/entity extraction from entry content |
| Direct Ingest | Single-entry ingestion via `handleIngest` (no file splitting, no context chain) |
| File Ingest | Multi-section ingestion via `handleIngestFile` (splits by headings, supports context chain) |

---

## 16. Open Issues

| ID | Issue | Owner | Target Date | Status |
|----|-------|-------|-------------|--------|
| OI-001 | Determine appropriate maxTokens value for qwen3-8b via LM Studio | SA | 2026-07-20 | OPEN — needs benchmarking |
| OI-002 | Decide between in-memory Map vs DB query for previous section context | TA | 2026-07-19 | **RESOLVED (D-1)** — DB query approach chosen (FSD §3.2.4) |
| OI-003 | Verify MemoryEngineCrud.getDb() removal (SA4E-45) doesn't conflict with direct SQL | DEV | 2026-07-21 | OPEN — check SA4E-45 branch |
| OI-004 | Benchmark chunking overlap value: 200 chars optimal for 6000-char chunks? | QA | 2026-07-22 | OPEN — needs empirical testing |
| OI-005 | Should extraction_meta include token_count (prompt + completion)? | BA | 2026-07-19 | **RESOLVED (D-2)** — Not in v1; deferred to v2 |
| OI-006 | Handle race condition: section N task starts before section N-1 summary written | TA | 2026-07-20 | **RESOLVED (D-3)** — DB query naturally resolves; returns null → no context |

---

## ⛔ MANDATORY: Diagram Requirements

### Required draw.io Diagrams

| # | Diagram | File | Section | Status |
|---|---------|------|---------|--------|
| 1 | Architecture Overview | `diagrams/architecture.drawio` + `.png` | §2.1 | ✅ Created |
| 2 | Component Diagram | `diagrams/component.drawio` + `.png` | §2.2 | ✅ Created |
| 3 | Deployment Diagram | `diagrams/deployment.drawio` + `.png` | §2.3 | ✅ Created |
| 4 | API Sequence (Context Chain) | `diagrams/api-sequence-context-chain.drawio` + `.png` | §3.x | ✅ Created |
| 5 | Database Schema | `diagrams/db-schema.drawio` + `.png` | §4.1 | ✅ Created |
| 6 | Class Diagram | `diagrams/class-diagram.drawio` + `.png` | §5.x | ✅ Created |
