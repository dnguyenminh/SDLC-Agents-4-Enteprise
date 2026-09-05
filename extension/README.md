<p align="center">
  <img src="resources/icon.png" alt="SDLC Agents 4 Enterprise" width="128" height="128">
</p>

<h1 align="center">SDLC Agents 4 Enterprise</h1>

<p align="center">
  <strong>Your entire software team — in one extension.</strong><br>
  9 AI agents. Full SDLC pipeline. Knowledge Base UI. Thin client for Code Intelligence backend.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.41.0-blue?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/agents-9-purple?style=for-the-badge" alt="Agents">
  <img src="https://img.shields.io/badge/KB_Panels-5-orange?style=for-the-badge" alt="KB Panels">
</p>

---

## Prerequisites: Backend Server Required

This extension is a **thin client** — it requires the **Code Intelligence Backend** server running on your machine.

### Setup Steps

1. **Start the backend server** — published on [npm](https://www.npmjs.com/package/sdlc-agent-4-enterprise-server), no source download needed:

```bash
# Run directly with npx (recommended)
npx sdlc-agent-4-enterprise-server

# Or install globally, then run
npm install -g sdlc-agent-4-enterprise-server
sdlc-agent-4-enterprise-server

# Server runs at http://localhost:48721
# Custom port: sdlc-agent-4-enterprise-server --port 9000
```

2. **Install this extension** (`.vsix` file):

```bash
# Build the extension
cd extension
npm ci
npm run esbuild
npx vsce package --no-dependencies

# Install into Kiro
kiro --install-extension sdlc-agents-4-enterprise-1.41.0.vsix

# Or VS Code
code --install-extension sdlc-agents-4-enterprise-1.41.0.vsix
```

3. **Verify connection**: Command Palette → "SDLC Agents: Settings" → Server Settings → Test Connection

> Without the backend server, agent tools, KB panels, and indexing features will not work.

---

## Quick Start

```
1. Ensure backend is running (http://localhost:48721/health → "healthy")
2. Open Command Palette: Ctrl+Shift+P → "SDLC Agents: Inject All Agents"
3. Select target IDE (Kiro, VSCode/Copilot, Claude Code, or Codex/OpenAI)
4. Check sidebar: SDLC AGENTS 4 ENTERPRISE → should show server connected
5. Give a Jira ticket to SM: @sm-agent KSA-14
```

---

## Features

### 9 SDLC Agents

| Agent | Role | What They Do |
|-------|------|-------------|
| SM | Scrum Master | Orchestrates pipeline, manages Jira, enforces quality gates |
| BA | Business Analyst | BRD, FSD, user stories, acceptance criteria |
| TA | Technical Analyst | API contracts, pseudocode, technical enrichment |
| SA | Solution Architect | TDD, architecture decisions, diagrams |
| QA | Quality Assurance | Test plans (STP), test cases (STC), test execution |
| DEV | Developer | Code implementation, user guides |
| DevOps | Deployment | Deployment guides, CI/CD, release notes |
| UI | UI Designer | Wireframes, design specs |
| Security | Security Review | Threat modeling, vulnerability assessment |

### Usage

```
@sm-agent KSA-14              → Full pipeline (SM orchestrates everything)
@ba-agent KSA-14              → Just create BRD + FSD
@sa-agent KSA-14              → Just create TDD
@dev-agent KSA-14             → Implement code from TDD
@qa-agent KSA-14              → Create test plan + cases
```

---

### Knowledge Base UI (5 Panels)

| Panel | Description |
|-------|-------------|
| Dashboard | Health score, metrics, trends, recommendations |
| Graph | 3D force-directed knowledge graph |
| Tags | Tag taxonomy, browse entries by tag |
| Quality | Score distribution, confidence stats |
| Analytics | Search trends, popular queries, knowledge gaps |

Open from sidebar → "Knowledge Base" section, or Command Palette → "KB".

---

### Chat Panel

Built-in chat interface with LLM integration. Supports 135+ providers:

| Category | Examples |
|----------|----------|
| Cloud | Anthropic, OpenAI, Google/Gemini, DeepSeek, Mistral, xAI/Grok, Groq, Together, Fireworks, Cerebras, Cohere, Perplexity... |
| Enterprise | Azure OpenAI, AWS Bedrock, Databricks, SAP AI Core, Snowflake Cortex |
| Gateways | OpenRouter (200+ models), Cloudflare AI, Vercel AI, Kiro Gateway |
| Local | Ollama, LM Studio, llama.cpp, vLLM, ONNX Runtime |

**Shell Execution**: Chat agent can run terminal commands (`npm test`, `git status`, etc.) via `execute_shell` tool. Commands show in "Agent Shell" terminal tab. User approval required for safety — with "Allow all pattern" option to auto-approve recurring commands.

Configure: Command Palette → "SDLC Agents: Settings" → LLM Provider tab.

---

### Code Intelligence

| Feature | Command |
|---------|---------|
| Symbol Search | `SDLC Agents: Symbol Search` |
| Impact Analysis | `SDLC Agents: Impact Analysis` |
| Security Panel | `SDLC Agents: Security Panel` |
| AI Context | `SDLC Agents: Get AI Context for Symbol` |
| Salesforce Index | `SDLC Agents: Index Salesforce Project` |

---

## Commands

| Command | Description |
|---------|-------------|
| `SDLC Agents: Inject All Agents` | Install agents, steering, hooks, templates |
| `SDLC Agents: Inject (Select Components)` | Pick specific components to inject |
| `SDLC Agents: Update Agents` | Update to latest bundled version |
| `SDLC Agents: Show Status` | Check all components + server status |
| `SDLC Agents: Settings` | Open settings panel (LLM + Server) |
| `SDLC Agents: Reconnect to Backend` | Reconnect if connection dropped |
| `SDLC Agents: Disconnect` | Disconnect from backend |
| `SDLC Agents: Index Salesforce Project` | Index SFDX project metadata |
| `SDLC Agents: Symbol Search` | Search symbols across codebase |
| `SDLC Agents: Impact Analysis` | Blast radius for a symbol |
| `SDLC Agents: Open KB in Browser` | Open web dashboard in browser |

---

## Settings

Configure in IDE settings (`Ctrl+,` → search "kiroSdlc") or via Settings panel:

| Setting | Default | Description |
|---------|---------|-------------|
| `kiroSdlc.backend.url` | `http://127.0.0.1:48721` | Backend server URL |
| `kiroSdlc.llmProvider` | `anthropic` | Active LLM provider |
| `kiroSdlc.llmModel` | (auto) | Override model for selected provider |
| `kiroSdlc.enableMcpServer` | `true` | Enable local MCP wrapper on startup |
| `kiroSdlc.mcpServerPort` | `9181` | Local MCP wrapper port |

---

## Architecture (v2.0)

```
┌─────────────────────────────────────────────────┐
│  Extension (thin client)                         │
│  ┌──────────────┐  ┌─────────────────────────┐  │
│  │ Commands     │  │ Webview Panels           │  │
│  │ Chat Panel   │  │ (Graph, Dashboard, etc.) │  │
│  │ Tree View    │  │ Settings, Login          │  │
│  └──────┬───────┘  └──────────┬──────────────┘  │
│         │     HTTP :48721     │                  │
└─────────┼─────────────────────┼──────────────────┘
          │                     │
┌─────────▼─────────────────────▼──────────────────┐
│  Backend Server (separate process)                │
│  - 60+ MCP Tools                                 │
│  - SQLite + ONNX embeddings                      │
│  - Code indexing + AST parsing                   │
│  - Child MCP orchestration                       │
│  - Web admin portal                              │
└───────────────────────────────────────────────────┘
```

**Key difference from v1.x**: The extension no longer bundles its own MCP server. It connects to the standalone backend process via HTTP.

---

## Troubleshooting

### "Test Connection" loading forever

- Ensure backend is running: `curl http://localhost:48721/health`
- Check the URL in Settings matches the actual server address

### Extension shows "disconnected"

- Backend server may have crashed — restart it: `npx sdlc-agent-4-enterprise-server`
- Or reconnect: Command Palette → "SDLC Agents: Reconnect to Backend"

### Panels show blank/empty

- Panels require backend connection
- Verify backend health, then close and reopen the panel

### Agent tools timeout

- Backend must be running and healthy
- Check backend logs for errors: look at the terminal where `sdlc-agent-4-enterprise-server` is running

---

## Salesforce Support

The extension can index SFDX projects:

1. Command Palette → "SDLC Agents: Index Salesforce Project"
2. Extension detects `sfdx-project.json` in workspace
3. Counts and indexes: Apex classes, Triggers, Flows, Custom Objects, LWC components
4. All SF symbols become searchable via code intelligence tools

---

## License

MIT

---

## Changelog

### v1.38.0 (2026-08-25)

- **SA4E-214: Extension-driven Schema Creation for Pega Rule Types** — On-the-fly LLM-enriched schemas during BFS indexing (removed separate "Index Pega Rule Schema" command). Dual-strategy harness analysis (rule-based + LLM fallback), recursive section discovery, progressive schema enrichment, schema-guided code enrichment. Fixed TaskWorker delegation, enrichment percent rounding, admin static MIME types, LLM timeout configurable (120s default).

### v1.37.2 (2026-08-25)

- **SA4E-188: Skill Auto-Invoke** — intent detection scores skill descriptions against the prompt and auto-injects the best-matching `SKILL.md` into context (no `/skill:` needed). Skipped for ticket/agent/direct commands.
- **Proxy Fix: global-fetch-patch defensive fallback** — Fixed silent proxy bypass when `CurlHttpAdapter.isCurlMode()` threw during factory lookup. Added `getActiveProxyMode()` defensive check so curl/powershell mode requests never fall through to direct fetch.
- **Proxy: Cookie jar persistence** — CurlHttpAdapter and PowerShellHttpAdapter now persist cookies at `{workspace}/.code-intel/curl-cookies.txt` / `pwsh-session.xml` for session reuse across subprocess calls.
- **Proxy: followRedirects** — `executeCurl()` in global-fetch-patch now respects `redirect: "manual"` from callers; defaults to follow (matching native fetch behavior).
- **Proxy: Workspace-scoped config** — ProxyConfigService saves mode/host/port/bypass at Workspace level (each project gets its own proxy config).
- **PowerShell CLM compatibility** — Removed `$ProgressPreference` and `SecurityProtocol` assignments (incompatible with Constrained Language Mode). Prefer `pwsh` (PS7) over `powershell.exe` on Windows.
- **Test Pega Connection** — Simplified to network reachability check only (no auth attempt).
- **SA4E-204/205/206 docs** — Pipeline documents for parallel orchestration module.

### v1.37.0 (2026-08-24)

- **SA4E-193: Config Commands — 4 slash commands (/create-new-agent, /create-new-hook, /create-new-steering, /create-new-skill)** — LLM-generated config files written to `.code-intel/` with ValidationGate schema enforcement before write (closes GAP-01, fixes D-1..D-7), offline-safe template fallback, editor auto-open, hot-reload integration. Ext tests 1621 ✓ · Backend 2621 ✓
- Consolidated release — carries SA4E-190 content (see v1.35.0 below)

### v1.35.0 (2026-08-23)

- **SA4E-189: Hot-Reload for .code-intel Agentics** — `ChatStateManager` now watches `.code-intel/agents/**/*.md`, `.code-intel/steering/**/*.md`, `.code-intel/hooks/**/*`, `.code-intel/skills/**/*.md` with 300ms debounce. UI reloads agents/steering/hooks/skills without Kiro restart. Recursive watchers, unit+e2e tests added.
- **SA4E-190: SDLC Pipeline Autonomy L3 Reset & Rebuild** — Full SDLC pipeline reset with Autonomy Level L3. Documentation and backend module updated. Merge origin/main into dnguyenminh/SA4E-190. Tests PASS (Extension 1561 passed). README changelog updated.

### v1.35.0-pre (2026-08-23)

- **SA4E-189: Hot-Reload for .code-intel Agentics** — `ChatStateManager` now watches `.code-intel/agents/**/*.md`, `.code-intel/steering/**/*.md`, `.code-intel/hooks/**/*`, `.code-intel/skills/**/*.md` with 300ms debounce. UI reloads agents/steering/hooks/skills without Kiro restart. Recursive watchers, unit+e2e tests added.
- **SA4E-188: Skills in Slash Menu** — Skills from `.code-intel/skills/*/SKILL.md` show as a dedicated **Skills** section (🧩) in the "/" menu, separate from Agents and Steering
- **SA4E-188: Skill Invocation + Context Injection** — `/<skillId>` (or `/skill:<skillId>`) loads `SKILL.md` into the LLM context; the `/...` token is stripped from the prompt
- **SA4E-188: Real-time Skill Loading** — watches `.code-intel/skills`, re-sends on change, initial broadcast on webview `ready`
- **SA4E-188: `.kiro/` → `.code-intel/`** — updated skills/agents/steering paths in chat menu, context picker, workflow parser/executor
- **Fixed** — skills no longer merged into Agents list; skill content now delivered to LLM context

### v1.33.0 (2026-08-20)

- **SA4E-197: Shell Execution + Pattern Auto-Approve**
  - `execute_shell` tool — chat agent runs terminal commands (npm, git, java, etc.)
  - Pattern-based auto-approve: "Allow all `npm *`" → future npm commands auto-execute
  - Inline approval UI: Allow / Allow All / Deny buttons in tool card
  - Hybrid terminal: commands visible in "Agent Shell" terminal tab + output captured for LLM
- **Agent Loop Fix** — Removed unreliable `verify_response` for small models (< 32k context)
- **Resume Button** — No longer hangs; dialog only shows for paused SDLC pipelines
- **UI Fixes** — Tool section no longer clips; model name truncated with hover tooltip; timeline order corrected; input history persists across reloads

### v1.32.0 (2026-08-19)

- **SA4E-186: Agent Runtime Routing** — Dynamic slash menu from `.kiro/agents/*.md`, per-agent model/tool config, AgentSelector dropdown in ChatHeader.
- **SA4E-184: Web Search native in Extension** — `web_search` + `fetch_url` as native VS Code tools (DuckDuckGo Lite, no SearXNG needed).

### v1.31.0 (2026-08-19)

- **SA4E-196: Fix GraphSyncService drops Pega symbols on re-index** — `readTopSymbols()` now includes `pega_*` kinds. Prevents stale graph_nodes causing "No content available" in detail panel.

### v1.30.1 (2026-08-19)

- **SA4E-175: KB Offline resilience** — graceful fallback when MCP server unreachable
- **SA4E-176: Auth gate signaling** — explicit GRANTED/DENIED in hook response
- **SA4E-178: Orphan task cleanup** — cascade cancellation of child tasks
- **SA4E-179: CODE_ENRICHMENT rename** — all references updated
- **Index Jira Project in QuickPick** — added missing option to indexer UI

### v1.26.0 (2026-08-14)

- **SA4E-155: On-demand KB Entry Enrichment** — 3-tier LLM fallback chain (kiroSdlc.llmChat → Ollama → LMStudio), EnrichmentFallback class, local LLM probe with configurable timeout, graceful degradation UX toast.

### v1.21.0 (2026-08-02)

- **SA4E-85: ToolApprovalGate — Human-in-the-Loop for Dangerous Tools** — Graph execution pauses and awaits user approval before executing dangerous tools (write_file, shell_execute, git_*). Promise-based gate with idempotency guard, 2-phase escalation, retry mechanism, JSONL audit log, metrics. 100% open-design compliance. 40 tests.
- **SA4E-85: Chat UI Agentic (Svelte + LangGraph)** — Full chat module with Svelte webview, LangGraph ReAct agent loop, context-budget-aware messages, Corrective RAG, agent registry, IPC bridge, telemetry hooks.
- **Knowledge Module** — Backend knowledge service with hybrid search, REST API.

### v1.20.0 (2026-08-01)

- **SA4E-84: [drawio] ELK Auto-Layout Fix Mode** — `drawio_auto_layout` tool upgraded to detect + auto-fix layout issues (node overlaps, edge crossings, diagonal edges) using ELK.js layout engine. Takes `file_path` only, writes fixed XML directly to file. For container/swimlane diagrams: edge-only fix (distributes ports without moving nodes). Minimal response (`{ status, message }`). Path traversal protection (SEC-01). Spacing capped at 500px. Env var bounds validation.
- **Steering update** — `shared-diagrams.md` rewritten with comprehensive XML authoring rules, edge routing best practices, port distribution, 7-color palette, container rules, self-check checklist.
- **16 bug fixes** — SQL parameter mismatch in graph/memory modules, tag normalization false matches, async test issues resolved.

### v1.19.1 (2026-07-31)

- **Proxy: leverage VS Code resolution (`@vscode/proxy-agent`)** — System mode now resolves proxy per-URL through VS Code's own proxy stack, reading `http.proxy`, `http.proxySupport`, `http.noProxy` and `HTTPS_PROXY`/`HTTP_PROXY`/`NO_PROXY` env vars, auto-bypassing localhost, with per-URL caching and OS-native fallback (netsh/scutil/gsettings). Proxy connectivity test uses the same resolution path. Fixes unreliable system proxy detection in enterprise networks (esp. PAC/WPAD setups).

### v1.19.0 (2026-07-31)

- **SA4E-81: Proxy Configuration Page** — Enterprise network proxy settings UI. Added Proxy tab to Settings Panel with: manual proxy config (host, port, bypass list), system proxy auto-detection, proxy authentication (SecretStorage), custom URL connectivity testing, and automatic proxy routing for all outbound HttpClient requests via undici ProxyAgent.
### v1.18.0 (2026-07-31)

- **SA4E-79: Client-Side LLM Knowledge Enrichment — bug fixes & hardening** — Client enrichment fallback now works end-to-end: `handleIngestFile` marks entries `pending` + enqueues TAG_ENRICHMENT (NEW-01/NEW-06/NEW-10), TaskWorker race guards (NEW-03), USER-scoped entries can be enriched without projectId (NEW-07), pending section limit raised 3→10 (NEW-09). **FTS fix**: `knowledge_fts` index auto-rebuilds at startup when empty — restores `mem_search` results for all 12,737 pre-existing KB entries.

### v1.17.0 (2026-07-30)

- **SA4E-77: Pega Knowledge Graph Enhancement** — Pega rules categorized by pxObjClass type (PROCESS, DECISION, DATA_MODEL, UI, TECHNICAL, etc.) with config-driven mapping (`pega-categories.json`). Graph legend auto-switches to Pega mode with 16 category colors. Code/KB split uses entry_id prefix (`code:*`/`pega:*`). Dashboard codeSymbols includes Pega rules.

### v1.26.0 (2026-07-25)

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

- **SA4E-48: MCP Streamable HTTP Compliance** — `WrapperServer` now implements the required MCP handshake so VS Code can connect without the stop/restart loop:
  - `initialize` — negotiates `protocolVersion` (2024-11-05 → 2025-06-18), returns `capabilities.tools` and `serverInfo`
  - `notifications/initialized` — acknowledged (202, no response)
  - `ping` — returns empty result
  - `GET /mcp` — opens SSE stream (`text/event-stream`) per Streamable HTTP spec
   - Added 5 integration tests (TC-32–TC-36) covering the handshake and SSE channel
  - **OpenCode SSE Compatibility** — Added `event: endpoint` to SSE stream so OpenCode v1.17.15 SSE client connects properly (fixes `Non-200 status code (405)` error)

### v1.13.0 (2026-07-19)

- **Presentation Servers** — Added FastAPI (Python) + Next.js (React) presentation generation servers
- **Electron Desktop App** — Desktop wrapper with IPC and slide metadata
- **Architecture Diagrams** — Agent pipeline and architecture overview draw.io diagrams

### v1.12.0 (2026-07-19)

- **Version Bump** — All packages and README files updated to v1.12.0
- **Consistency Sync** — Version badges, install commands, and changelogs aligned across root, backend, and extension READMEs

### v1.11.0 (2026-07-18)

- **SA4E-42: DatabaseAdapter Refactoring** — Engine layer overhaul with `DatabaseAdapter` interface + `SqliteDbAdapter` implementation. Memory, graph, indexer modules refactored. 66 test files pass.
- **SA4E-47: LLM Context Chain** — Enhanced document indexing with context chain window, entity/actor/rule extraction, structured_map storage, full content extraction on ingest. 12 new test files.
- **drawio Test Fixes** — Export tests pass with `content_base64` param; export-dependent tests skipped (requires drawio CLI).
- **IndexerHttpClient** — 30s HTTP timeout for extension KB operations.

### v1.8.1 (2026-07-15)

- **SA4E-38: Smart KB Ingest** — New `mem_smart_ingest` + `mem_smart_ingest_cleanup` MCP tools for semantic evaluation before KB ingestion using local Ollama LLM.

### v1.8.0 (2026-07-15)

- **SA4E-36: Multi-tenant RBAC** — Project isolation, per-user KB scoping, access group permissions, impersonation support in Admin Portal.

### v1.7.0 (2026-07-15)

- **SA4E-37: Health Check & Auto-Reconnect** — Backend child MCP server connections now auto-recover from silent disconnections with exponential backoff. No extension changes required — backend handles transparently.

### v1.5.0 (2026-07-13)

- **SA4E-125: Pipeline Refactoring v2-v6** — Hardcoded → Data-Driven Architecture:
  - Index-based phase routing (`currentPhaseIndex` replaces `order.indexOf()`)
  - Per-thread `PipelineDefinition` isolation with checkpoint/resume
  - Sandboxed hot-swap with 3-rule validation
  - `resolvePhaseIndex()` — pure function for self-healing index realignment
  - State size optimized to ~2-5KB per pipeline definition
  - Orphaned phase detection → pipeline pauses for human intervention
  - Skip/Cancel decisions via extended `ApprovalDecision` type
  - 3-Layer skip fix preventing infinite loops
  - Ghost Context Barrier — system `ChatMessage` injected on orphaned skip
  - LangGraph source restructured into `core/`, `pipeline/`, `agents/`, `engine/`, `subgraphs/`, `workflow/`, `helpers/`, `hooks/`, `vscode/` modules
  - 13 architecture diagrams (draw.io + PNG export)
  - Full SDLC docs: BRD, FSD, TDD, STP, STC, UG, DPG

### v1.3.0 (2026-07-09)

- **Multi-IDE Agent Injection** — "Inject All Agents" now shows IDE target picker:
  - Kiro (default): `.kiro/agents/`, `.kiro/steering/`, `.kiro/hooks/`
  - VSCode / GitHub Copilot: `.github/agents/`, `.github/copilot-instructions.md`
  - Claude Code: `.claude/agents/`, `.claude/rules/`, `CLAUDE.md`
  - Codex (OpenAI): `AGENTS.md`, `agents/` subdirectory
- **Pre-converted agent bundles** — Each IDE gets properly formatted files (correct frontmatter, folder structure, hooks format)
- **Codex/OpenAI conversion** — New `conversions/codex-openai/` with all 9 agents + subdirectory AGENTS.md
- **Runtime picker removed** — No longer asks to choose Python/NodeJS/Kotlin (bundled backend handles everything)
- **IDE Adapter architecture** — Strategy pattern with `PreConvertedAdapter` (copies pre-built files, no runtime conversion)
- **LLM Provider Registry** — 135 providers (from 6), data-driven `provider-registry.ts`, matching OpenCode/litellm ecosystem
- **Settings dropdown dynamic** — Provider picker generated from registry, grouped by Cloud/Enterprise/Gateway/Local
- **SSRF fix** — Localhost LLM providers (LM Studio, Ollama, vLLM, llama.cpp) no longer blocked by SSRF check
- **TagAnalyzer health check** — Backend checks if LLM provider is reachable before enabling; silent fallback to keyword tagging
- Updated CONVERSION-GUIDE.md and GAPS.md with Codex column

### v1.2.1 (2026-07-08)

- **Loop Engineering Guardrails** — Inspired by [loop-engineering](https://github.com/cobusgreyling/loop-engineering):
  - Loop Constraints (path denylist, execution limits, push/merge safety)
  - Token Budget Tracking via KB (daily cap, 80% warning, 100% hard stop)
  - Circuit Breaker (closed/open/half-open, 30min cooldown, user override)
  - Run Log per ticket (append-only with tokens column)
  - Phased Autonomy (L1 report-only / L2 assisted / L3 unattended)
  - Failure Mode Catalog (7 patterns: infinite loop, verifier theater, token burn, etc.)
- **Engineering Skills** — Inspired by [mattpocock/skills](https://github.com/mattpocock/skills):
  - Domain Glossary via KB (BA extracts terms in Phase 1, all agents consume)
  - Two-Axis Code Review (Standards + Spec axes run parallel before QA)
  - DEV Bug Diagnosis Loop (6-phase: feedback loop → reproduce → hypothesise → instrument → fix → cleanup)
- **41 steering files** bundled (up from 32)
- Install instructions updated for v1.2.1

### v1.2.0 (2026-07-08)

- **Local tools discoverable in MCP** — `stream_write_file` and `embed_image` now appear in `tools/list` with description + inputSchema
- **`embed_image` fully implemented** — Processes markdown files: replaces local PNG/JPG image refs with base64 data URIs, outputs self-contained `-embedded.md`
- **`stream_write_file` param fix** — Now accepts both `file_path` (preferred) and `path` arguments
- **`injectLocalTools()` in wrapper** — Local tool definitions merged into backend `tools/list` responses (deduplicated)
- Install instructions updated for v1.2.0

### v1.1.0

- Thin client architecture (extension → backend HTTP)
- 9 SDLC agents with Scrum Master orchestration
- Knowledge Base UI (5 panels)
- Chat panel with multi-LLM support
- Code intelligence (Symbol Search, Impact Analysis)
- Salesforce project indexing

