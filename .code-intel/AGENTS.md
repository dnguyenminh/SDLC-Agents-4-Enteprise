# AGENTS.md — SDLC-Agents-4-Enterprise

## Project Overview
Multi-agent SDLC pipeline for enterprise — 9 AI agents (SM, BA, TA, SA, QA, DEV, DevOps, Security, UI) orchestrated by the Scrum Master. Ticket flows BA -> SA -> DEV -> QA -> DevOps, with the SM as the single entry point.

## Key Rules
1. **SM as Entry Point** — Jira ticket → route through SM
2. **Code Standards** — SOLID, 200 lines/file, 20 lines/function, separate models
3. **Draw.io Only** — Never Mermaid (native draw.io XML, export to PNG)
4. **Tool Usage** — tools available directly, use `task` for sub-agents
5. **Quality Gates** — Verify after each phase
6. **No Workarounds** — Root cause only
7. **Self-Learning** — KB first, ingest after

## Architecture
- **Backend** (`backend/`): TypeScript + Hono + MCP SDK — Code Intelligence MCP server (Streamable HTTP, default port 48721). Storage: SQLite (`better-sqlite3`, default) / PostgreSQL (`pg`). Local embeddings (ONNX Runtime + Xenova Transformers), draw.io layout (ELK.js), AST parsing (web-tree-sitter), Zod validation, Pino logging.
- **Extension** (`extension/`): VS Code/Kiro extension — TypeScript + LangGraph/LangChain agent orchestration, MCP SDK client, Anthropic SDK, WebSocket (`ws`) / `undici` with `@vscode/proxy-agent` proxy. Webview UI: Svelte 4 + Vite + TypeScript.
- **Orchestration**: LangGraph workflows (TypeScript, extension) drive the agent pipeline; Python FastAPI servers (`backend/servers/fastapi`, incl. `mcp_server.py`) provide presentation-generation MCP services.
- **Docs**: `documents/{TICKET}/` with `STATUS.json`

## Communication: Vietnamese (user), English (code)
