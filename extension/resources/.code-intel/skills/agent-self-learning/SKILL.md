---
name: agent-self-learning
description: Agent self-learning rules — KB search before tasks, ingest experience after completion
---

## Rule 1: Search Existing Solutions BEFORE Acting

Before solving any problem, MUST perform 3 steps:

1. **Search Memory** — `mem_search("<problem description>")` — if proven pattern found, use immediately
2. **Search Documents** — `grep_search("<keyword>", includePattern="documents/**/*.md")` — if design exists, follow it
3. **Search Code** — `code_search("<class/pattern>")` — if implementation exists, reuse

**ONLY when all 3 steps find nothing**, propose a new solution.

## Rule 2: Tool Discovery — NO hardcoding

When needing to call an external tool:
1. Use `find_tools(query="<function description>")` to discover
2. Read `input_schema` from results
3. Call `execute_dynamic_tool(tool_name, arguments)` per schema
4. If not found → report user, suggest alternative

**NEVER** hardcode tool names, CLI commands, or assume tool existence.

### 2.1: MUST Search Thoroughly — DO NOT report "no tool"

**CRITICAL RULE:** Before concluding "no tool to do X", agent MUST:
1. Try **at least 3 different queries** with `find_tools`:
   - Action-describing query: `find_tools("search jira issues")`
   - Predicted tool name: `find_tools("jira")`
   - Domain keyword: `find_tools("JQL query filter")`
2. If `find_tools` returns a tool but `execute_dynamic_tool` says "not found" → retry with **exact tool name** from `find_tools` result
3. If server status = CONNECTED but tool not found → tool may be on **nested orchestrator** — call `find_tools` with different query to trigger lazy discovery

**STRICTLY FORBIDDEN** to report "no tool" after only 1 failed search. Minimum 3 attempts with query variations.

### 2.2: MCP Tools First — NO custom scripts when MCP already has it

When task requires external service interaction (web browsing, screenshot, Jira, database...):
1. **ALWAYS `find_tools("<action description>")` first** — check if MCP servers already have suitable tools
2. **If MCP has tool** → use `execute_dynamic_tool` — NO custom scripts (Playwright, curl, requests, pandoc...)
3. **ONLY use external script/CLI** when `find_tools` truly returns no suitable tool

**Reason:** MCP tools are tested, have error handling, are integrated into orchestration, and results are auto-logged to KB.

## Rule 3: Ingest New Experience

After completing a task using a new method, MUST ingest:
```
mem_ingest(content="<steps, tools, gotchas>", type="LESSON_LEARNED", source="<ticket>", tags="<agent>,<category>,proven-pattern")
```

Ingest when: new tool combination found, error fixed, existing solution discovered that was previously unknown.
DO NOT ingest: obvious tasks, already in memory, or failed tasks.

## Rule 4: Ingest Document After Creation (ZERO-CONTEXT)

After creating a document (BRD, FSD, TDD, STP, STC, UG, DPG, RLN), MUST ingest into memory:
```
mem_ingest_file(file_path="documents/{TICKET}/{DOC}.md", type="REQUIREMENT|ARCHITECTURE|PROCEDURE")
```

**NEVER** use the old pattern: readFile(skipPruning=true) → kb_ingest(content=FULL_TEXT).
Tool `mem_ingest_file` only costs ~80 tokens (server reads file from disk).

## Rule 5: Read Context via Memory (Token Efficient)

When needing to read another ticket's document (BRD, FSD, TDD...):
```
mem_search("<content to find>", detail=true)   → ~1,500 tokens (relevant chunks)
mem_get(id=<entry_id>)                           → Full content of 1 entry
```

**DO NOT** use `readFile(documents/{TICKET}/BRD.md, skipPruning=true)` = ~6,000 tokens.
**ONLY** use readFile when mem_search returns empty (document not yet ingested).

## Rule 6: Distinguish Tools by Prefix

| Prefix | Server | When to Use |
|--------|--------|-------------|
| `kb_*` | Orchestrator (remote) | Jira ticket data, cross-project team KB |
| `mem_*` | Code-Intelligence (local) | Local documents, decisions, error patterns |
| `code_*` | Code-Intelligence (local) | AST parsing, symbol search, code analysis |

- Jira ticket info → `kb_ingest`, `kb_search` (via orchestrator)
- Local documents (BRD/FSD/TDD...) → `mem_ingest_file`, `mem_search`
- Code patterns → `code_search`, `code_symbols`

## Rule 7: Load Personalized Rules from KB at Session Start

On the first turn of each chat session, MUST search KB for user's personalized rules:
```
mem_search("personalized rules preferences conventions", type="PROCEDURE", detail=true)
```

- If entries found → follow as steering rules throughout session
- KB rules have lower priority than steering files (if conflict → steering wins)
- Personalized rules include: coding preferences, personal naming conventions, workflow habits, tool preferences

**When to ingest new personalized rule:**
- User says "remember that...", "always...", "never...", "I prefer..."
- Ingest with: `mem_ingest(content="<rule>", type="PROCEDURE", source="user-preference", tags="personalized,rule,preference")`

## Rule 8: Prevent Fragmented Solutions

1. **NO new wrapper/helper** if system already has a mechanism (even if broken → fix root cause)
2. **NO bypassing** with workarounds when root cause can be fixed
3. **Every new solution MUST be compatible** with existing architecture (read TDD/FSD first if unsure)
4. **Memory offline ≠ skip research** — MUST still search documents and code