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

### UI Design Gate

Agents editing design artifacts (.html .htm .css .scss .sass .less .vue .svelte .tsx .jsx) MUST run `design_gate_run` before reporting done:

- Invoke: `find_tools("design gate")` → `execute_dynamic_tool(toolName: "design_gate_run", arguments: { "mode": "both", "source_path": "<workspace-relative path, or omit = whole workspace>" })` — arguments is an OBJECT, never a JSON string
- Gate evidence (tool, runId, score, pass/fail) goes in the completion report; FAIL → fix in the same change or justify (follow-up ticket SA4E-438); never mask/force-pass findings; HIGH/MEDIUM fail the file, LOW = triage only
- Applies to: `dev-agent.md` + `ui-agent.md` (MUST self-check), `qa-agent.md` (Phase 6 verification — reuse the latest runId covering final artifact state per OI-AG2), `sm-agent.md` (Phase 5/6 completion blocker — never writes gate evidence itself)
- Full rule: `instructions/ui-design-gate.md`
