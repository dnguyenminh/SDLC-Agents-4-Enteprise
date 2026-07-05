# Technical Design Document (TDD)

## SA4E Code Intelligence --- F5: Incremental Indexer

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F5-incremental-indexer |
| Title | Incremental Indexer --- Technical Design |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Related BRD | BRD-v1-F5-incremental-indexer.docx |
| Related FSD | FSD-v1-F5-incremental-indexer.docx |
| Architecture Pattern | AI Agent System |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | SA Agent | Initial --- architecture, component design, algorithms |

---

## 1. Introduction

This TDD specifies HOW to implement the Incremental Indexer. For WHAT it does, refer to FSD. This document focuses on architecture decisions, class design, algorithms, database DDL, and implementation patterns.

### 1.1 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 20+ |
| Language | TypeScript | 5.x |
| Database | SQLite via better-sqlite3 | Synchronous API |
| AST Parser | web-tree-sitter (WASM) | 0.22+ |
| File Watcher | chokidar | 3.x |
| Embeddings | @xenova/transformers (ONNX) | 2.x |
| Module System | ESM (.js extension imports) | ES2022 |
| Build | esbuild | Bundled |

### 1.2 Design Principles

- **Synchronous DB access**: better-sqlite3 is sync; no async overhead for queries
- **Async orchestration**: File I/O and tree-sitter parsing are async
- **Fail gracefully**: Individual file errors never crash the process
- **Incremental by default**: Hash-based skip avoids redundant work
- **Lazy loading**: Grammars loaded on first use per language
- **Single responsibility**: Each class has one job

### 1.3 Constraints

- WASM grammars must be pre-compiled (.wasm files in grammars/ directory)
- SQLite single-writer (no concurrent full indexes)
- ONNX model downloaded from HuggingFace on first use (requires network)
- chokidar requires native OS file system events (fsevents/inotify/ReadDirectoryChangesW)

---

## 2. System Architecture

### 2.1 Architecture Overview

![Architecture Diagram](diagrams/architecture.png)

The Incremental Indexer is a TypeScript module within the SA4E backend process. It runs as a background service alongside the MCP server. Key architectural decisions:

1. **No separate process**: Runs in-process with the MCP server for direct DB access
2. **Event-driven**: File watcher emits events, engine processes them
3. **Pipeline pattern**: File -> Hash Check -> Parse -> Store -> Resolve
4. **Strategy pattern**: Language parsers implement ILanguageParser interface
5. **Singleton embedding**: One ONNX session shared across all embedding requests

### 2.2 Component Diagram

![Component Diagram](diagrams/component.png)

| Component | File | Responsibility |
|-----------|------|---------------|
| IndexingEngine | engine/indexer/indexing-engine.ts | Main orchestrator: full index, single file, lifecycle |
| FileWatcher | engine/indexer/file-watcher.ts | chokidar wrapper with debounce |
| TreeSitterIndexer | engine/parsers/tree-sitter-indexer.ts | Per-file parsing + DB storage |
| GrammarRegistry | engine/parsers/grammar-registry.ts | WASM grammar loading + extension mapping |
| ILanguageParser | engine/parsers/languages/*.ts | Language-specific AST extraction |
| EmbeddingService | engine/parsers/embedding/EmbeddingService.ts | ONNX vector generation (singleton) |
| GraphRepository | engine/database/graph-repository.ts | Relationship storage + resolution |
| DatabaseManager | engine/db/database-manager.ts | SQLite connection + migrations |
| FileScanner | engine/scanner/file-scanner.ts | Workspace file discovery + hashing |
| PatternDetector | engine/scanner/pattern-detector.ts | Module pattern analysis |
| SignatureExtractor | engine/scanner/signature-extractor.ts | Regex fallback extraction |

### 2.3 Communication Patterns

| From | To | Protocol | Pattern | Description |
|------|----|----------|---------|-------------|
| FileWatcher | IndexingEngine | Callback | Async event | File change notification |
| IndexingEngine | TreeSitterIndexer | Method call | Async | Parse single/batch files |
| TreeSitterIndexer | GrammarRegistry | Method call | Async | Get parser for language |
| TreeSitterIndexer | SQLite | better-sqlite3 | Sync transaction | Atomic symbol storage |
| IndexingEngine | GraphRepository | Method call | Sync | Cross-file resolution |
| MCP Server | IndexingEngine | Direct ref | Sync | code_index_status tool |

---

## 3. API Design

### 3.1 MCP Tool: code_index_status

**Implements:** UC-11 (FSD 3.8)

| Attribute | Value |
|-----------|-------|
| Tool Name | code_index_status |
| Protocol | MCP (Model Context Protocol) |
| Auth | None (local process) |

**Input Schema:**

```json
{ "type": "object", "properties": {}, "required": [] }
```

**Output Schema:**

```json
{
  "type": "object",
  "properties": {
    "running": { "type": "boolean" },
    "totalFiles": { "type": "integer" },
    "totalSymbols": { "type": "integer" },
    "languages": { "type": "array", "items": { "type": "string" } },
    "unavailableGrammars": { "type": "array", "items": { "type": "string" } },
    "modules": { "type": "array" },
    "sfdxStats": { "type": "object" }
  }
}
```

**Implementation:** Queries SQLite for counts, calls IndexingEngine.getTreeSitterStats() and getSfdxStats().

---

## 4. Database Design

### 4.1 Schema Overview

SQLite database at `{workspace}/.code-intel/index.db`. Schema defined in `engine/db/schema.ts`.

### 4.2 DDL Scripts

#### Table: files

```sql
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  relative_path TEXT NOT NULL,
  language TEXT NOT NULL,
  module TEXT,
  content_hash TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  last_indexed TEXT NOT NULL DEFAULT (datetime('now')),
  line_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_files_path ON files(relative_path);
CREATE INDEX idx_files_module ON files(module);
CREATE INDEX idx_files_language ON files(language);
```

#### Table: symbols

```sql
CREATE TABLE IF NOT EXISTS symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  signature TEXT,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  parent_symbol TEXT,
  visibility TEXT,
  doc_comment TEXT,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);
CREATE INDEX idx_symbols_file ON symbols(file_id);
CREATE INDEX idx_symbols_name ON symbols(name);
CREATE INDEX idx_symbols_kind ON symbols(kind);
```

#### Table: symbols_fts (Full-Text Search)

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(
  name, signature, doc_comment, kind,
  content=symbols, content_rowid=id,
  tokenize='porter unicode61'
);
-- Sync triggers: symbols_ai (AFTER INSERT), symbols_ad (AFTER DELETE), symbols_au (AFTER UPDATE)
```

#### Table: modules

```sql
CREATE TABLE IF NOT EXISTS modules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  root_path TEXT NOT NULL,
  language TEXT,
  description TEXT,
  file_count INTEGER NOT NULL DEFAULT 0,
  symbol_count INTEGER NOT NULL DEFAULT 0,
  di_style TEXT DEFAULT NULL,
  error_handling TEXT DEFAULT NULL,
  naming_convention TEXT DEFAULT NULL,
  logging_framework TEXT DEFAULT NULL,
  testing_framework TEXT DEFAULT NULL,
  purpose TEXT DEFAULT NULL
);
```

#### Table: relationships

```sql
CREATE TABLE IF NOT EXISTS relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_symbol_id INTEGER NOT NULL,
  target_symbol TEXT NOT NULL,
  target_symbol_id INTEGER,
  kind TEXT NOT NULL,
  file_path TEXT NOT NULL,
  line INTEGER,
  metadata TEXT,
  FOREIGN KEY (source_symbol_id) REFERENCES symbols(id) ON DELETE CASCADE
);
CREATE INDEX idx_rel_source ON relationships(source_symbol_id);
CREATE INDEX idx_rel_file ON relationships(file_path);
CREATE INDEX idx_rel_kind ON relationships(kind);
CREATE INDEX idx_rel_target ON relationships(target_symbol);
```

#### Table: body_embeddings

```sql
CREATE TABLE IF NOT EXISTS body_embeddings (
  symbol_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  embedding BLOB NOT NULL,
  token_count INTEGER NOT NULL,
  PRIMARY KEY (symbol_id, chunk_index),
  FOREIGN KEY (symbol_id) REFERENCES symbols(id) ON DELETE CASCADE
);
```

#### Table: embeddings

```sql
CREATE TABLE IF NOT EXISTS embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol_id INTEGER,
  file_id INTEGER,
  vector BLOB NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (symbol_id) REFERENCES symbols(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);
CREATE INDEX idx_embeddings_symbol ON embeddings(symbol_id);
```

### 4.3 Query Patterns

| Operation | Query | Expected Performance |
|-----------|-------|---------------------|
| Hash check | SELECT content_hash FROM files WHERE relative_path = ? | < 1ms (indexed) |
| File upsert | INSERT OR REPLACE INTO files (...) VALUES (...) | < 1ms |
| Symbol delete | DELETE FROM symbols WHERE file_id = ? | < 5ms (cascades) |
| Symbol insert | INSERT INTO symbols (...) VALUES (...) | < 1ms per symbol |
| Module stats | SELECT module, COUNT(*) ... GROUP BY module | < 50ms |
| Resolve targets | SELECT id FROM symbols WHERE name = ? LIMIT 1 | < 1ms per lookup |

---

## 5. Class / Module Design

### 5.1 Package Structure

```
backend/src/engine/
+-- indexer/
|   +-- indexing-engine.ts       # Main orchestrator (IndexingEngine class)
|   +-- file-watcher.ts          # FileWatcher class (chokidar wrapper)
|   +-- __tests__/               # Unit tests
+-- parsers/
|   +-- tree-sitter-indexer.ts   # TreeSitterIndexer class
|   +-- grammar-registry.ts      # GrammarRegistry class
|   +-- grammar-config.json      # Language configuration
|   +-- types.ts                 # ParseResult, IndexResult, ILanguageParser
|   +-- ast-utils.ts             # AST traversal helpers
|   +-- index.ts                 # Barrel exports
|   +-- grammars/                # .wasm grammar files
|   +-- languages/               # Per-language parser modules
|   |   +-- typescript-parser.ts
|   |   +-- kotlin-parser.ts
|   |   +-- python-parser.ts
|   |   +-- java-parser.ts
|   |   +-- go-parser.ts
|   |   +-- rust-parser.ts
|   |   +-- apex-parser.ts
|   |   +-- csharp-parser.ts
|   +-- embedding/
|       +-- EmbeddingService.ts  # Singleton ONNX embedding
|       +-- body-extractor.ts    # Function body extraction
|       +-- chunker.ts           # Text chunking utilities
+-- scanner/
|   +-- file-scanner.ts          # Workspace scanning + hashing
|   +-- pattern-detector.ts      # Module pattern analysis
|   +-- signature-extractor.ts   # Regex fallback extraction
+-- database/
|   +-- graph-repository.ts      # Relationship CRUD + resolution
|   +-- incremental-updater.ts   # Incremental DB updates
|   +-- migrations/              # Schema migration scripts
+-- db/
|   +-- database-manager.ts      # SQLite connection management
|   +-- schema.ts                # DDL constants
|   +-- migrations.ts            # Migration runner
+-- config.ts                    # AppConfig loading
```

### 5.2 Key Interfaces

```typescript
// engine/parsers/types.ts
interface ILanguageParser {
  parse(source: string, filePath: string): ParseResult;
}

interface ParseResult {
  symbols: ParsedSymbol[];
  relationships: ParsedRelationship[];
  errors: ParseError[];
}

interface ParsedSymbol {
  name: string;
  kind: string;
  signature: string;
  startLine: number;
  endLine: number;
  parentName?: string;
  isExported: boolean;
  docComment?: string;
}

interface ParsedRelationship {
  sourceSymbol: string;
  targetSymbol: string;
  kind: string;  // import, inherits, implements, calls, soql, dml, trigger-on, wire
  line: number;
  metadata?: Record<string, unknown>;
}

interface IndexResult {
  filePath: string;
  symbolCount: number;
  relationshipCount: number;
  parseErrors: number;
  duration: number;
  method: 'tree-sitter' | 'regex-fallback';
}
```

```typescript
// engine/config.ts
interface AppConfig {
  workspace: string;
  viewerPort: number;
  dbPath: string;
  configPath: string;
  watchEnabled: boolean;
  watchDebounceMs: number;
  ollamaUrl: string | null;
  ollamaModel: string;
  excludePatterns: string[];
  includeExtensions: string[];
  maxFileSize: number;
}
```

### 5.3 Design Patterns

| Pattern | Where Used | Rationale |
|---------|-----------|-----------|
| Strategy | ILanguageParser implementations | Each language has different AST structure |
| Singleton | EmbeddingService.getInstance() | One ONNX session, expensive to create |
| Factory | GrammarRegistry.getParser() | Lazy-creates parser per language on first use |
| Observer | FileWatcher callback | Decouples watcher from indexing logic |
| Template Method | LanguageParser base class | Common AST walk, language-specific extraction |
| Transaction | storeResults() | Atomic delete-then-insert prevents partial data |

### 5.4 Error Handling

| Exception/Error | Location | Handling |
|-----------------|----------|----------|
| File read error | TreeSitterIndexer.indexFile | Return IndexResult with parseErrors=1, continue |
| Grammar load fail | GrammarRegistry.loadParser | Add to unavailable set, return null |
| Parse error | ILanguageParser.parse | Include in ParseResult.errors, return partial |
| DB write error | storeResults transaction | Transaction rollback, log error |
| WASM init fail | GrammarRegistry.initialize | treeSitterReady = false, all regex fallback |
| chokidar unavailable | FileWatcher.initChokidar | Log error, watching disabled |
| ONNX model download fail | EmbeddingService.getExtractor | Promise rejects, embedding skipped |

---

## 6. Integration Design

### 6.1 Tree-sitter WASM Runtime

| Attribute | Value |
|-----------|-------|
| Protocol | WASM function calls |
| Initialization | Parser.init() (one-time WASM runtime setup) |
| Grammar Loading | Language.load(wasmPath) per language |
| Timeout | None (in-process) |
| Failure Mode | Grammar marked unavailable, regex fallback |

### 6.2 chokidar File Watcher

| Attribute | Value |
|-----------|-------|
| Protocol | OS file events (inotify/fsevents/ReadDirectoryChangesW) |
| Configuration | persistent: true, ignoreInitial: true |
| Stability | awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 } |
| Events | add, change, unlink |
| Ignored | excludePatterns as glob + dotfiles |

### 6.3 ONNX Embedding Runtime

| Attribute | Value |
|-----------|-------|
| Library | @xenova/transformers |
| Model | Xenova/paraphrase-multilingual-MiniLM-L12-v2 |
| Quantized | true |
| Pooling | mean |
| Normalize | true |
| Output Dim | 384 |
| Download | HuggingFace Hub (cached after first download) |

---

## 7. Security Design

### 7.1 Data Protection

| Aspect | Implementation |
|--------|---------------|
| File Content | Read-only; never transmitted externally |
| Embeddings | Generated locally via ONNX; no API calls |
| Database | Local SQLite file; no network access |
| Credentials | None stored or required |

### 7.2 Input Validation

| Input | Validation |
|-------|-----------|
| File paths | Resolved relative to workspace root; no path traversal |
| File size | Checked against maxFileSize before reading |
| Config values | Validated with fallback to defaults |
| Extension | Must be in includeExtensions whitelist |

### 7.3 Sandboxing

- WASM grammars run in Node.js WASM sandbox (no filesystem access from grammar)
- File watcher restricted to workspace directory
- Database file in .code-intel/ subdirectory (configurable)

---

## 8. Performance and Scalability

### 8.1 Performance Targets

| Operation | Target | Implementation |
|-----------|--------|----------------|
| Full index (1000 files) | < 30s | Batch processing (50 files), hash skip |
| Single file re-index | < 500ms | Direct parse + store, no batch overhead |
| Hash-only re-scan | < 5s | SELECT + compare only, no parsing |
| Grammar lazy load | < 200ms first time | Cached after first load |
| Debounce delay | 500ms | Configurable via env |

### 8.2 Batch Processing

- Full index processes files in batches of 50
- Each batch: parallel tree-sitter parsing within batch
- Between batches: yield to event loop (non-blocking)

### 8.3 Memory Management

| Concern | Strategy |
|---------|----------|
| Large files (>512KB) | Regex fallback (no AST in memory) |
| Grammar caching | One Parser instance per language (reused) |
| ONNX model | Singleton, loaded once, shared |
| Source strings | GC after parse (not held in memory) |
| Database | better-sqlite3 manages internal buffers |

### 8.4 Scalability

| Dimension | Limit | Mitigation |
|-----------|-------|------------|
| File count | 50K files | Hash skip, batch processing |
| Symbols per file | No hard limit | Linear with file size |
| Relationships | 5000 resolution per run | Limit prevents long-running resolution |
| Modules | No hard limit | Grouped by directory |

---

## 9. Monitoring and Observability

### 9.1 Logging

| Event | Level | Output |
|-------|-------|--------|
| Tree-sitter init success/fail | INFO/ERROR | stderr |
| Full index start/complete | INFO | stderr with file count |
| Per-batch progress | INFO | tree-sitter vs regex counts |
| Grammar load success/fail | INFO/ERROR | stderr |
| File watch event | DEBUG | stderr (only in verbose mode) |
| Cross-file resolution | INFO | resolved count |
| SFDX detection | INFO | SF stats |
| Parse error | ERROR | file path + error |

### 9.2 Metrics (via code_index_status)

| Metric | Type | Description |
|--------|------|-------------|
| totalFiles | Gauge | Files currently indexed |
| totalSymbols | Gauge | Symbols in database |
| languages | List | Available tree-sitter languages |
| unavailableGrammars | List | Languages that failed to load |
| modules | List | Detected modules with counts |

---

## 10. Deployment Considerations

### 10.1 Configuration

| Property | Value |
|----------|-------|
| Package | Part of SA4E backend (not separate service) |
| Start | Automatic on server init (startBackgroundIndexing) |
| Stop | Graceful on server shutdown (stop) |
| Data | {workspace}/.code-intel/index.db |
| Grammars | Bundled with backend package |

### 10.2 Grammar Deployment

- WASM grammars stored in `backend/src/engine/parsers/grammars/`
- Bundled during build (esbuild copies to dist)
- grammar-config.json maps languages to .wasm files
- New language support = add .wasm + parser module + config entry

### 10.3 Rollback Strategy

- Database is regenerated on next full index (safe to delete)
- No state that cannot be rebuilt from source files
- Rollback = restore previous backend version + delete index.db

---

## 11. Implementation Checklist

### Files to Create/Modify

| # | File | Action | Description |
|---|------|--------|-------------|
| 1 | engine/indexer/indexing-engine.ts | Existing | Main orchestrator |
| 2 | engine/indexer/file-watcher.ts | Existing | chokidar wrapper |
| 3 | engine/parsers/tree-sitter-indexer.ts | Existing | Per-file indexing |
| 4 | engine/parsers/grammar-registry.ts | Existing | Grammar management |
| 5 | engine/parsers/grammar-config.json | Existing | Language config |
| 6 | engine/parsers/languages/*.ts | Existing | Per-language parsers |
| 7 | engine/parsers/embedding/EmbeddingService.ts | Existing | ONNX singleton |
| 8 | engine/scanner/file-scanner.ts | Existing | File discovery |
| 9 | engine/scanner/pattern-detector.ts | Existing | Pattern analysis |
| 10 | engine/scanner/signature-extractor.ts | Existing | Regex fallback |
| 11 | engine/database/graph-repository.ts | Existing | Relationship DB |
| 12 | engine/db/schema.ts | Existing | DDL definitions |
| 13 | engine/config.ts | Existing | Configuration |
| 14 | engine/tools/code-index-status.ts | Existing | MCP tool |

### Dependencies (package.json)

| Package | Version | Purpose |
|---------|---------|---------|
| better-sqlite3 | ^11.0 | SQLite database access |
| web-tree-sitter | ^0.22 | WASM-based AST parsing |
| chokidar | ^3.6 | File system watching |
| @xenova/transformers | ^2.17 | ONNX embedding generation |

---

## 12. Appendix

### Glossary

| Term | Definition |
|------|------------|
| ParseResult | Output of language parser: symbols + relationships + errors |
| IndexResult | Output of indexFile: counts + timing + method used |
| ScannedFile | File metadata from scanner: path, hash, size, language |
| GraphRepository | Database layer for relationship storage and resolution |
| FTS5 | SQLite full-text search virtual table |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture Overview | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component Diagram | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
