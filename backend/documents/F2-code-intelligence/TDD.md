# Technical Design Document (TDD)

## SA4E Code Intelligence — F2-CODE-INTELLIGENCE

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F2-CODE-INTELLIGENCE |
| Title | Code Intelligence Module — Technical Design |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Related FSD | FSD-v1-F2-CODE-INTELLIGENCE.docx |
| Architecture Pattern | AI Agent System |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | SA Agent | Initial TDD — architecture design |

---

## 1. Architecture Overview

### 1.1 High-Level Architecture

The Code Intelligence module follows a layered architecture:

1. **MCP Tool Layer** — Tool definitions + dispatch (entry point for agents)
2. **Service Layer** — Graph services, analyzers, context assemblers
3. **Engine Layer** — Indexing engine, Tree-sitter parsers, symbol extraction
4. **Data Layer** — SQLite database, FTS5 index, file system access

![Architecture](diagrams/architecture.png)

### 1.2 Design Principles

- **Single Responsibility**: Each service handles one graph operation type
- **Strategy Pattern**: Language parsers implement common interface
- **Facade Pattern**: CodeIntelModule is the single entry point
- **Repository Pattern**: GraphRepository abstracts DB queries
- **Token Budgeting**: AI context tools enforce strict token limits

### 1.3 Key Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | SQLite (not PostgreSQL) | Single-file, zero-config, embedded — perfect for workspace-local index |
| 2 | Tree-sitter (not regex-only) | Accurate AST parsing, incremental, multi-language via WASM |
| 3 | BFS (not DFS) for graphs | Returns minimum-depth paths first, natural for "closest callers" |
| 4 | Regex fallback | Graceful degradation when grammar unavailable |
| 5 | Content hash for skip | Avoids re-parsing unchanged files |
| 6 | Atomic DB transactions | Prevents partial symbol state on crash |

---

## 2. Component Design

### 2.1 Component Diagram

![Component](diagrams/component.png)

### 2.2 Module Structure

`
backend/src/
├── modules/code-intel/
│   └── CodeIntelModule.ts          # IModule implementation, lifecycle
├── engine/
│   ├── indexer/
│   │   ├── indexing-engine.ts      # Orchestrator: scan, parse, store
│   │   └── file-watcher.ts         # chokidar-based FS monitoring
│   ├── parsers/
│   │   ├── tree-sitter-indexer.ts  # Tree-sitter parsing + DB storage
│   │   ├── grammar-registry.ts    # WASM grammar loading + caching
│   │   ├── ast-utils.ts           # AST traversal helpers
│   │   ├── types.ts               # ParseResult, Symbol, Relationship
│   │   ├── languages/
│   │   │   ├── typescript-parser.ts
│   │   │   ├── python-parser.ts
│   │   │   ├── kotlin-parser.ts
│   │   │   ├── java-parser.ts
│   │   │   ├── go-parser.ts
│   │   │   ├── rust-parser.ts
│   │   │   └── apex-parser.ts
│   │   └── embedding/             # Body embeddings for similarity
│   ├── graph/
│   │   ├── symbol-resolver.ts     # Fuzzy symbol lookup
│   │   ├── call-graph-service.ts  # BFS callers/callees
│   │   ├── dependency-graph-service.ts  # BFS imports/exports
│   │   ├── impact-analysis-service.ts   # Combined blast radius
│   │   ├── test-detector.ts       # Related test finder
│   │   ├── file-resolver.ts       # Import path resolution
│   │   └── traverser.ts           # Generic graph traversal
│   ├── analyzers/
│   │   ├── complexity/            # Cyclomatic complexity
│   │   ├── entry-points/          # HTTP/CLI/event detection
│   │   ├── graph-analysis/        # Circular deps, hot paths, dead imports
│   │   └── similarity/            # Code clone detection
│   ├── tools/
│   │   ├── register-tools.ts      # Tool definitions + dispatch
│   │   ├── call-graph-tools.ts    # code_callers, code_callees
│   │   ├── dependency-tools.ts    # code_dependencies
│   │   ├── impact-tools.ts        # code_impact
│   │   ├── code-traverse.ts       # code_traverse
│   │   └── ai-context-tools.ts    # get_ai_context, get_edit_context, get_curated_context
│   └── database/
│       ├── graph-repository.ts    # Graph query abstraction
│       └── database-manager.ts    # SQLite lifecycle
`

### 2.3 Class Design

#### CodeIntelModule (Entry Point)

`	ypescript
class CodeIntelModule implements IModule {
  readonly name = 'codeIntel';
  private indexer: IndexingEngine;
  private dbManager: DatabaseManager;
  
  async initialize(): Promise<void>  // Load config, init DB, start indexer
  async shutdown(): Promise<void>    // Stop indexer, close DB
  getToolHandlers(): Map<string, ToolHandler>  // Register all MCP tools
  getToolDefinitions(): ToolDefinition[]       // Return tool schemas
}
`

#### IndexingEngine (Orchestrator)

`	ypescript
class IndexingEngine {
  private dbManager: DatabaseManager;
  private treeSitterIndexer: TreeSitterIndexer;
  private watcher: FileWatcher;
  
  async startBackgroundIndexing(): Promise<void>  // Full scan + watch
  async runFullIndex(): Promise<void>             // Scan all files
  async indexSingleFile(filePath: string): Promise<void>  // Incremental
  removeFile(filePath: string): void              // Handle deletion
  stop(): void                                    // Stop watcher
  
  private isFileUnchanged(file): boolean          // Content hash check
  private updateModules(): void                   // Module detection
  private detectAndStorePatterns(): void          // Pattern analysis
}
`

#### TreeSitterIndexer (Parser)

`	ypescript
class TreeSitterIndexer {
  private registry: GrammarRegistry;
  private db: Database;
  
  async indexFile(filePath, relativePath): Promise<IndexResult>
  async indexFiles(files): Promise<IndexResult[]>
  
  private storeResults(filePath, result): Map<string, number>  // Atomic DB write
  private regexFallback(filePath, relativePath, startTime): IndexResult
  private extractAndStoreBodies(filePath, source, result, symbolIds): void
}
`

#### CallGraphService (Graph Analysis)

`	ypescript
class CallGraphService {
  private graphRepo: GraphRepository;
  private symbolResolver: SymbolResolver;
  
  findCallers(symbol, depth, limit, fileFilter?, kindFilter?): CallGraphResponse
  findCallees(symbol, depth, limit, fileFilter?, includeExternal?, kindFilter?): CallGraphResponse
  
  // BFS algorithm:
  // 1. Resolve symbol → queue initial nodes
  // 2. While queue not empty && results < limit:
  //    - Dequeue node, check depth
  //    - Query relationships by kind
  //    - For each result: check visited, apply filter, add to results
  //    - If depth < max: enqueue for next level
}
`

#### ImpactAnalysisService (Combined Analysis)

`	ypescript
class ImpactAnalysisService {
  private callGraph: CallGraphService;
  private depGraph: DependencyGraphService;
  private resolver: SymbolResolver;
  private testDetector: TestDetector;
  
  analyzeImpact(symbol, action, depth, includeTests, severityThreshold): ImpactResult
  
  // Algorithm:
  // 1. Resolve symbol
  // 2. callGraph.findCallers(symbol, depth) → classify severity
  // 3. Find interface implementors (if interface method)
  // 4. depGraph.query(sourceFile, 'incoming') → file-level deps
  // 5. testDetector.findRelatedTests(resolved, affectedFiles)
  // 6. Deduplicate, sort by severity
  // 7. Generate recommendations
}
`

#### AI Context Tools

`	ypescript
// get_ai_context: Intent-aware context assembly
// Strategy pattern per intent:
interface ContextStrategy {
  getSections(symbol: ResolvedSymbol): ContextSection[];
  getPriority(): number[];  // Section priority for truncation
}

class ExplainStrategy implements ContextStrategy { ... }
class ModifyStrategy implements ContextStrategy { ... }
class DebugStrategy implements ContextStrategy { ... }
class TestStrategy implements ContextStrategy { ... }

// Token budgeting:
// 1. Assemble all sections
// 2. Count tokens per section
// 3. If total > budget: truncate lowest-priority sections
// 4. Return within budget with metadata
`

---

## 3. API Design

### 3.1 MCP Tool Interface

All tools follow the pattern:
`	ypescript
interface ToolHandler {
  (args: Record<string, unknown>): Promise<{ content: [{type: 'text', text: string}], isError: boolean }>;
}
`

### 3.2 Tool Definitions Summary

| Tool | Input | Output Format |
|------|-------|---------------|
| code_search | {query, limit} | Formatted symbol list |
| code_symbols | {name?, file?, kind?, limit?} | Symbol details |
| code_context | {file, symbol?, startLine?, endLine?} | Source code with line numbers |
| code_callers | {symbol, depth?, limit?, file_filter?} | CallGraphResponse |
| code_callees | {symbol, depth?, limit?, include_external?} | CallGraphResponse |
| code_dependencies | {file, direction?, depth?, include_external?} | DependencyResult |
| code_impact | {symbol, action?, depth?, include_tests?} | ImpactResult |
| complexity_analysis | {file_path?, symbol_name?, grade_filter?} | Complexity results |
| find_entry_points | {entry_type?, framework?, http_method?} | Entry point list |
| find_circular_deps | {module?, max_length?} | SCC cycles |
| find_related_tests | {symbol_name, file_path?} | Related tests |
| find_hot_paths | {module?, limit?, min_callers?} | Hot functions |
| find_dead_imports | {file_path?, module?} | Unused imports |
| module_summary | {module?} | Quality metrics |
| get_ai_context | {symbol, intent?, token_budget?} | Assembled context |
| get_edit_context | {symbol, include_callers?, include_tests?} | Edit context |
| get_curated_context | {query, max_tokens?, include_source?} | Multi-source results |

---

## 4. Database Design

### 4.1 Schema (SQLite)

See FSD Section 5.1 for full DDL.

### 4.2 Indexes

`sql
CREATE INDEX idx_symbols_file ON symbols(file_id);
CREATE INDEX idx_symbols_name ON symbols(name);
CREATE INDEX idx_symbols_kind ON symbols(kind);
CREATE INDEX idx_relationships_source ON relationships(source_symbol_id);
CREATE INDEX idx_relationships_target ON relationships(target_symbol);
CREATE INDEX idx_relationships_file ON relationships(file_path);
CREATE INDEX idx_relationships_kind ON relationships(kind);
CREATE INDEX idx_files_module ON files(module);
CREATE INDEX idx_files_hash ON files(content_hash);
`

### 4.3 Query Patterns

| Operation | Query Strategy |
|-----------|---------------|
| Symbol search | FTS5 MATCH with porter stemming |
| Find callers | JOIN relationships → symbols → files WHERE kind='calls' |
| Find callees | JOIN relationships WHERE source_symbol_id=? |
| Dependency outgoing | relationships WHERE file_path=? AND kind IN ('imports',...) |
| Dependency incoming | relationships WHERE target_symbol LIKE ? |
| Complexity | Direct SELECT with grade computation |

---

## 5. Algorithm Details

### 5.1 BFS Graph Traversal (Call Graph)

`
function findCallers(symbol, maxDepth, limit):
    resolved = symbolResolver.resolve(symbol)
    if resolved is empty: return notFound(symbol)
    
    queue = [(resolved.name, depth=0)]
    visited = Set()
    results = []
    
    while queue not empty AND results.length < limit:
        (current, currentDepth) = queue.dequeue()
        if currentDepth >= maxDepth: continue
        
        callers = graphRepo.findCallers(current, kind='calls')
        for caller in callers:
            if caller.id in visited: continue
            visited.add(caller.id)
            
            item = buildCallGraphItem(caller, currentDepth + 1)
            if fileFilter and not matches(item.filePath, fileFilter): continue
            results.push(item)
            
            if currentDepth + 1 < maxDepth:
                queue.enqueue((caller.name, currentDepth + 1))
    
    return CallGraphResponse(symbol, resolved, results, metadata)
`

### 5.2 Impact Analysis Algorithm

`
function analyzeImpact(symbol, action, depth):
    resolved = resolver.resolve(symbol)
    impacts = []
    
    // Phase 1: Call graph callers
    callerResult = callGraph.findCallers(symbol, depth, limit=100)
    for caller in callerResult.results:
        severity = classifySeverity(caller.depthLevel, action, 'caller')
        impacts.push({caller, severity, reason: "Direct/Transitive caller"})
    
    // Phase 2: Interface implementors
    if resolved.kind == 'method' and parent.kind == 'interface':
        implementors = findImplementors(parent.name)
        for impl in implementors:
            impacts.push({impl, severity: 'critical', reason: "Implements interface"})
    
    // Phase 3: File-level dependents
    depResult = depGraph.query(resolved.file, 'incoming', depth=2)
    for dep in depResult:
        if dep not already in impacts:
            impacts.push({dep, severity: 'medium'/'high', reason: "Imports modified file"})
    
    // Phase 4: Affected tests
    tests = testDetector.findRelatedTests(resolved, impacts.map(i => i.file))
    
    // Phase 5: Deduplicate, sort, recommend
    deduped = deduplicate(impacts)
    sorted = sortBySeverity(deduped)
    recommendations = generateRecommendations(sorted, action)
    
    return ImpactResult(symbol, action, blastRadius, sorted, tests, recommendations)
`

### 5.3 Token Budget Enforcement (AI Context)

`
function assembleContext(symbol, intent, tokenBudget):
    strategy = getStrategy(intent)  // explain/modify/debug/test
    sections = strategy.getSections(symbol)
    priorities = strategy.getPriority()
    
    // Assemble all sections
    assembled = []
    totalTokens = 0
    for section in sections:
        content = renderSection(section)
        tokens = countTokens(content)
        assembled.push({section, content, tokens, priority: priorities[i]})
        totalTokens += tokens
    
    // Trim if over budget
    if totalTokens > tokenBudget:
        // Sort by priority (lowest priority = first to truncate)
        assembled.sortBy(priority, ascending)
        while totalTokens > tokenBudget and assembled.length > 1:
            removed = assembled.pop()  // Remove lowest priority
            totalTokens -= removed.tokens
    
    return formatResponse(assembled, metadata={usedTokens: totalTokens, budget: tokenBudget})
`

---

## 6. Error Handling

| Error | Detection | Response | Recovery |
|-------|-----------|----------|----------|
| Grammar not available | GrammarRegistry returns null | Use regex fallback | Degraded but functional |
| File too large (>1MB) | stat.size check | Skip Tree-sitter, regex only | Limited symbols extracted |
| Symbol not resolved | SymbolResolver returns empty | Return suggestions | Agent retries with better name |
| DB locked (concurrent write) | SQLite BUSY error | Retry once (100ms) | Second attempt usually succeeds |
| BFS explosion | results >= limit | Truncate, set metadata.truncated | Agent can narrow filter |
| Parse error (AST) | Tree-sitter error nodes | Log error, store partial | Partial symbols better than none |
| File deleted during parse | ENOENT | Skip file, remove from index | Next scan picks up correctly |

---

## 7. Security Design

| Concern | Mitigation |
|---------|------------|
| Path traversal | FileResolver validates paths within workspace |
| SQL injection | All queries use parameterized statements |
| Large query DoS | Depth limit (max 5), result limit, timeout |
| Sensitive file content | code_context reads files but only returns requested range |
| WASM execution | Tree-sitter runs in Node.js sandbox, no arbitrary code |

---

## 8. Performance Design

### 8.1 Indexing Performance

- **Incremental**: Content hash comparison skips unchanged files
- **Batch transactions**: SQLite transaction per file (not per symbol)
- **Lazy grammar loading**: WASM grammars loaded on first use per language
- **WAL mode**: Concurrent reads during background indexing

### 8.2 Query Performance

- **FTS5 index**: Full-text search in O(log n) with ranking
- **B-tree indexes**: On all foreign keys and filter columns
- **BFS with limits**: Results capped, depth capped → bounded execution
- **Prepared statements**: Re-used for repeated query patterns

### 8.3 Token Efficiency

- **Progressive disclosure**: Summary first, detail on demand
- **Budget enforcement**: Hard cap on token output
- **Section prioritization**: Most relevant content kept, least relevant truncated

---

## 9. Implementation Checklist

| # | Component | Files | Priority |
|---|-----------|-------|----------|
| 1 | CodeIntelModule | modules/code-intel/CodeIntelModule.ts | P0 |
| 2 | IndexingEngine | engine/indexer/indexing-engine.ts | P0 |
| 3 | TreeSitterIndexer | engine/parsers/tree-sitter-indexer.ts | P0 |
| 4 | GrammarRegistry | engine/parsers/grammar-registry.ts | P0 |
| 5 | Language Parsers (TS) | engine/parsers/languages/typescript-parser.ts | P0 |
| 6 | Language Parsers (Others) | engine/parsers/languages/*.ts | P1 |
| 7 | SymbolResolver | engine/graph/symbol-resolver.ts | P0 |
| 8 | CallGraphService | engine/graph/call-graph-service.ts | P0 |
| 9 | DependencyGraphService | engine/graph/dependency-graph-service.ts | P0 |
| 10 | ImpactAnalysisService | engine/graph/impact-analysis-service.ts | P0 |
| 11 | FileWatcher | engine/indexer/file-watcher.ts | P0 |
| 12 | ComplexityAnalyzer | engine/analyzers/complexity/ | P1 |
| 13 | EntryPointDetector | engine/analyzers/entry-points/ | P1 |
| 14 | GraphAnalysis tools | engine/analyzers/graph-analysis/ | P1 |
| 15 | AI Context tools | engine/tools/ai-context-tools.ts | P0 |
| 16 | Tool Registration | engine/tools/register-tools.ts | P0 |
| 17 | Database Schema | engine/database/migrations/ | P0 |
| 18 | TestDetector | engine/graph/test-detector.ts | P1 |

---

## 10. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
