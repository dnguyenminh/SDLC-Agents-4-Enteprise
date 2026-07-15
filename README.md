# SDLC Agents for Enterprise

Multi-agent SDLC pipeline - 9 AI agents automate your software development workflow.
BA -> SA -> DEV -> QA -> DevOps, orchestrated by Scrum Master.

## Quick Start

### 1. Start Backend
Published on npm — no source download needed:
```bash
npx sdlc-agent-4-enterprise-server
# Server at http://localhost:48721
```

### 2. Install Extension
```bash
cd extension
npm ci && npm run esbuild && npx vsce package --no-dependencies
kiro --install-extension sdlc-agents-4-enterprise-1.7.0.vsix
```

### 3. Use
```
@sm-agent KSA-14              -> Full SDLC pipeline
@sm-agent KSA-14 status      -> Check progress
```

## Agent Pipeline

| Phase | Agent | Output |
|-------|-------|--------|
| 1. Requirements | BA | BRD.md |
| 2. Specification | BA + TA | FSD.md |
| 3. Design | SA | TDD.md |
| 4. Test Planning | QA | STP.md, STC.md |
| 5. Implementation | DEV | Source code |
| 5.5. User Guide | DEV + BA + QA | UG.md |
| 6. Testing | QA | Test results |
| 7. Deployment | DevOps | DPG.md, RLN.md |

## Key Features

- 9 SDLC Agents - Full pipeline from requirements to deployment
- Multi-IDE Support - Inject agents into Kiro, VSCode/Copilot, Claude Code, or Codex/OpenAI
- Knowledge Base - SQLite + ONNX embeddings, 30+ memory tools
- Multi-database Support - SQLite (default), PostgreSQL, MySQL with admin migration tool
- Sensitive Data Masking - Read-time PII/credential/business logic redaction
- Internet Tools - fetch_url, web_search, git_browse, download_file, api_call, read_webpage
- Code Intelligence - AST parsing, call graph, impact analysis
- Admin Portal - Web UI for KB management
- LangGraph Chat - Built-in chat with hooks, steering rules, agent workflows

## Structure

```
backend/    <- Backend server (start first)
extension/  <- Kiro/VS Code extension
```

## License

MIT

---

## Changelog

### v1.7.0 (2026-07-15)

- **SA4E-37: Health Check & Auto-Reconnect for Child MCP Servers** — Periodic monitoring and automatic recovery for child MCP server connections:
  - `HealthMonitor` — single global `setInterval`, parallel pings via `Promise.allSettled()` with 5s timeout
  - `ReconnectManager` — exponential backoff (1s→30s cap) with ±20% jitter, transport-specific reconnect (kill+respawn for stdio)
  - `ConnectionStateTracker` — per-server state machine (connected→unhealthy→reconnecting→failed), event emission via callback array
  - `TransportFactory` — shared transport creation (stdio/sse/httpStream)
  - Enhanced `getServersStatus()` — backward-compatible, adds state, lastHealthCheck, consecutiveFailures, reconnectAttempts
  - New APIs: `startHealthMonitor()`, `stopHealthMonitor()`, `reconnectServer(name)`, `onServerStateChange(cb)`, `setHealthCheckConfig(cfg)`
  - `McpClientManager` refactored as Facade coordinating health subsystem
  - `OrchestrationModule` lifecycle hooks added
  - 54 unit tests (Vitest + fake timers)

### v1.6.0 (2026-07-15)

- **SA4E-34: Multi-database Support** — Database abstraction layer with admin configuration:
  - Strategy pattern: `DatabaseAdapter` interface + `SqliteAdapter`, `PostgresAdapter`, `MysqlAdapter`
  - `DatabaseAdapterFactory` for engine selection from config
  - `DatabaseConfigService` — AES-256-GCM encrypted credentials in `database.json`
  - `MigrationService` — batch data copy (500 rows/batch), progress streaming (SSE), automatic rollback
  - Admin UI: Database Configuration tab with engine selector, connection form, Test Connection, Start Migration, Apply & Switch
  - New dependencies: `pg` (PostgreSQL), `mysql2` (optional)
  - API endpoints: `/api/admin/database/status`, `test-connection`, `migrate` (SSE), `migrate/cancel`, `switch`
- **SA4E-35: Global Toast Notification** — Fixed-position toast (bottom-right) replacing inline msg bars across all admin pages (KB, Tags, Users, Config, Profile)
- **SA4E-31: Cross-workspace Isolation** — Project-scoped graph nodes, spatial queries, and tag filtering by projectId

### v1.5.0 (2026-07-13)

- **SA4E-125: Pipeline Refactoring v2-v6** — Hardcoded → Data-Driven Architecture:
  - Index-based phase routing with `currentPhaseIndex` replacing string `order.indexOf()`
  - `PipelineDefinition` in state for per-thread isolation & checkpointing
  - Sandboxed hot-swap with 3-rule validation (non-empty, valid agents, no LLM errors)
  - `resolvePhaseIndex()` pure function for self-healing index realignment
  - State size optimization (~2-5KB per pipeline definition)
  - Orphaned phase detection → pipeline pause with human intervention
  - Skip/Cancel decisions via extended `ApprovalDecision` type
  - 3-Layer skip fix: `routeFromSm` → `advance_phase` → `buildSmTargets`
  - Ghost Context Barrier — system `ChatMessage` injected on orphaned skip
  - LangGraph source restructured: `core/`, `pipeline/`, `agents/`, `engine/`, `subgraphs/`, `steering/`, `workflow/`, `helpers/`, `hooks/`, `vscode/` modules
  - Full SDLC documentation: BRD, FSD, TDD, 13 draw.io diagrams (PNG + source)

### v1.3.0 (2026-07-09)

- **Multi-IDE Agent Injection** — IDE target picker (Kiro, VSCode/Copilot, Claude Code, Codex/OpenAI)
- **Pre-converted agent bundles** — Proper format per IDE (frontmatter, folder structure, hooks)
- **Codex/OpenAI conversion** — Full `conversions/codex-openai/` with 9 agents
- **Bundled backend** — No more Python/NodeJS/Kotlin runtime picker
- **IDE Adapter architecture** — Strategy pattern, pre-built files copied at inject time
- **LLM Provider Registry** — 135 providers (from 6) matching OpenCode/litellm ecosystem
- **Data-driven Settings dropdown** — Grouped by Cloud/Enterprise/Gateway/Local, dynamic from registry
- **SSRF fix** — Localhost LLM providers no longer blocked by SSRF protection
- **TagAnalyzer health check** — Only enables LLM tagging if provider is reachable at startup
- Updated CONVERSION-GUIDE.md and GAPS.md

### v1.2.1 (2026-07-08)

- **Loop Engineering Guardrails** — 6 items from [cobusgreyling/loop-engineering](https://github.com/cobusgreyling/loop-engineering):
  - Loop Constraints file (path denylist, execution limits, push safety)
  - Token Budget Tracking via KB (daily cap, 80% warning, hard stop)
  - Circuit Breaker (closed/open/half-open states, auto-cooldown)
  - Run Log per ticket (append-only audit trail)
  - Phased Autonomy Levels (L1 report / L2 assisted / L3 unattended)
  - Failure Mode Catalog (7 documented patterns)
- **Skills Integration** — 3 items from [mattpocock/skills](https://github.com/mattpocock/skills):
  - Domain Glossary via KB (BA extracts terms, all agents consume)
  - Two-Axis Code Review (Standards + Spec compliance, parallel)
  - Bug Diagnosis Loop (6-phase structured debugging for DEV)
- **41 steering files** bundled (up from 32)

### v1.2.0 (2026-07-08)

- **Local tools discoverable** — `stream_write_file` and `embed_image` now appear in MCP `tools/list` response with full description + inputSchema (LLM can discover them)
- **`embed_image` implemented** — Reads a markdown file, replaces local image references (`![](path.png)`) with base64 data URIs, writes self-contained `-embedded.md` file
- **`stream_write_file` param fix** — Accepts both `file_path` and `path` arguments (callers use `file_path`)
- **Local tools injected into wrapper** — `injectLocalTools()` deduplicates and merges local tool definitions into backend `tools/list` responses
- **Backend admin API** — Rate limiter, localhost-only middleware, admin routes
- **Code intelligence** — Updated analysis modules

### v1.1.0

- Thin client architecture (backend + extension separation)
- 9 SDLC agents with full pipeline
- Knowledge Base with 5 web panels
- Chat panel with multi-LLM support
- Salesforce project indexing
