# SA4E — System Architecture Document

**Project:** SDLC-Agents-4-Enterprise (SA4E)
**Version:** 1.14.0
**Date:** 2026-07-22
**Authors:** BA + SA + TA (AI-assisted)

---

## 1. Executive Summary

SA4E là một hệ thống multi-agent SDLC pipeline cho enterprise, tự động hóa toàn bộ vòng đời phát triển phần mềm từ Requirements → Design → Implementation → Testing → Deployment. Hệ thống bao gồm 9 AI agents chuyên biệt (SM, BA, TA, SA, QA, DEV, DevOps, Security, UI) phối hợp qua MCP (Model Context Protocol), chia sẻ kiến thức qua Knowledge Base với vector embeddings.

---

## 2. System Context

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Developer Workstation                          │
│                                                                      │
│  ┌─────────────┐     ┌──────────────────────────────────────────┐   │
│  │   IDE        │     │        SA4E Extension (Thin Client)      │   │
│  │ (Kiro/VSCode)│◄───►│  LangGraph Engine + RemoteBackendClient  │   │
│  └─────────────┘     └────────────────┬─────────────────────────┘   │
│                                        │ MCP StreamableHTTP          │
│                                        ▼                             │
│                       ┌────────────────────────────────────┐         │
│                       │      Backend MCP Server :48721     │         │
│                       │   Hono HTTP + Module Registry      │         │
│                       └──────────────┬─────────────────────┘         │
│                                      │                               │
│              ┌───────────────────────┼───────────────────────┐       │
│              │                       │                       │       │
│              ▼                       ▼                       ▼       │
│     ┌─────────────┐       ┌──────────────┐       ┌──────────────┐   │
│     │  Memory     │       │  CodeIntel   │       │ Orchestration│   │
│     │  Module     │       │  Module      │       │  Module      │   │
│     │ (KB Store)  │       │ (AST/Index)  │       │ (MCP Proxy)  │   │
│     └──────┬──────┘       └──────┬───────┘       └──────┬───────┘   │
│            │                     │                       │           │
│            ▼                     ▼                       ▼           │
│     ┌─────────────┐       ┌──────────────┐       ┌──────────────┐   │
│     │  SQLite DB  │       │  Tree-sitter │       │ Child MCP    │   │
│     │  + Vectors  │       │  + ONNX      │       │ Servers      │   │
│     └─────────────┘       └──────────────┘       │ (Atlassian)  │   │
│                                                   └──────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (External)
                    ┌───────────────────────────────┐
                    │   Jira / Confluence Cloud     │
                    │   (via Atlassian MCP Server)  │
                    └───────────────────────────────┘
```

---

## 3. Component Architecture

### 3.1 Backend (Node.js MCP Server)

| Aspect | Detail |
|--------|--------|
| Runtime | Node.js >= 18.14 |
| Framework | Hono (HTTP) + @modelcontextprotocol/sdk (MCP) |
| Port | 48721 (default) |
| Database | Multi-engine: SQLite (primary) + PostgreSQL + MySQL |
| Embeddings | ONNX Runtime (all-MiniLM-L6-v2, local inference, 384-dim) |
| AST Parsing | web-tree-sitter (multi-language) |
| Logging | Pino (structured JSON) |

### 3.2 Extension (VS Code/Kiro Thin Client)

| Aspect | Detail |
|--------|--------|
| Type | VS Code Extension |
| Framework | VS Code API + Webviews |
| AI Pipeline | @langchain/langgraph (state machine) |
| LLM Support | Anthropic, OpenAI, Ollama, LM Studio, OpenRouter, ONNX, Kiro |
| Local MCP | Wrapper server on port 9181 |
| Auth | SSO/PKCE (configurable) |

### 3.3 Orchestration Layer

| Aspect | Detail |
|--------|--------|
| Config | `.code-intel/orchestration.json` |
| Transport | httpStream, SSE, stdio |
| Child Servers | Atlassian (Jira/Confluence) on port 3086 |
| Discovery | Semantic tool search via ONNX embeddings |

---

## 4. Module Architecture (Backend)

```
┌─────────────────────────────────────────────────────────┐
│                    ModuleRegistry                         │
│              (Observer: EventBus lifecycle)               │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────┐  │
│  │  Memory    │  │  CodeIntel │  │  Orchestration   │  │
│  │  Module    │  │  Module    │  │  Module          │  │
│  │            │  │            │  │                  │  │
│  │ • mem_*    │  │ • code_*   │  │ • find_tools     │  │
│  │ • KB CRUD  │  │ • AST      │  │ • execute_dynamic│  │
│  │ • Search   │  │ • Graph    │  │ • toggle_tool    │  │
│  │ • Vectors  │  │ • Index    │  │ • MCP Proxy      │  │
│  └────────────┘  └────────────┘  └──────────────────┘  │
│                                                          │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────┐  │
│  │ Analytics  │  │  KB-Graph  │  │  Web/Viewer      │  │
│  │ Module     │  │  Module    │  │  Module          │  │
│  └────────────┘  └────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Module Lifecycle:**
1. `ModuleFactory.createAndRegisterAll()` — tạo modules
2. `ModuleRegistry.initializeAll()` — parallel init
3. `EventBus.emit(ALL_MODULES_READY)` — trigger tool ingestion
4. Hot-swap support: `registry.reinitializeModule(name)` for live DB switching

---

## 5. Data Architecture

### 5.1 Three Graph Layers

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│  Layer 1: Knowledge Graph (Semantic KB)                    │
│  ┌─────────────────┐        ┌────────────────────────┐    │
│  │knowledge_entries│───────►│knowledge_graph_edges   │    │
│  │ (nodes)         │◄───────│ (RELATES_TO, SUPERSEDES│    │
│  └─────────────────┘        │  DERIVED_FROM, etc.)   │    │
│                              └────────────────────────┘    │
│                                                            │
│  Layer 2: Visualization Graph (Admin UI 3D)                │
│  ┌─────────────────┐        ┌────────────────────────┐    │
│  │  graph_nodes    │───────►│    graph_edges         │    │
│  │ (KB + Code,     │        │ (weight, rel_type)     │    │
│  │  x/y/z coords)  │        └────────────────────────┘    │
│  └─────────────────┘                                       │
│         ▲                                                  │
│         │ GraphSyncService.syncProjectSymbols()            │
│                                                            │
│  Layer 3: Code Intelligence Graph (Static Analysis)        │
│  ┌─────────────────┐        ┌────────────────────────┐    │
│  │    symbols      │───────►│   relationships        │    │
│  │ (functions,     │        │ (calls, imports,       │    │
│  │  classes, etc.) │        │  inherits, implements) │    │
│  └─────────────────┘        └────────────────────────┘    │
│         │                                                  │
│         ├──► code_call_graph (caller → callee)             │
│         ├──► code_dependencies (file → file)               │
│         └──► body_embeddings (semantic similarity)         │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 5.2 Database Strategy

| Engine | Use Case | Adapter |
|--------|----------|---------|
| SQLite | Development, single-user, embedded | `SqliteDbAdapter` (sync + async) |
| PostgreSQL | Production, multi-user, scalable | `PostgresAdapter` (async only) |
| MySQL | Legacy support | `MysqlAdapter` (async only) |

**Interface Segregation (ISP):**
- `DatabaseConnectionAdapter` — lifecycle (connect/disconnect)
- `SyncDatabaseAdapter` — SQLite-only sync ops
- `QueryDatabaseAdapter` — cross-engine async ops
- `MetadataDatabaseAdapter` — schema inspection
- `DatabaseAdapter` — composite (all 4)

---

## 6. Agent Architecture

### 6.1 Agent Roster

| Agent | Role | Phases | Key Outputs |
|-------|------|--------|-------------|
| SM | Scrum Master / Orchestrator | All | STATUS.json, RUN-LOG.md, Jira transitions |
| BA | Business Analyst | 1, 2, 3.5, 5.5 | BRD.md, FSD.md (draft), Glossary |
| TA | Technical Analyst | 2 | FSD.md (enrichment: API contracts, pseudocode) |
| SA | Solution Architect | 3, 3.5 | TDD.md, DISCREPANCY.md, Architecture diagrams |
| QA | Quality Assurance | 4, 5.5, 6 | STP.md, STC.md, TEST-REPORT.md |
| DEV | Developer | 5, 5.5 | Source code, UG.md |
| DevOps | DevOps Engineer | 4.5, 7 | CI/CD configs, DPG.md, RLN.md |
| Security | Security Engineer | 3.7, 5.7, 6.3, 6.7 | SECURITY-REVIEW/ASSESSMENT/PENTEST.md |
| UI | UI/UX Designer | 2.5 | Wireframes, UI specs (draw.io) |

### 6.2 SDLC Pipeline Flow

```
Phase 1 ─► Phase 2 ─► Phase 2.5 ─► Phase 3 ─► Phase 3.5 ─► Phase 3.7
 (BRD)      (FSD)      (UI)         (TDD)    (Feedback)   (Security)
                                                              │
Phase 7 ◄─ Phase 6.7 ◄─ Phase 6.5 ◄─ Phase 6.3 ◄─ Phase 6 ◄┤
(Deploy)  (Sec Deploy) (UAT)        (Pentest)     (Test)     │
                                                              │
                                    Phase 5.7 ◄─ Phase 5.5 ◄─┤
                                   (Sec Code)    (UG)         │
                                                              │
                              Phase 5 ◄─ Phase 4.5 ◄─ Phase 4
                             (Implement)  (CI/CD)    (Test Plan)
```

### 6.3 LangGraph Pipeline (Extension)

```
Router Graph (entry)
  ├── classify_intent (LLM)
  │
  ├── sdlc_subgraph       → Full 7-phase pipeline
  ├── hotfix_subgraph     → Fast-track bug fix
  ├── code_review_subgraph → PR review
  ├── docs_subgraph       → Doc generation only
  ├── security_audit_subgraph → Security scan
  └── chat_subgraph       → Free-form LLM chat

Each subgraph: lazy-loaded, checkpointed, resumable.
```

---

## 7. Communication Patterns

### 7.1 Tool Discovery (Critical Flow)

```
Agent ──► find_tools(query, threshold, top_k)
              │
              ▼
Backend: ONNX embedding → cosine similarity vs mcp_tools table
              │
              ▼
Agent ◄── ranked tool list with inputSchema
              │
              ▼
Agent ──► execute_dynamic_tool(toolName, arguments)
              │
              ▼
Backend: OrchestrationModule routes to correct handler
   ├── Local tool → ModuleRegistry handler
   └── Proxied tool → McpClientManager → Child MCP Server
```

### 7.2 Extension ↔ Backend

```
IDE ──► Extension ──► RemoteBackendClient ──► Backend :48721
                      (MCP StreamableHTTP)
                      
Extension also exposes local MCP wrapper :9181
for IDE native MCP integration.
```

### 7.3 EventBus (Internal Backend)

| Event | Trigger | Subscribers |
|-------|---------|-------------|
| MODULE_REGISTERED | Module added to registry | Logger |
| MODULE_READY | Module init success | Factory |
| ALL_MODULES_READY | All modules initialized | Tool ingestion |
| TOOLS_INGESTED | Tools stored with embeddings | Orchestration wiring |

---

## 8. Security Architecture

### 8.1 Authentication & Authorization

| Layer | Mechanism |
|-------|-----------|
| Extension ↔ Backend | JWT tokens (configurable) |
| Backend Admin API | API Key + Rate limiting |
| Extension ↔ External | SSO/PKCE (OAuth2) |
| Inter-module | Trust (same process) |

### 8.2 Middleware Stack (Backend)

```
Request → securityHeaders → bodyLimit(100MB) → requestLogger
       → rateLimiter (admin routes) → jwtAuth / apiKeyAuth
       → route handler → errorHandler → Response
```

### 8.3 RBAC Model

| Group | Permissions |
|-------|-------------|
| Administrators | Full access |
| Developers | Read/write code, KB |
| Viewers | Read-only |
| MCP Operators | Tool execution only |

---

## 9. Deployment Architecture

### 9.1 Development Mode

```
Developer machine:
  └── npm run dev (tsx watch)
      ├── Backend :48721 (SQLite, local)
      ├── Extension (VS Code dev host)
      └── Atlassian MCP :3086 (optional)
```

### 9.2 Production Mode

```
Server:
  └── node dist/index.js
      ├── Backend :48721 (PostgreSQL)
      ├── Admin UI (served from dist/viewer/)
      └── Child MCP Servers (configured via orchestration.json)

Client:
  └── VS Code + Extension (.vsix)
      └── Connects to remote backend URL
```

### 9.3 CI/CD

| Workflow | Purpose |
|----------|---------|
| ci.yml | Build + test on PR |
| auto-release.yml | Tag-based release |
| publish.yml | Publish to npm / VS Code marketplace |
| build-native.yml | Native ONNX runtime builds |
| build-onnxruntime.yml | Cross-platform ONNX binaries |

---

## 10. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| SQLite as primary DB | Zero-config for devs, embedded, fast for single-user |
| ONNX local embeddings | No external API calls, privacy, offline-capable |
| Multi-engine DB strategy | Scale to PostgreSQL when team/enterprise needs arise |
| MCP protocol | Standard agent-tool communication, extensible |
| LangGraph state machine | Resumable pipelines, checkpointing, subgraph isolation |
| Hono over Express | Lightweight, fast, Web Standards compatible |
| EventBus decoupling | Modules don't need to know about each other |
| 2-step tool discovery | Semantic search + dynamic routing = flexible |

---

## 11. Technology Stack Summary

| Layer | Technology |
|-------|-----------|
| HTTP Server | Hono + @hono/node-server |
| MCP Protocol | @modelcontextprotocol/sdk |
| AI Pipeline | @langchain/langgraph |
| LLM Provider | Anthropic SDK (primary) |
| Database | better-sqlite3 + pg + mysql2 |
| Vector Embeddings | ONNX Runtime + Transformers.js |
| Code Parsing | web-tree-sitter |
| File Watching | chokidar |
| Validation | Zod |
| Logging | Pino |
| Testing | Vitest + Playwright |
| Build | tsc (backend) + esbuild (extension) |
| Package Manager | npm |

---

## Appendix A: Configuration Files

| File | Purpose |
|------|---------|
| `.code-intel/orchestration.json` | Child MCP server connections |
| `.kiro/agents/*.md` | Agent system prompts |
| `.kiro/steering/*.md` | Pipeline behavior rules |
| `.kiro/hooks/` | Pre/post tool use hooks |
| `jira.conf` | Project prefix for SM |
| `backend/src/config/index.ts` | Backend runtime config (env-based) |

## Appendix B: Port Map

| Port | Service |
|------|---------|
| 48721 | Backend MCP Server (HTTP + MCP) |
| 9181 | Extension local MCP wrapper |
| 3086 | Atlassian MCP Server |
