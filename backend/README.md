# Code Intelligence Backend

<p align="center">
  <strong>Standalone MCP HTTP server — the brain behind Kiro SDLC Agents extension.</strong><br>
  Code intelligence, Knowledge Base, orchestration, and 60+ MCP tools.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.6.0-blue?style=for-the-badge" alt="Version">
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
# → {"status":"healthy","version":"1.5.0","uptime":5,"tools_loaded":52}
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
| 1.5.0 | 2026-07-13 | SA4E-125 | Pipeline Refactoring v2-v6: index-based routing, PipelineDefinition in state, sandboxed hot-swap, resolvePhaseIndex() realignment, orphan detection, skip/cancel decisions, 3-layer skip fix, Ghost Context Barrier. LangGraph restructured into core/pipeline/agents/engine/subgraphs/workflow/helpers/hooks/vscode. 13 architecture diagrams. |
| 1.1.0 | 2026-07-03 | KSA-297 | WebModule — 6 internet/network tools: fetch_url, web_search, git_clone_browse, download_file, api_call, read_webpage. SSRF guard, rate limiter, content truncation. |
| 1.0.1 | 2026-07-02 | KSA-296 | Sensitive Data Masking — PII/credential/business logic redaction middleware |
| 1.0.0 | 2026-06-15 | — | Initial release — Code Intelligence, Memory, Orchestration |

---

## License

MIT
