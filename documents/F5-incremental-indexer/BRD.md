# Business Requirements Document (BRD)

## SA4E Code Intelligence — F5: Incremental Indexer

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F5-incremental-indexer |
| Title | Incremental Indexer — File Watching, AST Parsing & Embedding Pipeline |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Architecture Pattern | AI Agent System |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | BA Agent | Initial document — auto-generated from source code analysis |

---

## 1. Introduction

### 1.1 Scope

The Incremental Indexer is the core engine responsible for maintaining an up-to-date code intelligence index of the user's workspace. It continuously monitors file system changes (add, modify, delete), detects which files have actually changed via content hashing, parses changed files using Tree-sitter AST parsers across multiple languages, extracts symbols and relationships, generates embeddings for semantic search, and stores all results in an SQLite database. The indexer operates as a background process within the SA4E Code Intelligence backend, providing real-time code awareness to AI agents.

### 1.2 Out of Scope

- UI/UX for visualizing index state (covered by Viewer module)
- MCP tool implementations that consume the index (covered by Code Intelligence tools)
- Knowledge Base ingestion of documents (covered by F1-Memory KB)
- Query engine that searches the index (covered by separate query module)

### 1.3 Preliminary Requirements

- SA4E backend server running (Node.js + TypeScript runtime)
- SQLite database initialized with schema migrations applied
- Tree-sitter WASM grammars available for target languages
- chokidar package available for file system watching
- @xenova/transformers package for ONNX-based embedding generation

---

## 2. Business Requirements

### 2.1 High Level Process Map

The Incremental Indexer operates as a continuous background pipeline:

1. **Startup** — Full workspace scan indexes all supported files
2. **Watch** — File watcher monitors for add/change/delete events
3. **Detect** — Hash-based change detection skips unchanged files
4. **Parse** — AST parsing extracts symbols + relationships per file
5. **Embed** — Embedding service generates vectors for function bodies
6. **Store** — Results stored atomically in SQLite (symbols, relationships, embeddings)
7. **Resolve** — Cross-file relationship resolution links symbols across files

![Business Flow](diagrams/business-flow.png)

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case | Priority | Source |
|---|------------------|----------|--------|
| 1 | As a developer, I want my code index to update automatically when I save a file, so that AI agents always have current code context | MUST HAVE | Core requirement |
| 2 | As a developer, I want the indexer to skip unchanged files, so that re-indexing is fast even for large workspaces | MUST HAVE | Performance |
| 3 | As a developer, I want multi-language AST parsing (TS, Kotlin, Python, Go, Java, Rust, Apex, C#), so that all my code is indexed accurately | MUST HAVE | Multi-language |
| 4 | As an AI agent, I want symbol relationships extracted (imports, inheritance, calls), so that I can understand code structure | MUST HAVE | AI context |
| 5 | As an AI agent, I want semantic embeddings for function bodies, so that I can find similar code by meaning | SHOULD HAVE | Semantic search |
| 6 | As a developer, I want the indexer to run non-blocking in the background, so that my IDE remains responsive | MUST HAVE | UX |
| 7 | As an AI agent, I want module detection (grouping files by directory/build config), so that I understand project structure | SHOULD HAVE | Context |
| 8 | As a developer, I want a graceful fallback to regex extraction when Tree-sitter grammars are unavailable | SHOULD HAVE | Resilience |
| 9 | As a developer, I want configurable exclude patterns and file size limits, so that I can tune indexer behavior | COULD HAVE | Configuration |
| 10 | As a developer, I want to see indexer status (running, file count, languages) via MCP tool, so that I know the system is working | SHOULD HAVE | Observability |

---

### 2.3 Details of User Stories

---

#### Business Flow

**Step 1:** Backend server starts and IndexingEngine is instantiated with database and config

**Step 2:** Tree-sitter infrastructure initializes (GrammarRegistry loads WASM grammars for configured languages)

**Step 3:** Full workspace scan discovers all source files matching include extensions, respecting exclude patterns

**Step 4:** For each file, content hash is computed and compared to stored hash — unchanged files skipped

**Step 5:** Changed files are parsed — Tree-sitter AST parser used if grammar available, else regex fallback

**Step 6:** Extracted symbols (functions, classes, interfaces, methods) and relationships (imports, calls, inheritance) stored in SQLite

**Step 7:** Function bodies extracted and stored for embedding generation (minimum 3 lines)

**Step 8:** Module detection runs — files grouped by directory structure and build config

**Step 9:** Cross-file relationship resolution links unresolved symbol references

**Step 10:** File watcher starts monitoring workspace for changes

**Step 11:** On file change event: debounce (500ms) then hash check then parse then store (incremental single-file path)

> **Note:** The full scan (Steps 3-9) runs once at startup. After that, only incremental updates (Step 11) occur for each file change.

---

#### STORY 1: Automatic Index Update on File Save

> As a developer, I want my code index to update automatically when I save a file, so that AI agents always have current code context.

**Requirement Details:**

1. File watcher (chokidar) monitors the entire workspace directory recursively
2. Events captured: `add` (new file), `change` (modified file), `unlink` (deleted file)
3. Events are debounced with configurable delay (default 500ms) to avoid processing rapid saves
4. Only files with recognized language extensions are processed
5. On `add`/`change`: file is re-indexed (hash check then parse then store)
6. On `unlink`: file record and all associated symbols/relationships removed from database

**Acceptance Criteria:**

1. When a TypeScript file is saved, its symbols appear in the index within 2 seconds
2. When a file is deleted, its symbols are removed from the index immediately
3. Rapid saves (multiple within 500ms) result in only one indexing operation
4. File watcher ignores files in excluded directories (node_modules, .git, dist, build)

---

#### STORY 2: Hash-Based Change Detection

> As a developer, I want the indexer to skip unchanged files, so that re-indexing is fast even for large workspaces.

**Requirement Details:**

1. Content hash computed for each file during scan
2. Hash compared against stored hash in database `files.content_hash` column
3. If hash matches then file skipped entirely (no parsing, no DB writes)
4. If hash differs then file re-indexed, new hash stored
5. Hash comparison is the first check before any expensive parsing

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| content_hash | string | Yes | Content hash of file | `a3f2b8c...` |
| relative_path | string | Yes | Path relative to workspace root | `src/engine/indexer/file-watcher.ts` |
| last_indexed | datetime | Yes | When file was last indexed | `2025-07-03T19:00:00Z` |

**Acceptance Criteria:**

1. Re-running full index on unchanged workspace completes in < 5 seconds (hash checks only)
2. Modified files are detected and re-indexed
3. No unnecessary database writes for unchanged files
4. Content hash is deterministic (same content produces same hash)

---

#### STORY 3: Multi-Language AST Parsing

> As a developer, I want multi-language AST parsing (TS, Kotlin, Python, Go, Java, Rust, Apex, C#), so that all my code is indexed accurately.

**Requirement Details:**

1. Tree-sitter WASM grammars loaded via GrammarRegistry
2. Each language has a dedicated parser module that extracts language-specific constructs
3. Supported languages and extensions:
   - TypeScript/TSX: `.ts`, `.tsx`
   - JavaScript/JSX: `.js`, `.jsx`
   - Kotlin: `.kt`, `.kts`
   - Java: `.java`
   - Python: `.py`
   - Go: `.go`
   - Rust: `.rs`
   - Apex: `.cls`, `.trigger`
   - C#: `.cs`
4. Parser returns structured data: symbols (name, kind, signature, line range, visibility, doc comments) and relationships (imports, calls, inheritance)
5. Files exceeding maxFileSize (default 512KB, configurable up to 1MB) use regex fallback
6. Grammar loading is lazy (loaded on first use for a language)
7. Compound extensions supported (e.g., `.flow-meta.xml` for Salesforce metadata)

**Acceptance Criteria:**

1. TypeScript parser extracts: classes, interfaces, functions, methods, arrow functions, generators, enums, namespaces
2. Kotlin parser extracts: classes, data classes, objects, functions, extension functions
3. Python parser extracts: classes, functions, decorators, module-level variables
4. Each parser extracts relationships: imports, inheritance (extends/implements), function calls
5. Regex fallback produces at least function/class signatures when grammar unavailable
6. Grammar unavailability is logged and tracked (unavailable set)

---

#### STORY 4: Symbol Relationship Extraction

> As an AI agent, I want symbol relationships extracted (imports, inheritance, calls), so that I can understand code structure.

**Requirement Details:**

1. Relationship types extracted per file:
   - `import` — file imports another module/symbol
   - `inherits` — class extends another class
   - `implements` — class implements an interface
   - `calls` — function/method calls another function
   - `soql` / `dml` — Apex-specific: database operations
   - `trigger-on` — Apex trigger on object
   - `wire` — LWC wire service binding
2. Relationships stored in `relationships` table with source_symbol_id, target_symbol, kind, line number
3. Cross-file resolution: after full index, unresolved target symbols are matched to actual symbol IDs (max 5000 per run)
4. Relationships deleted and recreated atomically per file (no stale data)

**Acceptance Criteria:**

1. Given file A imports function `foo` from file B, relationship `A.import -> B.foo` is stored
2. Given class C extends class D, relationship `C.inherits -> D` is stored
3. Cross-file resolution resolves at least 80% of target symbols after full index
4. File deletion removes all relationships where file_path matches

---

#### STORY 5: Embedding Generation for Semantic Search

> As an AI agent, I want semantic embeddings for function bodies, so that I can find similar code by meaning.

**Requirement Details:**

1. Function/method bodies extracted after parsing (minimum 3 lines of body)
2. Body text stored in `body_embeddings` table (raw UTF-8 bytes)
3. EmbeddingService uses ONNX runtime via `@xenova/transformers` (model: `Xenova/paraphrase-multilingual-MiniLM-L12-v2`)
4. Embedding dimension: 384 (MiniLM output)
5. Embeddings quantized for performance
6. Singleton pattern for EmbeddingService (one instance, lazy initialization)
7. Token count stored alongside embedding for cost tracking

**Acceptance Criteria:**

1. Functions with similar logic have cosine similarity > 0.7
2. Embedding generation does not block file indexing (async pipeline)
3. Model is downloaded on first use from HuggingFace Hub
4. Body extraction covers: function, method, arrow_function, generator, function_declaration kinds

---

#### STORY 6: Non-Blocking Background Processing

> As a developer, I want the indexer to run non-blocking in the background, so that my IDE remains responsive.

**Requirement Details:**

1. Full index runs asynchronously (`async startBackgroundIndexing()`)
2. File watcher events processed asynchronously per file
3. Batch processing: full index processes files in batches of 50
4. `indexing` flag prevents concurrent full index runs
5. `running` flag controls lifecycle (start/stop)
6. File watcher uses `awaitWriteFinish` option (200ms stability threshold) to avoid partial reads
7. Error in one file does not halt indexing of other files

**Acceptance Criteria:**

1. Full index of 1000 files completes within 30 seconds
2. Individual file re-index completes within 500ms
3. Indexer can be stopped gracefully (watcher closed, timers cleared)
4. Errors are logged but do not crash the process

---

#### STORY 7: Module Detection

> As an AI agent, I want module detection (grouping files by directory/build config), so that I understand project structure.

**Requirement Details:**

1. Files grouped into modules based on directory structure:
   - Standard: first directory under `src/` becomes module name
   - SFDX: specialized mapping (`force-app/classes/` to `apex-classes`, etc.)
2. Module metadata stored in `modules` table (name, root_path, language, file_count, symbol_count)
3. Pattern detection per module: DI style, error handling, naming convention, logging framework, testing framework
4. Module purpose inferred from class/function names and patterns
5. Modules updated after every full index run

**Acceptance Criteria:**

1. Files in `src/engine/` are grouped into module `engine`
2. SFDX projects correctly detect Apex classes, triggers, flows, objects, LWC components
3. Module stats (file_count, symbol_count) match actual database counts
4. Pattern detection identifies testing framework used per module

---

#### STORY 8: Graceful Fallback to Regex Extraction

> As a developer, I want a graceful fallback to regex extraction when Tree-sitter grammars are unavailable.

**Requirement Details:**

1. If GrammarRegistry cannot load a WASM grammar then mark language as `unavailable`
2. Unavailable languages use regex-based `extractSymbols()` function
3. Regex extraction captures: function/class/interface/method declarations
4. Regex fallback also used for files exceeding maxFileSize
5. Tree-sitter initialization failure does not prevent indexer from starting
6. IndexResult tracks which method was used (`tree-sitter` vs `regex-fallback`)

**Acceptance Criteria:**

1. Indexer starts successfully even if all WASM grammars are missing
2. Regex fallback extracts at least class and function names
3. Large files (>512KB) are processed via regex without memory issues
4. Stats report distinguishes tree-sitter vs regex-indexed files

---

#### STORY 9: Configurable Behavior

> As a developer, I want configurable exclude patterns and file size limits, so that I can tune indexer behavior.

**Requirement Details:**

1. Configuration sources (priority order): CLI args then environment variables then config file then defaults
2. Configurable properties:

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| workspace | string | Yes | Root directory to index | `/home/user/project` |
| watchEnabled | boolean | No | Enable/disable file watcher | `true` |
| watchDebounceMs | number | No | Debounce delay for file events | `500` |
| excludePatterns | string[] | No | Directories to exclude | `["node_modules", ".git"]` |
| includeExtensions | string[] | No | File extensions to include | `[".ts", ".kt", ".py"]` |
| maxFileSize | number | No | Max file size in bytes for parsing | `512000` |
| ollamaUrl | string | No | Ollama URL for embeddings (alternative) | `http://localhost:11434` |
| ollamaModel | string | No | Model name for embeddings | `nomic-embed-text` |

3. Config file location: `{workspace}/.code-intel/config.json`
4. Default exclude patterns: `node_modules, .git, dist, build, .gradle, .idea, .vscode, __pycache__, .venv, target, .code-intel, coverage, .next, .nuxt`

**Acceptance Criteria:**

1. Custom exclude patterns prevent files from being indexed
2. Config changes take effect without server restart (for file config)
3. CLI args override all other configuration sources
4. Invalid config values fall back to defaults (not crash)

---

#### STORY 10: Indexer Status via MCP Tool

> As a developer, I want to see indexer status (running, file count, languages) via MCP tool, so that I know the system is working.

**Requirement Details:**

1. MCP tool `code_index_status` returns current indexer state
2. Status includes:
   - `running`: whether indexer is actively processing
   - `totalFiles`: count of indexed files
   - `totalSymbols`: count of extracted symbols
   - `languages`: list of available tree-sitter languages
   - `unavailableGrammars`: languages where grammar failed to load
   - `sfdxStats`: Salesforce-specific stats if SFDX project detected
3. SFDX stats include: apex_classes, apex_triggers, flows, objects, lwc_components, relationship counts

**Acceptance Criteria:**

1. `code_index_status` returns valid JSON with all status fields
2. Language list matches actually loaded grammars
3. SFDX stats only present when SFDX project detected
4. Status reflects real-time state (not cached/stale)

---

## 3. Dependencies

| Dependency | Type | Related Feature | Description |
|------------|------|-----------------|-------------|
| better-sqlite3 | System | F5 | SQLite database for storing index (files, symbols, relationships, embeddings) |
| web-tree-sitter | System | F5 | WASM-based Tree-sitter runtime for AST parsing |
| chokidar | System | F5 | File system watching with cross-platform support |
| @xenova/transformers | System | F5 | ONNX runtime for embedding generation (paraphrase-multilingual-MiniLM-L12-v2) |
| Database Schema | Infrastructure | F5 | Tables: files, symbols, modules, relationships, body_embeddings |
| WASM Grammars | Infrastructure | F5 | Pre-compiled .wasm files for each supported language |
| F1-Memory KB | Feature | F1 | Index data is consumed by memory/KB tools for AI agent context |
| F3-Orchestration | Feature | F3 | MCP tool routing exposes code_index_status |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility |
|------|-------------|----------------|
| Developer | SA4E Development Team | Implement and maintain indexer engine |
| AI Agents | All SA4E Agents | Consume indexed data for code-aware operations |
| End User | IDE Users (Developers) | Benefit from real-time code intelligence |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Tree-sitter WASM grammars may not cover all language features | Medium | Medium | Regex fallback ensures basic indexing always works |
| Large workspaces (>10K files) may cause slow initial index | High | Medium | Batch processing + hash-based skip for incremental updates |
| chokidar may miss rapid file changes on some OS | Medium | Low | awaitWriteFinish + debounce handles most cases |
| ONNX model download fails on air-gapped systems | Medium | Low | Embedding is optional; indexing works without it |
| SQLite write contention during batch + watch concurrent access | Medium | Low | Transactions + `indexing` flag prevent concurrent full scans |

### 5.2 Assumptions

- Node.js runtime supports WASM execution (required for tree-sitter)
- Workspace directory is accessible with read permissions
- SQLite database file is writable by the backend process
- chokidar has native OS support for file system events (fsevents on macOS, inotify on Linux, ReadDirectoryChangesW on Windows)
- Network access available for initial ONNX model download (subsequent runs use cache)

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Full index < 30s for 1000 files | Batch processing (50 files), hash-based skip for unchanged |
| Performance | Incremental re-index < 500ms per file | Single file path with hash check |
| Performance | Debounce delay: 500ms default | Configurable via CODE_INTEL_DEBOUNCE |
| Scalability | Support workspaces up to 50K files | Module-based partitioning, batch processing |
| Reliability | No crash on parse errors | Individual file errors logged, other files continue |
| Reliability | Graceful degradation | Tree-sitter to regex fallback; embedding skip if model unavailable |
| Availability | Indexer auto-starts with backend | startBackgroundIndexing() called on server init |
| Security | No file content sent externally | ONNX model runs locally; embedding generation is offline |
| Configurability | All major params configurable | CLI, env vars, config file with cascading priority |

---

## 7. Related Features

| Feature | Summary | Relationship |
|---------|---------|--------------|
| F1-Memory KB | Knowledge Base and Memory Graph | Consumes indexed data |
| F2-Code Intelligence | Code search, symbol lookup tools | Queries index database |
| F3-Orchestration | MCP server and tool routing | Exposes code_index_status tool |
| F4-Context Assembly | Context building for AI agents | Uses index for code context |

---

## 8. Appendix

### Glossary

| Term | Definition |
|------|------------|
| AST | Abstract Syntax Tree — tree representation of source code structure |
| Tree-sitter | Incremental parsing library that produces ASTs for source code |
| WASM | WebAssembly — binary format for portable code execution |
| ONNX | Open Neural Network Exchange — model format for ML inference |
| MiniLM | Small BERT variant used for text embeddings (384 dimensions) |
| chokidar | Cross-platform file system watcher for Node.js |
| Debounce | Technique to batch rapid events into single processing |
| Content Hash | Cryptographic hash of file content for change detection |
| SFDX | Salesforce DX — Salesforce developer experience framework |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case Diagram | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
