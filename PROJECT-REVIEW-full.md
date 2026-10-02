# SDLC Agents 4 Enterprise — Full Project Review

**Date**: 2026-09-29 | **Version**: 1.46.5 (extension) / 1.46.2 (backend) | **Lines**: ~2,253 TS files | **Status**: v1.46.3 last tag

---

## 1. Architecture Overview

### Monorepo Structure
```
sdlc-agents-4-enterprise/
├── backend/          — MCP Server (TypeScript + Hono + SQLite-wasm/PG)
├── extension/        — VS Code/Kiro Extension (TypeScript + Svelte 4 + Vite)
├── .kiro/            — Agent configs, hooks, steering
├── .code-intel/      — Agent skills, phase specs
├── documents/        — Pipeline output templates
├── skills/           — Adversarial review skill
├── scripts/          — Utility scripts
├── conversions/      — IDE format converters
└── docs/             — Architecture docs
```

### Core Architecture
- **Backend**: Code Intelligence MCP Server on port 48721 (default). Streamable HTTP transport. SQLite-wasm default storage, PostgreSQL optional. ONNX Runtime embeddings, ANTLR parser (Pega), tree-sitter (multi-language AST), ELK.js (draw.io layout), Pino logging.
- **Extension**: LangGraph/LangChain agent orchestration, MCP SDK client, Anthropic SDK, WebSocket/undici proxy. Svelte 4 webview UI.
- **Agents**: 9 specialized AI agents (SM, BA, TA, SA, QA, DEV, DevOps, Security, UI) pipelined through Scrum Master.
- **Databases**: SQLite-wasm (`@sqlite.org/sqlite-wasm`), PostgreSQL (`pg`), MySQL (`mysql2`). Unified `DatabaseAdapter` interface.
- **LLMs**: 135 providers via Pi SDK, small-model support (phi-3-mini, smollm2, llama3.1, qwen-coder, lmstudio), context budget gates, smart retrieval, prompt compression.

---

## 2. Code Quality Assessment

### Strengths ✅

| Area | Detail |
|------|--------|
| **Architecture** | Clean DIP — `ModuleFactory`, `ModuleRegistry`, DI Container pattern. Strategy pattern for database adapters, LLM providers, indexing strategies. |
| **Security** | Comprehensive hardening: 4 High + 17 Medium findings fixed in v1.46.0, Phase B. GateGuard + AgentShield dual-layer. SSRF protection, path traversal guards, scoped context isolation. |
| **Testing** | Backend: 284 test files / 3,079 tests. Extension: 221 test files / 2,077+ tests. E2E: 173/173 passing. `tsc` + `eslint` clean. |
| **Multi-DB** | Full adapter abstraction (SQLite-wasm, PG, MySQL) with consistent async API. |
| **Knowledge Base** | SQLite-backed vector+BM25 hybrid search, KB evolution system (supersession, decay, consolidation), 30+ memory tools. |
| **Sandbox** | 5 MCP tools for isolated execution (bash, packages, compile, run, test), docker+local executors, resource limits. |
| **Multi-Language AST** | tree-sitter parsers for C, C++, C#, PHP, Ruby, Scala, Swift, Kotlin. |
| **Salesforce Support** | Apex, LWC, Aura, Visualforce indexing. |
| **SSO** | Unified Entra ID / Google / GitHub SSO strategy pattern. |
| **Proxy** | Leverages VS Code's proxy stack (`@vscode/proxy-agent`), curl/powershell fallbacks for NTLM/SSO. |
| **Documentation** | Comprehensive SDLC templates (BRD, FSD, TDD, STP, STC, DPG, RLN, etc.), agent prompts, steering rules. |

### Issues ⚠️

#### 2.1 Critical / High Issues

**C1: Version Drift Across Modules** 🔴
- `extension/package.json` = 1.46.5
- `backend/package.json` = 1.46.2
- Root `package.json` = 1.46.2
- vsix files: 1.44.1, 1.46.2, 1.46.3, 1.46.4, 1.46.5
- **Impact**: Confusion about which version is authoritative. Release process inconsistency.
- **Fix**: Standardize version across all packages before tagging.

**C2: 96 Files Modified (Uncommitted)** 🔴
- `git status --short` shows 96 files modified
- Many are config/doc files with CRLF/LF warnings
- **Impact**: Working tree is dirty, ambiguous state.
- **Fix**: Either commit or revert all changes. Add `.gitattributes` to normalize line endings.

**C3: `STATUS.json` — Blocked at UAT** 🔴
- Current ticket SA4E-225 is at `uat: blocked_human_gate`
- Blocker: "Sub-agent dispatch tool is NOT available in this OpenCode session"
- **Impact**: Pipeline cannot complete without agent dispatch capability.
- **Fix**: Verify agent invocation tools work in current session context.

**C4: Empty Log Files** 🟡
- `backend-server.log` and `backend-server-err.log` exist but are empty
- **Impact**: Cannot verify runtime behavior without logs.
- **Fix**: Ensure server is running or logs are populated from previous runs.

#### 2.2 Medium Issues

**M1: `vitest.config.ts` Points to Wrong Path** 🟡
```typescript
// Root vitest.config.ts includes slash tests
include: ["source/slash/**/*.test.ts"],
```
But `source/` directory doesn't exist at root — only `backend/` and `extension/` have tests. This config will fail.

**M2: Inconsistent Extension Version in package.json** 🟡
- `extension/package.json` version: 1.46.5
- `extension/sdlc-agents-4-enterprise-1.46.5.vsix` exists
- But `extension/sdlc-agents-4-enterprise-1.46.4.vsix` also exists (uncleaned)
- **Fix**: Remove older vsix artifacts or document intentional coexistence.

**M3: Large Number of Dead/Stale Files** 🟡
- `.analysis/`, `.pi/`, `.roo/`, `.zcode/`, `.opencode/` — old IDE integrations
- `apex-indexer-support.patch`, `fix-proxy-pega-all.patch` — single patch files
- `finalize.py`, `generate_pipeline.py`, `mcp-list.ps1` — legacy scripts
- `pega-design-dump.txt`, `pega-dom-dump.txt`, `pega-js-dump.txt`, `pega-network-dump.txt` — old Pega dumps
- `sdlc-agents-4-enterprise.iml` — JetBrains IDE file (outdated)
- `output.visual-check.*` — visual check PNGs (stale)

**M4: Extension `billion-context-pi` Dependency** 🟡
- `billion-context-pi: 0.1.82` in extension deps — massive context window library
- Combined with `@earendil-works/pi-agent-core: 0.80.10` and `@cortexkit/aft-pi`
- **Risk**: High bundle size, potential version conflicts.
- **Fix**: Audit dependency tree for transitive conflicts.

**M5: `.lintstagedrc.json` Referenced But Not in package.json** 🟡
- `.lintstagedrc.json` exists but `package.json` scripts don't reference it
- **Fix**: Either wire into `lint` script or remove file.

**M6: `opencode.json` at Root** 🟡
- Single JSON file at root — purpose unclear, not referenced in docs
- **Fix**: Document or remove.

#### 2.3 Low Issues

**L1: `node_modules/` in Repository** 🟢
- Both `backend/node_modules/` and `extension/node_modules/` are checked in
- **Impact**: Large repo (~500MB+), CI slowness, merge conflicts.
- **Fix**: Add to `.gitignore`, use npm ci in CI.

**L2: `package-lock.json` at Root** 🟢
- Root lockfile but workspaces use per-workspace lockfiles
- **Impact**: Confusion about which lockfile is authoritative.
- **Fix**: Remove root `package-lock.json`.

**L3: `RUN-LOG.md` and `test.log` at Root** 🟢
- `RUN-LOG.md` and `test.log` at monorepo root — unclear ownership
- **Fix**: Move to appropriate directories or remove.

**L4: `finalize.py` Script** 🟢
- Python script at root — unclear purpose
- **Fix**: Document or remove.

**L5: `documents/` Directory Structure** 🟢
- Contains template subdirectory with 10 templates
- Also contains `kb-tdd-gateguard.txt` — single file, unclear format
- **Fix**: Standardize document storage.

---

## 3. Backend Deep Dive

### 3.1 Key Modules

| Module | Responsibility | Lines | Quality |
|--------|---------------|-------|---------|
| `index.ts` | Entry point, DI, tool ingestion, migrations | ~140 | ✅ Good DIP, async DB init |
| `ModuleRegistry` | Module lifecycle management | — | ✅ Clean interface |
| `ModuleFactory` | Creates and registers all modules | — | ✅ Factory pattern |
| `OrchestrationModule` | MCP server management, tool discovery | ~120 | ✅ Reserved tool names, scope propagation |
| `SecurityModule` | GateGuard + AgentShield facade | ~100 | ✅ Non-fatal init |
| `SandboxModule` | 5 MCP tools for isolated execution | ~80 | ✅ Reuses SecurityModule hardening |
| `KnowledgeModule` | KB search, enrichment, evolution | — | ✅ Composite scorer |
| `PegaModule` | Pega rule indexing, extraction | ~50 files | ✅ ANTLR parser, BFS crawler |
| `Database/` | 3 adapters (SQLite-wasm, PG, MySQL) | ~20 files | ✅ Consistent async API |
| `Engine/Indexer/` | File scanning, checksums, scope | ~20 files | ✅ Idempotent, cancellable |
| `Engine/Graph/` | Symbol resolution, call graph, impact | ~20 files | ✅ Multi-language support |

### 3.2 Security Audit

| Finding | Severity | Location | Status |
|---------|----------|----------|--------|
| SSRF protection on LLM provider URLs | High | `config/` | ✅ Fixed v1.46.0 |
| Path traversal in ONNX embeddings | High | `engine/parsers/embedding/` | ✅ Fixed v1.46.0 |
| Pi→MCP bridge allowlist | High | `extension/src/mcp/` | ✅ Fixed v1.46.0 |
| MCP path containment | High | `extension/src/mcp/` | ✅ Fixed v1.46.0 |
| `restrictedConfigurations` | High | Extension config | ✅ Implemented |
| `SecretDetector` rule | High | `modules/security/agentshield/rules/` | ✅ Active |
| `InjectionDetector` rule | High | `modules/security/agentshield/rules/` | ✅ Active |
| `HttpEndpointRule` | High | `modules/security/agentshield/rules/` | ✅ Active |
| `PermissionRule` | High | `modules/security/agentshield/rules/` | ✅ Active |
| `TlsValidator` | High | `modules/security/agentshield/rules/` | ✅ Active |
| GateGuard denylist | High | `modules/security/gateguard/` | ✅ Active |
| Tool approval gate | High | `modules/orchestration/` | ✅ v1.21.0 |
| `propagateScope()` leak prevention | High | `OrchestrationModule.ts` | ✅ Implemented |

### 3.3 Database Schema

- `SchemaRegistry` manages migrations
- `ensureSa4e215Tables()` ensures `mcp_servers`, `decisions` tables
- `ensurePegaCategoryCountersTable()` ensures `pega_category_counters`
- Graph nodes table migration for type consistency
- `graph_nodes.type` fix: KNOWLEDGE_ENTRY → actual entry type

### 3.4 Engine Architecture

- **Indexer**: File scanner, checksum service, cleanup scheduler, scope detection, SFDX helper
- **Graph**: Call graph, dependency analysis, incremental updater, migrations
- **Parsers**: ANTLR Pega expression evaluator, tree-sitter multi-language, draw.io XML
- **Embedding**: ONNX Runtime + Xenova Transformers, local embeddings
- **Query**: BM25 + vector hybrid search
- **Enrichment**: LLM enrichment pipeline with fallback chain

---

## 4. Extension Deep Dive

### 4.1 Key Modules

| Module | Responsibility | Lines | Quality |
|--------|---------------|-------|---------|
| `extension.ts` | Extension activation, registration | ~50 | ✅ |
| `mcp/` | MCP SDK client, bridge, providers | ~20 files | ✅ Pi SDK integration |
| `pi-agent/` | Pi SDK session management, model routing | ~20 files | ✅ Multi-model support |
| `pi-workflow/` | Pi workflow adapter, approval gate | ~10 files | ✅ |
| `chat/` | Chat engine, streaming, webview | ~10 files | ✅ Svelte + LangGraph |
| `auth/` | JWT auth, SSO, credential management | ~3 files | ✅ |
| `indexer/` | Source code indexing, Pega indexing | ~5 files | ✅ |
| `proxy/` | Proxy configuration, connectivity test | ~3 files | ✅ |
| `webview/` | Svelte 4 components, chat panel | ~10 files | ✅ |
| `services/` | Pega services, Atlassian, Jira | ~15 files | ✅ |

### 4.2 Extension Features

- **30+ Commands**: Inject, status, settings, login/logout, reconnect, indexing, sync
- **Views**: Activity bar (SDLC Agents), Chat panel (webview)
- **Configuration**: 30+ settings with validation, workspace-scoped Pega/Atlassian settings
- **Restricted Configurations**: 9 config keys require workspace trust
- **Multi-LLM**: Anthropic, OpenAI, Ollama, LM Studio, Kiro gateway with fallback chain
- **SSO**: PKCE OAuth2, Entra ID / Google / GitHub providers
- **Proxy**: 5 modes (none, system, manual, curl, powershell)
- **Agent Injection**: Selective or all-injection, IDE-agnostic format conversion

### 4.3 Agent Pipeline

9 agents defined in `.kiro/agents/`:
- SM (Scrum Master) — orchestrator
- BA (Business Analyst) — requirements
- TA (Technical Analyst) — specification
- SA (Solution Architect) — design
- QA (Quality Assurance) — testing
- DEV (Developer) — implementation
- DevOps — deployment
- Security — security review
- UI — UI design

Each agent has:
- Prompt (`.md`)
- Config (`.json`)
- Hooks (`.json` / `.kiro.hook`)
- Skills (`.md`)

---

## 5. Git / CI Status

### Git Log (last 20)
```
363d5de feat: add Pega artifacts
2a70186 chore: bump docs to v1.46.3
33ea57e fix: release v1.46.2 - add missing direct yargs dep
df4ec5d chore: release v1.46.1 - version sync patch
0cb0119 docs: release notes v1.46.0
a20da13 chore: release v1.46.0 — langgraph decommission, Pi cutover, security
5c17b09 fix(security): Phase B — 17 Medium findings
f141407 refactor(SA4E-289): delete langgraph/ — decommission complete
56ba126 refactor(SA4E-289): decommission legacy LangGraph — Pi SDK cutover
```

### Key Commits
- **SA4E-289**: LangGraph decommission → Pi SDK cutover (major refactor)
- **SA4E-324..332**: Small-model support wave, security hardening
- **SA4E-190**: SDLC Pipeline Autonomy L3 Reset & Rebuild
- **SA4E-242**: KB Scope Auto-Detection
- **SA4E-6**: Sandbox Execution (MCP Server Bridge)
- **SA4E-49**: Multi-Database Backend
- **SA4E-48**: MCP Streamable HTTP Compliance
- **SA4E-34**: Multi-database Support

---

## 6. Test Coverage

| Suite | Files | Tests | Status |
|-------|-------|-------|--------|
| Backend Unit | 284 | 3,079 | ✅ Green |
| Backend E2E-API | — | 173 | ✅ 173/173 |
| Extension Unit | 221 | 2,077+ | ✅ Green |
| Extension E2E | — | — | ⚠️ Playwright configured |

---

## 7. Security Review Summary

### v1.46.0 Phase B Findings Fixed
- 4 High severity issues fixed and verified
- 17 Medium severity issues fixed
- 0 Critical across SA4E-324..332

### Active Security Controls
1. **GateGuard**: Denylist + override + audit for dangerous tools
2. **AgentShield**: 5 rules (Secret, HttpEndpoint, Injection, Permission, Tls)
3. **Tool Approval Gate**: Human-in-the-loop for dangerous tool execution
4. **SSRF Protection**: LLM provider URL validation + `restrictedConfigurations`
5. **Path Traversal Guards**: ONNX `modelId`, MCP path containment, draw.io paths
6. **Scope Isolation**: Project-scoped graph nodes, spatial queries, tag filtering
7. **Secret Masking**: Read-time PII/credential redaction
8. **Audit Logging**: JSONL audit trails for tool execution

---

## 8. Recommendations

### Priority 1: Fix Immediately 🔴
1. **Resolve 96-file working tree drift** — commit or revert all changes
2. **Standardize version across all modules** — 1.46.5 vs 1.46.2 inconsistency
3. **Unblock UAT phase** — verify agent dispatch tool works
4. **Add `.gitattributes`** — normalize line endings (LF/CRLF warnings everywhere)

### Priority 2: Clean Up 🟡
5. **Remove `node_modules/` from repo** — add to `.gitignore`
6. **Remove root `package-lock.json`** — only workspace lockfiles needed
7. **Clean up stale files** — `pega-*-dump.txt`, `sdlc-agents-4-enterprise.iml`, `finalize.py`, `output.visual-check.*`
8. **Remove old vsix files** — only keep latest published version
9. **Fix `vitest.config.ts`** at root — `source/slash/` path doesn't exist
10. **Document `opencode.json`** or remove it

### Priority 3: Process Improvement 🟢
11. **CI: Add pre-commit hook to normalize line endings**
12. **CI: Add version-sync check to prevent drift** (already exists as hook per docs)
13. **CI: Add `npm ci` instead of `npm install`** to avoid lockfile drift
14. **Consider splitting** large monorepo into independent repos if modules decoupled
15. **Add `package.json` `workspaces` field** to root (exists but verify it's functional)

---

## 9. Overall Assessment

| Dimension | Rating | Notes |
|-----------|--------|-------|
| **Architecture** | ⭐⭐⭐⭐⭐ | Excellent DIP, strategy patterns, clean boundaries |
| **Code Quality** | ⭐⭐⭐⭐ | Well-structured, good DIP practices, some stale code |
| **Security** | ⭐⭐⭐⭐ | Comprehensive hardening, but version drift is a concern |
| **Testing** | ⭐⭐⭐⭐ | Strong coverage, all green, good E2E infrastructure |
| **Documentation** | ⭐⭐⭐⭐ | Comprehensive templates, agent prompts, steering rules |
| **Maintainability** | ⭐⭐⭐ | Large codebase, 2,253 TS files, some cleanup needed |
| **Version Control** | ⭐⭐ | 96 dirty files, version drift, line ending issues |

**Overall**: ⭐⭐⭐⭐ (4/5) — Strong enterprise-grade SDLC pipeline with excellent architecture and security. Main concerns are operational hygiene (dirty working tree, version inconsistency) rather than code quality.
