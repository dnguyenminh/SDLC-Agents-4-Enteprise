# Changelog

## [1.45.0] - 2026-09-26

### Added
- **PegaStreamIngester authentication** — accepts an optional auth manager and sends `Authorization: Bearer` on ingest-stream, job-poll and ingest-rule requests; indexing services auth headers updated.

### Removed
- **NativeAddonManager** — existed only to download better-sqlite3 native binaries; the backend now runs on `@sqlite.org/sqlite-wasm` (no native bindings). Removed `native-addon-manager.ts`, `addon-download-helpers.ts`, `platform-detector.ts` and `resources/release-manifest.json`.

## [1.38.0] - 2026-08-25

### Added
- **SA4E-214: Extension-driven Pega Schema Creation** — on-the-fly LLM-enriched schemas created automatically during BFS indexing. `PegaSchemaOrchestrator` drives recursive harness/section fetching with depth limit (5), circuit breaker (>20 sections), and mutex; `SchemaLocalCache` + `SchemaValidator` handle caching and progressive field discovery; `SchemaApiClient` talks to new backend endpoints.

### Changed
- **Removed "Index Pega Rule Schemas" QuickPick option** — schema creation is now on-the-fly during "Index Pega Rules"; no separate manual step.

### Fixed
- **PegaSchemaIndexer section extraction** — now discovers sections from `pxRuleReferences` (Rule-HTML-Section) for stream-rendered harnesses that lack `pySections`.

## [1.37.2] - 2026-08-25

### Added
- **SA4E-188: Skill Auto-Invoke** — when a user message has no explicit `/skill:` token, the host detects intent by scoring skill `description`/`name` keywords against the prompt and automatically injects the best-matching skill's `SKILL.md` into the LLM context (threshold ≥ 2 keyword hits). Explicit `/skill:<id>` invocations still take priority and are de-duplicated.
- **SA4E-188: Auto-Invoke scope guard** — auto-invoke only runs for plain chat messages; skipped for ticket commands (`XXX-NNN ...`), agent commands (`/agent task`), and direct commands (`status`/`resume`/`cancel`) to avoid context bloat.

## [1.35.0] - 2026-08-23

### Added
- **SA4E-188: Skills in Slash Menu** — Skills from `.code-intel/skills/*/SKILL.md` appear as a dedicated **Skills** section (🧩) in the "/" slash menu, separated from Agents and Steering Rules
- **SA4E-188: Skill Invocation + Context Injection** — typing `/<skillId>` (or `/skill:<skillId>`) loads the skill's `SKILL.md` content into the LLM context as a `<skill>` block; the `/...` token is stripped from the user prompt
- **SA4E-188: Real-time Skill Loading** — `ChatStateManager` watches `.code-intel/skills` and re-sends `chat:skillsLoaded` on file change; initial broadcast fires on webview `ready`

### Changed
- **SA4E-188: `.kiro/` → `.code-intel/`** — skills/agents/steering paths updated in chat menu, context picker, and workflow parser/executor to match the `.code-intel` workspace layout

### Fixed
- **Slash menu skill grouping** — skills were previously merged into the Agents list; now rendered in their own Skills section
- **Skill content not delivered to LLM** — selecting a skill now injects `SKILL.md` content into context instead of leaving a bare `/skill:...` token the model could not interpret

## [1.33.0] - 2026-08-20

### Added
- **SA4E-197: execute_shell tool** — Chat agent can now run terminal commands (npm, git, java, etc.) via `execute_shell` VS Code native tool
- **SA4E-197: Pattern-based auto-approve** — "Allow all `npm *` commands" button for shell tool approval; future matching commands auto-execute without prompting
- **SA4E-197: CommandPatternMatcher service** — Glob-based pattern matching for session-scoped command approval (supports `*` wildcard)
- **SA4E-197: Inline tool approval UI** — Allow / Allow All / Deny buttons rendered inline in tool card when dangerous tool needs consent (120s timeout)
- **SA4E-197: Hybrid terminal execution** — Shell commands show in VS Code integrated terminal ("Agent Shell" tab) for real-time visibility + capture output for LLM
- **SA4E-197: Input history rebuild** — Arrow Up/Down cycles through all previous user messages; fallback rebuild from tab messages on restore

### Fixed
- **Agent loop for small models** — Removed `verify_response` node from RAG graph path (small models < 32k context); prevents hallucinated "INCOMPLETE" loops with Qwen3-4B
- **Resume button hang** — Added `finally` blocks to always reset `workingStatus` after resume; improved error message when no checkpoint found
- **Resume dialog spam** — Only shows Resume/Start Fresh for SDLC pipelines (`status === "paused"` AND `ticketKey` exists), not plain chat sessions
- **Tool section overflow** — Changed `contain: layout style` → `contain: style` + `overflow: visible` on tool container; content no longer clipped
- **Tool container collapse on approval** — Auto-expands container (removes `tc-collapsed`) when tool requires approval
- **Model name overflow** — CSS truncation (`max-width: 180px` + `text-overflow: ellipsis`); long local model paths show filename only + full path on hover tooltip
- **Timeline order** — `finalizeToolContainer()` called before user message render to seal previous turn's tools; new turn creates container after user bubble
- **System prompt missing execute_shell** — Added explicit rule: "When user asks to run a command → ALWAYS call execute_shell. NEVER guess the result"

## [1.30.1] - 2026-08-19

### Fixed
- **SA4E-175: KB Offline resilience** — graceful fallback + user notification when MCP server unreachable
- **SA4E-176: Auth gate signaling** — explicit GRANTED/DENIED in preToolUse hook response, prevents infinite retry loops
- **SA4E-178: Orphan task cleanup** — cascade cancellation of child tasks when parent job terminates
- **SA4E-179: CODE_ENRICHMENT rename** — updated all references to new constant name across codebase

### Added
- **Index Jira Project in QuickPick** — added "Index Jira Project" option to workspace indexer command picker (was missing from UI despite backend support being ready)

## [1.23.0] - 2026-08-09

### Added
- **SA4E-95: Unified Schema Generation Pipeline** — single extension→backend flow replaces dual-flow (crawl ALL RuleForm harnesses → backend parse → write file + KB ingest)
- **KB Ingest for Schemas** — generated schemas stored in Knowledge Base (type=PEGA_RULE, tags=pega,schema) for agent discovery via `mem_search`
- **Graph Edge Creation** — `PegaGraphProjector` creates dependency edges (CALLS, INHERITS, HAS_PROPERTY, CONNECTS_TO, EVALUATES, USES) during rule ingest
- **Schema-first QuickPick** — "Index Pega Rule Schemas" is first option, selected by default, auto-enables when no schemas exist
- **Pega Project Detection** — shows "rules are the source code" instead of "No source files found" for Pega workspaces

### Changed
- **Dynamic banner title** — "Pega Rule Schema Generation Started" (not generic "Workspace Indexing")
- **File splits (≤200 LOC)** — IndexingService→4 files, PegaService→3 files
- **All log messages in English** — removed Vietnamese runtime messages
- **IndexerHttpClient.getBaseUrl()** — exposed backend URL for schema pipeline

### Fixed
- **Backend route 404** — schema generate route requires `/api/v1` prefix

## [1.21.0] - 2026-08-02

### Added
- **ToolApprovalGate** — Promise-based human-in-the-loop gate for dangerous tool execution
  - Idempotency guard, 2-phase escalation, retry (max 3), JSONL audit log, metrics
- **ApprovalEventLog** — Append-only JSONL event log for tool approval auditing
- **Chat UI Agentic Module** — Svelte webview + LangGraph ReAct agent loop
- **Knowledge Module** (backend) — SQLite-backed hybrid search, REST API
- **Steering: Reference Analysis** — Step 2.5 for complex features

### Changed
- `executeSingleTool` awaits approval gate before executing dangerous tools
- Timeout rejections emit `retryable: true` signal to webview

## [1.20.0] - 2026-08-01

### Added
- **SA4E-84: [drawio] ELK Auto-Layout Fix Mode** — `drawio_auto_layout` tool now detects + auto-fixes layout issues using ELK.js. Takes `file_path` only, writes fixed XML directly to file. For container/swimlane diagrams: edge-only fix (port distribution without moving nodes). Minimal response. Path traversal protection. Spacing capped.
- `elk-layout.ts`, `drawio-writer.ts`, `drawio-apply.ts`, `drawio-layout-models.ts` — new modules for ELK pipeline.
- `elkjs` dependency added to backend.
- Updated `shared-diagrams.md` steering with comprehensive XML authoring rules.

### Fixed
- 16 bug fixes: SQL parameter mismatch (graph/memory), tag normalization false matches, async test issues.
- Security: path traversal protection (SEC-01), spacing cap (SEC-03), env var validation (SEC-02).

## [1.19.1] - 2026-07-31

### Fixed
- **Proxy: leverage VS Code resolution (`@vscode/proxy-agent`)** — System mode now resolves proxy per-URL through VS Code's own proxy stack (reads `http.proxy`, `http.proxySupport`, `http.noProxy`, `HTTPS_PROXY`/`HTTP_PROXY`/`NO_PROXY`, auto-bypasses localhost, per-URL caching, OS-native fallback). Fixes unreliable system proxy detection in enterprise networks (esp. PAC/WPAD setups); proxy connectivity test uses the same resolution path. Self-contained bundle via esbuild alias for the native `@vscode/windows-ca-certs` (Windows-only, unused) — no runtime install needed on any OS.

## [1.19.0] - 2026-07-31

### Added
- **SA4E-81: Proxy Configuration Page** — New "Proxy" tab in Settings Panel
  - Manual proxy configuration (host, port, bypass list with wildcard support)
  - System proxy auto-detection (HTTPS_PROXY, HTTP_PROXY, VS Code http.proxy)
  - Proxy authentication with secure credential storage (VS Code SecretStorage)
  - Custom URL connectivity testing through configured proxy
  - Automatic proxy routing for all outbound requests (undici ProxyAgent dispatcher)
  - Three modes: No Proxy / System / Manual
  - Bypass list with wildcard matching (*.domain.com)

### Fixed
- Fixed acquireVsCodeApi double-call crash in proxy-tab.js (shared window.__vscodeApi pattern)
## [1.18.0] - 2026-07-31

### Fixed
- **SA4E-79: Client-Side LLM Knowledge Enrichment** — enrichment pipeline hardening:
  - `handleIngestFile`/`handleIngest` always mark entries `pending` + enqueue TAG_ENRICHMENT (removes `done`+task contradiction, NEW-01/NEW-06/NEW-10)
  - TaskWorker tag/structured_map updates guarded by `WHERE enrichment_status='pending'` (race fix, NEW-03)
  - USER-scoped entries can now be enriched without projectId (NEW-07)
  - Pending entries section limit raised 3→10 (NEW-09)
- **mem_search returning empty for all queries** — `knowledge_fts` FTS5 index auto-rebuilds at startup when empty, restoring search results for all 12,737 pre-existing KB entries

## [1.14.0] - 2026-07-19

### Added
- **SA4E-48: MCP Streamable HTTP Compliance** — `WrapperServer` implements the mandatory MCP handshake so VS Code connects cleanly (no more `-32601 Method not supported: initialize` stop/restart loop):
  - `initialize` — negotiates `protocolVersion` (2024-11-05 → 2025-06-18), returns `capabilities.tools` and `serverInfo`
  - `notifications/initialized` — acknowledged (HTTP 202, no response body)
  - `ping` — returns empty result
  - `GET /mcp` — opens SSE stream (`text/event-stream`) per the Streamable HTTP transport spec
   - 5 new integration tests (TC-32–TC-36) for handshake and SSE channel
- **OpenCode SSE Compatibility** — Added `event: endpoint` to SSE stream so OpenCode v1.17.15 SSE client connects properly (fixes `Non-200 status code (405)` error)

## [1.11.0] - 2026-07-18

### Added
- **SA4E-42: DatabaseAdapter Refactoring** — Engine layer overhaul with `DatabaseAdapter` interface + `SqliteDbAdapter` implementation. Memory, graph, indexer modules refactored. 66 test files, 570 tests pass.
- **SA4E-47: LLM Context Chain for Document Indexing** — Enhanced analyzer (context chunking, entity/actor/rule extraction), ENHANCED_SYSTEM_PROMPT, LLM maxTokens 2048, TaskWorker context chain query, structured_map merge, full content extraction on ingest. 12 new test files.

### Fixed
- **drawio Export Tests** — `drawio-export.test.ts` + `mcp-drawio-dispatch.test.ts` updated for `content_base64` param; export-dependent tests skip gracefully when drawio CLI unavailable

### Changed
- **IndexerHttpClient** — 30s HTTP timeout to prevent silent KB ingestion failures
- **Backend version** — synced to 1.11.0

## [1.10.0] - 2026-07-17

### Added
- **SA4E-29: Generic Schema-Driven Base64 Proxy** — transparent file ↔ base64 bridge for remote backend:
  - `Base64ProxyService` — auto-detects proxy tools from schema (zero hardcoding); rewrites schemas for LLM (hides content_base64, shows file_path)
  - `WrapperServer` — HTTP MCP proxy on port 9181; routes tools/list + tools/call with automatic base64 I/O
  - `execute_dynamic_tool` unwrapping — proxies nested arguments for dynamically-invoked tools
  - `find_tools` response rewriting — schemas in discovery responses consistent with tools/list
  - 29 automated tests (19 UT + 10 IT/E2E-API/PBT) — all passing

### Fixed
- **SA4E-43: Extension compile errors** — created missing langgraph subgraph stubs + fixed type errors + mcpClient property
- **SA4E-42: find_tools re-index** — semantic index now refreshes on child MCP server connect/disconnect events (backend)

## [1.25.0] - 2025-07-29

### Added
- **KSA-254: Chat Panel: Slash Command Menu** — inline / trigger popup for agent selection and steering rule attachment:
  - SlashMenuController — state machine (CLOSED/OPEN/FILTERING) with 6 triggers
  - SlashMenuView — two-section popup (Agents + Steering Rules) with section headers
  - SlashMenuItems — static 6-agent list + dynamic steering rules from chat:steeringLoaded
  - Type-ahead filter (case-insensitive substring match across both sections)
  - Keyboard navigation (ArrowUp/Down/Enter/Escape) crossing section boundaries
  - Agent selection inserts /agent-name  prefix in textarea
  - Steering selection adds context chip via existing ddContextChip()
  - Full accessibility: 
ole=listbox, ria-activedescendant, screen reader announcements
  - 57 automated tests (12 PBT + 30 UT + 15 IT) — all passing


## [1.18.0] - 2025-07-28

### Added
- **KSA-249: Context Usage Graph + Full Hook System** — complete DX improvement suite:
  - `ContextUsageTracker` — tracks token consumption per source (steering files, code-intel, KB, user messages) with real-time percentage breakdown
  - `ConversationManager` — manages multi-turn conversation state, context window limits, and automatic compaction
  - `TokenCounter` — accurate token estimation for messages, tool calls, and system prompts
  - **Hook System** — full lifecycle hooks (`hook-loader.ts`, `hook-executor.ts`, `hook-events.ts`, `hook-commands.ts`) for pre/post agent execution, tool calls, and streaming events
  - **Workflow Executor** — orchestrates multi-agent workflows with state transitions and hook integration
  - **Context Usage Graph visualization** — real-time webview showing token usage breakdown by category
  - **Workflow Graph visualization** — interactive workflow state diagram in chat panel

### Changed
- **Chat panel** enhanced with context usage indicators and conversation management
- **LangGraph engine** integrated with hook system for extensible agent pipelines
- **All agent nodes** (BA, SA, QA, DEV, DevOps, Security, TA, UI) updated with hook support
- **Steering files** updated with Phase 1-7 SDLC patterns and shared quality gates

## [1.10.0] - 2025-07-20

### Added
- **KSA-111: Prebuilt onnxruntime-node binaries** — extension now ships with prebuilt `onnxruntime-node` native binaries for all supported platforms (win32-x64, linux-x64, darwin-x64, darwin-arm64), eliminating the need for users to compile native addons
- **GitHub Release asset hosting** — onnxruntime-node v1.22.0 binaries hosted on GitHub Release `onnxruntime-node-v1.22.0` for reliable distribution
- **`NativeAddonManager` onnxruntime support** — extended native addon resolution to handle onnxruntime-node alongside better-sqlite3, with platform-specific binary selection

### Changed
- **`onnxruntime-node` dependency** — upgraded to ^1.22.0 with prebuilt binary support
- **`.vscodeignore` updated** — includes onnxruntime-node prebuilt binaries while excluding source/build artifacts
- **`build-native.yml` workflow** — extended matrix to build onnxruntime-node binaries alongside better-sqlite3

## [1.9.4] - 2025-07-19

### Added
- **Multi-version Node binary support** — prebuilt `better-sqlite3` binaries now built for Node 20, 22, and 24 (12 binaries total: 3 Node versions × 4 platforms)
- **Node 22 LTS support** — N-API v9, MODULE_VERSION 127

### Changed
- **Binary naming scheme** — switched from `napi-v{n}-{platform}-{arch}` to `node-v{major}-{platform}-{arch}` to correctly distinguish Node 20 vs 22 (both share N-API v9)
- **`NativeAddonManager` resolution strategy** — now resolves by Node major version first, falls back to closest lower Node version, then legacy N-API-based keys for backward compatibility
- **`build-native.yml` workflow** — builds 12 matrix entries (3 Node versions × 4 platforms), removed `napi_version` input parameter
- **`release-manifest.json`** — added `nodeVersionMap` metadata and 12 binary entries with new naming scheme

### Fixed
- **Node 20 vs 22 binary mismatch** — previously both resolved to same `napi-v9` binary despite having different MODULE_VERSION (115 vs 127), causing potential ABI incompatibility

## [1.9.2] - 2025-07-18

### Fixed
- **KSA-175: VSIX missing `better-sqlite3` JS wrapper** — `.vscodeignore` now explicitly includes `mcp-server/node_modules/**` while excluding native build artifacts (`.build/`, `deps/`, `src/`, binaries). Previously `vsce` respected `.gitignore`'s blanket `node_modules/` exclusion, causing runtime `MODULE_NOT_FOUND` errors.
- **KSA-175: Lazy-load `better-sqlite3` with binding fallback** — `database-manager.js` now defers `require('better-sqlite3')` and supports `BETTER_SQLITE3_BINDING` env var for prebuilt native addon path. Falls back to resolving from `mcp-server/node_modules/better-sqlite3` if standard require fails.

### Changed
- **`.vscodeignore` restructured** — added `!mcp-server/node_modules/**` inclusion rule with targeted exclusions for native build artifacts (`better-sqlite3/build/**`, `better-sqlite3/deps/**`, `onnxruntime-node/bin/**`, `prebuild-install/**`, `node-gyp/**`)

## [1.2.0] - 2026-05-16

### Breaking Changes
- **Removed `Kiro SDLC: Run Code Indexer` command** — MCP servers handle indexing automatically
- **Removed `kiroSdlc.preferredIndexer` setting** — replaced by MCP variant selection
- **Removed bundled indexer scripts** — no longer injected into workspace

### Added
- **MCP Code Intelligence integration** — extension now injects MCP server config into `.kiro/settings/mcp.json`
- **MCP variant picker** — choose Python, Node.js, or Kotlin MCP server during injection
- **`src/mcp-injector.ts`** — new module handling MCP config injection and legacy migration
- **Auto-migration on upgrade** — legacy `.analysis/code-intelligence/scripts/` folder automatically removed

### Changed
- **"Inject All" flow** — now asks for MCP variant instead of indexer language
- **"Inject Selective"** — indexer option replaced by "Code Intelligence MCP Server" option
- **Status check** — verifies `code-intelligence` key in `mcp.json` instead of `index-config.json`
- **Version bumped** to 1.2.0

### Removed
- **`src/indexer.ts`** — entire file deleted (deprecated)
- **`INDEXER_BASE`, `INDEXER_OPTIONS`, `INDEXER_SCRIPTS`** from config.ts
- **`resources/.analysis/code-intelligence/scripts/`** — no longer bundled

## [1.0.6] - 2026-05-10

### Fixed (Code Review)
- **Removed dead code** — `recordFileInjected()` and `saveWorkspaceVersion()` no-op stub deleted
- **Removed semver sort bug** — `loadWorkspaceVersion()` used string sort for versions (1.0.9 > 1.0.10); function removed entirely
- **Fixed `updateSkipModified` logic** — now correctly skips user-modified files (state="modified") instead of all hash-diff files
- **Fixed unused `proc` variable** in `indexer.ts` `executeIndexer`
- **Removed `async` from sync functions** — `injectComponent`, `injectComponentFiltered`, `forceUpdate` no longer misleadingly async
- **Cleaned unused imports** — `detectModifiedFiles`, `loadWorkspaceManifest` removed from `extension.ts`

### Added
- **`src/file-utils.ts`** — extracted file copy utilities (single responsibility): `copyDirRecursive`, `copyDirFiltered`, `copySelectedItems`
- **`IndexerScript` interface** in `config.ts` — proper type annotation for `INDEXER_SCRIPTS`

### Changed
- **`injector.ts` refactored** — reduced from 240 to ~190 lines by extracting file utils
- **`checksum.ts` optimized** — `getFileStatuses` skips hash computation for outdated files (version mismatch already sufficient)
- **`updateSkipModified` and `updateWithBackup`** now receive `FileStatus[]` (user-modified only) instead of `ModifiedFile[]`

## [1.0.5] - 2026-05-10

### Added
- **Per-file version tracking** — each injected file now records its own version independently in `.kiro/.sdlc-manifest.json`
- **"Show File Versions" in Status** — output channel shows every file with its version, state (current/outdated/modified/missing)
- **"Show Details" on upgrade notification** — see exactly which files are outdated before updating
- **`getVersionReport()`** — generates human-readable report: `file.md [v1.0.3 → v1.0.5]`
- **Legacy migration** — auto-migrates old `.kiro/.sdlc-version` to new per-file manifest on first run

### Changed
- **Workspace tracking format** — replaced single `.kiro/.sdlc-version` (one global version) with `.kiro/.sdlc-manifest.json` (per-file version + hash + injectedAt)
- **Update flow** — now distinguishes "outdated" (old version) from "modified" (user edited same version), shows both in prompt
- **`safeUpdate`** — auto-overwrites when only outdated files exist (no user modifications); prompts only when user has customized files
- **`buildManifestAfterInject`** — records exact version and hash for each file after inject/update

### Removed
- **`saveWorkspaceVersion()`** — replaced by `buildManifestAfterInject()` (no-op stub kept for compat)
- **Version-gating in `detectModifiedFiles`** — removed the `entry.version !== checkVersion` skip that caused the overwrite bug

## [1.0.4] - 2026-05-10

### Fixed
- **Critical: "Inject All" and "Update" now always overwrite outdated files** — previously `detectModifiedFiles` skipped all entries when version mismatched, causing old agent files to persist after upgrade
- **`detectModifiedFiles` removed version-gating** — now compares ALL manifest files against workspace regardless of version, correctly identifying files that differ from bundled content
- **`safeUpdate` distinguishes version upgrade vs same-version** — on upgrade, shows "Overwrite All (recommended)" as default; on same-version, shows standard "Skip Modified" flow
- **`forceUpdate` and `injectAll` use bundled manifest version** instead of hardcoded `EXTENSION_VERSION` constant

### Changed
- **Upgrade prompt UX** — when upgrading (e.g., 1.0.3 → 1.0.4), dialog clearly shows version transition and recommends overwrite since files are outdated, not user-customized

## [1.0.3] - 2026-05-10

### Added
- **SM agent: Project-level workflow** — SM now supports `KSA workflow` syntax (project key without ticket number) to list all tickets and manage project scope
- **SM agent: jira.conf management** — SM creates/updates `jira.conf` when invoked with project-level input; asks user before overwriting if project key differs

### Changed
- **jira.conf simplified** — removed `JIRA_BASE_URL` (unnecessary), only contains `JIRA_PROJECT_PREFIX`
- **SM agent Input Parsing** — now distinguishes ticket-level (`KSA-1`) vs project-level (`KSA workflow`) inputs
- **SM agent prompt** — updated in all 4 locations (agents, prompts, bundled resources)

### Fixed
- **jira.conf project key** — corrected from `ICL2` to `KSA`

## [1.1.0] - 2025-07-14

### Added
- **Checksum management system** (`src/checksum.ts`) — detects user modifications when updating agents by comparing workspace files against bundled manifest
- **`gen-checksums.js` script** — auto-generates `.sdlc-checksums.json` from git-committed content during CI build
- **`sync-from-source.ps1` script** — syncs extension resources from source workspace for development
- **Node.js indexer scripts** (`.analysis/code-intelligence/scripts/nodejs`) — TypeScript-based code intelligence indexer with Vitest tests
- **704 documents** from MCPOrchestration project (templates, workflows, QA summaries)
- **UI Spec template** (`documents/templates/UI-SPEC-TEMPLATE.md`)
- **Workflow documentation** (`documents/workflows/`)

### Changed
- **Refactored `injector.ts`** — uses bundled manifest (`resources/.sdlc-checksums.json`) instead of workspace manifest for tamper-proof update detection
- **Moved GitHub Actions workflows** to repo root (`.github/workflows/`) for proper CI/CD triggering
- **Updated `.kiro` agents** — revised SM agent architecture, updated UI agent prompts
- **Updated `code-intelligence.md` steering** — improved indexer configuration guidance
- **Updated `extension.ts`** — integrated checksum system into activation flow

### Removed
- Legacy `scrum-master-agent.json` and `scrum-master-agent.md` (replaced by new agent design)

## [1.0.0] - 2026-05-09

### Added
- Initial release
- Command: Inject All Agents — copies full SDLC pipeline to workspace
- Command: Inject Selective — pick components to inject
- Command: Run Code Indexer — auto-detect runtime and index source code
- Command: Update Agents — update to latest version
- Command: Show Status — check which components are present
- 9 agents: SM, BA, TA, SA, QA, DEV, DevOps, UI, Security
- 9 steering rules: code-standards, self-learning, file-writing, drawio, jira-workflow, code-intelligence, backend-structure, frontend-structure, kotlin-code-standards
- 8 hooks: code-index (create/edit/delete/full), drawio validation, file-watcher
- 10 document templates: BRD, FSD, TDD, STP, STC, DPG, RLN, UG, TEST-REPORT, SECURITY-REPORT
- Code Intelligence Indexer in 5 languages: Python, Java, PowerShell, Bash, Node.js
- Auto-detect runtime for indexer execution
- Status bar indicator

