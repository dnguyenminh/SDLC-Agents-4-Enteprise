# AGENTS.md — SDLC-Agents-4-Enterprise

## Project Overview
Multi-agent SDLC pipeline with specialized agents (BA, TA, SA, QA, DEV, DevOps, UI) coordinated by Scrum Master. Kotlin Multiplatform backend + Kotlin/JS frontend + Python MCP orchestration.

## Key Rules
1. **SM as Entry Point** — Jira ticket → route through SM
2. **Code Standards** — SOLID, 200 lines/file, 20 lines/function, separate models
3. **Draw.io Only** — Never Mermaid
4. **Dynamic Tools** — find_tools → execute_dynamic_tool
5. **Quality Gates** — Verify after each phase
6. **No Workarounds** — Root cause only
7. **Self-Learning** — KB first, ingest after

## Architecture
- Backend: Kotlin/Ktor/SQLDelight/Koin (shared/ + server/)
- Frontend: Kotlin/JS + HTML Templates + Vite
- Orchestration: Python MCP server
- Docs: documents/{TICKET}/ with STATUS.json

## Communication: Vietnamese (user), English (code)
