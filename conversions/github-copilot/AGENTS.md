# AGENTS.md — SDLC-Agents-4-Enterprise

## Project Overview
Multi-agent SDLC pipeline with specialized agents (BA, TA, SA, QA, DEV, DevOps, UI) coordinated by Scrum Master. Kotlin Multiplatform backend + Kotlin/JS frontend + Python MCP orchestration.

## Key Rules
1. **SM as Entry Point** — Jira ticket key → route through SM agent
2. **Code Standards** — SOLID, max 200 lines/file, max 20 lines/function, separate models
3. **Draw.io Only** — Never Mermaid, always .drawio + .png
4. **Dynamic Tools** — find_tools → execute_dynamic_tool (never hardcode)
5. **Quality Gates** — Verify after each phase, Critical checks mandatory
6. **No Workarounds** — Fix root cause, single source of truth
7. **Self-Learning** — Search KB first, ingest learnings after

## Architecture
- Backend: Kotlin/Ktor/SQLDelight/Koin (`shared/` + `server/`)
- Frontend: Kotlin/JS + HTML Templates + Vite (`frontend/`)
- Orchestration: Python MCP server with child servers
- Documents: `documents/{TICKET}/` with STATUS.json

## Communication
- User-facing: Vietnamese
- Code/docs: English
