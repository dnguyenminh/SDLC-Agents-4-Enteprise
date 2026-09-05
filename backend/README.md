# Code Intelligence Backend

<p align="center">
  <strong>Standalone MCP HTTP server — the brain behind Kiro SDLC Agents extension.</strong><br>
  Code intelligence, Knowledge Base, orchestration, and 60+ MCP tools.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.41.0-blue?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/tools-66+-teal?style=for-the-badge" alt="Tools">
  <img src="https://img.shields.io/badge/node-%3E%3D18-green?style=for-the-badge" alt="Node">
</p>

---

## What Is This?

This is the **backend server** that powers the [Kiro SDLC Agents extension](../kiro-sdlc-agents/). The extension is a thin client — all heavy lifting (KB storage, code indexing, embeddings, tool execution) happens here.

**You must run this server before using the extension.**

---

## Quick Start

```bash
# 1. Install dependencies
npm ci

# 2. Build
npm run build

# 3. Start server
npm start
```

Server starts at **http://localhost:48721**. Verify it's running:

```bash
curl http://localhost:48721/health
# → {"status":"healthy","version":"1.41.0","uptime":5,"tools_loaded":52}
```

### Development Mode (auto-reload)

```bash
npm run dev
```

---

## Configuration

All configuration via environment variables. Every variable is optional with sensible defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `CODE_INTEL_PORT` | `48721` | HTTP server port |
| `CODE_INTEL_HOST` | `0.0.0.0` | Bind address (default all interfaces) |
| `CODE_INTEL_DATA_DIR` | `.code-intel` | Data directory for DB and models |
| `CODE_INTEL_DB` | `index.db` | SQLite database filename |
| `CODE_INTEL_ONNX_MODEL` | `models/model.onnx` | ONNX embedding model path |
| `CODE_INTEL_ORCHESTRATION` | `orchestration.json` | Child MCP servers config |
| `CODE_INTEL_LOG_LEVEL` | `info` | Log level: debug, info, warn, error |

Example with custom port:

```bash
CODE_INTEL_PORT=9000 npm start
```

---

## Connecting the Extension

After starting the server:

1. Open Kiro/VS Code with the extension installed
2. Command Palette → "Kiro SDLC: Settings"
3. Go to "Server Settings" tab
4. Set Backend URL to `http://localhost:48721`
5. Click "Test Connection" — should show ✅ Connected

The extension's default URL is already `http://localhost:48721`, so if you run with defaults it connects automatically.

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server health + uptime + tool count |
| `/mcp/tools/list` | GET | List all registered MCP tools with schemas |
| `/mcp/tools/call` | POST | Execute an MCP tool |
| `/api/dashboard` | GET | KB dashboard data (health score, metrics) |
| `/api/graph` | GET | Knowledge graph nodes and edges |
| `/api/tags` | GET | Tag taxonomy and entry counts |
| `/api/quality` | GET | Quality score distribution |
| `/api/analytics` | GET | Search analytics and trends |
| `/api/index/source` | POST | Upload source files for indexing |
| `/api/index/document` | POST | Upload document for KB ingestion |

### Tool Call Example

```bash
curl -X POST http://localhost:48721/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{"tool_name": "mem_search", "arguments": {"query": "authentication flow"}}'
```

---

## Modules & Tools

| Module | Tool Count | Key Tools |
|--------|-----------|-----------|
| **Memory** | 17 | `mem_search`, `mem_ingest`, `mem_ingest_file`, `mem_graph`, `mem_consolidate`, `mem_promote` |
| **Masking** | 3 | Read-time PII/credential/business logic redaction with role-based access control |
| **Code Intel** | 15 | `code_search`, `code_symbols`, `code_callers`, `code_impact`, `code_dependencies` |
| **Orchestration** | 6 | `find_tools`, `execute_dynamic_tool`, `orchestration_status`, `toggle_tool` |
| **Analytics** | 5 | `complexity_analysis`, `find_hot_paths`, `find_duplicates`, `find_dead_code` |
| **KB Graph** | 5 | `mem_map`, `mem_discover`, `git_search`, `git_index` |
| **Web** | 6 | `fetch_url`, `web_search`, `git_clone_browse`, `download_file`, `api_call`, `read_webpage` |
| **Utility** | 4 | `stream_write_file`, `drawio_auto_layout`, `drawio_export_png`, `agent_log` |

---

## Architecture

```
backend/
├── src/
│   ├── index.ts                  # Entry point — init modules, start server
│   ├── config/BackendConfig.ts   # Env-based configuration (zod validated)
│   ├── server/
│   │   ├── HttpServer.ts         # Hono HTTP server setup
│   │   ├── routes/               # Health, tools, API endpoints
│   │   └── middleware/           # Localhost-only, request-logger, error-handler
│   ├── modules/
│   │   ├── ModuleRegistry.ts     # Module lifecycle manager
│   │   ├── memory/               # SQLite + ONNX embeddings, mem_* tools
│   │   │   └── masking/         # KSA-296: Sensitive data masking middleware
│   │   ├── code-intel/           # AST indexing, search, symbols
│   │   ├── web/                   # KSA-297: Internet/network tools (fetch, search, browse, download, API, render)
│   │   ├── orchestration/        # Child MCP server management
│   │   ├── analytics/            # Quality scoring, metrics
│   │   ├── kb-graph/             # Knowledge graph operations
│   │   └── utility/              # Misc utility tools
│   ├── engine/                   # Indexing engine (file scanner, parsers)
│   ├── tool-router/              # Route tool calls to correct module
│   ├── viewer/                   # Admin portal web UI
│   └── types/                    # Shared type definitions
├── dist/                         # Compiled output (npm run build)
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js >= 18 |
| HTTP Framework | Hono (lightweight, TypeScript-first) |
| Database | better-sqlite3 (WAL mode, FTS5 full-text search) |
| Embeddings | onnxruntime-node + paraphrase-multilingual-MiniLM-L12-v2 |
| AST Parsing | web-tree-sitter (multi-language) |
| File Watching | chokidar |
| Validation | Zod |
| Logging | Pino (structured JSON) |
| Testing | Vitest + Playwright (E2E) |

---

## Security

- Binds to `0.0.0.0` by default — restrict via middleware or firewall for production
- Localhost-only middleware rejects non-local requests
- No authentication required (local tool, same machine)
- Process isolation from IDE (separate PID/memory)
- **KB Sensitive Data Masking** (KSA-296): Read-time redaction of PII, credentials, and business-sensitive content based on requester role. Credentials always masked (fail-closed), PII masked for non-admin (fail-open). Audit trail for all masking events.

---

## Testing

```bash
npm test                  # All tests (once)
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests
npm run test:e2e-api      # E2E API tests
npm run test:e2e-ui       # E2E UI tests (Playwright)
```

---

## Troubleshooting

### Port already in use

```bash
# Find what's using port 48721
netstat -ano | findstr :48721
# Kill it
taskkill /PID <pid> /F
# Or use a different port
CODE_INTEL_PORT=9000 npm start
```

### Database locked

Only one server instance should access the database at a time. If you see "database is locked" errors, make sure no other backend process is running.

### ONNX model not found

The embedding model is expected at `.code-intel/models/model.onnx`. Download it:
- Command Palette → "Kiro SDLC: Download Embedding Model"
- Or manually place an ONNX model at the configured path

---

## Related

- [Extension](../kiro-sdlc-agents/) — The IDE extension that connects to this server
- [Orchestration Config](../.code-intel/orchestration.json) — Child MCP server inventory
- [Root README](../README.md) — Full platform overview

---

## Changelog

| Version | Date | Ticket | Changes |
|---------|------|--------|---------|
| 1.38.0 | 2026-08-25 | SA4E-214 | Extension-driven schema creation for Pega rule types. Dual-strategy harness analysis (HarnessParser + LlmSectionExtractor fallback for stream-rendered harnesses), new `/api/v1/pega/schema/{analyze,store,find,update}` endpoints, schema-guided code enrichment. Fixed: TaskWorker delegates CODE_ENRICHMENT to CodeEnrichmentHandler (Pega flow summary/pseudo_code), enrichment percent Math.floor, admin static vendor asset MIME type. Backend 2634 tests ✓. |
| 1.37.2 | 2026-08-24 | — | Proxy bug fix: global-fetch-patch defensive fallback for curl/powershell mode, cookie jar persistence, followRedirects, workspace-scoped config, PowerShell CLM compat, pwsh binary. SA4E-204/205/206 parallel orchestration docs. |
| 1.37.0 | 2026-08-24 | SA4E-193 | Config Commands — 4 slash commands (/create-new-agent, hook, steering, skill) with ValidationGate schema enforcement (closes GAP-01, fixes D-1..D-7), offline-safe template fallback. Consolidated release carrying SA4E-190 content. Ext tests 1621 ✓ · Backend 2621 ✓ |
| 1.35.0 | 2026-08-23 | SA4E-190 | SDLC Pipeline Autonomy L3 Reset & Rebuild. New backend module `backend/src/sa4e-190/` with PipelineController, StatusManager, repository, unit/integration/e2e tests. Merge origin/main into dnguyenminh/SA4E-190, lint fixes applied. Tests PASS. |
| 1.33.1 | 2026-08-23 | SA4E-189 | Extension hot-reload for .code-intel agentics — no backend changes. ChatStateManager watches agents/steering/hooks/skills with 300ms debounce, recursive patterns. Unit+e2e tests added. |
| 1.32.0 | 2026-08-19 | SA4E-184/186 | Web search native in extension (DuckDuckGo Lite, no SearXNG). Agent runtime routing with dynamic slash menu. WebModule removed from backend. |
| 1.31.0 | 2026-08-19 | SA4E-196 | Fix GraphSyncService drops Pega symbols on re-index. readTopSymbols() now includes pega_* kinds via LIKE pattern. |
| 1.30.1 | 2026-08-19 | SA4E-175/176/178/179 | Bug fixes: KB offline resilience, auth gate signaling, orphan task cleanup, CODE_ENRICHMENT rename. |
| 1.26.0 | 2026-08-14 | SA4E-155 | On-demand KB entry enrichment: priority queue (HIGH/NORMAL column), configurable polling timeout (15s default), 3-tier fallback, COALESCE first-write-wins, ConfigService (Admin UI > ENV > Default), PendingTaskRepository priority-aware claimBatch(). |
| 1.19.1 | 2026-07-31 | SA4E-81 | Version alignment with extension release. No backend code changes in this release. |
| 1.18.0 | 2026-07-31 | SA4E-79 | Client-Side LLM Knowledge Enrichment hardening: `handleIngestFile`/`handleIngest` always mark `pending` + enqueue TAG_ENRICHMENT (NEW-01/NEW-06/NEW-10), TaskWorker tags/structured_map conditional updates as race guards (NEW-03), USER-scoped entries enrichable without projectId (NEW-07), pending section LIMIT 3→10 (NEW-09). FTS fix: `knowledge_fts` auto-rebuild at startup when empty — restores `mem_search` for pre-existing entries. |
| 1.17.0 | 2026-07-30 | SA4E-77 | Pega Knowledge Graph: categorized node types (PROCESS, DECISION, DATA_MODEL, UI, etc.), config-driven mapping (`pega-categories.json`), Pega-mode color switching in graph legend. Code/KB split uses entry_id prefix. Dashboard includes Pega rules in codeSymbols. isPega flag in /positions API. |
| 1.16.0 | 2026-07-25 | — | Memory Evolution Levels L4-L6 (Collective Graph, Skill/Procedural Memory, Reflective Consolidation) implemented with real backend services and graph algorithms. Admin configuration checks resilience for Zen Upstream, TaskWorker endpoints, user management, and dynamic Admin Web UI. |
| 1.15.0 | 2026-07-24 | SA4E-49/50/51 | PostgreSQL adapter with async DatabaseAdapter. KB tag scope fix (USER→PROJECT, now 4k+ tags visible). JWT auth, RBAC tools, config tracking. DI Container, ModuleFactory, EventBus. Agent sync to kiro/claude-code/codex-openai/github-copilot. |
| 1.14.0 | 2026-07-19 | SA4E-48 | Extension `WrapperServer` MCP Streamable HTTP compliance: `initialize` handshake, `ping`, `notifications/initialized`, `GET /mcp` SSE — fixes VS Code `-32601` stop/restart loop + OpenCode SSE `endpoint` event fix |
| 1.13.0 | 2026-07-19 | — | Presentation servers (FastAPI + Next.js), Electron desktop app, architecture diagrams, utility scripts |
| 1.12.0 | 2026-07-19 | — | Version bump + README sync across all packages |
| 1.11.0 | 2026-07-18 | SA4E-42/47 | DatabaseAdapter refactoring (engine, memory, graph, indexer) + LLM Context Chain for document indexing (analyzer, prompts, TaskWorker, structured_map, full content extraction). 66 files, 570 tests pass. |
| 1.10.1 | 2026-07-16 | — | Bump version + update README |
| 1.9.0 | 2026-07-15 | — | Agent Sync to All Platforms — 9 agent prompts synced to 5 conversion targets + root `.claude/` and `.opencode/` folders |
| 1.8.1 | 2026-07-15 | SA4E-38 | Smart KB Ingest: `mem_smart_ingest` + `mem_smart_ingest_cleanup` tools using local Ollama LLM for semantic evaluation before KB ingestion. ClassifyService + SmartIngestHandler. |
| 1.8.0 | 2026-07-15 | SA4E-36 | Multi-tenant RBAC: Project isolation via X-Project-Id header, per-user KB scoping, access group permissions, impersonation. |
| 1.7.0 | 2026-07-15 | SA4E-37 | Health Check & Auto-Reconnect: HealthMonitor (parallel pings), ReconnectManager (exponential backoff + jitter), ConnectionStateTracker (state machine + events), TransportFactory. McpClientManager refactored as Facade. 54 unit tests. |
| 1.6.0 | 2026-07-15 | SA4E-34 | Multi-database Support: DatabaseAdapter strategy pattern, PostgresAdapter, MysqlAdapter, MigrationService, Admin UI database tab |
| 1.5.0 | 2026-07-13 | SA4E-125 | Pipeline Refactoring v2-v6: index-based routing, PipelineDefinition in state, sandboxed hot-swap, resolvePhaseIndex() realignment, orphan detection, skip/cancel decisions, 3-layer skip fix, Ghost Context Barrier. LangGraph restructured into core/pipeline/agents/engine/subgraphs/workflow/helpers/hooks/vscode. 13 architecture diagrams. |
| 1.1.0 | 2026-07-03 | KSA-297 | WebModule — 6 internet/network tools: fetch_url, web_search, git_clone_browse, download_file, api_call, read_webpage. SSRF guard, rate limiter, content truncation. |
| 1.0.1 | 2026-07-02 | KSA-296 | Sensitive Data Masking — PII/credential/business logic redaction middleware |
| 1.0.0 | 2026-06-15 | — | Initial release — Code Intelligence, Memory, Orchestration |

---

## License

MIT

