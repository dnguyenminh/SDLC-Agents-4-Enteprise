# AGENTS.md — SDLC-Agents-4-Enterprise

> Converted from .kiro/ format for OpenAI Codex CLI

## Project Overview

Multi-agent SDLC pipeline with specialized agents (SM, BA, TA, SA, QA, DEV, DevOps, UI, Security) coordinated by Scrum Master. Kotlin Multiplatform backend + Kotlin/JS frontend + Python MCP orchestration.

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

## Dynamic Tool Execution Pattern

### 2-Step Pattern

1. `find_tools(query: "jira issue", threshold: 0.3, top_k: 5)` — discover tools
2. `execute_dynamic_tool(tool_name: "...", arguments: {...})` — execute

### Rules

- NEVER call nested tools directly
- ALWAYS use `execute_dynamic_tool` as wrapper
- Arguments must be objects (not JSON strings)
- Core tools (mem_search, mem_ingest, find_tools, code_search, agent_log) are directly callable

## Agent Roles Overview

| Agent | Role | Primary Output |
|-------|------|----------------|
| **SM** (Scrum Master) | Pipeline coordinator, entry point | STATUS.json, RUN-LOG.md |
| **BA** (Business Analyst) | Requirements & specifications | BRD.md, FSD.md (draft) |
| **TA** (Technical Architect) | FSD enrichment, technical depth | FSD.md (enriched) |
| **SA** (Solution Architect) | Technical design | TDD.md |
| **QA** (QA Engineer) | Test planning & execution | STP.md, STC.md |
| **DEV** (Developer) | Implementation | Source code, UG.md |
| **DevOps** (DevOps Engineer) | Deployment & release | DPG.md, RLN.md |
| **UI** (UI/UX Designer) | Wireframes & UI specs | UI-SPEC.md, wireframes |
| **Security** | Security assessment | Security Report |

## SDLC Pipeline Phases

| Phase | Name | Agent | Output | Prerequisites |
|-------|------|-------|--------|---------------|
| 1 | Requirements | BA | BRD.md | Jira ticket exists |
| 2 | Specification | BA + TA | FSD.md | BRD.md exists |
| 2.5 | UI Design | UI | Wireframes | FSD.md with UI specs |
| 3 | Design | SA | TDD.md | FSD.md exists |
| 3.5 | Feedback Loop | BA↔SA | FSD fix + TDD update | DISCREPANCY.md exists |
| 3.7 | Security Design Review | Security | SECURITY-REVIEW.md | TDD.md exists |
| 4 | Test Planning | QA | STP.md, STC.md | BRD + FSD + TDD exist |
| 4.5 | DevOps Pipeline Setup | DevOps | CI/CD configs, Dockerfile, infra | TDD + STP exist |
| 5 | Implementation | DEV | Source code | TDD exists + CI/CD ready |
| 5.5 | User Guide | DEV + BA + QA | UG.md | Code + docs exist |
| 5.7 | Security Code Review | Security | SECURITY-ASSESSMENT.md | Source code exists |
| 6 | Testing | QA | Test results | Code + STP/STC exist + Security review done |
| 6.3 | Penetration Testing | Security | PENTEST-REPORT.md | QA tests pass + app running |
| 6.5 | UAT | PO/User | Acceptance | All tests pass + pentest done |
| 6.7 | Security Deployment Review | Security + DevOps | SECURITY-DEPLOY-REVIEW.md | UAT pass + DPG exists |
| 7 | Deployment | DevOps | RLN.md + Deploy | Security deploy review done + UAT accepted |

## Quality Gates — Post-Phase Verification

After each sub-agent completes:
1. READ generated document
2. CHECK phase checklist items
3. VALIDATE drawio XML (no self-closing edges, no mxfile wrapper)
4. Critical items missing → Re-invoke (max 2 retries)
5. ONLY mark done after all Critical checks pass

## Code Standards Summary

- **SOLID Principles** mandatory
- **OOP Design Patterns** mandatory (Strategy, Observer, Factory, Template Method, Facade)
- File ≤ 200 lines, Function ≤ 20 lines
- Models in separate `models/` folder
- No swallowed exceptions — always inform user
- Serialization: `encodeDefaults = true` for protocol communication

## Jira Integration

- Transitions follow project workflow (TO DO → DOCS REVIEW → IN PROGRESS → IN REVIEW → QA TEST → UAT → READY FOR PRODUCT → DONE)
- Document naming: `{DOC}-v{version}-{TICKET}.docx`
- Attach documents immediately after each phase

## Loop Constraints

- Fix attempts per document: max 3
- Feedback loop iterations: max 5
- Sub-agent retries per phase: max 2
- Total agent invocations per session: max 30
- Never auto-merge to main/master
- Never force push

## MCP Configuration

See `codex-config.md` for MCP server setup instructions.

## Detailed Agent Prompts

See `agents/` subdirectory for individual agent instructions.
