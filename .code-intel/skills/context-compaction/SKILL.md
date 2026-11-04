---
name: context-compaction
description: Context compaction / context-window management rules for long SDLC sessions
---

# Context Compaction & Model Tiering

## Purpose

Manage the context window intelligently instead of static token estimation. SM tracks usage by phase, compacts at sensible breakpoints, and selects the right model for each task.

---

## 1. Context Monitoring Rules

SM MUST track estimated token usage by phase in STATUS.json:

```json
{
  "contextMetrics": {
    "currentSessionTokens": 0,
    "phaseTokensUsed": {},
    "lastCompactionAt": null,
    "warningLevel": "normal"
  }
}
```

### Warning thresholds

| Level | % Context Window | Action |
|-------|-----------------|--------|
| `normal` | 0–60% | Continue normally |
| `warn` | 60–80% | Warn user, suggest compact |
| `critical` | 80–90% | Force compact before continuing |
| `emergency` | 90%+ | Force compact immediately, keep only essential context |

---

## 2. Breakpoints — When to compact

### After each completed phase (MANDATORY)

| Phase just finished | Context to keep | Context to compact (summarize) |
|--------------------|-----------------|--------------------------------|
| BRD done | User story IDs, NFRs | Drop Jira raw, intermediate reasoning |
| FSD done | Use case IDs, BR-IDs, API contracts | Drop BRD full text (already ingested into KB) |
| TDD done | Architecture decisions, API specs | Drop FSD full text (already ingested into KB) |
| STP/STC done | Test case IDs, coverage matrix | Drop TDD full text |
| Code done | Changed file paths, commit hash | Drop full source code context |

### Compact template

After each phase, SM creates a summary block:

```
Phase Summary — {PHASE_NAME}
- Key decisions: {list 3-5 decisions}
- Artifacts: {file list}
- Open issues: {if any}
- Next: {what comes next}
```

Then drop intermediate context (reasoning, drafts, failed attempts).

---

## 3. Model Tiering — Choose model by task complexity

### Classification

| Task Type | Complexity | Model Recommendation | Sub-agent |
|-----------|-----------|---------------------|-----------|
| File reads, lookups, search | Low | Lighter/faster model | `general-task-execution` |
| Status check, Jira transition | Low | Lighter/faster model | `general-task-execution` |
| BRD → FSD reasoning | High | Full reasoning model | `ba-agent` |
| TDD design, architecture | High | Full reasoning model | `sa-agent` |
| Code review (standards) | Medium | Full reasoning model | `dev-agent` |
| Code implementation | High | Full reasoning model | `dev-agent` |
| Security review | High | Full reasoning model | `security-agent` |
| Diagram generation | Medium | Full reasoning model | SA/BA agent |
| DOCX export, attach | Low | Lighter/faster model | `general-task-execution` |
| Test execution (run commands) | Low | Lighter/faster model | `general-task-execution` |

### Sub-agent selection rules

```
IF task only needs:
  - Read file + return content
  - Run simple command
  - Jira transition
  - DOCX export
→ Use general-task-execution (lighter model)

IF task needs:
  - Analysis, complex reasoning
  - Write new document (BRD/FSD/TDD)
  - Code review with judgment
  - Security audit
  - Code implementation
→ Use specialized agent (full model)
```

---

## 4. Budget Advisor — Proactive warnings

### Pre-invoke estimation (updated from real experience)

| Action | Estimated Tokens | Confidence |
|--------|-----------------|-----------|
| BA → BRD | 40,000–60,000 | Medium |
| BA → FSD draft | 50,000–80,000 | Medium |
| TA → FSD enrichment | 30,000–50,000 | Medium |
| SA → TDD | 60,000–90,000 | Low (varies by complexity) |
| QA → STP/STC | 50,000–70,000 | Medium |
| DEV → Implementation | 80,000–150,000 | Low (varies by scope) |
| DEV → UG | 30,000–50,000 | High |
| Security review | 20,000–40,000 | High |
| SM → Verify | 10,000–20,000 | High |
| Simple lookup/transition | 3,000–8,000 | High |

### Advisor messages

```
Context Advisor:
- Estimated next action: ~{N}k tokens
- Current usage: {used}/{cap} ({percent}%)
- Recommendation: {proceed / compact first / switch to lighter model}
```

---

## 5. Tool Count Awareness

Tools are available directly in the session in OpenCode; note that every loaded tool's description consumes prompt context.

### Rules when tool count is high

| Condition | Action |
|-----------|--------|
| >30 tools loaded | Suggest disabling unused tools to free context |
| >50 tools loaded | WARN: tool descriptions consume significant context |
| Session only needs subset | List needed tools, disable the rest |

### Tool groups by phase

| Phase | Needed tools | May disable |
|-------|--------------|-------------|
| Requirements | jira_*, mem_*, find_tools | drawio_*, code_* |
| Design | mem_*, code_*, find_tools | jira_* (except transitions) |
| Implementation | code_*, mem_*, git | drawio_*, jira_* |
| Testing | code_*, test runners | drawio_*, jira_* |
| Deployment | jira_*, mem_*, git | code_search |

---

## 6. Anti-patterns — Avoid wasting context

| Anti-pattern | Correct way |
|--------------|-------------|
| Send full file when only snippet needed | Use line range or grep first |
| Load all tools when only 3 needed | Toggle off unused tools |
| Keep full BRD in context while coding | Compact after phase, reference KB |
| Retry same prompt 3 times unchanged | Diagnose root cause, change approach |
| Include full RUN-LOG in every invoke | Only include latest 5 entries |
| Read entire TDD when only 1 section needed | Read specific section by line range |