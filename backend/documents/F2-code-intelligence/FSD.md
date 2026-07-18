# Functional Specification Document (FSD)

## SA4E Code Intelligence — F2-CODE-INTELLIGENCE

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F2-CODE-INTELLIGENCE |
| Title | Code Intelligence Module |
| Author | BA Agent + TA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Related BRD | BRD-v1-F2-CODE-INTELLIGENCE.docx |
| Architecture Pattern | AI Agent System |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | BA Agent | Initial FSD — BA draft |
| 1.0 | 2025-07-03 | TA Agent | Technical enrichment — API contracts, pseudocode |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional behavior of the Code Intelligence module for the SA4E multi-agent system. It details use cases, data model, API contracts, graph traversal algorithms, and processing logic for all 20+ MCP tools.

### 1.2 Scope

All MCP tools for code search, symbol resolution, call graph, dependency graph, impact analysis, complexity scoring, entry point detection, graph analysis, and AI context assembly.

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| AST | Abstract Syntax Tree |
| BFS | Breadth-First Search |
| FTS5 | Full-Text Search 5 (SQLite) |
| SCC | Strongly Connected Components (Tarjan's algorithm) |
| CC | Cyclomatic Complexity |
| MCP | Model Context Protocol |
| Tree-sitter | Incremental parsing library |
| WASM | WebAssembly (grammar format) |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-F2-CODE-INTELLIGENCE.docx |
| Source Code | backend/src/engine/parsers/, backend/src/engine/graph/, backend/src/modules/code-intel/ |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

The Code Intelligence module sits between AI agents (via MCP protocol) and the indexed code database (SQLite). It reads source files from the workspace filesystem and provides structural understanding through graph services.

### 2.2 System Architecture

- **CodeIntelModule**: IModule implementation, lifecycle management, tool registration
- **IndexingEngine**: Orchestrates file discovery, parsing, and DB storage
- **TreeSitterIndexer**: Tree-sitter parsing with grammar registry and regex fallback
- **GrammarRegistry**: Manages WASM grammar loading per language
- **CallGraphService**: BFS callers/callees traversal
- **DependencyGraphService**: BFS import/export relationship traversal
- **ImpactAnalysisService**: Combined blast radius prediction
- **SymbolResolver**: Fuzzy symbol lookup with disambiguation
- **ComplexityAnalyzer**: Cyclomatic complexity scoring
- **EntryPointDetector**: HTTP/CLI/event handler discovery
- **GraphAnalysis Tools**: Circular deps, hot paths, dead imports, related tests
- **AI Context Tools**: Intent-aware context assembly with token budgeting

---

## 3. Functional Requirements

### 3.1 Use Case: Code Search (UC-CI-01)

**Actor:** AI Agent
**Trigger:** Agent needs to find code symbols matching a keyword

#### Main Flow

| Step | Actor | System |
|------|-------|--------|
| 1 | Agent calls code_search(query, limit) | |
| 2 | | Sanitizes query (remove special FTS5 chars) |
| 3 | | Executes FTS5 query against symbols_fts table |
| 4 | | Retrieves matching symbols with file paths |
| 5 | | Formats results as structured text |
| 6 | | Returns results sorted by FTS5 rank |

#### Alternative Flow

| ID | Condition | Action |
|----|-----------|--------|
| A1 | Query is empty | Return empty results |
| A2 | FTS5 syntax error | Fallback to wildcard query |
| A3 | No results found | Return empty with suggestion to broaden query |

#### Exception Flow

| ID | Condition | Action |
|----|-----------|--------|
| E1 | Database locked | Retry once after 100ms, then return error |
| E2 | Index not ready | Return partial results with warning |

---

### 3.2 Use Case: Call Graph Analysis (UC-CI-02)

**Actor:** AI Agent
**Trigger:** Agent needs to understand callers/callees of a function

#### Main Flow

| Step | Actor | System |
|------|-------|--------|
| 1 | Agent calls code_callers(symbol, depth, limit) | |
| 2 | | Resolves symbol via SymbolResolver |
| 3 | | Initializes BFS queue with resolved symbols |
| 4 | | For each level up to depth: queries relationships table |
| 5 | | Deduplicates using visited set |
| 6 | | Applies file_filter if provided |
| 7 | | Returns results with depth levels and metadata |

#### Alternative Flow

| ID | Condition | Action |
|----|-----------|--------|
| A1 | Symbol not found | Return empty with fuzzy suggestions |
| A2 | Depth > 5 | Clamp to max depth 5 |
| A3 | Multiple kind filters | Query each kind separately, merge |

#### Exception Flow

| ID | Condition | Action |
|----|-----------|--------|
| E1 | Circular reference | Visited set prevents infinite loop |
| E2 | Result limit reached | Truncate, set metadata.truncated=true |

#### API Contract

`json
// Request
{
  "symbol": "findCallers",
  "depth": 2,
  "limit": 20,
  "file_filter": "src/engine/*"
}

// Response
{
  "symbol": "findCallers",
  "resolvedTo": [{"id": 42, "file": "src/engine/graph/call-graph-service.ts", "line": 55, "kind": "method"}],
  "results": [
    {
      "symbol": "dispatchCodeIntelTool",
      "qualifiedName": "dispatchCodeIntelTool",
      "kind": "function",
      "filePath": "src/engine/tools/register-tools.ts",
      "definitionLine": 71,
      "callSiteLine": 85,
      "depthLevel": 1,
      "isAsync": true
    }
  ],
  "metadata": {"totalCount": 1, "depthSearched": 2, "truncated": false, "queryTimeMs": 12}
}
`

---

### 3.3 Use Case: Dependency Graph (UC-CI-03)

**Actor:** AI Agent
**Trigger:** Agent needs to understand file-level import/export relationships

#### Main Flow

| Step | Actor | System |
|------|-------|--------|
| 1 | Agent calls code_dependencies(file, direction, depth) | |
| 2 | | Resolves file path via FileResolver |
| 3 | | BFS traversal in specified direction |
| 4 | | At each level: queries relationships by kind (imports, inherits, etc.) |
| 5 | | Detects cycles (path tracking) |
| 6 | | Filters external dependencies if requested |
| 7 | | Returns dependency tree with cycles array |

#### API Contract

`json
// Request
{
  "file": "src/engine/graph/call-graph-service.ts",
  "direction": "outgoing",
  "depth": 2,
  "include_external": false
}

// Response
{
  "root": "src/engine/graph/call-graph-service.ts",
  "direction": "outgoing",
  "results": [
    {"file": "src/engine/database/graph-repository.ts", "depth": 1, "importedSymbols": ["GraphRepository"], "isExternal": false},
    {"file": "src/engine/graph/symbol-resolver.ts", "depth": 1, "importedSymbols": ["SymbolResolver"], "isExternal": false}
  ],
  "cycles": [],
  "metadata": {"totalNodes": 2, "maxDepthReached": 1, "truncated": false, "queryTimeMs": 8, "externalCount": 0}
}
`

---

### 3.4 Use Case: Impact Analysis (UC-CI-04)

**Actor:** AI Agent
**Trigger:** Agent needs to assess risk before modifying/deleting a symbol

#### Main Flow

| Step | Actor | System |
|------|-------|--------|
| 1 | Agent calls code_impact(symbol, action, depth) | |
| 2 | | Resolves symbol |
| 3 | | Finds all callers via CallGraphService (transitive) |
| 4 | | Finds interface implementors (if interface method) |
| 5 | | Finds file-level dependents via DependencyGraphService |
| 6 | | Finds related tests via TestDetector |
| 7 | | Classifies severity for each impact item |
| 8 | | Deduplicates and sorts by severity |
| 9 | | Generates recommendations |
| 10 | | Returns blast radius summary + details |

#### Severity Classification

| Action | Depth 1 | Depth 2 | Depth 3 | Depth 4+ |
|--------|---------|---------|---------|----------|
| delete | critical | high | medium | low |
| modify | critical | high | medium | low |
| rename | high | medium | low | low |

#### API Contract

`json
// Response
{
  "symbol": "findCallers",
  "action": "modify",
  "blastRadius": {
    "summary": {"critical": 3, "high": 5, "medium": 8, "low": 2},
    "totalAffected": 18,
    "affectedFiles": 12,
    "affectedTests": 4
  },
  "impacts": [...],
  "affectedTests": [...],
  "recommendations": ["Update 3 direct callers if signature changes", "Run affected tests: ..."]
}
`

---

### 3.5 Use Case: AI Context Assembly (UC-CI-05)

**Actor:** AI Agent
**Trigger:** Agent needs contextual code information tailored to intent

#### Main Flow (get_ai_context)

| Step | Actor | System |
|------|-------|--------|
| 1 | Agent calls get_ai_context(symbol, intent, token_budget) | |
| 2 | | Resolves symbol |
| 3 | | Reads source code of symbol |
| 4 | | Based on intent, selects context sections: |
|   | | - explain: source + callers + docs |
|   | | - modify: source + callers + tests + siblings |
|   | | - debug: source + callees + error paths |
|   | | - test: source + interface + existing tests |
| 5 | | Assembles sections, counts tokens |
| 6 | | If over budget: truncates least relevant sections |
| 7 | | Returns assembled context with metadata |

#### Token Budget Strategy

1. Source code: always included (highest priority)
2. Direct callers: included if budget allows
3. Tests: included for modify/test intents
4. Git history: included for edit context only
5. Siblings: lowest priority, truncated first

---

### 3.6 Use Case: Complexity Analysis (UC-CI-06)

**Actor:** AI Agent
**Trigger:** Agent needs to identify complex functions for refactoring

#### Main Flow

| Step | Actor | System |
|------|-------|--------|
| 1 | Agent calls complexity_analysis(filters) | |
| 2 | | Queries complexity data from DB |
| 3 | | Applies filters (file, symbol, grade, module) |
| 4 | | Computes grade for each function: A(1-5) B(6-10) C(11-15) D(16-20) F(21+) |
| 5 | | Sorts by specified field (default: complexity desc) |
| 6 | | Returns results with breakdown |

---

### 3.7 Use Case: Background Indexing (UC-CI-07)

**Actor:** File Watcher (System)
**Trigger:** File created/modified/deleted in workspace

#### Main Flow

| Step | Actor | System |
|------|-------|--------|
| 1 | File system event detected | |
| 2 | | Compute content hash |
| 3 | | Compare with stored hash |
| 4 | | If changed: queue for parsing |
| 5 | | Load appropriate Tree-sitter grammar |
| 6 | | Parse AST → extract symbols + relationships |
| 7 | | Atomic DB update (delete old + insert new) |
| 8 | | Update module assignment |
| 9 | | Detect architectural patterns from import graph |

#### State Diagram

![Indexing State](diagrams/state-indexing.png)

---

## 4. Business Rules

| ID | Rule | Description |
|----|------|-------------|
| BR-CI-01 | Max Depth | Graph traversal depth clamped to [1, 5] |
| BR-CI-02 | Deduplication | Each node reported once at minimum depth (visited set) |
| BR-CI-03 | File Size Limit | Files > 1MB use regex fallback (no Tree-sitter) |
| BR-CI-04 | Token Budget | AI context responses respect token_budget parameter |
| BR-CI-05 | Incremental Index | Only re-parse files with changed content hash |
| BR-CI-06 | Grammar Fallback | If no Tree-sitter grammar, use regex extraction |
| BR-CI-07 | Cycle Prevention | Graph traversal uses visited set to prevent infinite loops |
| BR-CI-08 | External Filter | External dependencies excluded by default in dep graph |
| BR-CI-09 | Severity Rules | Impact severity depends on action type + depth |
| BR-CI-10 | Interface Cascade | Modifying interface method impacts all implementors |

---

## 5. Data Model

### 5.1 Database Schema

`sql
-- Core tables
CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relative_path TEXT NOT NULL UNIQUE,
  language TEXT,
  content_hash TEXT,
  size_bytes INTEGER,
  module TEXT,
  indexed_at TEXT DEFAULT (datetime('now')),
  line_count INTEGER
);

CREATE TABLE symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  signature TEXT,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  parent_symbol TEXT,
  visibility TEXT,
  doc_comment TEXT,
  is_async INTEGER DEFAULT 0,
  complexity INTEGER
);

CREATE TABLE relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_symbol_id INTEGER REFERENCES symbols(id) ON DELETE CASCADE,
  target_symbol TEXT NOT NULL,
  target_symbol_id INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  file_path TEXT NOT NULL,
  line INTEGER,
  metadata TEXT
);

-- FTS5 search index
CREATE VIRTUAL TABLE symbols_fts USING fts5(
  name, signature, doc_comment,
  content=symbols, content_rowid=id,
  tokenize='porter unicode61'
);

-- Modules table
CREATE TABLE modules (
  name TEXT PRIMARY KEY,
  path_pattern TEXT,
  file_count INTEGER DEFAULT 0,
  language TEXT,
  description TEXT
);

-- Body embeddings (for similarity analysis)
CREATE TABLE body_embeddings (
  symbol_id INTEGER PRIMARY KEY REFERENCES symbols(id) ON DELETE CASCADE,
  chunk_index INTEGER DEFAULT 0,
  embedding BLOB,
  token_count INTEGER
);
`

### 5.2 Relationship Kinds

| Kind | Description | Example |
|------|-------------|---------|
| calls | Function call | A() calls B() |
| imports | Module import | file A imports from file B |
| inherits | Class inheritance | ClassA extends ClassB |
| implements | Interface implementation | ClassA implements InterfaceB |
| trigger-on | Salesforce trigger | trigger on Account |
| soql | SOQL query | queries Account object |
| dml | DML operation | insert/update/delete |
| wire | LWC wire decorator | @wire(getRecord) |
| flow-action | Flow action call | calls Apex action |
| apex-import | Apex import | imports Apex class |

---

## 6. Non-Functional Requirements

| Category | Requirement | Target | Measurement |
|----------|-------------|--------|-------------|
| Performance | FTS5 search | < 50ms | p95 latency for 50K symbols |
| Performance | Call graph (depth 3) | < 100ms | p95 latency |
| Performance | Impact analysis | < 500ms | p95 for full analysis |
| Performance | File indexing | < 200ms | per file (Tree-sitter) |
| Scalability | Max files | 100,000 | tested load |
| Scalability | Max symbols | 500,000 | tested load |
| Reliability | Crash recovery | No data loss | WAL mode |
| Availability | Non-blocking queries | Yes | Queries work during indexing |

---

## 7. Error Handling

| Error | Response | Recovery |
|-------|----------|----------|
| Symbol not found | Empty results + suggestions | Agent can retry with broader query |
| File not in index | File not found error | Agent triggers re-index |
| Grammar unavailable | Regex fallback (degraded) | Reduced symbol extraction |
| DB locked | Retry once (100ms) then error | Client retries |
| Traversal too large | Truncate at limit | Set metadata.truncated=true |
| File too large (>1MB) | Regex fallback | Reduced accuracy |

---

## 8. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Sequence — Search | [sequence-search.png](diagrams/sequence-search.png) | [sequence-search.drawio](diagrams/sequence-search.drawio) |
| 3 | State — Indexing | [state-indexing.png](diagrams/state-indexing.png) | [state-indexing.drawio](diagrams/state-indexing.drawio) |
