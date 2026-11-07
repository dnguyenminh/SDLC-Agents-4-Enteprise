---
name: context-optimization
description: "Strategic context window management: when to compact, how to compact, model tiering by task complexity, and token estimation from real project experience."
---

# context-optimization

Intelligent context management for multi-agent SDLC pipelines. Prevents context overflow by compacting at logical breakpoints, selecting appropriate models per task, and proactively warning when approaching limits.

## When to Compact

### Pattern: After Planning Phase Completes

Each planning phase (BRD, FSD, TDD) produces a document ingested into KB. Once ingested, the full document text in conversation context is redundant.

**Trigger:** Phase status transitions to `done` AND artifact ingested to KB.

**Action:** Replace full document context with summary:
```
📋 {PHASE} complete → {ARTIFACT} ingested to KB
Key decisions: {3-5 bullet points}
Reference: mem_search("{TICKET} {DOC_TYPE}")
```

### Pattern: Before Large Implementation

Implementation phase consumes the most tokens (80k–150k). Before invoking dev-agent:

1. Compact all prior phase context to summaries
2. Only pass TDD (essential) + specific FSD sections referenced in TDD
3. Let dev-agent use `mem_search` for additional context as needed

### Pattern: Mid-Implementation (Per-File)

For large implementations (>5 files), compact between file groups:
- Complete file group A → summarize changes → proceed to group B
- Don't hold all source code in context simultaneously

### Pattern: After Failed Attempts

If an agent fails and SM retries:
- Drop the full failed output (keep only error summary)
- Reformulate prompt with fresh approach
- Don't accumulate failure context

## How to Compact

### Summarize Decisions, Drop Reasoning

```
❌ Keep: "I analyzed options A, B, C. Option A has these pros...
    Option B has these cons... After weighing... I chose B because..."

✅ Compact to: "Decision: Option B (event-driven). Reason: lower latency."
```

### Keep References, Drop Content

```
❌ Keep: Full 200-line TDD section on API design

✅ Compact to: "API: 5 endpoints (see TDD §3). Key: POST /providers, GET /tools."
    Reference: documents/{TICKET}/TDD.md lines 45-120
```

### Retain Structure, Drop Details

```
❌ Keep: Full STC with 40 test cases

✅ Compact to: "STC: 40 cases across 6 levels. PBT:5, UT:12, IT:8, E2E-API:7, E2E-UI:5, SIT:3"
    File: documents/{TICKET}/STC.md
```

## Model Tiering Table

| Task Category | Complexity | Recommended Tier | Rationale |
|--------------|-----------|-----------------|-----------|
| Read file + return content | Trivial | Tier 3 (lightest) | No reasoning needed |
| Jira transition / status check | Trivial | Tier 3 | API call only |
| DOCX export + Jira attach | Low | Tier 3 | Mechanical steps |
| Run test commands | Low | Tier 3 | Execute + report |
| Diagram XML generation | Medium | Tier 2 | Spatial reasoning |
| Code review (standards) | Medium | Tier 2 | Pattern matching |
| BRD creation | High | Tier 1 (full) | Business analysis |
| FSD specification | High | Tier 1 | Complex reasoning |
| TDD architecture design | High | Tier 1 | System design |
| Code implementation | High | Tier 1 | Full reasoning |
| Security audit | High | Tier 1 | Deep analysis |
| Feedback loop resolution | High | Tier 1 | Cross-doc reasoning |

## Token Estimation — Real Project Experience

Based on actual SA4E pipeline runs:

| Operation | Min Tokens | Typical | Max Tokens | Notes |
|-----------|-----------|---------|-----------|-------|
| BA → BRD (simple CRUD) | 25,000 | 40,000 | 60,000 | Depends on Jira detail |
| BA → BRD (complex feature) | 45,000 | 55,000 | 75,000 | + reference analysis |
| BA → FSD draft | 40,000 | 60,000 | 85,000 | Diagrams add ~15k |
| TA → FSD enrichment | 20,000 | 35,000 | 50,000 | Reads existing FSD |
| SA → TDD | 50,000 | 70,000 | 100,000 | Most variable |
| SA → TDD + diagrams | 65,000 | 85,000 | 120,000 | Diagrams expensive |
| QA → STP/STC | 40,000 | 55,000 | 75,000 | Scales with use cases |
| DEV → Implementation (small) | 50,000 | 80,000 | 100,000 | <5 files |
| DEV → Implementation (large) | 100,000 | 130,000 | 180,000 | >10 files |
| DEV → UG | 25,000 | 35,000 | 50,000 | Relatively stable |
| Security → Review | 15,000 | 25,000 | 40,000 | Depends on code size |
| SM → Verify phase | 8,000 | 15,000 | 25,000 | Read + checklist |
| Jira transition | 2,000 | 4,000 | 8,000 | Simple API calls |
| DOCX export + attach | 3,000 | 5,000 | 10,000 | Mechanical |
| Feedback loop (1 iteration) | 60,000 | 80,000 | 110,000 | BA fix + SA re-review |

### Budget Planning Formula

```
Total pipeline estimate = BRD + FSD + TA + TDD + STP + DEV + UG + Security + Testing
Typical full run ≈ 500,000–700,000 tokens
With retries/feedback ≈ 700,000–1,000,000 tokens
```

## Anti-Patterns

| Anti-Pattern | Impact | Better Approach |
|-------------|--------|-----------------|
| Sending full file when snippet suffices | +5k–50k wasted tokens | Use line ranges or grep first |
| Loading all 40+ tools when only 3 needed | +8k–15k per request | `toggle_tool` to disable unused |
| Keeping full BRD in context during Phase 5 | +10k–30k wasted | KB reference after ingest |
| Retrying same prompt without changes | 2x wasted tokens | Diagnose, change approach |
| Full RUN-LOG in every sub-agent context | +5k–10k per invoke | Only last 5 entries |
| Reading entire TDD for one API endpoint | +15k wasted | Read specific section |
| Passing all steering files to sub-agent | +20k–40k overhead | Only pass relevant steering |
| Not compacting after phase completion | Cumulative bloat | Mandatory post-phase compact |

## MCP Tool Count Management

### Detection

At session start, after `tools/list`:
- Count total tools available
- If >30: log warning, identify unused tool groups
- If >50: actively disable non-essential tools

### Phase-Based Tool Profiles

```
Phase 1-3 (Documentation):
  KEEP: mem_search, mem_ingest, find_tools, jira_*, export_docx, embed_image
  DISABLE: code_search, code_symbols, drawio_* (enable when diagrams needed)

Phase 5 (Implementation):
  KEEP: code_search, code_symbols, code_context, mem_search
  DISABLE: jira_* (except transition), drawio_*, export_docx

Phase 6 (Testing):
  KEEP: code_search, mem_search, test runners
  DISABLE: drawio_*, export_docx, jira_* (except transition)
```

### Savings Estimate

Each disabled tool saves ~200–500 tokens of schema description per request.
Disabling 20 unused tools = ~5,000–10,000 tokens saved per invocation.
