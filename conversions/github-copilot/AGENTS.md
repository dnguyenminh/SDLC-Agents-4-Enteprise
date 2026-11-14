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
8. **UI Design Gate** — Agents editing design artifacts MUST run design_gate_run (MCP tool) before completion; FAIL must be fixed or justified; SM blocks Phase 5/6 without gate evidence
9. **UG Writing Standard** — UG.md is for END USERS: real screenshots from the running build + User Actions tables + Key Elements tables; NO architecture diagrams/config references/API schemas (they belong to TDD). Standard: `.opencode/rules/sdlc/ug-writing-standard.md`; exemplar: `documents/SA4E-393/UG.md`

## Architecture
- Backend: Kotlin/Ktor/SQLDelight/Koin (`shared/` + `server/`)
- Frontend: Kotlin/JS + HTML Templates + Vite (`frontend/`)
- Orchestration: Python MCP server with child servers
- Documents: `documents/{TICKET}/` with STATUS.json

## Communication
- User-facing: Vietnamese
- Code/docs: English
