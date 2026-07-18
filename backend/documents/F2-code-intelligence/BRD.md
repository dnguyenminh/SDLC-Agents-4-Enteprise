# Business Requirements Document (BRD)

## SA4E Code Intelligence — F2-CODE-INTELLIGENCE

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F2-CODE-INTELLIGENCE |
| Title | Code Intelligence Module |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Architecture Pattern | AI Agent System |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | BA Agent | Initial BRD — generated from source analysis |

---

## 1. Introduction

### 1.1 Scope

The Code Intelligence module provides deep code understanding capabilities for the SA4E multi-agent system. It serves as the structural analysis layer enabling AI agents to understand codebases at AST level, navigate call graphs, analyze dependencies, assess impact of changes, and retrieve contextually relevant code — all through MCP tool calls.

Key capabilities:
- **AST Parsing (Tree-sitter)**: Multi-language parsing with symbol extraction
- **Call Graph Analysis**: BFS traversal of callers/callees with transitive depth
- **Dependency Graph**: Import/export relationship tracking with cycle detection
- **Impact Analysis**: Blast radius prediction combining call graph + deps + tests
- **Symbol Resolution**: Fuzzy symbol lookup with disambiguation
- **Complexity Analysis**: Cyclomatic complexity scoring with A-F grading
- **Multi-Language Support**: TypeScript, Kotlin, Python, Go, Java, Rust, Apex
- **AI Context Assembly**: Intent-aware code context with token budgeting

### 1.2 Out of Scope

- IDE-level real-time auto-completion (handled by language servers)
- Runtime profiling or dynamic analysis (only static analysis)
- Code generation or refactoring automation (handled by DEV agent)
- External code repository indexing (only local workspace)
- Natural language code explanation (handled by LLM module)

### 1.3 Preliminary Requirements

- Tree-sitter native bindings (node-tree-sitter npm package)
- Language grammar WASM files for each supported language
- SQLite with FTS5 extension (better-sqlite3)
- Node.js runtime (backend server)
- MCP tool registration infrastructure
- File system access for source code reading
- File watcher for incremental indexing

---

## 2. Business Requirements

### 2.1 High Level Process Map

The Code Intelligence module operates as a static analysis engine between AI agents and codebase:

1. **File Watcher detects changes** → new/modified files queued for indexing
2. **Indexing Engine parses files** → Tree-sitter AST extraction → symbols + relationships stored
3. **Agent queries via MCP tools** → code_search, code_callers, code_impact, etc.
4. **Graph services traverse relationships** → call graph, dependency graph, impact prediction
5. **AI Context assembler** → intent-aware context retrieval within token budget

![Business Flow](diagrams/business-flow.png)

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case | Priority | Category |
|---|-----------------|----------|----------|
| 1 | Code Search — FTS5 search across indexed symbols | MUST HAVE | Core Search |
| 2 | Symbol Resolution — find symbols by name with disambiguation | MUST HAVE | Core Search |
| 3 | Code Context — get source code around a symbol or line | MUST HAVE | Core Navigation |
| 4 | Module Discovery — list modules with file counts and languages | MUST HAVE | Core Navigation |
| 5 | Index Status — report indexing progress and statistics | MUST HAVE | Core Operations |
| 6 | Call Graph (Callers) — find all callers of a symbol with depth | MUST HAVE | Graph Analysis |
| 7 | Call Graph (Callees) — find all callees of a symbol with depth | MUST HAVE | Graph Analysis |
| 8 | Dependency Graph — trace import/export relationships | MUST HAVE | Graph Analysis |
| 9 | Impact Analysis — predict blast radius of code changes | MUST HAVE | Graph Analysis |
| 10 | Complexity Analysis — cyclomatic complexity with grading | SHOULD HAVE | Quality |
| 11 | Entry Point Detection — find HTTP handlers, main, CLI commands | SHOULD HAVE | Discovery |
| 12 | Circular Dependency Detection — find cycles via Tarjan SCC | SHOULD HAVE | Quality |
| 13 | Related Test Finding — find tests covering a symbol | SHOULD HAVE | Testing |
| 14 | Hot Path Detection — find most-called functions | SHOULD HAVE | Quality |
| 15 | Dead Import Detection — find unused imports | SHOULD HAVE | Quality |
| 16 | Module Summary — aggregate quality metrics per module | SHOULD HAVE | Quality |
| 17 | AI Context (Intent-aware) — context with token budgeting | MUST HAVE | AI Integration |
| 18 | Edit Context — pre-edit context (callers + tests + git) | MUST HAVE | AI Integration |
| 19 | Curated Context — NL query across code + KB + graph | MUST HAVE | AI Integration |
| 20 | Background Indexing — file watcher with incremental updates | MUST HAVE | Core Operations |

---
### 2.3 Details of User Stories

---

#### Business Flow

**Step 1:** On server startup, IndexingEngine initializes — loads Tree-sitter grammars, opens SQLite DB, runs migrations

**Step 2:** File watcher scans workspace — discovers all source files, computes content hashes

**Step 3:** For each new/changed file: Tree-sitter parser extracts AST → symbols (functions, classes, interfaces, methods) + relationships (calls, imports, inherits, implements) stored in DB

**Step 4:** Files too large (>1MB) or without grammar support → regex fallback extraction

**Step 5:** Agent calls MCP tool (e.g., code_search, code_callers, code_impact) with parameters

**Step 6:** Tool handler dispatches to appropriate service (QueryLayer, CallGraphService, ImpactAnalysisService, etc.)

**Step 7:** Service queries SQLite DB, performs BFS graph traversal if needed, applies filters

**Step 8:** Results returned to agent as structured text within token budget

> **Note:** Indexing runs in background — agents can query immediately (partial results until full index completes). File watcher provides incremental updates on file save.

---

#### STORY 1: Code Search (FTS5)

> As an AI agent, I want to search code symbols by name or keyword so that I can quickly find relevant functions, classes, and interfaces in the codebase.

**Requirement Details:**

1. Full-text search using SQLite FTS5 with porter stemming and unicode61 tokenizer
2. Searches across symbol names, signatures, and doc comments
3. Returns matching symbols with file path, line number, kind, and signature
4. Supports wildcard queries and prefix matching
5. Configurable result limit (default 20)

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| query | string | Yes | Search query (FTS5 syntax) | "authentication handler" |
| limit | number | No | Max results (default 20) | 10 |

**Acceptance Criteria:**

1. Given query "auth", results include symbols with "auth", "authentication", "authorize" (stemming)
2. Given query "handleRequest", results return exact match first, then partial matches
3. Results sorted by FTS5 rank score descending
4. Each result includes: name, kind, file, line, signature, doc_comment (if exists)
5. Search completes within 50ms for ≤50K symbols

---

#### STORY 2: Symbol Resolution

> As an AI agent, I want to find a specific symbol by name with disambiguation so that I can navigate to its definition even when multiple symbols share the same name.

**Requirement Details:**

1. Resolve symbol name to one or more definitions (handles overloads and same-name in different files)
2. Supports qualified names: ClassName.methodName, file:symbolName
3. Returns all matches with file, line, kind, visibility, parent class
4. Provides suggestions for misspelled names (fuzzy matching)

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| name | string | No | Symbol name (prefix match) | "CallGraph" |
| file | string | No | Filter by file path | "src/engine/graph/" |
| kind | string | No | Filter by kind | "class" |
| limit | number | No | Max results (default 20) | 5 |

**Acceptance Criteria:**

1. Given name="CallGraphService", returns single match with file path and line
2. Given name="handle" (ambiguous), returns all symbols starting with "handle"
3. Given file="graph/", returns only symbols in files matching that path
4. Given non-existent symbol, returns empty results with suggestions
5. Resolution completes within 20ms

---

#### STORY 3: Code Context

> As an AI agent, I want to retrieve source code around a symbol or line range so that I can understand implementation details without reading entire files.

**Requirement Details:**

1. Get source code by symbol name (looks up definition, returns surrounding code)
2. Get source code by file + line range (explicit extraction)
3. Configurable context lines before/after (default 5)
4. Returns code with line numbers for easy reference

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| file | string | Yes | File path (relative to workspace) | "src/engine/graph/call-graph-service.ts" |
| symbol | string | No | Symbol name to locate | "findCallers" |
| startLine | number | No | Start line | 50 |
| endLine | number | No | End line | 100 |
| contextLines | number | No | Extra lines before/after (default 5) | 10 |

**Acceptance Criteria:**

1. Given symbol="findCallers", returns the full function body + 5 context lines
2. Given file + startLine/endLine, returns exact line range
3. If symbol not found in file, returns error with suggestions
4. Line numbers included in output for agent reference
5. Handles files up to 10K lines without performance issues

---

#### STORY 6: Call Graph — Callers

> As an AI agent, I want to find all callers of a function (transitive) so that I can understand the impact of modifying it.

**Requirement Details:**

1. BFS traversal of caller relationships with configurable depth (1-5)
2. Returns caller symbol name, file, definition line, call site line, depth level
3. Deduplication — each caller reported once at minimum depth
4. File filter support (e.g., only callers in "src/modules/*")
5. Kind filter support (calls, flow-action, wire, apex-import)

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| symbol | string | Yes | Symbol to find callers for | "handleSearch" |
| depth | number | No | Transitive depth (default 1, max 5) | 3 |
| limit | number | No | Max results (default 20) | 50 |
| file_filter | string | No | Glob pattern for file filtering | "src/modules/*" |

**Acceptance Criteria:**

1. Given symbol="handleSearch" depth=1, returns direct callers only
2. Given depth=3, returns callers up to 3 hops transitively
3. Each result includes: symbol, qualifiedName, kind, filePath, definitionLine, callSiteLine, depthLevel
4. Truncation indicated in metadata when limit reached
5. Query completes within 100ms for ≤50K relationships

---

#### STORY 7: Call Graph — Callees

> As an AI agent, I want to find all functions called by a symbol (transitive) so that I understand its dependencies.

**Requirement Details:**

1. BFS traversal of callee relationships with configurable depth
2. Option to include/exclude external (unresolved) callees
3. Returns callee symbol, file, call site line, depth level
4. Same filtering capabilities as callers

**Acceptance Criteria:**

1. Given symbol="processFile", returns all functions it calls
2. Given includeExternal=false, omits library/external function calls
3. External callees marked with filePath="(external)"
4. Handles recursive functions without infinite loop (visited set)

---

#### STORY 8: Dependency Graph

> As an AI agent, I want to trace file-level import/export dependencies so that I can understand module coupling and find affected files.

**Requirement Details:**

1. Supports directions: outgoing (what does this file import?), incoming (who imports this?), both
2. BFS traversal with configurable depth (1-5)
3. Cycle detection — reports circular dependency paths
4. External dependency filtering (include/exclude node_modules)
5. Kind filter support (imports, inherits, implements, trigger-on, soql, etc.)
6. Returns file path, depth, imported symbols list, isExternal flag

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| file | string | Yes | Root file path | "src/engine/graph/call-graph-service.ts" |
| direction | string | No | incoming/outgoing/both (default outgoing) | "incoming" |
| depth | number | No | Traversal depth (default 1, max 5) | 2 |
| include_external | boolean | No | Include node_modules (default false) | true |
| limit | number | No | Max results (default 50) | 100 |

**Acceptance Criteria:**

1. Given file="indexing-engine.ts" direction="outgoing", returns all files it imports
2. Given direction="incoming", returns all files that import this file
3. Cycles detected and reported separately (not causing infinite traversal)
4. Depth limit respected — BFS stops at maxDepth
5. Query completes within 200ms for ≤100K relationships

---

#### STORY 9: Impact Analysis

> As an AI agent, I want to predict the blast radius of modifying/deleting/renaming a symbol so that I can assess risk before making changes.

**Requirement Details:**

1. Combines call graph (callers) + dependency graph (importers) + test detection
2. Classifies impact severity: critical (direct callers), high (depth 2), medium (depth 3), low (depth 4+)
3. Action types: modify, delete, rename (severity varies by action)
4. Finds interface implementors affected (if modifying interface method)
5. Identifies affected test files
6. Generates recommendations (e.g., "update 5 direct callers", "run these test files")

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| symbol | string | Yes | Symbol to analyze | "CallGraphService.findCallers" |
| action | string | No | modify/delete/rename (default modify) | "delete" |
| depth | number | No | Analysis depth (default 3, max 5) | 4 |
| include_tests | boolean | No | Include affected tests (default true) | true |
| severity_threshold | string | No | Min severity to report (default low) | "medium" |

**Acceptance Criteria:**

1. Given symbol="findCallers" action="modify", returns all direct callers as critical
2. Given action="delete", severity classification is stricter (direct=critical, depth2=high)
3. Interface method deletion finds all implementors as critical impact
4. Affected tests listed separately with relationship reason
5. Recommendations generated based on impact count and action type
6. blastRadius summary includes: totalAffected, affectedFiles, affectedTests

---

#### STORY 10: Complexity Analysis

> As an AI agent, I want to know the cyclomatic complexity of functions so that I can identify code that needs refactoring.

**Requirement Details:**

1. Cyclomatic complexity computed per function: counts branches (if, else, for, while, switch cases, &&, ||, ?:, catch)
2. A-F grading: A(1-5), B(6-10), C(11-15), D(16-20), F(21+)
3. Filterable by file, symbol, module, grade, minimum complexity
4. Sortable by complexity, name, or file
5. Breakdown shows which constructs contribute to complexity

**Acceptance Criteria:**

1. Given file_path="call-graph-service.ts", returns complexity for all functions in file
2. Given grade_filter="D,F", returns only high-complexity functions
3. Each result includes: symbol, file, line, complexity score, grade, breakdown
4. Module-level aggregation available (average, max, distribution)

---

#### STORY 11: Entry Point Detection

> As an AI agent, I want to find HTTP handlers, main functions, and event handlers so that I can understand application entry points.

**Requirement Details:**

1. Detects: HTTP_HANDLER, MAIN, CLI_COMMAND, EVENT_HANDLER, SCHEDULED
2. Framework detection: Express, NestJS, Spring, FastAPI, Ktor, Gin
3. For HTTP handlers: extracts method (GET/POST/etc.), route pattern, auth presence
4. Filterable by type, framework, HTTP method, route pattern, file

**Acceptance Criteria:**

1. Given entry_type="HTTP_HANDLER", returns all route handlers with method + path
2. Given framework="express", returns only Express route definitions
3. Given route_pattern="/api/auth", returns handlers matching that path
4. Has_auth filter identifies handlers with authentication middleware
5. Returns: symbol name, file, line, entry_type, framework, HTTP method, route, has_auth

---

#### STORY 17: AI Context (Intent-Aware)

> As an AI agent, I want to get comprehensive code context tailored to my current intent (explain/modify/debug/test) within a token budget so that I have exactly the right context without wasting tokens.

**Requirement Details:**

1. Intent modes:
   - **explain**: source + doc comments + callers (understand what it does)
   - **modify**: source + callers + tests + siblings (know what to update)
   - **debug**: source + callees + error paths (trace execution)
   - **test**: source + interface + existing tests (write new tests)
2. Token budget enforcement (default 4000, min 500)
3. Progressive disclosure — truncates least relevant sections first
4. Caller/callee depth configurable (default 1, max 5)

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| symbol | string | Yes | Symbol name (supports Class.method) | "CallGraphService.findCallers" |
| intent | string | No | explain/modify/debug/test (default explain) | "modify" |
| token_budget | number | No | Max tokens (default 4000) | 8000 |
| caller_depth | number | No | Depth for graph traversal (default 1) | 2 |

**Acceptance Criteria:**

1. Given intent="explain", returns source + callers + doc comments
2. Given intent="modify", returns source + callers + tests + siblings in same file
3. Given token_budget=2000, response truncated to fit within budget
4. Token budget exceeded → least relevant sections truncated first
5. Response includes metadata: actual token count, sections included/truncated

---

#### STORY 18: Edit Context

> As an AI agent, I want to get everything needed before editing a symbol (source + callers + tests + git history) so that I can make safe modifications.

**Requirement Details:**

1. Returns: symbol source code + all direct callers + related tests + recent git commits + sibling symbols
2. Each section independently togglable (include_callers, include_tests, include_git)
3. Token budget respected — sections prioritized: source > callers > tests > git

**Acceptance Criteria:**

1. Given symbol="findCallers", returns full function source
2. With include_callers=true, includes all functions that call findCallers
3. With include_tests=true, includes related test file content
4. With include_git=true, includes recent commits touching this symbol
5. Total response within token_budget

---

#### STORY 19: Curated Context

> As an AI agent, I want to query the codebase with natural language and get ranked results from code symbols, knowledge base, and graph relationships combined.

**Requirement Details:**

1. Searches across three sources: code symbols (FTS5), knowledge base (mem_search), graph relationships
2. Results ranked by combined relevance score with configurable weights
3. Source weights adjustable (code vs KB vs graph)
4. Token budget enforced on combined response

**Acceptance Criteria:**

1. Given query="how does authentication work", returns relevant handlers + KB entries + related graph paths
2. Given include_source=false, only searches KB and graph
3. Results ranked by weighted score (default: source 0.4, memory 0.3, graph 0.3)
4. Total response within max_tokens budget

---

#### STORY 20: Background Indexing

> As the system, I want to automatically re-index files on save so that code intelligence stays up-to-date without manual intervention.

**Requirement Details:**

1. File watcher monitors workspace for create/modify/delete events
2. Content hash comparison — only re-index if content actually changed
3. Incremental updates — only affected file re-parsed (not full re-index)
4. Module detection — auto-assigns files to modules based on directory patterns
5. Pattern detection — identifies architectural patterns from import graphs

**Acceptance Criteria:**

1. File saved → re-indexed within 2 seconds
2. File deleted → symbols removed from DB immediately
3. Content hash unchanged → skip (no re-parse)
4. New file created → auto-detected and indexed
5. Full re-index on demand via code_index_status(reindex=true)

---

## 3. Dependencies

| Dependency | Type | Description |
|------------|------|-------------|
| node-tree-sitter | Infrastructure | Tree-sitter bindings for Node.js |
| tree-sitter-typescript | Grammar | TypeScript/TSX grammar WASM |
| tree-sitter-python | Grammar | Python grammar WASM |
| tree-sitter-java | Grammar | Java grammar WASM |
| tree-sitter-go | Grammar | Go grammar WASM |
| tree-sitter-rust | Grammar | Rust grammar WASM |
| tree-sitter-kotlin | Grammar | Kotlin grammar WASM |
| better-sqlite3 | Infrastructure | SQLite with FTS5 support |
| chokidar | Infrastructure | Cross-platform file watcher |
| MCP Tool Registry | System | Tool registration for agent access |
| File System | System | Source code reading |
| DatabaseManager | Internal | Shared database lifecycle |
| QueryLayer | Internal | Common query utilities |
| MemoryModule (F1) | Internal | Knowledge base integration for curated context |

---

## 4. Stakeholders

| Role | Team | Responsibility |
|------|------|----------------|
| AI Agents (BA, SA, DEV, QA, DevOps) | Consumers | Use code intelligence via MCP tools |
| Developers | IDE Users | Benefit from agent's code understanding |
| SA (Solution Architect) | Design | Defines architecture constraints |
| QA | Quality | Uses impact analysis for test coverage |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Tree-sitter grammar unavailable for a language | Medium | Low | Regex fallback extraction (degraded but functional) |
| Large monorepo performance (>100K files) | High | Medium | Content hash skip, incremental indexing, file limit |
| SQLite lock contention (concurrent reads during indexing) | Medium | Medium | WAL mode, batch transactions, read-only connections |
| Graph traversal explosion (deeply connected code) | Medium | Low | Depth limit (max 5), result limit, visited set |
| WASM grammar loading time on cold start | Low | Medium | Lazy-load grammars on first use per language |

### 5.2 Assumptions

- Single workspace deployment (one SQLite index DB per workspace)
- File watcher detects saves within 1 second (OS-level filesystem events)
- Tree-sitter WASM grammars pre-downloaded at build time
- Most codebases are <50K files (typical enterprise project)
- BFS depth of 3 sufficient for most impact analysis scenarios
- Token budget of 4000 tokens adequate for most agent context needs

---

## 6. Non-Functional Requirements

| Category | Requirement | Target |
|----------|-------------|--------|
| Performance | FTS5 search latency | < 50ms for ≤50K symbols |
| Performance | Call graph query (depth 3) | < 100ms |
| Performance | Dependency graph query (depth 3) | < 200ms |
| Performance | Impact analysis (full) | < 500ms |
| Performance | Single file indexing | < 200ms (Tree-sitter), < 100ms (regex) |
| Performance | Full workspace index (10K files) | < 60 seconds |
| Scalability | Max indexed files | 100,000 |
| Scalability | Max symbols in DB | 500,000 |
| Scalability | Max relationships in DB | 1,000,000 |
| Reliability | Incremental index correctness | 100% (hash-based change detection) |
| Reliability | Crash recovery | SQLite WAL — no corruption on crash |
| Availability | Module startup (without indexing) | < 1 second |
| Availability | Background indexing non-blocking | Queries work during indexing |
| Token Efficiency | AI context default budget | 4000 tokens |
| Token Efficiency | Edit context with all sections | ≤ 8000 tokens |
| Maintainability | Adding new language parser | < 1 day (implement parser interface + grammar) |

---

## 7. Appendix

### Glossary

| Term | Definition |
|------|------------|
| AST | Abstract Syntax Tree — structured representation of source code |
| Tree-sitter | Incremental parsing library for programming languages |
| FTS5 | Full-Text Search extension 5 for SQLite |
| BFS | Breadth-First Search — graph traversal algorithm |
| Call Graph | Directed graph of function call relationships |
| Dependency Graph | Directed graph of file import/export relationships |
| Blast Radius | Set of code affected by a change (impact analysis) |
| Cyclomatic Complexity | Number of independent paths through a function |
| Symbol | Named code entity: function, class, interface, method, variable |
| MCP | Model Context Protocol — standard for AI tool registration |
| Token Budget | Maximum tokens allowed in AI context response |
| SCC | Strongly Connected Components — Tarjan's algorithm for cycle detection |

### Tool API Surface (20+ Tools)

| Tool | Category | Description |
|------|----------|-------------|
| code_search | Core Search | FTS5 search across symbols |
| code_symbols | Core Search | Find symbols by name/file/kind |
| code_context | Core Navigation | Get source code around symbol/lines |
| code_modules | Core Navigation | List modules with stats |
| code_index_status | Operations | Indexing progress and stats |
| code_callers | Graph | Find callers (transitive BFS) |
| code_callees | Graph | Find callees (transitive BFS) |
| code_dependencies | Graph | Trace import/export deps |
| code_impact | Graph | Blast radius prediction |
| code_traverse | Graph | Generic graph traversal |
| complexity_analysis | Quality | Cyclomatic complexity with grading |
| find_entry_points | Discovery | HTTP handlers, main, CLI, events |
| find_circular_deps | Quality | Circular dependency detection |
| find_related_tests | Testing | Find tests for a symbol |
| find_hot_paths | Quality | Most-called functions |
| find_dead_imports | Quality | Unused import detection |
| module_summary | Quality | Aggregate module metrics |
| get_ai_context | AI Integration | Intent-aware context assembly |
| get_edit_context | AI Integration | Pre-edit context package |
| get_curated_context | AI Integration | NL query across code+KB+graph |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case Diagram | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
