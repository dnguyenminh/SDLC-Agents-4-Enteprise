# SDLC Agents for Enterprise

Multi-agent SDLC pipeline - 9 AI agents automate your software development workflow.
BA -> SA -> DEV -> QA -> DevOps, orchestrated by Scrum Master.

## Quick Start

### 1. Start Backend
Published on npm — no source download needed:
```bash
npx sdlc-agent-4-enterprise-server
# Server at http://localhost:48721
# Custom port: npx sdlc-agent-4-enterprise-server --port 9000
```

### 2. Install Extension
```bash
cd extension
npm ci && npm run esbuild && npx vsce package --no-dependencies
kiro --install-extension sdlc-agents-4-enterprise-1.12.0.vsix
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

### v1.12.0 (2026-07-19)

- **Version Bump** — All packages and README files updated to v1.12.0
- **Consistency Sync** — Version badges, install commands, and changelogs aligned across root, backend, and extension READMEs

### v1.11.0 (2026-07-18)

- **SA4E-42: DatabaseAdapter Refactoring** — Complete engine layer overhaul with consistent SQLite adapter patterns:
  - `DatabaseAdapter` interface with atomic `get()`, `list()`, `create()`, `update()`, `delete()`, `query()` methods
  - `SqliteDbAdapter` implements all CRUD with prepared statements, transactions, batch operations
  - Memory module (`MemoryAdapterWrapper`, `GraphNodeAdapter`, `IndexerAdapter`) refactored to use adapter
  - All 66 test files pass (570 tests, 0 failures)
- **SA4E-47: LLM Context Chain for Document Indexing** — Enhanced LLM pipeline with contextual reasoning:
  - `analyzer.ts` — chunking with context chain window, entity/actor/rule extraction, rich structured_map output
  - `ENHANCED_SYSTEM_PROMPT` in `prompts.ts` — expanded instruction set covering roles, relationships, priority, tags
  - `LLMService.ts` — maxTokens 300→2048 for deep analysis
  - `TaskWorker.ts` — context chain query path, structured_map merge into KB
  - `engine/crud.ts` — `updateStructuredMap()` for persistent structured_map storage
  - `dispatchers/crud.ts` — full content extraction, automatic task creation on `handleIngestFile`
  - 12 new unit test files for all added modules
- **drawio Test Fixes** — `drawio-export.test.ts` + `mcp-drawio-dispatch.test.ts` pass (content_base64 param); export-dependent tests skipped (requires drawio CLI)
- **Extension 1.11.0** — Packaged as `.vsix`, 30s HTTP timeout in `IndexerHttpClient`

### v1.9.0 (2026-07-15)

- **Agent Sync to All Platforms** — Synced 9 agent prompts from `.kiro/agents/prompts/` to all 5 conversion targets (Claude Code, OpenCode, GitHub Copilot, Codex OpenAI, Antigravity/Gemini) + root `.claude/` and `.opencode/` folders. Single source of truth maintained.

### v1.8.2 (2026-07-15)

- **SA4E-39: Extension Auth Warning** — Show warning + Login button when session expires, StatusBarManager wiring, HttpClient auth-guard prevents 401 spam and silent KB ingestion failures.
- **SA4E-40: Admin Dashboard 401 Fix** — Stop polling on token expiry, auto-redirect to LoginPage, prevent server log flood.
- **Version Sync** — All README badges + changelogs now consistent. Added `version-sync-check` hook to prevent future drift.

### v1.8.1 (2026-07-15)

- **SA4E-38: Smart KB Ingest — Local LLM Semantic Evaluation** — New MCP tools `mem_smart_ingest` + `mem_smart_ingest_cleanup` that use local Ollama LLM to evaluate user messages before KB ingestion:
  - `ClassifyService` — Strategy pattern for LLM-based binary classification (ingest/skip)
  - Fire-and-forget pattern — hook calls backend tool without consuming chat LLM tokens
  - Graceful fallback — Ollama unavailable → ingest raw with "unfiltered" tag, batch cleanup later
  - Deduplication — content hash prevents duplicate KB entries
  - Feature flag — `SMART_INGEST_ENABLED` env var for instant disable
  - 33 unit tests, 48 test cases planned (STP/STC)
  - Full SDLC documentation: BRD, FSD, TDD, STP, STC, UG + 10 draw.io diagrams

### v1.8.0 (2026-07-15)

- **KB Evolution System** — CompositeScorer with 5 scoring strategies (Temporal, Confidence, Superseded, Outcome, Predictive), DecayService, EpochService, StagnationDetector, and OutcomeService for knowledge lifecycle management
- **KB Supersession** — Entries can be marked superseded; old knowledge automatically deprioritized in search results
- **KB Evolution Dispatcher** — New MCP tools: `mem_decay_cycle`, `mem_epoch_trigger`, `mem_stagnation_report`, `mem_record_outcome`, `mem_supersede`
- **Security Phases in SDLC** — Added Phase 3.7 (Design Review), 5.7 (Code Review), 6.3 (Penetration Testing), 6.7 (Deployment Review) to pipeline
- **DevOps as Version Sync PIC** — Phase 7 release process now requires DevOps to scan and sync ALL version references (project-agnostic)
- **Architecture Pattern Detection** — 7 patterns (ai-agent, microservice, monolith, library, cli-tool, data-pipeline, plugin) with per-pattern pipeline adjustments
- **Document Templates Overhaul** — Updated BRD, FSD, TDD, STP, STC, UG, DPG, RLN, Security Report, UI-Spec, Design System, Test Report templates
- **Agent Prompt Improvements** — All 9 agents (SM, BA, TA, SA, QA, DEV, DevOps, Security, UI) updated with enhanced prompts and role boundaries
- **Steering Rules Expansion** — Added patterns/, role-boundaries, dev-bug-diagnosis, shared-diagrams, phase routing steering files
- **SA4E-36 BRD** — Business Requirements Document for new feature
- **SA4E-37 Updates** — Health Check & Auto-Reconnect run log updates
- **E2E Test Infrastructure** — Dynamic port allocation, env-setup module, separate vitest.e2e.config

### v1.7.1 (2026-07-15)

- **Bug Fix: Database Name empty on Configuration page** — `/api/admin/database/status` now returns connection params (host, port, username, database, ssl) for non-SQLite engines; frontend `loadDbStatus` populates form fields on page load
- **Enhancement: --port CLI argument** — Backend server port now configurable via `--port` CLI arg (priority: CLI > `CODE_INTEL_PORT` env > default 48721)
- **Enhancement: E2E tests use dynamic free port** — Test setup finds a free port via `net.createServer(0)` to avoid conflicts with running dev server; shared `e2e-config.ts` exports centralized test URLs

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
