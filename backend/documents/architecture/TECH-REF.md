# SA4E — Technical Reference Document

**Project:** SDLC-Agents-4-Enterprise (SA4E)
**Version:** 1.14.0
**Date:** 2026-07-22
**Authors:** BA + SA + TA (AI-assisted)

---

## 1. Database Schema Reference

### 1.1 Admin / Authentication & RBAC

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | User accounts | user_id, username, email, password_hash, status, access_group_id |
| `access_groups` | Role groups (Admin, Dev, Viewer, MCP Operator) | access_group_id, access_group_name, is_system_group |
| `group_permissions` | Permission-to-group mapping | access_group_id, permission_id, role_data |
| `sessions` | Active login sessions | session_id, user_id, token, device, ip_address, expires_at |
| `audit_log` | User action audit trail | audit_id, user_id, action, resource, resource_id, timestamp |
| `config_changes` | Configuration change history | section, key, old_value, new_value, changed_by, requires_restart |

### 1.2 Knowledge Base (Memory Module)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `knowledge_entries` | Core KB entries (nodes) | id, content, summary, type, tier (WORKING/REFERENCE/ARCHIVAL), scope (USER/PROJECT/SHARED), confidence, quality_score, pinned |
| `knowledge_vectors` | Vector embeddings for semantic search | entry_id, vector (BLOB, 384-dim), model (MiniLM) |
| `knowledge_graph_edges` | Semantic relationships between KB entries | source_id, target_id, relation, weight |
| `consolidation_log` | Tier promotion/demotion audit | entry_id, from_tier, to_tier, reason |
| `memory_sessions` | Agent session tracking | session_id, agent_name, status, observation_count |
| `memory_audit` | All KB operations logged | operation, entry_id, session_id, agent_name, details |
| `conversation_turns` | Chat turn history per session | session_id, turn_number, role, content, tool_calls |
| `quality_scores` | Entry quality scoring | entry_id, total_score, dimensions (JSON) |
| `citations` | Citation tracking | entry_id, cited_by, context |
| `search_log` | KB search query logging | query, result_count |
| `kb_shared_grants` | Project-level shared KB access | project_id, granted_by |
| `kb_promotion_queue` | Promotion pipeline queue | entry_id, source_tier, target_tier, score, status, review_comment |
| `entry_outcomes` | Outcome feedback for Bayesian scoring | entry_id, outcome (success/fail/partial), agent_name |
| `decay_config` | Temporal decay configuration | key, value |
| `pending_tasks` | Async task queue (embeddings, promotions) | task_type, entry_id, status, payload, retry_count |

### 1.3 Code Intelligence Engine

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `files` | Indexed source files (multi-tenant) | project_id, path, relative_path, language, module, content_hash, size_bytes, line_count |
| `symbols` | Extracted code symbols | project_id, file_id, name, kind, signature, start_line, end_line, visibility, doc_comment |
| `modules` | Module groupings with metadata | project_id, name, root_path, di_style, error_handling, naming_convention |
| `embeddings` | Symbol/file vector embeddings | project_id, symbol_id, file_id, vector (BLOB), model |
| `relationships` | Symbol-to-symbol relationships | source_symbol_id, target_symbol, kind (calls/imports/inherits/implements/uses/decorates) |
| `file_index` | File indexing state | path, mtime, content_hash, symbol_count |
| `graph_meta` | Graph metadata KV store | key (schema_version, total_nodes, total_edges, last_checkpoint), value |
| `body_embeddings` | Function body embeddings (chunked) | symbol_id, chunk_index, embedding (BLOB), token_count |
| `complexity` | Cyclomatic complexity metrics | symbol_id, cyclomatic_complexity, branches, loops, nesting_depth, grade (A-F) |
| `entry_points` | Detected API entry points | symbol_id, entry_type, framework, http_method, route_path, has_auth |
| `git_commits` | Git commit history | project_id, hash, author, date, message, files_changed, insertions, deletions |
| `git_index_meta` | Git indexing state | project_id, key, value |

### 1.4 PostgreSQL Code Intelligence (Migrations)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `_migrations` | Migration tracking | name, applied_at |
| `code_files` | PG equivalent of `files` | file_path, language, content_hash, file_size, indexed_at |
| `code_symbols` | PG equivalent of `symbols` | file_id, name, kind, start_line, end_line, signature, exported |
| `code_imports` | Import tracking per file | file_id, source, specifiers (JSONB), is_type_only |
| `code_dependencies` | File-to-file dependency graph | source_file_id, target_file_id, target_path, dependency_type |
| `code_call_graph` | Call graph edges | caller_symbol_id, callee_symbol_id, call_site_line |

### 1.5 Visualization Graph (Admin UI)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `graph_nodes` | 3D graph visualization nodes (KB + Code unified) | entry_id, label, type, tier, project_id, x, y, z, level, cluster_id |
| `graph_edges` | Graph visualization edges | source, target, weight, rel_type |

### 1.6 MCP Tools & Usage

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `mcp_tools` | Registered MCP tools with schemas | name, description, schema_json, category, server, vector (BLOB) |
| `tool_usage` | Per-tool call counters | tool_name, call_count, last_called_at |

### 1.7 Admin Analytics

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `query_logs` | KB search performance logging | query, timestamp, response_time_ms, result_count, user_id |
| `project_registry` | Workspace-to-projectId mapping | project_id, workspace_path |

---

## 2. API Reference (Backend HTTP Routes)

### 2.1 Route Map

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/health` | GET | Health check + module status | None |
| `/mcp` | ALL | MCP StreamableHTTP transport | API Key |
| `/api/tools/call` | POST | Direct tool invocation | API Key |
| `/api/tools/list` | GET | List all tools | API Key |
| `/api/v1/entries` | GET/POST | KB entries CRUD | JWT |
| `/api/v1/search` | POST | KB hybrid search | JWT |
| `/api/v1/stats` | GET | KB statistics | JWT |
| `/api/admin/auth/login` | POST | User login | Rate limited |
| `/api/admin/auth/logout` | POST | User logout | JWT |
| `/api/admin/users` | CRUD | User management | Admin JWT |
| `/api/admin/groups` | CRUD | Access group management | Admin JWT |
| `/api/admin/audit` | GET | Audit log query | Admin JWT |
| `/api/admin/config` | GET/PUT | System configuration | Admin JWT |
| `/api/admin/dashboard` | GET | Dashboard statistics | Admin JWT |
| `/api/admin/graph` | CRUD | Graph node/edge management | Admin JWT |
| `/api/mcp-servers` | CRUD | MCP server config management | Admin JWT |
| `/api/index/*` | POST | Trigger indexing operations | JWT |
| `/api/tags/*` | GET/PUT | KB tag management | API Key |

### 2.2 MCP Tools (Core)

| Tool | Module | Purpose |
|------|--------|---------|
| `mem_search` | Memory | Hybrid search (BM25 + vector + graph) |
| `mem_ingest` | Memory | Store entry with auto-embedding |
| `mem_ingest_file` | Memory | Zero-context file ingestion |
| `mem_pin` | Memory | Pin entries for auto-recall |
| `mem_map` | Memory | Structured key-value store |
| `mem_tag` | Memory | Bulk tag management |
| `mem_promote` | Memory | Scope promotion (USER→PROJECT→SHARED) |
| `code_search` | CodeIntel | Code symbol search |
| `code_modules` | CodeIntel | Module listing |
| `code_symbols` | CodeIntel | Symbol listing per file |
| `code_traverse` | CodeIntel | Call graph traversal |
| `find_tools` | Orchestration | Semantic tool discovery |
| `execute_dynamic_tool` | Orchestration | Proxy tool execution |
| `toggle_tool` | Orchestration | Enable/disable tools |

---

## 3. Module Details

### 3.1 Memory Module

**Responsibility:** KB storage with tiered memory, hybrid search, vector embeddings.

**KB Entry Tiers:**
| Tier | Purpose | Retention |
|------|---------|-----------|
| WORKING | Short-term, session-specific | Auto-decay after inactivity |
| REFERENCE | Medium-term, frequently accessed | Promoted from WORKING |
| ARCHIVAL | Long-term, historical record | Rarely accessed, never auto-deleted |

**KB Scopes:**
| Scope | Visibility | Promotion Path |
|-------|-----------|----------------|
| USER | Only the owning user | USER → PROJECT → SHARED |
| PROJECT | All users in same project | Requires review/approval |
| SHARED | All users across projects | Company-wide knowledge |

**Search Algorithm (Hybrid):**
1. BM25 full-text search (FTS5 porter tokenizer)
2. Vector cosine similarity (ONNX embeddings, 384-dim)
3. Graph neighbor expansion (knowledge_graph_edges)
4. RRF (Reciprocal Rank Fusion) merging
5. Progressive disclosure (summary then full content)

### 3.2 CodeIntel Module

**Responsibility:** AST parsing, symbol extraction, call graph, impact analysis.

**Indexing Pipeline:**
```
File change (chokidar) → Parse AST (tree-sitter) → Extract symbols
  → Build relationships → Generate embeddings → Update graph
```

**Supported Languages:** TypeScript, JavaScript, Kotlin, Python, Java, Go, Rust, C#

**Analyzers:**
| Analyzer | Output Table | Metrics |
|----------|-------------|---------|
| Complexity | `complexity` | Cyclomatic, branches, loops, nesting, grade |
| Entry Points | `entry_points` | HTTP routes, event handlers, auth detection |
| Git Mining | `git_commits` | Commit history, co-change patterns |
| Similarity | `body_embeddings` | Function semantic similarity |

### 3.3 Orchestration Module

**Responsibility:** Child MCP server management, semantic tool discovery, dynamic execution.

**McpClientManager Flow:**
```
orchestration.json → Connect to child servers → Fetch tools/list
  → Build toolsToServer mapping → Ready for execute_dynamic_tool
```

**Tool Search (find_tools):**
1. Generate query embedding (ONNX)
2. Cosine similarity against mcp_tools.vector
3. Filter by threshold (default 0.3)
4. Return top_k results with schemas

---

## 4. Design Patterns Used

| Pattern | Where | Purpose |
|---------|-------|---------|
| **Strategy** | DatabaseAdapter | Multi-engine DB support (SQLite/PG/MySQL) |
| **Observer** | EventBus | Module lifecycle decoupling |
| **Facade** | DatabaseManager | Simplified repository access |
| **Factory** | ModuleFactory | Module creation + wiring |
| **ISP** | DatabaseAdapter interfaces | 4 focused interfaces instead of 1 god interface |
| **DIP** | HttpServer, ToolRouter | Inject dependencies for testability |
| **Plugin** | ModuleRegistry | Modules register independently |
| **Repository** | GraphRepository, UserRepository, etc. | Data access encapsulation |

---

## 5. Multi-Tenancy Architecture

**Isolation Model:** Row-level via `project_id` column.

**Scoped Tables:**
- `files` — UNIQUE(project_id, path)
- `symbols` — indexed by project_id
- `modules` — UNIQUE(project_id, name)
- `embeddings` — scoped to project
- `graph_nodes` — project_id for code nodes
- `git_commits` — PRIMARY KEY(project_id, hash)
- `knowledge_entries` — project_id for PROJECT scope

**Project Registration:**
- `project_registry` table maps workspace path to projectId
- Each workspace gets an auto-generated UUID on first connect
- All queries include project_id filter for isolation

---

## 6. Data Flow Diagrams

### 6.1 KB Ingest Flow

```
Agent calls mem_ingest(content, type, tags, scope)
  |
  +-> Generate summary (first 200 chars or LLM summary)
  +-> Generate embedding (ONNX, 384-dim vector)
  +-> INSERT INTO knowledge_entries
  +-> INSERT INTO knowledge_vectors
  +-> Auto-link: find similar entries, CREATE edges in knowledge_graph_edges
  +-> Update graph_nodes (if tier = SHARED)
  +-> Return entry_id
```

### 6.2 Code Indexing Flow

```
File saved -> chokidar detects change
  |
  +-> Check content_hash, skip if unchanged
  +-> Parse with tree-sitter, extract symbols
  +-> INSERT/UPDATE files table
  +-> INSERT/UPDATE symbols table
  +-> Analyze: complexity, entry_points
  +-> Build relationships (imports, calls, inherits)
  +-> Generate body_embeddings for functions
  +-> GraphSyncService: project symbols into graph_nodes
  +-> Update file_index
```

### 6.3 Tool Discovery + Execution Flow

```
Agent: find_tools("jira issue", threshold=0.3, top_k=5)
  |
  +-> Backend: embed query, cosine search mcp_tools
  +-> Return: [{name, description, inputSchema}, ...]
  |
Agent: execute_dynamic_tool("jira_get_issue", {issue_key: "SA4E-50"})
  |
  +-> OrchestrationModule: lookup toolsToServer map
  +-> Found on "atlassian" server, proxy to McpClientManager
  +-> McpClientManager: forward to child MCP server :3086
  +-> Child server executes, returns result
  +-> Return result to agent
```

---

## 7. Extension Architecture (LangGraph)

### 7.1 Pipeline State Channels

| Channel | Type | Purpose |
|---------|------|---------|
| ticketKey | string | Current Jira ticket |
| currentPhase | string | Active SDLC phase |
| intent | string | Classified intent (sdlc/hotfix/review/etc.) |
| pipelineStatus | string | Pipeline execution status |
| documents | object | Generated documents map |
| agentOutputs | object | Agent results per phase |
| chatHistory | array | Conversation history |
| approvalRequired | boolean | Waiting for user decision |
| feedbackIterations | number | BA-SA feedback loop counter |
| discrepancyFound | boolean | Phase 3.5 trigger |
| verifyPassed | boolean | Quality gate result |
| verifyAttempts | number | Retry counter |
| activeStrategy | string | Primary or alternate strategy |

### 7.2 BaseNode Capabilities

Every agent node inherits:
- Timeout protection: 300s per node, 60s per tool call
- Retry: Exponential backoff, max 2 retries
- LLM invocation: Streaming + non-streaming
- MCP tool calls: Via McpBridge to backend
- Workspace ops: Read/write files, export DOCX/PNG
- Jira helpers: Get issue, search, transition
- KB ops: Search, ingest, ingest_file
- Hook integration: Pre/post tool use events

---

## 8. Configuration Reference

### 8.1 Environment Variables (Backend)

| Variable | Default | Purpose |
|----------|---------|---------|
| PORT | 48721 | HTTP server port |
| HOST | 127.0.0.1 | Bind address |
| LOG_LEVEL | info | Pino log level |
| CODE_INTEL_WORKSPACE | cwd() | Workspace root path |
| CODE_INTEL_DATA_DIR | .code-intel | Data directory |
| DATABASE_URL | (none) | PostgreSQL connection string |
| JWT_SECRET | (generated) | JWT signing secret |
| API_KEY | (none) | API key for tool routes |
| ONNX_MODEL_PATH | bundled | Custom ONNX model path |

### 8.2 Extension Settings

| Setting | Default | Purpose |
|---------|---------|---------|
| kiroSdlc.backend.url | http://127.0.0.1:48721 | Backend URL |
| kiroSdlc.mcpServerPort | 9181 | Local MCP wrapper port |
| kiroSdlc.llmProvider | anthropic | Active LLM provider |
| kiroSdlc.backend.ssoEnabled | false | Enable SSO auth |
| kiroSdlc.backend.toolCallTimeout | 300000 | Tool timeout (ms) |

---

## 9. Build and Test Commands

### Backend
```
npm run build        - tsc to dist/
npm run dev          - tsx watch (hot reload)
npm run test         - vitest run
npm run test:unit    - unit tests
npm run test:integration - integration tests
npm run test:e2e-api - API E2E (vitest)
npm run test:e2e-ui  - Playwright UI tests
```

### Extension
```
npm run esbuild           - development build
npm run esbuild-production - production build
npm run package:prod      - .vsix package
npm run test              - vitest unit
npm run test:e2e          - E2E tests
```

### PostgreSQL Migrations
```
DATABASE_URL=postgres://... npx tsx scripts/run-migrations.ts
```

---

## 10. Glossary

| Term | Definition |
|------|-----------|
| MCP | Model Context Protocol, agent-tool communication standard |
| KB | Knowledge Base, tiered memory system |
| RRF | Reciprocal Rank Fusion, search merging algorithm |
| FTS5 | SQLite Full-Text Search 5, BM25 text search |
| AST | Abstract Syntax Tree, parsed code structure |
| ONNX | Open Neural Network Exchange, local inference |
| ISP | Interface Segregation Principle |
| DIP | Dependency Inversion Principle |
| StreamableHTTP | MCP transport over HTTP with streaming |
| Tier | KB lifecycle (WORKING/REFERENCE/ARCHIVAL) |
| Scope | KB visibility (USER/PROJECT/SHARED) |
| GraphSyncService | Projects code symbols into viz graph |
