# Technical Design Document (TDD)

## SA4E — F4-context-assembly: AI Context Assembly

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F4-context-assembly |
| Title | AI Context Assembly — Technical Design |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Related BRD | BRD-v1-F4-context-assembly.docx |
| Related FSD | FSD-v1-F4-context-assembly.docx |
| Architecture Pattern | AI Agent System |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | SA Agent | Initial — architecture, component design, algorithms |

---

## 1. Introduction

This TDD specifies HOW to implement the AI Context Assembly engine. For WHAT it does, refer to the FSD. This document focuses on architecture decisions, class design, algorithms, and implementation patterns.

### 1.1 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 20+ |
| Language | TypeScript | 5.x |
| Database | SQLite via better-sqlite3 | Synchronous |
| Module System | ESM (.js extension imports) | ES2022 |
| Build | esbuild | Bundled into extension |

---

## 2. Architecture Overview

### 2.1 Architecture Diagram

![Architecture](diagrams/architecture.png)

### 2.2 Component Overview

The Context Assembly engine is a pure TypeScript module within the SA4E backend. It has no HTTP server — it is invoked synchronously via MCP tool dispatch.

**Layers:**

1. **Tool Layer** (ai-context-tools.ts) — MCP tool definitions + handler dispatch
2. **Service Layer** — AIContextService, EditContextService, CuratedContextService
3. **Algorithm Layer** — TokenBudgetManager, RRFMerger, BudgetAllocator, QueryAnalyzer, IntentStrategies
4. **Data Access Layer** — SQLite queries via better-sqlite3, CallGraphService, SymbolResolver, GitService

### 2.3 Design Principles

- **Synchronous by default**: better-sqlite3 is synchronous; async only for parallel Promise.all in CuratedContextService
- **Fail gracefully**: Each section fetch wrapped in try-catch; failures skip section, not crash request
- **Budget as hard constraint**: Never exceed declared token budget
- **Strategy Pattern**: IntentStrategies decouples intent logic from service code
- **Single Responsibility**: Each class has one job (merge, budget, analyze, resolve)

---

## 3. Component Design

### 3.1 Component Diagram

![Component Diagram](diagrams/component.png)

### 3.2 Class Design

#### 3.2.1 TokenBudgetManager

**File:** backend/src/engine/context/token-budget-manager.ts

| Method | Signature | Description |
|--------|-----------|-------------|
| constructor | (budget: number) | Initialize with max budget (min 500) |
| estimateTokens | (content: any): number | ceil(stringify(content).length / 4) |
| canFit | (tokens: number): boolean | Check remaining >= tokens |
| consume | (tokens: number): void | Add to consumed counter |
| remaining | (): number | budget - consumed |
| isExhausted | (): boolean | remaining < 50 |
| truncateToFit | (content: any): any | Truncate string/array to remaining |
| assemble | (sections, budget): AssembleResult | Priority-ordered assembly |

**Design decisions:**
- Token estimation at 4 chars/token is intentionally conservative (actual LLM tokens vary by model)
- assemble() is the core method used by both AIContext and EditContext services
- Truncation preserves array order (takes from front)

#### 3.2.2 RRFMerger

**File:** backend/src/engine/context/rrf-merger.ts

| Method | Signature | Description |
|--------|-----------|-------------|
| merge | (sources, weights?): MergedResult[] | RRF merge with configurable weights |

**Algorithm:**
- k=60 constant (standard in IR literature)
- Deduplication via getKey(): id > name:file > name > JSON prefix
- Additive scoring for multi-source items
- Output sorted by descending score

#### 3.2.3 BudgetAllocator

**File:** backend/src/engine/context/budget-allocator.ts

| Method | Signature | Description |
|--------|-----------|-------------|
| allocate | (results: MergedResult[], maxTokens: number): AllocatedResult[] | Assign detail levels |

**Design decisions:**
- 20/60/40 split for full/signature/reference thresholds (not configurable — simplicity)
- Downgrade path: full -> signature (never full -> reference directly)
- Response overhead: 100 tokens reserved for JSON structure

#### 3.2.4 QueryAnalyzer

**File:** backend/src/engine/context/query-analyzer.ts

| Method | Signature | Description |
|--------|-----------|-------------|
| analyze | (query: string): QueryAnalysis | Parse NL query into search components |

**Design decisions:**
- Stop words list is English-only (sufficient for code queries)
- Symbol detection regex handles: CamelCase, camelCase, snake_case, dot.notation
- Bigram phrases used for improved FTS relevance

#### 3.2.5 IntentStrategies

**File:** backend/src/engine/context/intent-strategies.ts

| Function | Signature | Description |
|----------|-----------|-------------|
| getStrategy | (intent: string): IntentStrategy | Get section priorities for intent |
| getSupportedIntents | (): string[] | List available intents |

**Design decisions:**
- Static configuration (not database-driven) — strategies change with code releases
- Fallback to "explain" for unknown intents
- Each section has format hint (full/summary/signatures) for future rendering customization

#### 3.2.6 AIContextService

**File:** backend/src/engine/context/ai-context-service.ts

| Method | Signature | Description |
|--------|-----------|-------------|
| getContext | (params: AIContextParams): Promise<AIContextResponse> | Main entry point |
| fetchSection | (section, symbol, depth): any | Dispatch to section fetcher |

**Dependencies:** SymbolResolver, CallGraphService, TokenBudgetManager, GitService, Database

#### 3.2.7 EditContextService

**File:** backend/src/engine/context/edit-context-service.ts

| Method | Signature | Description |
|--------|-----------|-------------|
| getContext | (params: EditContextParams): Promise<EditContextResult> | Main entry |
| resolveSymbolInput | (input): ResolvedSymbol | Handle name or file:line |

**Dependencies:** SymbolResolver, CallGraphService, TestDetector, TokenBudgetManager, GitService

#### 3.2.8 CuratedContextService

**File:** backend/src/engine/context/curated-context-service.ts

| Method | Signature | Description |
|--------|-----------|-------------|
| getContext | (params: CuratedContextParams): Promise<CuratedContextResponse> | Main entry |
| searchCode | (analysis): SourceResults | FTS + symbol resolution |
| searchMemory | (analysis): SourceResults | KB FTS search |
| expandGraph | (topSymbols): SourceResults | 1-hop graph traversal |

**Dependencies:** QueryAnalyzer, RRFMerger, BudgetAllocator, SymbolResolver, GraphTraverser, QueryLayer

---

## 4. Data Model

### 4.1 Tables Read (existing, not created by this feature)

| Table | Columns Used | Purpose |
|-------|-------------|---------|
| symbols | id, name, kind, file_id, start_line, end_line, signature, doc_comment, parent_symbol_id | Symbol resolution |
| files | id, relative_path, module | File path lookup |
| relationships | source_symbol_id, target_symbol_id, target_symbol, kind, file_path | Import/dependency tracking |
| knowledge_entries | id, content, summary, type, tags, created_at | KB memory search |
| knowledge_fts | rowid match | FTS5 virtual table for KB |

### 4.2 Key Queries

**Symbol resolution:**
`sql
SELECT id, name, kind, start_line, end_line, signature, doc_comment
FROM symbols WHERE name = ? OR name LIKE ?
`

**File:line resolution:**
`sql
SELECT s.*, f.relative_path FROM symbols s
JOIN files f ON s.file_id = f.id
WHERE f.relative_path LIKE ? AND s.start_line <= ? AND s.end_line >= ?
ORDER BY (s.end_line - s.start_line) ASC LIMIT 1
`

**KB memory search:**
`sql
SELECT id, content, summary, type, tags FROM knowledge_entries
WHERE id IN (SELECT rowid FROM knowledge_fts WHERE knowledge_fts MATCH ?)
ORDER BY created_at DESC LIMIT 10
`

---

## 5. API Design (MCP Tool Interface)

### 5.1 Tool Registration

All three tools registered in backend/src/engine/tools/register-tools.ts via switch-case dispatch.

### 5.2 Tool Definitions

Defined in backend/src/engine/tools/ai-context-tools.ts as AI_CONTEXT_TOOL_DEFINITIONS array.

### 5.3 Handler Pattern

`	ypescript
case 'get_ai_context': return handleGetAIContext(args, db, workspace);
case 'get_edit_context': return handleGetEditContext(args, db, workspace);
case 'get_curated_context': return handleGetCuratedContext(args, db, workspace, dbManager);
`

Each handler: instantiate service -> call getContext() -> JSON.stringify result.

---

## 6. Error Handling

| Component | Strategy | Implementation |
|-----------|----------|----------------|
| AIContextService.fetchSection | try-catch per section | Return null on failure, skip |
| CuratedContextService.searchCode | try-catch | Return empty results |
| CuratedContextService.searchMemory | try-catch | Handle missing KB tables |
| EditContextService.readSymbolSource | try-catch | Return empty string |
| SymbolResolver.resolve | Return empty array | No throw |
| GitService.getFileHistory | try-catch | Return empty array |

**No exceptions propagate to MCP layer** — all handlers return valid JSON strings (either success or error response).

---

## 7. Security Design

| Concern | Mitigation |
|---------|-----------|
| Path traversal in file reads | path.resolve with workspace root; no .. escape |
| SQL injection | Parameterized queries (better-sqlite3 prepared statements) |
| Prompt injection via content | Content returned as-is; sanitization is consumer responsibility |
| Resource exhaustion | Budget limits prevent unbounded responses; LIMIT clauses on all queries |

---

## 8. Performance Design

| Optimization | Implementation |
|-------------|----------------|
| Synchronous DB access | better-sqlite3 avoids async overhead for simple queries |
| Parallel source search | Promise.all for code + memory in CuratedContextService |
| Early termination | Budget exhaustion check before each section fetch |
| FTS indexing | SQLite FTS5 for fast keyword search |
| Limit clauses | All queries have explicit LIMIT (10, 20, 30) |
| Lazy section fetch | Sections fetched only if budget allows |

---

## 9. Implementation Checklist

| # | File | Action | Priority |
|---|------|--------|----------|
| 1 | backend/src/engine/context/types.ts | Shared interfaces (existing) | - |
| 2 | backend/src/engine/context/token-budget-manager.ts | Budget tracking (existing) | - |
| 3 | backend/src/engine/context/rrf-merger.ts | RRF algorithm (existing) | - |
| 4 | backend/src/engine/context/budget-allocator.ts | Detail allocation (existing) | - |
| 5 | backend/src/engine/context/query-analyzer.ts | Query parsing (existing) | - |
| 6 | backend/src/engine/context/intent-strategies.ts | Strategy mapping (existing) | - |
| 7 | backend/src/engine/context/ai-context-service.ts | Main service (existing) | - |
| 8 | backend/src/engine/context/edit-context-service.ts | Edit service (existing) | - |
| 9 | backend/src/engine/context/curated-context-service.ts | Curated service (existing) | - |
| 10 | backend/src/engine/context/git-service.ts | Git history (existing) | - |
| 11 | backend/src/engine/tools/ai-context-tools.ts | Tool defs + handlers (existing) | - |
| 12 | backend/extension/src/ai-context-commands.ts | VS Code commands (existing) | - |

> Note: All files are already implemented. This TDD documents the existing architecture for reference and future maintenance.

---

## 10. Testing Strategy

| Level | Focus | Tools |
|-------|-------|-------|
| Unit Tests | TokenBudgetManager, RRFMerger, BudgetAllocator, QueryAnalyzer | vitest |
| Integration Tests | AIContextService + real SQLite DB | vitest + test fixtures |
| E2E Tests | MCP tool calls via HTTP | backend/tests/e2e/ |

### Key Test Scenarios

1. Token budget never exceeded (property-based test)
2. RRF merge with overlapping items produces correct additive scores
3. Intent strategies return correct section order
4. file:line resolution finds innermost symbol
5. Graceful degradation when DB tables missing
6. Empty query returns empty results (not crash)

---

## 11. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
