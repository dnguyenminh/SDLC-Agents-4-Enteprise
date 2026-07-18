# Functional Specification Document (FSD)

## SA4E Code Intelligence — F5: Incremental Indexer

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F5-incremental-indexer |
| Title | Incremental Indexer — File Watching, AST Parsing & Embedding Pipeline |
| Author | BA Agent + TA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Related BRD | BRD-v1-F5-incremental-indexer.docx |
| Architecture Pattern | AI Agent System |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | BA + TA Agent | Initial — BA draft + TA technical enrichment |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional behavior of the Incremental Indexer subsystem.

### 1.2 Scope

File watching, hash-based change detection, multi-language AST parsing, symbol/relationship extraction, embedding generation, module detection, and MCP status tool.

### 1.3 Definitions

| Term | Definition |
|------|------------|
| AST | Abstract Syntax Tree — structured representation of source code |
| Tree-sitter | Incremental parsing library producing ASTs via WASM grammars |
| chokidar | Cross-platform Node.js file system watcher |
| Debounce | Batching rapid events into single processing |
| Content Hash | Deterministic hash for change detection |
| FTS5 | SQLite Full-Text Search engine version 5 |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-F5-incremental-indexer.docx |
| F4 Context Assembly FSD | FSD-v1-F4-context-assembly.docx |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

The Incremental Indexer operates within the SA4E backend process. External actors:
- **File System** — source of change events (add/change/unlink)
- **Developer** — triggers saves, configures behavior
- **AI Agents** — consume indexed data via F2/F4 tools
- **ONNX Runtime** — local ML model for embedding generation
- **Tree-sitter WASM** — grammar files for AST parsing

### 2.2 Components

| Component | Responsibility |
|-----------|---------------|
| **IndexingEngine** | Orchestrates full index + incremental updates |
| **FileWatcher** | chokidar-based file monitoring with debounce |
| **TreeSitterIndexer** | Tree-sitter parsing + regex fallback per file |
| **GrammarRegistry** | Lazy-loads WASM grammars, extension-to-language mapping |
| **EmbeddingService** | ONNX-based vector generation (singleton) |
| **DatabaseManager** | SQLite connection + schema migrations |
| **GraphRepository** | Cross-file relationship resolution |

---

## 3. Functional Requirements

### 3.1 Feature: File System Watching

**Source:** BRD Story 1, Story 6

#### 3.1.1 Use Case UC-1: Incremental Index on File Save

**Actor:** Developer
**Preconditions:** Backend server running, indexer started
**Postconditions:** Modified file symbols updated in database within 2 seconds

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Saves file | | Developer saves .ts file in IDE |
| 2 | | chokidar detects change event | OS notifies file modification |
| 3 | | Debounce timer starts (500ms) | Prevent rapid re-indexing |
| 4 | | After debounce: compute content hash | SHA hash of file content |
| 5 | | Compare hash with stored hash | Query files.content_hash |
| 6 | | If changed: parse via Tree-sitter | Extract symbols + relationships |
| 7 | | Store results atomically in SQLite | Transaction: delete old + insert new |
| 8 | | Extract function bodies for embedding | Min 3 lines of body text |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | File hash unchanged | Skip parsing, no DB write |
| AF-2 | Tree-sitter grammar unavailable | Use regex fallback extraction |
| AF-3 | File exceeds maxFileSize (512KB) | Use regex fallback |
| AF-4 | File extension not in includeExtensions | Ignore event entirely |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | File read error (permissions, locked) | Log error, skip file, continue |
| EF-2 | Parse error (malformed syntax) | Log error, store partial symbols |
| EF-3 | Database write error | Log error, retry on next change |

#### 3.1.2 Use Case UC-2: Full Workspace Index on Startup

**Actor:** System (backend server)
**Preconditions:** Server process starts, SQLite database accessible
**Postconditions:** All workspace files indexed, modules detected, relationships resolved

**Main Flow:**

| Step | System | Description |
|------|--------|-------------|
| 1 | Initialize IndexingEngine | Create DB manager, load config |
| 2 | Init Tree-sitter infrastructure | Load GrammarRegistry with grammar-config.json |
| 3 | Scan workspace files | Discover all files matching include extensions |
| 4 | Phase 1: Upsert file records | INSERT OR REPLACE into files table with hash |
| 5 | Phase 2: Index symbols (batch 50) | Tree-sitter or regex per file |
| 6 | Update modules table | Group by directory, count files/symbols |
| 7 | Detect patterns per module | DI style, error handling, naming, testing |
| 8 | Resolve cross-file references | Match target_symbol to actual symbol IDs (max 5000) |
| 9 | Start file watcher | chokidar begins monitoring |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Tree-sitter init fails | Continue with regex-only mode |
| AF-2 | SFDX project detected | Add SF-specific module mapping |
| AF-3 | Already indexing (concurrent call) | Return early (indexing flag) |

#### 3.1.3 Use Case UC-3: File Deletion Handling

**Actor:** Developer
**Preconditions:** File previously indexed in database
**Postconditions:** File record, symbols, and relationships removed

**Main Flow:**

| Step | System | Description |
|------|--------|-------------|
| 1 | chokidar detects unlink event | File deleted from workspace |
| 2 | Debounce (500ms) | Prevent rapid processing |
| 3 | Delete file from files table | CASCADE deletes symbols |
| 4 | Delete relationships for file | GraphRepository.deleteFileRelationships |

#### 3.1.4 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-1 | Debounce delay: 500ms default (configurable via CODE_INTEL_DEBOUNCE) | Story 1 |
| BR-2 | awaitWriteFinish: stabilityThreshold 200ms, pollInterval 50ms | Story 6 |
| BR-3 | Only process files with extensions in includeExtensions list | Story 9 |
| BR-4 | Exclude patterns applied via glob: node_modules, .git, dist, build, etc. | Story 9 |
| BR-5 | Concurrent full index prevented by indexing flag | Story 6 |
| BR-6 | File watcher ignores dotfiles (pattern: /(^|[\/\\])\\./) | Story 1 |
| BR-7 | Language detection via file extension (detectLanguage function) | Story 3 |

---

### 3.2 Feature: Hash-Based Change Detection

**Source:** BRD Story 2

#### 3.2.1 Use Case UC-4: Skip Unchanged File

**Actor:** System
**Preconditions:** File exists in files table with content_hash
**Postconditions:** File skipped (no parse, no DB write)

**Main Flow:**

| Step | System | Description |
|------|--------|-------------|
| 1 | Compute content hash of file | Read file, hash content |
| 2 | Query stored hash | SELECT content_hash FROM files WHERE relative_path = ? |
| 3 | Compare hashes | If equal: skip entirely |

#### 3.2.2 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-8 | Hash comparison is first check before any parsing | Story 2 |
| BR-9 | Content hash stored in files.content_hash column | Story 2 |
| BR-10 | Hash is deterministic (same content = same hash) | Story 2 |
| BR-11 | Full re-index on unchanged workspace < 5s (hash checks only) | NFR |

---

### 3.3 Feature: Multi-Language AST Parsing

**Source:** BRD Story 3, Story 8

#### 3.3.1 Use Case UC-5: Parse File with Tree-sitter

**Actor:** System
**Preconditions:** Grammar available for file language, file size <= maxFileSize
**Postconditions:** Symbols and relationships extracted and stored

**Main Flow:**

| Step | System | Description |
|------|--------|-------------|
| 1 | Determine language from extension | GrammarRegistry.getLanguageId(filePath) |
| 2 | Get parser (lazy load grammar) | GrammarRegistry.getParser(filePath) |
| 3 | Parse source to AST | parser.parse(source, relativePath) |
| 4 | Extract symbols | name, kind, signature, line range, visibility, doc_comment |
| 5 | Extract relationships | imports, inherits, implements, calls |
| 6 | Store atomically | Transaction: delete old + insert new symbols + relationships |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Grammar not found / load fails | Mark language unavailable, use regex |
| AF-2 | Compound extension (e.g., .flow-meta.xml) | Longest extension match wins |

#### 3.3.2 Supported Languages

| Language | Extensions | Grammar | Parser Module |
|----------|-----------|---------|---------------|
| TypeScript | .ts, .tsx | tree-sitter-typescript.wasm | typescript-parser |
| JavaScript | .js, .jsx | tree-sitter-javascript.wasm | javascript-parser |
| Kotlin | .kt, .kts | tree-sitter-kotlin.wasm | kotlin-parser |
| Java | .java | tree-sitter-java.wasm | java-parser |
| Python | .py | tree-sitter-python.wasm | python-parser |
| Go | .go | tree-sitter-go.wasm | go-parser |
| Rust | .rs | tree-sitter-rust.wasm | rust-parser |
| Apex | .cls, .trigger | tree-sitter-apex.wasm | apex-parser |
| C# | .cs | tree-sitter-c_sharp.wasm | csharp-parser |

#### 3.3.3 Use Case UC-6: Regex Fallback Extraction

**Actor:** System
**Preconditions:** Tree-sitter grammar unavailable OR file > maxFileSize
**Postconditions:** Basic symbols extracted via regex patterns

**Main Flow:**

| Step | System | Description |
|------|--------|-------------|
| 1 | Read file content | fs.readFileSync |
| 2 | Determine language from extension | extToLanguage mapping |
| 3 | Run extractSymbols(content, language) | Regex pattern matching |
| 4 | Store regex-extracted symbols | Same DB schema, no relationships |

#### 3.3.4 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-12 | Grammar loading is lazy (on first use per language) | Story 3 |
| BR-13 | Unavailable grammars tracked in Set (no retry) | Story 8 |
| BR-14 | maxFileSize default: 512KB (configurable up to 1MB) | Story 3, 9 |
| BR-15 | Compound extensions: longest match wins | Story 3 |
| BR-16 | IndexResult tracks method used (tree-sitter vs regex-fallback) | Story 8 |

---

### 3.4 Feature: Symbol and Relationship Extraction

**Source:** BRD Story 4

#### 3.4.1 Use Case UC-7: Extract Symbols from Parsed File

**Actor:** System
**Preconditions:** AST parsed successfully
**Postconditions:** Symbols stored in symbols table with FTS5 sync

**Main Flow:**

| Step | System | Description |
|------|--------|-------------|
| 1 | Walk AST nodes | Identify declaration nodes |
| 2 | Extract symbol metadata | name, kind, signature, lines, visibility, doc_comment |
| 3 | Identify parent-child | Nested classes/functions get parent_symbol |
| 4 | Store in symbols table | INSERT with file_id FK |
| 5 | FTS5 trigger fires | Auto-inserts into symbols_fts virtual table |

#### 3.4.2 Symbol Kinds Extracted

| Kind | Languages | Example |
|------|-----------|---------|
| class | All | class IndexingEngine |
| interface | TS, Java, Kotlin, C# | interface ILanguageParser |
| function | All | function detectModule() |
| method | All (inside class) | async indexFile() |
| arrow_function | TS, JS | const handler = () => {} |
| generator | TS, JS | function* iterate() |
| enum | TS, Java, Kotlin, C# | enum Status |
| namespace | TS | namespace Utils |
| data_class | Kotlin | data class Config() |
| object | Kotlin | object Singleton |
| extension_function | Kotlin | fun String.toSlug() |
| decorator | Python | @app.route |
| trigger | Apex | trigger AccountTrigger |

#### 3.4.3 Relationship Types

| Kind | Description | Example |
|------|-------------|---------|
| import | File imports module/symbol | A imports {foo} from B |
| inherits | Class extends another | C extends D |
| implements | Class implements interface | C implements I |
| calls | Function calls another | fn() calls bar() |
| soql | Apex SOQL query | [SELECT ... FROM Account] |
| dml | Apex DML operation | insert records |
| trigger-on | Apex trigger on object | trigger on Account |
| wire | LWC wire service binding | @wire(getRecord) |

#### 3.4.4 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-17 | Relationships stored with source_symbol_id, target_symbol, kind, line | Story 4 |
| BR-18 | Relationships deleted and recreated atomically per file | Story 4 |
| BR-19 | Cross-file resolution: max 5000 per full index run | Story 4 |
| BR-20 | Resolution matches target_symbol string to actual symbol ID | Story 4 |
| BR-21 | Unresolved targets keep target_symbol_id = NULL | Story 4 |

---

### 3.5 Feature: Embedding Generation

**Source:** BRD Story 5

#### 3.5.1 Use Case UC-8: Generate Embedding for Function Body

**Actor:** System
**Preconditions:** Function parsed with body >= 3 lines
**Postconditions:** Body text stored in body_embeddings table for later vectorization

**Main Flow:**

| Step | System | Description |
|------|--------|-------------|
| 1 | Identify function symbols | Filter by kind in (function, method, arrow_function, generator) |
| 2 | Extract body lines | source lines from start_line to end_line |
| 3 | Check minimum length | body must be >= 3 lines |
| 4 | Compute token count | split on whitespace, count non-empty |
| 5 | Store body as raw bytes | INSERT OR REPLACE into body_embeddings |

#### 3.5.2 EmbeddingService (Downstream)

| Attribute | Value |
|-----------|-------|
| Model | Xenova/paraphrase-multilingual-MiniLM-L12-v2 |
| Dimension | 384 |
| Quantized | Yes (for performance) |
| Pattern | Singleton (lazy initialization) |
| Pooling | mean |
| Normalize | true |
| Source | HuggingFace Hub (downloaded on first use) |

#### 3.5.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-22 | Minimum body: 3 lines for embedding eligibility | Story 5 |
| BR-23 | Body extraction is optional (failure does not halt indexing) | Story 5 |
| BR-24 | EmbeddingService is singleton (one instance per process) | Story 5 |
| BR-25 | Model downloaded from HF Hub on first use (cached after) | Story 5 |
| BR-26 | Cosine similarity > 0.7 indicates similar logic | Story 5 |

---

### 3.6 Feature: Module Detection

**Source:** BRD Story 7

#### 3.6.1 Use Case UC-9: Detect and Store Modules

**Actor:** System
**Preconditions:** Full index completed (files table populated)
**Postconditions:** Modules table updated with file counts, patterns, purpose

**Main Flow:**

| Step | System | Description |
|------|--------|-------------|
| 1 | Group files by module column | Query files grouped by module |
| 2 | Count files and symbols per module | Aggregate queries |
| 3 | Detect patterns per module | DI style, error handling, naming, logging, testing |
| 4 | Infer module purpose | From class/function names and patterns |
| 5 | Store in modules table | INSERT with all metadata |

#### 3.6.2 Module Detection Rules

| Project Type | Rule | Example |
|--------------|------|---------|
| Standard | First directory under src/ | src/engine/ -> module "engine" |
| SFDX | force-app/classes/ -> apex-classes | Salesforce-specific mapping |
| SFDX | force-app/triggers/ -> apex-triggers | SF triggers module |
| SFDX | force-app/lwc/ -> lwc-components | Lightning Web Components |
| SFDX | force-app/flows/ -> sf-flows | Flow definitions |
| SFDX | force-app/objects/ -> sf-objects | Custom objects |

#### 3.6.3 Pattern Detection

| Pattern | Detection Method | Example Values |
|---------|-----------------|----------------|
| DI Style | Import patterns + constructor injection | "constructor-injection", "module-import" |
| Error Handling | try/catch patterns, error classes | "try-catch", "result-type" |
| Naming Convention | Symbol name analysis | "camelCase", "PascalCase" |
| Logging Framework | Import detection | "console", "winston", "pino" |
| Testing Framework | Test file imports | "jest", "vitest", "mocha" |

---

### 3.7 Feature: Configuration Management

**Source:** BRD Story 9

#### 3.7.1 Use Case UC-10: Load Configuration

**Actor:** System
**Preconditions:** Server starting
**Postconditions:** AppConfig populated with merged values

**Main Flow:**

| Step | System | Description |
|------|--------|-------------|
| 1 | Check CLI args (--workspace) | Highest priority |
| 2 | Check environment variables | CODE_INTEL_* vars |
| 3 | Read config file | {workspace}/.code-intel/config.json |
| 4 | Apply defaults | DEFAULT_EXCLUDE, DEFAULT_EXTENSIONS |
| 5 | Build AppConfig object | Merged configuration |

#### 3.7.2 Configuration Properties

| Property | Env Var | CLI Arg | Default | Description |
|----------|---------|---------|---------|-------------|
| workspace | CODE_INTEL_WORKSPACE | --workspace | cwd() | Root directory |
| watchEnabled | CODE_INTEL_WATCH | — | true | Enable file watcher |
| watchDebounceMs | CODE_INTEL_DEBOUNCE | — | 500 | Debounce delay ms |
| maxFileSize | — | — | 512000 | Max file size for parsing |
| excludePatterns | — | — | [node_modules, .git, ...] | Directories to exclude |
| includeExtensions | — | — | [.ts, .kt, .py, ...] | Extensions to index |
| ollamaUrl | OLLAMA_URL | — | null | Alternative embedding URL |
| ollamaModel | OLLAMA_MODEL | — | nomic-embed-text | Alternative model |
| dbPath | CODE_INTEL_DB | — | .code-intel/index.db | Database file path |
| viewerPort | CODE_INTEL_VIEWER_PORT | --viewer-port | 3202 | Viewer HTTP port |

#### 3.7.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-27 | Priority: CLI > env > config file > defaults | Story 9 |
| BR-28 | Invalid config values fall back to defaults (no crash) | Story 9 |
| BR-29 | Config file at {workspace}/.code-intel/config.json | Story 9 |
| BR-30 | MCP initialize.roots[0].uri can set workspace (lower than CLI/env) | Config |

---

### 3.8 Feature: Indexer Status (MCP Tool)

**Source:** BRD Story 10

#### 3.8.1 Use Case UC-11: Query Indexer Status

**Actor:** Developer / AI Agent
**Preconditions:** Backend server running
**Postconditions:** Status JSON returned

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Calls code_index_status | | MCP tool invocation |
| 2 | | Query database stats | COUNT files, symbols, modules |
| 3 | | Get tree-sitter status | Available/unavailable grammars |
| 4 | | Get SFDX stats (if applicable) | SF-specific counts |
| 5 | | Return status JSON | All fields populated |

#### 3.8.2 API Contract: code_index_status

**Input:** (no parameters)

**Output:**

```json
{
  "running": true,
  "totalFiles": 1234,
  "totalSymbols": 8567,
  "languages": ["typescript", "kotlin", "python", "java"],
  "unavailableGrammars": ["rust"],
  "modules": [
    { "name": "engine", "fileCount": 45, "symbolCount": 320 }
  ],
  "sfdxStats": {
    "detected": true,
    "stats": { "apex_classes": 50, "apex_triggers": 5, "flows": 12, "objects": 30, "lwc_components": 8 },
    "relationships": { "soql": 120, "dml": 45, "trigger-on": 5, "inherits": 25 }
  }
}
```

#### 3.8.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-31 | Status reflects real-time state (not cached) | Story 10 |
| BR-32 | sfdxStats only present when SFDX project detected | Story 10 |
| BR-33 | Language list matches actually loaded grammars | Story 10 |

---

## 4. Data Model

### 4.1 Entity Relationship

**Entities:** files, symbols, modules, relationships, body_embeddings, embeddings

**Relationships:**

| From | To | Cardinality | Description |
|------|-----|-------------|-------------|
| files | symbols | 1:N | Each file has many symbols |
| symbols | relationships | 1:N | Each symbol can have many relationships |
| symbols | body_embeddings | 1:1 | Each function symbol has one body chunk |
| symbols | embeddings | 1:N | Each symbol can have vector embeddings |
| files | modules | N:1 | Many files belong to one module |

### 4.2 Logical Entities

#### Entity: files

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| id | INTEGER | PK | Auto-increment ID |
| path | TEXT | Yes | Absolute file path (UNIQUE) |
| relative_path | TEXT | Yes | Path relative to workspace |
| language | TEXT | Yes | Detected language |
| module | TEXT | No | Assigned module name |
| content_hash | TEXT | Yes | Content hash for change detection |
| size_bytes | INTEGER | Yes | File size |
| line_count | INTEGER | Yes | Number of lines |
| last_indexed | TEXT | Yes | Timestamp of last index |

#### Entity: symbols

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| id | INTEGER | PK | Auto-increment ID |
| file_id | INTEGER | FK | References files(id) CASCADE |
| name | TEXT | Yes | Symbol name |
| kind | TEXT | Yes | Symbol kind (class, function, etc.) |
| signature | TEXT | No | Full signature string |
| start_line | INTEGER | Yes | Start line number |
| end_line | INTEGER | Yes | End line number |
| parent_symbol | TEXT | No | Parent symbol name (nesting) |
| visibility | TEXT | No | export, public, private, etc. |
| doc_comment | TEXT | No | Documentation comment |

#### Entity: modules

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| id | INTEGER | PK | Auto-increment ID |
| name | TEXT | Yes | Module name (UNIQUE) |
| root_path | TEXT | Yes | Root path of module |
| language | TEXT | No | Primary language |
| file_count | INTEGER | Yes | Number of files |
| symbol_count | INTEGER | Yes | Number of symbols |
| di_style | TEXT | No | Dependency injection pattern |
| error_handling | TEXT | No | Error handling pattern |
| naming_convention | TEXT | No | Naming convention |
| logging_framework | TEXT | No | Logging framework used |
| testing_framework | TEXT | No | Testing framework used |
| purpose | TEXT | No | Inferred module purpose |

#### Entity: relationships

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| id | INTEGER | PK | Auto-increment ID |
| source_symbol_id | INTEGER | FK | Source symbol |
| target_symbol | TEXT | Yes | Target symbol name |
| target_symbol_id | INTEGER | No | Resolved target ID (nullable) |
| kind | TEXT | Yes | Relationship kind |
| file_path | TEXT | Yes | File containing relationship |
| line | INTEGER | No | Line number |
| metadata | TEXT | No | JSON metadata |

#### Entity: body_embeddings

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| symbol_id | INTEGER | FK | References symbols(id) |
| chunk_index | INTEGER | Yes | Chunk sequence (usually 0) |
| embedding | BLOB | Yes | Raw body text or vector bytes |
| token_count | INTEGER | Yes | Word count of body |

---

## 5. Processing Logic

### 5.1 Full Index Pipeline

```
FUNCTION runFullIndex(config):
  IF indexing THEN RETURN (prevent concurrent)
  indexing = true
  
  files = scanWorkspace(config)  // discover all matching files
  
  // Phase 1: Upsert file records (transaction)
  filesToIndex = []
  FOR EACH file IN files:
    IF isFileUnchanged(file) THEN skip++; CONTINUE
    INSERT OR REPLACE INTO files (path, relative_path, language, module, hash, size, lines)
    filesToIndex.push(file)
  
  // Phase 2: Index symbols (batches of 50)
  FOR i = 0 TO filesToIndex.length STEP 50:
    batch = filesToIndex[i:i+50]
    FOR EACH file IN batch:
      parser = grammarRegistry.getParser(file.path)
      IF parser:
        result = parser.parse(source, relativePath)
        storeResults(relativePath, result)         // atomic transaction
        extractAndStoreBodies(relativePath, source, result)
      ELSE:
        symbols = extractSymbols(source, language)  // regex fallback
        storeRegexResults(relativePath, symbols)
  
  // Phase 3: Post-processing
  updateModules()                    // group files, count stats
  detectAndStorePatterns()           // DI, error, naming, logging, testing
  graphRepo.resolveTargets(5000)     // cross-file relationship resolution
  
  indexing = false
```

### 5.2 Incremental Single-File Update

```
FUNCTION indexSingleFile(filePath):
  file = scanSingleFile(filePath, workspace)
  IF file IS NULL THEN RETURN
  IF isFileUnchanged(file) THEN RETURN
  
  upsertFile(file)  // INSERT OR REPLACE into files
  
  IF treeSitterReady:
    treeSitterIndexer.indexFile(file.absolutePath, file.relativePath)
  ELSE:
    deleteOldSymbols(file)
    indexFileSymbolsRegex(file)
```

### 5.3 Atomic Symbol Storage (Transaction)

```
FUNCTION storeResults(filePath, parseResult):
  BEGIN TRANSACTION:
    fileId = SELECT id FROM files WHERE relative_path = filePath
    DELETE FROM symbols WHERE file_id = fileId
    DELETE FROM relationships WHERE file_path = filePath
    
    FOR EACH sym IN parseResult.symbols:
      symbolId = INSERT INTO symbols (file_id, name, kind, signature, ...)
      symbolIds[sym.name] = symbolId
    
    FOR EACH rel IN parseResult.relationships:
      sourceId = symbolIds[rel.sourceSymbol]
      IF sourceId IS NULL THEN SKIP
      targetId = symbolIds[rel.targetSymbol] OR NULL
      INSERT INTO relationships (source_symbol_id, target_symbol, target_symbol_id, kind, ...)
  COMMIT
```

### 5.4 Cross-File Relationship Resolution

```
FUNCTION resolveTargets(limit):
  // Find relationships where target_symbol_id IS NULL but target_symbol matches a known symbol
  unresolved = SELECT r.id, r.target_symbol
               FROM relationships r
               WHERE r.target_symbol_id IS NULL
               LIMIT limit
  
  resolved = 0
  FOR EACH row IN unresolved:
    match = SELECT id FROM symbols WHERE name = row.target_symbol LIMIT 1
    IF match:
      UPDATE relationships SET target_symbol_id = match.id WHERE id = row.id
      resolved++
  
  RETURN resolved
```

---

## 6. State Diagram

### 6.1 Indexer Lifecycle States

![State Diagram](diagrams/state-indexer.png)

States:
- **IDLE** — Server started, indexer not yet invoked
- **FULL_INDEXING** — Running full workspace scan (batch processing)
- **WATCHING** — File watcher active, processing incremental changes
- **PROCESSING_FILE** — Single file being indexed (after watch event)
- **STOPPED** — Indexer shut down (watcher closed)

Transitions:
- IDLE -> FULL_INDEXING: startBackgroundIndexing() called
- FULL_INDEXING -> WATCHING: Full index complete, watcher starts
- WATCHING -> PROCESSING_FILE: File change event (after debounce)
- PROCESSING_FILE -> WATCHING: File indexed, resume watching
- WATCHING -> STOPPED: stop() called
- FULL_INDEXING -> STOPPED: stop() called during index
- Any -> FULL_INDEXING: runFullIndex() (if not already indexing)

---

## 7. Sequence Diagrams

### 7.1 Incremental File Index Sequence

![Sequence — Incremental Index](diagrams/sequence-incremental-index.png)

### 7.2 Full Index Startup Sequence

![Sequence — Full Index](diagrams/sequence-full-index.png)

---

## 8. Non-Functional Requirements

| Category | Requirement | Target |
|----------|-------------|--------|
| Performance | Full index (1000 files) | < 30 seconds |
| Performance | Single file re-index | < 500ms |
| Performance | Hash-only re-scan (unchanged) | < 5 seconds |
| Performance | Debounce delay | 500ms (configurable) |
| Scalability | Maximum workspace size | 50,000 files |
| Scalability | Batch size | 50 files per batch |
| Reliability | Parse error isolation | One file error does not halt others |
| Reliability | Graceful degradation | Tree-sitter to regex fallback |
| Availability | Auto-start | Indexer starts with backend server |
| Security | No external data transmission | Embedding generation is local-only |
| Configurability | All major params configurable | CLI, env, config file |

---

## 9. Error Handling

| Scenario | Severity | Response |
|----------|----------|----------|
| File read permission denied | Warning | Log, skip file, continue |
| Tree-sitter grammar load fails | Info | Mark unavailable, use regex |
| WASM runtime init fails | Warning | All languages use regex fallback |
| Database write contention | Warning | Retry on next change event |
| ONNX model download fails | Info | Embedding skipped, indexing continues |
| chokidar not installed | Warning | File watching disabled, manual re-index only |
| Malformed source (parse error) | Info | Store partial results, log errors |
| File size exceeds limit | Info | Use regex fallback |
| Config file invalid JSON | Warning | Use defaults, log error |

---

## 10. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Sequence — Incremental Index | [sequence-incremental-index.png](diagrams/sequence-incremental-index.png) | [sequence-incremental-index.drawio](diagrams/sequence-incremental-index.drawio) |
| 3 | Sequence — Full Index | [sequence-full-index.png](diagrams/sequence-full-index.png) | [sequence-full-index.drawio](diagrams/sequence-full-index.drawio) |
| 4 | State — Indexer Lifecycle | [state-indexer.png](diagrams/state-indexer.png) | [state-indexer.drawio](diagrams/state-indexer.drawio) |
