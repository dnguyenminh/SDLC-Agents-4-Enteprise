# AGENTS.md — Agent Prompts Directory

> Converted from .kiro/agents/ format for OpenAI Codex CLI

This directory contains detailed agent prompts for the SDLC pipeline.
Codex treats subdirectory AGENTS.md files as scoped instructions.

## Agent Summary

| File | Agent | Description |
|------|-------|-------------|
| `sm-agent.md` | Scrum Master | Pipeline coordinator, single entry point |
| `ba-agent.md` | Business Analyst | Jira analysis → BRD/FSD creation |
| `ta-agent.md` | Technical Architect | FSD enrichment with technical depth |
| `sa-agent.md` | Solution Architect | TDD creation from FSD |
| `qa-agent.md` | QA Engineer | STP/STC creation, test execution |
| `dev-agent.md` | Developer | Code implementation from TDD |
| `devops-agent.md` | DevOps Engineer | DPG/RLN, deployment, release |
| `ui-agent.md` | UI/UX Designer | Wireframes, UI-SPEC |
| `security-agent.md` | Security Expert | OWASP review, security report |

## Shared Rules (All Agents)

### Tool Discovery — MANDATORY FIRST STEP

Every agent MUST discover tools before starting work:
```
find_tools(query: "...", threshold: 0.4, top_k: 5)
```
Then execute via: `execute_dynamic_tool(tool_name: "...", arguments: {...})`

### Knowledge Base Access

- Before acting: `mem_search("<problem>")` — check existing solutions
- After task: `mem_ingest(type="LESSON_LEARNED")` — store learnings
- All documents MUST be ingested into KB after creation (full content, not summary)

### Communication

- User-facing: Vietnamese
- Documents and code: English

### Document Output

- Location: `documents/{TICKET}/`
- Diagrams: `documents/{TICKET}/diagrams/` (.drawio + .png)
- Format: Markdown → DOCX (via embed_image → export_docx)
- Naming: `{DOC}-v{version}-{TICKET}.docx`

### Draw.io Rules

- NEVER use Mermaid — always draw.io
- XML must start with `<mxGraphModel>` (no `<mxfile>` wrapper)
- Every edge MUST have `<mxGeometry>` child (no self-closing)
- Export to PNG via draw.io CLI after creation
