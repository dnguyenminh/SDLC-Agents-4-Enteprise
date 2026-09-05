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
kiro --install-extension sdlc-agents-4-enterprise-1.41.1.vsix
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

### v1.41.1 (2026-09-06)

- **SA4E-242: KB Scope Auto-Detection based on VCS** — KB Scope Auto-Detection based on VCS, detectKbScope async refactor, 100% UAT pass.

### v1.41.0 (2026-08-29)

- **SA4E-6: Sandbox Execution (MCP Server Bridge)** — New `SandboxModule` exposing 5 MCP tools (`sandbox_session`, `sandbox_exec`, `sandbox_run`, `sandbox_install`, `sandbox_test`) so DEV/QA agents run bash, install packages, compile, and run test suites in isolated environments. Local + Docker executors (via `dockerode`), session TTL + background `Reaper`, orphan recovery, resource limits (memory/cpu/disk/pids), mount exclusion of sensitive files, and BR-01..BR-12 hardening (network=none, non-privileged, cap-drop, reuse of `SecurityModule`). Environment-aware default mode (docker on Linux, local on non-Linux; `SANDBOX_FULL_ISOLATION=true` opts into full isolation). Fixed `pending_tasks` schema drift (`priority` column). Tests 4 passed / 3 skipped.

### v1.38.0 (2026-08-25)

- **SA4E-214: Extension-driven Schema Creation for Pega Rule Types** — On-the-fly LLM-enriched schemas created automatically during BFS indexing (no separate "Index Pega Rule Schema" step). Dual-strategy harness analysis (rule-based `HarnessParser` + `LlmSectionExtractor` fallback for stream-rendered harnesses), recursive section discovery with depth/circuit-breaker safety, progressive schema enrichment, and schema-guided code enrichment for accurate summary/pseudo_code. Fixed: `TaskWorker` now delegates `CODE_ENRICHMENT` to `CodeEnrichmentHandler` (Pega flow rules now get summary + pseudo_code); enrichment progress uses `Math.floor`; admin static route serves vendor assets with correct MIME type. Backend 2634 tests ✓.

### v1.37.2 (2026-08-24)

- **Proxy Fix: global-fetch-patch defensive fallback** — Fixed silent proxy bypass in curl/powershell mode. Added cookie jar persistence, followRedirects support, workspace-scoped config, PowerShell CLM compatibility.
- **SA4E-204/205/206** — Parallel orchestration module docs and implementation.

### v1.37.0 (2026-08-24)

- **SA4E-190: SDLC Pipeline Autonomy L3 Reset & Rebuild** — Full SDLC pipeline reset from requirements to deployment with Autonomy Level L3. Rebuilt BRD, FSD, TDD, STP, STC, UG, TEST-REPORT, DPG, RLN. Implemented backend module `backend/src/sa4e-190/` with PipelineController, StatusManager, repository, unit/integration/e2e tests. All tests PASS (Backend 2617 passed, Extension 1561 passed). Merge origin/main into `dnguyenminh/SA4E-190`, lint fixes applied.
- **SA4E-193: Config Commands — 4 slash commands (/create-new-agent, hook, steering, skill)** — LLM-generated config files with ValidationGate schema enforcement (closes GAP-01, fixes D-1..D-7), template fallback offline-safe, hot-reload integration. Ext tests 1621 ✓ · Backend 2621 ✓

### v1.33.1 (2026-08-23)

- **SA4E-189: Hot-Reload System for .code-intel Agentics** — Extension `ChatStateManager` now watches `.code-intel/agents/**/*.md`, `.code-intel/steering/**/*.md`, `.code-intel/hooks/**/*`, `.code-intel/skills/**/*.md` with 300ms debounce. Agent/Steering/Hooks/Skills UI reloads without Kiro restart. Recursive watchers, unit+e2e tests added, docs updated and pushed to Jira SA4E-189.

### v1.33.0 (2026-08-20)

- **SA4E-185: LSP Diagnostics Feed — realtime errors into agent loop** — New `DiagnosticsFeedService` streams LSP diagnostics into LangGraph via `diagnosticsContext` channel (consume-once). Auto-fix advisory fires on severity-token lines. Security-hardened: prompt-injection fencing (fence delimiters + untrusted-data boundary), full approval gate for `fs_write`/`str_replace`/`fs_append`, path-containment for traversal (incl. in-root `..`). Full SDLC doc set (BRD/FSD/TDD/STP/STC/security review/pentest).

### v1.32.0 (2026-08-19)

- **SA4E-186: Agent Runtime Routing** — Dynamic slash menu from `.kiro/agents/*.md`, per-agent model/tool config, AgentSelector dropdown in ChatHeader, dual-path message protocol (runtime vs default).
- **SA4E-184: Web Search native in Extension** — Removed SearXNG dependency, ported `web_search` + `fetch_url` as native VS Code tools (DuckDuckGo Lite POST, no external service needed). Stronger system prompt for mandatory tool usage.

### v1.31.0 (2026-08-19)

- **SA4E-196: Fix GraphSyncService drops Pega symbols on re-index** — `readTopSymbols()` now includes `pega_*` kinds via `OR s.kind LIKE 'pega_%'` pattern. Prevents graph_nodes stale references causing "No content available" in KB Graph detail panel. 696 stale nodes cleaned, 1731 Pega nodes restored.

### v1.30.1 (2026-08-19)

- **SA4E-175: KB Offline resilience** — graceful fallback + user notification when MCP server unreachable
- **SA4E-176: Auth gate signaling** — explicit GRANTED/DENIED in preToolUse hook response, prevents infinite retry loops
- **SA4E-178: Orphan task cleanup** — cascade cancellation of child tasks when parent job terminates
- **SA4E-179: CODE_ENRICHMENT rename** — updated all references to new constant name across codebase
- **Index Jira Project in QuickPick** — added missing "Index Jira Project" option to workspace indexer UI

### v1.30.0 (2026-08-18)

- **SA4E-174: Simplify LangGraph Chat Agent Loop** — Remove verify node for large models, remove aggressive tool nudge, reduce max iterations 25→12, inject all MCP tools (not just 10), add auto-compact at 95% context usage. Chat agent now behaves like OpenCode — LLM decides when to use tools.
- **KSA-290: Collapsible Tool Call Groups in Chat UI** — Tool calls grouped into collapsible containers with summary header (category counts + status dots). Auto-collapses after 3+ calls.
- **SA4E-78: Decouple Code Intelligence Indexer from Local Filesystem** — New `IndexOperationManager`, cooperative cancellation, progress EventEmitter, `DependencyResolver` cleaned of `fs` imports, `FileWatcher` deprecated.
- **SA4E-77: Pega Knowledge Graph — Categorized Node Types, Pega-mode Colors, entry_id-based Code/KB Split** — Enhanced graph visualization with categorized node types.
- **.code-intel Injection Fix** — Extension now copies all chatbox artifacts (hooks, skills, AGENTS.md) to user workspace on inject.

### v1.27.0 (2025-08-16)

- **SA4E-171: Migrate Pega Rules from knowledge_entries to symbols table** — Internal data migration moving 1409 Pega rules into structured `symbols` table with proper metadata (class, ruleset, version). Dual-write/dual-read for zero-downtime transition, pega-mapping enrichment, unified pega-search across both stores. 54 new tests, security review clean.
- **SA4E-132: GateGuard Module** — Denylist, override, audit capabilities for tool approval gate.
- **SA4E-124: Pega rules as code nodes** — Graph integration for Pega rule symbols.
- **SA4E-106: Pega content extraction** — LLM enrichment on Pega rule body content.

### v1.26.0 (2026-08-14)

- **SA4E-155: On-demand KB Entry Enrichment** — Priority queue (HIGH/NORMAL), 15s configurable polling timeout, 3-tier LLM fallback (kiroSdlc.llmChat → Ollama → LMStudio), graceful degradation UX, extension-side enrichment save via COALESCE first-write-wins semantics.
- **SDLC Pipeline Docs** — Full BRD, FSD (TA-enriched with Zod schemas + pseudocode), TDD with 6-phase implementation checklist, 7 draw.io diagrams.

### v1.24.0 (2026-08-11)

- **SA4E-103: KB Document Ingestion Scope Fix** — `mem_ingest` now correctly uses project scope via `withScopeContext(__projectId)`. Documents ingested through pipeline get proper PROJECT scope instead of USER scope.
- **SA4E-104: PostgreSQL Adapter Parity** — Fixed `RETURNING id` in PG pool transactions (uses dedicated client via `pool.connect`), `transactionAsync` isolation, and `pg-schema-ensure` migration module for automatic table creation on PG.
- **Admin UI Improvements** — Zoom/orbit controls for graph visualization, KB entry filter, AJAX-style refresh button (preserves sidebar state), silent token refresh (no full webview reload).

### v1.21.0 (2026-08-02)

- **SA4E-85: ToolApprovalGate — Human-in-the-Loop for Dangerous Tools** — Graph execution pauses and awaits user approval before executing dangerous tools (write_file, shell_execute, git_*). Promise-based gate with idempotency guard, 2-phase escalation (warning + hard reject), retry mechanism (max 3), JSONL audit log, durable state callback, and real-time metrics. 100% open-design compliance. 40 tests.
- **SA4E-85: Chat UI Agentic (Svelte + LangGraph)** — Full chat module: Svelte webview components (ChatPanel, ActionableDiff, PermissionGuard, ToolSpinner, DiagramBlock), LangGraph ReAct agent loop with context-budget-aware messages, Corrective RAG grading for small models, agent registry with YAML parser, IPC bridge with service discovery, telemetry hooks.
- **Knowledge Module** — Backend knowledge service with SQLite-backed vector/BM25 hybrid search, REST API routes, schema management.
- **Steering: Reference Analysis** — Added mandatory Step 2.5 in Phase 1 (Requirements) for complex features: scan open-source reference projects before writing BRD.

### v1.20.0 (2026-08-01)

- **SA4E-84: [drawio] ELK Auto-Layout Fix Mode** — `drawio_auto_layout` tool upgraded to detect + auto-fix layout issues (node overlaps, edge crossings, diagonal edges) using ELK.js layout engine. Takes `file_path` only, writes fixed XML directly to file. For container/swimlane diagrams: edge-only fix (distributes ports without moving nodes). Minimal response (`{ status, message }`). Path traversal protection (SEC-01). Spacing capped at 500px. Env var bounds validation.
- **Steering update** — `shared-diagrams.md` rewritten with comprehensive XML authoring rules, edge routing best practices, port distribution, 7-color palette, container rules, self-check checklist (based on drawio-skill patterns).
- **16 bug fixes** — SQL parameter mismatch in graph/memory modules, tag normalization false matches, async test issues resolved.

### v1.19.1 (2026-07-31)

- **Proxy: leverage VS Code resolution (`@vscode/proxy-agent`)** — System mode now resolves proxy per-URL through VS Code's own proxy stack, reading `http.proxy`, `http.proxySupport`, `http.noProxy` and `HTTPS_PROXY`/`HTTP_PROXY`/`NO_PROXY` env vars, auto-bypassing localhost, with per-URL caching and OS-native fallback (netsh/scutil/gsettings). Proxy connectivity test uses the same resolution path. Fixes unreliable system proxy detection in enterprise networks (esp. PAC/WPAD setups).

### v1.19.0 (2026-07-31)

- **SA4E-81: Proxy Configuration Page** — Enterprise network proxy settings UI. Added Proxy tab to Settings Panel with: manual proxy config (host, port, bypass list), system proxy auto-detection, proxy authentication (SecretStorage), custom URL connectivity testing, and automatic proxy routing for all outbound HttpClient requests via undici ProxyAgent.
### v1.18.0 (2026-07-31)

- **SA4E-79: Client-Side LLM Knowledge Enrichment — bug fixes & hardening** — Client enrichment fallback now works end-to-end: `handleIngestFile` marks entries `pending` + enqueues TAG_ENRICHMENT (NEW-01/NEW-06/NEW-10), TaskWorker race guards (NEW-03), USER-scoped entries can be enriched without projectId (NEW-07), pending section limit raised 3→10 (NEW-09). **FTS fix**: `knowledge_fts` index auto-rebuilds at startup when empty — restores `mem_search` results for all 12,737 pre-existing KB entries.

### v1.17.0 (2026-07-30)

- **SA4E-77: Pega Knowledge Graph Enhancement** — Pega rules categorized by pxObjClass type (PROCESS, DECISION, DATA_MODEL, UI, TECHNICAL, etc.) in the knowledge graph with config-driven mapping via `pega-categories.json`. Graph legend auto-switches to Pega mode (16 category colors) when Pega project detected. Code/KB split now uses entry_id prefix (`code:*`/`pega:*`) instead of CODE_TYPES allowlist. Dashboard codeSymbols includes Pega rules. isPega flag in `/positions` API.

### v1.16.0 (2026-07-25)

- **Memory Evolution Levels L4-L6** — Replaced stub tools with database-backed services and graph algorithms:
  - **Level 6 (Collective Graph)**: DB-backed graph query, node/edge insertion, PageRank, community detection (label propagation), cross-tenant sync (`kb_graph_cross_sync`, `kb_graph_remove_cross`), and project merge (`kb_graph_merge`).
  - **Level 5 (Skill/Procedural Memory)**: Procedural memory CRUD (`mem_procedure`), auto-capturing tool execution sequences (`mem_skill_capture`), dynamic replay with variable substitution (`mem_skill_execute`), and cross-project sharing.
  - **Level 4 (Reflective Consolidation)**: Automated tier consolidation background worker (`TierConsolidationService`) triggering every 30 minutes, plus automated trigger hooks on code sync and bulk ingest operations.
- **Admin Portal & API Enhancements** — Configuration check resilience for Zen Upstream failures, TaskWorker stats and batch retry endpoints. User management updates with privilege escalation checks and password updates. Fully updated Admin Web UI for configuration edits and audit logs.

### v1.15.0 (2026-07-24)

- **SA4E-49: Multi-Database Backend** — PostgreSQL adapter with full async `DatabaseAdapter` methods. All admin/KB/graph modules migrated from raw SQLite to adapter interface. Consolidated `index.db` + `admin.db` into single unified DB. Sequence migration for PostgreSQL identity columns.
- **SA4E-49: Knowledge Base Tags** — Fixed tag scope isolation bug (6,251 entries were invisible due to `USER`-scoped tag entries). Taxonomy-enforced LLM prompts with `normalizeTags()` post-processing. Admin UI now shows 4,038 unique tags.
- **SA4E-49: Admin API & Auth** — JWT authentication with session management (`login`, `logout`, `refresh`, `change-password`). Config change tracking with audit log. RBAC tools (`list-users`, `list-groups`, `add/remove-user`). Database engine switch UI.
- **SA4E-49: Developer Infrastructure** — DI Container, DatabaseManager, ModuleFactory, MemoryModuleBuilder, EventBus, ToolHandlerDecorators. Async SqliteAdapter/PostgresAdapter. Repository pattern (`UserRepository`, `KbRepository`, `GraphRepository`, `AuditRepository`, `SymbolRepository`).
- **SA4E-50/51: RBAC & Graph Fixes** — Project isolation via `X-Project-Id` header, per-user KB scoping, access group permissions. GraphService now uses `DatabaseAdapter` instead of hardcoded SQLite. PostgreSQL insert ID fix for code symbols.
- **Agent Sync** — Agent prompts synced to `kiro`, `claude-code`, `codex-openai`, `github-copilot` conversion targets.

### v1.14.0 (2026-07-19)

- **SA4E-48: MCP Streamable HTTP Compliance** — `WrapperServer` implements the required MCP `initialize` handshake (plus `ping`, `notifications/initialized`, and `GET /mcp` SSE), fixing the VS Code `-32601 Method not supported: initialize` stop/restart loop. Added integration tests TC-32–TC-36.
- **OpenCode SSE Compatibility** — Added `event: endpoint` to SSE stream so OpenCode v1.17.15 SSE client connects properly (fixes `Non-200 status code (405)` error)

### v1.13.0 (2026-07-19)

- **Presentation Servers** — Added FastAPI (Python) + Next.js (React) presentation generation servers with full slide templates, LLM integration, and chat services
- **Electron Desktop App** — Added Electron wrapper with IPC and slide metadata support
- **Presentation Diagrams** — Architecture overview and agent pipeline draw.io diagrams
- **Scripts & Utilities** — `rebuild_notice_all.py`, `start.js`, `test_server.py`

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
