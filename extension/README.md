<p align="center">
  <img src="resources/icon.png" alt="SDLC Agents 4 Enterprise" width="128" height="128">
</p>

<h1 align="center">SDLC Agents 4 Enterprise</h1>

<p align="center">
  <strong>Your entire software team — in one extension.</strong><br>
  9 AI agents. Full SDLC pipeline. Knowledge Base UI. Thin client for Code Intelligence backend.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.2.0-blue?style=for-the-badge" alt="Version">
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
```

2. **Install this extension** (`.vsix` file):

```bash
# Build the extension
cd extension
npm ci
npm run esbuild
npx vsce package --no-dependencies

# Install into Kiro
kiro --install-extension sdlc-agents-4-enterprise-1.2.0.vsix

# Or VS Code
code --install-extension sdlc-agents-4-enterprise-1.2.0.vsix
```

3. **Verify connection**: Command Palette → "SDLC Agents: Settings" → Server Settings → Test Connection

> Without the backend server, agent tools, KB panels, and indexing features will not work.

---

## Quick Start

```
1. Ensure backend is running (http://localhost:48721/health → "healthy")
2. Open Command Palette: Ctrl+Shift+P → "SDLC Agents: Inject All Agents"
3. Check sidebar: SDLC AGENTS 4 ENTERPRISE → should show server connected
4. Give a Jira ticket to SM: @sm-agent KSA-14
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

Built-in chat interface with LLM integration. Supports multiple providers:

| Provider | Setup |
|----------|-------|
| Anthropic | API key in Settings |
| OpenAI | API key in Settings |
| Ollama | Local server URL |
| LM Studio | Local server URL |
| OpenRouter | API key + model selection |
| Kiro Gateway | Auto (uses IDE credentials) |

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
