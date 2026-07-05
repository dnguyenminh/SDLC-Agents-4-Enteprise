# Technical Design Document (TDD)

## SA4E Memory / Knowledge Base -- F1-MEMORY-KB

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F1-MEMORY-KB |
| Title | Memory / Knowledge Base Module |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Related BRD | BRD-v1-F1-MEMORY-KB.docx |
| Related FSD | FSD-v1-F1-MEMORY-KB.docx |
| Architecture Pattern | AI Agent System |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | SA Agent | Initial TDD |

---

## 1. Introduction

### 1.1 Purpose

This TDD specifies HOW to implement the Memory/KB module described in the FSD. It covers architecture, class design, database schema, search algorithms, embedding pipeline, and deployment.

### 1.2 Scope

- MemoryModule (IModule lifecycle)
- MemoryEngine (CRUD, search, graph, sessions)
- MemoryToolDispatcher (MCP tool routing)
- ScopePromotionService (background promotion)
- MaskingMiddleware (PII/credential pipeline)
- ONNX embedding integration
- SQLite schema (FTS5, vectors, graph edges)

### 1.3 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript | 5.x |
| Runtime | Node.js | 20.x LTS |
| Database | SQLite (better-sqlite3) | 11.x |
| Search | FTS5 (porter unicode61) | Built-in |
| Embeddings | ONNX Runtime | 1.17+ |
| Model | paraphrase-multilingual-MiniLM-L12-v2 | Latest |
| Logging | Pino | 8.x |
| Protocol | MCP (JSON-RPC 2.0 over stdio) | 1.0 |
| Build | esbuild | 0.20+ |

### 1.4 Design Principles

- **SOLID**: Single responsibility per class/module
- **Facade Pattern**: MemoryEngine as single entry point
- **Strategy Pattern**: Detectors (PII, Credential) are interchangeable
- **Module Pattern**: IModule interface for lifecycle management
- **Layered Architecture**: Tool → Dispatcher → Engine → DB

### 1.5 Constraints

- SQLite single-writer (WAL mode for concurrent reads)
- ONNX model loaded lazily on first embedding request
- 2000-token budget for pinned memory (hard limit)
- Hourly promotion scan (not real-time)
- No external vector DB (all local SQLite)

---

## 2. Architecture Overview

### 2.1 High-Level Architecture

![Architecture](diagrams/architecture.png)

```
[AI Agent] --MCP--> [MemoryToolDispatcher]
                         |
                    [MemoryEngine]
                    /    |    \
              [FTS5] [Vectors] [Graph]
                    \    |    /
                    [SQLite DB]
                         |
              [ScopePromotionService] (hourly)
              [MaskingMiddleware] (on query)
```

### 2.2 Component Architecture

![Component](diagrams/component.png)

| Component | Responsibility | Dependencies |
|-----------|---------------|--------------|
| MemoryModule | IModule lifecycle (init/shutdown) | DatabaseManager, config |
| MemoryEngine | All KB operations facade | Database (better-sqlite3) |
| MemoryToolDispatcher | Route tool name to engine method | MemoryEngine, QueryLayer |
| ScopePromotionService | Scan + promote + queue approval | Database, Logger |
| MaskingMiddleware | Detect + classify + mask | PiiDetector, CredentialDetector, Masker |
| ONNX Embedding | Generate 384-dim vectors | onnxruntime-node |

---

## 3. Module Design

### 3.1 MemoryModule (IModule)

```typescript
interface IModule {
  readonly name: string;
  get status(): ModuleStatus;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  getToolHandlers(): Map<string, ToolHandler>;
  getToolDefinitions(): ToolDefinition[];
}
```

**Lifecycle:**
1. `initialize()`: Load config -> init DB -> run migrations -> create Engine -> create Dispatcher -> start promotion interval
2. `shutdown()`: Clear interval -> end session -> close DB
3. Status: initializing -> ready | error -> stopped

### 3.2 MemoryEngine (Facade)

Single class exposing all operations:
- **CRUD**: insert, findById, findFiltered, deleteEntry, recordAccess
- **Search**: search(query, limit, tier, type, scopeCtx) -- FTS5 BM25
- **Graph**: addEdge, getNeighbors, countEdges
- **Sessions**: startSession, endSession, listSessions
- **Scope**: promoteEntry, demoteEntry, buildScopeClause
- **Audit**: auditLog, listAudit

### 3.3 MemoryToolDispatcher (Router)

Maps tool name string to engine method invocation:

```typescript
dispatch(toolName: string, args: Record<string, unknown>): string | null {
    switch(toolName) {
        case 'mem_search': return this.handleSearch(args);
        case 'mem_ingest': return this.handleIngest(args);
        case 'mem_ingest_file': return this.handleIngestFile(args);
        case 'mem_pin': return this.handlePin(args);
        // ... 14+ tools
    }
}
```

### 3.4 ScopePromotionService

```typescript
class ScopePromotionService {
    scanForPromotionCandidates(limit: number): PromotionCandidate[]
    evaluateCriteria(entry): { metCount, reasons, score }
    queueCandidates(candidates): { queued, autoApproved }
    runPromotionCycle(): string
    approve(entryId, reviewerId, comment): boolean
    reject(entryId, reviewerId, comment): boolean
    promoteOnMerge(ticketKey): { promoted, skipped }
}
```

**Promotion Criteria:**
- access_count >= 5
- confidence >= 0.8
- Has citations (cited by 2+ agents)
- quality_score >= 60

### 3.5 MaskingMiddleware (Pipeline)

```
Entries -> AllowlistCheck -> PiiDetector -> CredentialDetector
    -> ClassifySensitivity -> RoleAccessCheck -> ContentMasker -> AuditLog
```

**Strategy Pattern for Detectors:**
- PiiDetector: regex-based (email, phone, SSN patterns)
- CredentialDetector: regex-based (API keys, tokens, passwords)
- Both implement DetectorStrategy interface

### 3.6 TagAnalyzerService (Internal API — LLM-based)

**Pattern:** Strategy (LLM primary, keyword extraction fallback)

```typescript
class TagAnalyzerService {
    private llmProvider: LlmProvider;
    private taxonomy: TagTaxonomy;
    private fallback: KeywordExtractor;

    constructor(llmProvider: LlmProvider, taxonomyPath: string);

    // Called internally by MemoryEngine during ingest
    async analyzeTags(content: string, options?: TagAnalyzeOptions): Promise<TagAnalysisResult>;

    // Admin batch endpoint
    async batchAnalyze(entryIds: number[], force: boolean): Promise<BatchResult>;

    private buildPrompt(content: string, taxonomy: TagTaxonomy): string;
    private parseResponse(llmOutput: string): TagSuggestion[];
    private validateAgainstTaxonomy(tags: TagSuggestion[]): TagSuggestion[];
    private applyConfidenceFilter(tags: TagSuggestion[], threshold: number): { applied: string[], suggested: TagSuggestion[] };
}

interface TagAnalyzeOptions {
    taxonomyCategories?: string[];  // filter which categories to consider
    threshold?: number;             // confidence threshold (default 0.7)
    autoApply?: boolean;            // auto-assign tags (default true)
}

interface TagSuggestion {
    tag: string;
    category: string;
    confidence: number;
    reason: string;
}

interface TagAnalysisResult {
    appliedTags: string[];
    suggestedTags: TagSuggestion[];
    fallbackUsed: boolean;
}
```

**Integration point in MemoryEngine.ingest():**

```typescript
async ingest(content, metadata): Promise<number> {
    // ... validation, summary generation ...

    // Step: AI Tag Analysis (if tags not provided)
    if (!metadata.tags && this.tagAnalyzer) {
        try {
            const result = await this.tagAnalyzer.analyzeTags(content, { threshold: 0.7 });
            metadata.tags = result.appliedTags.join(',');
        } catch (e) {
            logger.warn('Tag analysis failed, continuing without auto-tags', e);
        }
    }

    // ... embedding, insert, audit ...
}
```

**Fallback (KeywordExtractor):**

```typescript
class KeywordExtractor {
    private knownKeywords: Map<string, string>;  // keyword -> category

    extract(content: string): string[] {
        // 1. Match known domain keywords
        // 2. Match CamelCase identifiers
        // 3. Match "Decision:", "Error:", "Fix:" prefixes
        // Return max 6 tags
    }
}
```

**Design Decisions:**

| Decision | Rationale |
|----------|-----------|
| Internal API, not MCP tool | Zero context cost for agents (BRD Story 13) |
| LLM with fallback | Graceful degradation when LLM unavailable |
| Confidence threshold 0.7 | Balance precision vs recall |
| Max 6 tags per entry | Prevent tag explosion |
| Taxonomy-validated | Consistency across all entries |
| Non-blocking ingest | Tag failure does NOT block entry creation |

---

## 4. Database Design

### 4.1 Schema Overview

17 tables in SQLite (see schema.ts for full DDL):

| Table | Purpose | Key Indexes |
|-------|---------|-------------|
| knowledge_entries | Core entries | tier, scope, user_id, type, archived |
| knowledge_fts | FTS5 virtual table | Auto-indexed via triggers |
| knowledge_vectors | 384-dim embeddings | entry_id (unique) |
| knowledge_graph_edges | Typed relationships | source_id, target_id, relation |
| consolidation_log | Tier/scope change history | entry_id |
| memory_sessions | Agent sessions | session_id, status |
| memory_audit | All operation audit | operation, entry_id, created_at |
| conversation_turns | Chat history | session_id, turn_number |
| entity_index | Named entity extraction | entity_name, entity_type |
| tags | Tag taxonomy | name (unique) |
| entry_tags | M:N junction | entry_id, tag_id |
| citations | Citation tracking | entry_id, cited_by |
| attachments | File attachments | entry_id |
| feedback | User ratings | entry_id |
| quality_scores | Computed scores | entry_id |
| reminders | Review reminders | entry_id, status |
| search_log | Query analytics | created_at |

### 4.2 Migration Strategy

- `migrations/001-add-scope-columns.ts`: Adds scope/user_id columns to existing DBs
- Migrations run at module initialize() before creating Engine
- Schema DDL uses `CREATE TABLE IF NOT EXISTS` (idempotent)

### 4.3 Indexing Strategy

- **FTS5**: Porter stemmer + unicode61 tokenizer for English/multilingual
- **B-tree indexes**: On frequently filtered columns (tier, scope, user_id, type, archived)
- **Compound indexes**: (scope, user_id), (tier, archived, created_at) for common queries
- **Vector index**: Single BLOB column, cosine similarity computed in application code

---

## 5. Search Algorithm Design

### 5.1 BM25 (FTS5)

```sql
SELECT ke.*, rank FROM knowledge_fts
JOIN knowledge_entries ke ON knowledge_fts.rowid = ke.id
WHERE knowledge_fts MATCH ?
  AND ke.archived = 0
  AND (ke.scope IN ('PROJECT','SHARED') OR (ke.scope = 'USER' AND ke.user_id = ?))
ORDER BY rank
LIMIT ?
```

**Query Sanitization:**
```typescript
const ftsQuery = query.replace(/[^\w\s*":.]/g, ' ').trim() || '*';
```

### 5.2 Vector Search (ONNX)

1. Load model: `paraphrase-multilingual-MiniLM-L12-v2` (384 dimensions)
2. Encode query to float32[384]
3. For each vector in knowledge_vectors: compute cosine similarity
4. Top-K by similarity score
5. Note: brute-force scan (acceptable for <100K entries, ~50ms)

### 5.3 Graph Expansion

1. Take top 3 FTS results
2. For each: getNeighbors(id) -> related entries
3. Add to result pool with reduced weight (0.5x)
4. Deduplicate by entry ID

### 5.4 Score Merging

```typescript
finalScore = (bm25Score * 0.5) + (vectorScore * 0.3) + (graphScore * 0.2)
```

---

## 6. Security Design

### 6.1 Scope Enforcement

Every query MUST include scope clause (no bypass):

```typescript
buildScopeClause(ctx: ScopeContext, alias?: string): string {
    return `(${p}scope IN ('PROJECT','SHARED') OR (${p}scope = 'USER' AND ${p}user_id = ?))`;
}
```

Parameterized query prevents SQL injection.

### 6.2 Masking Pipeline

- Detectors use regex patterns (no ML model needed)
- Role-based access matrix enforced at middleware level
- ADMIN can reveal with explicit flag (audited)
- All mask/hide/reveal actions logged

### 6.3 Input Validation

- Query sanitization removes FTS5 special chars
- entry_id validated as positive integer
- scope validated against enum
- tags sanitized (no SQL injection via FTS5 content)

---

## 7. Error Handling

| Error Type | Strategy | Recovery |
|-----------|----------|----------|
| FTS5 query parse error | try/catch, fallback to empty | Return [] |
| DB locked (SQLITE_BUSY) | Retry once after 100ms | Return error if still locked |
| ONNX model not loaded | Skip vector search, use FTS only | Graceful degradation |
| Invalid scope transition | Throw, return false | Caller handles |
| File not found (ingest_file) | Return clear error with path | Agent corrects |

---

## 8. Performance Considerations

| Operation | Target | Strategy |
|-----------|--------|----------|
| BM25 search | <50ms | FTS5 built-in ranking, indexed |
| Vector search | <150ms | Brute-force OK for <100K, lazy model load |
| Ingest | <500ms | Embedding is bottleneck, async possible |
| Promotion scan | <5s | Limited to 50 candidates per cycle |
| Module startup | <2s | Lazy ONNX load, migrations are fast |

### 8.1 Caching

- No explicit cache needed (SQLite in-memory pages handle hot data)
- ONNX model cached in memory after first load
- ConfigCacheService for masking config (avoids repeated DB reads)

---

## 9. Implementation Checklist

| # | Component | Files to Create/Modify | Status |
|---|-----------|----------------------|--------|
| 1 | MemoryModule | backend/src/modules/memory/MemoryModule.ts | Exists |
| 2 | MemoryEngine | backend/src/modules/memory/MemoryEngine.ts | Exists |
| 3 | MemoryToolDispatcher | backend/src/modules/memory/MemoryToolDispatcher.ts | Exists |
| 4 | MemoryToolDefinitions | backend/src/modules/memory/MemoryToolDefinitions.ts | Exists |
| 5 | ScopePromotionService | backend/src/modules/memory/ScopePromotionService.ts | Exists |
| 6 | MaskingMiddleware | backend/src/modules/memory/masking/MaskingMiddleware.ts | Exists |
| 7 | PiiDetector | backend/src/modules/memory/masking/detectors/PiiDetector.ts | Exists |
| 8 | CredentialDetector | backend/src/modules/memory/masking/detectors/CredentialDetector.ts | Exists |
| 9 | Schema DDL | backend/src/modules/memory/schema.ts | Exists |
| 10 | Models | backend/src/modules/memory/models.ts | Exists |
| 11 | Migration 001 | backend/src/modules/memory/migrations/001-add-scope-columns.ts | Exists |
| 12 | LLM Service | backend/src/modules/memory/llm/LLMService.ts | Exists |
| 13 | Tests | backend/src/modules/memory/__tests__/*.test.ts | Partial |

---

## 10. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
