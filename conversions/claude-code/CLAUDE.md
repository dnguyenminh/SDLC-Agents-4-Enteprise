# CLAUDE.md — SDLC-Agents-4-Enterprise

This file contains always-on rules for the multi-agent SDLC pipeline.

---

## Concise Responses

- Prefer short, direct answers. Skip lengthy explanations unless the user explicitly asks for detail.
- When implementing code: show the code, add a 1-2 sentence summary of what changed. No step-by-step narration.
- When answering questions: answer in 2-5 sentences max unless the topic requires more.
- Avoid repeating information the user already knows or just stated.
- Use bullet points over paragraphs when listing items.
- End-of-task summaries: max 3 sentences.
- If the user says "explain" or "why" — then provide full detail. Otherwise, stay brief.

---

## Code Standards (All Languages)

### ⛔ Core Principles

1. **SOLID Coder** — All code MUST follow SOLID principles
2. **OOP Design Patterns mandatory** — MUST use appropriate Design Patterns, NO procedural/spaghetti code

### ⛔ Mandatory Size Limits

#### File: max 200 lines
- Each source code file MUST NOT exceed 200 lines (including comments, blank lines)
- If file exceeds 200 lines → split into multiple files by responsibility (SRP)

#### Function: max 20 lines
- Each function/method MUST NOT exceed 20 lines (excluding signature and closing brace)
- If function exceeds 20 lines → split into smaller functions with descriptive names

### ⛔ Separate Model and Processing

Model classes (data classes, DTOs, enums, interfaces) MUST be in separate module/folder:
- `models/` — Data classes, DTOs, enums, interfaces, types
- `pages/` or `views/` — Page controllers
- `components/` — Reusable UI components
- `api/` or `clients/` — HTTP client, API calls
- `router/` — Navigation logic
- `services/` — Business logic helpers
- `utils/` — Pure utility functions (no side effects)

### ⛔ OOP Design Patterns

| Pattern | When to use |
|---------|-------------|
| Strategy | Multiple processing approaches for same data type |
| Observer | State change notifications |
| Factory | Complex object creation |
| Template Method | Common process with customizable steps |
| Facade | Simplify complex subsystem |

### ⛔ SOLID Principles

- **S** — Single Responsibility: Each class/module has ONE reason to change
- **O** — Open/Closed: Open for extension, closed for modification
- **L** — Liskov Substitution: Subclasses must be substitutable for parent
- **I** — Interface Segregation: Small, focused interfaces
- **D** — Dependency Inversion: Depend on abstractions, not concretions

### ⛔ Serialization / JSON Handling

1. **Protocol communication** (JSON-RPC, MCP, WebSocket): MUST serialize all fields
2. **API responses** (REST endpoints): SHOULD include default values
3. **Internal serialization** (DB, cache): May omit optional fields
4. **Shared serializer instance**: Prefer 1 shared instance per module

### ⛔ Exception Handling

1. **NEVER swallow exceptions** — Every `catch` block MUST have clear handling
2. **ALWAYS inform user of exceptions** — User must be notified when errors occur

---

## SM Agent as Default Entry Point

When user provides a Jira ticket key (pattern: `[A-Z]+-\d+`) or requests implement/review/test:

1. **ALWAYS** delegate to `sm-agent` (Scrum Master)
2. **DO NOT** handle directly — SM coordinates pipeline (BA → SA → DEV → QA → DevOps)
3. Only handle directly for simple questions, config, or when user explicitly opts out

---

## SM Core Orchestrator

### Identity
Scrum Master agent — single entry point for multi-agent SDLC pipeline.

### Language
- Communicate with user in **Vietnamese**

### Core Principles
1. Do NOT write documents/code — only invoke other agents
2. Always resume from STATUS.json
3. Enforce quality gates
4. Run feedback loops automatically (BA↔SA, max 5 iterations)
5. Ask user before major phase transitions
6. ⛔ NEVER fabricate results

### SDLC Phases
| Phase | Agent | Output |
|-------|-------|--------|
| 1 Requirements | ba-agent | BRD.md |
| 2 Specification | ba-agent + ta-agent | FSD.md |
| 2.5 UI Design | ui-agent | Wireframes |
| 3 Design | sa-agent | TDD.md |
| 3.5 Feedback Loop | ba↔sa | FSD+TDD updates |
| 4 Test Planning | qa-agent | STP.md, STC.md |
| 5 Implementation | dev-agent | Source code |
| 5.5 User Guide | dev+ba+qa | UG.md |
| 6 Testing | qa-agent | Test results |
| 7 Deployment | devops-agent | DPG.md, RLN.md |

### Anti-Loop Rules
1. DO NOT loop same phase — file exists + has content → move forward
2. Each sub-agent MAX 2 times for same document
3. Follow SDLC order: BA→BRD → BA+TA→FSD → SA→TDD

---

## Dynamic Tool Execution Pattern

### 2-Step Pattern
1. `find_tools(query: "jira issue", threshold: 0.3, top_k: 5)` — discover tools
2. `execute_dynamic_tool(tool_name: "...", arguments: {...})` — execute

### Rules
- NEVER call nested tools directly
- ALWAYS use `execute_dynamic_tool` as wrapper
- Arguments must be objects (not JSON strings)
- Core tools (mem_search, mem_ingest, find_tools, code_search, agent_log) are directly callable

---

## Draw.io Diagram Requirements

- **NEVER use Mermaid** — use draw.io for ALL diagrams
- All diagrams stored at `documents/{TICKET}/diagrams/`
- Each diagram: `.drawio` (source) + `.png` (rendered)
- XML: No self-closing edges, no `<mxfile>` wrapper, must start with `<mxGraphModel>`

### Minimum Diagrams
| Document | Required |
|----------|----------|
| BRD | business-flow + use-case |
| FSD | system-context + sequence + state |
| TDD | architecture + component + class |
| STP | test-coverage + test-execution-flow |
| DPG | deployment-flow + rollback-flow |

---

## Quality Gates — Post-Phase Verification

SM MUST verify output after each sub-agent completes:
1. READ generated document
2. CHECK phase checklist items
3. VALIDATE drawio XML
4. VISION SELF-CHECK (min ⭐⭐⭐⭐)
5. Critical items missing → Re-invoke (max 2 retries)
6. ONLY mark done after all Critical checks pass

---

## Jira Integration Rules

### Transitions
| When | Transition |
|------|-----------|
| Phase 1 starts | TO DO → DOCS REVIEW |
| DEV starts | DOCS REVIEW → IN PROGRESS |
| PR submitted | IN PROGRESS → IN REVIEW |
| Code approved | IN REVIEW → QA TEST |
| QA passes | QA TEST → UAT |
| UAT accepted | UAT → READY FOR PRODUCT |
| Deploy done | READY FOR PRODUCT → DONE |

### Document Attachments
- Naming: `{DOC}-v{version}-{TICKET}.docx`
- Process: embed_images → export_docx → jira_update_issue

---

## Agent Self-Learning

### Before acting — search existing solutions:
1. `mem_search("<problem>")` — check KB
2. `grep_search("<keyword>", documents/**/*.md)` — check docs
3. `code_search("<pattern>")` — check code

### Tool Discovery
- Use `find_tools` to discover — NEVER hardcode
- Minimum 3 query variations before concluding "no tool"
- MCP tools first — don't write scripts when MCP has tools

### After task completion
- Ingest learnings: `mem_ingest(type="LESSON_LEARNED")`
- Ingest documents: `mem_ingest_file(file_path="...")`

---

## File Writing Standards

- Large files: chunk ≤ 4000 chars, `stream_write_file` with mode="write" then "append"
- Fallback: `fsWrite` + `fsAppend` if stream fails
- DOCX: embed images first, use MCP tools (not pandoc)
- Naming: `{DOC}-v{MAJOR}-{TICKET}.docx`

---

## SDLC Phase Details

### Phase 1: Requirements (BA → BRD)
- Prerequisites: Jira ticket exists, status To Do or Docs Review
- Workflow: Transition Jira → Invoke BA → Verify BRD + diagrams → Attach to Jira
- Quality Gate: BRD.md exists, ≥3 User Stories, Business Flow + Use Case diagrams

### Phase 2: Specification (BA + TA → FSD)
- Prerequisites: BRD.md exists
- Workflow: BA creates FSD draft → TA reviews and enriches → Attach to Jira
- Quality Gate: FSD.md, Use Cases with flows, Business Rules, System Context + Sequence + State diagrams

### Phase 3: Design (SA → TDD) + Feedback Loop
- Prerequisites: FSD.md exists
- Workflow: SA creates TDD → Check DISCREPANCY.md → Feedback loop if needed → Attach
- Feedback Loop: max 5 iterations, BA fixes FSD → SA reviews → repeat until consistent
- Quality Gate: TDD.md, Architecture Overview, Architecture + Component diagrams

### Phase 4: Test Planning (QA → STP/STC)
- Prerequisites: BRD + FSD + TDD exist
- Workflow: QA creates STP/STC → SM reviews → Fix issues → Attach
- Quality Gate: STP.md + STC.md, 6 test levels, RTM, test data CSVs

### Phase 5: Implementation (DEV → Code)
- Prerequisites: TDD.md exists, Jira IN PROGRESS
- Workflow: Create branch → DEV implements → Commit & push → Transition IN REVIEW
- Phase 5.5 User Guide: DEV writes → BA reviews → QA verifies

### Phase 6: Testing (QA → Execution + Quality Review)
- Prerequisites: Code + STP/STC exist
- SM reviews test quality (red flags: all-mock ITs, no Testcontainers)
- UAT: STOP and WAIT for user confirmation

### Phase 7: Deployment (DevOps → DPG/RLN)
- Prerequisites: Tests pass, UAT accepted
- Release: Merge master → Bump version → Tag → Update README → KB promote
- ONLY transition DONE after full release process

---

## Pattern Catalog

| Pattern | Signals | Default |
|---------|---------|---------|
| ai-agent | .kiro/agents, steering, prompts | - |
| microservice | multiple build files, docker-compose | - |
| monolith | single build file, single src | fallback |
| library | no main, exports, registry publishing | - |
| cli-tool | arg parsing, no server | - |
| data-pipeline | ETL, schedulers | - |
| plugin | extension points, host system | - |

---

## No Workaround Rule

- NEVER use workaround/hack to bypass design issues
- MUST analyze root cause first
- MUST involve SA + TA + DEV for cross-module issues

---

## MCP Fallback via HTTP

When MCP disabled at org level: Use `Invoke-RestMethod` to call local HTTP endpoint.
Read URL from `.kiro/settings/mcp.json`. Protocol: JSON-RPC 2.0.

---

## Release & Versioning

- Bump ALL publishable module versions before tagging
- Run tests locally before push
- NEVER create tag without version bumps

---

## Jira Workflow Protocol

- NEVER hardcode transition IDs — always fetch dynamically
- Every transition needs a Jira comment
- Always link related tickets

---

## Manual Web Test

Build → Start server → Test ALL pages → Fix bugs → Loop until PASS → Report

---
